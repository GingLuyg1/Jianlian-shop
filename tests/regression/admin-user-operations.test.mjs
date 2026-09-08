import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) { return readFileSync(join(process.cwd(), path), "utf8"); }

test("user list is SuperAdmin-only and uses database filters, exact count, and bounded pagination", () => {
  const route = file("app/api/admin/users/route.ts");
  assert.match(route, /requireApiSuperAdmin/);
  assert.match(route, /\.from\("profiles"\)\.select\(select, \{ count: "exact" \}\)/);
  assert.match(route, /\.range\(from, from \+ input\.pageSize - 1\)/);
  assert.match(route, /Math\.min\(100,/);
  assert.doesNotMatch(route, /\.limit\(5000\)/);
  for (const filter of ["search", "status", "role", "risk", "registeredFrom", "registeredTo", "sort", "page", "pageSize"]) {
    assert.match(route, new RegExp(`searchParams\\.get\\(\"${filter}\"`));
  }
  assert.match(route, /ACCOUNT_STATUSES\.has/);
  assert.match(route, /RISK_STATUSES\.has/);
  assert.match(route, /ROLES\.has/);
  assert.match(route, /SORTS\.has/);
  for (const historySource of ["orders", "account_recharges", "balance_transactions"]) {
    assert.doesNotMatch(route, new RegExp(`\\.from\\("${historySource}"\\)`));
  }
  assert.doesNotMatch(route, /loadOrdersByUsers|loadRechargesByUsers|loadBalanceTransactionsByUsers|applyStats/);
});

test("user UI keeps shareable URL state and exposes no unsafe write actions", () => {
  const page = file("app/admin/users/page.tsx");
  for (const component of ["AdminPageShell", "AdminEmptyState", "AdminErrorState", "AdminTableSkeleton"]) assert.match(page, new RegExp(component));
  assert.match(page, /useSearchParams/);
  assert.match(page, /router\.replace/);
  assert.match(page, /setSearch\(initial\.get\("search"\)/);
  assert.match(page, /normalizeFilter\(initial\.get\("status"\)/);
  for (const filter of ["search", "status", "role", "risk", "registeredFrom", "registeredTo"]) assert.match(page, new RegExp(`params\\.set\\(\"${filter}\"`));
  assert.match(page, /sort \}\)/);
  assert.match(page, /href=\{`\/admin\/users\/\$\{user\.id\}`\}/);
  assert.doesNotMatch(page, /\/actions|submitAction|adjust_balance|update_account_status|update_risk_status|method:\s*"POST"/);
});

test("user detail validates UUID, limits rows, and strictly filters safe audit fields", () => {
  const route = file("app/api/admin/users/[userId]/route.ts");
  assert.match(route, /requireApiSuperAdmin/);
  assert.match(route, /if \(!isUuid\(userId\)\)/);
  assert.match(route, /status: 400/);
  assert.match(route, /\.eq\("target_id", userId\)/);
  assert.match(route, /\.eq\("target_type", "user"\)/);
  assert.match(route, /\.limit\(50\)/);
  assert.match(route, /\.limit\(30\)/);
  assert.doesNotMatch(route, /before_summary,after_summary,metadata/);
  for (const sensitive of ["password_hash", "refresh_token", "access_token", "raw_session", "mfa_secret", "authorization", "cookie"]) assert.doesNotMatch(route, new RegExp(sensitive, "i"));
});

test("existing user write API validates target IDs and does not return unknown database errors", () => {
  const actions = file("app/api/admin/users/[userId]/actions/route.ts");
  assert.match(actions, /if \(!isUuid\(userId\)\)/);
  assert.match(actions, /return "操作失败，请稍后重试。"/);
  assert.doesNotMatch(actions, /return message;\s*\n}/);
});

test("user detail provides real related navigation, risks, and audit without fake controls", () => {
  const page = file("app/admin/users/[userId]/page.tsx");
  const route = file("app/api/admin/users/[userId]/route.ts");
  assert.match(route, /\.from\(table\)/);
  assert.match(route, /"risk_events"/);
  for (const destination of ["/admin/orders?search=", "/admin/payments?search=", "/admin/recharges?search=", "/admin/risk?search=", "/admin/audit-logs?targetId="]) assert.match(page, new RegExp(destination.replace(/[?]/g, "\\?")));
  assert.match(page, /余额流水/);
  assert.match(page, /账户状态/);
  assert.match(page, /风险事件/);
  assert.match(page, /后台审计历史/);
  assert.match(page, /最近风险事件/);
  assert.doesNotMatch(page, /summary\.(?:orderCount|rechargeCount)|riskEvents\.length/);
  assert.doesNotMatch(route, /orderCount:\s*orders\.length|rechargeCount:\s*recharges\.length/);
  assert.doesNotMatch(page, /累计充值|累计消费|订单数量|关联订单[^\n]*count=|关联充值[^\n]*count=/);
  assert.doesNotMatch(page, /method:\s*"(?:POST|PATCH|DELETE)"|submitAction|window\.confirm/);
});
