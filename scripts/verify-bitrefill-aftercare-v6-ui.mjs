// Loopback-only regression of the actual customer components and support event.
// PublicLayout/Next primitives are fixture substitutes, not a production login.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { createServer } from "node:http";
import ts from "typescript";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { listenMock, closeMock, mockJson } from "./support/bitrefill-mock-supplier.mjs";
const require = createRequire(import.meta.url);
const directory = "D:/Jianlian/_bitrefill_security_aftercare_v6_20261025";
await mkdir(directory, { recursive: true });
const compile = async (path) => ts.transpileModule(await readFile(new URL(`../${path}`, import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const [react, dom, panel, history, support] = await Promise.all([
  readFile(`${dirname(require.resolve("react"))}/umd/react.development.js`, "utf8"),
  readFile(`${dirname(require.resolve("react-dom"))}/umd/react-dom.development.js`, "utf8"),
  compile("components/refunds/OrderRefundPanel.tsx"), compile("app/account/refunds/page.tsx"),
  compile("lib/support/open-public-support.ts"),
]);
const runtime = `${react}\n${dom}\n
const el=(t,p,k)=>React.createElement(t,{...p,...(k===undefined?{}:{key:k})});
const jsx={jsx:el,jsxs:el,Fragment:React.Fragment};
function run(code,deps){const m={exports:{}};new Function('require','module','exports',code)(n=>{
 if(n==='react')return React;if(n==='react/jsx-runtime')return jsx;if(n in deps)return deps[n];throw Error('UNEXPECTED_IMPORT:'+n);
},m,m.exports);return m.exports;}
const support=run(${JSON.stringify(support)},{});
window.supportEvents=0;addEventListener(support.OPEN_PUBLIC_SUPPORT_EVENT,()=>{window.supportEvents++});
const deps={'next/link':{default:({href,children,...p})=>React.createElement('a',{href,...p},children)},
 '@/lib/refunds/refund-utils':{REFUND_STATUS_LABELS:{succeeded:'已完成'},formatMoney:v=>String(v)},
 '@/lib/support/open-public-support':support,
 '@/components/layout/PublicLayout':{default:({children})=>React.createElement(React.Fragment,null,children)},
 'lucide-react':{ArrowLeft:()=>null,RefreshCcw:()=>null}};
const view=new URL(location.href).searchParams.get('view');
const component=run(view==='history'?${JSON.stringify(history)}:${JSON.stringify(panel)},deps);
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(view==='history'?component.default:component.OrderRefundPanel,
 {orderNo:'MOCK-V6-ORDER',totalAmount:10,status:'completed',paymentStatus:'paid'}));`;
let empty = false, writes = 0, browser, origin;
const server = createServer((request, response) => {
  const url = new URL(request.url, origin);
  if (request.method !== "GET") { writes++; return mockJson(response, 410, { code: "CUSTOMER_REFUND_REQUEST_DISABLED" }); }
  if (url.pathname === "/api/refunds") return mockJson(response, 200, { refunds: empty ? [] : [{ id: "mock-refund", refundNo: "MOCK-V6-HISTORY",
    orderNo: "MOCK-V6-ORDER", requestedAmount: 10, approvedAmount: 10, status: "succeeded", currency: "CNY", reasonCode: "other" }] });
  if (url.pathname !== "/") return mockJson(response, 404, {});
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>*{box-sizing:border-box}body{margin:0;padding:16px;font:14px system-ui}main,section,div{max-width:100%;min-width:0}section{padding:16px;border:1px solid #ddd;border-radius:12px}button,a{display:inline-block;padding:10px;margin:4px;min-height:44px}button{cursor:pointer}.flex{display:flex;flex-wrap:wrap;gap:8px}.grid{display:grid;gap:8px}.overflow-auto{overflow:auto}table{min-width:980px}td,th{padding:8px}</style>
    <div id="root"></div><script>${runtime.replaceAll("</script", "<\\/script")}</script></html>`);
});
const checks = [], errors = [];
try {
  origin = await listenMock(server);
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext();
  await context.route("**/*", (r) => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
  const page = await context.newPage(); page.setDefaultTimeout(8000); page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin); await page.getByText("MOCK-V6-HISTORY", { exact: true }).waitFor();
  assert.equal(await page.locator("form,input,textarea").count(), 0);
  assert.equal(await page.getByRole("button", { name: /申请|提交/ }).count(), 0); checks.push("actual_panel_no_customer_application");
  checks.push("actual_panel_legacy_history_visible");
  await page.getByRole("button", { name: "联系人工客服", exact: true }).click();
  assert.equal(await page.evaluate(() => window.supportEvents), 1); checks.push("existing_public_support_event_dispatched");
  assert.equal(await page.getByRole("link", { name: "查看全部" }).getAttribute("href"), "/account/refunds");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${directory}/customer-panel-${width}.png`, fullPage: true }); checks.push(`panel_${width}_no_overflow`);
  }
  await page.goto(`${origin}/?view=history`); await page.getByText("MOCK-V6-HISTORY", { exact: true }).waitFor();
  assert.equal(await page.locator("form,input,textarea").count(), 0); checks.push("actual_history_page_retained_readonly");
  empty = true; await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page.getByText("暂无退款记录", { exact: true }).waitFor();
  assert.ok(!(await page.locator("body").innerText()).includes("提交退款申请")); checks.push("history_empty_state_manual_support_only");
  assert.equal(writes, 0); assert.deepEqual(errors, []); checks.push("no_customer_post_or_js_error");
  await context.close();
} finally { await browser?.close(); await closeMock(server); }
const result = { passed: true, checks, actualComponents: true, externalNetworkBlocked: true,
  publicLayoutStubbed: true, liveSupabaseLoginUsed: false, writes };
await writeFile(`${directory}/ui-result.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
