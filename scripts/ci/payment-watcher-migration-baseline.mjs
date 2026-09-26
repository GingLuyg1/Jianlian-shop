#!/usr/bin/env node
// Emit exact historical completion-function definitions for the isolated
// migration compatibility matrix. No Production data or copied SQL bodies.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mode = process.argv[2];
assert.ok(["guarded", "production", "unknown"].includes(mode),
  "Expected guarded, production, or unknown baseline mode");

const sources = {
  accountProduction: "supabase/migrations/20260623_payment_provider_core.sql",
  sessionProduction: "supabase/migrations/20260708_order_payment_currency_snapshot_fix.sql",
  guarded: "supabase/migrations/20260915210000_liuhaoyi_recharge_recovery_expiry_guards.sql",
};

function extract(file, name) {
  const source = readFileSync(file, "utf8");
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\n\\$\\$;`,
    "i",
  );
  const match = source.match(pattern);
  assert.ok(match, `Missing ${name} in ${file}`);
  return match[0];
}

let account;
let session;
if (mode === "guarded") {
  account = extract(sources.guarded, "complete_account_recharge");
  session = extract(sources.guarded, "complete_payment_session");
} else {
  account = extract(sources.accountProduction, "complete_account_recharge");
  session = extract(sources.sessionProduction, "complete_payment_session");
}

if (mode === "unknown") {
  const amountValidation = /\n\s*if round\(coalesce\(p_paid_amount, 0\), 6\)[\s\S]*?raise exception 'received amount does not match frozen payment session amount';\s*end if;\s*/i;
  const unsafe = session.replace(amountValidation, "\n");
  assert.notEqual(unsafe, session, "Unknown fixture must remove amount validation");
  session = unsafe;
}

process.stderr.write(`MIGRATION_BASELINE_FIXTURE=${mode}\n`);
if (mode === "production") {
  process.stderr.write(`PROD_ACCOUNT_BASELINE_SOURCE=${sources.accountProduction}\n`);
  process.stderr.write(`PROD_SESSION_BASELINE_SOURCE=${sources.sessionProduction}\n`);
}
process.stdout.write(`${account}\n${session}\n`);
