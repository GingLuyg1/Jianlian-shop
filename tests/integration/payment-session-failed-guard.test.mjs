import test from "node:test";
import assert from "node:assert/strict";
import { harness, fixture, failedRow, deferred, loadTs, source } from "../helpers/payment-session-guard-harness.mjs";
import { FAILED_SESSION_REVIEW_MESSAGE } from "../../lib/payments/payment-session-reuse.mjs";

const failed = () => Object.assign(Error("test-only uncertain create"),{code:"SNPAY_MERCHANT_MISMATCH"});
const funds = d => JSON.stringify({profiles:d.profiles,ledger:d.balance_transactions,reconciliation:d.payment_reconciliations});
async function blocked(h, code="SESSION_FAILED_REQUIRES_REVIEW") {
  const before=funds(h.data);
  await assert.rejects(h.create(),e=>e.code===code);
  assert.equal(h.stats.provider,0); assert.equal(h.stats.fundsWrites,0);
  assert.equal(funds(h.data),before);
}

for (const provider of ["snpay","liuhaoyi"]) {
  test(`${provider}: successful active session is reused without another provider dispatch`,async()=>{
    const h=harness({data:fixture(provider)});const a=await h.create(),b=await h.create();
    assert.equal(a.sessionNo,b.sessionNo);assert.equal(h.stats.provider,1);assert.equal(h.data.payment_sessions.length,1);
  });
  for (const past of [false,true]) for (const present of [false,true]) {
    test(`${provider}: failed expiry=${past?"past":"future"}, order=${present?"present":"absent"} fails closed`,async()=>{
      const data=fixture(provider);data.payment_sessions.push(failedRow(data,{provider_order_no:present?"TEST_ORDER":null,
        expires_at:new Date(Date.now()+(past?-100000:900000)).toISOString()}));
      const h=harness({data});await blocked(h);assert.equal(h.stats.reserve,0);assert.equal(data.payment_sessions.length,1);
    });
  }
}
test("pending reuse preserves one session and zero new dispatch",async()=>{
  const data=fixture();data.payment_sessions.push(failedRow(data,{status:"pending",payment_type:"qrcode",qr_code_url:"test-qr"}));
  const h=harness({data});await h.create();assert.equal(h.stats.provider,0);assert.equal(h.stats.reserve,0);
});
test("provider failure persists failed artifact-less session and blocks serial retry",async()=>{
  const h=harness({providerCreate:async()=>{throw failed();}});const before=funds(h.data);
  await assert.rejects(h.create());assert.equal(h.data.payment_sessions[0].status,"failed");
  assert.equal(h.data.payment_sessions[0].provider_order_no,null);
  await assert.rejects(h.create(),e=>e.code==="SESSION_FAILED_REQUIRES_REVIEW");
  assert.equal(h.stats.provider,1);assert.equal(h.data.payment_sessions.length,1);assert.equal(funds(h.data),before);
});
for(const status of ["succeeded","paid"]){
  test(`${status} recharge is blocked before reserve/provider`,async()=>{
    const data=fixture();data.account_recharges[0].status=status;
    const h=harness({data});await blocked(h,"BUSINESS_ALREADY_PAID");assert.equal(h.stats.reserve,0);
  });
}
test("TOCTOU: A fails after B precheck, B's reservation blocks with zero provider B",async()=>{
  const data=fixture(),bReady=deferred(),resumeB=deferred();
  const b=harness({data,beforeReserve:async()=>{bReady.resolve();await resumeB.promise;}});
  const bResult=b.create().then(()=>({unexpected:true}),error=>({error}));await bReady.promise;
  const a=harness({data,providerCreate:async()=>{throw failed();}});
  await assert.rejects(a.create());resumeB.resolve();
  const result=await bResult;assert.equal(result.error.code,"SESSION_FAILED_REQUIRES_REVIEW");
  assert.equal(a.stats.provider,1);assert.equal(b.stats.provider,0);assert.equal(data.payment_sessions.length,1);
  assert.equal(data.payment_sessions[0].status,"failed");
});
test("concurrent successful requests reuse one initialized session/provider dispatch",async()=>{
  const data=fixture(),a=harness({data}),b=harness({data});
  const [x,y]=await Promise.all([a.create(),b.create()]);assert.equal(x.sessionNo,y.sessionNo);
  assert.equal(a.stats.provider+b.stats.provider,1);assert.equal(data.payment_sessions.length,1);
});
test("missing RPC cannot fall back to unsafe recharge inserts",async()=>{
  const h=harness({missingRpc:true});await blocked(h,"SESSION_RECHARGE_GUARD_NOT_READY");
  assert.equal(h.data.payment_sessions.length,0);
});
test("old RPC without guard version cannot dispatch a provider",async()=>{
  const h=harness({oldRpc:true});await blocked(h,"SESSION_RECHARGE_GUARD_NOT_READY");
});
for(const field of ["provider","channel_code"]){
  test(`${field} mismatch never reuses a wrong session or dispatches`,async()=>{
    const data=fixture();data.payment_sessions.push(failedRow(data,{status:"pending",[field]:field==="provider"?"liuhaoyi":"wechat"}));
    const h=harness({data});await assert.rejects(h.create());assert.equal(h.stats.provider,0);
  });
}
test("real recharge POST failure + repeated client_request_id + payment POST cannot dispatch twice",async()=>{
  const data=fixture();data.account_recharges=[];
  const h=harness({data,providerCreate:async()=>{throw failed();}});
  const first=await h.rechargePost();assert.equal(first.status,503);
  assert.match((await first.json()).error,/申请可能已保留/);
  assert.equal(data.account_recharges.length,1);assert.equal(data.payment_sessions.length,1);
  const reused=await h.rechargePost();assert.equal(reused.status,200);
  const body=await reused.json();assert.equal(body.reused,true);assert.equal(data.account_recharges.length,1);
  const payment=await h.paymentPost(body.rechargeNo);assert.equal(payment.status,400);
  const result=await payment.json();assert.equal(result.code,"SESSION_FAILED_REQUIRES_REVIEW");
  assert.equal(result.error,FAILED_SESSION_REVIEW_MESSAGE);assert.equal(h.stats.provider,1);
  assert.equal(data.payment_sessions.length,1);assert.equal(h.stats.fundsWrites,0);
});

