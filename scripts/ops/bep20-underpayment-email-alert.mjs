#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import {
  parseMonitorArguments,
  runMonitor,
} from "./bep20-underpayment-dry-run-monitor.mjs";

const DEFAULT_COOLDOWN_MINUTES = 360;
const DEFAULT_STATE_FILE =
  "/var/lib/jianlian/bep20-underpayment-email-alert-state.json";
const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 15_000;
const MAX_COOLDOWN_MINUTES = 525_600;

function parseCooldownMinutes(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return DEFAULT_COOLDOWN_MINUTES;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_COOLDOWN_MINUTES) {
    throw new Error("BEP20_ALERT_COOLDOWN_INVALID");
  }
  return parsed;
}

function parseMonitorSummary(line) {
  try {
    const parsed = JSON.parse(line);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      candidateCount: Number.isInteger(parsed.candidate_count)
        ? parsed.candidate_count
        : null,
      httpStatus: Number.isInteger(parsed.http_status) ? parsed.http_status : 0,
      maskedRequestId: ensureMaskedRequestId(parsed.request_id),
      durationMs:
        Number.isInteger(parsed.duration_ms) && parsed.duration_ms >= 0
          ? parsed.duration_ms
          : null,
    };
  } catch {
    return null;
  }
}

function ensureMaskedRequestId(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (text.includes("...")) return text;
  if (text.length <= 4) return `${text.slice(0, 1)}...`;
  return `${text.slice(0, 3)}...${text.slice(-2)}`;
}

function createFingerprint(eventType, candidateCount, httpStatus) {
  return createHash("sha256")
    .update(`${eventType}|${candidateCount ?? "null"}|${httpStatus}`)
    .digest("hex");
}

function createIdempotencyKey(fingerprint, nowMs, cooldownMs) {
  const cooldownWindow = Math.floor(nowMs / cooldownMs);
  return `bep20-underpayment-${fingerprint.slice(0, 32)}-${cooldownWindow}`;
}

function validateConfiguration({
  baseUrl,
  secret,
  resendApiKey,
  emailFrom,
  recipient,
  stateFile,
}) {
  for (const value of [
    baseUrl,
    secret,
    resendApiKey,
    emailFrom,
    recipient,
    stateFile,
  ]) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("BEP20_ALERT_CONFIGURATION_MISSING");
    }
  }
}

async function readAlertState(stateFile) {
  let raw;
  try {
    raw = await readFile(stateFile, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("BEP20_ALERT_STATE_READ_FAILED");
  }

  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed
      || parsed.version !== 1
      || typeof parsed.fingerprint !== "string"
      || typeof parsed.last_sent_at !== "string"
      || !Number.isFinite(Date.parse(parsed.last_sent_at))
    ) {
      throw new Error("BEP20_ALERT_STATE_INVALID");
    }
    return parsed;
  } catch {
    throw new Error("BEP20_ALERT_STATE_INVALID");
  }
}

