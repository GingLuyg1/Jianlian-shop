import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  WATCHER_MINIMUM_AGE_MS,
  candidateMode,
  runLiuhaoyiWechatWatcher,
} from "../../lib/payments/liuhaoyi-wechat-watcher.mjs";

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
const active = { session_no: sessionNo, status: "pending", expires_at: "2026-09-17T03:29:43.339Z" };
function workerResult() {
  return {
    success: true, provider_found: true, provider_paid: true, provider_type_match: true,
    amount_match: true, paid_within_expiry: true, eligible: true,
    reason: "eligible", completed: false, idempotent: false,
  };
}

test("watcher is disabled by default and performs no query or recovery", async () => {
  let called = false;
  const output = [];
  const result = await runLiuhaoyiWechatWatcher({
    env: {}, nowMs, fetchImpl: async () => { called = true; throw new Error("unexpected"); },
    write: (line) => output.push(JSON.parse(line)),
  });
  assert.equal(result.status, "disabled");
  assert.equal(called, false);
  assert.equal(output[0].status, "disabled");
});

test("watcher dry-run queries only narrow old WeChat recharge candidates and emits safe audit", async () => {
  const output = [], workerCalls = [];
  const result = await runLiuhaoyiWechatWatcher({
    env, nowMs, runId: "run-test", write: (line) => output.push(line),
    fetchImpl: async (url, init) => {
      assert.equal(url.searchParams.get("provider"), "eq.liuhaoyi");
      assert.equal(url.searchParams.get("channel_code"), "eq.wechat");
      assert.equal(url.searchParams.get("business_type"), "in.(recharge,account_recharge)");
      assert.equal(url.searchParams.get("currency"), "eq.CNY");
      assert.equal(url.searchParams.get("created_at"), `lte.${new Date(nowMs - WATCHER_MINIMUM_AGE_MS).toISOString()}`);
      assert.equal(init.headers.apikey, env.SUPABASE_SECRET_KEY);
      return new Response(JSON.stringify([active]), { status: 200 });
    },
    worker: async (input) => { workerCalls.push(input); return workerResult(); },
  });
  assert.equal(result.status, "finished");
  assert.equal(workerCalls.length, 1);
  assert.equal(workerCalls[0].execute, false);
  assert.equal(JSON.parse(output[0]).session_no, sessionNo);
  assert.equal(JSON.parse(output[0]).eligible, true);
  assert.equal(output.join(" ").includes(env.SUPABASE_SECRET_KEY), false);
  assert.equal(output.join(" ").includes(env.PAYMENT_RECONCILIATION_SECRET), false);
});

test("execution needs both explicit flag and separate enable gate", async () => {
  let called = false;
  const blocked = await runLiuhaoyiWechatWatcher({
    env: { ...env, LIUHAOYI_WECHAT_WATCHER_EXECUTE_ENABLED: "false" }, args: ["--execute"], nowMs,
    fetchImpl: async () => { called = true; throw new Error("unexpected"); }, write: () => {},
  });
  assert.equal(blocked.status, "execute_not_enabled");
  assert.equal(called, false);
  const workerCalls = [];
  await runLiuhaoyiWechatWatcher({
    env, args: ["--execute"], nowMs, write: () => {},
    fetchImpl: async () => new Response(JSON.stringify([active]), { status: 200 }),
    worker: async (input) => { workerCalls.push(input); return workerResult(); },
  });
  assert.equal(workerCalls.length, 1);
  assert.equal(workerCalls[0].execute, true);
});

test("watcher will not send internal authentication secret to a non-loopback URL", async () => {
  let called = false;
  const result = await runLiuhaoyiWechatWatcher({
    env: { ...env, JIANLIAN_INTERNAL_BASE_URL: "https://outside.invalid" }, nowMs,
    write: () => {}, fetchImpl: async () => { called = true; throw new Error("unexpected"); },
  });
  assert.equal(result.status, "configuration_missing");
  assert.equal(called, false);
});

