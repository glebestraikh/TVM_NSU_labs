import { BufferedEmitter, c, I32, I64, N, Op, Void } from "../../wasm";

// Определяет тип JS-функции, которая может принимать любое количество аргументов (...args) 
// и возвращает значение типа R.
export type Fn<R> = (...args: any[]) => R;

export async function buildOneFunctionModule<R = number>(name: string, argCount: number, body: N[]): Promise<Fn<R>> {
    const mod = c.module([
        c.type_section([
            c.func_type(Array(argCount).fill(c.i32), c.i32), // type index = 0
        ]),

        c.function_section([
            c.varuint32(0), // function index = 0, uses type index 0
        ]),

        c.export_section([
            c.export_entry(c.str_ascii(name), c.external_kind.function, c.varuint32(0)),
        ]),

        c.code_section([
            // body of function at index 0:
            c.function_body([ /* no additional local variables */], body)]
        )]
    );
    const emitter = new BufferedEmitter(new ArrayBuffer(mod.z));
    mod.emit(emitter);
    const module = await WebAssembly.instantiate(emitter.buffer);
    const exported = module.instance.exports[name];
    return exported as Fn<R>;
}

/**
    1.	Создаётся модуль WebAssembly с одной функцией.
    2.	Функция получает argCount аргументов типа i32 и возвращает i32.
    3.	Тело функции берётся из массива инструкций body.
    4.	Модуль компилируется и инстанцируется в JS.
    5.	Возвращается экспортированная JS-функция, готовая к вызову.
 */

