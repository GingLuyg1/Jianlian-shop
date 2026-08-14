import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "supabase/migrations/20260814223000_recharge_review_schema_compatibility.sql",
  "utf8",
);

test("compatibility migration repairs only the missing recharge review prerequisites", () => {
  assert.match(source, /add column if not exists submitted_at timestamptz/);
  assert.match(source, /create table if not exists public\.recharge_review_events/);
  assert.match(source, /recharge_id uuid not null references public\.account_recharges/);
  assert.match(source, /actor_type in \('user','admin','provider','system'\)/);
});

test("compatibility migration preserves review read policies and blocks client writes", () => {
  assert.match(source, /Users can read own recharge review events/);
  assert.match(source, /Admins can read recharge review events/);
  assert.match(source, /revoke insert, update, delete on table public\.recharge_review_events from authenticated/);
  assert.match(source, /grant all on table public\.recharge_review_events to service_role/);
});

test("compatibility migration is schema-only and transaction wrapped", () => {
  assert.match(source, /^-- Candidate only[\s\S]*\nbegin;/);
  assert.match(source, /commit;\s*$/);
  assert.doesNotMatch(source, /update\s+public\.profiles/i);
  assert.doesNotMatch(source, /insert\s+into\s+public\.balance_transactions/i);
  assert.doesNotMatch(source, /delete\s+from\s+public\.account_recharges/i);
});
