import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { WATCHER_MINIMUM_AGE_MS, WATCHER_BATCH_SIZE, WATCHER_QUERY_TIMEOUT_MS,
  WATCHER_ITEM_TIMEOUT_MS, WATCHER_BATCH_TIMEOUT_MS, candidateMode,
  runLiuhaoyiAlipayWatcher } from "../../lib/payments/liuhaoyi-alipay-watcher.mjs";

const nowMs = Date.parse("2026-09-17T03:10:00.000Z");
const env = { LIUHAOYI_ALIPAY_WATCHER_ENABLED: "true",
  LIUHAOYI_ALIPAY_WATCHER_EXECUTE_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "supabase-do-not-log",
  PAYMENT_RECONCILIATION_SECRET: "worker-do-not-log", JIANLIAN_INTERNAL_BASE_URL: "http://127.0.0.1:3001" };
const active = { session_no: "PS20260917025943ALIPAY", status: "pending",
  created_at: "2026-09-17T02:59:43.000Z", expires_at: "2026-09-17T03:29:43.339Z" };
const result = (overrides = {}) => ({ success: true, provider_found: true, provider_paid: false,
  provider_type_match: false, amount_match: false, paid_within_expiry: false, eligible: false,
  reason: "provider_unpaid", completed: false, idempotent: false, ...overrides });
const response = (rows, count = rows.length) => new Response(JSON.stringify(rows), { status: 200,
  headers: { "content-range": rows.length ? `0-${rows.length - 1}/${count}` : `*/${count}` } });
const run = (options = {}) => {
  const output = [];
  return runLiuhaoyiAlipayWatcher({ env, nowMs, write: (line) => output.push(JSON.parse(line)),
    fetchImpl: async () => response([active]), worker: async () => result(), ...options })
    .then((value) => ({ value, output }));
};

test("watcher is disabled by default, dry-run by default, and execute needs both gates", async () => {
  let called = false;
  assert.equal((await run({ env: {}, fetchImpl: async () => { called = true; } })).value.status, "disabled");
  assert.equal(called, false);
  const dryCalls = [];
  await run({ worker: async (input) => { dryCalls.push(input); return result(); } });
  assert.equal(dryCalls[0].execute, false);
  assert.equal((await run({ args: ["--execute"], env: { ...env,
    LIUHAOYI_ALIPAY_WATCHER_EXECUTE_ENABLED: "false" } })).value.status, "execute_not_enabled");
  const execCalls = [];
  await run({ args: ["--execute"], worker: async (input) => { execCalls.push(input); return result(); } });
  assert.equal(execCalls[0].execute, true);
  assert.equal(execCalls[0].queryTimeoutMs, WATCHER_QUERY_TIMEOUT_MS);
  assert.equal(execCalls[0].timeoutMs, WATCHER_ITEM_TIMEOUT_MS);
});

test("candidate scan is only one-minute-old pending Liuhaoyi Alipay CNY recharge", async () => {
  const { value } = await run({ fetchImpl: async (url, init) => {
    for (const [key, expected] of Object.entries({ provider: "eq.liuhaoyi", channel_code: "eq.alipay",
      business_type: "eq.recharge", currency: "eq.CNY", status: "eq.pending",
      created_at: "lte." + new Date(nowMs - WATCHER_MINIMUM_AGE_MS).toISOString(),
      expires_at: "gt." + new Date(nowMs).toISOString(), order: "created_at.desc,session_no.desc",
      limit: String(WATCHER_BATCH_SIZE) })) assert.equal(url.searchParams.get(key), expected);
    assert.equal(init.headers.Prefer, "count=exact"); return response([active]);
  } });
  assert.equal(value.status, "finished");
  assert.equal(candidateMode({ ...active, status: "processing" }, nowMs, true), "skip");
  assert.equal(candidateMode({ ...active, created_at: new Date(nowMs - 59_999).toISOString() }, nowMs, true), "skip");
  assert.equal(candidateMode({ ...active, expires_at: new Date(nowMs).toISOString() }, nowMs, true), "skip");
});

test("newest three are selected and fourth rotates through old backlog", async () => {
  const newest = Array.from({ length: 4 }, (_, i) => ({ ...active, session_no: `PS20260917ALINEW${i}` }));
  const older = { ...active, session_no: "PS20260917ALIOLDER" };
  const urls = [], called = [];
  const { value, output } = await run({ fetchImpl: async (url) => {
    urls.push(url); return urls.length === 1 ? response(newest, 10) : response([older], 10);
  }, worker: async ({ sessionNo }) => { called.push(sessionNo); return result(); } });
  assert.deepEqual(called, [...newest.slice(0, 3).map((row) => row.session_no), older.session_no]);
  assert.equal(urls[1].searchParams.get("limit"), "1");
  assert.equal(Number(urls[1].searchParams.get("offset")) >= 3, true);
  assert.deepEqual([value.eligible_count, value.processed_count, value.remaining_count], [10, 4, 6]);
  assert.equal(output.at(-1).backlog_present, "yes");
});

