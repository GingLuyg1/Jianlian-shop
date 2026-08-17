import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260814171000_account_recharge_amount_fingerprint_v3.sql", "utf8");
const createRoute = fs.readFileSync("app/api/recharges/route.ts", "utf8");
const verifyRoute = fs.readFileSync("app/api/recharges/[rechargeNo]/bep20/verify/route.ts", "utf8");
const ui = fs.readFileSync("components/account/AccountRechargeContent.tsx", "utf8");
const paymentPage = fs.readFileSync("app/payment/page.tsx", "utf8");
const bep20ChainService = fs.readFileSync("lib/payments/bep20-chain-service.ts", "utf8");
const bep20RechargeScanner = fs.readFileSync("lib/recharges/bep20-recharge-scanner.ts", "utf8");

test("V3 reserves a four-decimal fingerprint with a reuse quarantine", () => {
  assert.match(migration, /reserve_account_recharge_usdt_fingerprint_v3/);
  assert.match(migration, /numeric\(36, 4\)/);
  assert.match(migration, /interval '24 hours'/);
  assert.match(createRoute, /20 \* 60 \* 1000/);
  assert.match(createRoute, /reserve_account_recharge_usdt_fingerprint_v3/);
});

test("V3 credits requested CNY instead of recalculating from actual USDT", () => {
  assert.match(migration, /credited_cny := target_recharge\.requested_cny_amount/);
  assert.match(migration, /credit_policy', 'requested_cny_exact'/);
  assert.doesNotMatch(
    migration.slice(migration.indexOf("create or replace function public.complete_account_recharge_usdt_cny_v1")),
    /credited_cny\s*:=\s*trunc\(target_recharge\.actual_received_usdt\s*\*/
  );
});

test("manual TxHash fallback requires the exact fingerprint and respects expiry", () => {
  assert.match(verifyRoute, /RECHARGE_AMOUNT_MISMATCH/);
  assert.match(verifyRoute, /RECHARGE_PAYMENT_EXPIRED/);
  assert.match(verifyRoute, /compareRechargeDecimals\(evidence\.actualReceivedUsdt, expectedUsdtAmount\) !== 0/);
  assert.match(ui, /精确支付/);
});

test("manual BEP20 receipt inspection can use a dedicated RPC without changing scanner RPC", () => {
  const manualConfig = bep20ChainService.slice(
    bep20ChainService.indexOf("function readBep20ManualVerificationConfig"),
    bep20ChainService.indexOf("async function assertConfiguredTokenDecimals"),
  );
  assert.match(manualConfig, /process\.env\.BSC_RECEIPT_RPC_URL \|\| process\.env\.BSC_RPC_URL/);
  assert.match(manualConfig, /return \{ \.\.\.config, rpcUrl \}/);

  const rechargeInspection = bep20ChainService.slice(
    bep20ChainService.indexOf("export async function inspectAccountRechargeBep20Transfer"),
    bep20ChainService.indexOf("export async function recheckAdminBep20ChainPaymentSession"),
  );
  assert.match(rechargeInspection, /const config = readBep20ManualVerificationConfig\(\)/);
  assert.match(rechargeInspection, /assertConfiguredTokenDecimals\(config\)/);
  assert.match(rechargeInspection, /loadReceipt\(config, txHash\)/);
  assert.match(rechargeInspection, /findUsdtTransfer\(config, receipt, txHash\)/);

  assert.match(bep20RechargeScanner, /process\.env\.BSC_RPC_URL/);
  assert.doesNotMatch(bep20RechargeScanner, /BSC_RECEIPT_RPC_URL/);
});

test("account recharge stays scrollable and presents the minimal BEP20 flow", () => {
  assert.doesNotMatch(ui, /h-\[calc\(100dvh-87px\)\]/);
  assert.doesNotMatch(ui, /contentClassName="[^"]*overflow-hidden/);
  assert.match(ui, /账户充值/);
  assert.match(ui, /使用 USDT-BEP20 充值人民币账户余额/);
  assert.match(ui, /BNB Smart Chain/);
  assert.match(ui, /今日结算汇率/);
  assert.match(ui, /预计应付/);
  assert.match(ui, /创建充值/);
  assert.match(ui, /USDT-BEP20 付款信息/);
  assert.match(ui, /链上自动识别，异常交易进入人工复核/);
  assert.doesNotMatch(ui, /付款后人工审核|人工付款信息/);
  assert.doesNotMatch(ui, /最终按链上实际到账 USDT 与本单锁定汇率折算人民币|少付或多付均按实收结算/);
  assert.match(ui, /预计应付：[\s\S]*expectedUsdtAmount/);
  assert.match(ui, /label="精确应付" value=\{`\$\{record\.expectedUsdtAmount\} USDT`\}/);
  assert.match(ui, /金额不一致、晚到账或其他异常交易将进入人工复核；匹配成功后按申请的人民币金额入账/);
  assert.match(ui, /calculateExpectedUsdtAmount\(requestedCnyAmount, dailyRate\.settlementRate\)/);
});

test("recharge creation enters an isolated payment recharge mode", () => {
  assert.match(ui, /router\.push\(`\/payment\?recharge=\$\{encodeURIComponent\(result\.rechargeNo\)\}`\)/);
  assert.match(ui, /if \(!response\.ok\) throw[\s\S]{0,180}if \(result\?\.rechargeNo\) \{[\s\S]{0,120}router\.push/);
  assert.match(ui, /client_request_id: clientRequestIdRef\.current/);
  assert.match(ui, /hasValidAmount && !isSubmitting/);
  assert.match(ui, /paymentChannels\.length >= 2 && "sm:grid-cols-2"/);
  assert.match(paymentPage, /searchParams\.get\("recharge"\)/);
  assert.match(paymentPage, /const paymentMode = rechargeNo \? "recharge" : "order"/);
  assert.match(paymentPage, /paymentMode === "recharge"[\s\S]{0,100}<RechargePaymentPage/);

  const terminalStatuses = paymentPage.slice(
    paymentPage.indexOf("const RECHARGE_TERMINAL_STATUSES"),
    paymentPage.indexOf("function RechargePaymentPage"),
  );
  assert.match(terminalStatuses, /"succeeded"[\s\S]*"rejected"[\s\S]*"cancelled"[\s\S]*"expired"/);
  assert.doesNotMatch(terminalStatuses, /"failed"|"paid"|"closed"/);

  const rechargeMode = paymentPage.slice(
    paymentPage.indexOf("function RechargePaymentPage"),
    paymentPage.indexOf("function OrderPaymentPage"),
  );
  assert.match(rechargeMode, /fetch\(`\/api\/recharges\/\$\{encodeURIComponent\(rechargeNo\)\}`/);
  assert.match(rechargeMode, /fetch\(`\/api\/recharges\/\$\{encodeURIComponent\(rechargeNo\)\}\/bep20\/verify`/);
  assert.match(rechargeMode, /body: JSON\.stringify\(\{ txHash: txHash\.trim\(\) \}\)/);
  assert.doesNotMatch(rechargeMode, /\/api\/payments\/bep20\/(?:session|verify)|\/api\/orders\//);
  assert.doesNotMatch(rechargeMode, /businessType:\s*"order"|setOrder\(|OrderRecord/);

  for (const field of [
    "requestedCnyAmount",
    "expectedUsdtAmount",
    "actualReceivedUsdt",
    "creditedCnyAmount",
    "paymentAddress",
    "paymentTokenContract",
    "lockedSettlementRate",
    "expiresAt",
    "status",
  ]) assert.match(rechargeMode, new RegExp(`\\b${field}\\b`));

  assert.match(rechargeMode, /document\.hidden \? 30000 : elapsed < 120000 \? 4000 : 10000/);
  assert.match(rechargeMode, /RECHARGE_TERMINAL_STATUSES\.has/);
  assert.match(rechargeMode, /const succeeded = rechargeStatus === "succeeded"/);
  assert.match(rechargeMode, /if \(!succeeded \|\| balanceNotificationRechargeRef\.current === rechargeNo\) return;[\s\S]{0,180}notifyAccountBalanceUpdated\(\)/);
  assert.match(rechargeMode, /\["pending", "waiting_payment"\]\.includes\(rechargeStatus\)/);
  assert.match(rechargeMode, /当前充值正在处理或等待人工复核，请勿重复付款/);
  assert.match(rechargeMode, /document\.addEventListener\("visibilitychange"/);
  assert.match(rechargeMode, /document\.removeEventListener\("visibilitychange"/);
  assert.match(rechargeMode, /普通充值由 Scanner 自动识别，无需填写 TxHash/);
  assert.match(rechargeMode, /TxHash fallback（可选）/);
});