async function mountPaymentPanel(h){
  const full=source("app/payment/page.tsx"),start=full.indexOf("function LiuhaoyiRechargePaymentPanel("),end=full.indexOf("\nfunction ",start+1);
  assert.ok(start>=0&&end>start);
  const effects=[],done=deferred(),errors=[];let i=0;
  const hooks={useState:value=>{const n=i++;return [value,v=>{if(n===2)errors.push(v);if(n===3&&v===false)done.resolve();}];},
    useRef:value=>({current:value}),useEffect:fn=>effects.push(fn)};
  const globals={...hooks,isRechargePastDue:()=>false,secondsLeft:()=>900,Loader2:()=>null,
    fetch:async(url)=>{assert.equal(url,"/api/payments/create");return h.paymentPost();}};
  const ui=loadTs("app/payment/page.tsx",{"react/jsx-runtime":{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}},
    full.slice(start,end)+"\nexport { LiuhaoyiRechargePaymentPanel };",globals);
  ui.LiuhaoyiRechargePaymentPanel({recharge:{rechargeNo:h.input.businessNo,channelCode:"alipay",status:"pending",expiresAt:h.data.account_recharges[0].expires_at},onRechargeChanged:async()=>null});
  effects[1]();await done.promise;
  // Same mount rerun cannot create; a fresh mount is protected server-side.
  effects[1]();assert.deepEqual(errors,[FAILED_SESSION_REVIEW_MESSAGE]);
}
for(const kind of ["remount","reload"]){
  test(`actual payment panel ${kind} shows safe error; zero second provider dispatch`,async()=>{
    const data=fixture();data.payment_sessions.push(failedRow(data));const h=harness({data});
    await mountPaymentPanel(h);await mountPaymentPanel(h);
    assert.equal(h.stats.provider,0);assert.equal(h.data.payment_sessions.length,1);
  });
}
test("ordinary product order failed retry semantics remain unchanged",async()=>{
  const data=fixture();data.orders=[{id:"order-test",order_no:"ORDER_TEST",user_id:data.account_recharges[0].user_id,
    status:"pending_payment",payment_status:"unpaid",total_amount:1,currency:"CNY"}];
  const h=harness({data});await h.create({businessType:"order",businessNo:"ORDER_TEST"});assert.equal(h.stats.provider,1);
});
test("BEP20 is outside the guarded external gateway predicate",()=>{
  const s=source("lib/payments/payment-session-service.ts");assert.match(s,/input\.businessType === "recharge" && isLiuhaoyiPaymentMethod\(input\.channel\.code\)/);
  const sql=source("supabase/migrations/20261007140629_payment_session_failed_retry_guard_v1.sql");
  assert.match(sql,/v_recharge\.provider in \('snpay','liuhaoyi'\)/);
  assert.match(sql,/v_recharge\.channel_code in \('alipay','wechat','wechat_pay'\)/);
  assert.doesNotMatch(sql,/update public\.(profiles|account_recharges)|insert into public\.(balance_transactions|payment_reconciliations)/i);
});
