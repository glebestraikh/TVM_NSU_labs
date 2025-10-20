import { Expr, BinaryOp } from "./ast";

const precedence: { [op: string]: number } = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2
};

export function printExpr(e: Expr, parentOp?: string, isRightChild: boolean = false): string {
    switch (e.type) {
        case 'const':
            return e.value.toString();

        case 'var':
            return e.name;

        case 'unary': {
            const arg = printExpr(e.argument, e.op, false);
            return `-${arg}`;
        }

        case 'binop': {
            const needsParens = parentOp !== undefined && (
                // Если приоритет текущей операции ниже родительской, пример (a * (b + c))
                precedence[parentOp] > precedence[e.op] ||
                // Или если приоритеты равны, но мы правый потомок:
                (precedence[parentOp] === precedence[e.op] && isRightChild && (
                    // операции разные, пример (a - (b + c))
                    parentOp !== e.op ||
                    // операция левоассоциативны (- или /), пример (a - (b - c))
                    parentOp === '-' || parentOp === '/'
                ))
            );

            const left = printExpr(e.left, e.op, false);
            const right = printExpr(e.right, e.op, true);
            const result = `${left} ${e.op} ${right}`;

            return needsParens ? `(${result})` : result;
        }
    }
}