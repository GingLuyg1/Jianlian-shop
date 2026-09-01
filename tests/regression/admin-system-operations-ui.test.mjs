import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("system operations workspaces use real admin contracts and shared UI states", () => {
  const dashboard = file("components/admin/system/ProductionReadinessClient.tsx");
  const errorsPage = file("app/admin/system-errors/page.tsx");
  const errorsApi = file("app/api/admin/system-errors/route.ts");
  const traceSearch = file("app/admin/system/request-traces/page.tsx");
  const traceDetail = file("app/admin/system/request-traces/[requestId]/page.tsx");
  const traceApi = file("app/api/admin/system/request-traces/[requestId]/route.ts");
  const auditPage = file("app/admin/audit-logs/page.tsx");
  const auditApi = file("app/api/admin/audit-logs/route.ts");
  const navigation = file("components/admin/admin-navigation.ts");

  for (const source of [dashboard, errorsPage, traceSearch, traceDetail, auditPage]) {
    assert.match(source, /AdminPageShell/);
  }
  for (const source of [dashboard, errorsPage, traceDetail, auditPage]) {
    assert.match(source, /AdminErrorState/);
    assert.match(source, /AdminEmptyState/);
    assert.match(source, /AdminTableSkeleton/);
  }

  for (const endpoint of [
    "/api/admin/system/status",
    "/api/admin/payment-stats",
    "/api/admin/orders?page=1&pageSize=1",
    "/api/admin/system-errors?page=1&pageSize=6",
    "/api/admin/audit-logs?page=1&pageSize=10",
  ]) assert.match(dashboard, new RegExp(endpoint.replace(/[?]/g, "\\?")));

  assert.match(errorsPage, /fetch\(`\/api\/admin\/system-errors\?\$\{query\}`/);
  assert.match(errorsPage, /method: "PATCH"/);
  for (const parameter of ["level", "category", "status", "requestId", "orderId", "startAt", "endAt"]) {
    assert.match(errorsPage, new RegExp(`params\\.set\\("${parameter}"`));
  }
  assert.match(errorsApi, /requireApiAdmin\(\)/);
  assert.doesNotMatch(errorsApi, /select\("\*"/);
  for (const forbiddenAction of ["重试", "修复", "补偿"]) assert.doesNotMatch(errorsPage, new RegExp(`>${forbiddenAction}<`));

  assert.match(traceSearch, /REQUEST_ID_PATTERN/);
  assert.match(traceDetail, /fetch\(`\/api\/admin\/system\/request-traces\/\$\{encodeURIComponent\(requestId\)\}`/);
  assert.match(traceApi, /requireApiAdmin\(\)/);
  assert.match(traceApi, /loadRequestTrace/);
  assert.doesNotMatch(traceDetail, /token|cookie|authorization|api[_ -]?key/i);

  assert.match(auditApi, /getServerSuperAdminContext\(\)/);
  assert.match(auditApi, /sanitizeAuditValue/);
  assert.match(auditApi, /sanitizeMessage/);
  assert.doesNotMatch(auditApi, /\.update\(|\.delete\(|\.insert\(/);
  for (const parameter of ["adminEmail", "module", "action", "result", "targetId", "requestId", "startAt", "endAt"]) {
    assert.match(auditPage, new RegExp(`params\\.set\\("${parameter}"`));
  }

  assert.match(navigation, /label: "系统运营"/);
  assert.match(navigation, /label: "生产看板", href: "\/admin\/system\/production-readiness"/);
  assert.match(navigation, /label: "异常中心", href: "\/admin\/system-errors"/);
  assert.match(navigation, /label: "请求追踪", href: "\/admin\/system\/request-traces"/);
  assert.match(navigation, /label: "操作日志", href: "\/admin\/audit-logs"/);

  for (const source of [dashboard, errorsPage, traceSearch, traceDetail, auditPage]) {
    assert.doesNotMatch(source, /(?:const|let)\s+(?:mock|fake)[A-Za-z0-9_]*/i);
    assert.doesNotMatch(source, /Math\.random\(\)/);
  }
});
