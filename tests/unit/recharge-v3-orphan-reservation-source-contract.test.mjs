import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/api/recharges/route.ts", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20260814171000_account_recharge_amount_fingerprint_v3.sql",
  "utf8",
);

test("recharge creation compensates a fingerprint reservation when insert fails", () => {
  assert.match(route, /try \{\s*rechargeNo = await insertRecharge/s);
  assert.match(route, /release_orphan_account_recharge_usdt_fingerprint_v3/);
  assert.match(route, /try \{[\s\S]*release_orphan_account_recharge_usdt_fingerprint_v3[\s\S]*\} catch \{/);
  assert.doesNotMatch(route, /release_orphan_account_recharge_usdt_fingerprint_v3[\s\S]{0,220}\.catch\(/);
  assert.match(route, /throw insertError/);
});

test("orphan cleanup function keeps valid PL/pgSQL dollar quoting", () => {
  assert.match(
    migration,
    /create or replace function public\.release_orphan_account_recharge_usdt_fingerprint_v3\([\s\S]*?as \$\$[\s\S]*?end;\s*\$\$;/,
  );
});

test("orphan release is service-role only and refuses to delete a reservation for a persisted recharge", () => {
  assert.match(migration, /create or replace function public\.release_orphan_account_recharge_usdt_fingerprint_v3/);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/);
  assert.match(migration, /if exists \([\s\S]*from public\.account_recharges[\s\S]*where id = p_recharge_id[\s\S]*\) then\s*return false;/);
  assert.match(migration, /delete from public\.account_recharge_amount_reservations\s*where recharge_id = p_recharge_id/);
  assert.match(migration, /grant execute on function public\.release_orphan_account_recharge_usdt_fingerprint_v3\(uuid\)\s*to service_role/);
});
