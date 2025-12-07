import { Arith, ArithSort, Bool, Context, init, Model, SMTArray, SMTArraySort } from "z3-solver";

import { printFuncCall } from "./printFuncCall";
import { AnnotatedModule, AnnotatedFunctionDef } from "../../lab10";
import { Condition, Statement, Expr, LValue, Module, FunctionDef } from "../../lab08";


let z3anchor;
async function initZ3() {
    if (!z3) {
        z3anchor = await init();
        const Z3C = z3anchor.Context;
        z3 = Z3C('main');
    }
}
export function flushZ3() {
    z3anchor = undefined;
}

let z3: Context;

/**
 * Верификация модуля Funny
 * 
 * Уровень C (3): Верификация простых функций без циклов и вызовов
 * Уровень B (4): Верификация функций с циклами и рекурсией
 * Уровень A (5): Поддержка ссылок на формулы
 */
export async function verifyModule(module: AnnotatedModule) {
    await initZ3();

    // Проверяем каждую функцию в модуле
    const functionMap: any = {};
    for (const f of module.functions) functionMap[(f as any).name] = f;
    for (const func of module.functions) {
        const versionedFunc = func as unknown as AnnotatedFunctionDef;

        // Если есть postcondition, проверяем её
        if (versionedFunc.postcondition) {
            const vconditions = buildFunctionVerificationConditions(versionedFunc, functionMap);

            for (const vc of vconditions) {
                const z3Formula = convertConditionsToZ3(vc);
                await proveTheorem(z3Formula, versionedFunc);
            }
        }
    }
}

/**
 * Построить условия верификации для функции
 * Возвращает набор условий, которые должны быть доказаны для верификации функции
 */
function buildFunctionVerificationConditions(func: AnnotatedFunctionDef, moduleFunctions?: any): any[] {
    const vconditions: any[] = [];

    // Начальное состояние: пустое состояние
    // Переменные будут создаваться как Z3 символы по требованию в convertExprToZ3
    const initialState: any = {};

    // Выполняем тело функции
    // Inform the function about module functions for call handling
    (func as any).__moduleFunctions = moduleFunctions;
    const assumptions: any[] = [];
    let postState = executeStatementSymbolically(func.body, initialState, vconditions, func, assumptions);

    // Условие верификации: после выполнения тела функции должно выполняться postcondition
    // Но только при условии что precondition было истинно
    if (func.postcondition) {
        // Build the VC: precondition => postcondition with postState
        const vc: any = {
            condition: func.postcondition,
            context: postState,
            assumptions: [] as any[]
        };
        // If there's a precondition, include it as an assumption
        if (func.precondition) {
            vc.assumptions.push(func.precondition);
        }
        // Include the assumptions collected from call sites into this top-level VC
        if (assumptions && assumptions.length > 0) vc.assumptions.push(...assumptions);
        vconditions.push(vc);
    }

    return vconditions;
}

/**
     * Выполнить statement символически и вернуть итоговое состояние
     */
