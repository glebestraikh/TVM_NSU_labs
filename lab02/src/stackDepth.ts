import { ReversePolishNotationActionDict } from "./rpn.ohm-bundle";


export const rpnStackDepth = {
    RpnExp_add(left, right, _operator) {
        const leftDepth = left.stackDepth;
        const rightDepth = right.stackDepth;

        return {
            max: leftDepth.out + rightDepth.max,
            out: leftDepth.out + rightDepth.out - 2 + 1
        };
    },

    RpnExp_mul(left, right, _operator) {
        const leftDepth = left.stackDepth;
        const rightDepth = right.stackDepth;

        return {
            max: leftDepth.out + rightDepth.max,
            out: leftDepth.out + rightDepth.out - 2 + 1
        };
    },

    RpnExp(expr) {
        return expr.stackDepth;
    },

    number(_digits) {
        return {
            max: 1,
            out: 1
        };
    }
} satisfies ReversePolishNotationActionDict<StackDepth>;
export type StackDepth = { max: number, out: number };
