// Opt-in local disposable PostgreSQL 17.11 only. Never loads a remote URL/key.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installV13LocalFixture } from "./supplier-v13-local-fixture.mjs";

assert.ok(process.argv.includes("--local-pinned"), "DB9_EXPLICIT_LOCAL_OPT_IN_REQUIRED");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const local = "D:/Jianlian/_bitrefill_v13_local_pg";
const data = `${local}/data`;
const bin = `${local}/portable/pgsql/bin`;
const env = { ...process.env, V13_PGHOST: "127.0.0.1", V13_PGPORT: "55433",
  V13_PGUSER: "v13_local", V13_PSQL_PATH: `${bin}/psql.exe`,
  V13_EXPECTED_DATA_DIRECTORY: data };
// An inherited PGHOSTADDR/service/PGOPTIONS must never redirect a local probe
// or silently change its effective role. Only the disposable password survives.
for (const key of Object.keys(env)) if (key.toUpperCase().startsWith("PG")) delete env[key];
env.PGPASSWORD = readFileSync(`${local}/initdb-password.txt`, "utf8").trim();
const quote = (s) => `'${String(s).replaceAll("'", "''")}'`;
const tables = ["supplier_purchase_attempts", "supplier_purchase_attempt_items",
  "supplier_external_orders", "supplier_webhook_receipts", "supplier_reconciliation_evidence"];
const migrationPath = "supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql";
const oldHead = "ed8a9c492d755461e09441b324f3e317f4c64321";
function command(file, args, input, childEnv = env) {
  return spawnSync(file, args, { input, env: childEnv, cwd: root, shell: false,
    windowsHide: true, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}
function sql(database, source, { role = "postgres", ok = true } = {}) {
  const prefix = role ? `set role ${role}; set request.jwt.claim.role=${quote(role)};` : "";
  const result = command(`${bin}/psql.exe`, ["-w", "-X", "-q", "-A", "-t",
    "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", "55433", "-U", "v13_local",
    "-d", database], `${prefix}\n${source}\n`);
  assert.equal(result.status === 0, ok, result.stderr);
  return ok ? result.stdout.trim() : result.stderr;
}
const identity = sql("postgres", "select current_user||'|'||current_setting('data_directory')||'|'||host(inet_server_addr())||'|'||current_setting('server_version')", { role: null });
assert.equal(identity, `v13_local|${data}|127.0.0.1|17.11`);
// This local-only owner emulates the observed Production owner without making
// it a superuser or giving it role-management rights. No role creation in migration.
sql("postgres", `do $local$ begin if to_regrole('postgres') is null then
  create role postgres nologin nosuperuser nocreaterole bypassrls; end if; end $local$;`, { role: null });
// Local fixture identity guards inspect data_directory. This read-only role is
// a harness requirement, not a privilege assumed/required by the migration.
sql("postgres", "grant pg_read_all_settings to postgres", { role: null });
const roleModel = sql("postgres", `select rolname||'|'||rolsuper||'|'||rolinherit||'|'||rolbypassrls
  from pg_roles where rolname in ('postgres','anon','authenticated','service_role') order by rolname`, { role: null });
assert.match(roleModel, /postgres\|false\|true\|true/);
assert.match(roleModel, /service_role\|false\|true\|true/);
const old = command("git", ["show", `${oldHead}:${migrationPath}`]);
assert.equal(old.status, 0, old.stderr);
const oldMigration = old.stdout;
assert.equal(createHash("sha256").update(oldMigration.replaceAll("\r\n", "\n")).digest("hex"),
  "2b31673100d15b6c55968aa71eb092a5f278032f8ec808e3a3f5b949fa38d108");
const created = [];
const syntheticRoles = [];
async function createFixture({ migration, defaults = true, beforeMigration,
  expectedFailure, migrationRole = "postgres" } = {}) {
  const name = `jianlian_bitrefill_v13_db5_${randomBytes(4).toString("hex")}`;
  assert.equal(sql("postgres", `select count(*) from pg_database where datname=${quote(name)}`, { role: null }), "0");
  const made = command(`${bin}/createdb.exe`, ["-h", "127.0.0.1", "-p", "55433", "-U", "v13_local", "-O", "postgres", name]);
  assert.equal(made.status, 0, made.stderr);
  created.push(name);
  // The fixture loader independently verifies its environment and identity.
  const processEnv = { ...process.env };
  Object.assign(process.env, env);
  try {
    await installV13LocalFixture({ databaseName: name,
      executeSql: (source) => sql(name, source),
      applyFile: (file) => {
        const source = resolve(file) === resolve(root, migrationPath) && migration
          ? migration : readFileSync(file, "utf8");
        sql(name, `set v13.expected_data_directory=${quote(data)};\n${source}`,
          { role: resolve(file) === resolve(root, migrationPath) ? migrationRole : "postgres" });
      },
      beforeMigration: async () => {
        if (defaults) sql(name, `set v13.expected_data_directory=${quote(data)};\n` +
          readFileSync(resolve(root, "tests/fixtures/current-schema/supplier-v13-db9-default-acl.sql"), "utf8"));
        assert.match(sql(name, readFileSync(resolve(root,
          "docs/integrations/sql/bitrefill-v1-3-db10-acl-precheck.sql"), "utf8")), /ABSENT_PREMIGRATION/);
        if (beforeMigration) await beforeMigration(name);
      },
    });
    assert.ok(!expectedFailure, "DB9_EXPECTED_MIGRATION_FAILURE_WAS_NOT_RAISED");
  } catch (error) {
    if (!expectedFailure) throw error;
    assert.match(error.message, expectedFailure);
    assert.equal(sql(name, `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in (${tables.map(quote).join(",")})`), "0");
    assert.equal(sql(name, `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and (p.proname like 'internal_supplier_purchase_%'
        or p.proname like 'supplier_purchase_guard_%')`), "0");
    console.log(`DB9_ATOMIC_FAILURE_PASS=${expectedFailure.source}`);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in processEnv)) delete process.env[key];
    Object.assign(process.env, processEnv);
  }
  return name;
}

