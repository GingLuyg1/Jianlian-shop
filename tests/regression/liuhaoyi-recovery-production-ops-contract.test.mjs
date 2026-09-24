import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(new URL("../../ops/systemd/jianlian-liuhaoyi-recovery.service", import.meta.url), "utf8");
const dryRunService = readFileSync(new URL("../../ops/systemd/jianlian-liuhaoyi-alipay-recovery-dry-run.service", import.meta.url), "utf8");
const timer = readFileSync(new URL("../../ops/systemd/jianlian-liuhaoyi-recovery.timer", import.meta.url), "utf8");
const watcher = readFileSync(new URL("../../scripts/ops/liuhaoyi-alipay-recharge-watcher.mjs", import.meta.url), "utf8");
const guide = readFileSync(new URL("../../docs/operations/liuhaoyi-alipay-recharge-recovery.md", import.meta.url), "utf8");

test("systemd service uses root-only env, bounded execution and a separate flock", () => {
  assert.match(service, /Type=oneshot/);
  assert.match(service, /User=root/);
  assert.match(service, /TimeoutStartSec=45s/);
  assert.match(service, /EnvironmentFile=\/etc\/jianlian\/liuhaoyi-alipay-recovery\.env/);
  assert.match(service, /liuhaoyi-alipay-recharge-watcher\.mjs" --watcher-lock-held --execute/);
  assert.match(service, /flock -n -E 0 \/run\/lock\/jianlian-liuhaoyi-alipay-recovery\.lock/);
  assert.match(service, /ReadWritePaths=\/run\/lock/);
  assert.doesNotMatch(service, /LIUHAOYI_MERCHANT_KEY=|PAYMENT_RECONCILIATION_SECRET=/);
});

test("dry-run service shares the production boundaries without enabling execution", () => {
  assert.match(dryRunService, /Type=oneshot/);
  assert.match(dryRunService, /User=root/);
  assert.match(dryRunService, /Group=root/);
  assert.match(dryRunService, /TimeoutStartSec=45s/);
  assert.match(dryRunService, /EnvironmentFile=\/etc\/jianlian\/liuhaoyi-alipay-recovery\.env/);
  assert.match(dryRunService, /flock -n -E 0 \/run\/lock\/jianlian-liuhaoyi-alipay-recovery\.lock/);
  assert.match(dryRunService, /exec \/usr\/bin\/node "\$\$JIANLIAN_RELEASE_DIR\/scripts\/ops\/liuhaoyi-alipay-recharge-watcher\.mjs" --watcher-lock-held/);
  assert.match(dryRunService, /JIANLIAN_RELEASE_DIR\/scripts\/ops\/liuhaoyi-alipay-recharge-watcher\.mjs/);
  assert.match(dryRunService, /--watcher-lock-held/);
  assert.match(dryRunService, /^ProtectHome=true$/m);
  assert.match(dryRunService, /ReadWritePaths=\/run\/lock/);
  assert.doesNotMatch(dryRunService, /JIANLIAN_NODE_BINARY|\/root\//);
  assert.doesNotMatch(dryRunService, /--execute/);
  assert.doesNotMatch(dryRunService, /^\[Install\]$/m);
  assert.doesNotMatch(dryRunService, /LIUHAOYI_MERCHANT_KEY=|PAYMENT_RECONCILIATION_SECRET=/);
  assert.doesNotMatch(dryRunService, /systemctl\s+(?:enable|start)/);
  assert.match(service, /--watcher-lock-held --execute/);
});

test("timer is one-minute cadence but repository changes do not enable it", () => {
  assert.match(timer, /OnUnitActiveSec=1min/);
  assert.match(timer, /Persistent=false/);
  assert.doesNotMatch(timer, /Persistent=true/);
  assert.match(timer, /WantedBy=timers\.target/);
  assert.doesNotMatch(watcher + service + dryRunService + timer, /systemctl\s+(?:enable|start)/);
  assert.match(guide, /does not install or start the timer/);
});

test("watcher takes the same lock for manual runs and stays isolated from payment logic", () => {
  assert.match(watcher, /liuhaoyi-alipay-watcher/);
  assert.match(watcher, /spawnSync\("\/usr\/bin\/flock"/);
  assert.match(watcher, /--watcher-lock-held/);
  assert.doesNotMatch(watcher, /LIUHAOYI_MERCHANT_KEY|LIUHAOYI_API_BASE_URL|completePayment|forceCredit|refund/i);
});
