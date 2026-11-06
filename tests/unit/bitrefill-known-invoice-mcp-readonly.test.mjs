import test from 'node:test';
import assert from 'node:assert/strict';
import { createBitrefillMcpReadonlyClient, normalizeBitrefillMcpKnownInvoiceStatus } from '../../lib/providers/bitrefill/mcp-readonly-client.mjs';
const invoiceId='11111111-1111-4111-8111-111111111111', secret='SYNTHETIC_PRIVATE_PIN';
const obs={invoiceId,accountFingerprint:'a'.repeat(64),checkedAt:'2026-11-04T12:00:00Z'};
const raw=(status='complete')=>({content:[{type:'text',text:'invoice_id: "'+invoiceId+'"\ninvoice_status: '+status+'\norders[1]:\n  - redemption_info: '+secret}]});
function fixture(payload=raw()) {
  const calls=[];
  const client=createBitrefillMcpReadonlyClient({credentials:{authMode:'personal',apiKey:'synthetic-key'},
    fetchImpl:async(url,opts)=>{calls.push({url,method:opts.method,body:JSON.parse(opts.body)});
      return Response.json({jsonrpc:'2.0',id:calls.length,result:payload});}});
  return {calls,client};
}
test('only the known invoice read tool is invoked; secrets and pricing proof are never emitted',async()=>{
  const f=fixture(),out=await f.client.readKnownInvoiceStatus(invoiceId);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].url,'https://api.bitrefill.com/mcp');
  assert.equal(f.calls[0].method,'POST'); // read-only MCP JSON-RPC envelope, not purchase
  assert.deepEqual(f.calls[0].body.params,{name:'get-invoice-by-id',arguments:{invoice_id:invoiceId}});
  assert.equal(out.invoiceIdentityVerified,true);
  assert.equal(out.invoiceComplete,true);
  assert.equal(out.childIdentityVerified,false);
  assert.equal(out.finalUsdDebitVerified,false);
  assert.equal(out.feesIncludedVerified,false);
  assert.equal(out.supplierEnforcedDebitCapVerified,false);
  assert.equal(out.purchaseSubmitted,false);
  assert.equal(JSON.stringify(out).includes(secret),false);
  assert.equal(JSON.stringify(out).includes('synthetic-key'),false);
  assert.ok(Object.isFrozen(out));
  assert.equal(typeof f.client.createInvoice,'undefined');
});
for(const [status,complete] of [['unpaid',false],['payment_detected',false],['payment_confirmed',false],['complete',true],['blocked',false]]){
  test('known invoice status '+status+' does not prove child delivery',()=>{
    const out=normalizeBitrefillMcpKnownInvoiceStatus(raw(status),obs);
    assert.equal(out.invoiceStatus,status);
    assert.equal(out.invoiceComplete,complete);
    assert.equal(out.childIdentityVerified,false);
  });
}
test('invalid ID rejected without making a tool request',async()=>{
  const f=fixture();
  for(const bad of ['',null,'other','../invoice',invoiceId+'?token=secret']){
    await assert.rejects(f.client.readKnownInvoiceStatus(bad),/KNOWN_INVOICE_ID_INVALID/);
  }
  assert.equal(f.calls.length,0);
});
test('bad identity or unknown/duplicate invoice status is rejected',()=>{
  for(const text of ['invoice_id: 00000000-0000-0000-0000-000000000000\ninvoice_status: complete',
    'invoice_id: '+invoiceId,'invoice_id: '+invoiceId+'\ninvoice_status: settled',
    'invoice_id: '+invoiceId+'\ninvoice_status: complete\ninvoice_status: blocked']){
    assert.throws(()=>normalizeBitrefillMcpKnownInvoiceStatus({content:[{type:'text',text}]},obs),/KNOWN_INVOICE_INVALID/);
  }
});
test('supplier tool errors are not accepted as invoice status',async()=>{
  const f=fixture({isError:true,content:[{type:'text',text:secret}]});
  await assert.rejects(f.client.readKnownInvoiceStatus(invoiceId),/MCP_TOOL_ERROR/);
});

const nested=()=>({content:[{type:'text',text:[
  'invoice_id: '+invoiceId,
  'invoice_status: complete',
  'orders_delivery_status: all_delivered',
  'created_time: synthetic-time',
  'all_orders_delivered_time: synthetic-time',
  'payment_confirmed_time: synthetic-time',
  'detected_payment_info:',
  '  method: balance',
  '  currency: USD',
  '  price: 13.00',
  '  status: complete',
  '  partial_payment: false',
  'invoice_access_token: '+secret,
  'checkout_url: https://example.test/checkout?token='+secret,
  'orders[1]:',
  '  - order_id: SYNTHETIC_CHILD',
  '    invoice_id: '+invoiceId,
  '    status: delivered',
  '    product:',
  '      id: SYNTHETIC_PRODUCT',
  '    redemption_info:',
  '      code: '+secret,
  '      pin: '+secret,
].join('\n')}]});

