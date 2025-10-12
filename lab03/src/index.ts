import { MatchResult } from "ohm-js";
import grammar from "./arith.ohm-bundle";
import { arithSemantics } from "./calculate";

export const arithGrammar = grammar;
export { ArithmeticActionDict, ArithmeticSemantics } from './arith.ohm-bundle';

export function evaluate(content: string, params?: { [name: string]: number }): number {
    return calculate(parse(content), params ?? {});
}

export function parse(content: string): MatchResult {
    const match = grammar.match(content);

    if (match.failed()) {
        throw new SyntaxError(match.message ?? "Syntax error");
    }

    return match;
}

function calculate(expression: MatchResult, params: { [name: string]: number }): number {
    const semantics = arithSemantics(expression);
    return semantics.calculate(params);
}

export class SyntaxError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SyntaxError";
    }
}
