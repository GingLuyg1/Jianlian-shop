import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const rechargeSuccessSource = fs.readFileSync("lib/email/recharge-success.ts", "utf8");
const reviewSource = fs.readFileSync("lib/recharges/review-service.ts", "utf8");
const scannerSource = fs.readFileSync("lib/recharges/bep20-recharge-scanner.ts", "utf8");

test("recharge success service resolves recipient from Auth and only queues completed recharges", () => {
  assert.match(
    rechargeSuccessSource,
    /\.select\("id,recharge_no,user_id,status,credited_amount,currency"\)/,
  );
  assert.doesNotMatch(rechargeSuccessSource, /user_email/);
  assert.match(
    rechargeSuccessSource,
    /\["paid", "succeeded"\]\.includes\(String\(recharge\.status\)\)/,
  );
  assert.match(
    rechargeSuccessSource,
    /supabase\.auth\.admin\.getUserById\(userId\)/,
  );
  assert.match(
    rechargeSuccessSource,
    /queueRechargeSuccessEmailRuntime\(/,
  );
});

test("manual recharge review queues recharge_success only from its completed result path", () => {
  assert.match(
    reviewSource,
    /async function completedResult\([\s\S]*?queueRechargeSuccessEmailBestEffort\(recharge\.id, "recharge_review"\)\.catch\(\(\) => undefined\);[\s\S]*?return \{/,
  );
});

test("BEP20 scanner repairs notification on credited or already-credited replay before cursor advance", () => {
  assert.match(
    scannerSource,
    /if \(\(match\.credited \|\| match\.alreadyCredited\) && match\.rechargeId\) \{[\s\S]*?queueRechargeSuccessEmailBestEffort\(match\.rechargeId, "bep20_scanner"\)\.catch\(\(\) => undefined\);/,
  );
  assert.match(
    scannerSource,
    /const creditEligible = result === "matched" \|\| result === "already_matched";[\s\S]*?if \(creditEligible && !rechargeId\) \{/,
  );

  const emailAttemptIndex = scannerSource.indexOf(
    'queueRechargeSuccessEmailBestEffort(match.rechargeId, "bep20_scanner")',
  );
  const cursorUpsertIndex = scannerSource.indexOf(
    '.from("account_recharge_bep20_scan_state")',
    emailAttemptIndex,
  );

  assert.notEqual(emailAttemptIndex, -1);
  assert.notEqual(cursorUpsertIndex, -1);
  assert.ok(emailAttemptIndex < cursorUpsertIndex);
});

test("recharge email integration contains no refund business wiring", () => {
  const combined = [rechargeSuccessSource, reviewSource, scannerSource].join("\n");
  assert.doesNotMatch(combined, /refund_requested|email-refund|refund runtime/i);
});
