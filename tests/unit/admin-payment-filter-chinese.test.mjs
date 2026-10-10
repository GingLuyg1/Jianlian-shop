import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import * as jsx from 'react/jsx-runtime';
import {loadTs} from '../helpers/payment-session-guard-harness.mjs';
const {PAYMENT_STATUS_VALUES,getUnifiedPaymentStatusLabel}=loadTs('lib/payments/admin-payment-types.ts',{});
const expected={pending:'等待支付',processing:'处理中',paid:'已支付',failed:'支付失败',expired:'已过期',closed:'已关闭',refunded:'已退款'};
const source=readFileSync(new URL('../../components/admin/payments/AdminPaymentRecordsPage.tsx',import.meta.url),'utf8');
test('unified payment labels translate exactly without changing enum values',()=>{
  assert.deepEqual([...PAYMENT_STATUS_VALUES],Object.keys(expected));
  for(const [raw,label] of Object.entries(expected))assert.equal(getUnifiedPaymentStatusLabel(raw),label);
  assert.match(source,/getUnifiedPaymentStatusLabel\(payment.status\)/);
});
for(const mode of ['payments','recharges'])test(`${mode}: actual status select renders Chinese labels and submits raw query values`,()=>{
  const route=readFileSync(new URL(`../../app/admin/${mode}/page.tsx`,import.meta.url),'utf8');
  assert.match(route,new RegExp(`AdminPaymentRecordsPage mode="${mode}"`));
  const sf=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let selected;
  function visit(n){if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(sf)==='select'&&n.openingElement.attributes.properties.some(p=>p.name?.getText(sf)==='aria-label'&&p.initializer?.text==='支付状态'))selected=n.getText(sf);ts.forEachChild(n,visit);}visit(sf);
  assert.ok(selected,'real payment status select exists');
  const code=ts.transpileModule(`export default function Render(){return (${selected})}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod={exports:{}};let submitted,page;
  Function('require','exports','PAYMENT_STATUS_VALUES','getUnifiedPaymentStatusLabel','status','setStatus','setPage','cn','adminListControlClass',code)(()=>jsx,mod.exports,PAYMENT_STATUS_VALUES,getUnifiedPaymentStatusLabel,'all',v=>submitted=v,v=>page=v,(...v)=>v.join(' '),'');
  const html=renderToStaticMarkup(createElement(mod.exports.default));
  for(const [raw,label] of Object.entries(expected)){
    assert.ok(html.includes(`value="${raw}">${label}</option>`));
    assert.ok(!html.includes(`>${raw}</option>`));
    const node=mod.exports.default();node.props.onChange({target:{value:raw}});
    assert.equal(submitted,raw);assert.equal(page,1);
    const query=new URLSearchParams({status:submitted});assert.equal(query.get('status'),raw);
  }
  assert.ok(/new URLSearchParams\([\s\S]*?\bstatus,/.test(source),'query payload uses raw status state');
});
