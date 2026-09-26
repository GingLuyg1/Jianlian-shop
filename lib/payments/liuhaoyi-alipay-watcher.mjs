import { randomUUID } from "node:crypto";
import { runLiuhaoyiAlipayRecoveryWorker } from "../../scripts/ops/liuhaoyi-alipay-recharge-recovery.mjs";

export const WATCHER_MINIMUM_AGE_MS = 60_000;
export const WATCHER_RECOVERY_LOOKBACK_MS = 24 * 60 * 60_000;
export const WATCHER_BATCH_SIZE = 4;
export const WATCHER_QUERY_TIMEOUT_MS = 6_000;
export const WATCHER_ITEM_TIMEOUT_MS = 8_000;
export const WATCHER_BATCH_TIMEOUT_MS = 45_000;
const READ_TIMEOUT_MS = 4_000;

export const watcherEnabled = (value) => value === "true";
export const watcherExecutionEnabled = (args, env) =>
  args.includes("--execute") && watcherEnabled(env.LIUHAOYI_ALIPAY_WATCHER_EXECUTE_ENABLED);

export function candidateMode(row, nowMs, execute) {
  const expiry = Date.parse(String(row?.expires_at ?? ""));
  const created = Date.parse(String(row?.created_at ?? ""));
  if (row?.status !== "pending" || !Number.isFinite(created)
    || created > nowMs - WATCHER_MINIMUM_AGE_MS
    || created < nowMs - WATCHER_RECOVERY_LOOKBACK_MS
    || !Number.isFinite(expiry)) return "skip";
  if (expiry > nowMs && expiry <= nowMs + 5_000) return "dry_run";
  return execute ? "execute" : "dry_run";
}

function candidateUrl(base, nowMs, limit, offset = 0) {
  const origin = new URL(String(base));
  if (origin.protocol !== "https:" || origin.username || origin.password) throw new Error("invalid_supabase_origin");
  const url = new URL("rest/v1/payment_sessions", origin.origin + "/");
  for (const [key, value] of Object.entries({
    select: "session_no,status,created_at,expires_at", provider: "eq.liuhaoyi",
    channel_code: "eq.alipay", business_type: "eq.recharge", currency: "eq.CNY",
    status: "eq.pending",
    order: "created_at.desc,session_no.desc", limit: String(limit),
  })) url.searchParams.set(key, value);
  url.searchParams.append("created_at", "gte." + new Date(nowMs - WATCHER_RECOVERY_LOOKBACK_MS).toISOString());
  url.searchParams.append("created_at", "lte." + new Date(nowMs - WATCHER_MINIMUM_AGE_MS).toISOString());
  if (offset) url.searchParams.set("offset", String(offset));
  return url;
}

