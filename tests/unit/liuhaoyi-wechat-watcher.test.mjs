import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { WATCHER_MINIMUM_AGE_MS, WATCHER_BATCH_SIZE, WATCHER_QUERY_TIMEOUT_MS,
  WATCHER_ITEM_TIMEOUT_MS, WATCHER_BATCH_TIMEOUT_MS, candidateMode,
  runLiuhaoyiWechatWatcher } from "../../lib/payments/liuhaoyi-wechat-watcher.mjs";
import { runLiuhaoyiWechatRecoveryWorker } from "../../scripts/ops/liuhaoyi-wechat-recharge-recovery.mjs";

const nowMs = Date.parse("2026-09-17T03:10:00.000Z");
const sessionNo = "PS20260917025943GVBASP";
const env = {
  LIUHAOYI_WECHAT_WATCHER_ENABLED: "true",
  LIUHAOYI_WECHAT_WATCHER_EXECUTE_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "test-secret-do-not-log",
  PAYMENT_RECONCILIATION_SECRET: "test-worker-secret-do-not-log",
  JIANLIAN_INTERNAL_BASE_URL: "http://127.0.0.1:3001",
};
const active = { session_no: sessionNo, status: "pending",
  created_at: "2026-09-17T02:59:43.000Z", expires_at: "2026-09-17T03:29:43.339Z" };
const result = (overrides = {}) => ({
  success: true, provider_found: true, provider_paid: false, provider_type_match: false,
  amount_match: false, paid_within_expiry: false, eligible: false,
  reason: "provider_unpaid", completed: false, idempotent: false, ...overrides,
});
const response = (rows, count = rows.length) => new Response(JSON.stringify(rows), {
  status: 200, headers: { "content-range": rows.length ? `0-${rows.length - 1}/${count}` : `*/${count}` },
});
const run = (options = {}) => {
  const output = [];
  return runLiuhaoyiWechatWatcher({
    env, nowMs, write: (line) => output.push(JSON.parse(line)),
    fetchImpl: async () => response([active]), worker: async () => result(),
    ...options,
  }).then((value) => ({ value, output }));
};

test("watcher is disabled by default, dry-run by default, execute needs two gates", async () => {
  let called = false;
  const disabled = await run({ env: {}, fetchImpl: async () => { called = true; } });
  assert.equal(disabled.value.status, "disabled");
  assert.equal(called, false);
  const dryCalls = [];
  await run({ worker: async (input) => { dryCalls.push(input); return result(); } });
  assert.equal(dryCalls[0].execute, false);
  const blocked = await run({ args: ["--execute"], env: { ...env, LIUHAOYI_WECHAT_WATCHER_EXECUTE_ENABLED: "false" },
    fetchImpl: async () => { called = true; } });
  assert.equal(blocked.value.status, "execute_not_enabled");
  const execCalls = [];
  await run({ args: ["--execute"], worker: async (input) => { execCalls.push(input); return result(); } });
  assert.equal(execCalls[0].execute, true);
  assert.equal(execCalls[0].queryTimeoutMs, WATCHER_QUERY_TIMEOUT_MS);
  assert.equal(execCalls[0].timeoutMs, WATCHER_ITEM_TIMEOUT_MS);
});

