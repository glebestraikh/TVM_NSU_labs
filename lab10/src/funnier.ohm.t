
Funnier <: Funny {
    Module := (Formula | AnnotatedFunctionDef)+

    Formula = identifier "(" ParamList ")" "=>" Predicate

    Type := "void"
          | "int" "[" "]" -- array
          | "int" -- int

    ParamListNonEmpty := "void" -- void
                       | NonemptyListOf<Param, ","> -- params

    AnnotatedFunctionDef = identifier "(" ParamList ")" PreOpt "returns" ReturnList PostOpt UsesOpt? InvariantOpt Statement
    
    ReturnList = "void" -- void
               | ParamListNonEmpty -- params
    
    Statement := FunctionCallStmt
                | Assignment
                | Block
                | Conditional
                | While

    FunctionCallStmt = FunctionCall ";"

    Assignment := LValueList "=" ExprList ";" -- tuple
                | LValue "=" Sum ";" -- simple
    
    PreOpt = "requires" Predicate  -- withPredicate
           |                        -- empty
    PostOpt = "ensures" Predicate  -- withPredicate
            |                       -- empty
    InvariantOpt = "invariant" Predicate  -- withPredicate
                |                         -- empty

    While := "while" "(" Condition ")" WhileInvariantOpt Statement
    
    WhileInvariantOpt = "invariant" "(" Predicate ")"  -- withPredicate
                     |                                  -- empty

    Predicate = ImplyPred

    ImplyPred = OrPred ("->" ImplyPred)?

    OrPred = AndPred ("or" AndPred)*

    AndPred = NotPred ("and" NotPred)*

    NotPred = "not"* AtomPred

    AtomPred = "true" -- true
             | "false" -- false
             | Quantifier -- quantifier
             | PredComparison -- comparison
             | "(" Predicate ")" -- paren

    PredComparison = PredExpr "==" PredExpr -- eq
                   | PredExpr "!=" PredExpr -- neq
                   | PredExpr ">=" PredExpr -- ge
                   | PredExpr "<=" PredExpr -- le
                   | PredExpr ">" PredExpr -- gt
                   | PredExpr "<" PredExpr -- lt
                   | FormulaRef -- formulaRef

    PredExpr = PredTerm
    
    PredTerm = "length" "(" PredExpr ")" -- length
             | Sum

    Quantifier = ("forall" | "exists") "(" Param "|" Predicate ")"
    
    FormulaRef = identifier "(" ArgList ")"

    keyword := keyword | "requires" | "ensures" | "invariant" | "forall" | "exists" | "=>"
}

