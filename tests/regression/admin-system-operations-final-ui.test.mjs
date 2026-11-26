import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("compensation workspace exposes only real SuperAdmin status disposition", () => {
  const page = file("app/admin/system/compensations/page.tsx");
  const route = file("app/api/admin/system/compensations/route.ts");
  const service = file("lib/transactions/compensation.ts");

  for (const sharedComponent of ["AdminPageShell", "AdminErrorState", "AdminEmptyState", "AdminTableSkeleton"]) {
    assert.match(page, new RegExp(sharedComponent));
  }
  assert.match(page, /fetch\(`\/api\/admin\/system\/compensations\?\$\{params\.toString\(\)\}`/);
  assert.match(page, /method: "POST"/);
  assert.match(page, /window\.prompt\(/);
  assert.match(page, /window\.confirm\(/);
  assert.match(page, /不会执行支付、余额、库存或履约重试/);
  assert.doesNotMatch(page, />\s*(?:立即补偿|自动修复|重试)\s*</);

  assert.match(route, /requireApiSuperAdmin\(\)/);
  assert.match(route, /writeRequiredAdminAuditLog\(/);
  for (const action of ["mark_manual_review", "mark_resolved", "mark_cancelled"]) {
    assert.match(route, new RegExp(action));
  }
  assert.match(service, /\.from\("business_compensation_tasks"\)/);
  assert.match(service, /attempts,max_attempts,next_retry_at/);
  assert.match(service, /status: nextStatus/);
  assert.doesNotMatch(service, /runPayment|fulfill|deliver_order|reserve_order|release_order/);
});

test("database status workspace stays read-only and reports real probe sources", () => {
  const page = file("components/admin/system/DatabaseStatusClient.tsx");
  const route = file("app/api/admin/system/database/route.ts");

  for (const sharedComponent of ["AdminPageShell", "AdminErrorState", "AdminEmptyState", "AdminTableSkeleton"]) {
    assert.match(page, new RegExp(sharedComponent));
  }
  assert.match(page, /fetch\("\/api\/admin\/system\/database"/);
  assert.match(page, /method: "GET"/);
  assert.match(page, /“未登记”不代表 数据库结构升级 未执行/);
  assert.doesNotMatch(page, />\s*(?:执行 Migration|运行 SQL|Vacuum|Reindex)\s*</i);

  assert.match(route, /requireApi(?:Super)?Admin\(\)/);
  assert.match(route, /\.rpc\("app_check_database_structure"\)/);
  assert.match(route, /FALLBACK_TABLES/);
  assert.match(route, /action: "database_schema_check"/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.doesNotMatch(route, /export async function (?:POST|PATCH|PUT|DELETE)/);
  assert.doesNotMatch(route, /connection[_ -]?string|database[_ -]?password|service[_ -]?role[_ -]?key/i);
});

test("completed system workspaces expose direct routes under the system operations group", () => {
  const navigation = file("components/admin/admin-navigation.ts");
  const systemGroup = navigation.slice(navigation.indexOf('label: "系统运维"'), navigation.indexOf("export function isAdminNavigationGroup"));

  for (const [label, href] of [
    ["生产看板", "/admin/system"],
    ["异常中心", "/admin/system-errors"],
    ["风险审核", "/admin/risk"],
    ["数据一致性巡检", "/admin/system/consistency"],
    ["事务补偿", "/admin/system/compensations"],
    ["定时任务状态", "/admin/system/workers"],
    ["数据库状态", "/admin/system/database"],
    ["请求追踪", "/admin/system/request-traces"],
    ["操作日志", "/admin/audit-logs"],
  ]) {
    assert.match(systemGroup, new RegExp(`label: "${label}", href: "${href.replace(/\//g, "\\/")}"`));
  }
});
