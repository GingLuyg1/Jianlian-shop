import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateExternalBuyerFee, onlineOrderPrincipal, isStrictPositiveCny, isOnlineCnyOverLimit, ONLINE_PAYMENT_LIMIT_MESSAGE } from "../../lib/payments/online-payment-policy.mjs";
import { providerAmountWithinLimits } from "../../lib/payments/provider-contracts.mjs";
import { fixture, harness, loadTs } from "../helpers/payment-session-guard-harness.mjs";
import * as crypto from "node:crypto";
import * as chainLogic from "../../lib/payments/bep20-chain-logic.mjs";
import * as expiry from "../../lib/payments/payment-expiry.mjs";

const capability = { supportedCurrencies: ["CNY"], minimumAmount: 0.01, maximumAmount: 2000 };
const source = path => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

for (const reason of ["disabled", "unconfigured", "over_limit"]) {
  test(`BEP20 new-session ${reason} gate precedes RPC and chain network`, async () => {
    let writes = 0, network = 0;
    const forbiddenWrite = () => { writes++; throw Error("WRITE_FORBIDDEN"); };
    const service = { from(table) {
      const query = { select() { return query; }, eq() { return query; },
        insert: forbiddenWrite, update: forbiddenWrite,
        async maybeSingle() { return { data: table === "orders"
          ? {id:"test-order",order_no:"test-order",user_id:"test-user",payment_method:"usdt_bep20",status:"pending",payment_status:"unpaid",currency:"CNY",total_amount:reason === "over_limit" ? 2000.01 : 1}
          : {enabled:reason !== "disabled",configured:reason !== "unconfigured"}, error:null }; } };
      return query;
    }, rpc: forbiddenWrite };
    const module = loadTs("lib/payments/bep20-chain-service.ts", {
      crypto, "@/lib/payments/bep20-chain-logic.mjs": chainLogic,
      "@/lib/delivery/delivery-service": {}, "@/lib/payments/complete-payment-service": {},
      "@/lib/payments/payment-expiry.mjs": expiry,
      "@/lib/supabase/service-role": {getSupabaseServiceRoleClient:()=>service},
    }, undefined, {fetch:()=>{network++;throw Error("NETWORK_FORBIDDEN");}});
    await assert.rejects(() => module.createBep20PaymentSession("test-order", "test-user"), error =>
      error.code === (reason === "over_limit" ? "ONLINE_PAYMENT_LIMIT_EXCEEDED" : "CHANNEL_UNAVAILABLE"));
    assert.equal(writes, 0); assert.equal(network, 0);
  });
}

test("order price times quantity uses exact minor units, not binary float rounding", () => {
  assert.equal(onlineOrderPrincipal("14.84", 3), "44.52");
  assert.equal(onlineOrderPrincipal(0.1, 3), "0.30");
  assert.equal(onlineOrderPrincipal("1000.01", 2), "2000.02");
  assert.equal(onlineOrderPrincipal("1.001", 1), null);
  assert.equal(onlineOrderPrincipal("1", 1.5), null);
});

test("real recharge POST rejects over-limit/overprecision before any business write", async () => {
  for (const amount of ["2000.01", "1.001", -1, 0, "NaN", "Infinity"]) {
    const h = harness();
    const before = JSON.stringify(h.data);
    const response = await h.rechargeRoute.POST(new Request("https://test.invalid/api/recharges", {method:"POST", body:JSON.stringify({channel:"alipay", currency:"CNY", amount})}));
    assert.equal(response.status, 400);
    assert.equal(h.stats.provider, 0);
    assert.equal(h.stats.reserve, 0);
    assert.equal(JSON.stringify(h.data), before);
  }
});

