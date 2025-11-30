import { Module, FunctionDef, Condition, Statement as BaseStatement } from '../../lab08';

export interface AnnotatedModule extends Module {
    formulas?: FormulaDef[];
}

export interface AnnotatedFunctionDef extends FunctionDef {
    precondition?: Predicate;
    postcondition?: Predicate;
    invariant?: Predicate;
}

export interface FormulaDef {
    type: 'formula';
    name: string;
    parameters: { type: "param"; name: string; varType?: 'int' | 'int[]' }[];
    body: Predicate;
}

export interface WhileStmtWithInvariant {
    kind: 'while';
    condition: Condition;
    body: Statement;
    invariant?: Predicate;
}

export type Statement = BaseStatement | WhileStmtWithInvariant;

export type Predicate = Condition | Quantifier | FormulaRef;

export interface Quantifier {
    kind: 'forall' | 'exists';
    variable: { type: "param"; name: string; varType?: 'int' | 'int[]' };
    predicate: Predicate;
}

export interface FormulaRef {
    kind: 'formulaRef';
    name: string;
    args: any[];
}
