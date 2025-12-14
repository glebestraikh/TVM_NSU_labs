import * as arith from "../../lab04";

// корневой узел AST
export interface Module {
    type: 'module';
    functions: FunctionDef[];
}

// 	FunctionDef описывает функцию
export interface FunctionDef {
    type: 'fun';
    name: string;
    parameters: ParameterDef[];
    returns: ParameterDef[];
    locals: ParameterDef[];
    body: Statement;
}

// ParameterDef описывает имя и тип переменной
export interface ParameterDef {
    type: "param";
    name: string;
    varType?: 'int' | 'int[]';
}

// Statements
export type Statement = AssignStmt | BlockStmt | ConditionalStmt | WhileStmt;

// Присваивание
export interface AssignStmt {
    type: "assign";
    targets: LValue[];
    exprs: Expr[];
}

//  интерфейс для блочного оператора в AST 
// указывает, что узел представляет блок кода, заключённый в { ... }
export interface BlockStmt {
    type: "block";
    stmts: Statement[];
}

// ConditionalStmt — if (cond) then else
export interface ConditionalStmt {
    type: "if";
    condition: Condition;
    then: Statement;
    else: Statement | null;
}

// WhileStmt — цикл while (cond) body
export interface WhileStmt {
    type: "while";
    condition: Condition;
    body: Statement;
}

// левая часть присваивания
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

// Выражения
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

// интерфейс для скобочного условия в AST
export interface ParenCond {
    kind: "paren";
    inner: Condition;
}