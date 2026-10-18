// Local-only canonical v1 fingerprint. Never connects to a remote database.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expectedMigrationSha256, migrationSha256 } from "./supplier-v13-local-fixture.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const queryFile = resolve(root, "docs/integrations/sql/bitrefill-v1-3-authoritative-parity.sql");
const manifestFile = resolve(root, "tests/fixtures/current-schema/supplier-v13-current-baseline.manifest.json");
const database = process.env.V13_DB_NAME;
const expectedData = process.env.V13_EXPECTED_DATA_DIRECTORY?.replaceAll("\\", "/");
const psql = process.env.V13_PSQL_PATH;
assert.match(database ?? "", /^jianlian_bitrefill_v13_db5_[0-9a-f]{8}$/);
assert.equal(process.env.V13_PGHOST, "127.0.0.1");
assert.equal(process.env.V13_PGPORT, "55433");
assert.ok(process.env.V13_PGUSER && process.env.PGPASSWORD && psql && expectedData);
assert.equal(basename(dirname(expectedData)).toLowerCase(), "_bitrefill_v13_local_pg");
assert.equal(basename(expectedData).toLowerCase(), "data");
assert.equal(basename(dirname(psql)).toLowerCase(), "bin");

const sql = readFileSync(queryFile, "utf8");
const unquoted = sql.replace(/--[^\r\n]*/g, "").replace(/'(?:''|[^'])*'/g, "''");
assert.match(unquoted.trimStart(), /^with\s+scope_tables/i);
assert.equal((unquoted.match(/;/g) ?? []).length, 1, "one SELECT statement only");
assert.doesNotMatch(unquoted, /\b(?:insert\s+into|update\s+\w+\s+set|delete\s+from|create\s+(?:table|function|index)|alter\s+table|drop\s+|grant\s+|revoke\s+|call\s+)\b/i);

