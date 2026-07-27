#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 200;
const REQUEST_TIMEOUT_MS = 15_000;
const MONITOR_PATH = "/api/internal/payments/bep20/underpayments/settle";

export function parseMonitorLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(parsed), MAX_LIMIT));
}

export function parseMonitorArguments(args) {
  const limitArgument = args.find((argument) => argument.startsWith("--limit="));
  return {
    limit: parseMonitorLimit(limitArgument?.slice("--limit=".length)),
  };
}

export function summarizeRequestId(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  return text.length > 14 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text;
}

function createSummary({
  success,
  eligible,
  candidateCount,
  requestId,
  httpStatus,
  durationMs,
}) {
  return {
    timestamp: new Date().toISOString(),
    success,
    eligible,
    candidate_count: candidateCount,
    request_id: summarizeRequestId(requestId),
    http_status: httpStatus,
    duration_ms: durationMs,
  };
}

function buildMonitorUrl(baseUrl, limit) {
  const parsedBase = new URL(baseUrl);
  if (!["http:", "https:"].includes(parsedBase.protocol) || parsedBase.username || parsedBase.password) {
    throw new Error("MONITOR_BASE_URL_INVALID");
  }
  const target = new URL(MONITOR_PATH, parsedBase);
  target.searchParams.set("limit", String(parseMonitorLimit(limit)));
  return target;
}

function validDryRunResponse(payload) {
  if (!payload || typeof payload !== "object" || payload.success !== true) return null;
  const preview = payload.preview;
  if (!preview || typeof preview !== "object") return null;
  const candidateCount = preview.candidate_count;
  if (!Number.isInteger(candidateCount) || candidateCount < 0) return null;
  return {
    candidateCount,
    requestId: preview.request_id,
  };
}

export async function runMonitor({
  baseUrl,
  secret,
  limit = DEFAULT_LIMIT,
  timeoutMs = REQUEST_TIMEOUT_MS,
  fetchImpl = fetch,
  write = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  const startedAt = Date.now();
  let httpStatus = 0;

  try {
    if (typeof baseUrl !== "string" || !baseUrl.trim() || typeof secret !== "string" || !secret) {
      throw new Error("MONITOR_CONFIGURATION_MISSING");
    }

    const response = await fetchImpl(buildMonitorUrl(baseUrl, limit), {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-internal-job-secret": secret,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    httpStatus = response.status;

    const payload = await response.json().catch(() => null);
    const parsed = response.status === 200 ? validDryRunResponse(payload) : null;
    if (!parsed) {
      write(JSON.stringify(createSummary({
        success: false,
        eligible: false,
        candidateCount: null,
        requestId: null,
        httpStatus,
        durationMs: Date.now() - startedAt,
      })));
      return { exitCode: 1, httpStatus };
    }

    const eligible = parsed.candidateCount > 0;
    write(JSON.stringify(createSummary({
      success: true,
      eligible,
      candidateCount: parsed.candidateCount,
      requestId: parsed.requestId,
      httpStatus,
      durationMs: Date.now() - startedAt,
    })));
    return {
      exitCode: eligible ? 2 : 0,
      httpStatus,
      candidateCount: parsed.candidateCount,
    };
  } catch {
    write(JSON.stringify(createSummary({
      success: false,
      eligible: false,
      candidateCount: null,
      requestId: null,
      httpStatus,
      durationMs: Date.now() - startedAt,
    })));
    return { exitCode: 1, httpStatus };
  }
}

async function main() {
  const { limit } = parseMonitorArguments(process.argv.slice(2));
  const result = await runMonitor({
    baseUrl: process.env.JIANLIAN_INTERNAL_BASE_URL,
    secret: process.env.BEP20_UNDERPAYMENT_JOB_SECRET,
    limit,
  });
  process.exitCode = result.exitCode;
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  await main();
}
