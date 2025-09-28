import { Dict, MatchResult, Semantics } from "ohm-js";
import grammar, { AddMulActionDict } from "./addmul.ohm-bundle";

export const addMulSemantics: AddMulSemantics = grammar.createSemantics() as AddMulSemantics;

const addMulCalc = {
    AddExpr_add(left, _op, right) {
        return left.calculate() + right.calculate();
    },

    AddExpr(expr) {
        return expr.calculate();
    },

    MulExpr_mul(left, _op, right) {
        return left.calculate() * right.calculate();
    },

    MulExpr(expr) {
        return expr.calculate();
    },

    PrimExpr_paren(_open, expr, _close) {
        return expr.calculate();
    },

    PrimExpr(expr) {
        return expr.calculate();
    },

    number(digits) {
        return parseInt(this.sourceString, 10);
    }
} satisfies AddMulActionDict<number>

addMulSemantics.addOperation<number>("calculate()", addMulCalc);

interface AddMulDict extends Dict {
    calculate(): number;
}

interface AddMulSemantics extends Semantics {
    (match: MatchResult): AddMulDict;
}