const rpcArguments = {
  internal_supplier_purchase_claim: ["p_supplier", "p_logical_key", "p_semantic_hash", "p_items"],
  internal_supplier_purchase_transition: ["p_attempt_id", "p_expected_status", "p_next_status", "p_external_invoice_id"],
  internal_supplier_purchase_record_child: ["p_attempt_item_id", "p_external_order_id"],
  internal_supplier_purchase_record_evidence: ["p_attempt_id", "p_external_order_row_id", "p_status", "p_result_class", "p_safe_fingerprint", "p_checked_at"],
  internal_supplier_purchase_record_webhook: ["p_supplier", "p_event_fingerprint", "p_external_invoice_id", "p_external_order_id"],
  internal_supplier_purchase_deliver_child: ["p_external_order_row_id", "p_request_id", "p_attempt_token", "p_delivery_content"],
};
function rpcStatement(name, args) {
  assert.ok(Object.hasOwn(rpcArguments, name));
  return `select public.${name}(${rpcArguments[name].map((field) => args[field] == null ? "null"
    : field === "p_items" ? `${quote(JSON.stringify(args[field]))}::jsonb` : quote(args[field])).join(",")})`;
}
function client(database) {
  return {
    async rpc(name, args) {
      try { return { data: JSON.parse(sql(database, rpcStatement(name, args), { role: "service_role" })), error: null }; }
      catch (error) { return { data: null, error }; }
    },
    from(table) {
      assert.ok([...tables, "supplier_fulfillment_requests"].includes(table));
      return { select(columns) {
        assert.match(columns, /^[a-z_,]+$/);
        return { eq(field, value) {
          assert.match(field, /^[a-z_]+$/);
          const read = (single) => {
            const rows = JSON.parse(sql(database, `select coalesce(json_agg(s),'[]'::json)
              from (select ${columns} from public.${table} where ${field}=${quote(value)}) s`, { role: "service_role" }));
            return { data: single ? rows[0] ?? null : rows, error: null };
          };
          return { single: async () => read(true), then: (yes, no) => Promise.resolve().then(() => read(false)).then(yes, no) };
        } };
      } };
    },
  };
}
function seed(database, { paid = true } = {}) {
  const order = randomUUID(), item = randomUUID(), request = randomUUID(), token = randomUUID(), user = randomUUID();
  const requestId = `synthetic-db9-${request}`;
  sql(database, `insert into public.orders(id,order_no,user_id,status,payment_status)
    values('${order}','synthetic-db9-${order}','${user}','${paid ? "paid" : "pending_payment"}','${paid ? "paid" : "unpaid"}');
    insert into public.order_items(id,order_id,product_name,unit_price,line_total,quantity,delivery_type,product_snapshot)
    values('${item}','${order}','SYNTHETIC_DB9',5,5,1,'auto_delivery',
      '{"supplier_binding":{"fulfillment_source":"supplier","supplier":"bitrefill","supplier_product_id":"synthetic-product","supplier_sku":"synthetic-package"}}');
    insert into public.supplier_fulfillment_requests(id,order_id,order_item_id,supplier,supplier_product_id,supplier_sku,request_id,status,attempt_token,attempt_count)
    values('${request}','${order}','${item}','bitrefill','synthetic-product','synthetic-package','${requestId}','PURCHASING','${token}',1)`);
  return { order, item, request, requestId, token, user, frozen: {
    fulfillment_request_id: request, order_item_id: item, unit_index: 1,
    frozen_product_id: "synthetic-product", frozen_package_id: "synthetic-package",
    frozen_currency: "USD", frozen_face_value: "5.00", quoted_unit_cost: "4.80", max_unit_cost: "5.00",
  } };
}
function concurrentSession(database, statement) {
  return new Promise((resolveSession, rejectSession) => {
    const child = spawn(`${bin}/psql.exe`, ["-w", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
      "-h", "127.0.0.1", "-p", "55433", "-U", "v13_local", "-d", database],
    { env, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", error = "";
    child.stdout.setEncoding("utf8").on("data", part => { out += part; });
    child.stderr.setEncoding("utf8").on("data", part => { error += part; });
    child.on("error", rejectSession);
    child.on("close", code => code === 0 ? resolveSession(out.trim()) : rejectSession(new Error(error)));
    child.stdin.end(statement);
  });
}
async function verifyControlledRpcs(database) {
  const sources = [root,
    "D:/Jianlian/Jianlian-shop-bitrefill-auto-purchase-p1",
    "D:/Jianlian/Jianlian-shop-bitrefill-paid-order-p2",
    "D:/Jianlian/Jianlian-shop-bitrefill-prelaunch-p3"];
  let ownerFixture;
  for (const source of sources) {
    const { createBitrefillPurchaseRpcAdapter } = await import(pathToFileURL(resolve(source,
      "lib/providers/bitrefill/purchase-persistence.mjs")).href);
    const adapter = createBitrefillPurchaseRpcAdapter(client(database));
    const s = seed(database), key = `db9-${randomUUID()}`, hash = "a".repeat(64);
    const claimed = await adapter.claim("bitrefill", key, hash, [s.frozen]);
    assert.equal(claimed.result, "CLAIMED");
    assert.equal((await adapter.claim("bitrefill", key, hash, [s.frozen])).result, "ALREADY_CLAIMED");
    await assert.rejects(adapter.claim("bitrefill", key, "b".repeat(64), [s.frozen]), /RPC_FAILED/);
    const frozen = await adapter.getAttemptItems(claimed.attempt_id);
    assert.equal(frozen.length, 1);
    assert.equal((await adapter.getAttempt(claimed.attempt_id)).status, "CLAIMED");
    assert.equal((await adapter.transition(claimed.attempt_id, "CLAIMED", "SUBMITTING")).result, "TRANSITIONED");
    const invoice = `synthetic-invoice-${randomUUID()}`;
    assert.equal((await adapter.transition(claimed.attempt_id, "SUBMITTING", "EXTERNAL_CREATED", invoice)).result, "TRANSITIONED");
    assert.equal((await adapter.getAttemptByInvoice(invoice)).id, claimed.attempt_id);
    const external = `synthetic-child-${randomUUID()}`;
    const child = await adapter.recordChild(frozen[0].id, external);
    assert.equal(child.result, "RECORDED");
    assert.equal((await adapter.recordEvidence(claimed.attempt_id, child.external_order_row_id,
      "DELIVERED", "GET_RECONCILIATION", "a".repeat(64), new Date().toISOString())).result, "RECORDED");
    assert.equal((await adapter.recordWebhook("b".repeat(64 - source.length % 10) + "c".repeat(source.length % 10), invoice, external)).result, "RECEIVED");
    const context = { childRowId: child.external_order_row_id, requestId: s.requestId, attemptToken: s.token };
    const delivered = await adapter.recordPrivateOutcome(context, "SYNTHETIC_DB9_PRIVATE_CARD");
    assert.equal(delivered.ok, true);
    assert.equal((await adapter.recordPrivateOutcome(context, "SYNTHETIC_DB9_PRIVATE_CARD")).idempotent, true);
    assert.equal(sql(database, `select count(*) from public.digital_delivery_secrets ds join public.order_deliveries d on d.id=ds.delivery_id
      where d.order_item_id='${s.item}' and ds.content='SYNTHETIC_DB9_PRIVATE_CARD'`), "1");
    ownerFixture = s;
    console.log(`DB9_SIX_CONTROLLED_RPCS_AND_FROZEN_ADAPTER_COMPATIBLE=${source.split("/").at(-1)}`);
  }

  const valid = seed(database), other = seed(database), unpaid = seed(database, { paid: false });
  const concurrent = seed(database);
  const concurrentCall = rpcStatement("internal_supplier_purchase_claim", {
    p_supplier: "bitrefill", p_logical_key: `db9-concurrent-${concurrent.request}`,
    p_semantic_hash: "d".repeat(64), p_items: [concurrent.frozen],
  }).replace("select public.", "select json_build_object('pid',pg_backend_pid(),'claim',public.") + ")";
  const sessionSql = `begin; set role service_role; ${concurrentCall}; select pg_sleep(0.2); commit;`;
  const sessions = (await Promise.all([concurrentSession(database, sessionSql),
    concurrentSession(database, sessionSql)])).map(result => JSON.parse(result.split(/\r?\n/).find(line => line.startsWith("{"))));
  assert.notEqual(sessions[0].pid, sessions[1].pid);
  assert.deepEqual(sessions.map(s => s.claim.result).sort(), ["ALREADY_CLAIMED", "CLAIMED"]);
  assert.equal(sessions[0].claim.attempt_id, sessions[1].claim.attempt_id);
  sql(database, `begin; create temporary table supplier_webhook_receipts(shadow text);
    set local search_path=pg_temp;
    select public.internal_supplier_purchase_record_webhook('bitrefill',repeat('e',64),'synthetic-shadow',null);
    rollback;`, { role: "service_role" });
  console.log("DB9_TWO_INDEPENDENT_SESSION_CLAIM_AND_SEARCH_PATH_SHADOW_PASS");
  const baseArgs = { p_supplier: "bitrefill", p_logical_key: "db9-malicious", p_semantic_hash: "c".repeat(64), p_items: [valid.frozen] };
  const invalid = [
    { ...baseArgs, p_items: [unpaid.frozen] },
    { ...baseArgs, p_supplier: "daju" },
    { ...baseArgs, p_items: [{ ...valid.frozen, order_item_id: other.item }] },
    { ...baseArgs, p_items: [{ ...valid.frozen, quoted_unit_cost: null }] },
    { ...baseArgs, p_items: [{ ...valid.frozen, max_unit_cost: "1.00" }] },
    { ...baseArgs, p_items: [{ ...valid.frozen, fulfillment_request_id: "not-a-uuid" }] },
    { ...baseArgs, p_items: [{ ...valid.frozen, frozen_product_id: "x".repeat(301) }] },
    { ...baseArgs, p_logical_key: "x';drop table public.orders;--" },
    { ...baseArgs, p_logical_key: "x".repeat(201) },
  ];
  for (const args of invalid) {
    assert.match(sql(database, rpcStatement("internal_supplier_purchase_claim", args), { role: "service_role", ok: false }), /SUPPLIER_PURCHASE_/);
  }
  assert.equal(sql(database, "select count(*) from public.supplier_purchase_attempts where logical_request_key='db9-malicious'"), "0");
  for (const role of ["anon", "authenticated"]) {
    for (const name of Object.keys(rpcArguments)) {
      assert.equal(sql(database, `select has_function_privilege(${quote(role)},p.oid,'EXECUTE')
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=${quote(name)}`), "f");
      const args = name === "internal_supplier_purchase_claim" ? baseArgs : Object.fromEntries(rpcArguments[name].map(k => [k, null]));
      assert.match(sql(database, rpcStatement(name, args), { role, ok: false }), /permission denied for function/);
    }
  }
  const pending = JSON.parse(sql(database, rpcStatement("internal_supplier_purchase_claim", {
    ...baseArgs, p_logical_key: `db9-uncertain-${randomUUID()}`,
  }), { role: "service_role" }));
  const change = (expected, next, invoice = null) => rpcStatement("internal_supplier_purchase_transition", {
    p_attempt_id: pending.attempt_id, p_expected_status: expected, p_next_status: next, p_external_invoice_id: invoice,
  });
  sql(database, change("CLAIMED", "SUBMITTING"), { role: "service_role" });
  sql(database, change("SUBMITTING", "UNCERTAIN"), { role: "service_role" });
  assert.match(sql(database, change("UNCERTAIN", "SUBMITTING"), { role: "service_role", ok: false }), /TRANSITION_FORBIDDEN/);
  assert.match(sql(database, change("UNCERTAIN", "EXTERNAL_CREATED", "guess"), { role: "service_role", ok: false }), /TRANSITION_FORBIDDEN/);
  assert.match(sql(database, `select public.internal_supplier_purchase_record_child('${randomUUID()}','bad/id')`, { role: "service_role", ok: false }), /CHILD_INPUT_INVALID/);
  assert.match(sql(database, `select public.internal_supplier_purchase_record_child('not-a-uuid','child')`, { role: "service_role", ok: false }), /invalid input syntax for type uuid/);
  assert.match(sql(database, `select public.internal_supplier_purchase_deliver_child('${randomUUID()}','${valid.requestId}','${valid.token}','SYNTHETIC_DB9_PRIVATE_CARD')`, { role: "service_role", ok: false }), /IDENTITY_MISMATCH/);

  // Exercise the existing, approved customer secret-read RPC; no replacement store.
  const extract = (file, name) => {
    const found = readFileSync(resolve(root, file), "utf8").match(new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, "i"))?.[0];
    assert.ok(found); return found;
  };
  sql(database, "alter table public.order_deliveries add column viewed_at timestamptz, add column delivery_note text");
  sql(database, extract("supabase/migrations/20260709_digital_delivery_reserved_fulfillment_hardening.sql", "mask_delivery_secret"));
  sql(database, extract("supabase/migrations/20260810190000_user_delivery_compatibility.sql", "get_order_delivery_for_user"));
  sql(database, "revoke all on function public.get_order_delivery_for_user(text) from public,anon; grant execute on function public.get_order_delivery_for_user(text) to authenticated,service_role");
  const readSecret = (user) => `set request.jwt.claim.sub=${quote(user)}; select count(*)
    from public.get_order_delivery_for_user('synthetic-db9-${ownerFixture.order}') where content='SYNTHETIC_DB9_PRIVATE_CARD'`;
  assert.equal(sql(database, readSecret(ownerFixture.user), { role: "authenticated" }), "1");
  assert.match(sql(database, readSecret(randomUUID()), { role: "authenticated", ok: false }), /order not found or access denied/);
  assert.match(sql(database, readSecret(ownerFixture.user), { role: "anon", ok: false }), /permission denied/);
  for (const table of [...tables, "delivery_logs", "order_deliveries"]) {
    assert.equal(sql(database, `select count(*) from public.${table} t
      where position('SYNTHETIC_DB9_PRIVATE_CARD' in row_to_json(t)::text)>0`), "0");
  }
  console.log("DB9_MALICIOUS_INPUT_PAYMENT_COST_CHILD_HASH_UNCERTAIN_AND_OWNER_ONLY_SECRET_PASS");
}

async function verifyFailureMatrix() {
  const migration = readFileSync(resolve(root, migrationPath), "utf8");
  await createFixture({ migrationRole: "service_role", expectedFailure: /TRUSTED_OWNER_REQUIRED/ });
  await createFixture({ beforeMigration: (db) => sql(db,
    "alter function public.admin_evaluate_product_sku_activation(text,text,integer,jsonb,bigint) owner to v13_local", { role: null }),
  expectedFailure: /DEPENDENCY_OWNER_MISMATCH/ });
  await createFixture({ beforeMigration: (db) => sql(db,
    "alter schema public owner to v13_local; revoke create on schema public from pg_database_owner,postgres", { role: null }),
  expectedFailure: /permission denied for schema public/ });
  await createFixture({ migration: migration.replace("to_regrole('service_role')", "to_regrole('db9_intentionally_missing_role')"),
    expectedFailure: /ROLES_MISSING/ });
  await createFixture({ migration: migration.replace("create function public.internal_supplier_purchase_claim(",
    "do $abort$ begin raise exception 'DB9_INJECTED_MID_MIGRATION_FAILURE'; end $abort$;\ncreate function public.internal_supplier_purchase_claim("),
  expectedFailure: /DB9_INJECTED_MID_MIGRATION_FAILURE/ });
  for (const inheritance of [true, false]) {
    const role = `db9_acl_writer_${randomBytes(4).toString("hex")}`;
    sql("postgres", `create role ${role} nologin; grant ${role} to service_role with inherit ${inheritance}, set true`, { role: null });
    syntheticRoles.push(role);
    await createFixture({ beforeMigration: (db) => sql(db,
      `alter default privileges in schema public grant insert on tables to ${role}`),
    expectedFailure: /EFFECTIVE_WRITE_ACL_UNSAFE/ });
    sql("postgres", `revoke ${role} from service_role`, { role: null });
  }
  const role = `db9_acl_exec_${randomBytes(4).toString("hex")}`;
  sql("postgres", `create role ${role} nologin; grant ${role} to authenticated`, { role: null });
  syntheticRoles.push(role);
  await createFixture({ beforeMigration: (db) => sql(db,
    `alter default privileges in schema public grant execute on functions to ${role}`),
  expectedFailure: /EFFECTIVE_EXECUTE_ACL_UNSAFE/ });
  sql("postgres", `revoke ${role} from authenticated`, { role: null });
  await createFixture({ beforeMigration: (db) => sql(db, "grant create on schema public to service_role"),
    expectedFailure: /UNSAFE_ROLE_PATH/ });
  // Extra PUBLIC table defaults must be normalized, not rely on RLS to hide them.
  const publicDb = await createFixture({ beforeMigration: (db) => sql(db,
    "alter default privileges in schema public grant all on tables to public") });
  assert.equal(sql(publicDb, "select has_table_privilege('service_role','public.supplier_purchase_attempts','INSERT')"), "f");
  console.log("DB9_OWNER_MISSING_ROLE_PRIVILEGE_DEFAULT_INHERIT_SET_EXECUTE_AND_ATOMIC_FAILURE_MATRIX_PASS");
}
try {
  const a = await createFixture({ migration: oldMigration });
  for (const table of tables) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]) {
      assert.equal(sql(a, `select has_table_privilege('service_role','public.${table}',${quote(privilege)})`), "t");
    }
  }
  // Actual mutation, not merely an ACL-text prediction. Synthetic row rolls back.
  sql(a, `begin; insert into public.supplier_webhook_receipts(supplier,event_fingerprint)
    values('bitrefill',repeat('a',64));
    update public.supplier_webhook_receipts set processed_at=now();
    delete from public.supplier_webhook_receipts; rollback;`, { role: "service_role" });
  console.log("DB9_OLD_DEFAULT_ACL_REPRODUCTION_PASS; FIVE_TABLES_SERVICE_ROLE_ALL_PRIVILEGES; ACTUAL_IUD_PASS");
  if (!process.argv.includes("--reproduce-only")) {
    const b = await createFixture();
    assert.notEqual(a, b);
    const metadata = sql(b, readFileSync(resolve(root,
      "docs/integrations/sql/bitrefill-v1-3-db10-acl-precheck.sql"), "utf8"));
    assert.match(metadata, /PRESENT_REQUIRES_HISTORY_AND_CONFLICT_REVIEW/);
    assert.match(metadata, /"transaction_read_only": "on"/);
    assert.equal(sql(b, `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'internal_supplier_purchase_%'
        and p.proowner='postgres'::regrole and p.prosecdef
        and p.proconfig=array['search_path=pg_catalog']::text[]`), "6");
    for (const role of ["anon", "authenticated", "service_role"]) {
      // A role-owned disposable schema permits CREATE TABLE, so a failing FK
      // probe tests REFERENCES on the target rather than schema CREATE.
      sql(b, `create schema db9_probe_${role} authorization ${role}`, { role: null });
    }
    for (const table of tables) {
      assert.equal(sql(b, `select relrowsecurity and relowner='postgres'::regrole
        from pg_class where oid='public.${table}'::regclass`), "t");
      for (const role of ["anon", "authenticated", "service_role"]) {
        for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]) {
          assert.equal(sql(b, `select has_table_privilege(${quote(role)},'public.${table}',${quote(privilege)})`), "f");
        }
        assert.equal(sql(b, `select has_table_privilege(${quote(role)},'public.${table}','SELECT')`), role === "service_role" ? "t" : "f");
        for (const source of [`insert into public.${table} default values`,
          `update public.${table} set id=gen_random_uuid() where false`,
          `delete from public.${table} where false`, `truncate public.${table}`,
          `create table db9_probe_${role}.db9_ref_probe(id uuid references public.${table}(id))`,
          `create trigger db9_trigger_probe before update on public.${table}
            for each row execute function public.set_updated_at()`]) {
          const error = sql(b, source, { role, ok: false });
          assert.match(error, /permission denied|must be owner|does not exist/i);
        }
      }
    }
    console.log("DB9_FIVE_TABLES_REAL_ROLE_DIRECT_MUTATIONS_DENIED_PASS");
    await verifyControlledRpcs(b);
    await verifyFailureMatrix();
    for (const script of (process.argv.includes("--acl-only") ? [] : [
      "tests/support/supplier-v13-db5-local-e2e.mjs",
      "tests/support/supplier-v13-db7b-local-evidence.mjs"])) {
      const result = command(process.execPath, [script,
        ...(script.includes("db5-local") ? ["--db9-production-default-acl"] : ["--db9-owner"])]);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      console.log(result.stdout.trim());
    }
    console.log(process.argv.includes("--acl-only") ? "DB9_ACL_CORE_PASS; FULL_DB5_REPLAY_NOT_REQUESTED"
      : "DB9_LOCAL_ACL_HARDENING_COMPLETE=yes; PRODUCTION_READ_EXECUTED=no");
  }
} finally {
  for (const name of created.reverse()) {
    assert.match(name, /^jianlian_bitrefill_v13_db5_[0-9a-f]{8}$/);
    assert.equal(sql("postgres", "select current_setting('data_directory')||'|'||host(inet_server_addr())", { role: null }), `${data}|127.0.0.1`);
    const dropped = command(`${bin}/dropdb.exe`, ["-h", "127.0.0.1", "-p", "55433", "-U", "v13_local", name]);
    assert.equal(dropped.status, 0, dropped.stderr);
  }
  for (const role of syntheticRoles) {
    assert.match(role, /^db9_acl_(writer|exec)_[0-9a-f]{8}$/);
    sql("postgres", `drop role ${role}`, { role: null });
  }
}
