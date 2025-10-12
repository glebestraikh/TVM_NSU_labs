export type Expr =
    | NumConst
    | Variable
    | BinaryOp
    | UnaryMinus;

// Числовая константа
export interface NumConst {
    type: 'const';
    value: number;
}

// Переменная
export interface Variable {
    type: 'var';
    name: string;
}

// Бинарные операции: +, -, *, /
export interface BinaryOp {
    type: 'binop';
    op: '+' | '-' | '*' | '/';
    left: Expr;
    right: Expr;
}

// Унарный минус
export interface UnaryMinus {
    type: 'unary';
    op: '-';
    argument: Expr;
}