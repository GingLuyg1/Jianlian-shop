// Local PostgreSQL 17.11 evidence freeze. Creates and drops only its own two
// random disposable databases on the pinned loopback cluster.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installV13LocalFixture, expectedMigrationSha256 } from "./supplier-v13-local-fixture.mjs";

const host = process.env.V13_PGHOST;
const port = process.env.V13_PGPORT;
const user = process.env.V13_PGUSER;
const psql = process.env.V13_PSQL_PATH;
const expectedData = process.env.V13_EXPECTED_DATA_DIRECTORY?.replaceAll("\\", "/");
const db9Owner = process.argv.includes("--db9-owner");
const fixtureOwner = db9Owner ? "postgres" : user;
assert.equal(host, "127.0.0.1");
assert.equal(port, "55433");
assert.ok(user && psql && expectedData && process.env.PGPASSWORD);
assert.equal(basename(dirname(expectedData)).toLowerCase(), "_bitrefill_v13_local_pg");
assert.equal(basename(expectedData).toLowerCase(), "data");
assert.equal(basename(dirname(psql)).toLowerCase(), "bin");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fingerprint = resolve(root, "tests/support/supplier-v13-schema-fingerprint.mjs");
const contractTest = resolve(root, "tests/support/supplier-v13-schema-contract-local.mjs");
const parityQuery = resolve(root, "docs/integrations/sql/bitrefill-v1-3-authoritative-parity.sql");
const tool = (name) => resolve(dirname(psql), `${name}.exe`);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const databases = Array.from({ length: 2 }, () =>
  `jianlian_bitrefill_v13_db5_${randomBytes(4).toString("hex")}`);
assert.notEqual(databases[0], databases[1]);

