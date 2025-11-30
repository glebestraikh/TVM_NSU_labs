import { getExprAst } from '../../lab04';
import * as ast from './funny';
import { FunnyError } from './index';
import grammar, { FunnyActionDict } from './funny.ohm-bundle';
import { MatchResult, Semantics } from 'ohm-js';

// Helper: Получить информацию о позиции в файле
function getSourceLocation(node?: any) {
    // если нет информации о позиции, вернуть undefined
    if (!node?.source) return { startLine: undefined, startCol: undefined, endCol: undefined, endLine: undefined };
    const lineInfo = node.source.getLineAndColumn();
    return {
        startLine: lineInfo.lineNum,
        startCol: lineInfo.colNum,
        endLine: lineInfo.lineNum,
        endCol: lineInfo.colNum + (node.sourceString?.length || 0)
    };
}

// Helper: Проверить уникальность элементов в списке
function checkUniqueNames(items: ast.ParameterDef[], kind: string, node?: any) {
    const seen = new Set<string>(); // множество для отслеживания увиденных имен
    for (const item of items) {
        if (seen.has(item.name)) {
            const { startLine, startCol, endCol, endLine } = getSourceLocation(node);
            throw new FunnyError( // выбрасываем ошибку при повторном объявлении
                `Redeclaration of ${kind} '${item.name}'`,
                'REDECLARATION',
                startLine,
                startCol,
                endCol,
                endLine
            );
        }
        seen.add(item.name);
    }
}

// Helper: Парсить итерацию
function parseIteration(node: any): any[] {
    return node.asIteration().children.map((c: any) => c.parse());
}

// Helper:Сбор всех использованных имен в узле (для проверки объявления)
function collectUsedNames(node: any, names: Set<string>) {
    if (!node) return;
    if (Array.isArray(node)) {
        node.forEach(n => collectUsedNames(n, names));
        return;
    }

    // Типы узлов, которые используют переменные
    // словарь, где каждому типу узла сопоставлена функция, которая обрабатывает имя переменной в этом узле
    const nameUsers: Record<string, (n: any) => void> = {
        // x = 
        lvar: n => names.add(n.name),
        // arr[i + j] =
        larr: n => { names.add(n.name); collectUsedNames(n.index, names); }, // для массивов собираем имя массива и имена внутри индекса
        // x = arr[i + j];
        arraccess: n => { names.add(n.name); collectUsedNames(n.index, names); }, // также имена внутри индекса
        // y = x + 1 (тут для x)
        var: n => names.add(n.name),
    };

    if (node.type && nameUsers[node.type]) {
        nameUsers[node.type](node);
    }

    // Контейнеры, которые содержат другие узлы
    if (node.type === 'assign') {
        node.targets.forEach((t: any) => collectUsedNames(t, names));
        node.exprs.forEach((e: any) => collectUsedNames(e, names));
    } else if (node.type === 'block') {
        node.stmts.forEach((s: any) => collectUsedNames(s, names));
    } else if (node.type === 'if') {
        collectUsedNames(node.condition, names);
        collectUsedNames(node.then, names);
        collectUsedNames(node.else, names);
    } else if (node.type === 'while') {
        collectUsedNames(node.condition, names);
        collectUsedNames(node.body, names);
    } else if (node.type === 'funccall') {
        node.args.forEach((a: any) => collectUsedNames(a, names));
    } else if (node.type === 'binop') {
        collectUsedNames(node.left, names);
        collectUsedNames(node.right, names);
    } else if (node.type === 'unary') {
        collectUsedNames(node.argument, names);
    }

    // Условия (predicates)
    if (node.kind === 'comparison') {
        collectUsedNames(node.left, names);
        collectUsedNames(node.right, names);
    } else if (node.kind === 'not') {
        collectUsedNames(node.condition, names);
    } else if (['and', 'or', 'implies'].includes(node.kind)) {
        collectUsedNames(node.left, names);
        collectUsedNames(node.right, names);
    } else if (node.kind === 'paren') {
        collectUsedNames(node.inner, names);
    }
}

