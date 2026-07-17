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
const warnings = [];

function value(name) {
  return String(config[name] ?? "").trim();
}

function readText(path) {
  const absolute = resolve(process.cwd(), path);
  if (!existsSync(absolute)) {
    failures.push(`${path}: MISSING`);
    return "";
  }
  return readFileSync(absolute, "utf8");
}

function requirePatterns(path, patterns) {
  const text = readText(path);
  if (!text) return;
  for (const [label, pattern] of patterns) {
    if (!pattern.test(text)) failures.push(`${path}: missing ${label}`);
  }
}

for (const path of requiredFiles) readText(path);

const hasExpirationMigration = migrationCandidates.some((path) => existsSync(resolve(process.cwd(), path)));
if (!hasExpirationMigration) failures.push("order expiration migration: MISSING");

requirePatterns("app/api/internal/orders/expire/route.ts", [
  ["GET handler", /export\s+async\s+function\s+GET/],
  ["POST handler", /export\s+async\s+function\s+POST/],
  ["shared handler", /handleOrderExpirationRequest/],
  ["Authorization helper", /assertOrderExpirationJobAuthorized/],
  ["dry-run support", /dry_run/],
  ["200 batch cap", /parseLimit\([^)]*,\s*50,\s*200\)/],
  ["50 dry-run cap", /parseLimit\([^)]*,\s*10,\s*50\)/],
  ["processed skipped failed counters", /processed[\s\S]*skipped[\s\S]*failed/],
]);

requirePatterns("lib/orders/order-expiration.ts", [
  ["CRON_SECRET", /CRON_SECRET/],
  ["ORDER_EXPIRATION_JOB_SECRET", /ORDER_EXPIRATION_JOB_SECRET/],
  ["INTERNAL_JOB_SECRET", /INTERNAL_JOB_SECRET/],
  ["service role client", /getSupabaseServiceRoleClient/],
  ["expire_unpaid_order RPC", /rpc\("expire_unpaid_order"/],
  ["list_expirable_unpaid_orders RPC", /rpc\("list_expirable_unpaid_orders"/],
  ["dry-run list helper", /listExpirableUnpaidOrdersDryRun/],
]);

const hasSecret = Boolean(value("CRON_SECRET") || value("ORDER_EXPIRATION_JOB_SECRET") || value("INTERNAL_JOB_SECRET"));
if (!hasSecret) warnings.push("CONFIG_NOT_READY: CRON_SECRET or ORDER_EXPIRATION_JOB_SECRET or INTERNAL_JOB_SECRET is missing");

const vercelPath = resolve(process.cwd(), "vercel.json");
if (!existsSync(vercelPath)) {
  warnings.push("SCHEDULE_NOT_CONFIGURED: vercel.json is missing");
} else {
  const vercelText = readFileSync(vercelPath, "utf8");
  if (!/\/api\/internal\/orders\/expire/.test(vercelText)) {
    warnings.push("SCHEDULE_NOT_CONFIGURED: vercel.json does not reference /api/internal/orders/expire");
  }
}

if (failures.length > 0) {
  console.error("Order expiration readiness: CODE_NOT_READY");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (warnings.length > 0) {
  console.error("Order expiration readiness: CONFIG_NOT_READY");
  for (const warning of warnings) console.error(`- ${warning}`);
  process.exit(1);
}

console.log("Order expiration readiness: PASS");
console.log("Internal order expiration API: GET/POST PRESENT");
console.log("Authorization: Bearer secret supported");
console.log("CRON_SECRET / ORDER_EXPIRATION_JOB_SECRET / INTERNAL_JOB_SECRET: PRESENT");
console.log("Order expiration service: PRESENT");
console.log("Order expiration migration: PRESENT");
console.log("Vercel schedule: PRESENT");
