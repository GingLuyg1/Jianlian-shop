import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("risk workspace uses real read APIs, shared states, URL filters, and pagination", () => {
  const page = file("app/admin/risk/page.tsx");
  const route = file("app/api/admin/risk/route.ts");

  for (const component of ["AdminPageShell", "AdminEmptyState", "AdminErrorState", "AdminTableSkeleton"]) {
    assert.match(page, new RegExp(component));
  }
  for (const parameter of ["search", "level", "status", "businessType", "startAt", "endAt", "sort", "page", "pageSize"]) {
    assert.match(page, new RegExp(`params\\.set\\(\"${parameter}\"|${parameter}:`));
    assert.match(route, new RegExp(`searchParams\\.get\\(\"${parameter}\"`));
  }
  assert.match(page, /router\.replace/);
  assert.match(route, /\.from\("risk_events"\)/);
  assert.match(route, /\.range\(/);
  assert.match(route, /count: "exact"/);
  assert.match(route, /SORTS/);
});

test("risk APIs remain SuperAdmin-only, validate IDs, and summarize errors safely", () => {
  const helper = file("lib/risk/admin-risk.ts");
  const collection = file("app/api/admin/risk/route.ts");
  const detail = file("app/api/admin/risk/[id]/route.ts");

  assert.match(helper, /requireApiSuperAdmin/);
  assert.match(helper, /isValidRiskEventId/);
  assert.match(detail, /if \(!isValidRiskEventId\(context\.params\.id\)\)/);
  assert.match(detail, /status: 400/);
  assert.match(helper, /return fallback/);
  assert.doesNotMatch(helper, /return message\.trim\(\) \|\| fallback/);
  assert.match(collection, /if \(error\) throw error/);
});

test("risk V1 deliberately exposes no immature review writes or fake actions", () => {
  const list = file("app/admin/risk/page.tsx");
  const detail = file("app/admin/risk/[id]/page.tsx");

  assert.doesNotMatch(list, /method:\s*"(?:POST|PATCH|DELETE)"/);
  assert.doesNotMatch(detail, /method:\s*"(?:POST|PATCH|DELETE)"/);
  for (const action of ["submit(action", "const ACTIONS", "onClick={() => submit("]) {
    assert.doesNotMatch(detail, new RegExp(action.replace(/[()]/g, "\\$&")));
  }
  assert.match(detail, /当前为只读审核/);
  assert.match(detail, /不具备事务原子性、幂等和并发保护/);
});

test("risk detail shows safe evidence, timeline, audit, and real related navigation", () => {
  const detail = file("app/admin/risk/[id]/page.tsx");
  const route = file("app/api/admin/risk/[id]/route.ts");

  assert.match(detail, /\/api\/admin\/audit-logs\?targetId=/);
  assert.match(detail, /log\.target_id === id/);
  assert.match(detail, /状态时间线/);
  assert.match(detail, /安全元数据/);
  for (const destination of ["/admin/users?search=", "/admin/orders?search=", "/admin/payments?search=", "/admin/recharges?search=", "/admin/system/request-traces?requestId="]) {
    assert.match(detail, new RegExp(destination.replace(/[?]/g, "\\?")));
  }
  assert.match(route, /safeMetadata\(raw, depth \+ 1\)/);
  assert.match(route, /password\|token\|secret\|key\|authorization\|cookie\|content\|callback\|payload/i);
  for (const field of ["createdAt", "updatedAt", "resolvedAt"]) assert.match(route, new RegExp(field));
});