function executeStatementSymbolically(stmt: Statement, state: any, vconditions: any[], func: AnnotatedFunctionDef, assumptions: any[]): any {
    const s = stmt as any;

    // Handle undefined or null
    if (!s) {
        return state;
    }

    // Handle both 'type' and 'kind' properties (from lab10 WhileStmtWithInvariant)
    const stmtType = s.type || s.kind;

    switch (stmtType) {
        case "block":
            // Выполняем все statement'ы в блоке последовательно
            let currentState = { ...state };
            for (const st of s.stmts) {
                currentState = executeStatementSymbolically(st, currentState, vconditions, func, assumptions);
            }
            return currentState;

        case "assign": {
            // Присваивание: обновляем состояние с новыми значениями
            const newState = { ...state };
            const targets = s.targets as LValue[];
            const exprs = s.exprs as Expr[];

            for (let i = 0; i < targets.length; i++) {
                const target = targets[i] as any;
                if (target.type === 'lvar') {
                    // Простое присваивание: x = expr
                    const e = exprs[i] as any;
                    // If it's a function call, treat specially: create a symbolic var for result and
                    // add assumptions about callee's postcondition and precondition.
                    if (e.type === 'funccall') {
                        // create a fresh symbolic var for call
                        const callVarName = `call_${e.name}_${Math.random().toString(36).substring(2, 8)}`;
                        newState[target.name] = { type: 'var', name: callVarName } as any;

                        // Find callee information from module functions (via func.__moduleFunctions if available)
                        const moduleFunctions: any = (func as any).__moduleFunctions;
                        if (moduleFunctions && moduleFunctions[e.name]) {
                            const callee = moduleFunctions[e.name];
                            // Build callee precondition VC (verify it's true at call-site)
                            if (callee.precondition) {
                                const preCtx: any = {};
                                for (let iarg = 0; iarg < callee.parameters.length; iarg++) {
                                    const pname = callee.parameters[iarg].name;
                                    preCtx[pname] = e.args[iarg];
                                }
                                vconditions.push({ condition: callee.precondition, context: preCtx });
                            }
                            // Build callee postcondition as assumption in this caller's context
                            if (callee.postcondition) {
                                const postPred = substitutePredicate(callee.postcondition, e.args, callee.parameters, callVarName, callee.returns);
                                // Add to assumptions list; we will include them when checking the final VC
                                assumptions.push(postPred);
                            }
                        }
                    } else {
                        newState[target.name] = exprs[i];
                    }
                }
            }
            return newState;
        }

        case "if": {
            // Условный оператор: объединяем состояния обоих ветвей
            const thenState = executeStatementSymbolically(s.then, state, vconditions, func, assumptions);
            const elseState = s.else ? executeStatementSymbolically(s.else, state, vconditions, func, assumptions) : state;

            // Простое объединение (для верификации нужно рассмотреть оба пути)
            // Возвращаем состояние с переменными из обеих ветвей
            return { ...thenState, ...elseState };
        } case "while": {
            // Для цикла: если есть инвариант, проверяем его.
            if (!s.invariant) return state;

            // 1) invariant holds at entry
            vconditions.push({ condition: s.invariant, context: state });

            // 2) preservation: use 'old_' named variables for an arbitrary state
            const stateBefore: any = {};
            for (const k of Object.keys(state)) {
                stateBefore[k] = { type: 'var', name: `old_${k}` } as any;
            }
            const stateAfter = executeStatementSymbolically(s.body, stateBefore, vconditions, func, assumptions);
            const preservationPred = {
                kind: 'implies',
                left: {
                    kind: 'and',
                    left: s.invariant,
                    right: s.condition
                },
                right: s.invariant
            } as any;
            vconditions.push({ condition: preservationPred, context: stateBefore, contextAfter: stateAfter });

            // 3) Return an exit state composed of 'exit_' variables
            const exitState: any = {};
            for (const k of Object.keys(state)) {
                exitState[k] = { type: 'var', name: `exit_${k}` } as any;
            }
            return exitState;
        }

        default:
            // Unknown statement type - skip it
            return state;
    }
}

/**
 * Конвертировать условие верификации в Z3 формулу
 */
function convertConditionsToZ3(vc: any): any {
    // vc can be either a raw z3 Bool, or a predicate with context and
    // optional assumptions and contextAfter.
    if (!vc) return z3.Bool.val(true);
    if ((vc as any).isBool && typeof (vc as any).isBool === 'function') {
        // It's already a z3 boolean
        return vc;
    }

    const condition = vc.condition;
    const context = vc.context || {};
    const assumptions = vc.assumptions || [];

    // If contextAfter is present and condition is an 'implies', we convert
    // left with context and right with contextAfter.
    if (vc.contextAfter && condition && condition.kind === 'implies') {
        const left = convertPredicateToZ3(condition.left, context);
        const right = convertPredicateToZ3(condition.right, vc.contextAfter);
        const main = z3.Or(z3.Not(left), right);

        // Conjoin assumptions (if any): (assumptions => main)
        if (assumptions.length > 0) {
            const as = assumptions.map((a: any) => convertPredicateToZ3(a, context));
            return z3.Or(z3.Not(z3.And(...as)), main);
        }
        return main;
    }

    // Создаём Z3 формулу из predicate
    const main = convertPredicateToZ3(condition, context);
    if (assumptions.length > 0) {
        const as = assumptions.map((a: any) => convertPredicateToZ3(a, context));
        return z3.Or(z3.Not(z3.And(...as)), main);
    }
    return main;
}

