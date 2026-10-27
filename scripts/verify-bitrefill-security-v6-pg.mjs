// Applies ONLY the V6 security patch to a new synthetic loopback PostgreSQL.
// Never reads .env, connects to Supabase, executes DB9, or uses real credentials.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, statfs } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { runSecurityV6HttpChecks } from "../tests/support/bitrefill-security-v6-pg-http.mjs";
import { syntheticIds as ids } from "../tests/support/bitrefill-security-v6-fixture.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const binaryRoot = resolve("D:/Jianlian/_bitrefill_v13_local_pg/portable/pgsql/bin");
const evidenceRoot = resolve("D:/Jianlian/_bitrefill_security_aftercare_v6_20261025");
await mkdir(evidenceRoot, { recursive: true });
const disk = await statfs(evidenceRoot);
assert.ok(disk.bavail * disk.bsize > 4 * 1024 ** 3, "DISK_HEADROOM_REQUIRED");
const runDir = await mkdtemp(join(evidenceRoot, "pg-security-")), dataDir = join(runDir, "data");
const childEnvironment = Object.fromEntries(Object.keys(process.env).filter((key) =>
  /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP)$/i.test(key)).map((key) => [key, process.env[key]]));
function exec(name, args, input, ignore = false) {
  return new Promise((ok, fail) => {
    const child = spawn(join(binaryRoot, `${name}.exe`), args, { windowsHide: true, env: childEnvironment,
      stdio: ignore ? "ignore" : ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", bytes = 0;
    const timer = setTimeout(() => { child.kill(); fail(Error(`V6_${name}_TIMEOUT`)); }, 120000);
    child.stdout?.on("data", (b) => { bytes += b.length; if (bytes > 2 * 1024 ** 2) child.kill(); else stdout += b; });
    child.stderr?.on("data", (b) => { if (stderr.length < 16000) stderr += b; });
    child.once("error", (e) => { clearTimeout(timer); fail(e); });
    child.once("close", (code) => { clearTimeout(timer); if (code === 0) ok(stdout.trim()); else {
      const error = Error(`V6_${name}_FAILED`); error.sqlstate = stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1];
      // Contains only controlled synthetic SQL/object identifiers; never real data.
      error.safeDiagnostic = stderr.slice(0, 600); fail(error);
    } });
    child.stdin?.on("error", () => {}); child.stdin?.end(input ?? "");
  });
}
const reserve = createServer(); await new Promise((ok) => reserve.listen(0, "127.0.0.1", ok));
const port = reserve.address().port; await new Promise((ok) => reserve.close(ok));
const literal = (v) => v === null ? "null" : `'${String(v).replaceAll("'", "''")}'`;
const sql = (statement, role = null, user = null) => exec("psql", ["-X", "-q", "-A", "-t", "-w", "-h", "127.0.0.1", "-p", String(port),
  "-U", "v6_synthetic_owner", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"],
  role ? `begin;set local role ${role};do $$begin perform set_config('request.jwt.claim.sub',${literal(user ?? "")},true);end$$;${statement};commit;` : statement);
const patch = await readFile(join(root, "scripts/security/bitrefill-security-aftercare-v6.sql"), "utf8");
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
async function denied(name, statement, role, user = null) {
  await assert.rejects(() => sql(statement, role, user), (e) => e.sqlstate === "42501", name); checks.push(name);
}
const historyFile = async (name) => readFile(join(root, "supabase/migrations", name), "utf8");
let started = false, result, failure;
try {
  assert.match(await exec("postgres", ["--version"]), /17\.11/);
  await exec("initdb", ["-D", dataDir, "-U", "v6_synthetic_owner", "--auth=trust", "--encoding=UTF8", "--locale=C"]);
  await writeFile(join(dataDir, "postgresql.auto.conf"), `listen_addresses='127.0.0.1'\nport=${port}\nmax_connections=12\nshared_buffers='16MB'\nwork_mem='1MB'\nmaintenance_work_mem='8MB'\ntemp_file_limit='16MB'\nmax_worker_processes=0\nmax_parallel_workers=0\nautovacuum=off\nlog_statement='none'\nlogging_collector=off\njit=off\n`);
  await exec("pg_ctl", ["-D", dataDir, "-l", join(runDir, "postgres.log"), "-w", "start"], null, true); started = true;
  await sql(await readFile(join(root, "scripts/ci/bitrefill-security-v6-synthetic-schema.sql"), "utf8"));
  // Reuse the actual legacy refund schema/RPC bodies; NOT the DB9 migration.
  await sql(await historyFile("20260629_refund_after_sales.sql"));
  await sql(await historyFile("20260703_refund_flow_hardening.sql"));
  const wrapper = (await historyFile("20260715_admin_users_super_admin_model.sql"))
    .match(/create or replace function public\.super_admin_process_refund_request\(uuid,text,numeric,text,text,text,text\)[\s\S]*?end; \$\$;/)?.[0];
  assert.ok(wrapper); await sql(wrapper);
  await sql(`revoke execute on function public.admin_process_refund_request(uuid,text,numeric,text,text,text,text) from public,anon,authenticated,service_role;
    revoke execute on function public.super_admin_process_refund_request(uuid,text,numeric,text,text,text,text) from public,anon;
    grant execute on function public.super_admin_process_refund_request(uuid,text,numeric,text,text,text,text) to authenticated;`);
  for (const [order, user, amount] of [["MOCK-V6-BALANCE", ids.user, 10], ["MOCK-V6-EXTERNAL", ids.user, 20], ["MOCK-V6-OTHER", ids.other, 10]]) {
    await sql(`select (public.create_refund_request(${literal(order)},'other','MOCK legacy request',${amount},null,${literal(order)})).id`, "authenticated", user);
  }
  check("baseline_exposure_reproduced", (await sql("select metadata->>'supplier_api_key' from public.products", "anon")).includes("SYNTHETIC_ONLY"));
  const dataSnapshot = () => sql("select md5(jsonb_build_object('products',(select jsonb_agg(to_jsonb(p) order by id) from products p),'skus',(select jsonb_agg(to_jsonb(s) order by id) from product_skus s),'refunds',(select jsonb_agg(to_jsonb(r) order by id) from refund_requests r),'profiles',(select jsonb_agg(to_jsonb(p) order by id) from profiles p))::text)");
  const before = await dataSnapshot();
  const functionHashes = () => sql("select md5(string_agg(pg_get_functiondef(oid),'' order by proname)) from pg_proc where oid in ('public.admin_process_refund_request(uuid,text,numeric,text,text,text,text)'::regprocedure,'public.super_admin_process_refund_request(uuid,text,numeric,text,text,text,text)'::regprocedure)");
  const functionsBefore = await functionHashes();
  await sql(patch); check("patch_no_business_row_changes", before === await dataSnapshot());
  await sql(patch); check("patch_repeatable_and_non_destructive", before === await dataSnapshot());
  check("manual_refund_bodies_unchanged", functionsBefore === await functionHashes());
  for (const [role, user, label] of [["anon", null, "anon"], ["authenticated", ids.user, "customer"], ["authenticated", ids.admin, "admin_jwt"]]) {
    check(`${label}_non_superuser`, await sql("select rolsuper from pg_roles where rolname=current_user", role, user) === "f");
    for (const table of ["products", "product_skus"]) {
      for (const [kind, query] of [
        ["raw", `select metadata from public.${table}`], ["star", `select * from public.${table}`],
        ["json", `select metadata->'supplier_binding_candidate' from public.${table}`],
        ["filter", `select id from public.${table} where metadata ? 'supplier'`],
        ["whole_row", `select to_jsonb(t) from public.${table} t`],
      ]) await denied(`${label}_${table}_${kind}_denied`, query, role, user);
      check(`${label}_${table}_public_columns`, Number(await sql(`select count(id) from public.${table}`, role, user)) > 0);
    }
    await denied(`${label}_self_service_rpc_denied`, "select public.create_refund_request('MOCK','other','MOCK',1,null,null)", role, user);
    await denied(`${label}_direct_insert_denied`, "insert into public.refund_requests(refund_no,order_id,user_id,requested_amount) select 'MOCK-BYPASS',id,user_id,1 from public.orders limit 1", role, user);
  }
  check("public_product_rls_preserved", await sql("select count(id) from products", "anon") === "1");
  check("public_sku_rls_preserved", await sql("select count(id) from product_skus", "authenticated", ids.user) === "1");
  check("service_metadata_intact", (await sql("select metadata->>'supplier' from products where slug='mock-gift'", "service_role")) === "daju");
  await denied("unknown_private_column_denied", "select internal_notes from products", "authenticated", ids.user);
  check("own_refund_history_readable", await sql("select count(*) from refund_requests", "authenticated", ids.user) === "2");
  check("other_owner_history_separate", await sql("select count(*) from refund_requests", "authenticated", ids.other) === "1");
  check("admin_history_readable", await sql("select count(*) from refund_requests", "authenticated", ids.admin) === "3");
  await sql("create view public.v6_synthetic_leak as select metadata from public.products;grant select on public.v6_synthetic_leak to anon;");
  await assert.rejects(() => sql(patch), (e) => e.safeDiagnostic.includes("V6_PUBLIC_METADATA_VIEW_REQUIRES_REVIEW"));
  checks.push("definer_view_bypass_blocks_patch"); await sql("drop view public.v6_synthetic_leak");
  await sql("create view public.v6_synthetic_inner as select metadata from products;revoke all on public.v6_synthetic_inner from public,anon,authenticated;create view public.v6_synthetic_outer as select * from public.v6_synthetic_inner;grant select on public.v6_synthetic_outer to authenticated;");
  await assert.rejects(() => sql(patch), (e) => e.safeDiagnostic.includes("V6_PUBLIC_METADATA_VIEW_REQUIRES_REVIEW"));
  checks.push("nested_definer_view_bypass_blocks_patch");
  await sql("drop view public.v6_synthetic_outer;drop view public.v6_synthetic_inner");
  await sql("create function public.create_refund_request(text) returns jsonb language sql as $$select '{}'::jsonb$$");
  await assert.rejects(() => sql(patch), (e) => e.safeDiagnostic.includes("V6_UNEXPECTED_REFUND_RPC_OVERLOAD"));
  checks.push("unknown_self_service_overload_blocks_patch");
  await sql("drop function public.create_refund_request(text)");
  await sql("create role v6_synthetic_reader nologin;grant select(metadata) on products to v6_synthetic_reader;grant v6_synthetic_reader to authenticated;grant select(internal_notes) on products to authenticated;");
  await assert.rejects(() => sql(patch), (e) => e.safeDiagnostic.includes("V6_METADATA_COLUMN_PRIVILEGES_UNSAFE"));
  check("failed_patch_rolls_back_all_grant_changes", await sql("select has_column_privilege('authenticated','products','internal_notes','select')") === "t");
  await sql("revoke v6_synthetic_reader from authenticated;revoke select(internal_notes) on products from authenticated");
  await sql(patch);
  const http = await runSecurityV6HttpChecks({ sql, literal, ids }); checks.push(...http.checks);
  const refundId = await sql("select id from refund_requests where client_request_id='MOCK-V6-BALANCE'");
  const refundCall = `select public.super_admin_process_refund_request('${refundId}','approve_balance',10,'MOCK admin review',null,null,'MOCK-V6-REFUND')`;
  await denied("anonymous_admin_refund_denied", refundCall, "anon");
  await assert.rejects(() => sql(refundCall, "authenticated", ids.user), (e) => e.safeDiagnostic.includes("SUPER_ADMIN_REQUIRED"));
  checks.push("customer_admin_refund_denied");
  await assert.rejects(() => sql(refundCall, "authenticated", ids.ordinaryAdmin), (e) => e.safeDiagnostic.includes("SUPER_ADMIN_REQUIRED"));
  checks.push("ordinary_admin_financial_action_denied");
  const refunded = await Promise.all([sql(refundCall, "authenticated", ids.admin), sql(refundCall, "authenticated", ids.admin)]);
  check("manual_balance_refund_still_works", refunded.every((r) => JSON.parse(r).ok));
  check("manual_refund_single_credit", await sql("select count(*) from balance_transactions where business_type='refund'") === "1");
  check("manual_balance_once", await sql(`select balance from profiles where id='${ids.user}'`) === "110.000000");
  check("delivered_cards_not_restocked", await sql("select status from digital_inventory") === "delivered");
  const externalId = await sql("select id from refund_requests where client_request_id='MOCK-V6-EXTERNAL'");
  await assert.rejects(() => sql(`select public.super_admin_process_refund_request('${externalId}','approve_balance',20,'MOCK',null,null,'MOCK')`, "authenticated", ids.admin), (e) => e.safeDiagnostic.includes("EXTERNAL_REFUND_CANNOT_USE_BALANCE_FLOW"));
  checks.push("external_refund_cannot_credit_balance");
  check("manual_external_completion_preserved", JSON.parse(await sql(`select public.super_admin_process_refund_request('${externalId}','complete_external',20,'MOCK manual external','MOCK resolved','MOCK-EXTERNAL-REF','MOCK')`, "authenticated", ids.admin)).status === "succeeded");
  check("external_completion_no_extra_credit", await sql("select count(*) from balance_transactions") === "1");
  check("no_db9_or_history_install", await sql("select count(*) from pg_namespace where nspname='supabase_migrations'") === "0");
  result = { passed: true, checks, checkCount: checks.length, patchSha256: createHash("sha256").update(patch).digest("hex"),
    realDataUsed: false, db9Executed: false, databasePermissionsActuallyTested: true, postgrestServerUsed: false, port, runDir };
} catch (e) {
  failure = e;
  result = { passed: false, checks, checkCount: checks.length, failureType: e.name, sqlstate: e.sqlstate ?? null,
    safeDiagnostic: e.safeDiagnostic ?? String(e.message).slice(0, 300), realDataUsed: false, db9Executed: false, runDir };
} finally {
  if (started || await readFile(join(dataDir, "postmaster.pid"), "utf8").catch(() => null)) {
    await exec("pg_ctl", ["-D", dataDir, "-w", "stop", "-m", "fast"], null, true);
  }
}
result.instanceStopped = true;
await writeFile(join(runDir, "result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (failure) process.exitCode = 1;
