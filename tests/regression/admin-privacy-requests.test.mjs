import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("privacy list is SuperAdmin-only with validated database pagination and filters", () => {
  const route = file("app/api/admin/privacy-requests/route.ts");
  const listRoute = route.split("export async function PATCH")[0];
  assert.match(listRoute, /requireApiSuperAdmin/);
  assert.match(listRoute, /\.from\("privacy_requests"\)/);
  assert.match(listRoute, /\{ count: "exact" \}/);
  assert.match(listRoute, /query\.range\(from, to\)/);
  assert.match(listRoute, /Math\.min\(100,/);
  assert.match(listRoute, /PRIVACY_STATUSES\.has/);
  assert.match(listRoute, /PRIVACY_TYPES\.has/);
  assert.match(listRoute, /PRIVACY_SORTS\.has/);
  assert.match(listRoute, /\.eq\("status", status\)/);
  assert.match(listRoute, /\.eq\("request_type", type\)/);
  assert.match(listRoute, /\.gte\("created_at", startAt\)/);
  assert.match(listRoute, /\.lte\("created_at", endAt\)/);
  assert.match(listRoute, /request_no\.ilike/);
  for (const parameter of ["search", "status", "type", "startAt", "endAt", "sort", "page", "pageSize"]) {
    assert.ok(listRoute.includes('searchParams.get("' + parameter + '")'));
  }
  assert.doesNotMatch(listRoute, /\.limit\((?:5000|10000)\)/);
  assert.doesNotMatch(listRoute, /\.filter\(|\.slice\(/);
});

test("privacy list UI uses shareable URL state and exposes only read navigation", () => {
  const page = file("app/admin/privacy-requests/page.tsx");
  for (const component of ["AdminPageShell", "AdminEmptyState", "AdminErrorState", "AdminTableSkeleton"]) {
    assert.match(page, new RegExp(component));
  }
  assert.match(page, /useSearchParams/);
  assert.match(page, /router\.replace/);
  assert.match(page, /setPage\(positivePage\(params\.get\("page"\)\)\)/);
  for (const parameter of ["search", "status", "type", "startAt", "endAt"]) {
    assert.ok(page.includes('next.set("' + parameter + '",'));
  }
  assert.match(page, /pageSize: String\(PAGE_SIZE\)/);
  assert.match(page, /\/admin\/privacy-requests\//);
  assert.doesNotMatch(page, /method:\s*"(?:POST|PATCH|DELETE)"|submitAction|complete_anonymize|window\.confirm/);
  assert.doesNotMatch(page, />批准<|>拒绝<|>取消<|>完成匿名化<|>生成导出<|>下载导出</);
});

test("privacy detail validates UUID and strictly scopes bounded timeline and audit reads", () => {
  const route = file("app/api/admin/privacy-requests/[requestId]/route.ts");
  assert.match(route, /requireApiSuperAdmin/);
  assert.match(route, /if \(!isUuid\(requestId\)\)/);
  assert.match(route, /status: 400/);
  assert.match(route, /\.eq\("id", requestId\)/);
  assert.match(route, /\.from\("privacy_request_events"\)/);
  assert.match(route, /\.eq\("request_id", requestId\)/);
  assert.match(route, /\.from\("admin_audit_logs"\)/);
  assert.match(route, /\.eq\("target_id", requestId\)/);
  assert.match(route, /\.eq\("target_type", "privacy_request"\)/);
  assert.match(route, /\.eq\("module", "privacy"\)/);
  assert.match(route, /\.limit\(50\)/);
  assert.doesNotMatch(route, /before_summary|after_summary|metadata|error_message/);
});

test("privacy detail minimizes PII and has no delete, export, or state-changing UI", () => {
  const page = file("app/admin/privacy-requests/[requestId]/page.tsx");
  const route = file("app/api/admin/privacy-requests/[requestId]/route.ts");
  assert.match(page, /\/admin\/users\//);
  assert.match(page, /最近处理时间线/);
  assert.match(page, /最近后台审计/);
  assert.match(page, /订单、支付、充值、退款与资金流水按既有保留规则处理/);
  assert.doesNotMatch(page, /method:\s*"(?:POST|PATCH|DELETE)"|submitAction|complete_anonymize|window\.confirm/);
  for (const sensitive of ["password_hash", "access_token", "refresh_token", "raw_session", "mfa_secret", "authorization", "cookie", "service_role"]) {
    assert.doesNotMatch(route + page, new RegExp(sensitive, "i"));
  }
});

test("privacy detail adopts scoped Admin V2 foundations without changing its read contract", () => {
  const page = file("app/admin/privacy-requests/[requestId]/page.tsx");
  const layout = file("components/admin/AdminLayout.tsx");
  const tokens = file("components/admin/v2/AdminV2.module.css");
  const statusBadge = file("components/admin/v2/AdminStatusBadge.tsx");
  const readOnlyBadge = file("components/admin/v2/AdminReadOnlyBadge.tsx");
  const section = file("components/admin/v2/AdminSection.tsx");
  const infoGrid = file("components/admin/v2/AdminInfoGrid.tsx");

  for (const component of ["AdminStatusBadge", "AdminReadOnlyBadge", "AdminSection", "AdminInfoGrid", "AdminInfoItem"]) {
    assert.match(page, new RegExp(component));
  }
  assert.match(layout, /v2Styles\.scope/);
  for (const token of ["#f8fafc", "#ffffff", "#e2e8f0", "#0f172a", "#1d4ed8", "#eff6ff"]) {
    assert.ok(tokens.includes(token));
  }
  for (const tone of ["success", "warning", "danger", "info", "neutral"]) {
    assert.match(statusBadge, new RegExp(tone));
  }
  assert.match(statusBadge, /children: ReactNode/);
  assert.match(readOnlyBadge, /<span/);
  assert.doesNotMatch(readOnlyBadge, /<button|onClick|hover:/);
  assert.match(section, /shadow-none/);
  assert.match(infoGrid, /grid-cols-1/);
  assert.match(infoGrid, /sm:grid-cols-2/);
  assert.match(infoGrid, /\[overflow-wrap:anywhere\]/);
  assert.doesNotMatch(infoGrid, /shadow|break-all/);
  assert.match(page, /xl:grid-cols-\[minmax\(0,1fr\)_320px\]/);
  assert.match(page, /最近 50 条以内/);
  assert.match(page, /fetch\("\/api\/admin\/privacy-requests\/" \+ requestId, \{ cache: "no-store" \}\)/);
  assert.doesNotMatch(page + layout + statusBadge + readOnlyBadge + section + infoGrid, /design\/admin-ui-v2|DESIGN PREVIEW|Mock Data|Not Production/);
});

test("privacy detail keeps separate 50-row event and strict audit limits", () => {
  const route = file("app/api/admin/privacy-requests/[requestId]/route.ts");
  assert.equal(route.match(/\.limit\(50\)/g)?.length, 2);
  assert.match(route, /\.from\("privacy_request_events"\)[\s\S]*?\.eq\("request_id", requestId\)[\s\S]*?\.limit\(50\)/);
  assert.match(route, /\.from\("admin_audit_logs"\)[\s\S]*?\.eq\("target_id", requestId\)[\s\S]*?\.eq\("target_type", "privacy_request"\)[\s\S]*?\.eq\("module", "privacy"\)[\s\S]*?\.limit\(50\)/);
});

test("retained privacy write API validates UUID and summarizes unknown failures", () => {
  const route = file("app/api/admin/privacy-requests/route.ts");
  assert.match(route, /if \(!isUuid\(requestId\)\)/);
  assert.match(route, /return "隐私请求处理失败，请稍后重试。"/);
  assert.match(route, /super_admin_anonymize_user_account/);
});
