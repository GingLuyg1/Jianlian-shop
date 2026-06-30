#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const requiredFiles = [
  "app/api/health/route.ts",
  "app/api/admin/system/database/route.ts",
  "app/admin/system/database/page.tsx",
  "lib/supabase/server.ts",
  "lib/supabase/service-role.ts",
  "lib/auth/require-admin.ts",
  "supabase/migrations/20260629_app_migration_history_and_schema_check.sql",
  "supabase/migrations/20260629_multi_sku_core.sql",
  "supabase/migrations/20260629_direct_purchase_order_idempotency.sql",
  "supabase/migrations/20260629_admin_user_controls.sql",
];

const expectedEnvNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const checks = [];

function addCheck(name, ok, details = "") {
  checks.push({ name, ok, details });
}

function fileExists(relativePath) {
  return existsSync(join(root, relativePath));
}

for (const file of requiredFiles) {
  addCheck(`file:${file}`, fileExists(file), fileExists(file) ? "present" : "missing");
}

for (const name of expectedEnvNames) {
  addCheck(`env-name:${name}`, Object.prototype.hasOwnProperty.call(process.env, name), process.env[name] ? "configured" : "missing");
}

try {
  const status = execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  addCheck("git-clean", status.length === 0, status.length === 0 ? "clean" : "working tree has changes");
} catch (error) {
  addCheck("git-clean", false, "unable to run git status");
}

try {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  addCheck("script:build", Boolean(pkg.scripts?.build), pkg.scripts?.build ?? "missing");
  addCheck("script:typecheck", Boolean(pkg.scripts?.typecheck), pkg.scripts?.typecheck ?? "missing");
} catch (error) {
  addCheck("package-json", false, "unable to read package.json");
}

const failures = checks.filter((check) => !check.ok);

console.log("Jianlian Shop pre-deploy check");
console.log("This script is read-only. It does not run migrations, deploy, or print secret values.");
for (const check of checks) {
  console.log(`${check.ok ? "✓" : "✗"} ${check.name}: ${check.details}`);
}

if (failures.length > 0) {
  console.error(`Pre-deploy check failed: ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("Pre-deploy check passed.");
