import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBatchSize,
  recoveryUrl,
  runLiuhaoyiRecoveryWorker,
} from "../../scripts/ops/liuhaoyi-alipay-recharge-recovery.mjs";

test("worker uses a bounded batch and dedicated local-safe endpoint", () => {
  assert.equal(parseBatchSize(undefined), 20);
  assert.equal(parseBatchSize(0), 1);
  assert.equal(parseBatchSize(200), 20);
  assert.equal(
    recoveryUrl("http://127.0.0.1:3001").toString(),
    "http://127.0.0.1:3001/api/internal/payments/liuhaoyi-alipay-recharge-recovery",
  );
  assert.throws(() => recoveryUrl("https://user:pass@example.test"), /BASE_URL_INVALID/);
});

test("worker sends the secret only in a header and logs aggregate safe fields", async () => {
  const secret = "worker-test-secret";
  const lines = [];
  let request;
  const result = await runLiuhaoyiRecoveryWorker({
    baseUrl: "http://127.0.0.1:3001",
    secret,
    batchSize: 7,
    write: (line) => lines.push(line),
    fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return new Response(JSON.stringify({
        processed: 2,
        resolved: 1,
        manual_review: 1,
        pending: 0,
        query_failed: 0,
        skipped: 0,
        error_count: 0,
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(request.init.headers["x-payment-reconciliation-secret"], secret);
  assert.equal(JSON.parse(request.init.body).batchSize, 7);
  assert.doesNotMatch(request.url, new RegExp(secret));
  assert.doesNotMatch(lines[0], new RegExp(secret));
  assert.deepEqual(JSON.parse(lines[0]).resolved, 1);
});

test("one request failure produces a safe nonzero result without credentials", async () => {
  const lines = [];
  const result = await runLiuhaoyiRecoveryWorker({
    baseUrl: "http://127.0.0.1:3001",
    secret: "never-log-me",
    write: (line) => lines.push(line),
    fetchImpl: async () => { throw new Error("provider URL key=never-log-me"); },
  });
  assert.equal(result.exitCode, 1);
  assert.doesNotMatch(lines[0], /never-log-me|key=/);
});
