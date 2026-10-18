// One ordered, local-only schema assembly path. The SQL files retain their
// own disposable-cluster guards; callers must also verify cluster identity.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const fixturePaths = Object.freeze({
  baseline: resolve(root, "tests/fixtures/current-schema/supplier-v13-current-baseline.sql"),
  support: resolve(root, "tests/fixtures/current-schema/supplier-v13-db5-delivery-support.sql"),
  core: resolve(root, "supabase/migrations/20260826190000_supplier_fulfillment_core_v1.sql"),
  migration: resolve(root, "supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql"),
});
export const expectedMigrationSha256 = "90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0";
const outcomeSignature = "(uuid,uuid,text,text,uuid,text,boolean,text,text,text,numeric,numeric,text)";

export function migrationSha256() {
  // Git may check out SQL as CRLF on Windows. The frozen candidate hash is
  // defined over repository LF bytes; normalize only line endings, never SQL.
  const source = readFileSync(fixturePaths.migration, "utf8").replaceAll("\r\n", "\n");
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function repoOutcomeDefinition() {
  const core = readFileSync(fixturePaths.core, "utf8");
  const matched = core.match(/create or replace function public\.record_supplier_fulfillment_outcome\([\s\S]*?\$function\$;/i)?.[0];
  assert.ok(matched, "V13_REPO_OUTCOME_FUNCTION_NOT_FOUND");
  assert.match(matched, /security definer\s+set search_path = pg_catalog, public/i);
  return matched;
}

export async function installV13LocalFixture({ databaseName, applyFile, executeSql, beforeMigration } = {}) {
  assert.equal(typeof applyFile, "function");
  assert.equal(typeof executeSql, "function");
  assert.match(databaseName ?? "", /^jianlian_bitrefill_v13_db5_[0-9a-f]{8}$/);
  assert.equal(process.env.V13_PGHOST, "127.0.0.1");
  assert.equal(process.env.V13_PGPORT, "55433");
  const expectedData = process.env.V13_EXPECTED_DATA_DIRECTORY?.replaceAll("\\", "/");
  assert.ok(expectedData && process.env.V13_PGUSER && process.env.PGPASSWORD);
  assert.equal(basename(dirname(expectedData)).toLowerCase(), "_bitrefill_v13_local_pg");
  assert.equal(basename(expectedData).toLowerCase(), "data");
  const identity = await executeSql("select current_database()||'|'||current_setting('data_directory')||'|'||host(inet_server_addr())");
  assert.equal(identity, `${databaseName}|${expectedData}|127.0.0.1`, "V13_FIXTURE_LOCAL_IDENTITY_FAILED");
  assert.equal(migrationSha256(), expectedMigrationSha256, "V13_MIGRATION_SHA_CHANGED");
  await applyFile(fixturePaths.baseline);
  await applyFile(fixturePaths.support);
  // Exact repository function, not a second handwritten definition. Its
  // Production metadata/body remains pending authoritative DB8 comparison.
  await executeSql(repoOutcomeDefinition());
  await executeSql(`revoke all on function public.record_supplier_fulfillment_outcome
    ${outcomeSignature} from public,anon,authenticated;
    grant execute on function public.record_supplier_fulfillment_outcome
    ${outcomeSignature} to service_role`);
  if (beforeMigration) await beforeMigration();
  await applyFile(fixturePaths.migration);
  return { migration_sha256: expectedMigrationSha256,
    outcome_source: "AUTHORITATIVE_REPO_DEFINITION",
    support_source: "TEST_ONLY_STUB" };
}
