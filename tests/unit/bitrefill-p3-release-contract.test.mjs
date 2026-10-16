import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { checkP3StabilityClock } from "../support/bitrefill-p3-prelaunch-local.mjs";

const read = (path) => readFileSync(fileURLToPath(new URL(`../../${path}`,import.meta.url)),"utf8");

test("P3 stability cannot turn host suspension or clock jumps into acceptance", () => {
  checkP3StabilityClock({ wallMs: 1800_000,monotonicMs: 1800_000,gapMs: 10_000 });
  assert.throws(() => checkP3StabilityClock({ wallMs: 5200_000,monotonicMs: 1800_000,gapMs: 10_000 }), /INTERRUPTED_OR_CLOCK_JUMP/);
  assert.throws(() => checkP3StabilityClock({ wallMs: 5200_000,monotonicMs: 5200_000,gapMs: 3600_000 }), /INTERRUPTED_OR_CLOCK_JUMP/);
});

test("P3 release policy is closed code, not a credential or environment switch", () => {
  const source = read("lib/providers/bitrefill/prelaunch-policy.mjs");
  assert.match(source,/export const REAL_BITREFILL_PURCHASE_ENABLED = false;/);
  assert.doesNotMatch(source,/process\.env|NEXT_PUBLIC_/);
  const registry = read("lib/providers/core/supplier-router.ts").split("const SUPPLIER_REGISTRY:")[1].split("};")[0];
  assert.match(registry,/daju: fulfillDajuOrderWithSupabase/);
  assert.doesNotMatch(registry,/bitrefill:/);
});

test("RC1 retains the DB10-reviewed DB9 migration rather than P3's old baseline", () => {
  const migration = read("supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql").replaceAll("\r\n","\n");
  assert.equal(createHash("sha256").update(migration).digest("hex"),
    "90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0");
});

test("P3 supplemental trigger parity is scoped SELECT-only metadata, never business data", () => {
  const query = read("docs/integrations/sql/bitrefill-p3-trigger-enabled-parity.sql").replace(/--[^\n]*/g,"").trim();
  assert.match(query,/^select\s/i);
  assert.doesNotMatch(query,/\b(?:insert|update|delete|alter|drop|create|grant|revoke|call|execute)\b/i);
  assert.match(query,/t\.tgenabled/);
  assert.match(query,/n\.nspname='public'/);
  assert.equal(query.split(";").filter((part) => part.trim()).length,1);
});
