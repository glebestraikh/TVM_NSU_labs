import { MatchResult } from "ohm-js";
import grammar, { ArithmeticActionDict, ArithmeticSemantics } from "./arith.ohm-bundle";

export const arithSemantics: ArithSemantics = grammar.createSemantics() as ArithSemantics;

const arithCalc = {
    number_number(_digits) {
        return parseInt(this.sourceString);
    },

    number_variable(_variable) {
        const varName = this.sourceString;

        return this.args.params[varName] ?? NaN;
    },

    Sum(sumNode) {
        const values = sumNode.asIteration().children.map(child =>
            child.calculate(this.args.params)
        );

        let result = values[0];
        for (let i = 1; i < values.length; i++) {
            result += values[i];
        }
        return result;
    },

    Sub(subNode) {
        const values = subNode.asIteration().children.map(child =>
            child.calculate(this.args.params)
        );

        let result = values[0];
        for (let i = 1; i < values.length; i++) {
            result -= values[i];
        }
        return result;
    },

    Mul(mulNode) {
        const values = mulNode.asIteration().children.map(child =>
            child.calculate(this.args.params)
        );

        let result = values[0];
        for (let i = 1; i < values.length; i++) {
            result *= values[i];
        }
        return result;
    },

    Div(divNode) {
        const values = divNode.asIteration().children.map(child =>
            child.calculate(this.args.params)
        );

        let result = values[0];
        for (let i = 1; i < values.length; i++) {
            if (values[i] == 0)
                throw new Error(`Division by zero`);
            result /= values[i];
        }
        return result;
    },

    Atom_parenthesis(_openParen, innerExpr, _closeParen) {
        return innerExpr.calculate(this.args.params);
    },

    UnaryMin(minusesNode, atomNode) {
        const minusCount = minusesNode.children.length;
        const atom = atomNode.calculate(this.args.params);

        if (minusCount % 2 === 1) {
            return -atom;
        }
        return atom;
    }
} satisfies ArithmeticActionDict<number | undefined>;

arithSemantics.addOperation<number>("calculate(params)", arithCalc);

export interface ArithActions {
    calculate(params: { [name: string]: number }): number;
}

export interface ArithSemantics extends ArithmeticSemantics {
    (match: MatchResult): ArithActions;
}