function command(executable, args, env = process.env) {
  const result = spawnSync(executable, args, { encoding: "utf8", windowsHide: true,
    shell: false, env, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
}
function sql(database, statement) {
  return command(psql, ["-w", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
    "-h", host, "-p", port, "-U", user, "-d", database,
    ...(db9Owner ? ["-c", `set role ${fixtureOwner}`] : []), "-c", statement]);
}
function verifyRootConstraints(database) {
  const names = ["supplier_fulfillment_requests_supplier_check",
    "supplier_fulfillment_requests_product_id_check",
    "supplier_fulfillment_requests_request_not_blank",
    "supplier_fulfillment_requests_price_check",
    "supplier_fulfillment_requests_attempt_count_check"];
  const found = sql(database, `select count(*) from pg_constraint where conrelid=
    'public.supplier_fulfillment_requests'::regclass and contype='c'
    and conname in (${names.map(quote).join(",")})`);
  assert.equal(found, "5", "DB7B_ROOT_CONSTRAINT_DEFINITION_MISSING");
  sql(database, `begin;
do $db7b$
declare v_order uuid:=gen_random_uuid(); v_item uuid:=gen_random_uuid();
  v_item_2 uuid:=gen_random_uuid();
begin
  insert into public.orders(id,order_no,user_id,status,payment_status)
    values(v_order,'synthetic-db7b-'||v_order,gen_random_uuid(),'paid','paid');
  insert into public.order_items(id,order_id,product_name,unit_price,line_total)
    values(v_item,v_order,'SYNTHETIC_DB7B',1,1),
      (v_item_2,v_order,'SYNTHETIC_DB7B',1,1);
  begin
    insert into public.supplier_fulfillment_requests
      (order_id,order_item_id,supplier,supplier_product_id,request_id)
      values(v_order,v_item,' ','product','db7b-supplier');
    raise exception 'DB7B_SUPPLIER_CHECK_NOT_ENFORCED';
  exception when check_violation then null; end;
  begin
    insert into public.supplier_fulfillment_requests
      (order_id,order_item_id,supplier,supplier_product_id,request_id)
      values(v_order,v_item,'bitrefill',' ','db7b-product');
    raise exception 'DB7B_PRODUCT_CHECK_NOT_ENFORCED';
  exception when check_violation then null; end;
  begin
    insert into public.supplier_fulfillment_requests
      (order_id,order_item_id,supplier,supplier_product_id,request_id)
      values(v_order,v_item,'bitrefill','product',' ');
    raise exception 'DB7B_REQUEST_CHECK_NOT_ENFORCED';
  exception when check_violation then null; end;
  begin
    insert into public.supplier_fulfillment_requests
      (order_id,order_item_id,supplier,supplier_product_id,request_id,supplier_unit_price)
      values(v_order,v_item,'bitrefill','product','db7b-price',-1);
    raise exception 'DB7B_PRICE_CHECK_NOT_ENFORCED';
  exception when check_violation then null; end;
  begin
    insert into public.supplier_fulfillment_requests
      (order_id,order_item_id,supplier,supplier_product_id,request_id,attempt_count)
      values(v_order,v_item,'bitrefill','product','db7b-attempt',-1);
    raise exception 'DB7B_ATTEMPT_CHECK_NOT_ENFORCED';
  exception when check_violation then null; end;
  insert into public.supplier_fulfillment_requests
    (order_id,order_item_id,supplier,supplier_product_id,request_id)
    values(v_order,v_item,'bitrefill','product','db7b-valid');
  begin
    insert into public.supplier_fulfillment_requests
      (order_id,order_item_id,supplier,supplier_product_id,request_id)
      values(v_order,v_item_2,'bitrefill','product','db7b-valid');
    raise exception 'DB7B_REQUEST_UNIQUE_NOT_ENFORCED';
  exception when unique_violation then null; end;
  begin
    insert into public.supplier_fulfillment_requests
      (order_id,order_item_id,supplier,supplier_product_id,request_id)
      values(v_order,v_item,'bitrefill','product','db7b-other');
    raise exception 'DB7B_ITEM_UNIQUE_NOT_ENFORCED';
  exception when unique_violation then null; end;
  begin
    insert into public.supplier_fulfillment_requests
      (order_id,order_item_id,supplier,supplier_product_id,request_id)
      values(v_order,gen_random_uuid(),'bitrefill','product','db7b-fk');
    raise exception 'DB7B_ITEM_FK_NOT_ENFORCED';
  exception when foreign_key_violation then null; end;
end $db7b$;
rollback;`);
}
const cluster = sql("postgres", "select current_setting('data_directory')||'|'||host(inet_server_addr())||'|'||current_setting('server_version')");
assert.equal(cluster, `${expectedData}|127.0.0.1|17.11`, "DB7B_LOCAL_CLUSTER_IDENTITY_FAILED");
for (const database of databases) {
  assert.equal(sql("postgres", `select count(*) from pg_database where datname=${quote(database)}`), "0");
}
const created = [];
const hashes = [];
try {
  for (const database of databases) {
    command(tool("createdb"), ["-h", host, "-p", port, "-U", user,
      ...(db9Owner ? ["-O", fixtureOwner] : []), database]);
    created.push(database);
    const applyFile = async (file) => {
      command(psql, ["-w", "-X", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", port,
        "-U", user, "-d", database,
        ...(db9Owner ? ["-c", `set role ${fixtureOwner}`] : []), "-c",
        `select set_config('v13.expected_data_directory',${quote(expectedData)},false)`,
        "-f", file]);
    };
    await installV13LocalFixture({ databaseName: database, applyFile,
      executeSql: (statement) => sql(database, statement),
      beforeMigration: async () => {
        const output = JSON.parse(command(process.execPath, [fingerprint,
          ...(hashes.length === 0 ? ["--write-manifest"] : [])],
        { ...process.env, V13_DB_NAME: database }));
        assert.equal(output.deterministic, true);
        hashes.push(output.fingerprint_run_1);
        verifyRootConstraints(database);
      } });
    const row = sql(database, `select
      (select count(*) from pg_trigger where tgname in
        ('order_deliveries_set_updated_at','supplier_fulfillment_requests_set_updated_at')
        and not tgisinternal)::text||'|'||
      (select count(*) from pg_trigger where tgname in
        ('supplier_purchase_attempt_item_guard','supplier_purchase_attempt_update_guard',
         'supplier_external_order_guard') and not tgisinternal)::text||'|'||
      (select count(*) from pg_proc where proname='record_supplier_fulfillment_outcome')::text`);
    assert.equal(row, "2|3|1", "DB7B_TRIGGER_OR_OUTCOME_DUPLICATE");
    const parityRows = command(psql, ["-w", "-X", "-A", "-t", "-F", "\t",
      "-v", "ON_ERROR_STOP=1", "-h", host, "-p", port, "-U", user,
      "-d", database, "-f", parityQuery]).split(/\r?\n/).map((line) => line.split("\t"));
    const conflicts = (kind) => parityRows.filter((parts) =>
      parts[1] === "target_conflict" && parts[2] === kind);
    assert.equal(conflicts("trigger").length, 3);
    assert.ok(conflicts("trigger").every((parts) => parts[5]?.startsWith("CREATE TRIGGER")));
    assert.equal(conflicts("function").length, 9);
    assert.ok(conflicts("function").every((parts) =>
      JSON.parse(parts[5]).definition_md5 && JSON.parse(parts[5]).owner));
    const localContract = JSON.parse(command(process.execPath, [contractTest,
      ...(db9Owner ? ["--db9-owner"] : [])],
      { ...process.env, V13_DB_NAME: database }));
    assert.equal(localContract.local_policy_pass, true);
    console.log(JSON.stringify({ database, local_fixture_apply_pass: true,
      existing_triggers: 2, migration_triggers: 3,
      local_policy_pass: true, local_acl_pass: true }));
  }
  assert.equal(hashes[0], hashes[1], "DB7B_FRESH_DB_HASH_MISMATCH");
  console.log(JSON.stringify({ fingerprint_schema_version: "v1",
    fingerprint_deterministic: true, fresh_db_fingerprint_match: true,
    expected_fixture_fingerprint_v1: hashes[0], migration_sha256: expectedMigrationSha256 }));
} finally {
  for (const database of created.reverse()) {
    assert.equal(sql("postgres", "select current_setting('data_directory')||'|'||host(inet_server_addr())"),
      `${expectedData}|127.0.0.1`);
    command(tool("dropdb"), ["-h", host, "-p", port, "-U", user, database]);
  }
}