function run(args) {
  const result = spawnSync(psql, ["-w", "-X", "-A", "-t", "-F", "\t", "-v", "ON_ERROR_STOP=1",
    "-h", "127.0.0.1", "-p", "55433", "-U", process.env.V13_PGUSER,
    "-d", database, ...args], { encoding: "utf8", windowsHide: true,
    env: process.env, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
const identity = run(["-c", "select current_database()||'|'||current_setting('data_directory')||'|'||host(inet_server_addr())"]);
assert.equal(identity, `${database}|${expectedData}|127.0.0.1`);

function capture() {
  const lines = run(["-f", queryFile]).split(/\r?\n/).filter(Boolean);
  const rows = lines.map((line) => {
    const parts = line.split("\t");
    assert.equal(parts.length, 6, "canonical rows must have six TSV fields");
    assert.equal(parts[0], "v1");
    return { schema_version: parts[0], section: parts[1], object_type: parts[2],
      schema_name: parts[3], object_name: parts[4], canonical_definition: parts[5] };
  });
  const contract = rows.filter((row) => row.section === "contract");
  assert.ok(contract.length > 1000, "empty or truncated dependency contract");
  const contractTypes = new Set(contract.map((row) => row.object_type));
  for (const type of ["table", "column", "constraint", "index", "policy", "function",
    "trigger", "table_acl", "column_acl", "function_acl"])
    assert.ok(contractTypes.has(type), `DB8_METADATA_MISSING_${type}`);
  const sections = new Set(rows.map((row) => row.section));
  for (const section of ["session", "migration_history", "authoritative_dependency_function",
    "authoritative_owner", "authoritative_acl_explicit", "dirty"])
    assert.ok(sections.has(section), `DB8_SECTION_MISSING_${section}`);
  for (const setting of ["transaction_read_only", "default_transaction_read_only"])
    assert.ok(rows.some((row) => row.section === "session" && row.object_name === setting));
  for (const name of ["auth.role()", "auth.uid()", "is_admin()", "is_admin(uuid)",
    "record_supplier_fulfillment_outcome(", "log_order_item_delivery_status(",
    "write_delivery_log(", "refresh_order_fulfillment_status("])
    assert.ok(rows.some((row) => row.section === "authoritative_dependency_function"
      && row.object_name.includes(name)), `DB8_DEPENDENCY_FUNCTION_MISSING_${name}`);
  assert.equal(rows.filter((row) => row.section === "dirty").length, 5);
  const serialized = contract.map((row) => [row.schema_version, row.section,
    row.object_type, row.schema_name, row.object_name, row.canonical_definition].join("\t")).join("\n") + "\n";
  return { hash: createHash("sha256").update(serialized, "utf8").digest("hex"), rows, contract };
}
const runs = [capture(), capture(), capture()];
assert.equal(runs[0].hash, runs[1].hash);
assert.equal(runs[1].hash, runs[2].hash);
assert.deepEqual(runs[0].contract, runs[1].contract);
assert.deepEqual(runs[1].contract, runs[2].contract);

const unresolved = [
  { kind: "policy", count: 12, field: "identity_and_definition",
    reason: "DB6 observed 23 scoped policies; only 11 have repository-backed local expectations" },
  { kind: "acl", field: "explicit_grants_grantor_owner_column_grants",
    reason: "Repo lineage does not uniquely determine all current Production grants" },
  { kind: "function", field: "body_security_search_path_owner_execute",
    reason: "Local Auth/admin/delivery helpers are test stubs or repo definitions pending DB8 comparison" },
];
const stubFunctions = ["is_admin(", "uid(", "role(", "log_order_item_delivery_status(",
  "write_delivery_log(", "refresh_order_fulfillment_status("];
function functionClass(row) {
  if (row.object_type !== "function") return "REPO_DERIVED_EXPECTATION";
  if (stubFunctions.some((name) => row.object_name.includes(name))) return "TEST_ONLY_STUB";
  if (row.object_name.includes("record_supplier_fulfillment_outcome("))
    return "AUTHORITATIVE_REPO_DEFINITION";
  return "REPO_DERIVED_EXPECTATION";
}
function dependencyClass(row) {
  const name = row.object_name;
  if (/supplier_fulfillment_requests|^(?:orders|order_items|order_deliveries)(?:\.|$)|admin_evaluate_product_sku_activation/.test(name))
    return "DIRECT";
  return "TRANSITIVE";
}
function authoritativeFields(row) {
  if (functionClass(row) === "TEST_ONLY_STUB")
    return ["body_hash", "security_mode", "search_path", "owner", "execute_grants"];
  if (row.object_type === "function" && nameIsOutcome(row.object_name))
    return ["body_hash", "security_mode", "search_path", "owner", "execute_grants"];
  if (row.object_type === "table_acl" || row.object_type === "column_acl" || row.object_type === "function_acl")
    return ["grantor", "owner", "explicit_grant"];
  return [];
}
function nameIsOutcome(name) { return name.includes("record_supplier_fulfillment_outcome("); }
function canonicalLine(row) {
  return [row.schema_version, row.section, row.object_type, row.schema_name,
    row.object_name, row.canonical_definition].join("\t") + "\n";
}
function sha256(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
const migrationHash = migrationSha256();
assert.equal(migrationHash, expectedMigrationSha256, "V13_MIGRATION_SHA_CHANGED");
if (process.argv.includes("--write-manifest")) {
  const contract = runs[0].contract.map((row) => {
    const implementation = functionClass(row);
    const unresolvedFields = authoritativeFields(row);
    return { ...row, object_hash_sha256: sha256(canonicalLine(row)),
      dependency_classification: dependencyClass(row),
      implementation_classification: implementation,
      unresolved_authoritative_fields: unresolvedFields,
      test_only_stub: implementation === "TEST_ONLY_STUB",
      authoritative_equality_comparable: unresolvedFields.length === 0,
      requires_authoritative_capture: unresolvedFields.length > 0 };
  });
  const comparable = contract.filter((row) => row.authoritative_equality_comparable);
  const manifest = {
    schema_version: "v1",
    source: "local disposable current-schema fixture; no Production data",
    expected_fixture_fingerprint_v1: runs[0].hash,
    authoritative_comparable_fingerprint_v1: sha256(comparable.map(canonicalLine).join("")),
    migration_sha256: migrationHash,
    hash_algorithm: "SHA-256 over UTF-8 canonical contract TSV rows, sorted by parity SQL, LF terminated",
    requires_authoritative_capture: unresolved,
    contract,
  };
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify({ fingerprint_schema_version: "v1", database,
  fingerprint_run_1: runs[0].hash, fingerprint_run_2: runs[1].hash,
  fingerprint_run_3: runs[2].hash, deterministic: true,
  contract_rows: runs[0].contract.length,
  migration_sha256: migrationHash,
  manifest_written: process.argv.includes("--write-manifest") }));
