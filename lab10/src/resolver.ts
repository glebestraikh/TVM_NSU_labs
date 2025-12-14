import { AnnotatedModule, AnnotatedFunctionDef, Predicate, Quantifier, FormulaRef } from "./funnier";
import { FunnyError } from '../../lab08';

function validatePredicate(pred: Predicate, availableVars: Set<string>, formulaMap: Map<string, any>) {
    if (!pred) return;

    const p = pred as any;

    if (p.kind === 'true' || p.kind === 'false') {
        return;
    }

    if (p.kind === 'comparison') {
        validateExprVariables(p.left, availableVars);
        validateExprVariables(p.right, availableVars);
        return;
    }

    if (p.kind === 'not') {
        validatePredicate(p.condition, availableVars, formulaMap);
        return;
    }

    if (p.kind === 'and' || p.kind === 'or' || p.kind === 'implies') {
        validatePredicate(p.left, availableVars, formulaMap);
        validatePredicate(p.right, availableVars, formulaMap);
        return;
    }

    if (p.kind === 'paren') {
        validatePredicate(p.inner, availableVars, formulaMap);
        return;
    }

    if (p.kind === 'forall' || p.kind === 'exists') {
        // Добавляем переменную квантора в доступные переменные
        const newVars = new Set(availableVars);
        newVars.add(p.variable.name);
        validatePredicate(p.predicate, newVars, formulaMap);
        return;
    }

    if (p.kind === 'formulaRef') {
        // Проверяем, что формула существует
        if (!formulaMap.has(p.name)) {
            throw new FunnyError(
                `Reference to undeclared formula '${p.name}'`,
                'UNDECLARED_FORMULA'
            );
        }
        // Проверяем переменные в аргументах
        if (p.args && Array.isArray(p.args)) {
            for (const arg of p.args) {
                validateExprVariables(arg, availableVars);
            }
        }
        return;
    }
}

function validateExprVariables(expr: any, availableVars: Set<string>) {
    if (!expr) return;

    switch (expr.type) {
        case 'var':
            if (!availableVars.has(expr.name)) {
                throw new FunnyError(
                    `Use of undeclared identifier '${expr.name}'`,
                    'UNDECLARED'
                );
            }
            break;
        case 'const':
            break;
        case 'binop':
            validateExprVariables(expr.left, availableVars);
            validateExprVariables(expr.right, availableVars);
            break;
        case 'unary':
            validateExprVariables(expr.argument, availableVars);
            break;
        case 'funccall':
            if (expr.args) {
                expr.args.forEach((arg: any) => validateExprVariables(arg, availableVars));
            }
            break;
        case 'arraccess':
            if (!availableVars.has(expr.name)) {
                throw new FunnyError(
                    `Use of undeclared identifier '${expr.name}'`,
                    'UNDECLARED'
                );
            }
            validateExprVariables(expr.index, availableVars);
            break;
    }
}

export function resolveModule(m: AnnotatedModule): AnnotatedModule {
    // Создаём карту формул
    const formulaMap = new Map<string, any>();
    if (m.formulas) {
        for (const formula of m.formulas) {
            if (formulaMap.has(formula.name)) {
                throw new FunnyError(
                    `Redeclaration of formula '${formula.name}'`,
                    'REDECLARATION'
                );
            }
            formulaMap.set(formula.name, formula);
        }
    }

    // Валидируем функции
    for (const func of m.functions) {
        const annFunc = func as AnnotatedFunctionDef;

        // Переменные доступные в precondition
        const prePreconditionVars = new Set<string>();
        for (const param of annFunc.parameters) {
            prePreconditionVars.add(param.name);
        }

        // Валидируем precondition
        if (annFunc.precondition) {
            validatePredicate(annFunc.precondition, prePreconditionVars, formulaMap);
        }

        // Переменные доступные в postcondition
        const postPreconditionVars = new Set<string>();
        for (const param of annFunc.parameters) {
            postPreconditionVars.add(param.name);
        }
        for (const ret of annFunc.returns) {
            postPreconditionVars.add(ret.name);
        }

        // Валидируем postcondition
        if (annFunc.postcondition) {
            validatePredicate(annFunc.postcondition, postPreconditionVars, formulaMap);
        }

        // Переменные доступные в invariant
        const invariantVars = new Set<string>();
        for (const param of annFunc.parameters) {
            invariantVars.add(param.name);
        }
        for (const ret of annFunc.returns) {
            invariantVars.add(ret.name);
        }
        for (const local of annFunc.locals) {
            invariantVars.add(local.name);
        }

        // Валидируем invariant
        if (annFunc.invariant) {
            validatePredicate(annFunc.invariant, invariantVars, formulaMap);
        }
    }

    return m;
}