import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const artifact = "dist/internal/snpay-production-canary.mjs";
const source = await readFile("scripts/internal/snpay-production-canary.ts", "utf8");
const creation = await readFile("lib/payments/recharge-creation-service.ts", "utf8");
const route = await readFile("app/api/payments/create/route.ts", "utf8");

test("public route is hard-coded to public mode", () => {
  assert.match(route, /mode:\s*["']public["']/);
  assert.doesNotMatch(route, /internal_canary/);
});

test("canary source has fixed amount and no direct provider call", () => {
  assert.match(source, /const FIXED_AMOUNT = 1/);
  assert.doesNotMatch(source, /createSnpayClient|\.createPayment\(/);
});

test("prepare reuses shared recharge service and has no provider/session call", () => {
  assert.match(source, /prepareCanaryRecharge/);
  assert.match(creation, /export async function prepareCanaryRecharge/);
  assert.doesNotMatch(creation, /createPaymentSession|createSnpayClient/);
});

test("execution gate and invalid channel reject before any write", () => {
  const denied = spawnSync(process.execPath, [artifact, "alipay", "--dry-run"], { encoding: "utf8" });
  assert.notEqual(denied.status, 0);
  assert.match(`${denied.stdout}${denied.stderr}`, /CANARY_EXECUTION_NOT_AUTHORIZED/);
  const invalid = spawnSync(process.execPath, [artifact, "paypal", "--dry-run"], {
    env: { ...process.env, SNPAY_CANARY_EXECUTION: "YES" }, encoding: "utf8",
  });
  assert.notEqual(invalid.status, 0);
  assert.match(`${invalid.stdout}${invalid.stderr}`, /CANARY_CHANNEL_INVALID/);
});
