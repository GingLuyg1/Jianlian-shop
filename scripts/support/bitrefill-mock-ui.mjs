// Offline browser fixture mounts the EXACT shipped React components. It is not
// a Next auth bypass and is imported only by the explicit loopback mock harness.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import ts from "typescript";
const require = createRequire(import.meta.url);
export function mockCustomerHtml(root, order) {
  const compile = (path) => ts.transpileModule(readFileSync(resolve(root, path), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const react = readFileSync(resolve(dirname(require.resolve("react")), "umd/react.development.js"), "utf8");
  const dom = readFileSync(resolve(dirname(require.resolve("react-dom")), "umd/react-dom.development.js"), "utf8");
  const source = compile("components/account/orders/SecureOrderDelivery.tsx");
  const script = `${react}\n${dom}\nconst el=(type,props,key)=>React.createElement(type,{...props,...(key===undefined?{}:{key})});
    const icon=()=>null;const button=({variant,size,asChild,...props})=>React.createElement('button',props);
    const dependencies={'react':React,'react/jsx-runtime':{jsx:el,jsxs:el,Fragment:React.Fragment},'next/link':{default:({href,children})=>React.createElement('a',{href},children)},
    'lucide-react':{Clipboard:icon,Eye:icon,EyeOff:icon,Loader2:icon,RefreshCw:icon},'sonner':{toast:{success:()=>{},error:()=>{}}},
    '@/components/ui/button':{Button:button},'@/lib/orders/delivery-polling.mjs':{pollForPaymentDelivery:()=>{throw Error('POLL_NOT_ENABLED_IN_FIXTURE')}},
    '@/lib/orders/order-status':{normalizePaymentStatus:v=>v,normalizeOrderStatus:v=>v},'@/lib/utils':{cn:(...x)=>x.filter(Boolean).join(' ')}};
    const module={exports:{}};new Function('require','module','exports',${JSON.stringify(source)})(name=>{if(!(name in dependencies))throw Error('UNEXPECTED_FIXTURE_IMPORT');return dependencies[name]},module,module.exports);
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(module.exports.SecureOrderDelivery,${JSON.stringify({ orderNo: order.order_no, paymentStatus: order.payment_status, orderStatus: order.status })}));`;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOCK ONLY — owner delivery</title><style>body{padding:16px;font:14px system-ui;background:#fcfaf6}*{overflow-wrap:anywhere}button{min-height:44px;margin:6px}</style><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></html>`;
}
export function mockAdminHtml(root) {
  const compile = (path) => ts.transpileModule(readFileSync(resolve(root, path), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const react = readFileSync(resolve(dirname(require.resolve("react")), "umd/react.development.js"), "utf8");
  const dom = readFileSync(resolve(dirname(require.resolve("react-dom")), "umd/react-dom.development.js"), "utf8");
  const rows = compile("components/admin/suppliers/BitrefillFulfillmentRows.tsx");
  const workspace = compile("components/admin/suppliers/BitrefillFulfillmentWorkspace.tsx");
  const script = `${react}\n${dom}\nconst element=(type,props,key)=>React.createElement(type,{...props,...(key===undefined?{}:{key})});const jsx={jsx:element,jsxs:element,Fragment:React.Fragment};
    function run(source,extra){const m={exports:{}};new Function('require','exports','module',source)(n=>n==='react'?React:n==='react/jsx-runtime'?jsx:extra,m.exports,m);return m.exports;}
    const rows=run(${JSON.stringify(rows)});const workspace=run(${JSON.stringify(workspace)},rows);
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(workspace.default));`;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOCK ONLY — Bitrefill</title>
    <style>body{margin:0;padding:16px;background:#fcfaf6;color:#172033;font:14px system-ui}*{box-sizing:border-box;overflow-wrap:anywhere}article{border:1px solid #ddd;border-radius:12px;padding:16px;margin:12px 0;background:white}button{min-height:44px;margin:4px;padding:6px 16px}li{padding:8px}a{color:#b45309}summary{padding:8px;cursor:pointer}</style>
    <div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></html>`;
}
