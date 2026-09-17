import { randomUUID } from "node:crypto";

import { runLiuhaoyiWechatRecoveryWorker } from "../../scripts/ops/liuhaoyi-wechat-recharge-recovery.mjs";

export const WATCHER_MINIMUM_AGE_MS = 3 * 60_000;
export const WATCHER_DIAGNOSTIC_WINDOW_MS = 60 * 60_000;
export const WATCHER_EXPIRY_MARGIN_MS = 5_000;
export const WATCHER_MAX_CANDIDATES = 20;

export function watcherEnabled(value) {
  return value === "true";
}

export function watcherExecutionEnabled(args, env) {
  return args.includes("--execute") && watcherEnabled(env.LIUHAOYI_WECHAT_WATCHER_EXECUTE_ENABLED);
}

export function candidateMode(row, nowMs, execute) {
  const expiresAtMs = Date.parse(String(row.expires_at ?? ""));
  if (!Number.isFinite(expiresAtMs)) return "skip";
  if (expiresAtMs < nowMs - WATCHER_DIAGNOSTIC_WINDOW_MS) return "skip";
  if (row.status === "expired" || expiresAtMs <= nowMs + WATCHER_EXPIRY_MARGIN_MS) return "dry_run";
  return execute && ["pending", "processing"].includes(row.status) ? "execute" : "dry_run";
}

function candidateUrl(base, nowMs) {
  const origin = new URL(String(base));
  if (origin.protocol !== "https:" || origin.username || origin.password) throw new Error("invalid_supabase_origin");
  const url = new URL("rest/v1/payment_sessions", `${origin.origin}/`);
  url.searchParams.set("select", "session_no,status,expires_at");
  url.searchParams.set("provider", "eq.liuhaoyi");
  url.searchParams.set("channel_code", "eq.wechat");
  url.searchParams.set("business_type", "in.(recharge,account_recharge)");
  url.searchParams.set("currency", "eq.CNY");
  url.searchParams.set("status", "in.(pending,processing,expired)");
  url.searchParams.set("created_at", `lte.${new Date(nowMs - WATCHER_MINIMUM_AGE_MS).toISOString()}`);
  url.searchParams.set("expires_at", `gte.${new Date(nowMs - WATCHER_DIAGNOSTIC_WINDOW_MS).toISOString()}`);
  url.searchParams.set("order", "created_at.asc");
  url.searchParams.set("limit", String(WATCHER_MAX_CANDIDATES));
  return url;
}

function safeInternalBase(value) {
  try {
    const url = new URL(String(value));
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      && ["http:", "https:"].includes(url.protocol)
      && !url.username && !url.password;
  } catch {
    return false;
  }
}

function safeRecord(fields) {
  return JSON.stringify(fields);
}

export async function runLiuhaoyiWechatWatcher({
  env = process.env,
  args = [],
  nowMs = Date.now(),
  fetchImpl = fetch,
  worker = runLiuhaoyiWechatRecoveryWorker,
  write = (line) => process.stdout.write(`${line}\n`),
  runId = randomUUID(),
} = {}) {
  const startedAt = new Date(nowMs).toISOString();
  if (!watcherEnabled(env.LIUHAOYI_WECHAT_WATCHER_ENABLED)) {
    write(safeRecord({ event: "wechat_recovery_watcher", run_id: runId, started_at: startedAt, status: "disabled" }));
    return { status: "disabled", processed: 0 };
  }
  const execute = watcherExecutionEnabled(args, env);
  if (args.includes("--execute") && !execute) {
    write(safeRecord({ event: "wechat_recovery_watcher", run_id: runId, started_at: startedAt, status: "execute_not_enabled" }));
    return { status: "execute_not_enabled", processed: 0 };
  }
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  const secret = env.PAYMENT_RECONCILIATION_SECRET ?? env.INTERNAL_API_SECRET;
  const internalBase = env.JIANLIAN_INTERNAL_BASE_URL;
  if (![base, key, secret, internalBase].every((value) => typeof value === "string" && value.length > 0)
    || !safeInternalBase(internalBase)) {
    write(safeRecord({ event: "wechat_recovery_watcher", run_id: runId, started_at: startedAt, status: "configuration_missing" }));
    return { status: "configuration_missing", processed: 0 };
  }
  let rows;
  try {
    const response = await fetchImpl(candidateUrl(base, nowMs), {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("candidate_read_failed");
    rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("candidate_response_invalid");
  } catch {
    write(safeRecord({ event: "wechat_recovery_watcher", run_id: runId, started_at: startedAt, status: "candidate_read_failed" }));
    return { status: "candidate_read_failed", processed: 0 };
  }
  let processed = 0;
  let failures = 0;
  const seen = new Set();
  for (const row of rows) {
    const sessionNo = String(row?.session_no ?? "");
    if (!/^PS[A-Za-z0-9_-]{8,157}$/.test(sessionNo) || seen.has(sessionNo)) continue;
    seen.add(sessionNo);
    const mode = candidateMode(row, nowMs, execute);
    if (mode === "skip") continue;
    let result;
    try {
      result = await worker({
        baseUrl: internalBase,
        secret,
        sessionNo,
        execute: mode === "execute",
        fetchImpl,
        write: () => {},
      });
    } catch {
      result = { success: false, reason: "worker_failed" };
    }
    processed += 1;
    if (!result.success) failures += 1;
    write(safeRecord({
      event: "wechat_recovery_session", run_id: runId, timestamp: new Date().toISOString(),
      session_no: sessionNo, mode, result: result.success ? "checked" : "failed",
      provider_found: result.provider_found === true, provider_paid: result.provider_paid === true,
      provider_type_match: result.provider_type_match === true, amount_match: result.amount_match === true,
      paid_within_expiry: result.paid_within_expiry === true, eligible: result.eligible === true,
      skip_reason: typeof result.reason === "string" && /^[a-z0-9_]{1,80}$/.test(result.reason) ? result.reason : null,
      completed: result.completed === true, idempotent: result.idempotent === true,
    }));
  }
  const capReached = rows.length >= WATCHER_MAX_CANDIDATES;
  const status = failures > 0 ? "partial_failure" : capReached ? "candidate_cap_reached" : "finished";
  write(safeRecord({ event: "wechat_recovery_watcher", run_id: runId, started_at: startedAt, status, mode: execute ? "execute" : "dry_run", processed, failures, cap_reached: capReached }));
  return { status, processed };
}
