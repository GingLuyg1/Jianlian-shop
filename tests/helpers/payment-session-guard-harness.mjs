import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import * as contracts from "../../lib/payments/provider-contracts.mjs";
import * as onlinePolicy from "../../lib/payments/online-payment-policy.mjs";
import * as expiry from "../../lib/payments/payment-expiry.mjs";
import * as limits from "../../lib/payments/liuhaoyi-limits.mjs";
import * as reuse from "../../lib/payments/payment-session-reuse.mjs";
import * as readiness from "../../lib/payments/manual-channel-readiness.mjs";
import * as liuhaoyiCore from "../../lib/payments/providers/liuhaoyi-core.mjs";
import * as submit from "../../lib/payments/providers/liuhaoyi-submit.mjs";
import * as snpayCore from "../../lib/payments/providers/snpay-core.mjs";
import * as rate from "../../lib/payments/recharge-rate.mjs";
import * as rechargeFailure from "../../lib/payments/recharge-api-failure.mjs";

export const root = new URL("../../", import.meta.url);
export const source = file => readFileSync(new URL(file, root), "utf8");
const forbidden = () => { throw Error("REAL_NETWORK_OR_FUNDS_FORBIDDEN"); };
export function loadTs(file, imports, text = source(file), globals = {}) {
  const { fetch: fetchImpl = forbidden, ...extra } = globals;
  const code = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const m = { exports: {} };
  new Function("require", "module", "exports", "fetch", ...Object.keys(extra), code)(name => {
    if (name === "server-only") return {};
    if (name === "@/lib/payments/online-payment-policy.mjs") return onlinePolicy;
    if (Object.hasOwn(imports, name)) return imports[name];
    throw Error("UNMOCKED_IMPORT:" + name);
  }, m, m.exports, fetchImpl, ...Object.values(extra));
  return m.exports;
}
export const uid = "10000000-0000-4000-8000-000000000001";
export const rid = "10000000-0000-4000-8000-000000000002";
export function fixture(provider = "snpay", channel = "alipay") {
  return { account_recharges: [{ id: rid, recharge_no: "RC_TEST_GUARD", user_id: uid,
    status: "pending", provider, channel_code: channel, currency: "CNY", amount: 1,
    requested_amount: 1, fee_amount: 0, payable_amount: 1, credited_amount: 0,
    expires_at: new Date(Date.now() + 900000).toISOString(), client_request_id: "guard-request" }],
    payment_sessions: [], orders: [],
    payment_channels: [{ channel, code: channel, provider, provider_name: provider, currency: "CNY",
      enabled: true, configured: true, minimum_amount: 1, min_amount: 1, fee_rate: 0,
      public_config: { review_mode: "provider", maximum_amount: 2000 }, sort_order: 1 }],
    profiles: [{ id: uid, balance: 29 }], balance_transactions: [], payment_reconciliations: [] };
}
export function failedRow(data, overrides = {}) {
  const r = data.account_recharges[0];
  return { id: randomUUID(), session_no: "PS_TEST_" + randomUUID(), business_type: "recharge",
    business_id: r.id, business_no: r.recharge_no, user_id: r.user_id,
    channel_code: r.channel_code, provider: r.provider, currency: "CNY", requested_amount: 1,
    fee_amount: 0, payable_amount: 1, status: "failed", payment_type: "redirect",
    expires_at: r.expires_at, created_at: new Date().toISOString(), metadata: { initializing: false },
    provider_order_no: null, ...overrides };
}
export function deferred() {
  let resolve, reject;
  const promise = new Promise((a,b) => { resolve=a; reject=b; });
  return { promise, resolve, reject };
}
export function harness({ data = fixture(), backend, beforeReserve = async () => {}, providerCreate,
    missingRpc = false, oldRpc = false } = {}) {
  const stats = { provider: 0, reserve: 0, fundsWrites: 0 };
  const read = async table => {
    assert.ok(Object.hasOwn(data, table), "TABLE_SCOPE:" + table);
    return backend ? backend.read(table) : data[table];
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: uid } }, error: null }) },
    from(table) {
      let filters=[], max=null, sort=null, operation=null, payload=null;
      const query = {
        select() { return query; }, eq(k,v) { filters.push(r=>r[k]===v); return query; },
        neq(k,v) { filters.push(r=>r[k]!==v); return query; },
        in(k,v) { filters.push(r=>v.includes(r[k])); return query; },
        gt(k,v) { filters.push(r=>String(r[k])>String(v)); return query; },
        or() { return query; }, limit(v) { max=v; return query; },
        order(k,{ascending}) { sort={k,ascending}; return query; },
        update(v) { operation="update"; payload=v; return query; },
        insert(v) { operation="insert"; payload=v; return query; },
        async result(single) {
          if (operation && !["payment_sessions","account_recharges"].includes(table)) {
            stats.fundsWrites++; throw Error("FUNDS_WRITE_FORBIDDEN");
          }
          let values=(await read(table)).filter(r=>filters.every(f=>f(r)));
          if (operation) {
            if (backend) values=await backend.write(table,operation,payload,values);
            else if (operation==="insert") {
              const existing=data[table].find(r=>payload.client_request_id && r.client_request_id===payload.client_request_id);
              if (existing) return { data: null, error: { code: "23505" } };
              const row={ id: randomUUID(), created_at:new Date().toISOString(), ...payload };
              data[table].push(row); values=[row];
            } else values.forEach(r=>Object.assign(r,payload));
          }
          if (sort) values.sort((a,b)=>String(a[sort.k]).localeCompare(String(b[sort.k]))*(sort.ascending?1:-1));
          if (max!==null) values=values.slice(0,max);
          return { data: structuredClone(single ? values[0] ?? null : values), error:null };
        },
        maybeSingle() { return query.result(true); }, single() { return query.result(true); },
        then(a,b) { return query.result(false).then(a,b); },
      }; return query;
    },
    async rpc(name,args) {
      assert.equal(name,"reserve_payment_session"); stats.reserve++; await beforeReserve(args);
      if (missingRpc) return { error:{code:"PGRST202",message:"Could not find public.reserve_payment_session in the schema cache"}, data:null };
      if (backend) return { data:await backend.reserve(args), error:null };
      const rows=data.payment_sessions.filter(s=>s.business_id===args.p_business_id);
      const active=rows.find(s=>["pending","processing"].includes(s.status)&&Date.parse(s.expires_at)>Date.now());
      if (active) return { data:{created:false,session:structuredClone(active),retryGuardVersion:1},error:null };
      if (args.p_business_type==="recharge" && rows.some(s=>s.status==="failed"))
        return { data:{created:false,blocked:true,blockCode:"SESSION_FAILED_REQUIRES_REVIEW",retryGuardVersion:1},error:null };
      const row={...failedRow(data),session_no:args.p_session_no,business_type:args.p_business_type,
        business_id:args.p_business_id,business_no:args.p_business_no,user_id:args.p_user_id,
        channel_code:args.p_channel_code,provider:args.p_provider,currency:args.p_currency,
        requested_amount:args.p_requested_amount,fee_amount:args.p_fee_amount,payable_amount:args.p_payable_amount,
        expires_at:args.p_expires_at,status:"processing",metadata:{initializing:true}};
      data.payment_sessions.push(row);
      return { data:{created:true,session:structuredClone(row),...(oldRpc?{}:{retryGuardVersion:1})},error:null };
    },
  };
  const provider={ async createPayment(input) {
    stats.provider++;
    if (providerCreate) return providerCreate(input);
    return {status:"pending",paymentType:"qrcode",qrCodeValue:"test-only-qr",providerOrderNo:"TEST_ORDER_"+input.sessionNo};
  } };
  const utils=loadTs("lib/payments/recharge-utils.ts", {
    "@/lib/payments/manual-channel-readiness.mjs":readiness,
    "@/lib/recharges/status-machine":{normalizeRechargeStatus:s=>s},
  });
  const registry=loadTs("lib/payments/providers.ts", {
    "@/lib/payments/providers/liuhaoyi":{liuhaoyiProvider:provider},
    "@/lib/payments/providers/snpay":{snpayProvider:provider},
  });
  const service=loadTs("lib/payments/payment-session-service.ts", {
    "@/lib/payments/payment-errors":{getSafeErrorMessage:(e,f)=>e?.message??f},
    "@/lib/payments/payment-expiry.mjs":expiry,
    "@/lib/payments/provider-contracts.mjs":contracts,
    "@/lib/payments/liuhaoyi-limits.mjs":limits,
    "@/lib/payments/providers":registry,
    "@/lib/payments/providers/liuhaoyi-core.mjs":liuhaoyiCore,
    "@/lib/payments/providers/liuhaoyi-submit.mjs":submit,
    "@/lib/payments/providers/snpay-core.mjs":snpayCore,
    "@/lib/payments/payment-session-reuse.mjs":reuse,
    "@/lib/payments/recharge-utils":utils,
    "@/lib/supabase/service-role":{getSupabaseServiceRoleClient:()=>client},
  });
  const auth={ok:true,user:{id:uid},supabase:client};
  const security={checkRequestSize:()=>null,checkRateLimit:()=>({allowed:true}),getUserRateLimitKey:()=>"test-user",getBusinessRateLimitKey:()=>"test-business"};
  const risk={evaluatePaymentRisk:async()=>({}),evaluateRechargeRisk:async()=>({}),shouldBlockRisk:()=>false,riskResponseMessage:()=>"test-only"};
  const guard={assertUserBusinessAllowed:async()=>{},isAccountRestrictionError:()=>false};
  const response={NextResponse:{json:(body,options)=>Response.json(body,options)}};
  const route=loadTs("app/api/payments/create/route.ts", {
    "next/server":response,"@/lib/admin/api-auth":{requireApiUser:async()=>auth},
    "@/lib/users/account-guard":guard,"@/lib/payments/payment-errors":{getSafeErrorMessage:(e,f)=>e?.message??f,isPaymentSchemaMissing:()=>false},
    "@/lib/payments/payment-session-service":service,"@/lib/payments/request-client-ip":{getPaymentClientIp:()=>"127.0.0.1"},
    "@/lib/payments/request-client-device.mjs":{derivePaymentClientDevice:()=>"pc"},
    "@/lib/risk/risk-service":risk,"@/lib/security/rate-limit":security,
  });
  const amounts=loadTs("lib/payments/channels.ts", {"@/lib/i18n/money":{formatCurrency:String}});
  const rechargeRoute=loadTs("app/api/recharges/route.ts", {
    "node:crypto":{randomUUID},"next/server":response,"@/lib/payments/channels":amounts,
    "@/lib/payments/recharge-api-failure.mjs":rechargeFailure,"@/lib/payments/liuhaoyi-limits.mjs":limits,
    "@/lib/payments/payment-session-service":service,"@/lib/payments/providers":registry,
    "@/lib/payments/provider-contracts.mjs":contracts,"@/lib/payments/request-client-ip":{getPaymentClientIp:()=>"127.0.0.1"},
    "@/lib/payments/request-client-device.mjs":{derivePaymentClientDevice:()=>"pc"},
    "@/lib/payments/recharge-rate.mjs":rate,"@/lib/payments/recharge-rate-service":{loadCurrentRechargeDailyRate:forbidden},
    "@/lib/payments/payment-expiry.mjs":expiry,"@/lib/payments/recharge-expiry-service":{expireOverdueLiuhaoyiRecharges:forbidden},
    "@/lib/payments/manual-channel-readiness.mjs":readiness,"@/lib/payments/recharge-utils":utils,
    "@/lib/risk/risk-service":risk,"@/lib/security/rate-limit":security,
    "@/lib/supabase/server":{hasSupabaseServerConfig:()=>true,getSupabaseServerClient:()=>client},
    "@/lib/supabase/service-role":{getSupabaseServiceRoleClient:()=>client},"@/lib/users/account-guard":guard,
    "@/lib/recharges/status-machine":{parseRechargeStatusStrict:s=>s},
  });
  const input={businessType:"recharge",businessNo:data.account_recharges[0]?.recharge_no??"RC_TEST_GUARD",channelCode:data.payment_channels[0].code,userId:uid,clientIp:"127.0.0.1"};
  return {data,stats,client,service,input,rechargeRoute,
    create:(overrides={})=>service.createPaymentSession({...input,...overrides}),
    paymentPost:(businessNo=input.businessNo)=>route.POST(new Request("https://test.invalid/api/payments/create",{method:"POST",body:JSON.stringify({businessType:"recharge",businessNo,channel:input.channelCode})})),
    rechargePost:()=>rechargeRoute.POST(new Request("https://test.invalid/api/recharges",{method:"POST",body:JSON.stringify({channel:input.channelCode,currency:"CNY",amount:"1.00",client_request_id:"guard-request"})})),
  };
}