async function writeAlertState(stateFile, state) {
  const parent = dirname(stateFile);
  const temporaryFile = `${stateFile}.tmp`;
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await writeFile(temporaryFile, `${JSON.stringify(state)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(temporaryFile, 0o600);
  await rename(temporaryFile, stateFile);
  await chmod(stateFile, 0o600);
}

function buildEmail({ alertType, timestamp, monitorSummary }) {
  const isCandidateAlert = alertType === "candidate_detected";
  const title = isCandidateAlert
    ? "发现 BEP20 欠额候选"
    : "BEP20 欠额巡检故障";
  const candidateCount = Number.isInteger(monitorSummary.candidateCount)
    && monitorSummary.candidateCount >= 0
    ? monitorSummary.candidateCount
    : "不可用";
  const requestId = monitorSummary.maskedRequestId ?? "不可用";
  const duration = monitorSummary.durationMs ?? 0;

  return {
    subject: `[Jianlian] ${title}`,
    text: [
      `告警类型：${title}`,
      `时间：${timestamp}`,
      `candidate_count：${candidateCount}`,
      `http_status：${monitorSummary.httpStatus}`,
      `request_id：${requestId}`,
      `duration_ms：${duration}`,
      "请进入后台人工复核。",
      "未执行自动结算。",
    ].join("\n"),
  };
}

function createLogSummary({
  timestamp,
  success,
  monitorExit,
  alertType,
  alertSent,
  alertSuppressed,
  monitorSummary,
  resendHttpStatus,
}) {
  return {
    timestamp,
    success,
    monitor_exit: monitorExit,
    alert_type: alertType,
    alert_sent: alertSent,
    alert_suppressed: alertSuppressed,
    candidate_count: monitorSummary?.candidateCount ?? null,
    http_status: monitorSummary?.httpStatus ?? 0,
    masked_request_id: monitorSummary?.maskedRequestId ?? null,
    resend_http_status: resendHttpStatus,
  };
}

export async function runEmailAlert({
  baseUrl,
  secret,
  resendApiKey,
  emailFrom,
  recipient,
  stateFile = DEFAULT_STATE_FILE,
  cooldownMinutes,
  limit = 10,
  monitorTimeoutMs,
  resendTimeoutMs = RESEND_TIMEOUT_MS,
  monitorFetchImpl = fetch,
  resendFetchImpl = fetch,
  resendEndpoint = RESEND_EMAIL_ENDPOINT,
  now = () => Date.now(),
  write = (line) => process.stdout.write(`${line}\n`),
  runMonitorImpl = runMonitor,
} = {}) {
  const timestamp = new Date(now()).toISOString();
  let monitorExit = 1;
  let alertType = "configuration_failure";
  let monitorSummary = null;
  let resendHttpStatus = 0;

  const finish = ({
    exitCode,
    success,
    alertSent = false,
    alertSuppressed = false,
  }) => {
    write(JSON.stringify(createLogSummary({
      timestamp,
      success,
      monitorExit,
      alertType,
      alertSent,
      alertSuppressed,
      monitorSummary,
      resendHttpStatus,
    })));
    return { exitCode };
  };

  try {
    validateConfiguration({
      baseUrl,
      secret,
      resendApiKey,
      emailFrom,
      recipient,
      stateFile,
    });
    const parsedCooldownMinutes = parseCooldownMinutes(cooldownMinutes);
    const cooldownMs = parsedCooldownMinutes * 60_000;
    let monitorLine = "";
    const monitorResult = await runMonitorImpl({
      baseUrl,
      secret,
      limit,
      timeoutMs: monitorTimeoutMs,
      fetchImpl: monitorFetchImpl,
      write(line) {
        monitorLine = line;
      },
    });
    monitorExit = monitorResult?.exitCode;
    monitorSummary = parseMonitorSummary(monitorLine);

    if (
      ![0, 1, 2].includes(monitorExit)
      || !monitorSummary
      || (monitorExit === 0 && monitorSummary.candidateCount !== 0)
      || (monitorExit === 2 && !(monitorSummary.candidateCount > 0))
    ) {
      alertType = "monitor_contract_failure";
      return finish({ exitCode: 1, success: false });
    }

    if (monitorExit === 0) {
      alertType = "none";
      return finish({ exitCode: 0, success: true });
    }

    alertType = monitorExit === 2 ? "candidate_detected" : "monitor_failure";
    const fingerprint = createFingerprint(
      alertType,
      monitorSummary.candidateCount,
      monitorSummary.httpStatus,
    );
    const currentTime = now();
    const previousState = await readAlertState(stateFile);
    if (
      previousState?.fingerprint === fingerprint
      && currentTime - Date.parse(previousState.last_sent_at) < cooldownMs
    ) {
      return finish({
        exitCode: monitorExit === 2 ? 2 : 3,
        success: monitorExit !== 1,
        alertSuppressed: true,
      });
    }

    const email = buildEmail({ alertType, timestamp, monitorSummary });
    const response = await resendFetchImpl(resendEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        "content-type": "application/json",
        "idempotency-key": createIdempotencyKey(
          fingerprint,
          currentTime,
          cooldownMs,
        ),
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [recipient],
        subject: email.subject,
        text: email.text,
      }),
      signal: AbortSignal.timeout(resendTimeoutMs),
    });
    resendHttpStatus = response.status;
    if (!response.ok) {
      return finish({ exitCode: 1, success: false });
    }

    await writeAlertState(stateFile, {
      version: 1,
      fingerprint,
      last_sent_at: new Date(currentTime).toISOString(),
    });
    return finish({
      exitCode: monitorExit === 2 ? 2 : 3,
      success: monitorExit !== 1,
      alertSent: true,
    });
  } catch {
    return finish({ exitCode: 1, success: false });
  }
}

async function main() {
  const { limit } = parseMonitorArguments(process.argv.slice(2));
  const result = await runEmailAlert({
    baseUrl: process.env.JIANLIAN_INTERNAL_BASE_URL,
    secret: process.env.BEP20_UNDERPAYMENT_JOB_SECRET,
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM,
    recipient: process.env.BEP20_ALERT_RECIPIENT,
    stateFile: process.env.BEP20_ALERT_STATE_FILE || DEFAULT_STATE_FILE,
    cooldownMinutes: process.env.BEP20_ALERT_COOLDOWN_MINUTES,
    limit,
  });
  process.exitCode = result.exitCode;
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  await main();
}
