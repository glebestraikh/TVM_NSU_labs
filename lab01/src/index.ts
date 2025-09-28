import { MatchResult } from "ohm-js";
import { addMulSemantics } from "./calculate";
import grammar from "./addmul.ohm-bundle";

export function evaluate(content: string): number {
    return calculate(parse(content));
}

export class SyntaxError extends Error { }

function parse(content: string): MatchResult {
    const match = grammar.match(content);
    if (match.failed()) {
        throw new SyntaxError(`Syntax error: ${match.message}`);
    }
    return match;
}

function calculate(expression: MatchResult): number {
    const semantics = addMulSemantics(expression);
    return semantics.calculate();
}