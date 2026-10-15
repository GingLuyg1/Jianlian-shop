// Execute actual TS delivery/router implementations in Node without Next runtime.
// Only Daju's network handler is replaced with a zero-summary offline stub.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import ts from "typescript";

export async function loadActualLocalDeliveryEntry(root) {
  const moduleUrl = (path) => pathToFileURL(resolve(root, path)).href;
  const compile = (source) => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText).toString("base64");
  let router = readFileSync(resolve(root, "lib/providers/core/supplier-router.ts"), "utf8");
  router = router.replace('import { fulfillDajuOrderWithSupabase } from "../daju/fulfillment";',
    'const fulfillDajuOrderWithSupabase = async () => ({ handled: 0, fulfilled: 0, failed: 0, uncertain: 0, needsInput: 0 });');
  router = router.replaceAll('"./supplier-router-core.mjs"', JSON.stringify(moduleUrl("lib/providers/core/supplier-router-core.mjs")));
  const routerUrl = compile(router);
  let delivery = readFileSync(resolve(root, "lib/delivery/delivery-service.ts"), "utf8");
  delivery = delivery.replace('"@/lib/providers/core/supplier-router"', JSON.stringify(routerUrl))
    .replace('"./local-stock-priority.mjs"', JSON.stringify(moduleUrl("lib/delivery/local-stock-priority.mjs")));
  return import(compile(delivery));
}
