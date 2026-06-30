#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const requiredFiles = [
  "package.json",
  "package-lock.json",
  "next.config.mjs",
  "app/api/health/route.ts",
  "app/api/health/readiness/route.ts",
  "app/api/catalog/products/route.ts",
  "app/api/orders/route.ts",
  "app/api/payments/sessions/route.ts",
  "app/api/admin/catalog/products/route.ts",
  "app/api/admin/inventory/route.ts",
  "lib/auth/require-admin.ts",
  "lib/supabase/server.ts",
  "supabase/migrations/20260620_order_payments.sql",
  "supabase/migrations/20260620_digital_inventory_delivery.sql",
  "supabase/migrations/20260622_super_admin_payment_console.sql",
  "supabase/migrations/20260623_payment_reconciliation_system.sql",
  "supabase/migrations/20260629_i18n_currency_timezone_settings.sql",
];

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

const serverOnlyEnv = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "PAYMENT_RECONCILIATION_SECRET",
  "INTERNAL_API_SECRET",
];

const optionalEnv = [
  "NEXT_PUBLIC_SITE_URL",
  "PAYMENT_CALLBACK_SECRET",
  "ALIPAY_APP_ID",
  "WECHAT_MCH_ID",
  "BINANCE_PAY_PROVIDER_KEY",
  "USDT_TRC20_WALLET_ADDRESS",
  "USDT_BEP20_WALLET_ADDRESS",
];

const checks = [];

function add(level, name, ok, details) {
  checks.push({ level, name, ok, details });
}

function exists(relativePath) {
  return existsSync(join(root, relativePath));
}

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

for (const file of requiredFiles) {
  add("error", `file:${file}`, exists(file), exists(file) ? "present" : "missing");
}

for (const name of requiredEnv) {
  add(
    "error",
    `env:${name}`,
    Object.prototype.hasOwnProperty.call(process.env, name),
    process.env[name] ? "configured" : "missing"
  );
}

for (const name of serverOnlyEnv) {
  add(
    "warning",
    `server-env:${name}`,
    Object.prototype.hasOwnProperty.call(process.env, name),
    process.env[name] ? "configured server-side" : "not configured or not exported in current shell"
  );
}

for (const name of optionalEnv) {
  add(
    "warning",
    `optional-env:${name}`,
    Object.prototype.hasOwnProperty.call(process.env, name),
    process.env[name] ? "configured" : "not configured"
  );
}

try {
  const branch = git(["branch", "--show-current"]);
  add("error", "git:branch", branch === "main", branch || "unknown");
  add("info", "git:commit", true, git(["rev-parse", "--short", "HEAD"]));
  const status = git(["status", "--porcelain"]);
  add("warning", "git:working-tree", status.length === 0, status.length === 0 ? "clean" : "has local changes");
} catch {
  add("error", "git", false, "unable to read git state");
}

try {
  const nodeVersion = process.versions.node;
  const major = Number(nodeVersion.split(".")[0]);
  add("error", "node:version", major >= 20, `current ${nodeVersion}; recommended 20.x`);
} catch {
  add("error", "node:version", false, "unable to read node version");
}

try {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  add("error", "script:build", Boolean(pkg.scripts?.build), pkg.scripts?.build ?? "missing");
  add("error", "script:start", Boolean(pkg.scripts?.start), pkg.scripts?.start ?? "missing");
  add("error", "script:typecheck", Boolean(pkg.scripts?.typecheck), pkg.scripts?.typecheck ?? "missing");
  add("error", "next:version", String(pkg.dependencies?.next ?? "") === "13.5.1", String(pkg.dependencies?.next ?? "missing"));
} catch {
  add("error", "package-json", false, "unable to parse package.json");
}

const publicSecretNames = [...serverOnlyEnv, "SERVICE_ROLE", "SECRET", "PRIVATE_KEY"].filter((name) =>
  name.startsWith("NEXT_PUBLIC_")
);
add("error", "env:public-secret-names", publicSecretNames.length === 0, "no server secret is declared as NEXT_PUBLIC_*");

console.log("Jianlian Shop staging preflight");
console.log("Read-only check. It does not print secret values, run migrations, build, start services, or deploy.");

for (const check of checks) {
  const marker = check.ok ? "OK" : check.level.toUpperCase();
  console.log(`[${marker}] ${check.name}: ${check.details}`);
}

const errors = checks.filter((check) => check.level === "error" && !check.ok);
const warnings = checks.filter((check) => check.level === "warning" && !check.ok);

console.log(`Summary: ${errors.length} error(s), ${warnings.length} warning(s).`);
if (errors.length > 0) process.exit(1);