for (const [principal, fee, total] of [["100.00", "3.00", "103.00"], ["0.01", "0.00", "0.01"],
  ["0.50", "0.02", "0.52"], ["1999.99", "60.00", "2059.99"], ["2000", "60.00", "2060.00"]]) {
  test(`cashier 3% estimate ${principal}; never changes API payable or credit`, () => {
    const result = estimateExternalBuyerFee(principal);
    assert.equal(result.buyerFeeEstimate, fee);
    assert.equal(result.cashierTotalEstimate, total);
    assert.equal(result.apiPayable, result.principal);
    assert.equal(result.creditPrincipal, result.principal);
    assert.equal(result.siteFee, "0.00");
  });
}
for (const value of [-1, 0, NaN, Infinity, "-1", "1.001", 1.001, "1e3", {}, ""]) {
  test(`strict CNY rejects ${String(value)}`, () => {
    assert.equal(isStrictPositiveCny(value), false);
    assert.equal(providerAmountWithinLimits(capability, {}, value), false);
    assert.equal(estimateExternalBuyerFee(value), null);
  });
}
test("principal limit: 2000 allowed even when external cashier estimate exceeds 2000", () => {
  assert.equal(isOnlineCnyOverLimit("2000.00"), false);
  assert.equal(providerAmountWithinLimits(capability, {}, "2000.00"), true);
  assert.equal(isOnlineCnyOverLimit("2000.01"), true);
  assert.equal(providerAmountWithinLimits(capability, {}, "2000.01"), false);
});
for (const channel of ["alipay", "wechat"]) {
  test(`${channel} order limit/disabled/fee misconfiguration never creates a session`, async () => {
    for (const reason of ["over_limit", "disabled", "double_fee"]) {
      const data = fixture("snpay", channel);
      data.orders.push({id:"test-order",order_no:"ORDER_TEST",user_id:data.account_recharges[0].user_id,
        status:"pending",payment_status:"unpaid",total_amount:reason === "over_limit" ? 2000.01 : 100,currency:"CNY"});
      if(reason === "disabled") data.payment_channels[0].enabled = false;
      if(reason === "double_fee") data.payment_channels[0].fee_rate = 0.03;
      const h = harness({data});
      await assert.rejects(() => h.create({businessType:"order",businessNo:"ORDER_TEST"}));
      assert.equal(h.stats.reserve,0); assert.equal(h.stats.provider,0);
      assert.equal(data.payment_sessions.length,0); assert.equal(h.stats.fundsWrites,0);
    }
  });
  for (const kind of ["over_limit", "disabled", "double_fee"]) {
    test(`${channel} ${kind} payment session blocked BEFORE reservation/provider call`, async () => {
      const data = fixture("snpay", channel);
      if (kind === "over_limit") Object.assign(data.account_recharges[0], { amount: 2000.01, requested_amount: 2000.01, payable_amount: 2000.01 });
      if (kind === "disabled") data.payment_channels[0].enabled = false;
      if (kind === "double_fee") Object.assign(data.account_recharges[0], { fee_amount: 0.03, payable_amount: 1.03 });
      const h = harness({ data });
      await assert.rejects(() => h.service.createPaymentSession({ userId: data.account_recharges[0].user_id,
        businessType: "recharge", businessNo: data.account_recharges[0].recharge_no, channelCode: channel, clientIp: "127.0.0.1" }));
      assert.equal(h.stats.reserve, 0);
      assert.equal(h.stats.provider, 0);
      assert.equal(data.payment_sessions.length, 0);
      assert.equal(h.stats.fundsWrites, 0);
    });
  }
}
test("both existing styled dialogs show exact customer-service copy; limit precedes create", () => {
  for (const path of ["components/account/AccountRechargeContent.tsx", "app/checkout/page.tsx"]) {
    const code = source(path);
    assert.ok(code.includes(ONLINE_PAYMENT_LIMIT_MESSAGE));
    assert.match(code, /<Dialog open=\{amountLimitDialogOpen\}/);
    assert.match(code, /openPublicSupport/);
    assert.doesNotMatch(code, /\b(?:alert|confirm)\(/);
  }
  const recharge = source("components/account/AccountRechargeContent.tsx");
  assert.ok(recharge.indexOf("if (channelOverLimit)") < recharge.indexOf('fetch("/api/recharges",'));
  const checkout = source("app/checkout/page.tsx");
  assert.ok(checkout.indexOf("if (paymentOverLimit)") < checkout.indexOf('fetch("/api/orders"'));
});
test("no accounting/migration change is needed for external cashier fee", () => {
  const rpc = source("supabase/migrations/20261008103916_paid_before_expiry_expired_state_completion.sql");
  assert.match(rpc, /credited_amount\s*=\s*v_recharge\.amount/);
  assert.match(source("lib/payments/complete-payment-service.ts"), /complete_payment_session/);
});
