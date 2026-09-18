import assert from "node:assert/strict";
import test from "node:test";

import {
  WATCHER_BATCH_SIZE,
  WATCHER_BATCH_TIMEOUT_MS,
  runLiuhaoyiWechatWatcher,
} from "../../lib/payments/liuhaoyi-wechat-watcher.mjs";

const nowMs = Date.parse("2026-09-18T02:00:00Z");
const env = {
  LIUHAOYI_WECHAT_WATCHER_ENABLED: "true",
  LIUHAOYI_WECHAT_WATCHER_EXECUTE_ENABLED: "false",
  NEXT_PUBLIC_SUPABASE_URL: "https://ci-only.invalid",
  SUPABASE_SECRET_KEY: "FAKE_SUPABASE_SECRET",
  PAYMENT_RECONCILIATION_SECRET: "FAKE_INTERNAL_SECRET",
  JIANLIAN_INTERNAL_BASE_URL: "http://127.0.0.1:3001",
};
const rows = Array.from({ length: 10 }, (_, index) => ({
  session_no: `PS20260918CIWATCHER${index.toString().padStart(2, "0")}`,
  status: "pending",
  created_at: new Date(nowMs - (index + 2) * 60_000).toISOString(),
  expires_at: new Date(nowMs + 20 * 60_000).toISOString(),
}));
const response = (selected, total = 10) => new Response(JSON.stringify(selected), {
  status: 200,
  headers: { "content-range": selected.length ? `0-${selected.length - 1}/${total}` : `*/${total}` },
});
const fetchCandidates = async (url) => {
  const limit = Number(url.searchParams.get("limit"));
  const offset = Number(url.searchParams.get("offset") ?? 0);
  return response(rows.slice(offset, offset + limit));
};
const safeResult = (changes = {}) => ({
  success: true, provider_paid: false, eligible: false,
  completed: false, idempotent: false, reason: "provider_unpaid", ...changes,
});

test("fake signed provider URL is redacted in watcher runtime audit", async () => {
  const fakeUrl = "https://provider.example/api.php?act=order&pid=1179&key=FAKE_SECRET&out_trade_no=TEST";
  const records = [];
  const result = await runLiuhaoyiWechatWatcher({
    env, nowMs, fetchImpl: fetchCandidates,
    worker: async () => safeResult({ success: false, reason: fakeUrl }),
    write: (line) => records.push(line),
  });
  assert.equal(result.completed_count, 0);
  const output = records.join("\n");
  for (const forbidden of ["FAKE_SECRET", fakeUrl, "FAKE_SUPABASE_SECRET", "FAKE_INTERNAL_SECRET", "key="]) {
    assert.equal(output.includes(forbidden), false);
  }
  assert.equal(JSON.parse(records[0]).reason, null);
  console.log("RUNTIME_SECRET_REDACTION_PASS=yes");
});

test("four mixed candidates, including a hung provider query, finish within 45 seconds", async () => {
  const records = [];
  let index = 0;
  const started = Date.now();
  const result = await runLiuhaoyiWechatWatcher({
    env, nowMs, fetchImpl: async () => response(rows.slice(0, 4), 4),
    worker: async () => {
      const current = index++;
      if (current === 0) return safeResult({ provider_paid: true, eligible: true, reason: "eligible" });
      if (current === 1) return safeResult();
      if (current === 2) return new Promise(() => {});
      return safeResult({ success: false, reason: "invalid_json" });
    },
    write: (line) => records.push(JSON.parse(line)),
  });
  const elapsed = Date.now() - started;
  assert.equal(result.processed_count, 4);
  assert.equal(result.paid_found_count, 1);
  assert.equal(result.completed_count, 0);
  assert.equal(result.timeout_count, 1);
  assert.ok(elapsed <= WATCHER_BATCH_TIMEOUT_MS, `batch took ${elapsed}ms`);
  assert.equal(records.at(-1).backlog_present, "no");
  console.log(`BATCH_RUNTIME_MAX=${elapsed}ms`);
  console.log("BATCH_TIMEOUT_PASS=yes");
});

test("backlog is measured and rotating old slot advances while newest three stay prioritized", async () => {
  const selected = [];
  for (const minute of [0, 1]) {
    const called = [];
    const records = [];
    const result = await runLiuhaoyiWechatWatcher({
      env, nowMs: nowMs + minute * 60_000, fetchImpl: fetchCandidates,
      worker: async ({ sessionNo }) => { called.push(sessionNo); return safeResult(); },
      write: (line) => records.push(JSON.parse(line)),
    });
    assert.equal(result.eligible_count, 10);
    assert.equal(result.processed_count, WATCHER_BATCH_SIZE);
    assert.equal(result.remaining_count, 10 - WATCHER_BATCH_SIZE);
    assert.deepEqual(called.slice(0, 3), rows.slice(0, 3).map((row) => row.session_no));
    assert.equal(records.at(-1).backlog_present, "yes");
    selected.push(called[3]);
  }
  assert.notEqual(selected[0], selected[1]);
  console.log("BACKLOG_ROTATION_PASS=yes");
});
