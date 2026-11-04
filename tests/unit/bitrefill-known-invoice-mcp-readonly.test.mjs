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
