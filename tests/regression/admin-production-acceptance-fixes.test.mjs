import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("dashboard uses tested payment schema adapters", () => {
  const dashboard = file("app/admin/page.tsx");
  assert.match(dashboard, /DASHBOARD_PAYMENT_CHANNELS_SELECT/);
  assert.match(dashboard, /DASHBOARD_PAYMENT_CALLBACKS_SELECT/);
  assert.match(dashboard, /DASHBOARD_PAYMENT_RECONCILIATIONS_SELECT/);
  assert.match(dashboard, /\.gte\("received_at", thirtyDaysAgo\.toISOString\(\)\)/);
  assert.match(dashboard, /normalizeDashboardPaymentChannel/);
  assert.match(dashboard, /normalizeDashboardPaymentCallback/);
  assert.match(dashboard, /normalizeDashboardPaymentReconciliation/);
});

test("payment exception count and today's amounts have distinct labels and units", () => {
  const route = file("app/api/admin/payment-stats/route.ts");
  const board = file("components/admin/system/ProductionReadinessClient.tsx");
  const stats = file("components/admin/payments/AdminPaymentStatsStrip.tsx");
  assert.match(route, /exceptionRecordCount/);
  assert.match(route, /pendingExceptionCount: exceptionRecordCount/);
  assert.match(board, /label="异常记录"/);
  assert.match(board, /exceptionRecordCount}\s*条/);
  assert.match(board, /label="今日支付金额"/);
  assert.match(board, /label="今日充值到账"/);
  assert.doesNotMatch(board, /detail=\{payments \? `支付 \$\{payments\.todayPaymentAmount\} \/ 充值/);
  assert.match(stats, /title: "异常记录"/);
});

test("release info uses strict release-directory and build artifact fallbacks", () => {
  const releaseInfo = file("lib/system/release-info.ts");
  const metadata = file("lib/system/release-metadata.mjs");
  assert.match(releaseInfo, /process\.env\.JIANLIAN_RELEASE_DIR/);
  assert.match(releaseInfo, /process\.cwd\(\)/);
  assert.match(releaseInfo, /inferReleaseCommit/);
  assert.match(releaseInfo, /getReleaseBuildArtifactTime/);
  assert.match(metadata, /jianlian-shop-\(\[0-9a-f\]\{40\}\)/i);
  assert.match(metadata, /\.next", "BUILD_ID"/);
  assert.doesNotMatch(metadata, /child_process|execSync|spawnSync|git\s+(?:rev-parse|log)/);
});

test("production board distinguishes incident workflow state and unauthenticated audits", () => {
  const board = file("components/admin/system/ProductionReadinessClient.tsx");
  const audits = file("app/admin/audit-logs/page.tsx");
  assert.match(board, /异常事件（人工处理状态）/);
  assert.match(board, /未关闭表示事件尚未人工关闭，不代表当前探测仍失败/);
  assert.match(board, /最后出现：/);
  assert.match(board, /formatIncidentStatus\(event\.status\)/);
  assert.match(board, /formatAdminAuditActor\(log\)/);
  assert.doesNotMatch(board, /未知管理员/);
  assert.match(audits, /formatAdminAuditActor\(log\)/);
  assert.match(audits, /formatAdminAuditActor\(selectedLog\)/);
});
