import * as arith from "../../lab04";

export interface Module {
    type: 'module';
    functions: FunctionDef[];
}

export interface FunctionDef {
    type: 'fun';
    name: string;
    parameters: ParameterDef[];
    returns: ParameterDef[];
    locals: ParameterDef[];
    body: Statement;
}

export interface ParameterDef {
    type: "param";
    name: string;
    varType?: 'int' | 'int[]';
}

// Statements
export type Statement = AssignStmt | BlockStmt | ConditionalStmt | WhileStmt;

export interface AssignStmt {
    type: "assign";
    targets: LValue[];
    exprs: Expr[];
}

export interface BlockStmt {
    type: "block";
    stmts: Statement[];
}

export interface ConditionalStmt {
    type: "if";
    condition: Condition;
    then: Statement;
    else: Statement | null;
}

export interface WhileStmt {
    type: "while";
    condition: Condition;
    body: Statement;
}

// LValues
export type LValue = VarLValue | ArrLValue;

export interface VarLValue {
    type: "lvar";
    name: string;
}

export interface ArrLValue {
    type: "larr";
    name: string;
    index: Expr;
}

// Expressions
export type Expr = arith.Expr | FuncCallExpr | ArrAccessExpr;

export interface FuncCallExpr {
    type: "funccall";
    name: string;
    args: Expr[];
}

export interface ArrAccessExpr {
    type: "arraccess";
    name: string;
    index: Expr;
}

// Conditions
export type Condition = TrueCond | FalseCond | ComparisonCond | NotCond | AndCond | OrCond | ImpliesCond | ParenCond;

export interface TrueCond {
    kind: "true";
}

export interface FalseCond {
    kind: "false";
}

export interface ComparisonCond {
    kind: "comparison";
    left: Expr;
    op: "==" | "!=" | ">" | "<" | ">=" | "<=";
    right: Expr;
}

export interface NotCond {
    kind: "not";
    condition: Condition;
}

export interface AndCond {
    kind: "and";
    left: Condition;
    right: Condition;
}

export interface OrCond {
    kind: "or";
    left: Condition;
    right: Condition;
}

export interface ImpliesCond {
    kind: "implies";
    left: Condition;
    right: Condition;
}

export interface ParenCond {
    kind: "paren";
    inner: Condition;
}