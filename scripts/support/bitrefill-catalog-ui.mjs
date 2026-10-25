// Explicit local fixture only; the actual React components are mounted unchanged.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import ts from "typescript";
const require = createRequire(import.meta.url);
export function catalogWorkspaceHtml(root, view = "catalog") {
  const compile = (name) => ts.transpileModule(readFileSync(resolve(root, `components/admin/suppliers/${name}.tsx`), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const react = readFileSync(resolve(dirname(require.resolve("react")), "umd/react.development.js"), "utf8");
  const dom = readFileSync(resolve(dirname(require.resolve("react-dom")), "umd/react-dom.development.js"), "utf8");
  const script = `${react}\n${dom}\nconst el=(t,p,k)=>React.createElement(t,{...p,...(k===undefined?{}:{key:k})});
    const jsx={jsx:el,jsxs:el,Fragment:React.Fragment};
    function run(source,extra={}){const m={exports:{}};new Function('require','exports','module',source)(n=>{if(n==='react')return React;if(n==='react/jsx-runtime')return jsx;if(n in extra)return extra[n];throw Error('UNEXPECTED_LOCAL_IMPORT')},m.exports,m);return m.exports}
    const editor=run(${JSON.stringify(compile("BitrefillLocalMappingEditor"))});
    const view=run(${JSON.stringify(compile(view === "aftercare" ? "BitrefillAftercareWorkspace" : "BitrefillCatalogWorkspace"))},{'./BitrefillLocalMappingEditor':editor});
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(view.default,{localMode:true}));`;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LOCAL ONLY — Bitrefill mapping</title>
    <style>body{margin:0;padding:16px;background:#fcfaf6;color:#172033;font:14px system-ui}*{box-sizing:border-box;overflow-wrap:anywhere}main,section,form,article,div{min-width:0;max-width:100%}main{max-width:1200px;margin:auto}article,section{border:1px solid #ddd;border-radius:12px;padding:16px;margin:12px 0;background:#fff}button,input,select,textarea{font:inherit;min-height:44px;max-width:100%;margin:4px;padding:6px 10px}button{cursor:pointer;border:1px solid #e6b786;border-radius:8px;background:#fff8ef}button:disabled{opacity:.5}a{color:#b45309;margin-right:12px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:6px;text-align:left;border-bottom:1px solid #eee}input[type=checkbox]{min-height:20px}label{display:inline-block;max-width:100%}.overflow-x-auto{overflow-x:auto}.grid{display:grid;gap:12px}.flex{display:flex;flex-wrap:wrap;gap:8px}.space-y-4>*{margin-bottom:16px}@media(min-width:900px){.lg\\:grid-cols-2{grid-template-columns:1fr 1fr}.md\\:grid-cols-2{grid-template-columns:1fr 1fr}}[role=alert]{color:#9b2c12}</style>
    <div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></html>`;
}