/**
 * Substitute parameters in a predicate using call args and return value name
 */
function substitutePredicate(pred: any, args: any[], params: any[], resultVarName: string, rets: any[]): any {
    if (!pred) return pred;
    const p = JSON.parse(JSON.stringify(pred));

    function substituteExpr(expr: any): any {
        if (!expr) return expr;
        switch (expr.type) {
            case 'var': {
                for (let i = 0; i < params.length; i++) {
                    if (expr.name === params[i].name) {
                        return args[i];
                    }
                }
                for (let r of rets) {
                    if (expr.name === r.name) {
                        return { type: 'var', name: resultVarName } as any;
                    }
                }
                return expr;
            }
            case 'const': return expr;
            case 'binop':
                return { type: 'binop', op: expr.op, left: substituteExpr(expr.left), right: substituteExpr(expr.right) };
            case 'unary':
                return { type: 'unary', op: expr.op, argument: substituteExpr(expr.argument) };
            case 'funccall':
                return { type: 'funccall', name: expr.name, args: expr.args.map((a: any) => substituteExpr(a)) };
            case 'arraccess':
                return { type: 'arraccess', name: expr.name, index: substituteExpr(expr.index) };
            case 'ite':
                return { type: 'ite', condition: substitutePredicate(expr.condition, args, params, resultVarName, rets), thenExpr: substituteExpr(expr.thenExpr), elseExpr: substituteExpr(expr.elseExpr) };
            default:
                return expr;
        }
    }

    function substitutePredicate(pred: any, args: any[], params: any[], resultVarName: string, rets: any[]): any {
        if (!pred) return pred;
        const q = pred as any;
        switch (q.kind) {
            case 'true':
            case 'false':
                return q;
            case 'comparison':
                return { kind: 'comparison', op: q.op, left: substituteExpr(q.left), right: substituteExpr(q.right) };
            case 'eq':
                return { kind: 'eq', left: substituteExpr(q.left), right: substituteExpr(q.right) };
            case 'neq':
                return { kind: 'neq', left: substituteExpr(q.left), right: substituteExpr(q.right) };
            case 'gt':
                return { kind: 'gt', left: substituteExpr(q.left), right: substituteExpr(q.right) };
            case 'lt':
                return { kind: 'lt', left: substituteExpr(q.left), right: substituteExpr(q.right) };
            case 'ge':
                return { kind: 'ge', left: substituteExpr(q.left), right: substituteExpr(q.right) };
            case 'le':
                return { kind: 'le', left: substituteExpr(q.left), right: substituteExpr(q.right) };
            case 'not':
                return { kind: 'not', condition: substitutePredicate(q.condition, args, params, resultVarName, rets) };
            case 'and':
                return { kind: 'and', left: substitutePredicate(q.left, args, params, resultVarName, rets), right: substitutePredicate(q.right, args, params, resultVarName, rets) };
            case 'or':
                return { kind: 'or', left: substitutePredicate(q.left, args, params, resultVarName, rets), right: substitutePredicate(q.right, args, params, resultVarName, rets) };
            case 'implies':
                return { kind: 'implies', left: substitutePredicate(q.left, args, params, resultVarName, rets), right: substitutePredicate(q.right, args, params, resultVarName, rets) };
            case 'paren':
                return { kind: 'paren', inner: substitutePredicate(q.inner, args, params, resultVarName, rets) };
            case 'forall':
            case 'exists':
                // For quantifiers, we keep them as-is, but substitute inside predicate body.
                return { kind: q.kind, variable: q.variable, predicate: substitutePredicate(q.predicate, args, params, resultVarName, rets) };
            case 'formulaRef':
                return q; // Not substituting formula refs here.
            default:
                return q;
        }
    }

    return substitutePredicate(p, args, params, resultVarName, rets);
}

/**
 * Конвертировать Predicate в Z3 формулу
 */
