import { ReversePolishNotationActionDict } from "./rpn.ohm-bundle";

export const rpnCalc = {
    RpnExp_add(left, right, _operator) {
        return left.calculate() + right.calculate();
    },

    RpnExp_mul(left, right, _operator) {
        return left.calculate() * right.calculate()
    },

    RpnExp(expr) {
        return expr.calculate()
    },

    number(_digits) {
        return parseInt(this.sourceString, 10);
    }
} satisfies ReversePolishNotationActionDict<number>;

