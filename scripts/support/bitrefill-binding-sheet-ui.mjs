// Loopback fixture mounts the actual existing binding sheet and provider fields.
// Radix/visual primitives are replaced; this is not a Next login/browser test.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import ts from "typescript";
const require = createRequire(import.meta.url);
export function bindingSheetHtml(root, state) {
  const compile = (path) => ts.transpileModule(readFileSync(resolve(root, path), "utf8"), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, allowJs: true } }).outputText;
  const react = readFileSync(resolve(dirname(require.resolve("react")), "umd/react.development.js"), "utf8");
  const dom = readFileSync(resolve(dirname(require.resolve("react-dom")), "umd/react-dom.development.js"), "utf8");
  const script = `${react}\n${dom}\nconst el=(t,p,k)=>React.createElement(t,{...p,...(k===undefined?{}:{key:k})});const jsx={jsx:el,jsxs:el,Fragment:React.Fragment};
    function run(src,deps={}){const m={exports:{}};new Function('require','module','exports',src)(n=>{if(n==='react')return React;if(n==='react/jsx-runtime')return jsx;if(n in deps)return deps[n];throw Error('UNEXPECTED_UI_IMPORT:'+n)},m,m.exports);return m.exports}
    const finance=run(${JSON.stringify(compile("lib/providers/bitrefill/mapping-financials.mjs"))});
    const protocol=run(${JSON.stringify(compile("lib/providers/daju/protocol.mjs"))});
    const mapper=run(${JSON.stringify(compile("lib/providers/daju/mapper.mjs"))},{'./protocol.mjs':protocol});
    const stock=run(${JSON.stringify(compile("lib/providers/daju/stock.mjs"))},{'./protocol.mjs':protocol,'./mapper.mjs':mapper});
    const fields=run(${JSON.stringify(compile("components/admin/suppliers/BitrefillSkuBindingFields.tsx"))},{'@/lib/providers/bitrefill/mapping-financials.mjs':finance});
    const box=({children,...props})=>el('div',props,undefined)&&React.createElement('div',props,children);
    const button=({variant,size,asChild,children,...props})=>asChild?React.createElement(React.Fragment,null,children):React.createElement('button',{type:'button',...props},children);
    const text=({title,description})=>React.createElement('p',null,title,description);
    const deps={'./BitrefillSkuBindingFields':fields,'next/link':{default:({href,children})=>React.createElement('a',{href},children)},
      'lucide-react':{ExternalLink:()=>null,Loader2:()=>null,Search:()=>null},'sonner':{toast:{success:()=>{},error:msg=>window.dispatchEvent(new CustomEvent('mock-toast',{detail:msg}))}},
      '@/components/admin/AdminEmptyState':{default:text},'@/components/admin/AdminErrorState':{default:text},'@/components/admin/AdminTableSkeleton':{default:()=>React.createElement('p',null,'加载中')},
      '@/components/ui/badge':{Badge:({variant,children})=>React.createElement('span',null,children)},'@/components/ui/button':{Button:button},
      '@/components/ui/input':{Input:React.forwardRef((p,r)=>React.createElement('input',{...p,ref:r}))},'@/components/ui/label':{Label:p=>React.createElement('label',p)},
      '@/components/ui/sheet':{Sheet:({open,children})=>open?React.createElement('div',{role:'dialog'},children):null,SheetContent:box,SheetDescription:box,SheetFooter:box,SheetHeader:box,SheetTitle:box},
      '@/lib/providers/daju/stock.mjs':stock};
    const sheet=run(${JSON.stringify(compile("components/admin/suppliers/AdminSupplierBindingSheet.tsx"))},deps);
    function App(){const [skus,setSkus]=React.useState(${JSON.stringify(state.product_skus)}),[active,setActive]=React.useState(null),[message,setMessage]=React.useState('');
      React.useEffect(()=>{const f=e=>setMessage(e.detail);window.addEventListener('mock-toast',f);return()=>window.removeEventListener('mock-toast',f)},[]);
      return React.createElement('main',null,React.createElement('h1',null,'MOCK 商品编辑 → 商品规格 → 供应商绑定'),...skus.map(s=>React.createElement('button',{key:s.id,onClick:()=>setActive(s.id)},'编辑 '+s.id)),
        React.createElement('p',{role:'status'},message),React.createElement(sheet.default,{open:!!active,product:${JSON.stringify(state.products[0])},sku:skus.find(s=>s.id===active)||null,
          onOpenChange:v=>{if(!v)setActive(null)},onSaved:v=>{if(v.sku)setSkus(rows=>rows.map(s=>s.id===v.sku.id?v.sku:s));setMessage('保存完成');setActive(null)}}));}
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));`;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOCK unified SKU binding</title><style>
    body{margin:0;padding:16px;background:#fcfaf6;color:#172033;font:14px system-ui}*{box-sizing:border-box;overflow-wrap:anywhere}main{max-width:900px;margin:auto}section,div,form{max-width:100%;min-width:0}section,[role=dialog]{border:1px solid #ddd;border-radius:12px;padding:14px;margin:12px 0;background:white}button,input,select{font:inherit;max-width:100%;min-height:44px;padding:6px;margin:4px;border:1px solid #ddd;border-radius:6px}input[type=checkbox]{min-height:20px}button{cursor:pointer;background:#fff8ef}button:disabled{opacity:.5}.grid{display:grid;gap:10px}.flex{display:flex;flex-wrap:wrap;gap:8px}.block{display:block}.w-full{width:100%}.overflow-auto{overflow:auto}pre{white-space:pre-wrap}[role=alert]{color:#9b2c12}@media(min-width:700px){.sm\\:grid-cols-3{grid-template-columns:1fr 1fr 1fr}.sm\\:grid-cols-2{grid-template-columns:1fr 1fr}}</style><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></html>`;
}