function convertPredicateToZ3(pred: any, context: any, depth: number = 0): Bool {
    // Защита от бесконечной рекурсии
    if (depth > 100) {
        return z3.Bool.val(true);
    }

    if (pred.kind === 'true') {
        return z3.Bool.val(true);
    }

    if (pred.kind === 'false') {
        return z3.Bool.val(false);
    }

    if (pred.kind === 'comparison') {
        const left = convertExprToZ3(pred.left, context, 0);
        const right = convertExprToZ3(pred.right, context, 0);

        switch (pred.op) {
            case '==': return z3.Eq(left, right) as any;
            case '!=': return z3.Not(z3.Eq(left, right)) as any;
            case '>': return z3.GT(left, right) as any;
            case '<': return z3.LT(left, right) as any;
            case '>=': return z3.GE(left, right) as any;
            case '<=': return z3.LE(left, right) as any;
            default: throw new Error(`Unknown comparison: ${pred.op}`);
        }
    }

    // Direct comparison kinds (from lab10 parser)
    if (pred.kind === 'eq') {
        const left = convertExprToZ3(pred.left, context);
        const right = convertExprToZ3(pred.right, context);
        return z3.Eq(left, right) as any;
    }

    if (pred.kind === 'neq') {
        const left = convertExprToZ3(pred.left, context);
        const right = convertExprToZ3(pred.right, context);
        return z3.Not(z3.Eq(left, right)) as any;
    }

    if (pred.kind === 'gt') {
        const left = convertExprToZ3(pred.left, context);
        const right = convertExprToZ3(pred.right, context);
        return z3.GT(left, right) as any;
    }

    if (pred.kind === 'lt') {
        const left = convertExprToZ3(pred.left, context);
        const right = convertExprToZ3(pred.right, context);
        return z3.LT(left, right) as any;
    }

    if (pred.kind === 'ge') {
        const left = convertExprToZ3(pred.left, context);
        const right = convertExprToZ3(pred.right, context);
        return z3.GE(left, right) as any;
    }

    if (pred.kind === 'le') {
        const left = convertExprToZ3(pred.left, context);
        const right = convertExprToZ3(pred.right, context);
        return z3.LE(left, right) as any;
    }

    if (pred.kind === 'not') {
        return z3.Not(convertPredicateToZ3(pred.condition, context));
    }

    if (pred.kind === 'and') {
        return z3.And(
            convertPredicateToZ3(pred.left, context),
            convertPredicateToZ3(pred.right, context)
        );
    }

    if (pred.kind === 'or') {
        return z3.Or(
            convertPredicateToZ3(pred.left, context),
            convertPredicateToZ3(pred.right, context)
        );
    }

    if (pred.kind === 'implies') {
        const left = convertPredicateToZ3(pred.left, context);
        const right = convertPredicateToZ3(pred.right, context);
        // implies: A => B = (not A) or B
        return z3.Or(z3.Not(left), right);
    }

    if (pred.kind === 'paren') {
        return convertPredicateToZ3(pred.inner, context);
    }

    // Handle quantifiers: Forall and Exists
    if (pred.kind === 'forall' || pred.kind === 'exists') {
        // Build a Z3 context mapping from AST-context by converting any expressions
        const convertAstContextToZ3 = (astCtx: any) => {
            const z3Ctx: any = {};
            if (!astCtx) return z3Ctx;
            for (const k of Object.keys(astCtx)) {
                try {
                    z3Ctx[k] = convertExprToZ3(astCtx[k], astCtx);
                } catch (e) {
                    // If conversion fails, fall back to a fresh z3 variable
                    z3Ctx[k] = z3.Const(k, z3.Int.sort());
                }
            }
            return z3Ctx;
        };

        const z3Ctx = convertAstContextToZ3(context || {});
        const qVar = z3.Const(pred.variable.name, z3.Int.sort());
        z3Ctx[pred.variable.name] = qVar;

        const bodyZ3 = convertPredicateToZ3WithZ3Context(pred.predicate, z3Ctx);
        if (pred.kind === 'forall') return z3.Forall([qVar], bodyZ3) as unknown as Bool;
        return z3.Exists([qVar], bodyZ3) as unknown as Bool;
    }

    throw new Error(`Unknown predicate kind: ${pred.kind}`);
}

