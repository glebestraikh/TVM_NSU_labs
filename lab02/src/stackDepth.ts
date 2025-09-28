import { ReversePolishNotationActionDict } from "./rpn.ohm-bundle";


export const rpnStackDepth = {
    RpnExp_add(left, right, _operator) {
        const leftDepth = left.stackDepth;
        const rightDepth = right.stackDepth;

        const maxDuringLeft = leftDepth.max;
        const maxDuringRight = leftDepth.out + rightDepth.max;

        const finalStackSize = leftDepth.out + rightDepth.out - 2 + 1;
        return {
            max: Math.max(maxDuringLeft, maxDuringRight),
            out: finalStackSize
        };
    },

    RpnExp_mul(left, right, _operator) {
        const leftDepth = left.stackDepth;
        const rightDepth = right.stackDepth;

        const maxDuringLeft = leftDepth.max;
        const maxDuringRight = leftDepth.out + rightDepth.max;


        const finalStackSize = leftDepth.out + rightDepth.out - 2 + 1;
        return {
            max: Math.max(maxDuringLeft, maxDuringRight),
            out: finalStackSize
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
