import { Expr, BinaryOp } from "./ast";

// Приоритеты операций (чем больше, тем выше приоритет)
const precedence: { [op: string]: number } = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2
};

// Левая ассоциативность для всех операций
const isLeftAssociative = (op: string): boolean => {
    return true; // все наши операции левоассоциативны
};

export function printExpr(e: Expr, parentOp?: string, isRightChild: boolean = false): string {
    switch (e.type) {
        case 'const':
            return e.value.toString();

        case 'var':
            return e.name;

        case 'unary': {
            const arg = printExpr(e.argument, e.op, false);
            // Унарный минус имеет высокий приоритет, скобки нужны только для другого унарного минуса
            // или если аргумент сам является выражением с низким приоритетом
            if (e.argument.type === 'binop') {
                return `-${arg}`;
            }
            return `-${arg}`;
        }

        case 'binop': {
            const currentPrec = precedence[e.op];
            const needsParens = parentOp !== undefined && (
                // Если приоритет текущей операции ниже родительской
                precedence[parentOp] > currentPrec ||
                // Или если приоритеты равны, но мы правый потомок и:
                (precedence[parentOp] === currentPrec && isRightChild && (
                    // операции разные ИЛИ
                    parentOp !== e.op ||
                    // операция некоммутативная (- или /)
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