// Helper: convert predicate AST using a Z3 context mapping variable name -> z3 AST
function convertPredicateToZ3WithZ3Context(pred: any, z3ctx: any): Bool {
    if (!pred) return z3.Bool.val(true);
    if (pred.kind === 'true') return z3.Bool.val(true);
    if (pred.kind === 'false') return z3.Bool.val(false);
    if (pred.kind === 'comparison') {
        const left = convertExprToZ3WithZ3Context(pred.left, z3ctx);
        const right = convertExprToZ3WithZ3Context(pred.right, z3ctx);
        switch (pred.op) {
            case '==': return z3.Eq(left, right) as any;
            case '!=': return z3.Not(z3.Eq(left, right)) as any;
            case '>': return z3.GT(left, right) as any;
            case '<': return z3.LT(left, right) as any;
            case '>=': return z3.GE(left, right) as any;
            case '<=': return z3.LE(left, right) as any;
            default: throw new Error(`Unknown comparison: ${pred.op}`);
        }
    }
    if (pred.kind === 'eq') return z3.Eq(convertExprToZ3WithZ3Context(pred.left, z3ctx), convertExprToZ3WithZ3Context(pred.right, z3ctx));
    if (pred.kind === 'neq') return z3.Not(z3.Eq(convertExprToZ3WithZ3Context(pred.left, z3ctx), convertExprToZ3WithZ3Context(pred.right, z3ctx)));
    if (pred.kind === 'gt') return z3.GT(convertExprToZ3WithZ3Context(pred.left, z3ctx), convertExprToZ3WithZ3Context(pred.right, z3ctx));
    if (pred.kind === 'lt') return z3.LT(convertExprToZ3WithZ3Context(pred.left, z3ctx), convertExprToZ3WithZ3Context(pred.right, z3ctx));
    if (pred.kind === 'ge') return z3.GE(convertExprToZ3WithZ3Context(pred.left, z3ctx), convertExprToZ3WithZ3Context(pred.right, z3ctx));
    if (pred.kind === 'le') return z3.LE(convertExprToZ3WithZ3Context(pred.left, z3ctx), convertExprToZ3WithZ3Context(pred.right, z3ctx));
    if (pred.kind === 'not') return z3.Not(convertPredicateToZ3WithZ3Context(pred.condition, z3ctx));
    if (pred.kind === 'and') return z3.And(convertPredicateToZ3WithZ3Context(pred.left, z3ctx), convertPredicateToZ3WithZ3Context(pred.right, z3ctx));
    if (pred.kind === 'or') return z3.Or(convertPredicateToZ3WithZ3Context(pred.left, z3ctx), convertPredicateToZ3WithZ3Context(pred.right, z3ctx));
    if (pred.kind === 'implies') return z3.Or(z3.Not(convertPredicateToZ3WithZ3Context(pred.left, z3ctx)), convertPredicateToZ3WithZ3Context(pred.right, z3ctx));
    if (pred.kind === 'paren') return convertPredicateToZ3WithZ3Context(pred.inner, z3ctx);
    if (pred.kind === 'forall' || pred.kind === 'exists') {
        // nested quantifiers - recursively convert
        const qVar = z3.Const(pred.variable.name, z3.Int.sort());
        z3ctx[pred.variable.name] = qVar;
        const body = convertPredicateToZ3WithZ3Context(pred.predicate, z3ctx);
        if (pred.kind === 'forall') return z3.Forall([qVar], body) as any;
        return z3.Exists([qVar], body) as any;
    }
    throw new Error(`Unknown predicate kind (z3ctx): ${pred.kind}`);
}

function convertExprToZ3WithZ3Context(e: any, z3ctx: any): Arith {
    if (!e) return z3.Int.val(0) as any;
    switch (e.type) {
        case 'const': return z3.Int.val(e.value);
        case 'var':
            if (z3ctx && z3ctx[e.name] !== undefined) return z3ctx[e.name];
            return z3.Const(e.name, z3.Int.sort());
        case 'binop': {
            const left = convertExprToZ3WithZ3Context(e.left, z3ctx);
            const right = convertExprToZ3WithZ3Context(e.right, z3ctx);
            switch (e.op) {
                case '+': return (left as any).add(right) as any;
                case '-': return (left as any).sub(right) as any;
                case '*': return (left as any).mul(right) as any;
                case '/': return (left as any).div(right) as any;
                default: throw new Error(`Unknown operator: ${e.op}`);
            }
        }
        case 'unary': {
            const arg = convertExprToZ3WithZ3Context(e.argument, z3ctx);
            return (z3.Int.val(-1) as any).mul(arg) as any;
        }
        case 'funccall': return z3.Const(`funccall_${e.name}_${Math.random().toString(36).substring(2, 8)}`, z3.Int.sort());
        case 'arraccess': return z3.Const(`arraccess_${e.name}_${e.index}`, z3.Int.sort());
        case 'ite': {
            const cond = convertPredicateToZ3WithZ3Context(e.condition, z3ctx);
            const t = convertExprToZ3WithZ3Context(e.thenExpr, z3ctx);
            const f = convertExprToZ3WithZ3Context(e.elseExpr, z3ctx);
            return z3.If(cond, t, f) as any;
        }
    }
    throw new Error(`Unknown expr type (z3ctx): ${e.type}`);
}