test("invalid responses, provider failures and timeouts never credit and redact secrets", async () => {
  assert.equal((await run({ fetchImpl: async () => new Response("[]", { status: 200 }) })).value.status,
    "candidate_read_failed");
  assert.equal((await run({ env: { ...env, JIANLIAN_INTERNAL_BASE_URL: "https://outside.invalid" } })).value.status,
    "configuration_missing");
  const sensitive = "https://provider.invalid/?key=" + env.SUPABASE_SECRET_KEY + "&sign=forbidden";
  const failed = await run({ worker: async () => result({ success: false, reason: sensitive }) });
  assert.equal(failed.value.completed_count, 0);
  assert.equal(JSON.stringify(failed.output).includes("key="), false);
  assert.equal(JSON.stringify(failed.output).includes(env.SUPABASE_SECRET_KEY), false);
  const timeout = await run({ worker: async () => result({ success: false, reason: "worker_timeout" }) });
  assert.equal(timeout.value.timeout_count, 1);
  for (const reason of ["http_error", "invalid_json", "status_unknown", "provider_not_found",
    "amount_mismatch", "provider_type_mismatch", "provider_trade_no_missing", "out_trade_no_mismatch",
    "provider_paid_time_missing", "provider_paid_after_expiry"]) {
    assert.equal((await run({ worker: async () => result({ reason }) })).value.completed_count, 0);
  }
});

test("flock, one-minute timer and all timeouts are bounded", () => {
  const service = readFileSync(new URL("../../ops/systemd/jianlian-liuhaoyi-recovery.service", import.meta.url), "utf8");
  const timer = readFileSync(new URL("../../ops/systemd/jianlian-liuhaoyi-recovery.timer", import.meta.url), "utf8");
  const entry = readFileSync(new URL("../../scripts/ops/liuhaoyi-alipay-recharge-watcher.mjs", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../app/api/internal/payments/liuhaoyi-alipay-recharge-recovery/route.ts", import.meta.url), "utf8");
  assert.match(service, /Type=oneshot/); assert.match(service, /TimeoutStartSec=45s/);
  assert.match(service, /flock -n -E 0 \/run\/lock\/jianlian-liuhaoyi-alipay-recovery\.lock/);
  assert.match(entry, /spawnSync\("\/usr\/bin\/flock"/);
  assert.match(entry, /LOCK_PATH = "\/run\/lock\/jianlian-liuhaoyi-alipay-recovery\.lock"/);
  assert.match(timer, /OnUnitActiveSec=1min/); assert.match(timer, /Persistent=false/);
  assert.match(route, /queryTimeoutMs >= 1_000 && body\.queryTimeoutMs <= 8_000/);
  assert.ok(WATCHER_BATCH_SIZE * WATCHER_ITEM_TIMEOUT_MS + 2 * 4_000 < WATCHER_BATCH_TIMEOUT_MS);
});

test("callback/recovery and double recovery preserve exactly-once semantics", async () => {
  const callback = readFileSync(new URL("../../lib/payments/payment-callback-service.ts", import.meta.url), "utf8");
  const recovery = readFileSync(new URL("../../lib/payments/liuhaoyi-alipay-recovery-service.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../supabase/migrations/20260915210000_liuhaoyi_recharge_recovery_expiry_guards.sql", import.meta.url), "utf8");
  assert.match(callback, /await completePayment\(/); assert.match(recovery, /await completePayment\(/);
  assert.match(migration, /from public\.payment_sessions[\s\S]*for update[\s\S]*if v_session\.status = 'paid'/);
  for (const actors of [["callback", "watcher"], ["watcher", "callback"], ["watcher", "watcher"]]) {
    let mutex = Promise.resolve(); const state = { balance: 25, ledger: 0, paid: false };
    const complete = () => { const task = mutex.then(() => { if (state.paid) return "duplicate";
      state.paid = true; state.balance++; state.ledger++; return "completed"; });
      mutex = task.then(() => undefined); return task; };
    assert.deepEqual(await Promise.all(actors.map(complete)), ["completed", "duplicate"]);
    assert.deepEqual(state, { balance: 26, ledger: 1, paid: true });
  }
});