test("expired and near-expiry sessions stay diagnostic-only even in execute mode", () => {
  assert.equal(candidateMode({ ...active, status: "expired" }, nowMs, true), "dry_run");
  assert.equal(candidateMode({ ...active, expires_at: new Date(nowMs + 1000).toISOString() }, nowMs, true), "dry_run");
  assert.equal(candidateMode({ ...active, expires_at: new Date(nowMs - 61 * 60_000).toISOString() }, nowMs, true), "skip");
});

test("provider errors and malicious reason strings never leak secrets or URLs to watcher audit", async () => {
  const output = [];
  const result = await runLiuhaoyiWechatWatcher({
    env, nowMs, write: (line) => output.push(line),
    fetchImpl: async () => new Response(JSON.stringify([active]), { status: 200 }),
    worker: async () => ({ ...workerResult(), success: false, reason: `https://provider.invalid/?key=${env.SUPABASE_SECRET_KEY}` }),
  });
  const record = JSON.parse(output[0]);
  assert.equal(record.skip_reason, null);
  assert.equal(result.status, "partial_failure");
  assert.equal(output.join(" ").includes("key="), false);
  assert.equal(output.join(" ").includes(env.SUPABASE_SECRET_KEY), false);
});

test("candidate cap is explicit rather than silently claiming complete coverage", async () => {
  const output = [];
  const rows = Array.from({ length: 20 }, (_, index) => ({ ...active, session_no: `PS20260917025943GVBAS${index.toString().padStart(2, "0")}` }));
  const result = await runLiuhaoyiWechatWatcher({
    env, nowMs, write: (line) => output.push(JSON.parse(line)),
    fetchImpl: async () => new Response(JSON.stringify(rows), { status: 200 }),
    worker: async () => workerResult(),
  });
  assert.equal(result.status, "candidate_cap_reached");
  assert.equal(output.at(-1).cap_reached, true);
});

test("unexpected worker exceptions are redacted and mark the run failed", async () => {
  const output = [];
  const result = await runLiuhaoyiWechatWatcher({
    env, nowMs, write: (line) => output.push(line),
    fetchImpl: async () => new Response(JSON.stringify([active]), { status: 200 }),
    worker: async () => { throw new Error(`provider URL?key=${env.SUPABASE_SECRET_KEY}`); },
  });
  assert.equal(result.status, "partial_failure");
  assert.equal(JSON.parse(output[0]).skip_reason, "worker_failed");
  assert.equal(output.join(" ").includes(env.SUPABASE_SECRET_KEY), false);
});

test("WeChat callback and recovery share locked atomic completion for concurrent and duplicate attempts", async () => {
  const callback = readFileSync(new URL("../../lib/payments/payment-callback-service.ts", import.meta.url), "utf8");
  const recovery = readFileSync(new URL("../../lib/payments/liuhaoyi-wechat-recovery-service.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../supabase/migrations/20260915210000_liuhaoyi_recharge_recovery_expiry_guards.sql", import.meta.url), "utf8");
  assert.match(callback, /await completePayment\(/);
  assert.match(recovery, /if \(execute && decision\.eligible\)[\s\S]*await completePayment\(/);
  assert.match(migration, /from public\.payment_sessions[\s\S]*for update[\s\S]*if v_session\.status = 'paid'/);
  assert.match(migration, /from public\.account_recharges[\s\S]*for update[\s\S]*if v_recharge\.status = 'paid'/);
  let lock = Promise.resolve();
  const state = { session: "pending", recharge: "pending", balance: 25, ledgers: 0 };
  const complete = () => {
    const result = lock.then(() => {
      if (state.session === "paid") return { idempotent: true };
      state.session = "paid"; state.recharge = "paid"; state.balance += 1; state.ledgers += 1;
      return { idempotent: false };
    });
    lock = result.then(() => undefined);
    return result;
  };
  const [callbackResult, recoveryResult, secondRecovery] = await Promise.all([complete(), complete(), complete()]);
  assert.deepEqual([callbackResult.idempotent, recoveryResult.idempotent, secondRecovery.idempotent], [false, true, true]);
  assert.deepEqual(state, { session: "paid", recharge: "paid", balance: 26, ledgers: 1 });
  assert.deepEqual(await complete(), { idempotent: true });
  assert.equal(state.ledgers, 1);
});
