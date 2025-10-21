import { Expr } from "../../lab04";
import { cost } from "./cost";

type Op = '+' | '-' | '*' | '/';

function makeBinOp(op: '+' | '-' | '*' | '/', left: Expr, right: Expr): Expr {
    return { type: 'binop', op, left, right };
}

function makeUnary(arg: Expr): Expr {
    return { type: 'unary', op: '-', argument: arg };
}

function eq(a: Expr, b: Expr): boolean {
    if (a.type !== b.type) return false;
    switch (a.type) {
        case "const": return b.type === "const" && a.value === b.value;
        case "var": return b.type === "var" && a.name === (b as any).name;
        case "unary": return b.type === "unary" && eq(a.argument, (b as any).arg);
        case "binop":
            return b.type === "binop" &&
                a.op === (b as any).op &&
                eq(a.left, (b as any).left) &&
                eq(a.right, (b as any).right);
    }
}

function encode(e: Expr): string {
    switch (e.type) {
        case "const": return `#${e.value}`;
        case "var": return `$${e.name}`;
        case "unary": return `~(${encode(e.argument)})`;
        case "binop": return `(${encode(e.left)}${e.op}${encode(e.right)})`;
    }
}

type Env = Record<string, Expr>;

function match(pattern: Expr, expr: Expr, env: Env = {}): Env | null {
    switch (pattern.type) {
        case "const":
            return (expr.type === "const" && expr.value === pattern.value) ? env : null;

        case "var": {
            const name = pattern.name;
            const bound = env[name];
            if (!bound) {
                return { ...env, [name]: expr };
            } else {
                return eq(bound, expr) ? env : null;
            }
        }

        case "unary":
            if (expr.type !== "unary") return null;
            return match(pattern.argument, expr.argument, env);

        case "binop":
            if (expr.type !== "binop" || expr.op !== pattern.op) return null;
            const envL = match(pattern.left, expr.left, env);
            return envL ? match(pattern.right, expr.right, envL) : null;
    }
}

function substitute(template: Expr, env: Env): Expr {
    switch (template.type) {
        case "const": return template;
        case "var": {
            const bound = env[template.name];
            return bound ?? template;
        }
        case "unary": return makeUnary(substitute(template.argument, env));
        case "binop": return makeBinOp(template.op as Op, substitute(template.left, env), substitute(template.right, env));
    }
}

type Rebuilder = (replacement: Expr) => Expr;
function* contexts(e: Expr): Generator<[Expr, Rebuilder]> {
    yield [e, (r: Expr) => r];

    switch (e.type) {
        case "const":
        case "var":
            return;

        case "unary":
            for (const [sub, rebuild] of contexts(e.argument)) {
                yield [sub, (r: Expr) => rebuild(makeUnary(r))];
            }
            return;

        case "binop":
            for (const [subL, rebuildL] of contexts(e.left)) {
                yield [subL, (r: Expr) => rebuildL(makeBinOp(e.op as Op, r, e.right))];
            }
            for (const [subR, rebuildR] of contexts(e.right)) {
                yield [subR, (r: Expr) => rebuildR(makeBinOp(e.op as Op, e.left, r))];
            }
            return;
    }
}

export function simplify(e: Expr, identities: [Expr, Expr][]): Expr {
    const seen = new Set<string>();
    const worklist: Expr[] = [e];
    let best: Expr = e;
    let bestCost = cost(e);

    while (worklist.length) {
        const cur = worklist.shift()!;
        const key = encode(cur);
        if (seen.has(key)) continue;
        seen.add(key);

        const c = cost(cur);
        if (c < bestCost) {
            best = cur;
            bestCost = c;
        }

        for (const [lhs, rhs] of identities) {
            for (const [sub, rebuild] of contexts(cur)) {
                const env = match(lhs, sub);
                if (env) {
                    const repl = substitute(rhs, env);
                    const next = rebuild(repl);
                    const k2 = encode(next);
                    if (!seen.has(k2)) worklist.push(next);
                }
            }
        }
    }

    return best;
}