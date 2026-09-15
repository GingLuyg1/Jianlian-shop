import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(
  new URL("../../ops/systemd/jianlian-liuhaoyi-recovery.service", import.meta.url),
  "utf8",
);
const timer = readFileSync(
  new URL("../../ops/systemd/jianlian-liuhaoyi-recovery.timer", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../../scripts/ops/liuhaoyi-alipay-recharge-recovery.mjs", import.meta.url),
  "utf8",
);
const guide = readFileSync(
  new URL("../../docs/operations/liuhaoyi-alipay-recharge-recovery.md", import.meta.url),
  "utf8",
);

test("systemd service uses a root-only environment file and stable installed worker", () => {
  assert.match(service, /Type=oneshot/);
  assert.match(service, /EnvironmentFile=\/etc\/jianlian\/liuhaoyi-recovery\.env/);
  assert.match(service, /\/opt\/jianlian\/ops\/liuhaoyi-alipay-recharge-recovery\.mjs/);
  assert.match(service, /UMask=0077/);
  assert.doesNotMatch(service, /LIUHAOYI_MERCHANT_KEY=|PAYMENT_RECONCILIATION_SECRET=/);
});

test("timer is one-minute cadence but repository changes do not enable it", () => {
  assert.match(timer, /OnUnitActiveSec=1min/);
  assert.match(timer, /WantedBy=timers\.target/);
  assert.doesNotMatch(worker + service + timer, /systemctl\s+(?:enable|start)/);
  assert.match(guide, /不会复制 unit、执行 `daemon-reload`、启动 service 或启用 timer/);
});

test("worker calls only the narrow recovery route and emits aggregate output", () => {
  assert.match(worker, /liuhaoyi-alipay-recharge-recovery/);
  assert.match(worker, /x-payment-reconciliation-secret/);
  assert.doesNotMatch(worker, /LIUHAOYI_MERCHANT_KEY|LIUHAOYI_API_BASE_URL|completePayment|forceCredit|refund/i);
});
