import { c as C, Op, I32 } from "../../wasm";
import { Expr, NumConst, Variable, BinaryOp, UnaryMinus } from "../../lab04";
import { buildOneFunctionModule, Fn } from "./emitHelper";

const { i32, get_local } = C;

export function getVariables(e: Expr): string[] {
    const variables: string[] = [];
    const seen = new Set<string>();

    function traverse(expr: Expr): void {
        switch (expr.type) {
            case 'const':
                break;

            case 'var':
                const varExpr = expr as Variable;
                if (!seen.has(varExpr.name)) {
                    seen.add(varExpr.name);
                    variables.push(varExpr.name);
                }
                break;

            case 'binop':
                const binopExpr = expr as BinaryOp;
                traverse(binopExpr.left);
                traverse(binopExpr.right);
                break;

            case 'unary':
                const unaryExpr = expr as UnaryMinus;
                traverse(unaryExpr.argument);
                break;

            default:
                throw new Error(`Unknown expression type: ${(e as any).type}`);
        }
    }

    traverse(e);
    return variables;
}

export async function buildFunction(e: Expr, variables: string[]): Promise<Fn<number>> {
    let expr = wasm(e, variables);
    return await buildOneFunctionModule("test", variables.length, [expr]);
}

// Это инструкция, которая будет выполнена позже, когда функция WebAssembly запустится.
// Op<I32> — это объект-инструкция WebAssembly.
// Он записывает, что при исполнении функции нужно сделать:
//      взять локальную переменную с индексом index
//      положить её на стек
//      Но пока функция не вызвана, это только описание действия, а не само значение.
function wasm(e: Expr, args: string[]): Op<I32> {
    switch (e.type) {
        case 'const':
            const constExpr = e as NumConst;
            return i32.const(constExpr.value); // помещает число value на стек

        case 'var':
            const varExpr = e as Variable;
            const index = args.indexOf(varExpr.name);
            if (index === -1) {
                // Если переменная не найдена в списке аргументов,
                // генерируем код, который вызовет runtime error
                // Используем unreachable инструкцию
                return C.block(i32, [C.unreachable]);
            }
            // Каждый аргумент функции в WebAssembly является локальной переменной.
            // Они не копируются на стек автоматически, 
            // но WebAssembly умеет их класть на стек по инструкции get_local.
            // Индекс локальной переменной = её порядковый номер в сигнатуре функции.
            return get_local(i32, index);

        case 'binop':
            // Компилируем бинарную операцию
            const binopExpr = e as BinaryOp;
            const left = wasm(binopExpr.left, args);
            const right = wasm(binopExpr.right, args);

            switch (binopExpr.op) {
                case '+':
                    return i32.add(left, right);
                case '-':
                    return i32.sub(left, right);
                case '*':
                    return i32.mul(left, right);
                case '/':
                    // div_s выбрасывает исключение при делении на ноль
                    return i32.div_s(left, right);
                default:
                    throw new Error(`Unknown binary operator: ${binopExpr.op}`);
            }

        case 'unary':
            // Компилируем унарный минус
            const unaryExpr = e as UnaryMinus;
            const arg = wasm(unaryExpr.argument, args);
            // Унарный минус = 0 - x
            return i32.sub(i32.const(0), arg);

        default:
            throw new Error(`Unknown expression type: ${(e as any).type}`);

    }
}