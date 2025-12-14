import { writeFileSync } from "fs";
import { Op, I32, I64, Void, c, BufferedEmitter, LocalEntry, ExportEntry } from "../../wasm";
import { Module, Statement, Expr, LValue, Condition } from "../../lab08";

const { i32, i64, varuint32, get_local, set_local, call, if_, void_block, void_loop, br_if, br,
    str_ascii, export_entry, func_type_m, function_body, type_section, function_section,
    export_section, code_section } = c;

export async function compileModule<M extends Module>(m: M, name?: string): Promise<WebAssembly.Exports> {
    // functionName → index
    const functionIndexMap = buildFunctionIndexMap(m);

    // Генерирует 4 секции wasm
    const typeSection = buildTypeSection(m);
    const functionSection = buildFunctionSection(m);
    const exportSection: ExportEntry[] = buildExportSection(m);
    const codeSection = buildCodeSection(m, functionIndexMap);

    // Собирает wasm-модуль
    const mod = c.module([
        c.type_section(typeSection),
        c.function_section(functionSection),
        c.export_section(exportSection),
        c.code_section(codeSection)
    ]);

    // mod.z — размер бинарного wasm-модуля в байтах
    const emitter = new BufferedEmitter(new ArrayBuffer(mod.z));
    mod.emit(emitter);

    // emitter.buffer = готовый wasm-бинарник
    // Создаёт экземпляр модуля
    const wasmModule = await WebAssembly.instantiate(emitter.buffer);
    // JS функции
    return wasmModule.instance.exports;
}

// функция создает отображение имен функций на их индексы в модуле
function buildFunctionIndexMap(m: Module): Map<string, number> {
    const map = new Map<string, number>();
    for (let i = 0; i < m.functions.length; i++) {
        map.set(m.functions[i].name, i);
    }
    return map;
}

// функция создает типы функций для секции типов
// Поддерживает int[] параметры и возвращаемые значения как i64 (уровень A5)
/*
 Результат buildTypeSection
[
  type 0: (i32, i32) -> (i32),
  type 1: (i64) -> (i32),
  ...
]
*/
function buildTypeSection(m: Module): any[] {
    //  Проходим по всем функциям Funny-модуля.
    return m.functions.map(func => {
        const paramTypes = func.parameters.map(p =>
            p.varType === 'int[]' ? c.i64 : c.i32
        );
        const returnTypes = func.returns.map(r =>
            r.varType === 'int[]' ? c.i64 : c.i32
        );
        return c.func_type_m(paramTypes, returnTypes);
    });
}

// функция создает секцию функций с индексами типов функций
/*
Function section говорит:

«Функция №0 имеет тип №0»
«Функция №1 имеет тип №1»

(type 0 (func (param i32) (result i32)))
(type 1 (func (param i32 i32) (result i32)))

(func (type 0) ...)
(func (type 1) ...)
*/
function buildFunctionSection(m: Module): any[] {
    return m.functions.map((_, i) => c.varuint32(i));
}

// функция создает секцию экспорта
// Благодаря этому, после компиляции модуля в WebAssembly мы сможем вызывать функцию по имени из JS
// Экспорт вида: (export "gcd" (func 0))
function buildExportSection(m: Module): any[] {
    return m.functions.map((func, i) =>
        c.export_entry(c.str_ascii(func.name), c.external_kind.function, c.varuint32(i))
    );
}

// функция создает секцию кода с телами функций
function buildCodeSection(m: Module, functionIndexMap: Map<string, number>): any[] {
    // Обход всех функций
    return m.functions.map(func => {
        // все локальные переменные функции (параметры, возвращаемые значения и uses)
        // компилятор делает таблицу имён → индексов
        const allLocals = [
            ...func.parameters.map(p => p.name),
            ...func.returns.map(r => r.name),
            ...func.locals.map(l => l.name)
        ];

        // операции тела функции
        const bodyOps: any[] = compileStatement(func.body, allLocals, functionIndexMap);

        // загрузка возвращаемых значений в стек перед завершением функции  
        // В WebAssembly функция возвращает значения через стек
        for (const ret of func.returns) {
            const idx = allLocals.indexOf(ret.name);
            const type = ret.varType === 'int[]' ? c.i64 : c.i32;
            bodyOps.push(c.get_local(type, idx));
        }

        // определение локальных переменных функции в формате WebAssembly
        // возвращаемые значения и локальные переменные могут быть разных типов
        const localEntriesToAdd: Array<{ type: any, count: number }> = [];

        // добавляем возвращаемые значения
        for (const ret of func.returns) {
            const type = ret.varType === 'int[]' ? c.i64 : c.i32;
            const existing = localEntriesToAdd.find(e => e.type === type);
            if (existing) {
                existing.count++;
            } else {
                localEntriesToAdd.push({ type, count: 1 });
            }
        }

        // добавляем локальные переменные
        for (const local of func.locals) {
            const type = local.varType === 'int[]' ? c.i64 : c.i32;
            const existing = localEntriesToAdd.find(e => e.type === type);
            if (existing) {
                existing.count++;
            } else {
                localEntriesToAdd.push({ type, count: 1 });
            }
        }

        const localEntries = localEntriesToAdd.length > 0
            ? localEntriesToAdd.map(entry => c.local_entry(c.varuint32(entry.count), entry.type))
            : [];

        // создание тела функции
        return c.function_body(localEntries, bodyOps);
    });
}

