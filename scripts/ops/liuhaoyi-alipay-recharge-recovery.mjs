#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const RECOVERY_PATH = "/api/internal/payments/liuhaoyi-alipay-recharge-recovery";
const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 20;
const DEFAULT_TIMEOUT_MS = 240_000;

export function parseBatchSize(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(1, parsed));
}

export function recoveryUrl(baseUrl) {
  const base = new URL(String(baseUrl ?? ""));
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw new Error("LIUHAOYI_RECOVERY_BASE_URL_INVALID");
  }
  return new URL(RECOVERY_PATH, base);
}

export async function runLiuhaoyiRecoveryWorker({
  baseUrl,
  secret,
  batchSize = DEFAULT_BATCH_SIZE,
  execute = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
  write = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  const startedAt = Date.now();
  const mode = execute === true ? "execute" : "dry_run";
  let httpStatus = 0;
  try {
    if (typeof secret !== "string" || !secret) {
      throw new Error("LIUHAOYI_RECOVERY_SECRET_MISSING");
    }
    const response = await fetchImpl(recoveryUrl(baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-reconciliation-secret": secret,
      },
      body: JSON.stringify({
        batchSize: parseBatchSize(batchSize),
        execute: execute === true,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    httpStatus = response.status;
    const payload = await response.json().catch(() => null);
    if (!response.ok || !validResponse(payload, mode)) {
      throw new Error("LIUHAOYI_RECOVERY_RESPONSE_INVALID");
    }
    const summary = safeSummary(payload, httpStatus, Date.now() - startedAt, true, mode);
    write(JSON.stringify(summary));
    return { exitCode: 0, ...summary };
  } catch {
    const summary = safeSummary(null, httpStatus, Date.now() - startedAt, false, mode);
    write(JSON.stringify(summary));
    return { exitCode: 1, ...summary };
  }
}

function validResponse(value, mode) {
  if (!value || typeof value !== "object") return false;
  if (value.mode !== mode) return false;
  return [
    "processed",
    "resolved",
    "manual_review",
    "pending",
    "query_failed",
    "skipped",
    "error_count",
  ].every((key) => Number.isInteger(value[key]) && value[key] >= 0);
}

function safeSummary(payload, httpStatus, durationMs, success, mode) {
  return {
    timestamp: new Date().toISOString(),
    success,
    mode,
    http_status: httpStatus,
    processed: payload?.processed ?? null,
    resolved: payload?.resolved ?? null,
    manual_review: payload?.manual_review ?? null,
    pending: payload?.pending ?? null,
    query_failed: payload?.query_failed ?? null,
    skipped: payload?.skipped ?? null,
    error_count: payload?.error_count ?? null,
    duration_ms: durationMs,
  };
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const argument = argumentsList.find((value) => value.startsWith("--batch-size="));
  const result = await runLiuhaoyiRecoveryWorker({
    baseUrl: process.env.JIANLIAN_INTERNAL_BASE_URL,
    secret: process.env.PAYMENT_RECONCILIATION_SECRET ?? process.env.INTERNAL_API_SECRET,
    batchSize: parseBatchSize(argument?.slice("--batch-size=".length)),
    execute: argumentsList.includes("--execute"),
  });
  process.exitCode = result.exitCode;
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  await main();
}
