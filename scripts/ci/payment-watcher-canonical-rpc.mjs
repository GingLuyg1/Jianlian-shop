#!/usr/bin/env node
// Emit the latest REAL repository function definitions into a local CI psql pipe.
// There are no copied payment function bodies in this fixture.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const migrationDir = "supabase/migrations";
const fixture = readFileSync("scripts/ci/payment-watcher-minimal-schema.sql", "utf8");
const files = ["supabase/schema.sql", ...readdirSync(migrationDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => path.join(migrationDir, name))];

function latestDefinition(name) {
  const argumentsPattern = name === "is_admin" ? "\\(\\s*user_id\\s+uuid\\s*\\)" : "\\(";
  const pattern = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*${argumentsPattern}`, "ig");
  let latest = null;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(pattern)) {
      const end = source.indexOf("$$;", match.index);
      assert.ok(end > match.index, `Unterminated canonical function ${name} in ${file}`);
      latest = { file, sql: source.slice(match.index, end + 3) };
    }
  }
  assert.ok(latest, `Missing canonical function: ${name}`);
  return latest;
}

const names = [
  "is_admin",
  "credit_account_recharge_balance",
  "complete_account_recharge",
  "complete_payment_session",
];
const definitions = new Map(names.map((name) => [name, latestDefinition(name)]));
const expected = {
  is_admin: "20260715_admin_users_super_admin_model.sql",
  credit_account_recharge_balance: "20260916170000_account_recharge_completed_at_forward_repair.sql",
  complete_account_recharge: "20260915210000_liuhaoyi_recharge_recovery_expiry_guards.sql",
  complete_payment_session: "20260915210000_liuhaoyi_recharge_recovery_expiry_guards.sql",
};
for (const [name, entry] of definitions) {
  assert.equal(path.basename(entry.file), expected[name], `Canonical ${name} source changed: re-audit fixture dependencies`);
}

const combined = [...definitions.values()].map((entry) => entry.sql).join("\n");
const required = [
  "for update",
  "from public.balance_transactions",
  "insert into public.balance_transactions",
  "update public.profiles",
  "update public.account_recharges",
  "update public.payment_sessions",
  "completed_at = coalesce(completed_at, now())",
  "public.credit_account_recharge_balance",
];
for (const phrase of required) {
  assert.ok(combined.toLowerCase().includes(phrase), `Canonical lock/credit invariant missing: ${phrase}`);
}

// If a canonical RPC starts referencing a new relation, fail closed instead
// of silently testing an older/minimalized dependency graph.
const referenced = new Set();
for (const match of combined.matchAll(/\b(?:from|join|update|into)\s+public\.([a-z_][a-z_0-9]*)/gi)) {
  referenced.add(match[1].toLowerCase());
}
for (const name of referenced) {
  if (names.includes(name) || name === "complete_order_payment") continue;
  assert.match(fixture, new RegExp(`create\\s+table\\s+public\\.${name}\\s*\\(`, "i"),
    `Canonical RPC relation absent from CI schema: ${name}`);
}

const hash = createHash("sha256").update(combined).digest("hex");
process.stderr.write(`PAYMENT_RPC_SOURCE_FILES=${[...new Set(names.slice(1).map((name) => definitions.get(name).file))].join(",")}\n`);
process.stderr.write(`RPC_FIXTURE_DRIFT_GUARD=canonical_source_dynamic_extract,source_sha256:${hash}\n`);
process.stdout.write(`${combined}\n`);
