import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as v2 from "../../lib/providers/daju/purchase-v2.mjs";
import * as store from "../../lib/providers/daju/purchase-v2-store.mjs";
import * as cap from "../../lib/providers/daju/purchase-capability.mjs";
import * as mapper from "../../lib/providers/daju/mapper.mjs";
import * as protocol from "../../lib/providers/daju/protocol.mjs";
import * as candidate from "../../lib/providers/daju/fulfillment-candidate.mjs";
import * as compatibility from "../../lib/providers/daju/fulfillment-core.mjs";
import * as clientCore from "../../lib/providers/daju/client-core.mjs";
import * as routerCore from "../../lib/providers/core/supplier-router-core.mjs";
import * as local from "../../lib/delivery/local-stock-priority.mjs";

function load(file,imports) {
  const js=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const m={exports:{}};new Function("require","module","exports",js)(name=>{
    if(name==="server-only")return {};
    if(Object.hasOwn(imports,name))return imports[name];throw Error("UNEXPECTED_IMPORT:"+name);
  },m,m.exports);return m.exports;
}
const errors=load("lib/providers/daju/errors.ts",{});
const client=load("lib/providers/daju/client.ts",{"./client-core.mjs":clientCore,"./errors":errors,"./purchase-capability.mjs":cap,"./purchase-v2.mjs":v2});
const handler=load("lib/providers/daju/fulfillment.ts",{"./client":client,"./purchase-v2.mjs":v2,"./purchase-v2-store.mjs":store,"./purchase-capability.mjs":cap,"./fulfillment-candidate.mjs":candidate,"./fulfillment-core.mjs":compatibility,"./mapper.mjs":mapper,"./protocol.mjs":protocol});
const router=load("lib/providers/core/supplier-router.ts",{"../daju/fulfillment":handler,"../kuajingzy/fulfillment":{fulfillKuajingZyOrderWithSupabase(){throw Error("KUAJINGZY_NOT_ALLOWED_IN_DAJU_REGRESSION")}},"./supplier-router-core.mjs":routerCore,"../bitrefill/pin-runtime.mjs":{getBitrefillPinHandler:()=>null},"../bitrefill/production-server":{ensureBitrefillProductionRuntime(){throw Error("BITREFILL_NOT_ALLOWED")}}});
const delivery=load("lib/delivery/delivery-service.ts",{"@/lib/providers/core/supplier-router":router,"./local-stock-priority.mjs":local});

test("V2 purchase reference returns before any implicit GET",async()=>{
  const requests=[];
  const c=clientCore.createDajuHttpClient({baseUrl:"https://supplier.example.invalid",apiKey:"TEST_ONLY",durableReferenceOnly:true,fetchImpl:async(url,init)=>{
    requests.push({url,method:init.method});
    return new Response(JSON.stringify({order:{order_code:"reference-only",request_id:"jianlian:order:item"}}),{status:200});
  }});
  const result=await c.purchase({productId:10,quantity:1,requestId:"jianlian:order:item"});
  assert.equal(result.orderCode,"reference-only");
  assert.equal(requests.length,1);assert.equal(requests[0].method,"POST");
});

test("ordinary Daju client cannot grant legacy generic code purchase authority",async()=>{
  const key=process.env.DAJU_API_KEY;process.env.DAJU_API_KEY="TEST_ONLY_NOT_A_REAL_KEY";
  let dispatched=0;
  try {const c=client.createDajuClient({fetchImpl:async()=>{dispatched++;throw Error("NETWORK_FORBIDDEN")}});await assert.rejects(c.purchase({productId:10,quantity:1,requestId:"jianlian:order:item"}),/DAJU_V2_REQUIRED/);assert.equal(dispatched,0);}
  finally {if(key===undefined)delete process.env.DAJU_API_KEY;else process.env.DAJU_API_KEY=key;}
});

for(const [master,mode,allow] of [["false","disabled","order"],[undefined,undefined,undefined],["true","disabled","order"],["true","canary","wrong"]]) {
test(`real delivery/router/Daju chain blocks master=${master} mode=${mode}`,async()=>{
  const names=["SUPPLIER_AUTO_PURCHASE_ENABLED","DAJU_AUTO_PURCHASE_MODE","DAJU_AUTO_PURCHASE_CANARY_ORDER_ID","DAJU_AUTO_PURCHASE_MAX_ORDER_CNY","DAJU_API_KEY"];
  const previous=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  for(const [k,v] of Object.entries({SUPPLIER_AUTO_PURCHASE_ENABLED:master,DAJU_AUTO_PURCHASE_MODE:mode,DAJU_AUTO_PURCHASE_CANARY_ORDER_ID:allow,DAJU_AUTO_PURCHASE_MAX_ORDER_CNY:"5",DAJU_API_KEY:"TEST_ONLY_NOT_A_REAL_KEY"})) {if(v===undefined)delete process.env[k];else process.env[k]=v;}
  const fetch=globalThis.fetch;let requests=0,posts=0;
  globalThis.fetch=async(_url,options)=>{requests++;if(options?.method==="POST")posts++;throw Error("REAL_NETWORK_FORBIDDEN");};
  const item={id:"item",order_id:"order",quantity:1,delivery_type:"auto_delivery",delivery_status:"pending",product_snapshot:{supplier_binding:{fulfillment_source:"supplier",supplier:"daju",supplier_product_id:10,supplier_max_unit_cost:"5",supplier_inputs_mapping:{}}}};
  const service={from(table){const b={select(){return b},eq(){return b},maybeSingle:async()=>({data:table==="orders"?{id:"order",payment_status:"paid",status:"paid"}:null,error:null}),then(resolve){return Promise.resolve({data:[item],error:null}).then(resolve)}};return b;},async rpc(name){if(name==="reserve_local_inventory_for_daju_order")return {data:{ok:true,local_ready_count:0,supplier_fallback_count:1,blocked_count:0}};if(name==="deliver_digital_order")return {data:{ok:true,delivered_count:0}};throw Error("MUTATION_FORBIDDEN:"+name);}};
  try {await assert.rejects(delivery.deliverDigitalOrder(service,"order"));assert.equal(posts,0);assert.equal(requests,0);}
  finally {globalThis.fetch=fetch;for(const k of names){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}}
});
}
