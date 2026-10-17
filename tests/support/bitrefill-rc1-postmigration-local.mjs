// Exercises the future read-only metadata plan ONLY in DB5's owned disposable DB.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export async function verifyRc1PostmigrationPlan({ sql, root, db9Defaults }) {
  assert.equal(db9Defaults, true, "RC1_REQUIRES_DB9_DEFAULT_ACL_OWNER_MODEL");
  const query = readFileSync(resolve(root,
    "docs/integrations/sql/bitrefill-rc1-postmigration-readonly.sql"), "utf8").trim().replace(/;$/, "");
  // Synthetic migration history for this disposable DB only. This is not an
  // assertion about Production installation, nor does version prove file SHA.
  assert.equal(await sql("select count(*) from supabase_migrations.schema_migrations where version='20261015063415'"), "0");
  await sql("insert into supabase_migrations.schema_migrations(version) values('20261015063415')");
  const capture = `select coalesce(json_agg(e),'[]'::json)::text from (${query}) e`;
  const baseline = async () => {
    const evidence = JSON.parse(await sql(`begin read only; ${capture}; rollback;`));
    assert.equal(evidence.length, 64);
    assert.deepEqual(evidence.filter((r) => r.pass !== true), [], "RC1_METADATA_PLAN_FAILURE");
    assert.equal(evidence.find((r) => r.section === "migration_history").detail.source_sha_proven_by_version, false);
    return evidence;
  };
  await baseline();
  const claim = "public.internal_supplier_purchase_claim(text,text,text,jsonb)";
  for (const [section, name, change] of [
    ["table_acl", "supplier_webhook_receipts:service_role",
      "grant insert on public.supplier_webhook_receipts to service_role"],
    ["table_acl", "supplier_webhook_receipts:anon",
      "grant select on public.supplier_webhook_receipts to anon"],
    ["function", claim, `grant execute on function ${claim} to public`],
    ["function", claim, `alter function ${claim} set search_path=public`],
    ["function", claim, `revoke execute on function ${claim} from service_role`],
    ["function", claim, `alter function ${claim} rename to rc1_missing_claim_probe`],
    ["table", "supplier_webhook_receipts",
      "alter table public.supplier_webhook_receipts rename to rc1_missing_table_probe"],
    ["index", "supplier_purchase_attempts_reconcile_idx",
      "drop index public.supplier_purchase_attempts_reconcile_idx"],
    ["trigger", "supplier_purchase_attempt_update_guard",
      "alter table public.supplier_purchase_attempts disable trigger supplier_purchase_attempt_update_guard"],
    ["migration_history", "20261015063415",
      "delete from supabase_migrations.schema_migrations where version='20261015063415'"],
  ]) {
    const evidence = JSON.parse(await sql(`begin; ${change}; ${capture}; rollback;`));
    assert.equal(evidence.find((r) => r.section === section && r.name === name)?.pass, false,
      `RC1_POSTMIGRATION_PLAN_MISSED_${section}:${name}`);
    await baseline();
  }
  console.log("RC1_POSTMIGRATION_SELECT_ONLY_PLAN_64_CHECKS_TEN_NEGATIVE_ROLLBACKS_PASS");
}
