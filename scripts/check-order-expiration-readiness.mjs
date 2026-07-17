#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const requiredFiles = [
  "app/api/internal/orders/expire/route.ts",
  "lib/orders/order-expiration.ts",
];

const migrationCandidates = [
  "supabase/migrations/20260701_order_expiration_inventory_release.sql",
  "supabase/migrations/20260709_order_lifecycle_non_payment_hardening.sql",
  "supabase/migrations/20260710_order_lifecycle_compatibility_baseline.sql",
];

function readDotEnvLocal() {
  const filePath = resolve(process.cwd(), ".env.local");
  if (!existsSync(filePath)) return {};
  const result = {};
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const name = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    result[name] = rawValue.replace(/^['"]|['"]$/g, "");
  }
  return result;
}

const dotEnv = readDotEnvLocal();
const config = { ...dotEnv, ...process.env };
const failures = [];

function value(name) {
  return String(config[name] ?? "").trim();
}

function requireFile(path) {
  const absolute = resolve(process.cwd(), path);
  if (!existsSync(absolute)) failures.push(`${path}: MISSING`);
  return absolute;
}

function requireText(path, patterns) {
  const absolute = requireFile(path);
  if (!existsSync(absolute)) return "";
  const text = readFileSync(absolute, "utf8");
  for (const [label, pattern] of patterns) {
    if (!pattern.test(text)) failures.push(`${path}: missing ${label}`);
  }
  return text;
}

for (const path of requiredFiles) requireFile(path);

const hasExpirationMigration = migrationCandidates.some((path) => existsSync(resolve(process.cwd(), path)));
if (!hasExpirationMigration) {
  failures.push("order expiration migration: MISSING");
}

requireText("app/api/internal/orders/expire/route.ts", [
  ["POST handler", /export\s+async\s+function\s+POST/],
  ["internal secret authorization", /assertOrderExpirationJobAuthorized/],
  ["batch limit clamp", /Math\.min\([\s\S]*?,\s*200\)/],
  ["processed skipped failed counters", /processed[\s\S]*skipped[\s\S]*failed/],
]);

requireText("lib/orders/order-expiration.ts", [
  ["ORDER_EXPIRATION_JOB_SECRET", /ORDER_EXPIRATION_JOB_SECRET/],
  ["INTERNAL_JOB_SECRET", /INTERNAL_JOB_SECRET/],
  ["service role client", /getSupabaseServiceRoleClient/],
  ["expire_unpaid_order RPC", /rpc\("expire_unpaid_order"/],
  ["list_expirable_unpaid_orders RPC", /rpc\("list_expirable_unpaid_orders"/],
]);

if (!value("ORDER_EXPIRATION_JOB_SECRET") && !value("INTERNAL_JOB_SECRET")) {
  failures.push("ORDER_EXPIRATION_JOB_SECRET or INTERNAL_JOB_SECRET: MISSING");
}

if (failures.length > 0) {
  console.error("Order expiration readiness: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Order expiration readiness: PASS");
console.log("ORDER_EXPIRATION_JOB_SECRET or INTERNAL_JOB_SECRET: PRESENT");
console.log("Internal order expiration API: PRESENT");
console.log("Order expiration service: PRESENT");
console.log("Order expiration migration: PRESENT");
console.log("Vercel Cron recommendation: POST /api/internal/orders/expire with Authorization: Bearer <configured secret> every 5 minutes, batch limit <= 200.");
