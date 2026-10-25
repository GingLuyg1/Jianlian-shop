import { readFile } from "node:fs/promises";
import ts from "typescript";
import assert from "node:assert/strict";

export async function loadSecurityTs(path, dependencies) {
  const source = await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const m = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    assert.ok(name in dependencies, `Unmocked dependency: ${name}`);
    return dependencies[name];
  }, m, m.exports);
  return m.exports;
}
export const nextJson = { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } };
export const syntheticIds = Object.freeze({
  user: "11111111-1111-4111-8111-111111111111",
  other: "22222222-2222-4222-8222-222222222222",
  admin: "33333333-3333-4333-8333-333333333333",
  ordinaryAdmin: "44444444-4444-4444-8444-444444444444",
  product: "55555555-5555-4555-8555-555555555555",
  hiddenProduct: "66666666-6666-4666-8666-666666666666",
  category: "77777777-7777-4777-8777-777777777777",
  sku: "88888888-8888-4888-8888-888888888888",
  hiddenSku: "99999999-9999-4999-8999-999999999999",
});
