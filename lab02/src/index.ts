import grammar from "./rpn.ohm-bundle";
import { rpnSemantics } from "./semantics";

export function evaluate(source: string): number {
    const match = grammar.match(source);
    if (match.failed()) {
        throw new SyntaxError(`Parse error: ${match.message}`);
    }

    const semantics = rpnSemantics(match);
    return semantics.calculate();
}

export function maxStackDepth(source: string): number {
    const match = grammar.match(source);
    if (match.failed()) {
        throw new SyntaxError(`Parse error: ${match.message}`);
    }

    const semantics = rpnSemantics(match);
    return semantics.stackDepth.max;
}

export class SyntaxError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SyntaxError';
    }
}