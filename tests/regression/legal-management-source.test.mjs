import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const file = (path) => readFileSync(resolve(root, path), "utf8");

test("admin legal route keeps create as insert and maps classified status", () => {
  const route = file("app/api/admin/legal/route.ts");

  assert.match(route, /action === "create_draft"[\s\S]*?\.insert\(row\)\.select\("\*"\)\.single\(\)/);
  assert.doesNotMatch(route, /action === "create_draft"[\s\S]*?\.upsert\(/);
  assert.match(route, /return json\(\{ document: data \}\)/);
  assert.match(route, /return json\(\{ error: classified\.message \}, classified\.status\)/);
  assert.doesNotMatch(route, /legal_documents\|schema cache\|Could not find/);
});

test("draft updates are state-guarded and never change the record id", () => {
  const route = file("app/api/admin/legal/route.ts");
  const updateBlock = route.match(/if \(action === "update_draft"\) \{([\s\S]*?)\n    \}/)?.[1] ?? "";

  assert.match(updateBlock, /before\.status !== "draft"/);
  assert.match(updateBlock, /\.eq\("id", id\)\.eq\("status", "draft"\)/);
  assert.doesNotMatch(updateBlock, /update\([^)]*\bid\b/);
});

test("publish stops when archiving the previous published version fails", () => {
  const route = file("app/api/admin/legal/route.ts");
  const archiveResult = route.indexOf("archivePreviousError");
  const archiveGuard = route.indexOf("if (archivePreviousError) throw archivePreviousError");
  const publishTarget = route.indexOf('status: "published", published_at');

  assert.ok(archiveResult > 0);
  assert.ok(archiveGuard > archiveResult);
  assert.ok(publishTarget > archiveGuard);
  assert.match(route, /doc\.status !== "draft"/);
  assert.match(route, /fully atomic publish requires a separately reviewed transaction RPC/);
});

test("archive re-reads and rejects records that are not published", () => {
  const route = file("app/api/admin/legal/route.ts");
  const archiveBlock = route.match(/if \(action === "archive"\) \{([\s\S]*?)\n    \}/)?.[1] ?? "";

  assert.match(archiveBlock, /\.select\("\*"\)\.eq\("id", id\)\.maybeSingle\(\)/);
  assert.match(archiveBlock, /doc\.status !== "published"/);
  assert.match(archiveBlock, /\.eq\("id", id\)\.eq\("status", "published"\)/);
});

test("failure log contains only safe protocol error metadata", () => {
  const route = file("app/api/admin/legal/route.ts");
  const failureAudit = route.match(/function logLegalFailure[\s\S]*?return classified;\r?\n\}/)?.[0] ?? "";

  assert.match(failureAudit, /database_error_code: classified\.code/);
  assert.match(failureAudit, /constraint_summary/);
  assert.match(failureAudit, /document_id_summary/);
  assert.match(failureAudit, /document_type/);
  assert.match(failureAudit, /version/);
  assert.doesNotMatch(failureAudit, /errorMessage|body\?\.content|admin\.user|email|request:|beforeSummary|afterSummary/);
});

test("legal page has a synchronous submission lock and disabled controls", () => {
  const page = file("app/admin/settings/legal/page.tsx");

  assert.match(page, /const submittingRef = useRef\(false\)/);
  assert.match(page, /if \(submittingRef\.current\) return;/);
  assert.match(page, /submittingRef\.current = true/);
  assert.match(page, /finally \{[\s\S]*?submittingRef\.current = false/);
  assert.match(page, /disabled=\{saving\}/);
});

test("duplicate drafts are refreshed, located, and selected without upsert", () => {
  const page = file("app/admin/settings/legal/page.tsx");

  assert.match(page, /response\.status === 409 && options\.duplicateDraft/);
  assert.match(page, /fetchDocuments\(\{ status: "draft", documentType: targetType \}\)/);
  assert.match(page, /document\.document_type === targetType && document\.version === targetVersion/);
  assert.match(page, /if \(existing\) setSelected\(existing\)/);
});

test("draft edit mode loads fields, updates by id, and can be cancelled", () => {
  const page = file("app/admin/settings/legal/page.tsx");

  assert.match(page, /if \(document\.status !== "draft" \|\| saving\) return/);
  assert.match(page, /setEditingDraftId\(document\.id\)/);
  assert.match(page, /documentType: document\.document_type[\s\S]*?version: document\.version[\s\S]*?content: document\.content/);
  assert.match(page, /action: "update_draft", id: editingDraftId/);
  assert.match(page, /function cancelEditing\(\)[\s\S]*?setEditingDraftId\(null\)[\s\S]*?setForm\(EMPTY_FORM\)/);
  assert.match(page, /setEditingDraftId\(null\)[\s\S]*?setForm\(EMPTY_FORM\)[\s\S]*?setSelected\(payload\.document/);
});
