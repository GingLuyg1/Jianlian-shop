import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { expectedMigrationSha256, migrationSha256, repoOutcomeDefinition } from
  "../support/supplier-v13-local-fixture.mjs";

const fixture = readFileSync("tests/fixtures/current-schema/supplier-v13-current-baseline.sql", "utf8");
const parity = readFileSync("docs/integrations/sql/bitrefill-v1-3-authoritative-parity.sql", "utf8");
const manifest = JSON.parse(readFileSync(
  "tests/fixtures/current-schema/supplier-v13-current-baseline.manifest.json", "utf8"));
const support = readFileSync("tests/fixtures/current-schema/supplier-v13-db5-delivery-support.sql", "utf8");
const db5 = readFileSync("tests/support/supplier-v13-db5-local-e2e.mjs", "utf8");

test("DB7 scoped fixture is guarded and keeps transitive root/delivery contracts", () => {
  assert.match(fixture, /TEST FIXTURE ONLY[\s\S]*NO PRODUCTION DATA/);
  assert.match(fixture, /V13_CURRENT_SCHEMA_DISPOSABLE_GUARD_FAILED/);
  for (const name of ["supplier_check", "product_id_check", "request_not_blank",
    "price_check", "attempt_count_check"]) {
    assert.ok(fixture.includes(`supplier_fulfillment_requests_${name}`));
  }
  for (const name of ["order_deliveries_set_updated_at",
    "supplier_fulfillment_requests_set_updated_at", "order_items_delivery_status_check",
    "orders_fulfillment_status_check"]) assert.ok(fixture.includes(name));
  assert.match(fixture, /Test-only authorization identities[\s\S]*stubs/i);
});

test("DB8 parity SQL is one SELECT-only statement with five count-only checks", () => {
  const unquoted = parity.replace(/--[^\r\n]*/g, "").replace(/'(?:''|[^'])*'/g, "''");
  assert.match(unquoted.trimStart(), /^with\s+scope_tables/i);
  assert.equal((unquoted.match(/;/g) ?? []).length, 1);
  assert.doesNotMatch(unquoted, /\b(?:insert\s+into|update\s+\w+\s+set|delete\s+from|create\s+(?:table|function|index)|alter\s+table|drop\s+|grant\s+|revoke\s+|call\s+)\b/i);
  assert.doesNotMatch(unquoted, /pg_read_file|pg_ls_dir|copy\s+.*program/i);
  for (const name of ["logical_purchase", "external_invoice", "orphan_attempt",
    "invalid_state", "missing_binding"]) assert.ok(parity.includes(`'${name}'`));
  assert.match(parity, /current_setting\('transaction_read_only'\)/);
  assert.match(parity, /supabase_migrations\.schema_migrations/);
  for (const required of ["column_acl", "authoritative_acl_explicit",
    "authoritative_dependency_function", "authoritative_owner", "pg_get_triggerdef",
    "pg_get_constraintdef", "pg_get_functiondef", "has_column_privilege",
    "aclexplode", "'auth','uid'", "'auth','role'"]) assert.ok(parity.includes(required));
  assert.match(parity, /'target_conflict','trigger'[^;]*pg_get_triggerdef\(t\.oid\)/s);
  assert.match(parity, /'target_conflict','function'[^;]*definition_md5/s);
});

test("shared fixture loader keeps one repo outcome definition and marked local stubs", () => {
  assert.equal(migrationSha256(), expectedMigrationSha256);
  assert.match(db5, /installV13LocalFixture\(\{ databaseName: dbName, applyFile, executeSql: sql,/);
  assert.match(repoOutcomeDefinition(), /create or replace function public\.record_supplier_fulfillment_outcome/i);
  assert.match(support, /TEST_ONLY_STUB/);
  assert.equal((support.match(/create function public\.record_supplier_fulfillment_outcome/g) ?? []).length, 0);
});

test("generated manifest has row hashes, migration SHA and excludes stub equality", () => {
  assert.equal(manifest.schema_version, "v1");
  assert.ok(manifest.contract.length > 1000);
  assert.equal(manifest.migration_sha256, expectedMigrationSha256);
  assert.ok(manifest.requires_authoritative_capture.length > 0);
  const lines = manifest.contract.map((row) => [row.schema_version, row.section,
    row.object_type, row.schema_name, row.object_name, row.canonical_definition].join("\t"));
  const hash = createHash("sha256").update(`${lines.join("\n")}\n`, "utf8").digest("hex");
  assert.equal(hash, manifest.expected_fixture_fingerprint_v1);
  for (const [index, row] of manifest.contract.entries()) {
    const rowHash = createHash("sha256").update(`${lines[index]}\n`, "utf8").digest("hex");
    assert.equal(row.object_hash_sha256, rowHash);
    assert.match(row.dependency_classification, /^(DIRECT|TRANSITIVE)$/);
    if (row.test_only_stub) {
      assert.equal(row.authoritative_equality_comparable, false);
      assert.ok(row.unresolved_authoritative_fields.includes("body_hash"));
    }
  }
  const comparable = manifest.contract.filter((row) => row.authoritative_equality_comparable);
  const comparableHash = createHash("sha256").update(
    `${comparable.map((row) => [row.schema_version, row.section, row.object_type,
      row.schema_name, row.object_name, row.canonical_definition].join("\t")).join("\n")}\n`,
    "utf8").digest("hex");
  assert.equal(comparableHash, manifest.authoritative_comparable_fingerprint_v1);
  assert.equal(manifest.contract.filter((row) => row.object_type === "function"
    && row.test_only_stub).length, 7);
});