function compileExpr(expr: Expr, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    const e = expr as any;

    switch (e.type) {
        case "const":
            return c.i32.const(e.value);

        case "var":
            return c.get_local(c.i32, locals.indexOf(e.name));

        case "unary":
            return c.i32.mul(c.i32.const(-1), compileExpr(e.argument, locals, functionIndexMap));

        case "binop":
            return compileBinOp(e, locals, functionIndexMap);

        case "funccall":
            return compileFuncCall(e, locals, functionIndexMap);

        case "arraccess":
            return compileArrayAccess(e, locals, functionIndexMap);

        default:
            throw new Error(`Unknown expr type: ${e.type}`);
    }
}

function compileBinOp(expr: any, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    const left = compileExpr(expr.left, locals, functionIndexMap);
    const right = compileExpr(expr.right, locals, functionIndexMap);

    switch (expr.op) {
        case '+': return c.i32.add(left, right);
        case '-': return c.i32.sub(left, right);
        case '*': return c.i32.mul(left, right);
        case '/': return c.i32.div_s(left, right);
        default: throw new Error(`Unknown operator: ${expr.op}`);
    }
}

function compileArrayAccess(expr: any, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    // Поддержка операции обращения к элементу массива (уровень A5)
    // array[index] -> array_get(array_var, index)
    const arrIdx = compileExpr(expr.index, locals, functionIndexMap);
    const arrVar = c.get_local(i64, locals.indexOf(expr.name));
    return c.array_get(arrVar, arrIdx);
}

function compileFuncCall(expr: any, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    const args = expr.args.map((a: Expr) => compileExpr(a, locals, functionIndexMap));
    const idx = functionIndexMap.get(expr.name);

    if (idx === undefined) {
        throw new Error(`Unknown function: ${expr.name}`);
    }

    return call(i32, c.varuint32(idx), args);
}

function compileLValue(lvalue: LValue, locals: string[], functionIndexMap: Map<string, number>): {
    set: (value: Op<I32>) => Op<Void>, get: () => Op<I32>
} {
    const lv = lvalue as any;

    switch (lv.type) {
        case "lvar": {
            const idx = locals.indexOf(lv.name);
            return {
                set: (v) => set_local(idx, v),
                get: () => c.get_local(i32, idx)
            };
        }

        case "larr": {
            // Поддержка присваивания элементов массива
            // array[index] = value -> array_set(array_var, index, value)
            const idxExpr = compileExpr(lv.index, locals, functionIndexMap);
            const arrVar = c.get_local(i64, locals.indexOf(lv.name));
            return {
                set: (v) => void_block([c.array_set(arrVar, idxExpr, v)]),
                // оборачивает операцию в блок, возвращающий void (WebAssembly функция присваивания не возвращает значения
                get: () => c.array_get(arrVar, idxExpr)
            };
        }

        default: throw new Error(`Unknown lvalue type: ${lv.type}`);
    }
}

function compileCondition(cond: Condition, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    const c_obj = cond as any;

    switch (c_obj.kind) {
        case "true":
            return i32.const(1);

        case "false":
            return i32.const(0);

        case "comparison":
            return compileComparison(c_obj, locals, functionIndexMap);

        case "not":
            return i32.eqz(compileCondition(c_obj.condition, locals, functionIndexMap));

        case "and":
            return compileAnd(c_obj, locals, functionIndexMap);

        case "or":
            return compileOr(c_obj, locals, functionIndexMap);

        case "implies":
            return compileImplies(c_obj, locals, functionIndexMap);

        case "paren":
            return compileCondition(c_obj.inner, locals, functionIndexMap);

        default:
            throw new Error(`Unknown condition kind: ${c_obj.kind}`);
    }
}

function compileComparison(cond: any, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    const left = compileExpr(cond.left, locals, functionIndexMap);
    const right = compileExpr(cond.right, locals, functionIndexMap);

    switch (cond.op) {
        case "==": return i32.eq(left, right);
        case "!=": return i32.ne(left, right);
        case ">": return i32.gt_s(left, right);
        case "<": return i32.lt_s(left, right);
        case ">=": return i32.ge_s(left, right);
        case "<=": return i32.le_s(left, right);
        default: throw new Error(`Unknown comparison: ${cond.op}`);
    }
}