/**
 * Конвертировать Expr в Z3 выражение
 */
function convertExprToZ3(expr: Expr, context: any, depth: number = 0): Arith {
    // Защита от бесконечной рекурсии
    if (depth > 100) {
        // Если мы слишком глубоко в рекурсии, создаём новую Z3 переменную
        const uniqueName = `expr_${Math.random().toString(36).substring(7)}`;
        return z3.Const(uniqueName, z3.Int.sort());
    }

    const e = expr as any;

    if (e.type === 'const') {
        return z3.Int.val(e.value);
    }

    if (e.type === 'var') {
        // Если переменная в context'е, используем её значение
        if (context[e.name] !== undefined) {
            return convertExprToZ3(context[e.name], context, depth + 1);
        }
        // Иначе создаём Z3 константу для переменной
        return z3.Const(e.name, z3.Int.sort());
    }

    if (e.type === 'binop') {
        const left = convertExprToZ3(e.left, context, depth + 1);
        const right = convertExprToZ3(e.right, context, depth + 1);

        switch (e.op) {
            case '+': return (left as any).add(right) as any;
            case '-': return (left as any).sub(right) as any;
            case '*': return (left as any).mul(right) as any;
            case '/': return (left as any).div(right) as any;
            default: throw new Error(`Unknown operator: ${e.op}`);
        }
    }

    if (e.type === 'unary') {
        const arg = convertExprToZ3(e.argument, context, depth + 1);
        return (z3.Int.val(-1) as any).mul(arg) as any;
    }

    if (e.type === 'funccall') {
        // Function calls are not supported in verification yet
        // Create a symbolic variable for the function call result
        return z3.Const(`funccall_${e.name}`, z3.Int.sort());
    }

    if (e.type === 'arraccess') {
        // Array access is not supported in verification yet
        // Create a symbolic variable for the array access result
        return z3.Const(`arraccess_${e.name}_${e.index}`, z3.Int.sort());
    }

    if (e.type === 'ite') {
        // if-then-else expression
        const condPred = convertPredicateToZ3(e.condition, context, depth);
        const thenExpr = convertExprToZ3(e.thenExpr, context, depth + 1);
        const elseExpr = convertExprToZ3(e.elseExpr, context, depth + 1);

        // Z3 ite: if condPred then thenExpr else elseExpr
        // We need to use the ITE construct from Z3
        // Z3's ite is: Z3.ite(condition, then_expr, else_expr)
        return z3.If(condPred, thenExpr, elseExpr) as any;
    }

    throw new Error(`Unknown expr type: ${e.type}`);
}

/**
 * Доказать теорему с помощью Z3
 */
async function proveTheorem(formula: Bool, func: AnnotatedFunctionDef): Promise<void> {
    const solver = new z3.Solver();

    // Добавляем отрицание формулы в solver
    // Если NOT formula неудовлетворима (UNSAT), то formula всегда верна
    solver.add(z3.Not(formula));

    const result = await solver.check();

    if (result === 'unsat') {
        // NOT formula неудовлетворима => formula всегда верна
        return;
    }

    if (result === 'unknown') {
        // Z3 не смог определить, но это может быть нормально
        throw new Error(`Verification inconclusive for function ${func.name}: Z3 could not determine satisfiability`);
    }

    // sat - есть модель, которая делает NOT formula истинной
    // Это значит есть контрпример для formula
    const model = solver.model();

    if (model) {
        throw new Error(
            `Verification failed for function ${func.name}:\n` +
            `Postcondition violated:\n` +
            `${printFuncCall(func, model)}`
        );
    } else {
        throw new Error(`Verification failed for function ${func.name}: unknown reason`);
    }
}