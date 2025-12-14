import { ExportWrapper, compileModule } from "../../lab09";
import { parseFunnier } from "../../lab10";
import { verifyModule } from "./verifier";

export async function parseVerifyAndCompile(name: string, source: string): Promise<Record<string, Function>> {
    const ast = parseFunnier(source);
    const verificationResult = await verifyModule(ast);

    // const failed = verificationResult.filter(r => !r.verified);
    // if (failed.length > 0) {
    //     throw new Error("Verification failed: " + JSON.stringify(failed, null, 2));
    // }

    const mod = await compileModule(ast, name);
    return new ExportWrapper(mod);
}

/*
export async function parseVerifyAndCompile(source: string): Promise<Record<string, Function>>
{
    const ast = parseFunnier(source);
    await verifyModule(ast);
    const mod = await compileModule(ast);
    return new ExportWrapper(mod);
}
*/