export const getFunnyAst = {
    ...getExprAst, // функции из 4 лабораторной будут частью getFunnyAst

    Module(funcs) {
        return { type: 'module', functions: funcs.children.map((f: any) => f.parse()) } as ast.Module;
    },

    Function(name, lp, params, rp, ret, rets, uses, stmt) {
        const funcName = name.sourceString;
        const parameters = params.parse();
        const returns = rets.parse();
        const locals = uses.numChildren > 0 ? uses.children[0].parse() : [];
        const body = stmt.parse();

        // Проверяем уникальность имен
        // check Повторное определение переменной
        checkUniqueNames(parameters, 'parameter');
        checkUniqueNames(returns, 'return value');
        checkUniqueNames(locals, 'local variable');
        const all = [...parameters, ...returns, ...locals]; // все объявленные переменные функции
        checkUniqueNames(all, 'variable');

        // Проверяем что все используемые переменные объявлены
        const declared = new Set(all.map(p => p.name));
        const used = new Set<string>();
        collectUsedNames(body, used);

        // Использование незадекларированного идентификатора
        for (const name of used) {
            if (!declared.has(name)) {
                const { startLine, startCol } = getSourceLocation(stmt);
                throw new FunnyError(
                    `Use of undeclared identifier '${name}'`,
                    'UNDECLARED',
                    startLine,
                    startCol
                );
            }
        }

        // Предупреждения об неиспользованных переменных (на будущее развитие, тесты и так проходят)
        for (const param of parameters) {
            if (!used.has(param.name)) {
                console.warn(`Warning: Parameter '${param.name}' in function '${funcName}' is never used`);
            }
        }
        for (const local of locals) {
            if (!used.has(local.name)) {
                console.warn(`Warning: Local variable '${local.name}' in function '${funcName}' is never used`);
            }
        }

        return { type: 'fun', name: funcName, parameters, returns, locals, body } as ast.FunctionDef;
    },

    ParamList: parseIteration,
    ParamListNonEmpty: parseIteration,
    LValueList: parseIteration,
    ExprList: parseIteration,
    ArgList: parseIteration,

    // x: int
    // y: int[]
    Param(name, colon, type) {
        return { type: 'param', name: name.sourceString, varType: type.parse() } as ast.ParameterDef;
    },

    // uses z: int, w: int
    UsesOpt(uses, params) {
        return params.parse();
    },

    // x → 'int' x: int
    // y → 'int[]' y: int[]
    Type_int(int) { return 'int' as const; },
    Type_array(int, lb, rb) { return 'int[]' as const; },

    Assignment_tuple(targets, eq, exprs, semi) {
        return { type: 'assign', targets: targets.parse(), exprs: exprs.parse() } as ast.AssignStmt;
    },

    Assignment_simple(target, eq, expr, semi) {
        return { type: 'assign', targets: [target.parse()], exprs: [expr.parse()] } as ast.AssignStmt;
    },

    LValue_array(name, lb, expr, rb) {
        return { type: 'larr', name: name.sourceString, index: expr.parse() } as ast.ArrLValue;
    },

    LValue_variable(name) {
        return { type: 'lvar', name: name.sourceString } as ast.VarLValue;
    },

    Block(lb, stmts, rb) {
        return { type: 'block', stmts: stmts.children.map((s: any) => s.parse()) } as ast.BlockStmt;
    },

    Conditional(ifKw, lp, cond, rp, then, elseKw, elseStmt) {
        return {
            type: 'if',
            condition: cond.parse(),
            then: then.parse(),
            else: elseStmt.numChildren > 0 ? elseStmt.children[0].parse() : null // правоасоссиативный else из задания
        } as ast.ConditionalStmt;
    },

    While(whileKw, lp, cond, rp, stmt) {
        return { type: 'while', condition: cond.parse(), body: stmt.parse() } as ast.WhileStmt;
    },

    FunctionCall(name, lp, args, rp) {
        return { type: 'funccall', name: name.sourceString, args: args.parse() } as ast.FuncCallExpr;
    },

    ArrayAccess(name, lb, expr, rb) {
        return { type: 'arraccess', name: name.sourceString, index: expr.parse() } as ast.ArrAccessExpr;
    },

    // Условия
    ImplyCond(left, arrow, right) {
        if (right.numChildren === 0) return left.parse();
        return { kind: 'implies', left: left.parse(), right: right.children[0].children[1].parse() } as ast.ImpliesCond;
    },

    OrCond(first, ors, rest) {
        let result = first.parse();
        for (const item of rest.children) {
            result = { kind: 'or', left: result, right: item.children[1].parse() } as ast.OrCond;
        }
        return result;
    },

    AndCond(first, ands, rest) {
        let result = first.parse();
        for (const item of rest.children) {
            result = { kind: 'and', left: result, right: item.children[1].parse() } as ast.AndCond;
        }
        return result;
    },

    NotCond(nots, atom) {
        let result = atom.parse();
        for (let i = 0; i < nots.numChildren; i++) {
            result = { kind: 'not', condition: result } as ast.NotCond;
        }
        return result;
    },

    AtomCond_true(t) { return { kind: 'true' } as ast.TrueCond; },
    AtomCond_false(f) { return { kind: 'false' } as ast.FalseCond; },
    AtomCond_comparison(cmp) { return cmp.parse(); },
    AtomCond_paren(lp, cond, rp) { return { kind: 'paren', inner: cond.parse() } as ast.ParenCond; },

    // Сравнения
    Comparison_eq(left, op, right) {
        return { kind: 'comparison', left: left.parse(), op: '==', right: right.parse() } as ast.ComparisonCond;
    },

    Comparison_neq(left, op, right) {
        return { kind: 'comparison', left: left.parse(), op: '!=', right: right.parse() } as ast.ComparisonCond;
    },

    Comparison_ge(left, op, right) {
        return { kind: 'comparison', left: left.parse(), op: '>=', right: right.parse() } as ast.ComparisonCond;
    },

    Comparison_le(left, op, right) {
        return { kind: 'comparison', left: left.parse(), op: '<=', right: right.parse() } as ast.ComparisonCond;
    },

    Comparison_gt(left, op, right) {
        return { kind: 'comparison', left: left.parse(), op: '>', right: right.parse() } as ast.ComparisonCond;
    },

    Comparison_lt(left, op, right) {
        return { kind: 'comparison', left: left.parse(), op: '<', right: right.parse() } as ast.ComparisonCond;
    },
} satisfies FunnyActionDict<any>;


