#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const RECOVERY_PATH = "/api/internal/payments/liuhaoyi-wechat-recharge-recovery";
const DEFAULT_TIMEOUT_MS = 60_000;

export function recoveryUrl(baseUrl) {
  const base = new URL(String(baseUrl ?? ""));
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) {
    throw new Error("LIUHAOYI_WECHAT_RECOVERY_BASE_URL_INVALID");
  }
  return new URL(RECOVERY_PATH, base);
}

export async function runLiuhaoyiWechatRecoveryWorker({
  baseUrl,
  secret,
  sessionNo,
  execute = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
  write = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  const mode = execute === true ? "execute" : "dry_run";
  let httpStatus = 0;
  try {
    if (typeof secret !== "string" || !secret) throw new Error("LIUHAOYI_WECHAT_RECOVERY_SECRET_MISSING");
    if (typeof sessionNo !== "string" || !sessionNo.trim()) throw new Error("LIUHAOYI_WECHAT_RECOVERY_SESSION_MISSING");
    const response = await fetchImpl(recoveryUrl(baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", "x-payment-reconciliation-secret": secret },
      body: JSON.stringify({ sessionNo: sessionNo.trim(), execute: execute === true }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    httpStatus = response.status;
    const payload = await response.json().catch(() => null);
    if (!response.ok || !validResponse(payload, mode, sessionNo.trim())) throw new Error("LIUHAOYI_WECHAT_RECOVERY_RESPONSE_INVALID");
    const summary = safeSummary(payload, httpStatus, true);
    write(JSON.stringify(summary));
    return { exitCode: 0, ...summary };
  } catch {
    const summary = safeSummary(null, httpStatus, false, mode, sessionNo);
    write(JSON.stringify(summary));
    return { exitCode: 1, ...summary };
  }
}

function validResponse(value, mode, sessionNo) {
  return value && typeof value === "object" && value.mode === mode && value.session_no === sessionNo
    && ["session_found", "recharge_found", "provider_found", "provider_paid", "provider_type_match", "amount_match", "paid_within_expiry", "local_already_credited", "eligible", "would_complete", "completed", "idempotent", "manual_review"].every((key) => typeof value[key] === "boolean")
    && Number.isInteger(value.ledger_count) && value.ledger_count >= 0;
}

function safeSummary(payload, httpStatus, success, mode = payload?.mode ?? null, sessionNo = payload?.session_no ?? null) {
  return {
    success, mode, http_status: httpStatus, session_no: sessionNo,
    session_found: payload?.session_found ?? null,
    recharge_found: payload?.recharge_found ?? null,
    provider_found: payload?.provider_found ?? null,
    provider_paid: payload?.provider_paid ?? null,
    provider_type_match: payload?.provider_type_match ?? null,
    amount_match: payload?.amount_match ?? null,
    paid_within_expiry: payload?.paid_within_expiry ?? null,
    local_already_credited: payload?.local_already_credited ?? null,
    ledger_count: payload?.ledger_count ?? null,
    eligible: payload?.eligible ?? null,
    would_complete: payload?.would_complete ?? null,
    completed: payload?.completed ?? null,
    idempotent: payload?.idempotent ?? null,
    manual_review: payload?.manual_review ?? null,
    reason: typeof payload?.reason === "string" ? payload.reason : null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const sessionArg = args.find((value) => value.startsWith("--session="));
  const result = await runLiuhaoyiWechatRecoveryWorker({
    baseUrl: process.env.JIANLIAN_INTERNAL_BASE_URL,
    secret: process.env.PAYMENT_RECONCILIATION_SECRET ?? process.env.INTERNAL_API_SECRET,
    sessionNo: sessionArg?.slice("--session=".length),
    execute: args.includes("--execute"),
  });
  process.exitCode = result.exitCode;
}

const isDirectExecution = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirectExecution) await main();
