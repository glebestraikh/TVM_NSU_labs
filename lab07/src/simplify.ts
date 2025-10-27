import { Expr } from "../../lab04";
import { cost } from "./cost";

type OpType = '+' | '-' | '*' | '/';

// Вспомогательные функции для создания узлов
const makeBinOp = (op: OpType, l: Expr, r: Expr): Expr =>
    ({ type: 'binop', op, left: l, right: r });

const makeUnary = (arg: Expr): Expr =>
    ({ type: 'unary', op: '-', argument: arg });

// Проверка эквивалентности двух выражений
function areEquivalent(x: Expr, y: Expr): boolean {
    if (x.type !== y.type) return false;

    if (x.type === "const" && y.type === "const")
        return x.value === y.value;

    if (x.type === "var" && y.type === "var")
        return x.name === y.name;

    if (x.type === "unary" && y.type === "unary")
        return areEquivalent(x.argument, y.argument);

    if (x.type === "binop" && y.type === "binop")
        return x.op === y.op &&
            areEquivalent(x.left, y.left) &&
            areEquivalent(x.right, y.right);

    return false;
}

// Генерация уникального ключа для выражения
function generateKey(expr: Expr): string {
    if (expr.type === "const") return `${expr.value}`;
    if (expr.type === "var") return `@${expr.name}`;
    if (expr.type === "unary") return `NEG[${generateKey(expr.argument)}]`;
    return `(${generateKey(expr.left)}${expr.op}${generateKey(expr.right)})`;
}

type VarMap = { [key: string]: Expr };

// Попытка сопоставить шаблон с выражением
function tryMatch(template: Expr, target: Expr, vars: VarMap = {}): VarMap | null {
    if (template.type === "const") {
        return target.type === "const" && target.value === template.value ? vars : null;
    }

    if (template.type === "var") {
        const varName = template.name;
        if (vars[varName]) {
            return areEquivalent(vars[varName], target) ? vars : null;
        }
        return { ...vars, [varName]: target };
    }

    if (template.type === "unary") {
        return target.type === "unary"
            ? tryMatch(template.argument, target.argument, vars)
            : null;
    }

    if (template.type === "binop") {
        if (target.type !== "binop" || target.op !== template.op) return null;
        const leftVars = tryMatch(template.left, target.left, vars);
        return leftVars ? tryMatch(template.right, target.right, leftVars) : null;
    }

    return null;
}

// Применение подстановки переменных
function substitute(template: Expr, vars: VarMap): Expr {
    if (template.type === "const") return template;
    if (template.type === "var") return vars[template.name] || template;
    if (template.type === "unary") return makeUnary(substitute(template.argument, vars));

    return makeBinOp(
        template.op as OpType,
        substitute(template.left, vars),
        substitute(template.right, vars)
    );
}

type ReconstructFn = (updated: Expr) => Expr;

// Генератор всех подвыражений с функциями восстановления
function* walkTree(node: Expr): Generator<[Expr, ReconstructFn]> {
    yield [node, (x: Expr) => x];

    if (node.type === "const" || node.type === "var") return;

    if (node.type === "unary") {
        for (const [sub, rebuild] of walkTree(node.argument)) {
            yield [sub, (x: Expr) => rebuild(makeUnary(x))];
        }
        return;
    }

    // binop
    for (const [lSub, lRebuild] of walkTree(node.left)) {
        yield [lSub, (x: Expr) => lRebuild(makeBinOp(node.op as OpType, x, node.right))];
    }

    for (const [rSub, rRebuild] of walkTree(node.right)) {
        yield [rSub, (x: Expr) => rRebuild(makeBinOp(node.op as OpType, node.left, x))];
    }
}

// Подсчет размера дерева
function treeSize(expr: Expr): number {
    if (expr.type === "const" || expr.type === "var") return 1;
    if (expr.type === "unary") return 1 + treeSize(expr.argument);
    return 1 + treeSize(expr.left) + treeSize(expr.right);
}

// Сортировка правил по сложности
function sortRules(rules: [Expr, Expr][]): [Expr, Expr][] {
    return [...rules].sort((a, b) => treeSize(a[0]) - treeSize(b[0]));
}

export function simplify(expression: Expr, rules: [Expr, Expr][]): Expr {
    const seen = new Map<string, Expr>();
    const agenda: Expr[] = [expression];

    let optimal = expression;
    let optimalScore = cost(expression);

    const sortedRules = sortRules(rules);
    let steps = 0;
    const stepLimit = 10000;

    while (agenda.length > 0 && steps < stepLimit) {
        steps++;
        const current = agenda.shift()!;
        const key = generateKey(current);

        if (seen.has(key)) continue;
        seen.set(key, current);

        const currentScore = cost(current);
        if (currentScore < optimalScore) {
            optimal = current;
            optimalScore = currentScore;
        }

        // Применяем каждое правило к каждому подвыражению
        for (const [pattern, replacement] of sortedRules) {
            for (const [subExpr, reconstruct] of walkTree(current)) {
                const match = tryMatch(pattern, subExpr);
                if (match) {
                    const transformed = substitute(replacement, match);
                    const result = reconstruct(transformed);
                    const resultKey = generateKey(result);

                    if (!seen.has(resultKey)) {
                        const resultScore = cost(result);
                        // Эвристика: не добавляем слишком дорогие варианты
                        if (resultScore <= currentScore + 3) {
                            agenda.push(result);
                        }
                    }
                }
            }
        }
    }

    return optimal;
}