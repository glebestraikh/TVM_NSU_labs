import { Expr, NumConst, Variable, BinaryOp, UnaryMinus } from "../../lab04";

export function cost(e: Expr): number {
    switch (e.type) {
        case 'const':
            return 0;

        case 'var':
            return 1;

        case 'unary':
            const unaryExpr = e as UnaryMinus;
            return 1 + cost(unaryExpr.argument);

        case 'binop':
            const binopExpr = e as BinaryOp;
            return 1 + cost(binopExpr.left) + cost(binopExpr.right);

        default:
            throw new Error(`Unknown expression type: ${(e as any).type}`);
    }
}
