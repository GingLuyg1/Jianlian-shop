import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("media, email and settings operations UI preserve security and API contracts", () => {
  const media = file("app/admin/media/page.tsx");
  const deliveries = file("app/admin/notifications/email-deliveries/page.tsx");
  const templatesPage = file("app/admin/notifications/email-templates/page.tsx");
  const templatesWorkspace = file("components/admin/email/AdminEmailTemplatesWorkspace.tsx");
  const settings = file("app/admin/settings/page.tsx");

  assert.match(media, /import AdminPageShell from "@\/components\/admin\/AdminPageShell"/);
  assert.match(media, /<AdminPageShell/);
  assert.match(media, /fetch\(`\/api\/admin\/media\?\$\{params\.toString\(\)\}`/);
  assert.match(media, /fetch\("\/api\/admin\/media", \{ method: "POST", body: form \}\)/);
  assert.match(media, /method: "PATCH"/);
  assert.match(media, /form\.set\("purpose", purpose\)/);
  assert.match(media, /form\.set\("ownerType", "unassigned"\)/);
  assert.match(media, /form\.append\("files", file\)/);
  assert.match(media, /JSON\.stringify\(\{ assetId: asset\.id, action: "archive" \}\)/);
  assert.match(media, /window\.confirm/);

  assert.match(deliveries, /getServerSuperAdminContext\(\)/);
  assert.match(deliveries, /getSupabaseServiceRoleClient\(\)/);
  assert.match(deliveries, /getEmailProviderStatus\(\)/);
  assert.match(deliveries, /EmailDeliveryActions/);
  assert.match(deliveries, /recipient_summary/);
  assert.doesNotMatch(deliveries, /recipient_email|email_body|html_body/);
  assert.match(deliveries, /<AdminPageShell/);

  assert.match(templatesPage, /getServerSuperAdminContext\(\)/);
  assert.match(templatesPage, /getSupabaseServiceRoleClient\(\)/);
  assert.match(templatesWorkspace, /fetch\(`\/api\/admin\/notifications\/email-templates\?\$\{params\.toString\(\)\}`/);
  assert.match(templatesWorkspace, /fetch\(`\/api\/admin\/notifications\/email-templates\/\$\{template\.id\}`/);
  assert.match(templatesWorkspace, /fetch\("\/api\/admin\/notifications\/email-templates", \{/);
  assert.match(templatesWorkspace, /method: "POST"/);
  assert.match(templatesWorkspace, /method: "PATCH"/);
  assert.match(templatesWorkspace, /action: "update"/);
  assert.match(templatesWorkspace, /changeStatus\("publish"\)/);
  assert.match(templatesWorkspace, /changeStatus\("archive"\)/);
  assert.match(templatesWorkspace, /JSON\.stringify\(\{ action, reason \}\)/);
  assert.match(templatesWorkspace, /window\.confirm/);
  assert.doesNotMatch(templatesWorkspace, /dangerouslySetInnerHTML/);

  assert.match(settings, /<AdminPageShell/);
  assert.match(settings, /fetch\("\/api\/admin\/settings"/);
  assert.match(settings, /method: "PATCH"/);
  assert.match(settings, /\bdirty\b/);
  assert.match(settings, /beforeunload/);
  for (const group of ["basic", "order", "contact", "maintenance", "announcement", "legal", "payments", "security"]) {
    assert.match(settings, new RegExp(`id: "${group}"`));
  }
  assert.match(settings, /PaymentSettingsPanel/);
  assert.match(settings, /RechargeRateSettings/);
  assert.match(settings, /Service Role Key/);
  assert.match(settings, /不展示、不编辑/);

  for (const source of [media, deliveries, templatesPage, templatesWorkspace, settings]) {
    assert.doesNotMatch(source, /(?:const|let)\s+(?:mock|fake)[A-Za-z0-9_]*/i);
    assert.doesNotMatch(source, /Math\.random\(\)/);
  }
});
