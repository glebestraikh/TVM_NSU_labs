import { getExprAst } from '../../lab04';
import * as ast from './funny';
import { FunnyError } from './index';
import grammar, { FunnyActionDict } from './funny.ohm-bundle';
import { MatchResult, Semantics } from 'ohm-js';

// Type system
export type VarType = 'int' | 'int[]';

type TypeContext = Map<string, VarType>;

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
// В Ohm правило типа ListOf или NonemptyListOf создаёт специальный “Iteration” узел
function parseIteration(node: any): any[] {
    return node.asIteration().children.map((c: any) => c.parse());
}

// Helper:Сбор всех использованных имен в узле (для проверки объявления)
// Проходит по любому AST-узлу рекурсивно.
// Находит все переменные, которые реально используются в выражениях, присваиваниях, индексах массивов, функциях и условиях.
// Добавляет их имена в переданный Set
// После этого множества names можно использовать для:
//  проверки использования незадекларированных переменных,
//  предупреждения о неиспользованных локальных переменных или параметрах функции.
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

// Helper: Определить тип выражения
// Возвращает типы: если функция возвращает одно значение, возвращает VarType
// если несколько - возвращает VarType[]
function getExpressionType(expr: any, context: TypeContext, funcTable?: Map<string, { params: Array<{ name: string; type: VarType }>; returns: Array<{ name: string; type: VarType }> }>): VarType | VarType[] {
    if (!expr) {
        throw new FunnyError('Invalid expression', 'TYPE_ERROR');
    }

    // Константа число - всегда int
    if (expr.type === 'const') {
        return 'int';
    }

    // Переменная
    if (expr.type === 'var') {
        const varType = context.get(expr.name);
        if (!varType) {
            throw new FunnyError(
                `Variable '${expr.name}' not found in type context`,
                'TYPE_ERROR'
            );
        }
        return varType;
    }

    // Обращение к массиву arr[i] -> int
    if (expr.type === 'arraccess') {
        const arrayType = context.get(expr.name);
        if (!arrayType) {
            throw new FunnyError(
                `Array '${expr.name}' not found in type context`,
                'TYPE_ERROR'
            );
        }
        if (arrayType !== 'int[]') {
            throw new FunnyError(
                `Cannot index non-array variable '${expr.name}' of type '${arrayType}'`,
                'INVALID_ARRAY_ACCESS'
            );
        }
        // Проверяем, что индекс - int
        const indexType = getExpressionType(expr.index, context, funcTable);
        if (Array.isArray(indexType)) {
            throw new FunnyError(
                `Array index cannot be a tuple`,
                'TYPE_MISMATCH'
            );
        }
        if (indexType !== 'int') {
            throw new FunnyError(
                `Array index must be 'int', got '${indexType}'`,
                'TYPE_MISMATCH'
            );
        }
        return 'int';
    }

    // Бинарная операция
    if (expr.type === 'binop') {
        const leftType = getExpressionType(expr.left, context, funcTable);
        const rightType = getExpressionType(expr.right, context, funcTable);

        if (Array.isArray(leftType) || Array.isArray(rightType)) {
            throw new FunnyError(
                `Binary operation cannot use tuple results`,
                'TYPE_MISMATCH'
            );
        }

        if (leftType !== 'int' || rightType !== 'int') {
            throw new FunnyError(
                `Binary operation '${expr.op}' requires 'int' operands, got '${leftType}' and '${rightType}'`,
                'TYPE_MISMATCH'
            );
        }
        return 'int';
    }

    // Унарная операция (унарный минус)
    if (expr.type === 'unary') {
        const argType = getExpressionType(expr.argument, context, funcTable);
        if (Array.isArray(argType)) {
            throw new FunnyError(
                `Unary operation cannot use tuple results`,
                'TYPE_MISMATCH'
            );
        }
        if (argType !== 'int') {
            throw new FunnyError(
                `Unary operation '${expr.op}' requires 'int' operand, got '${argType}'`,
                'TYPE_MISMATCH'
            );
        }
        return 'int';
    }

    // Вызов функции
    if (expr.type === 'funccall') {
        if (!funcTable || !funcTable.has(expr.name)) {
            throw new FunnyError(
                `Call to undeclared function '${expr.name}'`,
                'UNDECLARED_FUNCTION'
            );
        }
        const funcInfo = funcTable.get(expr.name)!;
        const returnTypes = funcInfo.returns.map(r => r.type);

        // Если функция возвращает одно значение, возвращаем скалярный тип
        // иначе возвращаем массив типов (для кортежей)
        if (returnTypes.length === 1) {
            return returnTypes[0];
        }
        return returnTypes;
    }

    // Скобки
    if (expr.type === 'paren') {
        return getExpressionType(expr.inner, context, funcTable);
    }

    throw new FunnyError(`Unknown expression type: ${expr.type}`, 'TYPE_ERROR');
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


// Проверка корректности вызовов функций и типов
function validateAst(module: ast.Module) {
    // Map с информацией о функциях: параметры, возвращаемые значения
    const funcTable = new Map<string, {
        params: Array<{ name: string; type: VarType }>;
        returns: Array<{ name: string; type: VarType }>;
    }>();

    // Построить таблицу функций с типами
    for (const func of module.functions) {
        funcTable.set(func.name, {
            params: func.parameters.map(p => ({ name: p.name, type: p.varType || 'int' })),
            returns: func.returns.map(r => ({ name: r.name, type: r.varType || 'int' }))
        });
    }

    // Проверить узел и его потомков
    function checkNode(node: any, typeContext: TypeContext, expectedReturns: number = 1) {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach(n => checkNode(n, typeContext, expectedReturns));
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

            const funcInfo = funcTable.get(node.name)!;
            const { params, returns } = funcInfo;

            if (node.args.length !== params.length) {
                throw new FunnyError(
                    `Function '${node.name}' expects ${params.length} argument(s), but ${node.args.length} provided`,
                    'ARGUMENT_MISMATCH'
                );
            }

            // Проверяем типы аргументов
            for (let i = 0; i < node.args.length; i++) {
                const argType = getExpressionType(node.args[i], typeContext, funcTable);
                const paramType = params[i].type;

                if (Array.isArray(argType)) {
                    throw new FunnyError(
                        `Function '${node.name}' parameter '${params[i].name}' expects '${paramType}', but got tuple result`,
                        'TYPE_MISMATCH'
                    );
                }

                if (argType !== paramType) {
                    throw new FunnyError(
                        `Function '${node.name}' parameter '${params[i].name}' expects '${paramType}', but got '${argType}'`,
                        'TYPE_MISMATCH'
                    );
                }
                checkNode(node.args[i], typeContext, 1);
            }

            if (returns.length !== expectedReturns) {
                throw new FunnyError(
                    `Function '${node.name}' returns ${returns.length} value(s), but ${expectedReturns} expected`,
                    'RETURN_MISMATCH'
                );
            }

            return;
        }

        // Проверка присваивания
        if (node.type === 'assign') {
            const numTargets = node.targets.length;
            const numExprs = node.exprs.length;

            // Вычисляем общее количество возвращаемых значений справа
            let totalReturns = 0;
            const exprTypes: (VarType | VarType[])[] = [];

            for (const expr of node.exprs) {
                const exprType = getExpressionType(expr, typeContext, funcTable);
                exprTypes.push(exprType);

                if (Array.isArray(exprType)) {
                    totalReturns += exprType.length;
                } else {
                    totalReturns += 1;
                }
            }

            if (numTargets !== totalReturns) {
                throw new FunnyError(
                    `Assignment expects ${numTargets} value(s), but ${totalReturns} provided`,
                    'ASSIGNMENT_MISMATCH'
                );
            }

            // Проверяем типы каждого значения и целевого места
            let targetIndex = 0;
            for (let i = 0; i < numExprs; i++) {
                const expr = node.exprs[i];
                const exprType = exprTypes[i];
                const exprTypes_array = Array.isArray(exprType) ? exprType : [exprType];

                for (const exprSubType of exprTypes_array) {
                    const target = node.targets[targetIndex];

                    // Определяем тип целевого места
                    let targetType: VarType;
                    if (target.type === 'lvar') {
                        targetType = typeContext.get(target.name) || 'int';
                    } else if (target.type === 'larr') {
                        // arr[i] = value -> value должен быть int
                        targetType = 'int';
                        // Проверяем что arr - это массив
                        const arrType = typeContext.get(target.name);
                        if (arrType !== 'int[]') {
                            throw new FunnyError(
                                `Cannot index non-array variable '${target.name}' of type '${arrType}'`,
                                'INVALID_ARRAY_ACCESS'
                            );
                        }
                        // Проверяем что индекс - int
                        const indexType = getExpressionType(target.index, typeContext, funcTable);
                        if (Array.isArray(indexType)) {
                            throw new FunnyError(
                                `Array index cannot be a tuple`,
                                'TYPE_MISMATCH'
                            );
                        }
                        if (indexType !== 'int') {
                            throw new FunnyError(
                                `Array index must be 'int', got '${indexType}'`,
                                'TYPE_MISMATCH'
                            );
                        }
                    } else {
                        targetType = 'int';
                    }

                    // Проверяем совпадение типов
                    if (targetType !== exprSubType) {
                        throw new FunnyError(
                            `Type mismatch in assignment: expected '${targetType}', got '${exprSubType}'`,
                            'TYPE_MISMATCH'
                        );
                    }

                    targetIndex++;
                }

                checkNode(expr, typeContext, numTargets);
            }

            return;
        }

        // Проверка условных операторов
        if (node.type === 'if') {
            checkNode(node.condition, typeContext, 1);
            checkNode(node.then, typeContext, 1);
            checkNode(node.else, typeContext, 1);
            return;
        }

        // Проверка циклов
        if (node.type === 'while') {
            checkNode(node.condition, typeContext, 1);
            checkNode(node.body, typeContext, 1);
            return;
        }

        // Проверка блоков
        if (node.type === 'block') {
            node.stmts.forEach((stmt: any) => checkNode(stmt, typeContext, 1));
            return;
        }

        // Проверка условий
        if (node.kind === 'comparison') {
            const leftType = getExpressionType(node.left, typeContext, funcTable);
            const rightType = getExpressionType(node.right, typeContext, funcTable);

            if (Array.isArray(leftType) || Array.isArray(rightType)) {
                throw new FunnyError(
                    `Comparison operands cannot be tuples`,
                    'TYPE_MISMATCH'
                );
            }

            if (leftType !== rightType) {
                throw new FunnyError(
                    `Comparison operands must have the same type: '${leftType}' vs '${rightType}'`,
                    'TYPE_MISMATCH'
                );
            }
            checkNode(node.left, typeContext, 1);
            checkNode(node.right, typeContext, 1);
            return;
        }

        if (node.kind === 'not') {
            checkNode(node.condition, typeContext, 1);
            return;
        }

        if (['and', 'or', 'implies'].includes(node.kind)) {
            checkNode(node.left, typeContext, 1);
            checkNode(node.right, typeContext, 1);
            return;
        }

        if (node.kind === 'paren') {
            checkNode(node.inner, typeContext, 1);
            return;
        }
    }

    // Проверить все функции
    for (const func of module.functions) {
        // Создаем контекст типов для функции
        const typeContext: TypeContext = new Map();

        // Добавляем параметры
        for (const param of func.parameters) {
            typeContext.set(param.name, param.varType || 'int');
        }

        // Добавляем возвращаемые значения
        for (const ret of func.returns) {
            typeContext.set(ret.name, ret.varType || 'int');
        }

        // Добавляем локальные переменные
        for (const local of func.locals) {
            typeContext.set(local.name, local.varType || 'int');
        }

        // Проверяем тело функции
        checkNode(func.body, typeContext, 1);
    }
}

