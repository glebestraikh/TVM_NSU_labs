import { Expr, parseExpr } from "../../lab04";
import { buildFunction, getVariables } from "./compiler";
import { Fn } from "./emitHelper";

export async function parseCompileAndExecute(expression: string, ...args: number[]): Promise<number> {
    let expr = parseExpr(expression);
    let variables = getVariables(expr);
    return await compileAndExecute(expr, variables, ...args);
}
export async function compileAndExecute(expr: Expr, variables: string[], ...args: number[]): Promise<number> {
    let wasmFunc = await compile(expr, variables);
    return wasmFunc(...args);
}

export const compile = async (expr: Expr, variables: string[]) => checked(await buildFunction(expr, variables));

export const checked = <R>(func: Fn<R>): Fn<R> => function (...args: number[]): R {
    if (args.length != func.length)
        throw new WebAssembly.RuntimeError(`Signature mismatch: passed ${args.length}, expected ${func.length}.`);
    return func(...args);
};

export { buildFunction, getVariables } from "./compiler";


/**
    1.	Пользователь вызывает parseCompileAndExecute("a + b*2", 3, 4).
    2.	parseExpr строит AST.
    3.	getVariables возвращает список переменных ["a","b"].
    4.	buildFunction создаёт модуль WebAssembly и возвращает JS-функцию.
    5.	checked проверяет количество аргументов.
    6.	Функция выполняется с переданными числами, возвращается результат.
 */