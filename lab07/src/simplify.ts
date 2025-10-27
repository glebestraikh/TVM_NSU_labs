import { Expr } from "../../lab04";
import { cost } from "./cost";

type BinaryOperator = '+' | '-' | '*' | '/';

function createBinaryOp(op: BinaryOperator, left: Expr, right: Expr): Expr {
    return { type: 'binop', op, left, right };
}

function createUnaryOp(arg: Expr): Expr {
    return { type: 'unary', op: '-', argument: arg };
}

function expressionsEqual(a: Expr, b: Expr): boolean {
    if (a.type !== b.type) return false;
    switch (a.type) {
        case "const": return b.type === "const" && a.value === b.value;
        case "var": return b.type === "var" && a.name === b.name;
        case "unary": return b.type === "unary" && expressionsEqual(a.argument, b.argument);
        case "binop":
            return b.type === "binop" &&
                a.op === b.op &&
                expressionsEqual(a.left, b.left) &&
                expressionsEqual(a.right, b.right);
    }
}

function serializeExpr(e: Expr): string {
    switch (e.type) {
        case "const": return `C${e.value}`;
        case "var": return `V${e.name}`;
        case "unary": return `U${serializeExpr(e.argument)}`;
        case "binop": return `B${e.op}${serializeExpr(e.left)}${serializeExpr(e.right)}`;
    }
}

type Bindings = Record<string, Expr>;

function matchPattern(pattern: Expr, expr: Expr, bindings: Bindings = {}): Bindings | null {
    switch (pattern.type) {
        case "const":
            return (expr.type === "const" && expr.value === pattern.value) ? bindings : null;

        case "var": {
            const name = pattern.name;
            const existing = bindings[name];
            if (!existing) {
                return { ...bindings, [name]: expr };
            }
            return expressionsEqual(existing, expr) ? bindings : null;
        }

        case "unary":
            if (expr.type !== "unary") return null;
            return matchPattern(pattern.argument, expr.argument, bindings);

        case "binop":
            if (expr.type !== "binop" || expr.op !== pattern.op) return null;
            const leftMatch = matchPattern(pattern.left, expr.left, bindings);
            return leftMatch ? matchPattern(pattern.right, expr.right, leftMatch) : null;
    }
}

function applySubstitution(template: Expr, bindings: Bindings): Expr {
    switch (template.type) {
        case "const": return template;
        case "var": return bindings[template.name] ?? template;
        case "unary": return createUnaryOp(applySubstitution(template.argument, bindings));
        case "binop":
            return createBinaryOp(
                template.op as BinaryOperator,
                applySubstitution(template.left, bindings),
                applySubstitution(template.right, bindings)
            );
    }
}

type Rebuilder = (replacement: Expr) => Expr;

function* enumerateContexts(expr: Expr): Generator<[Expr, Rebuilder]> {
    yield [expr, (r: Expr) => r];

    switch (expr.type) {
        case "const":
        case "var":
            return;

        case "unary":
            for (const [subExpr, rebuild] of enumerateContexts(expr.argument)) {
                yield [subExpr, (r: Expr) => rebuild(createUnaryOp(r))];
            }
            return;

        case "binop":
            for (const [leftSub, rebuildLeft] of enumerateContexts(expr.left)) {
                yield [leftSub, (r: Expr) => rebuildLeft(createBinaryOp(expr.op as BinaryOperator, r, expr.right))];
            }
            for (const [rightSub, rebuildRight] of enumerateContexts(expr.right)) {
                yield [rightSub, (r: Expr) => rebuildRight(createBinaryOp(expr.op as BinaryOperator, expr.left, r))];
            }
            return;
    }
}

function preprocessIdentities(identities: [Expr, Expr][]): [Expr, Expr][] {
    return identities.slice().sort((a, b) => {
        const countNodes = (e: Expr): number => {
            switch (e.type) {
                case "const":
                case "var":
                    return 1;
                case "unary":
                    return 1 + countNodes(e.argument);
                case "binop":
                    return 1 + countNodes(e.left) + countNodes(e.right);
            }
        };
        return countNodes(a[0]) - countNodes(b[0]);
    });
}

export function simplify(e: Expr, identities: [Expr, Expr][]): Expr {
    const visited = new Set<string>();
    const queue: Expr[] = [e];
    let bestExpr: Expr = e;
    let bestExprCost = cost(e);

    // предобрабатываем идентичности
    const processedIdentities = preprocessIdentities(identities);

    // Ограничение на количество итераций для предотвращения зависания
    const maxIterations = 10000;
    let iterations = 0;

    while (queue.length && iterations < maxIterations) {
        iterations++;
        const currentExpr = queue.shift()!;
        const encodedExpr = serializeExpr(currentExpr);

        if (visited.has(encodedExpr)) continue;
        visited.add(encodedExpr);

        const currentCost = cost(currentExpr);

        // Обновляем лучшее решение
        if (currentCost < bestExprCost) {
            bestExpr = currentExpr;
            bestExprCost = currentCost;
        }

        // Применяем идентичности
        for (const [pattern, replacement] of processedIdentities) {
            for (const [subExpr, rebuild] of enumerateContexts(currentExpr)) {
                const bindings = matchPattern(pattern, subExpr);
                if (bindings) {
                    const substituted = applySubstitution(replacement, bindings);
                    const nextExpr = rebuild(substituted);
                    const nextEncoded = serializeExpr(nextExpr);

                    if (!visited.has(nextEncoded)) {
                        const nextCost = cost(nextExpr);
                        if (nextCost <= currentCost + 2) {
                            queue.push(nextExpr);
                        }
                    }
                }
            }
        }
    }

    return bestExpr;
}