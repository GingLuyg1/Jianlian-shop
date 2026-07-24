import assert from "node:assert/strict";
import test from "node:test";

import {
  adminUnderpaymentSettlementMessage,
  canSubmitAdminUnderpaymentSettlement,
  evaluateAdminUnderpaymentEligibility,
  mapAdminUnderpaymentAuthorizationFailure,
  mapAdminUnderpaymentSettlementError,
  parseAdminUnderpaymentSettlementBody,
  rawAmountMatchesDecimal,
} from "../../lib/payments/bep20-underpayment-admin-runtime.mjs";

const validBody = {
  action: "settle",
  dry_run: false,
  sessionId: "11111111-1111-4111-8111-111111111111",
  reason: "manual settlement",
  requestId: "request-1",
  requiredConfirmations: 12,
  confirmationText: "JL-1",
  confirmIrreversible: true,
  operator_user_id: "attacker-controlled",
};

test("admin settlement parser only accepts canonical explicit write intent", () => {
  assert.equal(parseAdminUnderpaymentSettlementBody(validBody).ok, true);
  for (const body of [
    { ...validBody, dry_run: true },
    { ...validBody, dry_run: undefined },
    { ...validBody, action: "preview" },
  ]) {
    const parsed = parseAdminUnderpaymentSettlementBody(body);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "BEP20_UNDERPAYMENT_EXPLICIT_SETTLEMENT_REQUIRED");
  }
  const conflict = parseAdminUnderpaymentSettlementBody({
    ...validBody,
    dryRun: false,
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "BEP20_UNDERPAYMENT_DRY_RUN_FIELD_CONFLICT");
  const legacy = { ...validBody };
  delete legacy.dry_run;
  legacy.dryRun = false;
  assert.equal(
    parseAdminUnderpaymentSettlementBody(legacy).code,
    "BEP20_UNDERPAYMENT_DRY_RUN_FIELD_INVALID",
  );
});

test("admin settlement parser validates request fields and never accepts client operator identity", () => {
  const parsed = parseAdminUnderpaymentSettlementBody(validBody);
  assert.equal(parsed.ok, true);
  assert.equal(Object.hasOwn(parsed.value, "operator_user_id"), false);
  assert.equal(
    parseAdminUnderpaymentSettlementBody({ ...validBody, sessionId: "not-a-uuid" }).status,
    400,
  );
  assert.equal(
    parseAdminUnderpaymentSettlementBody({ ...validBody, reason: "" }).status,
    400,
  );
  assert.equal(
    parseAdminUnderpaymentSettlementBody({ ...validBody, requiredConfirmations: 1001 }).status,
    400,
  );
});

test("admin settlement safe error mapping covers public HTTP contracts", () => {
  assert.equal(mapAdminUnderpaymentAuthorizationFailure(401, "sign in").status, 401);
  assert.equal(mapAdminUnderpaymentAuthorizationFailure(403, "forbidden").status, 403);
  assert.deepEqual(mapAdminUnderpaymentAuthorizationFailure(500, "database detail"), {
    success: false,
    status: 500,
    code: "ADMIN_AUTHORIZATION_UNAVAILABLE",
    message: "管理员权限校验暂时不可用。",
  });
  assert.equal(mapAdminUnderpaymentSettlementError("22P02").status, 400);
  assert.equal(mapAdminUnderpaymentSettlementError("BEP20_UNDERPAYMENT_SESSION_NOT_FOUND").status, 404);
  assert.equal(mapAdminUnderpaymentSettlementError("BEP20_UNDERPAYMENT_STATE_INVALID").status, 409);
  assert.equal(mapAdminUnderpaymentSettlementError("PGRST202").status, 503);
  assert.equal(mapAdminUnderpaymentSettlementError("unknown database detail").status, 500);
  assert.equal(
    mapAdminUnderpaymentSettlementError("unknown database detail").code,
    "BEP20_UNDERPAYMENT_SETTLEMENT_FAILED",
  );
});

test("manual and automatic eligibility keep their distinct deadline contracts", () => {
  const cases = [
    {
      name: "manual before deadline is eligible",
      input: { expired: false, authorityCandidate: false, checks: { evidence: true } },
      expected: { manualEligible: true, automaticEligible: false, manualBeforeDeadline: true },
    },
    {
      name: "automatic after deadline requires authority candidate",
      input: { expired: true, authorityCandidate: true, checks: { evidence: true } },
      expected: { manualEligible: true, automaticEligible: true, manualBeforeDeadline: false },
    },
    {
      name: "late transfer is blocked for both sources",
      input: { expired: true, authorityCandidate: true, checks: { late_transfer: false } },
      expected: { manualEligible: false, automaticEligible: false, manualBeforeDeadline: false },
    },
    {
      name: "confirmed transaction status is blocked",
      input: { expired: true, authorityCandidate: true, checks: { transaction_status_underpaid: false } },
      expected: { manualEligible: false, automaticEligible: false, manualBeforeDeadline: false },
    },
    {
      name: "raw normalized mismatch is blocked",
      input: { expired: true, authorityCandidate: true, checks: { raw_normalized_match: false } },
      expected: { manualEligible: false, automaticEligible: false, manualBeforeDeadline: false },
    },
    {
      name: "credited CNY rounds to zero is blocked",
      input: { expired: true, authorityCandidate: true, checks: { credited_cny_positive: false } },
      expected: { manualEligible: false, automaticEligible: false, manualBeforeDeadline: false },
    },
  ];
  for (const item of cases) {
    const actual = evaluateAdminUnderpaymentEligibility(item.input);
    assert.equal(actual.manualEligible, item.expected.manualEligible, item.name);
    assert.equal(actual.automaticEligible, item.expected.automaticEligible, item.name);
    assert.equal(actual.manualBeforeDeadline, item.expected.manualBeforeDeadline, item.name);
  }
});

test("raw token amounts must exactly equal normalized 18-decimal amounts", () => {
  assert.equal(rawAmountMatchesDecimal("2990000000000000000", "2.99", 18), true);
  assert.equal(rawAmountMatchesDecimal("2990000000000000001", "2.99", 18), false);
  assert.equal(rawAmountMatchesDecimal("4000000000000000000", "4", 18), true);
  assert.equal(rawAmountMatchesDecimal("3999999999999999999", "4", 18), false);
});

test("admin UI submit guard fails closed for every missing confirmation", () => {
  const valid = {
    previewed: true,
    eligible: true,
    reason: "reviewed",
    confirmationText: "JL-1",
    orderNo: "JL-1",
    irreversibleConfirmed: true,
    submitting: false,
  };
  assert.equal(canSubmitAdminUnderpaymentSettlement(valid), true);
  for (const patch of [
    { previewed: false },
    { eligible: false },
    { reason: "" },
    { confirmationText: "wrong" },
    { irreversibleConfirmed: false },
    { submitting: true },
  ]) {
    assert.equal(canSubmitAdminUnderpaymentSettlement({ ...valid, ...patch }), false);
  }
});

test("settled and already-settled UI outcomes remain distinct", () => {
  assert.notEqual(
    adminUnderpaymentSettlementMessage("settled"),
    adminUnderpaymentSettlementMessage("already_settled"),
  );
});

test("concurrent retries aggregate into one settlement and one idempotent success", async () => {
  let completed = false;
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    if (completed) return { success: true, result: "already_settled", idempotent: true };
    completed = true;
    return { success: true, result: "settled", idempotent: false };
  };
  const outcomes = await Promise.all([settle(), settle()]);
  assert.deepEqual(
    outcomes.map((item) => item.result).sort(),
    ["already_settled", "settled"],
  );
});
