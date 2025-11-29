
Funny <: Arithmetic {
    Module = Function+

    Function = identifier "(" ParamList ")" "returns" ParamListNonEmpty UsesOpt? Statement

    ParamList = ListOf<Param, ",">
    ParamListNonEmpty = NonemptyListOf<Param, ",">
    Param = identifier ":" Type

    UsesOpt = "uses" ParamList

    Type = "int" "[" "]" -- array
         | "int" -- int

    Statement = Assignment
              | Block
              | Conditional
              | While

    Assignment = LValueList "=" ExprList ";" -- tuple
               | LValue "=" AddExpr ";" -- simple

    LValueList = NonemptyListOf<LValue, ",">
    ExprList = NonemptyListOf<AddExpr, ",">

    LValue = identifier "[" AddExpr "]" -- array
           | identifier -- variable

    Block = "{" Statement* "}"

    Conditional = "if" "(" Condition ")" Statement ("else" Statement)?

    While = "while" "(" Condition ")" Statement

    AddExpr = Sum

    Atom := FunctionCall
           | ArrayAccess
           | "(" Sum ")" -- parenthesis
           | number

    FunctionCall = identifier "(" ArgList ")"
    ArgList = ListOf<AddExpr, ",">

    ArrayAccess = identifier "[" AddExpr "]"

    identifier = ~keyword (letter | "_") (letter | digit | "_")*


    Condition = ImplyCond

    ImplyCond = OrCond ("->" ImplyCond)?

    OrCond = AndCond ("or" AndCond)*

    AndCond = NotCond ("and" NotCond)*

    NotCond = "not"* AtomCond

    AtomCond = "true" -- true
             | "false" -- false
             | Comparison -- comparison
             | "(" Condition ")" -- paren

    Comparison = AddExpr "==" AddExpr -- eq
               | AddExpr "!=" AddExpr -- neq
               | AddExpr ">=" AddExpr -- ge
               | AddExpr "<=" AddExpr -- le
               | AddExpr ">" AddExpr -- gt
               | AddExpr "<" AddExpr -- lt


    space += comment
    comment = "//" (~"\n" any)* ("\n" | end)

    keyword = "if" | "else" | "while" | "returns" | "uses" | "int"
            | "true" | "false" | "and" | "or" | "not"
}