//  создаёт объект семантики для грамматики Funny
// В Ohm семантика — это набор правил, которые определяют, как превращать разобранный текст в AST или другой объект
export const semantics: FunnySemanticsExt = grammar.Funny.createSemantics() as FunnySemanticsExt;
// добавляет операцию parse() к семантике, которая вызывает функции из getFunnyAst для каждого узла грамматики.
semantics.addOperation("parse()", getFunnyAst);

// если применить семантику к результату match, то мы получаем объект FunnyActionsExt
export interface FunnySemanticsExt extends Semantics {
    (match: MatchResult): FunnyActionsExt;
}

// FunnyActionsExt имеет метод parse(), который возвращает AST для модуля (ast.Module)
interface FunnyActionsExt {
    parse(): ast.Module;
}

export function parseFunny(source: string): ast.Module {
    // Разбирает текст source по правилу Module грамматики Funny
    // Возвращает объект matchResult, содержащий результат синтаксического разбора
    const matchResult = grammar.Funny.match(source, 'Module');

    if (!matchResult.succeeded()) {
        throw new FunnyError(matchResult.message || 'Syntax error', 'SYNTAX_ERROR');
    }

    // Применяем семантику к matchResult
    // Вызываем метод parse(), который строит AST (ast.Module)
    const module = semantics(matchResult).parse();
    // функция, которая проверяет семантические ошибки
    validateAst(module);

    // Возврат AST
    return module;
}