function safeInternalBase(value) {
  try {
    const url = new URL(String(value));
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

function safeReason(value) {
  return typeof value === "string" && /^[a-z0-9_]{1,80}$/.test(value) ? value : null;
}

async function readCandidates(fetchImpl, base, key, nowMs, limit, offset = 0) {
  const response = await fetchImpl(candidateUrl(base, nowMs, limit, offset), {
    headers: { apikey: key, Authorization: "Bearer " + key, Prefer: "count=exact" },
    cache: "no-store", signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("candidate_read_failed");
  const match = /^(?:\d+-\d+|\*)\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
  const count = match ? Number(match[1]) : NaN;
  const rows = await response.json();
  if (!Array.isArray(rows) || !Number.isSafeInteger(count) || count < 0
    || rows.length > limit || rows.length > count) throw new Error("candidate_response_invalid");
  return { rows, count };
}

async function boundedWorker(work, timeoutMs) {
  let timer;
  try {
    return await Promise.race([work, new Promise((resolve) => {
      timer = setTimeout(() => resolve({ success: false, reason: "worker_timeout" }), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

export async function runLiuhaoyiAlipayWatcher({
  env = process.env, args = [], nowMs = Date.now(), fetchImpl = fetch,
  worker = runLiuhaoyiAlipayRecoveryWorker,
  write = (line) => process.stdout.write(line + "\n"), runId = randomUUID(),
} = {}) {
  const startedRealMs = Date.now();
  const baseRecord = { event: "alipay_recovery_watcher", run_id: runId,
    started_at: new Date(nowMs).toISOString() };
  const emit = (fields) => write(JSON.stringify(fields));
  if (!watcherEnabled(env.LIUHAOYI_ALIPAY_WATCHER_ENABLED)) {
    emit({ ...baseRecord, status: "disabled" }); return { status: "disabled", processed: 0 };
  }
  const execute = watcherExecutionEnabled(args, env);
  if (args.includes("--execute") && !execute) {
    emit({ ...baseRecord, status: "execute_not_enabled" });
    return { status: "execute_not_enabled", processed: 0 };
  }
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  const secret = env.PAYMENT_RECONCILIATION_SECRET ?? env.INTERNAL_API_SECRET;
  const internalBase = env.JIANLIAN_INTERNAL_BASE_URL;
  if (![base, key, secret, internalBase].every((v) => typeof v === "string" && v.length > 0)
    || !safeInternalBase(internalBase)) {
    emit({ ...baseRecord, status: "configuration_missing" });
    return { status: "configuration_missing", processed: 0 };
  }

  let candidates, eligibleCount;
  let scanChanged = false;
  try {
    const newest = await readCandidates(fetchImpl, base, key, nowMs, WATCHER_BATCH_SIZE);
    eligibleCount = newest.count;
    candidates = newest.rows.slice(0, eligibleCount > WATCHER_BATCH_SIZE
      ? WATCHER_BATCH_SIZE - 1 : WATCHER_BATCH_SIZE);
    if (eligibleCount > WATCHER_BATCH_SIZE) {
      const olderCount = eligibleCount - (WATCHER_BATCH_SIZE - 1);
      const offset = WATCHER_BATCH_SIZE - 1 + (Math.floor(nowMs / 60_000) % olderCount);
      const older = await readCandidates(fetchImpl, base, key, nowMs, 1, offset);
      if (older.count !== eligibleCount) scanChanged = true;
      else candidates.push(...older.rows);
    }
  } catch {
    emit({ ...baseRecord, status: "candidate_read_failed" });
    return { status: "candidate_read_failed", processed: 0 };
  }

  const metrics = { eligible_count: eligibleCount, processed_count: 0, paid_found_count: 0,
    completed_count: 0, skipped_count: 0, timeout_count: 0 };
  let failures = 0;
  const seen = new Set();
  for (const row of candidates) {
    if (Date.now() - startedRealMs >= WATCHER_BATCH_TIMEOUT_MS - WATCHER_ITEM_TIMEOUT_MS) break;
    const sessionNo = String(row?.session_no ?? "");
    if (!/^PS[A-Za-z0-9_-]{8,157}$/.test(sessionNo) || seen.has(sessionNo)) {
      metrics.skipped_count++; continue;
    }
    seen.add(sessionNo);
    const mode = candidateMode(row, nowMs, execute);
    if (mode === "skip") { metrics.skipped_count++; continue; }
    const itemStarted = Date.now();
    let result;
    try {
      result = await boundedWorker(worker({ baseUrl: internalBase, secret, sessionNo,
        execute: mode === "execute", timeoutMs: WATCHER_ITEM_TIMEOUT_MS,
        queryTimeoutMs: WATCHER_QUERY_TIMEOUT_MS, fetchImpl, write: () => {} }), WATCHER_ITEM_TIMEOUT_MS);
    } catch { result = { success: false, reason: "worker_failed" }; }
    metrics.processed_count++;
    if (result.provider_paid === true) metrics.paid_found_count++;
    if (result.completed === true) metrics.completed_count++;
    if (result.reason === "worker_timeout") metrics.timeout_count++;
    if (result.completed !== true && result.provider_paid !== true) metrics.skipped_count++;
    if (!result.success) failures++;
    emit({ event: "alipay_recovery_session", run_id: runId, session_no: sessionNo, mode,
      result: result.success ? "checked" : "failed", reason: safeReason(result.reason),
      duration_ms: Date.now() - itemStarted, provider_paid: result.provider_paid === true,
      eligible: result.eligible === true, completed: result.completed === true,
      idempotent: result.idempotent === true });
  }
  const remaining = Math.max(0, eligibleCount - metrics.processed_count);
  const status = failures ? "partial_failure" : remaining ? "backlog_present" : "finished";
  emit({ ...baseRecord, status, mode: execute ? "execute" : "dry_run", ...metrics,
    remaining_count: remaining, backlog_present: remaining ? "yes" : "no",
    scan_changed: scanChanged, duration_ms: Date.now() - startedRealMs, failures });
  return { status, processed: metrics.processed_count, ...metrics, remaining_count: remaining };
}
