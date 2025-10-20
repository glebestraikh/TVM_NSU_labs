import { Expr, NumConst, Variable, BinaryOp, UnaryMinus } from "../../lab04";

export function derive(e: Expr, varName: string): Expr {
    switch (e.type) {
        case 'const':
            // d/dx(c) = 0
            return makeConst(0);

        case 'var':
            const varExpr = e as Variable;
            // d/dx(x) = 1, d/dx(y) = 0
            return makeConst(varExpr.name === varName ? 1 : 0);

        case 'unary':
            const unaryExpr = e as UnaryMinus;
            // d/dx(-f) = -(d/dx(f))
            const derivedArg = derive(unaryExpr.argument, varName);
            return simplifyUnary(derivedArg);

        case 'binop':
            const binopExpr = e as BinaryOp;
            const left = binopExpr.left;
            const right = binopExpr.right;

            switch (binopExpr.op) {
                case '+':
                    // d/dx(f + g) = d/dx(f) + d/dx(g)
                    return simplifyAdd(derive(left, varName), derive(right, varName));

                case '-':
                    // d/dx(f - g) = d/dx(f) - d/dx(g)
                    return simplifySub(derive(left, varName), derive(right, varName));

                case '*':
                    // d/dx(f * g) = f' * g + f * g' (правило произведения)
                    const leftDeriv = derive(left, varName);
                    const rightDeriv = derive(right, varName);
                    return simplifyAdd(
                        simplifyMul(leftDeriv, right),
                        simplifyMul(left, rightDeriv)
                    );

                case '/':
                    // d/dx(f / g) = (f' * g - f * g') / g^2 (правило частного)
                    const fPrime = derive(left, varName);
                    const gPrime = derive(right, varName);
                    const numerator = simplifySub(
                        simplifyMul(fPrime, right),
                        simplifyMul(left, gPrime)
                    );
                    const denominator = simplifyMul(right, right);
                    return simplifyDiv(numerator, denominator);

                default:
                    throw new Error(`Unknown operator: ${binopExpr.op}`);
            }

        default:
            throw new Error(`Unknown expression type: ${(e as any).type}`);
    }
}

function isZero(e: Expr): boolean {
    return e.type === 'const' && (e as NumConst).value === 0;
}

function isOne(e: Expr): boolean {
    return e.type === 'const' && (e as NumConst).value === 1;
}


function makeConst(value: number): NumConst {
    return { type: 'const', value };
}

function makeBinOp(op: '+' | '-' | '*' | '/', left: Expr, right: Expr): BinaryOp {
    return { type: 'binop', op, left, right };
}

function makeUnary(arg: Expr): UnaryMinus {
    return { type: 'unary', op: '-', argument: arg };
}

function simplifyUnary(arg: Expr): Expr {
    // --x = x
    if (arg.type === 'unary') {
        return (arg as UnaryMinus).argument;
    }

    // -0 = 0
    if (isZero(arg)) {
        return makeConst(0);
    }

    // -(константа) = -константа
    if (arg.type === 'const') {
        return makeConst(-(arg as NumConst).value);
    }

    // -(neg_const / expr) = pos_const / expr
    if (arg.type === 'binop') {
        const binop = arg as BinaryOp;
        if (binop.op === '/' && binop.left.type === 'const') {
            const leftConst = binop.left as NumConst;
            if (leftConst.value < 0) {
                return makeBinOp('/', makeConst(-leftConst.value), binop.right);
            }
        }
    }

    return makeUnary(arg);
}


function simplifyAdd(left: Expr, right: Expr): Expr {
    // 0 + x = x
    if (isZero(left)) {
        return right;
    }

    // x + 0 = x
    if (isZero(right)) {
        return left;
    }

    // Константы складываем
    if (left.type === 'const' && right.type === 'const') {
        return makeConst((left as NumConst).value + (right as NumConst).value);
    }

    return makeBinOp('+', left, right);
}

function simplifySub(left: Expr, right: Expr): Expr {
    // x - 0 = x
    if (isZero(right)) {
        return left;
    }

    // 0 - x = -x
    if (isZero(left)) {
        return simplifyUnary(right);
    }

    // Константы вычитаем
    if (left.type === 'const' && right.type === 'const') {
        return makeConst((left as NumConst).value - (right as NumConst).value);
    }

    return makeBinOp('-', left, right);
}

function simplifyMul(left: Expr, right: Expr): Expr {
    // x * 0 = 0
    if (isZero(left) || isZero(right)) {
        return makeConst(0);
    }

    // 1 * x = x
    if (isOne(left)) {
        return right;
    }

    // x * 1 = x
    if (isOne(right)) {
        return left;
    }

    // Константы умножаем
    if (left.type === 'const' && right.type === 'const') {
        return makeConst((left as NumConst).value * (right as NumConst).value);
    }

    return makeBinOp('*', left, right);
}

function simplifyDiv(left: Expr, right: Expr): Expr {
    // x / 1 = x
    if (isOne(right)) {
        return left;
    }

    // 0 / x = 0
    if (isZero(left)) {
        return makeConst(0);
    }

    // Константы делим
    if (left.type === 'const' && right.type === 'const') {
        const rightVal = (right as NumConst).value;
        if (rightVal === 0) {
            // Оставляем деление на ноль как есть - оно вызовет ошибку при выполнении
            return makeBinOp('/', left, right);
        }
        return makeConst(Math.floor((left as NumConst).value / rightVal));
    }

    return makeBinOp('/', left, right);
}