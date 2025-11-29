import { writeFileSync } from "fs";
import { Op, I32, Void, c, BufferedEmitter, LocalEntry } from "../../wasm";
import { Module, Statement, Expr, LValue, Condition } from "../../lab08";

const { i32, varuint32, get_local, set_local, call, if_, void_block, void_loop, br_if, br,
    str_ascii, export_entry, func_type_m, function_body, type_section, function_section,
    export_section, code_section } = c;

export async function compileModule<M extends Module>(m: M, name?: string): Promise<WebAssembly.Exports> {
    const typeSection: any[] = [];
    const functionSection: any[] = [];
    const exportSection: any[] = [];
    const codeSection: any[] = [];

    const functionIndexMap = new Map<string, number>();

    // создаём сигнатуры типов и индексы функций
    for (let i = 0; i < m.functions.length; i++) {
        const func = m.functions[i];

        functionIndexMap.set(func.name, i);

        const paramTypes = func.parameters.map(p =>
            p.varType === 'int[]' ? i32 : i32
        );
        const returnTypes = func.returns.map(r =>
            r.varType === 'int[]' ? i32 : i32
        );

        typeSection.push(func_type_m(paramTypes, returnTypes));
        functionSection.push(varuint32(i));

        exportSection.push(export_entry(str_ascii(func.name), c.external_kind.function, varuint32(i)));
    }

    // генерируем тела функций
    for (let i = 0; i < m.functions.length; i++) {
        const func = m.functions[i];

        const allLocals = [
            ...func.parameters.map(p => p.name),
            ...func.returns.map(r => r.name),
            ...func.locals.map(l => l.name)
        ];

        const numLocalsToAdd = func.returns.length + func.locals.length;
        const localEntries: LocalEntry[] = numLocalsToAdd > 0
            ? [c.local_entry(c.varuint32(numLocalsToAdd), i32)] : [];

        const bodyOps: (Op<Void> | Op<I32>)[] = compileStatement(func.body, allLocals, functionIndexMap);

        for (const ret of func.returns) {
            const idx = allLocals.indexOf(ret.name);
            bodyOps.push(get_local(i32, idx));
        }

        codeSection.push(function_body(localEntries, bodyOps));
    }

    const mod = c.module([
        type_section(typeSection),
        function_section(functionSection),
        export_section(exportSection),
        code_section(codeSection)
    ]);

    const emitter = new BufferedEmitter(new ArrayBuffer(mod.z));
    mod.emit(emitter);

    const wasmModule = await WebAssembly.instantiate(emitter.buffer);
    return wasmModule.instance.exports;
}

function compileExpr(expr: Expr, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    const e = expr as any;

    switch (e.type) {
        case "const":
            return i32.const(e.value);

        case "var":
            const varIdx = locals.indexOf(e.name);
            return get_local(i32, varIdx);

        case "unary":
            return i32.mul(i32.const(-1), compileExpr(e.argument, locals, functionIndexMap));

        case "binop": {
            const left = compileExpr(e.left, locals, functionIndexMap);
            const right = compileExpr(e.right, locals, functionIndexMap);

            switch (e.op) {
                case '+': return i32.add(left, right);
                case '-': return i32.sub(left, right);
                case '*': return i32.mul(left, right);
                case '/': return i32.div_s(left, right);
                default: throw new Error(`Unknown operator: ${e.op}`);
            }
        }

        case "funccall": {
            const args = e.args.map((a: Expr) => compileExpr(a, locals, functionIndexMap));

            const idx = functionIndexMap.get(e.name);
            if (idx === undefined) {
                throw new Error(`Unknown function: ${e.name}`);
            }

            return call(i32, varuint32(idx), args);
        }

        case "arraccess": {
            throw new Error('Array support not implemented for level C/B');
        }

        default: throw new Error(`Unknown expr type: ${e.type}`);
    }
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
                get: () => get_local(i32, idx)
            };
        }

        case "larr": {
            throw new Error('Array support not implemented for level C/B');
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

        case "comparison": {
            const left = compileExpr(c_obj.left, locals, functionIndexMap);
            const right = compileExpr(c_obj.right, locals, functionIndexMap);

            switch (c_obj.op) {
                case "==": return i32.eq(left, right);
                case "!=": return i32.ne(left, right);
                case ">": return i32.gt_s(left, right);
                case "<": return i32.lt_s(left, right);
                case ">=": return i32.ge_s(left, right);
                case "<=": return i32.le_s(left, right);
                default: throw new Error(`Unknown comparison: ${c_obj.op}`);
            }
        }

        case "not":
            return i32.eqz(compileCondition(c_obj.condition, locals, functionIndexMap));

        case "and":
            return if_(i32,
                compileCondition(c_obj.left, locals, functionIndexMap),
                [compileCondition(c_obj.right, locals, functionIndexMap)],
                [i32.const(0)]);

        case "or":
            return if_(i32,
                compileCondition(c_obj.left, locals, functionIndexMap),
                [i32.const(1)],
                [compileCondition(c_obj.right, locals, functionIndexMap)]);

        case "implies":
            const notLeft = i32.eqz(compileCondition(c_obj.left, locals, functionIndexMap));
            return if_(i32,
                notLeft,
                [i32.const(1)],
                [compileCondition(c_obj.right, locals, functionIndexMap)]
            );

        case "paren":
            return compileCondition(c_obj.inner, locals, functionIndexMap);

        default: throw new Error(`Unknown condition kind: ${c_obj.kind}`);
    }
}

