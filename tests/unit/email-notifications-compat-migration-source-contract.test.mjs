import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(
  new URL("../../supabase/migrations/20260820_email_notifications_compat_init.sql", import.meta.url),
  "utf8",
);
const lower = sql.toLowerCase();

test("compat email migration never replaces administrator authorization functions", () => {
  assert.doesNotMatch(lower, /create\s+or\s+replace\s+function\s+public\.is_super_admin_user/);
  assert.doesNotMatch(lower, /create\s+or\s+replace\s+function\s+public\.is_super_admin\s*\(/);
  assert.doesNotMatch(lower, /gac000189@gmail\.com/);
});

test("compat email migration creates all required email tables", () => {
  for (const table of [
    "email_templates",
    "email_delivery_jobs",
    "email_delivery_attempts",
    "user_email_preferences",
  ]) {
    assert.match(lower, new RegExp(`create table if not exists public\\.${table}`));
  }
});

test("email RLS continues to use the current super-admin compatibility function", () => {
  assert.match(lower, /public\.is_super_admin_user\(auth\.uid\(\)\)/);
});

test("audit module constraint preserves current modules and adds notifications", () => {
  for (const moduleName of [
    "payments",
    "recharges",
    "orders",
    "users",
    "products",
    "categories",
    "inventory",
    "delivery",
    "settings",
    "system",
    "privacy",
    "notifications",
  ]) {
    assert.match(lower, new RegExp(`'${moduleName}'`));
  }
});

test("audit constraint is inspected before any email table is created", () => {
  const inspectAt = lower.indexOf("pg_get_constraintdef");
  const createAt = lower.indexOf("create table if not exists public.email_templates");
  assert.ok(inspectAt >= 0);
  assert.ok(createAt > inspectAt);
  assert.match(lower, /unsupported allowed modules/);
  assert.match(lower, /missing required modules/);
});

test("unknown audit data modules fail closed before the constraint replacement", () => {
  assert.match(lower, /admin_audit_logs contains unsupported module values/);
});
