import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { expectedMigrationSha256, migrationSha256 } from "../support/supplier-v13-local-fixture.mjs";

const migration = readFileSync("supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql", "utf8");
const harness = readFileSync("tests/support/supplier-v13-db9-acl-local.mjs", "utf8");
const defaults = readFileSync("tests/fixtures/current-schema/supplier-v13-db9-default-acl.sql", "utf8");
const db10 = readFileSync("docs/integrations/sql/bitrefill-v1-3-db10-acl-precheck.sql", "utf8");

test("DB9 candidate removes service-role creation defaults before restoring SELECT", () => {
  assert.match(migration, /supplier_reconciliation_evidence from public, anon, authenticated, service_role;/);
  assert.match(migration, /grant select on public\.supplier_purchase_attempts/);
  assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete|truncate|all)\s+on/i);
  assert.equal(migrationSha256(), expectedMigrationSha256);
  assert.notEqual(expectedMigrationSha256, "2b31673100d15b6c55968aa71eb092a5f278032f8ec808e3a3f5b949fa38d108");
});

test("DB9 retains six narrow DEFINER RPCs, safe paths and caller-independent owner checks", () => {
  assert.equal((migration.match(/language plpgsql security definer set search_path = pg_catalog/gi) ?? []).length, 6);
  const sql = migration.replace(/--[^\r\n]*/g, "");
  assert.doesNotMatch(sql, /\b(?:create|alter)\s+role\b|\balter\s+\w+[\s\S]{0,60}\bowner\s+to\b|\bexecute\s+format\(/i);
  assert.match(migration, /SUPPLIER_PURCHASE_TRUSTED_OWNER_REQUIRED/);
  assert.match(migration, /SUPPLIER_PURCHASE_DEPENDENCY_OWNER_MISMATCH/);
  assert.match(migration, /pg_has_role\(v_role,v_owner,'SET'\)/);
  assert.match(migration, /p\.proowner=v_owner and p\.prosecdef/);
});

test("DB9 effective checks cover inherited/SET routes, columns and all mutation privileges", () => {
  for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]) {
    assert.ok(migration.includes(`'${privilege}'`));
  }
  for (const name of ["EFFECTIVE_WRITE_ACL_UNSAFE", "EFFECTIVE_COLUMN_ACL_UNSAFE", "EFFECTIVE_EXECUTE_ACL_UNSAFE"]) {
    assert.ok(migration.includes(`SUPPLIER_PURCHASE_${name}`));
  }
  assert.match(migration, /pg_has_role\(v_role,oid,'USAGE'\)/);
  assert.match(migration, /pg_has_role\(v_role,oid,'SET'\)/);
  assert.match(migration, /aclexplode\(v_function.proacl\) where grantee=0/);
  assert.match(migration, /\$effective_security\$;\s+commit;/);
});

test("DB9 reproducer is explicitly pinned, uses real roles and never calls a supplier endpoint", () => {
  assert.match(harness, /--local-pinned/);
  assert.match(harness, /startsWith\("PG"\)\) delete env\[key\]/);
  assert.match(harness, /127\.0\.0\.1/);
  assert.match(harness, /\|17\.11/);
  assert.match(harness, /DB9_OLD_DEFAULT_ACL_REPRODUCTION_PASS/);
  assert.match(harness, /DB9_TWO_INDEPENDENT_SESSION_CLAIM_AND_SEARCH_PATH_SHADOW_PASS/);
  assert.match(harness, /for \(const inheritance of \[true, false\]\)/);
  assert.match(harness, /oldHead = "ed8a9c492d755461e09441b324f3e317f4c64321"/);
  assert.doesNotMatch(harness, /\bfetch\(|https:\/\/api\.bitrefill|BITREFILL_API_KEY/);
  assert.match(defaults, /LOCAL SYNTHETIC DEFAULT-ACL/);
  assert.match(defaults, /alter default privileges in schema public grant all on tables/);
});

test("DB10 draft is metadata-only, explicitly pending and distinguishes pre-migration absence", () => {
  const sql = db10.replace(/--[^\r\n]*/g, "").replace(/'(?:''|[^'])*'/g, "''");
  assert.match(sql.trim(), /^begin transaction read only;/i);
  assert.match(sql.trim(), /rollback;$/i);
  assert.doesNotMatch(sql, /\b(?:insert\s+into|update\s+\w+\s+set|delete\s+from|create\s+|alter\s+|drop\s+|grant\s+|revoke\s+|call\s+)\b/i);
  assert.doesNotMatch(sql, /from\s+public\.|pg_read_file|pg_ls_dir/i);
  assert.match(db10, /pg_auth_members/);
  assert.match(db10, /has_column_privilege/);
  assert.match(db10, /ABSENT_PREMIGRATION/);
  assert.ok(db10.includes(expectedMigrationSha256));
});
