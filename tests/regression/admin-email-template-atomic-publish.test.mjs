import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("email template publishing is one transactional RPC with database status guards", () => {
  const route = file("app/api/admin/notifications/email-templates/[templateId]/route.ts");
  const migration = file("supabase/migrations/20260901130000_email_template_atomic_publish.sql");
  const publishBlock = route.slice(route.indexOf('if (action === "publish")'), route.indexOf('if (action === "archive")'));

  assert.match(migration, /^-- DO NOT EXECUTE WITHOUT SEPARATE PRODUCTION AUTHORIZATION/m);
  assert.match(migration, /create or replace function public\.publish_email_template_atomic/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /for update/);
  assert.match(migration, /v_target\.status <> 'draft'/);
  assert.match(migration, /EMAIL_TEMPLATE_NOT_DRAFT/);
  assert.match(migration, /update public\.email_templates[\s\S]*set is_current = false[\s\S]*update public\.email_templates[\s\S]*status = 'published'[\s\S]*is_current = true/);
  assert.match(migration, /published_at = now\(\)/);
  assert.match(migration, /published_by = p_admin_id/);
  assert.match(migration, /updated_by = p_admin_id/);
  assert.match(migration, /public\.is_super_admin\(p_admin_id\)/);
  assert.match(migration, /grant execute on function public\.publish_email_template_atomic\(uuid, uuid\) to service_role/);

  assert.match(publishBlock, /before\.status !== "draft"/);
  assert.match(publishBlock, /before\.status === "archived"/);
  assert.match(publishBlock, /validateTemplateForPublish\(before\)/);
  assert.match(publishBlock, /\.rpc\("publish_email_template_atomic"/);
  assert.doesNotMatch(publishBlock, /\.from\("email_templates"\)[\s\S]*\.update\(/);
});

test("failed publish preserves the previous current and successful publish remains unique", () => {
  const route = file("app/api/admin/notifications/email-templates/[templateId]/route.ts");
  const migration = file("supabase/migrations/20260901130000_email_template_atomic_publish.sql");
  const baseline = file("supabase/migrations/20260701_email_notifications.sql");

  assert.match(route, /原 current 模板保持不变/);
  assert.match(migration, /returns setof public\.email_templates[\s\S]*language plpgsql/);
  assert.match(baseline, /create unique index if not exists email_templates_current_published_unique[\s\S]*where status = 'published' and is_current = true/);
  assert.match(migration, /where template_code = v_template_code[\s\S]*and is_current = true/);
  assert.match(migration, /where id = p_template_id[\s\S]*returning \* into v_target/);
});

test("publish and archive retain validation, state consistency, audit and queue lookup contracts", () => {
  const route = file("app/api/admin/notifications/email-templates/[templateId]/route.ts");
  const jobs = file("lib/email/jobs.ts");

  assert.match(route, /getServerSuperAdminContext\(\)/);
  assert.match(route, /validateSafeEmailHtml/);
  assert.match(route, /validateTemplateVariables/);
  assert.match(route, /before\.status === "archived"[\s\S]*不能重复归档/);
  assert.match(route, /before\.is_current[\s\S]*当前生效模板不能直接归档/);
  assert.match(route, /\.eq\("status", before\.status\)[\s\S]*\.eq\("is_current", false\)/);
  assert.match(route, /action: "email_template_publish"[\s\S]*result: "success"/);
  assert.match(route, /action: "email_template_archive"[\s\S]*result: "success"/);
  assert.match(jobs, /\.eq\("template_code", input\.templateCode\)[\s\S]*\.eq\("status", "published"\)[\s\S]*\.eq\("is_current", true\)/);
});
