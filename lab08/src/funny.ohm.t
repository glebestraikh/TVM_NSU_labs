
Funny <: Arithmetic {
    Module = Function+

    Function = identifier "(" ParamList ")" "returns" ParamListNonEmpty UsesOpt? Statement // определение функции

    UsesOpt = "uses" ParamList // локальная(ые) переменная(ые) функции 

    ParamList = ListOf<Param, ","> // список параметров функции
    ParamListNonEmpty = NonemptyListOf<Param, ","> // непустой список параметров функции
    Param = identifier ":" Type // параметр функции с указанием типа

    Type = "int" "[" "]" -- array
         | "int" -- int

    While = "while" "(" Condition ")" Statement

    Conditional = "if" "(" Condition ")" Statement ("else" Statement)?

    Block = "{" Statement* "}"

    Statement = Assignment
            | Block
            | Conditional
            | While

    Assignment = LValueList "=" ExprList ";" -- tuple
        | LValue "=" AddExpr ";" -- simple


    LValueList = NonemptyListOf<LValue, ",">
    LValue = identifier "[" AddExpr "]" -- array
        | identifier -- variable

    ExprList = NonemptyListOf<AddExpr, ",">

    Atom := FunctionCall
        | ArrayAccess
        | "(" Sum ")" -- parenthesis
        | number

    AddExpr = Sum

    FunctionCall = identifier "(" ArgList ")" // вызов функции
    ArgList = ListOf<AddExpr, ","> // список аргументов

    ArrayAccess = identifier "[" AddExpr "]" // доступ к элементу массива

    identifier = ~keyword (letter | "_") (letter | digit | "_")* // идентификаторы

    AtomCond = "true" -- true // атомарные условия
             | "false" -- false
             | Comparison -- comparison
             | "(" Condition ")" -- paren

    Condition = ImplyCond

    ImplyCond = OrCond ("->" ImplyCond)?

    OrCond = AndCond ("or" AndCond)*

    AndCond = NotCond ("and" NotCond)*

    NotCond = "not"* AtomCond

    Comparison = AddExpr "==" AddExpr -- eq
               | AddExpr "!=" AddExpr -- neq
               | AddExpr ">=" AddExpr -- ge
               | AddExpr "<=" AddExpr -- le
               | AddExpr ">" AddExpr -- gt
               | AddExpr "<" AddExpr -- lt


    space += comment // Кроме обычных whitespace, теперь коммент тоже считается пробелом
    comment = "//" (~"\n" any)* ("\n" | end)

    keyword = "if" | "else" | "while" | "returns" | "uses" | "int"
            | "true" | "false" | "and" | "or" | "not" // зарезервированные слова для условий
}