
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
        | LValue "=" Sum ";" -- simple


    LValueList = NonemptyListOf<LValue, ",">
    LValue = identifier "[" Sum "]" -- array
        | identifier -- variable

    ExprList = NonemptyListOf<Sum, ",">

    Atom := FunctionCall
        | ArrayAccess
        | "(" Sum ")" -- parenthesis
        | number

    FunctionCall = identifier "(" ArgList ")" // вызов функции
    ArgList = ListOf<Sum, ","> // список аргументов

    ArrayAccess = identifier "[" Sum "]" // доступ к элементу массива

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

    Comparison = Sum "==" Sum -- eq
               | Sum "!=" Sum -- neq
               | Sum ">=" Sum -- ge
               | Sum "<=" Sum -- le
               | Sum ">" Sum -- gt
               | Sum "<" Sum -- lt


    space += comment // Кроме обычных whitespace, теперь коммент тоже считается пробелом
    comment = "//" (~"\n" any)* ("\n" | end)

    keyword = "if" | "else" | "while" | "returns" | "uses" | "int"
            | "true" | "false" | "and" | "or" | "not" // зарезервированные слова для условий
}