import { MatchResult, Semantics } from 'ohm-js';
import { FunnyError } from '../../lab08';
import grammar from './funnier.ohm-bundle';
import * as ast from './funnier';

// Получаем semantic actions из базовой Funny грамматики
const baseSemanticsActions = require('../../lab08/out/parser').getFunnyAst;

const getFunnierAst: any = {
    ...baseSemanticsActions,

    Module(items: any) {
        const functions: any[] = [];
        const formulas: any[] = [];

        for (let i = 0; i < items.numChildren; i++) {
            const item = items.child(i).parse();
            if (item.type === 'formula') {
                formulas.push(item);
            } else {
                functions.push(item);
            }
        }

        return {
            type: 'module',
            functions,
            formulas
        } as ast.AnnotatedModule;
    },

    Formula(name: any, lp: any, params: any, rp: any, arrow: any, pred: any) {
        return {
            type: 'formula',
            name: name.sourceString,
            parameters: params.parse(),
            body: pred.parse()
        } as ast.FormulaDef;
    },

    AnnotatedFunctionDef(name: any, lp: any, params: any, rp: any, pre: any, ret: any, rets: any, post: any, uses: any, invariant: any, stmt: any) {
        const funcName = name.sourceString;
        const parameters = params.parse();
        const returns = rets.parse();
        const precondition = pre.parse && pre.parse();
        const postcondition = post.parse && post.parse();
        const locals = uses.numChildren > 0 ? uses.children[0].parse() : [];
        const body = stmt.parse();
        const inv = invariant.numChildren > 0 ? invariant.children[0].parse() : undefined;

        return {
            type: 'fun',
            name: funcName,
            parameters,
            returns,
            locals,
            body,
            precondition,
            postcondition,
            invariant: inv
        } as ast.AnnotatedFunctionDef;
    },

    PreOpt_withPredicate(req: any, pred: any) {
        return pred.parse();
    },
    PreOpt_empty() {
        return undefined;
    },

    PostOpt_withPredicate(ens: any, pred: any) {
        return pred.parse();
    },
    PostOpt_empty() {
        return undefined;
    },

    InvariantOpt_withPredicate(inv: any, pred: any) {
        return pred.parse();
    },
    InvariantOpt_empty() {
        return undefined;
    },

    Predicate(expr: any) {
        return expr.parse();
    },

    ImplyPred(left: any, rest1: any, rest2: any) {
        let result = left.parse();
        if (!rest1 || rest1.numChildren === 0) {
            return result;
        }
        for (let i = 0; i < rest1.numChildren; i++) {
            const item = rest1.child(i);
            if (!item) continue;
            const rightPart = item.child(1);
            if (!rightPart) continue;
            result = {
                kind: 'implies',
                left: result,
                right: rightPart.parse()
            };
        }
        return result;
    },

    OrPred(first: any, rest1: any, rest2: any) {
        let result = first.parse();
        if (!rest1 || rest1.numChildren === 0) {
            return result;
        }
        for (let i = 0; i < rest1.numChildren; i++) {
            const item = rest1.child(i);
            if (!item) continue;
            const rightPart = item.child(1);
            if (!rightPart) continue;
            result = {
                kind: 'or',
                left: result,
                right: rightPart.parse()
            };
        }
        return result;
    },

    AndPred(first: any, rest1: any, rest2: any) {
        let result = first.parse();
        if (!rest1 || rest1.numChildren === 0) {
            return result;
        }
        for (let i = 0; i < rest1.numChildren; i++) {
            const item = rest1.child(i);
            if (!item) continue;
            const rightPart = item.child(1);
            if (!rightPart) continue;
            result = {
                kind: 'and',
                left: result,
                right: rightPart.parse()
            };
        }
        return result;
    },

    NotPred(nots: any, atom: any) {
        let result = atom.parse();
        for (let i = 0; i < nots.numChildren; i++) {
            result = { kind: 'not', condition: result };
        }
        return result;
    },

    AtomPred_true(true_: any) {
        return { kind: 'true' };
    },

    AtomPred_false(false_: any) {
        return { kind: 'false' };
    },

    AtomPred_quantifier(q: any) {
        return q.parse();
    },

    AtomPred_comparison(c: any) {
        return c.parse();
    },

    AtomPred_paren(lp: any, pred: any, rp: any) {
        return { kind: 'paren', inner: pred.parse() };
    },

    PredComparison_eq(left: any, op: any, right: any) {
        return {
            kind: 'eq',
            left: left.parse(),
            right: right.parse()
        };
    },

    PredComparison_neq(left: any, op: any, right: any) {
        return {
            kind: 'neq',
            left: left.parse(),
            right: right.parse()
        };
    },

    PredComparison_ge(left: any, op: any, right: any) {
        return {
            kind: 'ge',
            left: left.parse(),
            right: right.parse()
        };
    },

    PredComparison_le(left: any, op: any, right: any) {
        return {
            kind: 'le',
            left: left.parse(),
            right: right.parse()
        };
    },

    PredComparison_gt(left: any, op: any, right: any) {
        return {
            kind: 'gt',
            left: left.parse(),
            right: right.parse()
        };
    },

    PredComparison_lt(left: any, op: any, right: any) {
        return {
            kind: 'lt',
            left: left.parse(),
            right: right.parse()
        };
    },

    PredComparison_formulaRef(f: any) {
        return f.parse();
    },

    PredExpr(expr: any) {
        return expr.parse();
    },

    PredTerm_length(len: any, lp: any, expr: any, rp: any) {
        const arg = expr.parse();
        return {
            type: "funccall",
            name: "length",
            args: [arg]
        };
    },

    PredTerm(expr: any) {
        return expr.parse();
    },

    Quantifier(kw: any, lp: any, param: any, pipe: any, pred: any, rp: any) {
        const kind = kw.sourceString;
        return {
            kind: kind as 'forall' | 'exists',
            variable: param.parse(),
            predicate: pred.parse()
        } as ast.Quantifier;
    },

    FormulaRef(name: any, lp: any, args: any, rp: any) {
        return {
            kind: 'formulaRef',
            name: name.sourceString,
            args: args.parse()
        } as ast.FormulaRef;
    },

    While(while_: any, lp: any, cond: any, rp: any, inv: any, stmt: any) {
        // Переопределяем While для добавления инварианта
        // Вызываем базовое правило из lab08, но добавляем инвариант
        const condition = cond.parse();
        const body = stmt.parse();
        const invariant = inv.parse && inv.parse();

        return {
            kind: 'while',
            condition,
            body,
            invariant
        };
    },

    WhileInvariantOpt_withPredicate(inv: any, lp: any, pred: any, rp: any) {
        return pred.parse();
    },
    WhileInvariantOpt_empty() {
        return undefined;
    },

    ParamListNonEmpty_void(void_: any) {
        return [];
    },

    ParamListNonEmpty_params(params: any) {
        return params.parse();
    },

    ReturnList_void(void_: any) {
        return [];
    },

    ReturnList_params(params: any) {
        return params.parse();
    },

    FunctionCallStmt(call: any, semi: any) {
        const funcCall = call.parse();
        // Преобразуем вызов функции в statement - присваивание без целей
        return {
            type: 'assign',
            targets: [],
            exprs: [funcCall]
        };
    },

    Assignment_tuple(targets: any, eq: any, exprs: any, semi: any) {
        return {
            type: 'assign',
            targets: targets.parse(),
            exprs: exprs.parse()
        };
    },

    Assignment_simple(target: any, eq: any, expr: any, semi: any) {
        return {
            type: 'assign',
            targets: [target.parse()],
            exprs: [expr.parse()]
        };
    }
};

export const semantics = grammar.Funnier.createSemantics();
semantics.addOperation("parse()", getFunnierAst);

export function parseFunnier(source: string): ast.AnnotatedModule {
    const matchResult = grammar.Funnier.match(source, 'Module');

    if (!matchResult.succeeded()) {
        throw new FunnyError(matchResult.message || 'Syntax error', 'SYNTAX_ERROR');
    }

    const module = semantics(matchResult).parse();

    return module;
}