function compileAnd(cond: any, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    return if_(i32,
        compileCondition(cond.left, locals, functionIndexMap),
        [compileCondition(cond.right, locals, functionIndexMap)],
        [i32.const(0)]
    );
}

function compileOr(cond: any, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    return if_(i32,
        compileCondition(cond.left, locals, functionIndexMap),
        [i32.const(1)],
        [compileCondition(cond.right, locals, functionIndexMap)]
    );
}

function compileImplies(cond: any, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    const notLeft = i32.eqz(compileCondition(cond.left, locals, functionIndexMap));
    return if_(i32,
        notLeft,
        [i32.const(1)],
        [compileCondition(cond.right, locals, functionIndexMap)]
    );
}

function compileStatement(stmt: Statement, locals: string[], functionIndexMap: Map<string, number>): Op<Void>[] {
    const s = stmt as any;

    // Handle undefined or null statement
    if (!s) {
        return [];
    }

    // Handle both 'type' and 'kind' properties (from lab10 WhileStmtWithInvariant)
    const stmtType = s.type || s.kind;

    switch (stmtType) {
        case "block":
            return compileBlock(s, locals, functionIndexMap);

        case "assign":
            return compileAssign(s, locals, functionIndexMap);

        case "if":
            return compileIf(s, locals, functionIndexMap);

        case "while":
            return compileWhile(s, locals, functionIndexMap);

        default:
            // Unknown statement type - skip it or return empty ops
            return [];
    }
}

function compileBlock(stmt: any, locals: string[], functionIndexMap: Map<string, number>): Op<Void>[] {
    const ops: Op<Void>[] = [];
    for (const st of stmt.stmts) {
        ops.push(...compileStatement(st, locals, functionIndexMap));
    }
    return ops;
}

function compileAssign(stmt: any, locals: string[], functionIndexMap: Map<string, number>): Op<Void>[] {
    const ops: Op<Void>[] = [];
    const targets = stmt.targets as LValue[];
    const exprs = stmt.exprs as Expr[];

    if (exprs.length === 1 && targets.length > 1) {
        compileTupleAssign(stmt, targets, exprs, locals, functionIndexMap, ops);
    } else if (exprs.length === targets.length) {
        compileSingleAssigns(targets, exprs, locals, functionIndexMap, ops);
    } else {
        throw new Error('Assignment mismatch: different number of targets and expressions');
    }

    return ops;
}

function compileTupleAssign(stmt: any, targets: LValue[], exprs: Expr[], locals: string[],
    functionIndexMap: Map<string, number>, ops: Op<Void>[]): void {
    // Поддержка присваивания кортежей - множественное присваивание из вызова функции
    // a, b = func(x) -> вызов func, получение нескольких возвращаемых значений
    const expr = exprs[0];

    if ((expr as any).type !== 'funccall') {
        throw new Error('Tuple assignment only works with function calls');
    }

    const funcName = (expr as any).name;
    const funcIdx = functionIndexMap.get(funcName);
    const args = (expr as any).args.map((a: Expr) => compileExpr(a, locals, functionIndexMap));

    ops.push(c.void_block([c.call(i32, c.varuint32(funcIdx!), args)]));

    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const lval = compileLValue(target, locals, functionIndexMap);
    }
}

function compileSingleAssigns(targets: LValue[], exprs: Expr[], locals: string[],
    functionIndexMap: Map<string, number>, ops: Op<Void>[]): void {
    const vals = exprs.map(e => compileExpr(e, locals, functionIndexMap));

    for (let i = 0; i < targets.length; i++) {
        const lval = compileLValue(targets[i], locals, functionIndexMap);
        ops.push(lval.set(vals[i]));
    }
}

function compileIf(stmt: any, locals: string[], functionIndexMap: Map<string, number>): Op<Void>[] {
    const condition = compileCondition(stmt.condition, locals, functionIndexMap);
    const thenBranch = compileStatement(stmt.then, locals, functionIndexMap);
    const elseBranch = stmt.else ? compileStatement(stmt.else, locals, functionIndexMap) : [];

    return [void_block([if_(c.void, condition, thenBranch, elseBranch)])];
}

function compileWhile(stmt: any, locals: string[], functionIndexMap: Map<string, number>): Op<Void>[] {
    const condition = compileCondition(stmt.condition, locals, functionIndexMap);
    const body = compileStatement(stmt.body, locals, functionIndexMap);

    return [void_block([
        void_loop([
            br_if(1, c.i32.eqz(condition)),
            ...body,
            br(0)
        ])
    ])];
}

export { FunnyError } from '../../lab08';