test("candidate query is strictly one-minute-old pending WeChat recharge and unexpired", async () => {
  const { value } = await run({ fetchImpl: async (url, init) => {
    for (const [key, expected] of Object.entries({
      provider: "eq.liuhaoyi", channel_code: "eq.wechat", business_type: "eq.recharge",
      currency: "eq.CNY", status: "eq.pending",
      created_at: "lte." + new Date(nowMs - WATCHER_MINIMUM_AGE_MS).toISOString(),
      expires_at: "gt." + new Date(nowMs).toISOString(),
      order: "created_at.desc,session_no.desc", limit: String(WATCHER_BATCH_SIZE),
    })) assert.equal(url.searchParams.get(key), expected);
    assert.equal(init.headers.Prefer, "count=exact");
    assert.equal(init.headers.apikey, env.SUPABASE_SECRET_KEY);
    return response([active]);
  } });
  assert.equal(value.status, "finished");
  assert.equal(candidateMode({ ...active, status: "processing" }, nowMs, true), "skip");
  assert.equal(candidateMode({ ...active, created_at: new Date(nowMs - 59_999).toISOString() }, nowMs, true), "skip");
  assert.equal(candidateMode({ ...active, status: "expired" }, nowMs, true), "skip");
  assert.equal(candidateMode({ ...active, expires_at: new Date(nowMs).toISOString() }, nowMs, true), "skip");
  assert.equal(candidateMode({ ...active, expires_at: new Date(nowMs + 1_000).toISOString() }, nowMs, true), "dry_run");
});

test("newest three always selected and fourth rotates through old backlog with exact metrics", async () => {
  const newest = Array.from({ length: 4 }, (_, i) => ({ ...active, session_no: `PS20260917025943NEW${i}` }));
  const older = { ...active, session_no: "PS20260917025943OLDER" };
  const urls = [], called = [];
  const { output, value } = await run({
    fetchImpl: async (url) => {
      urls.push(url);
      return urls.length === 1 ? response(newest, 10) : response([older], 10);
    },
    worker: async ({ sessionNo }) => { called.push(sessionNo); return result(); },
  });
  assert.deepEqual(called, [...newest.slice(0, 3).map((x) => x.session_no), older.session_no]);
  assert.equal(Number(urls[1].searchParams.get("offset")) >= 3, true);
  assert.equal(urls[1].searchParams.get("limit"), "1");
  assert.equal(value.status, "backlog_present");
  assert.deepEqual([value.eligible_count, value.processed_count, value.remaining_count], [10, 4, 6]);
  assert.equal(output.at(-1).backlog_present, "yes");
  assert.equal(output.at(-1).paid_found_count, 0);
});

test("malformed count and foreign internal URL fail closed; count churn keeps newest safe", async () => {
  assert.equal((await run({ fetchImpl: async () => new Response("[]", { status: 200 }) })).value.status, "candidate_read_failed");
  assert.equal((await run({ env: { ...env, JIANLIAN_INTERNAL_BASE_URL: "https://outside.invalid" } })).value.status, "configuration_missing");
  let read = 0;
  const churn = await run({ fetchImpl: async () => (++read === 1 ? response(
    Array.from({ length: 4 }, (_, i) => ({ ...active, session_no: `PS20260917025943CHURN${i}` })), 7,
  ) : response([active], 6)) });
  assert.equal(churn.value.processed_count, 3);
  assert.equal(churn.output.at(-1).scan_changed, true);
});

test("provider/query failures, timeout and malicious URL are no-credit with redacted audit", async () => {
  const sensitive = "https://liuhao.invalid/api.php?key=" + env.SUPABASE_SECRET_KEY + "&sign=forbidden";
  const { value, output } = await run({ worker: async () => result({ success: false, reason: sensitive }) });
  assert.equal(value.status, "partial_failure");
  assert.equal(output[0].reason, null);
  assert.equal(JSON.stringify(output).includes("key="), false);
  assert.equal(JSON.stringify(output).includes(env.SUPABASE_SECRET_KEY), false);
  const timeout = await run({ worker: async () => result({ success: false, reason: "worker_timeout" }) });
  assert.equal(timeout.value.timeout_count, 1);
  assert.equal(timeout.value.completed_count, 0);
  const providerCases = ["dns_error", "tcp_timeout", "tls_timeout", "http_timeout", "http_5xx",
    "invalid_json", "provider_unpaid", "amount_mismatch", "type_mismatch", "trade_no_missing"];
  for (const reason of providerCases) {
    const runResult = await run({ worker: async () => result({ reason }) });
    assert.equal(runResult.value.completed_count, 0);
    assert.equal(runResult.output[0].reason, reason);
  }
});

