Funnier <: Funny { // Funnier - дополнение над грамматикой Funny
    // Модуль состоит из одной или нескольких единиц
    // Аннотированные функции (AnnotatedFunctionDef)
    Module := (Formula | AnnotatedFunctionDef)+

    /*
    •	Формула имеет:
	•	Имя (identifier)
	•	Параметры (ParamList) — можно пустым
	•	Тело (Predicate) после =>
    formula allPositive(arr: int[]) => forall(i: int | arr[i] > 0);
    */
    Formula = identifier "(" ParamList ")" "=>" Predicate

    Type := "void"
          | "int" "[" "]" -- array
          | "int" -- int

    ParamListNonEmpty := "void" -- void
                       | NonemptyListOf<Param, ","> -- params

    //  Определение функции
    /*
	•	Имя (identifier)
	•	Параметры (ParamList)
	•	Предусловие (PreOpt — опционально)
	•	Возвращаемые значения (ReturnList)
	•	Постусловие (PostOpt — опционально)
	•	Используемые локальные переменные (UsesOpt? — опционально)
	•	Инвариант цикла (InvariantOpt — опционально)
	•	Тело функции (Statement)
    */
    AnnotatedFunctionDef = identifier "(" ParamList ")" PreOpt "returns" ReturnList PostOpt UsesOpt? InvariantOpt Statement
    
    ReturnList = "void" -- void
               | ParamListNonEmpty -- params
    
    Statement := FunctionCallStmt
                | Assignment
                | Block
                | Conditional
                | While

    FunctionCallStmt = FunctionCall ";"
    
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