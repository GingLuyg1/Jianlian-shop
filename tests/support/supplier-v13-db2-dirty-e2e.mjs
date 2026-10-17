// Disposable, loopback PostgreSQL only. Never point at business Test/Production.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.V13_PGHOST;
const port = process.env.V13_PGPORT;
const db = process.env.V13_PGDATABASE;
const user = process.env.V13_PGUSER;
const psql = process.env.V13_PSQL_PATH;
const expectedDataDirectory = process.env.V13_EXPECTED_DATA_DIRECTORY;
assert.equal(host, "127.0.0.1");
assert.equal(port, "55433");
assert.equal(db, "jianlian_bitrefill_v13_dirty");
assert.ok(user && psql && expectedDataDirectory && process.env.PGPASSWORD);

function run(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", port,
      "-U", user, "-d", db, ...args], { shell: false, windowsHide: true });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (value) => { output += value; });
    child.stderr.setEncoding("utf8").on("data", (value) => { output += value; });
    child.on("error", rejectRun);
    child.on("close", (code) => resolveRun({ code, output: output.trim() }));
  });
}
const query = async (sql) => {
  const result = await run(["-Atqc", sql]);
  assert.equal(result.code, 0, result.output);
  return result.output;
};
assert.equal(await query("select current_database() || '|' || host(inet_server_addr())"),
  "jianlian_bitrefill_v13_dirty|127.0.0.1");
assert.equal(resolve(await query("select current_setting('data_directory')")).toLowerCase(),
  resolve(expectedDataDirectory).toLowerCase());
assert.equal(await query(`select count(*) from (
  select supplier,provider_order_code from public.supplier_fulfillment_requests
  where provider_order_code is not null
  group by supplier,provider_order_code having count(*) > 1
) d`), "1", "DIRTY_FIXTURE_MISSING");
assert.equal(await query(`select count(*) from pg_tables where schemaname='public'
  and tablename like 'supplier_purchase_%'`), "0", "DIRTY_DB_ALREADY_MIGRATED");

const migrationPath = fileURLToPath(new URL("../../supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql", import.meta.url));
assert.ok(readFileSync(migrationPath, "utf8").includes("SUPPLIER_PURCHASE_PREFLIGHT_DUPLICATE_EXTERNAL_INVOICE"));
const result = await run(["-f", migrationPath]);
assert.notEqual(result.code, 0, "DIRTY_MIGRATION_UNEXPECTED_SUCCESS");
assert.match(result.output, /SUPPLIER_PURCHASE_PREFLIGHT_DUPLICATE_EXTERNAL_INVOICE/);
assert.equal(await query(`select count(*) from pg_tables where schemaname='public'
  and tablename like 'supplier_purchase_%'`), "0", "PARTIAL_DDL_LEFT_BEHIND");
assert.equal(await query(`select count(*) from pg_proc where proname like 'internal_supplier_purchase_%'`),
  "0", "PARTIAL_RPC_LEFT_BEHIND");
console.log("V13_DB2_DIRTY_PREFLIGHT_ATOMIC_FAILURE_PASS");
