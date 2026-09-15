import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reconciliation = readFileSync(
  new URL("../../lib/payments/reconciliation-service.ts", import.meta.url),
  "utf8",
);
const provider = readFileSync(
  new URL("../../lib/payments/providers/liuhaoyi.ts", import.meta.url),
  "utf8",
);
const callbackService = readFileSync(
  new URL("../../lib/payments/payment-callback-service.ts", import.meta.url),
  "utf8",
);

function section(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

test("Liuhaoyi reconciliation always queries by session_no as out_trade_no", () => {
  const query = section(reconciliation, "async function queryProvider", "async function readSession");
  assert.match(
    query,
    /session\.provider === "liuhaoyi"[\s\S]*session\.sessionNo[\s\S]*session\.providerOrderNo \?\? session\.sessionNo/,
  );
  assert.match(provider, /endpoint\.searchParams\.set\("out_trade_no", paymentNo\)/);
});

test("paid provider with pending or expired Liuhaoyi session is manual-review evidence only", () => {
  const reconcileOne = section(reconciliation, "async function reconcileOne", "function compare");
  const liuhaoyiGuard = reconcileOne.slice(
    reconcileOne.indexOf('if (session.provider === "liuhaoyi")'),
    reconcileOne.indexOf("} else if (dryRun)"),
  );
  assert.match(liuhaoyiGuard, /comparison\.result = "manual_review"/);
  assert.match(liuhaoyiGuard, /comparison\.recoveryStatus = "manual_review"/);
  assert.doesNotMatch(liuhaoyiGuard, /completePayment\(/);
  assert.match(
    reconciliation,
    /\.in\("status", \["pending", "processing", "expired", "paid", "failed"\]\)/,
  );
  assert.match(
    reconcileOne,
    /provider\.status === "paid" && session\.localStatus !== "paid"[\s\S]*persistLiuhaoyiDetectionEvidence/,
  );
});

test("query detection persists identifiers and reconciliation state without changing payment status", () => {
  const persist = section(
    reconciliation,
    "async function persistLiuhaoyiDetectionEvidence",
    "function sessionReconcileStatus",
  );
  assert.match(persist, /last_synced_at:/);
  assert.match(persist, /reconcile_status:/);
  assert.match(persist, /update\.provider_transaction_id = provider\.tradeNo/);
  assert.match(persist, /\.eq\("status", session\.localStatus\)/);
  assert.doesNotMatch(persist, /update\.status\s*=|\.update\(\s*\{\s*status\s*:/);
  assert.doesNotMatch(persist, /completePayment|balance|credit/i);
  assert.match(reconciliation, /provider_trade_no: provider\.tradeNo/);
  assert.match(
    reconciliation,
    /session\.provider === "liuhaoyi"[\s\S]*"provider-detection"/,
  );
});

test("amount mismatch remains manual review and cannot enter automatic completion", () => {
  const compare = section(reconciliation, "function compare", "async function queryProvider");
  const amountGuard = compare.slice(
    compare.indexOf("if (!amountEqual"),
    compare.indexOf("if (session.localTradeNo"),
  );
  assert.match(amountGuard, /issue\("manual_review", "amount_mismatch"/);
  assert.doesNotMatch(amountGuard, /completePayment\(/);
});

test("Liuhaoyi query summaries and errors never expose the merchant key", () => {
  const query = section(provider, "async function queryPayment", "function callbackParameters");
  assert.match(query, /rawSummary:\s*\{[\s\S]*found: String\(payload\.code/);
  assert.match(query, /type: boundedOptionalText\(payload\.type, 32\)/);
  assert.doesNotMatch(query, /rawSummary:[\s\S]*merchantKey/);
  assert.doesNotMatch(provider, /console\.(?:log|info|warn|error)/);
  assert.match(provider, /LIUHAOYI_REQUEST_FAILED/);
});

test("normal signed callback remains the only Liuhaoyi automatic completion path", () => {
  assert.match(callbackService, /if \(!verified\)[\s\S]*signature_failed/);
  assert.match(callbackService, /const completion = await completePayment\(/);
  assert.match(callbackService, /source: "callback"/);
  assert.doesNotMatch(reconciliation, /forceCredit|forcePaid/);
});