test('observed nested TOON child invoice_id is not a duplicate root invoice_id',async()=>{
  const f=fixture(nested()),out=await f.client.readKnownInvoiceStatus(invoiceId);
  assert.equal(f.calls.length,1);
  assert.equal(out.invoiceComplete,true);
  assert.equal(out.invoiceIdentityVerified,true);
  for(const k of ['childIdentityVerified','finalUsdDebitVerified','feesIncludedVerified','supplierEnforcedDebitCapVerified','purchaseSubmitted']) assert.equal(out[k],false);
  for(const value of [secret,'SYNTHETIC_CHILD','SYNTHETIC_PRODUCT','checkout','redemption','13.00','synthetic-key']) assert.equal(JSON.stringify(out).includes(value),false);
});

test('nested identity and status cannot supply or overwrite root proof',()=>{
  for(const text of [
    'orders[1]:\n    invoice_id: '+invoiceId+'\n    invoice_status: complete',
    'invoice_id: 00000000-0000-0000-0000-000000000000\ninvoice_status: complete\norders[1]:\n    invoice_id: '+invoiceId,
    'invoice_id: '+invoiceId+'\ninvoice_status: blocked\norders[1]:\n    invoice_status: complete',
  ]){
    if(text.includes('invoice_status: blocked')) assert.equal(normalizeBitrefillMcpKnownInvoiceStatus({content:[{type:'text',text}]},obs).invoiceComplete,false);
    else assert.throws(()=>normalizeBitrefillMcpKnownInvoiceStatus({content:[{type:'text',text}]},obs),/KNOWN_INVOICE_INVALID/);
  }
});

for(const [label,change] of [
  ['duplicate root id',t=>t+'\ninvoice_id: '+invoiceId],
  ['duplicate root status',t=>t+'\ninvoice_status: complete'],
  ['conflicting root status',t=>t+'\ninvoice_status: blocked'],
  ['unknown root field',t=>t+'\nnew_status: complete'],
  ['unknown delivery status',t=>t.replace('orders_delivery_status: all_delivered','orders_delivery_status: settled')],
  ['conflicting delivery state',t=>t.replace('invoice_status: complete','invoice_status: blocked')],
  ['unknown root state',t=>t.replace('invoice_status: complete','invoice_status: all_delivered')],
  ['status array',t=>t.replace('invoice_status: complete','invoice_status[1]: complete')],
  ['tab-indented root',t=>t.replace('invoice_id: ','\tinvoice_id: ')],
]) test('observed MCP shape rejects '+label,()=>{
  const payload=nested();payload.content[0].text=change(payload.content[0].text);
  assert.throws(()=>normalizeBitrefillMcpKnownInvoiceStatus(payload,obs),e=>{
    assert.equal(e.message,'BITREFILL_MCP_KNOWN_INVOICE_INVALID');assert.equal(String(e).includes(secret),false);return true;
  });
});

test('unobserved structuredContent, JSON text and multiple text blocks stay rejected',()=>{
  for(const payload of [
    {...nested(),structuredContent:{invoice_id:invoiceId,invoice_status:'complete'}},
    {content:[{type:'text',text:JSON.stringify({invoice_id:invoiceId,invoice_status:'complete'})}]},
    {content:[...nested().content,...nested().content]},
  ]) assert.throws(()=>normalizeBitrefillMcpKnownInvoiceStatus(payload,obs),/KNOWN_INVOICE_INVALID/);
});

test('unauthorized MCP fails without exposing error body or retrying',async()=>{
  let calls=0;
  const c=createBitrefillMcpReadonlyClient({credentials:{authMode:'personal',apiKey:'synthetic-key'},fetchImpl:async()=>{
    calls++;return new Response(secret,{status:403});
  }});
  await assert.rejects(c.readKnownInvoiceStatus(invoiceId),e=>e.message==='BITREFILL_MCP_AUTH_FAILED'&&!String(e).includes(secret));
  assert.equal(calls,1);
});

test('missing MCP authorization cannot invoke a tool',()=>{
  assert.throws(()=>createBitrefillMcpReadonlyClient({credentials:{authMode:'personal',apiKey:''},
    fetchImpl:async()=>{throw Error('NETWORK_FORBIDDEN');}}),/PERSONAL_CREDENTIALS_REQUIRED/);
});