function compileStatement(stmt: Statement, locals: string[], functionIndexMap: Map<string, number>): Op<Void>[] {
    const ops: Op<Void>[] = [];
    const s = stmt as any;

    switch (s.type) {
        case "block": {
            for (const st of s.stmts) {
                ops.push(...compileStatement(st, locals, functionIndexMap));
            }
            break;
        }

        case "assign": {
            const targets = s.targets as LValue[];
            const exprs = s.exprs as Expr[];

            if (exprs.length === 1 && targets.length > 1) {
                const expr = exprs[0];

                if ((expr as any).type === 'funccall') {
                    const funcName = (expr as any).name;
                    const funcIdx = functionIndexMap.get(funcName);
                    const args = (expr as any).args.map((a: Expr) =>
                        compileExpr(a, locals, functionIndexMap)
                    );

                    const tempStartIdx = locals.length;

                    ops.push(void_block([call(i32, varuint32(funcIdx!), args)]));

                    for (let i = targets.length - 1; i >= 0; i--) {
                        const tempIdx = tempStartIdx + i;
                        ops.push(set_local(tempIdx, i32.const(0)));
                    }

                    for (let i = 0; i < targets.length; i++) {
                        const tempIdx = tempStartIdx + i;
                        const target = targets[i];
                        const lval = compileLValue(target, locals, functionIndexMap);
                        ops.push(lval.set(get_local(i32, tempIdx)));
                    }
                } else {
                    throw new Error('Tuple assignment only works with function calls');
                }
            } else if (exprs.length === targets.length) {
                const vals = exprs.map((e: Expr) => compileExpr(e, locals, functionIndexMap));

                for (let i = 0; i < targets.length; i++) {
                    const lval = compileLValue(targets[i], locals, functionIndexMap);
                    ops.push(lval.set(vals[i]));
                }
            } else {
                throw new Error('Assignment mismatch: different number of targets and expressions');
            }
            break;
        }

        case "if": {
            const condition = compileCondition(s.condition, locals, functionIndexMap);
            const thenBranch = compileStatement(s.then, locals, functionIndexMap);
            const elseBranch = s.else ? compileStatement(s.else, locals, functionIndexMap) : [];

            ops.push(if_(c.void as any, condition, thenBranch, elseBranch) as any as Op<Void>);
            break;
        }

        case "while": {
            ops.push(void_block([
                void_loop([
                    br_if(1, i32.eqz(compileCondition(s.condition, locals, functionIndexMap))),

                    ...compileStatement(s.body, locals, functionIndexMap),

                    br(0)
                ])
            ]));
            break;
        }

        default: throw new Error(`Unknown statement type: ${s.type}`);
    }

    return ops;
}

export { FunnyError } from '../../lab08';