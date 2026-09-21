import assert from "node:assert/strict";
import test from "node:test";

import { recoveryUrl, runLiuhaoyiAlipayRecoveryWorker }
  from "../../scripts/ops/liuhaoyi-alipay-recharge-recovery.mjs";

const payload = (mode) => ({ mode, session_no: "PS-WORKER-1234", session_found: true,
  recharge_found: true, provider_found: true, provider_paid: true, provider_type_match: true,
  amount_match: true, paid_within_expiry: true, local_already_credited: false, ledger_count: 0,
  eligible: true, would_complete: true, completed: mode === "execute", idempotent: false,
  manual_review: false, reason: "eligible" });

test("worker uses the dedicated local-safe endpoint", () => {
  assert.equal(recoveryUrl("http://127.0.0.1:3001").toString(),
    "http://127.0.0.1:3001/api/internal/payments/liuhaoyi-alipay-recharge-recovery");
  assert.throws(() => recoveryUrl("https://user:pass@example.test"), /BASE_URL_INVALID/);
});

test("worker defaults to dry-run and sends one explicit session", async () => {
  let request; const lines = [];
  const result = await runLiuhaoyiAlipayRecoveryWorker({ baseUrl: "http://127.0.0.1:3001",
    secret: "worker-test-secret", sessionNo: "PS-WORKER-1234", write: (line) => lines.push(line),
    fetchImpl: async (url, init) => { request = { url: String(url), init };
      return new Response(JSON.stringify(payload("dry_run")), { status: 200 }); } });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(request.init.body), { sessionNo: "PS-WORKER-1234", execute: false });
  assert.equal(JSON.parse(lines[0]).mode, "dry_run");
  assert.doesNotMatch(request.url + lines[0], /worker-test-secret/);
});

test("worker sends explicit execute and bounded provider query timeout", async () => {
  let body;
  const result = await runLiuhaoyiAlipayRecoveryWorker({ baseUrl: "http://127.0.0.1:3001",
    secret: "worker-test-secret", sessionNo: "PS-WORKER-1234", execute: true,
    queryTimeoutMs: 6000, write: () => {}, fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body); return new Response(JSON.stringify(payload("execute")), { status: 200 });
    } });
  assert.deepEqual(body, { sessionNo: "PS-WORKER-1234", execute: true, queryTimeoutMs: 6000 });
  assert.equal(result.mode, "execute");
});

test("request failure produces a safe nonzero result without credentials", async () => {
  const lines = [];
  const result = await runLiuhaoyiAlipayRecoveryWorker({ baseUrl: "http://127.0.0.1:3001",
    secret: "never-log-me", sessionNo: "PS-WORKER-1234", write: (line) => lines.push(line),
    fetchImpl: async () => { throw new Error("provider URL key=never-log-me"); } });
  assert.equal(result.exitCode, 1);
  assert.doesNotMatch(lines[0], /never-log-me|key=/);
});
