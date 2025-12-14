import { parseFunny } from "../../lab08";

import { compileModule as compileModule } from "./compiler";

export class ExportWrapper implements Record<string, Function> {
    // хранит реальные экспортированные функции Wasm
    #exports: WebAssembly.Exports;
    // Сохраняем все экспорты модуля WebAssembly.
    constructor(exports: WebAssembly.Exports) {
        this.#exports = exports;
        // Proxy позволяет перехватывать доступ к свойствам объекта
        return new Proxy(this, {
            get(target, p: string): Function | undefined {
                if (p == "then")
                    return undefined; // fail the Promise test

                // Берём экспорт по имени
                const f = target.#exports[p];
                if (typeof f !== "function")
                    return undefined;

                // Обёртка над функцией Wasm
                return (...a: any[]) => {
                    if (a.length != f.length)
                        throw new Error(`Argument count mistmatch. Expected: ${f.length}, passed: ${a.length}.`);
                    return f(...a);
                }
            }
        })
    }
    [x: string]: Function;
}

export async function parseAndCompile(name: string, source: string): Promise<Record<string, Function>> {
    // строит AST (дерево программы)
    // Если синтаксис неверный → ошибка сразу здесь
    const ast = parseFunny(source);
    // 	генерирует байткод WebAssembly
    // создаётся настоящий Wasm-модуль
    const mod = await compileModule(ast, name);
    // делает вызов Wasm-функций возможным и безопасным в ts
    return new ExportWrapper(mod);
}

export * from './compiler';