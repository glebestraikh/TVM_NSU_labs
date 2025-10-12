import { MatchResult } from 'ohm-js';
import { arithGrammar, ArithmeticActionDict, ArithmeticSemantics, SyntaxError } from '../../lab03';
import { Expr, BinaryOp, NumConst, Variable, UnaryMinus } from './ast';

export const getExprAst: ArithmeticActionDict<Expr> = {
    number_number(_digits) {
        const value = parseInt(this.sourceString);
        return { type: 'const', value } as NumConst;
    },

    number_variable(_variable) {
        const name = this.sourceString;
        return { type: 'var', name } as Variable;
    },

    Sum(sumNode) {
        const nodes = sumNode.asIteration().children;
        let result = nodes[0].parse();

        for (let i = 1; i < nodes.length; i++) {
            const right = nodes[i].parse();
            result = {
                type: 'binop',
                op: '+',
                left: result,
                right: right
            } as BinaryOp;
        }

        return result;
    },

    Sub(subNode) {
        const nodes = subNode.asIteration().children;
        let result = nodes[0].parse();

        for (let i = 1; i < nodes.length; i++) {
            const right = nodes[i].parse();
            result = {
                type: 'binop',
                op: '-',
                left: result,
                right: right
            } as BinaryOp;
        }

        return result;
    },

    Mul(mulNode) {
        const nodes = mulNode.asIteration().children;
        let result = nodes[0].parse();

        for (let i = 1; i < nodes.length; i++) {
            const right = nodes[i].parse();
            result = {
                type: 'binop',
                op: '*',
                left: result,
                right: right
            } as BinaryOp;
        }

        return result;
    },

    Div(divNode) {
        const nodes = divNode.asIteration().children;
        let result = nodes[0].parse();

        for (let i = 1; i < nodes.length; i++) {
            const right = nodes[i].parse();
            result = {
                type: 'binop',
                op: '/',
                left: result,
                right: right
            } as BinaryOp;
        }

        return result;
    },

    Atom_parenthesis(_openParen, innerExpr, _closeParen) {
        return innerExpr.parse();
    },

    UnaryMin(minusesNode, atomNode) {
        const minusCount = minusesNode.children.length;
        let result = atomNode.parse();

        // Применяем унарные минусы справа налево
        for (let i = 0; i < minusCount; i++) {
            result = {
                type: 'unary',
                op: '-',
                argument: result
            } as UnaryMinus;
        }

        return result;
    }
};

export const semantics = arithGrammar.createSemantics();
semantics.addOperation("parse()", getExprAst);

export interface ArithSemanticsExt extends ArithmeticSemantics {
    (match: MatchResult): ArithActionsExt;
}

export interface ArithActionsExt {
    parse(): Expr;
}

export function parseExpr(source: string): Expr {
    const match = arithGrammar.match(source);

    if (match.failed()) {
        throw new SyntaxError(match.message || "Parse error");
    }

    const sem = semantics as ArithSemanticsExt;
    return sem(match).parse();
}