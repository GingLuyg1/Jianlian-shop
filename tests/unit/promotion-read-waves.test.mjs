import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
const path = new URL("../../app/api/referrals/route.ts", import.meta.url);
function harness({ deferred = false, anonymous = false, disabled = false, errors = false, source = fs.readFileSync(path, "utf8") } = {}) {
  const calls = [], gates = {}; let active = 0, maximum = 0; const module = { exports: {} };
  const wait = (key, value) => { calls.push(key); active++; maximum = Math.max(maximum, active); return (deferred ? new Promise(resolve => { gates[key] = () => resolve(value); }) : Promise.resolve(value)).finally(() => active--); };
  const supabase = { auth: { async getUser() { calls.push("auth"); return { data: { user: anonymous ? null : { id: "fixture-user" } }, error: null }; } },
    async rpc(name) { assert.equal(name, "ensure_my_referral_code"); calls.push("unchanged-synthetic-rpc"); return { data: "DEMO-CODE", error: null }; },
    from(table) { let columns = "", limited = false; const builder = {
      select(value) { columns = value; return builder; }, eq(column, value) { if (["inviter_id", "referrer_id"].includes(column)) assert.equal(value, "fixture-user"); return builder; }, order() { return builder; }, range() { limited = true; return builder; },
      then(resolve, reject) {
        const key = table === "promotion_visits" ? "visits" : table === "referrals" ? "registrations" : limited ? "page" : "totals";
        const data = key === "page" ? [{ id: "commission-a", referred_user_label: "fixture@example.test", order_no: "DEMO-ORDER", order_amount: 100, commission_rate: 0.05, commission_amount: 5, status: "available", created_at: "2026-10-30T01:00:00Z" }] : key === "totals" ? [{ commission_amount: 5, status: "available" }, { commission_amount: 2, status: "cancelled" }, { commission_amount: 3, status: "pending" }] : [];
        assert.ok(columns); return wait(key, { data, count: key === "visits" ? 40 : key === "registrations" ? 7 : 1, error: errors ? { message: "synthetic read failure" } : null }).then(resolve, reject);
      } }; return builder;
    } };
  const deps = { "next/server": { NextResponse: { json: Response.json } }, "@/lib/supabase/server": { getSupabaseServerClient: () => supabase, hasSupabaseServerConfig: () => true },
    "@/lib/promotion": { PROMOTION_COMMISSION_RATE: 0.05, PROMOTION_MIN_WITHDRAW_AMOUNT: 50 }, "@/lib/settings/server": { async getPromotionSettings() { calls.push("settings"); return { enabled: !disabled, commissionRate: 0.05, minWithdrawAmount: 50 }; } } };
  new Function("require", "module", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => { assert.ok(name in deps, name); return deps[name]; }, module, module.exports);
  return { api: module.exports, calls, gates, maximum: () => maximum };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const request = () => new Request("http://fixture/api/referrals?page=1&pageSize=10&status=all");
test("promotion statistics use two read waves without changing ownership, RPC or commission math", async () => {
  const { api, calls, gates, maximum } = harness({ deferred: true }); const operation = api.GET(request()); await tick();
  assert.ok(calls.includes("visits") && calls.includes("registrations")); assert.ok(!calls.includes("page"));
  gates.visits(); gates.registrations(); await tick(); assert.ok(calls.includes("page") && calls.includes("totals"));
  gates.page(); gates.totals(); const response = await operation, body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.stats.totalCommission, 8); assert.equal(body.stats.availableCommission, 5); assert.equal(body.stats.registrationRate.value, "17.50%");
  assert.equal(body.records[0].commissionAmount, 5); assert.equal(calls.filter(key => key === "unchanged-synthetic-rpc").length, 1); assert.equal(maximum(), 2);
});
test("promotion unauthorized requests never reach the RPC or private statistics", async () => {
  const { api, calls } = harness({ anonymous: true }); assert.equal((await api.GET(request())).status, 401); assert.deepEqual(calls, ["auth"]);
});
test("disabled promotions do not load the statistics and read errors stay explicit", async () => {
  const disabled = harness({ disabled: true }); const off = await (await disabled.api.GET(request())).json(); assert.equal(off.promotionEnabled, false); assert.ok(!disabled.calls.includes("visits"));
  const failed = harness({ errors: true }); const body = await (await failed.api.GET(request())).json(); assert.equal(body.stats.visits.value, null); assert.equal(body.stats.totalCommission, null); assert.ok(body.recordError); assert.deepEqual(body.records, []);
});