// Helper: Проверка корректности вызовов функций
function validateFunctionCalls(module: ast.Module) {
    //  Map, где ключ — имя функции, а значение — объект с числом параметров и возвращаемых значений
    const funcTable = new Map<string, { params: number; returns: number }>();

    // Построить таблицу функций
    for (const func of module.functions) {
        funcTable.set(func.name, { params: func.parameters.length, returns: func.returns.length });
    }

    // Проверить узел и его потомков (по дефолту 1 возвращаемое значение)
    function checkNode(node: any, expectedReturns: number = 1) {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach(n => checkNode(n, expectedReturns));
            return;
        }

        // Проверка вызовов функций
        if (node.type === 'funccall') {
            if (!funcTable.has(node.name)) {
                throw new FunnyError(
                    `Call to undeclared function '${node.name}'`,
                    'UNDECLARED_FUNCTION'
                );
            }

            const { params, returns } = funcTable.get(node.name)!;

            if (node.args.length !== params) {
                throw new FunnyError(
                    `Function '${node.name}' expects ${params} argument(s), but ${node.args.length} provided`,
                    'ARGUMENT_MISMATCH'
                );
            }

            if (returns !== expectedReturns) {
                throw new FunnyError(
                    `Function '${node.name}' returns ${returns} value(s), but ${expectedReturns} expected`,
                    'RETURN_MISMATCH'
                );
            }

            node.args.forEach((arg: any) => checkNode(arg, 1));
            return;
        }

        // Контейнеры, которые требуют проверки
        if (node.type === 'assign') {
            const numTargets = node.targets.length;
            node.exprs.forEach((expr: any) => checkNode(expr, numTargets));
            node.targets.forEach((target: any) => checkNode(target, 1));
        } else if (node.type === 'block') {
            node.stmts.forEach((stmt: any) => checkNode(stmt, 1));
        } else if (node.type === 'if') {
            checkNode(node.condition, 1);
            checkNode(node.then, 1);
            checkNode(node.else, 1);
        } else if (node.type === 'while') {
            checkNode(node.condition, 1);
            checkNode(node.body, 1);
        } else if (['arraccess', 'larr', 'binop'].includes(node.type)) {
            checkNode(node.index, 1);
            checkNode(node.left, 1);
            checkNode(node.right, 1);
        } else if (node.type === 'unary') {
            checkNode(node.argument, 1);
        }

        // Условия (predicates)
        if (node.kind === 'comparison') {
            checkNode(node.left, 1);
            checkNode(node.right, 1);
        } else if (node.kind === 'not') {
            checkNode(node.condition, 1);
        } else if (['and', 'or', 'implies'].includes(node.kind)) {
            checkNode(node.left, 1);
            checkNode(node.right, 1);
        } else if (node.kind === 'paren') {
            checkNode(node.inner, 1);
        }
    }

    // Проверить все функции
    for (const func of module.functions) {
        checkNode(func.body, 1);
    }
}

export const semantics: FunnySemanticsExt = grammar.Funny.createSemantics() as FunnySemanticsExt;
semantics.addOperation("parse()", getFunnyAst);

export interface FunnySemanticsExt extends Semantics {
    (match: MatchResult): FunnyActionsExt;
}

interface FunnyActionsExt {
    parse(): ast.Module;
}

export function parseFunny(source: string): ast.Module {
    const matchResult = grammar.Funny.match(source, 'Module');

    if (!matchResult.succeeded()) {
        throw new FunnyError(matchResult.message || 'Syntax error', 'SYNTAX_ERROR');
    }

    const module = semantics(matchResult).parse();
    validateFunctionCalls(module);

    return module;
}
