import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {patchOrderCreate,fingerprint,hookAnchor} from '../support/kuajingzy-freeze-patch.mjs';
const read=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
const base=read('tests/fixtures/kuajingzy-order-create-base.sql'),hook=read('tests/support/kuajingzy-freeze-hook.sql');
test('candidate embeds exact base and patched SHA256 and adds no table/column/signature',()=>{
 const sql=read('supabase/migrations/20261117184700_kuajingzy_order_binding_freeze_v1.sql');
 assert(sql.includes(fingerprint(base)));assert(sql.includes(fingerprint(patchOrderCreate(base,hook))));
 assert.match(sql,/SOURCE_DRIFT/);assert.match(sql,/POSTCHECK_FAILED/);assert.match(sql,/ANCHOR_DRIFT/);
 assert.doesNotMatch(sql,/create table|alter table|add column/i);
 assert(!hook.includes('p_shipping_address'));assert(!hook.includes('p_customer_note'));
});
test('missing or duplicate anchors fail closed; Daju and Bitrefill hooks mandatory',()=>{
 assert.throws(()=>patchOrderCreate(base.replace(hookAnchor,''),hook));
 assert.throws(()=>patchOrderCreate(base+'\n'+hookAnchor,hook));
 for(const name of ['consume_quote','attach_quote','replay_guard'])assert.throws(()=>patchOrderCreate(base.replaceAll(name,'unknown'),hook));
});
test('price, payment, inventory, Daju and Bitrefill original code is retained verbatim',()=>{
 const patched=patchOrderCreate(base,hook);
 for(const text of ["v_line_total := round((v_unit_price * v_quantity)::numeric, 2);","and coalesce(v_sku.metadata->>'supplier', v_product.metadata->>'supplier') = 'daju';",
 "if v_auto_delivery and not v_supplier_delivery then","perform bitrefill_pin_private.attach_quote","perform pg_advisory_xact_lock"]){
   assert(base.includes(text));assert(patched.includes(text));
 }
 const restored=patched.replace('  v_kuajingzy_binding jsonb := null;\n  v_kj_metadata jsonb;\n','')
 .replace(hook+'\n','').replace("when v_kuajingzy_binding is not null then v_kuajingzy_binding ",'');
 assert.equal(restored,base);
});
