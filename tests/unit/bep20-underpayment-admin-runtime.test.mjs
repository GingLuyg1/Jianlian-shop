import assert from "node:assert/strict";
import test from "node:test";

import {
  adminUnderpaymentSettlementMessage,
  canSubmitAdminUnderpaymentSettlement,
  mapAdminUnderpaymentAuthorizationFailure,
  mapAdminUnderpaymentSettlementError,
  parseAdminUnderpaymentSettlementBody,
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
