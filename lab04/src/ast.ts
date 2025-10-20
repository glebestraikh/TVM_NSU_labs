export type Expr =
    | NumConst
    | Variable
    | BinaryOp
    | UnaryMinus;

export interface NumConst {
    type: 'const';
    value: number;
}

export interface Variable {
    type: 'var';
    name: string;
}

export interface BinaryOp {
    type: 'binop';
    op: '+' | '-' | '*' | '/';
    left: Expr;
    right: Expr;
}

export interface UnaryMinus {
    type: 'unary';
    op: '-';
    argument: Expr;
}