test("worker never logs raw exception or full signed provider URL", async () => {
  const lines = [];
  const workerResult = await runLiuhaoyiWechatRecoveryWorker({
    baseUrl: env.JIANLIAN_INTERNAL_BASE_URL, secret: env.PAYMENT_RECONCILIATION_SECRET,
    sessionNo, fetchImpl: async () => { throw new Error("https://liuhao.invalid/api.php?key=secret&sign=secret"); },
    write: (line) => lines.push(line),
  });
  assert.equal(workerResult.success, false);
  assert.equal(workerResult.reason, "worker_failed");
  assert.equal(lines.join("").includes("key="), false);
  assert.equal(lines.join("").includes("sign="), false);
});

test("process lock, timer, and provider query timeout are bounded in source", () => {
  const service = readFileSync(new URL("../../ops/systemd/jianlian-liuhaoyi-wechat-recovery.service", import.meta.url), "utf8");
  const timer = readFileSync(new URL("../../ops/systemd/jianlian-liuhaoyi-wechat-recovery.timer", import.meta.url), "utf8");
  const provider = readFileSync(new URL("../../lib/payments/providers/liuhaoyi.ts", import.meta.url), "utf8");
  const entrypoint = readFileSync(new URL("../../scripts/ops/liuhaoyi-wechat-recharge-watcher.mjs", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../app/api/internal/payments/liuhaoyi-wechat-recharge-recovery/route.ts", import.meta.url), "utf8");
  assert.match(service, /Type=oneshot/);
  assert.match(service, /TimeoutStartSec=45s/);
  assert.match(service, /flock -n -E 0 \/run\/lock\/jianlian-liuhaoyi-wechat-recovery\.lock/);
  assert.match(service, /ReadWritePaths=\/run\/lock/);
  assert.match(entrypoint, /spawnSync\("\/usr\/bin\/flock"/);
  assert.match(entrypoint, /LOCK_PATH = "\/run\/lock\/jianlian-liuhaoyi-wechat-recovery\.lock"/);
  assert.match(service, /--execute/);
  assert.match(timer, /OnUnitActiveSec=1min/);
  assert.match(timer, /Persistent=false/);
  assert.match(provider, /queryTimeoutMs[\s\S]*fetchJson\(endpoint/);
  assert.match(route, /queryTimeoutMs >= 1_000 && body\.queryTimeoutMs <= 8_000/);
  assert.ok(WATCHER_BATCH_SIZE * WATCHER_ITEM_TIMEOUT_MS + 2 * 4_000 < WATCHER_BATCH_TIMEOUT_MS);
});

test("callback/watcher and two watcher completions are idempotent in either order", async () => {
  const callback = readFileSync(new URL("../../lib/payments/payment-callback-service.ts", import.meta.url), "utf8");
  const recovery = readFileSync(new URL("../../lib/payments/liuhaoyi-wechat-recovery-service.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../supabase/migrations/20260915210000_liuhaoyi_recharge_recovery_expiry_guards.sql", import.meta.url), "utf8");
  assert.match(callback, /await completePayment\(/);
  assert.match(recovery, /if \(execute && decision\.eligible\)[\s\S]*await completePayment\(/);
  assert.match(migration, /from public\.payment_sessions[\s\S]*for update[\s\S]*if v_session\.status = 'paid'/);
  for (const order of [["callback", "watcher"], ["watcher", "callback"], ["watcher", "watcher"],
    ["callback", "watcher_late"], ["watcher", "callback_late"]]) {
    let mutex = Promise.resolve();
    const state = { balance: 25, ledger: 0, paid: false };
    const complete = () => {
      const task = mutex.then(() => {
        if (state.paid) return "duplicate";
        state.paid = true; state.balance++; state.ledger++; return "completed";
      });
      mutex = task.then(() => undefined);
      return task;
    };
    const results = await Promise.all(order.map(() => complete()));
    assert.deepEqual(results, ["completed", "duplicate"]);
    assert.deepEqual(state, { balance: 26, ledger: 1, paid: true });
  }
});
