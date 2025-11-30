import { getExprAst } from '../../lab04';
import * as ast from './funny';
import { FunnyError } from './index';
import grammar, { FunnyActionDict } from './funny.ohm-bundle';
import { MatchResult, Semantics } from 'ohm-js';

function checkUniqueNames(items: ast.ParameterDef[], kind: string, node?: any) {
    const seen = new Set<string>();
    for (const item of items) {
        if (seen.has(item.name)) {
            let startLine, startCol, endLine, endCol;
            if (node && node.source) {
                const interval = node.source;
                const lineInfo = interval.getLineAndColumn();
                startLine = lineInfo.lineNum;
                startCol = lineInfo.colNum;
                const endInfo = interval.getLineAndColumnMessage();
                endLine = startLine;
                endCol = startCol + item.name.length;
            }

            throw new FunnyError(
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

// Сбор всех имен в узле
function collectUsedNames(node: any, names: Set<string>) {
    if (!node) {
        return;
    }

    if (Array.isArray(node)) {
        node.forEach(n => collectUsedNames(n, names));
        return;
    }

    switch (node.type) {
        case 'lvar':
            names.add(node.name);
            break;

        case 'larr':
            names.add(node.name);
            collectUsedNames(node.index, names);
            break;

        case 'assign':
            node.targets.forEach((t: any) => collectUsedNames(t, names));
            node.exprs.forEach((e: any) => collectUsedNames(e, names));
            break;

        case 'block':
            node.stmts.forEach((s: any) => collectUsedNames(s, names));
            break;

        case 'if':
            collectUsedNames(node.condition, names);
            collectUsedNames(node.then, names);
            if (node.else) {
                collectUsedNames(node.else, names);
            }
            break;

        case 'while':
            collectUsedNames(node.condition, names);
            collectUsedNames(node.body, names);
            break;

        case 'funccall':
            node.args.forEach((a: any) => collectUsedNames(a, names));
            break;

        case 'arraccess':
            names.add(node.name);
            collectUsedNames(node.index, names);
            break;

        case 'var':
            names.add(node.name);
            break;

        case 'binop':
            collectUsedNames(node.left, names);
            collectUsedNames(node.right, names);
            break;

        case 'unary':
            collectUsedNames(node.argument, names);
            break;
    }

    if (node.kind === 'comparison') {
        collectUsedNames(node.left, names);
        collectUsedNames(node.right, names);
    } else if (node.kind === 'not') {
        collectUsedNames(node.condition, names);
    } else if (node.kind === 'and' || node.kind === 'or' || node.kind === 'implies') {
        collectUsedNames(node.left, names);
        collectUsedNames(node.right, names);
    } else if (node.kind === 'paren') {
        collectUsedNames(node.inner, names);
    }
}

export const getFunnyAst = {
    ...getExprAst,

    // Module = Function+
    Module(funcs) {
        const functions = funcs.children.map((f: any) => f.parse());
        return { type: 'module', functions } as ast.Module;
    },

    // Function = identifier "(" ParamList ")" "returns" ParamListNonEmpty UsesOpt? Statement
    Function(name, lp, params, rp, ret, rets, uses, stmt) {
        const funcName = name.sourceString;
        const parameters = params.parse();
        const returns = rets.parse();
        const locals = uses.numChildren > 0 ? uses.children[0].parse() : [];
        const body = stmt.parse();

        checkUniqueNames(parameters, 'parameter');
        checkUniqueNames(returns, 'return value');
        checkUniqueNames(locals, 'local variable');
        const all = [...parameters, ...returns, ...locals];
        checkUniqueNames(all, 'variable');

        // Проверяем что все используемые переменные объявлены
        const declared = new Set(all.map(p => p.name));
        const used = new Set<string>();
        collectUsedNames(body, used);
        for (const name of used) {
            if (!declared.has(name)) {
                let startLine, startCol;
                if (stmt.source) {
                    const lineInfo = stmt.source.getLineAndColumn();
                    startLine = lineInfo.lineNum;
                    startCol = lineInfo.colNum;
                }

                throw new FunnyError(
                    `Use of undeclared identifier '${name}'`,
                    'UNDECLARED',
                    startLine,
                    startCol
                );
            }
        }

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

    // ParamList = ListOf<Param, ",">
    ParamList(list) {
        return list.asIteration().children.map((c: any) => c.parse());
    },

    // ParamListNonEmpty = NonemptyListOf<Param, ",">
    ParamListNonEmpty(list) {
        return list.asIteration().children.map((c: any) => c.parse());
    },

    // Param = identifier ":" Type
    Param(name, colon, type) {
        const varType = type.parse();
        return { type: 'param', name: name.sourceString, varType } as ast.ParameterDef;
    },

    // UsesOpt = "uses" ParamList
    UsesOpt(uses, params) {
        return params.parse();
    },

    // Type = "int" -- int
    Type_int(int) {
        return 'int' as const;
    },

    // Type = "int" "[" "]" -- array
    Type_array(int, lb, rb) {
        return 'int[]' as const;
    },

    // Assignment = LValueList "=" ExprList ";" -- tuple
    Assignment_tuple(targets, eq, exprs, semi) {
        return { type: 'assign', targets: targets.parse(), exprs: exprs.parse() } as ast.AssignStmt;
    },

    // Assignment = LValue "=" AddExpr ";" -- simple
    Assignment_simple(target, eq, expr, semi) {
        return { type: 'assign', targets: [target.parse()], exprs: [expr.parse()] } as ast.AssignStmt;
    },

    // LValueList = NonemptyListOf<LValue, ",">
    LValueList(list) {
        return list.asIteration().children.map((c: any) => c.parse());
    },

    // ExprList = NonemptyListOf<AddExpr, ",">
    ExprList(list) {
        return list.asIteration().children.map((c: any) => c.parse());
    },

    // LValue = identifier "[" AddExpr "]" -- array
    LValue_array(name, lb, expr, rb) {
        return { type: 'larr', name: name.sourceString, index: expr.parse() } as ast.ArrLValue;
    },

    // LValue = identifier -- variable
    LValue_variable(name) {
        return { type: 'lvar', name: name.sourceString } as ast.VarLValue;
    },

    // Block = "{" Statement* "}"
    Block(lb, stmts, rb) {
        return { type: 'block', stmts: stmts.children.map((s: any) => s.parse()) } as ast.BlockStmt;
    },

    // Conditional = "if" "(" Condition ")" Statement ("else" Statement)?
    Conditional(ifKw, lp, cond, rp, then, elseKw, elseStmt) {
        return {
            type: 'if', condition: cond.parse(), then: then.parse(),
            else: elseStmt.numChildren > 0 ? elseStmt.children[0].parse() : null
        } as ast.ConditionalStmt;
    },

    // While = "while" "(" Condition ")" Statement
    While(whileKw, lp, cond, rp, stmt) {
        return { type: 'while', condition: cond.parse(), body: stmt.parse() } as ast.WhileStmt;
    },

    // FunctionCall = identifier "(" ArgList ")"
    FunctionCall(name, lp, args, rp) {
        return { type: 'funccall', name: name.sourceString, args: args.parse() } as ast.FuncCallExpr;
    },

    // ArgList = ListOf<AddExpr, ",">
    ArgList(list) {
        return list.asIteration().children.map((c: any) => c.parse());
    },

    // ArrayAccess = identifier "[" AddExpr "]"
    ArrayAccess(name, lb, expr, rb) {
        return { type: 'arraccess', name: name.sourceString, index: expr.parse() } as ast.ArrAccessExpr;
    },

    // ImplyCond = OrCond ("->" ImplyCond)?
    ImplyCond(left, arrow, right) {
        if (right.numChildren === 0) {
            return left.parse();
        }
        return { kind: 'implies', left: left.parse(), right: right.children[0].children[1].parse() } as ast.ImpliesCond;
    },

    // OrCond = AndCond ("or" AndCond)*
    OrCond(first, ors, rest) {
        let result = first.parse();
        const items = rest.children;
        for (const item of items) {
            result = { kind: 'or', left: result, right: item.children[1].parse() } as ast.OrCond;
        }
        return result;
    },

    // AndCond = NotCond ("and" NotCond)*
    AndCond(first, ands, rest) {
        let result = first.parse();
        const items = rest.children;
        for (const item of items) {
            result = { kind: 'and', left: result, right: item.children[1].parse() } as ast.AndCond;
        }
        return result;
    },

    // NotCond = "not"* AtomCond
    NotCond(nots, atom) {
        let result = atom.parse();
        for (let i = 0; i < nots.numChildren; i++) {
            result = { kind: 'not', condition: result } as ast.NotCond;
        }
        return result;
    },

    // AtomCond = "true" -- true
    AtomCond_true(t) {
        return { kind: 'true' } as ast.TrueCond;
    },

    // AtomCond = "false" -- false
    AtomCond_false(f) {
        return { kind: 'false' } as ast.FalseCond;
    },

    // AtomCond = Comparison -- comparison
    AtomCond_comparison(cmp) {
        return cmp.parse();
    },

    // AtomCond = "(" Condition ")" -- paren
    AtomCond_paren(lp, cond, rp) {
        return { kind: 'paren', inner: cond.parse() } as ast.ParenCond;
    },

    // ==
    Comparison_eq(left, op, right) {
        return { kind: 'comparison', left: left.parse(), op: '==', right: right.parse() } as ast.ComparisonCond;
    },

    // !=
    Comparison_neq(left, op, right) {
        return { kind: 'comparison', left: left.parse(), op: '!=', right: right.parse() } as ast.ComparisonCond;
    },

    // >=
    Comparison_ge(left, op, right) {
        return { kind: 'comparison', left: left.parse(), op: '>=', right: right.parse() } as ast.ComparisonCond;
    },

    // <=
    Comparison_le(left, op, right) {
        return { kind: 'comparison', left: left.parse(), op: '<=', right: right.parse() } as ast.ComparisonCond;
    },

    // >
    Comparison_gt(left, op, right) {
        return { kind: 'comparison', left: left.parse(), op: '>', right: right.parse() } as ast.ComparisonCond;
    },

    // <
    Comparison_lt(left, op, right) {
        return { kind: 'comparison', left: left.parse(), op: '<', right: right.parse() } as ast.ComparisonCond;
    },
} satisfies FunnyActionDict<any>;


// Проверка корректности вызовов функций
function validateFunctionCalls(module: ast.Module) {
    const funcTable = new Map<string, { params: number, returns: number }>();
    for (const func of module.functions) {
        funcTable.set(func.name, { params: func.parameters.length, returns: func.returns.length });
    }

    function checkNode(node: any, expectedReturns: number = 1, sourceNode?: any) {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            node.forEach(n => checkNode(n, expectedReturns));
            return;
        }

        switch (node.type) {
            case 'funccall':
                // проверка на объявление функции
                if (!funcTable.has(node.name)) {
                    let startLine, startCol;
                    if (sourceNode && sourceNode.source) {
                        const lineInfo = sourceNode.source.getLineAndColumn();
                        startLine = lineInfo.lineNum;
                        startCol = lineInfo.colNum;
                    }

                    throw new FunnyError(
                        `Call to undeclared function '${node.name}'`,
                        'UNDECLARED_FUNCTION',
                        startLine,
                        startCol
                    );
                }

                const funcInfo = funcTable.get(node.name)!;

                // проверка количества аргументов
                if (node.args.length !== funcInfo.params) {
                    let startLine, startCol;
                    if (sourceNode && sourceNode.source) {
                        const lineInfo = sourceNode.source.getLineAndColumn();
                        startLine = lineInfo.lineNum;
                        startCol = lineInfo.colNum;
                    }

                    throw new FunnyError(
                        `Function '${node.name}' expects ${funcInfo.params} argument(s), but ${node.args.length} provided`,
                        'ARGUMENT_MISMATCH',
                        startLine,
                        startCol
                    );
                }

                // проверка ретернов
                if (funcInfo.returns !== expectedReturns) {
                    let startLine, startCol;
                    if (sourceNode && sourceNode.source) {
                        const lineInfo = sourceNode.source.getLineAndColumn();
                        startLine = lineInfo.lineNum;
                        startCol = lineInfo.colNum;
                    }

                    throw new FunnyError(
                        `Function '${node.name}' returns ${funcInfo.returns} value(s), but ${expectedReturns} expected`,
                        'RETURN_MISMATCH',
                        startLine,
                        startCol
                    );
                }

                node.args.forEach((arg: any) => checkNode(arg, 1));
                break;

            case 'assign':
                const numTargets = node.targets.length;
                node.exprs.forEach((expr: any) => checkNode(expr, numTargets));
                node.targets.forEach((target: any) => checkNode(target, 1));
                break;

            case 'block':
                node.stmts.forEach((stmt: any) => checkNode(stmt, 1));
                break;

            case 'if':
                checkNode(node.condition, 1);
                checkNode(node.then, 1);
                if (node.else) {
                    checkNode(node.else, 1);
                }
                break;

            case 'while':
                checkNode(node.condition, 1);
                checkNode(node.body, 1);
                break;

            case 'arraccess':
            case 'larr':
                checkNode(node.index, 1);
                break;

            case 'binop':
                checkNode(node.left, 1);
                checkNode(node.right, 1);
                break;

            case 'unary':
                checkNode(node.argument, 1);
                break;
        }

        if (node.kind === 'comparison') {
            checkNode(node.left, 1);
            checkNode(node.right, 1);
        } else if (node.kind === 'not') {
            checkNode(node.condition, 1);
        } else if (node.kind === 'and' || node.kind === 'or' || node.kind === 'implies') {
            checkNode(node.left, 1);
            checkNode(node.right, 1);
        } else if (node.kind === 'paren') {
            checkNode(node.inner, 1);
        }
    }

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

    // Проверяем вызовы функций
    validateFunctionCalls(module);

    return module;
}
