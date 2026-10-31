import { readFileSync } from "node:fs";
import ts from "typescript";

// Node 20 has no native TypeScript loader. Execute the actual pure module,
// preserving every test assertion and refusing runtime dependency substitution.
export function loadPureTypeScript(url) {
  const code = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  const require = (name) => { throw new Error(`Pure module gained a runtime dependency: ${name}`); };
  new Function("require", "module", "exports", code)(require, module, module.exports);
  return module.exports;
}
