// Own PG17 cluster, actual Test schema/constraints/functions metadata, synthetic
// rows and RPC only. Never reads .env, auth sessions, or production credentials.
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:net";
import ts from "typescript";
import { createRequire } from "node:module";

const root = process.cwd(), out = process.argv[2];
assert.ok(out && path.isAbsolute(out), "EXPLICIT_EVIDENCE_DIRECTORY_REQUIRED");
const schema = JSON.parse(fs.readFileSync(path.join(out, "test-schema-snapshot.json")));
const contract = JSON.parse(fs.readFileSync(path.join(out, "test-contract-snapshot.json")));
const bin = process.env.JIANLIAN_TEST_PG_BIN || "D:/Jianlian/_bitrefill_v13_local_pg/portable/pgsql/bin";
const runId = randomUUID().replaceAll("-", ""), data = path.join(out, "pg-" + runId, "data").replaceAll("\\", "/");
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP)$/i.test(k)));
let port, started = false, testedSQLSha256;
const checks = [], errors = [], q = (x) => "'" + String(x).replaceAll("'", "''") + "'";
function tool(name, args, input, fail = false) {
  const r = cp.spawnSync(path.join(bin, name + ".exe"), args, { env, input, encoding: "utf8", windowsHide: true, timeout: 45000, maxBuffer: 8 * 1024 ** 2 });
  if (r.status && !fail) throw Object.assign(Error(name + "_FAILED"), { detail: r.stderr });
  return r;
}
function sql(text, { role = null, fail = false } = {}) {
  assert.ok(started, "OWNED_INSTANCE_REQUIRED");
  return tool("psql", ["-X", "-qAt", "-w", "-h", "127.0.0.1", "-p", String(port), "-U", "scanner_test_owner", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    `set statement_timeout='10s';set lock_timeout='2s';${role ? `set role ${role};set request.jwt.claim.role=${q(role)};` : ""}` + text, fail);
}
const value = (s, opts) => sql(s, opts).stdout.trim();
const json = (s, opts) => JSON.parse(value(s, opts));
function pass(name, condition = true) { assert.ok(condition, name); checks.push(name); console.log(name + "=PASS"); }
const ident = (x) => { assert.match(x, /^[a-z_][a-z0-9_]*$/); return '"' + x + '"'; };
function load(file, deps) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = { exports: {} }, require = createRequire(import.meta.url);
  new Function("require", "module", "exports", code)((name) => {
    if (name === "server-only") return {};
    if (name === "node:crypto") return require(name);
    assert.ok(name in deps, "UNEXPECTED_MODULE_" + name); return deps[name];
  }, m, m.exports);
  return m.exports;
}
const names = ["RECHARGE_BEP20_SCANNER_MODE", "BSC_RPC_URL", "BSC_CHAIN_ID", "BSC_USDT_CONTRACT", "BSC_USDT_DECIMALS", "BSC_REQUIRED_CONFIRMATIONS", "RECHARGE_BEP20_MAX_BLOCKS_PER_RUN", "RECHARGE_BEP20_LOG_CHUNK_SIZE", "RECHARGE_BEP20_RPC_URL", "RECHARGE_BEP20_BLOCKMACHINE_API_KEY"];
const savedEnv = names.map((n) => process.env[n]);
const token = "0x" + "11".repeat(20), receiver = "0x" + "22".repeat(20), sender = "0x" + "33".repeat(20);
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
let baseTime, head, logs, ranges, fault, headerCalls, rpcCalls, addDuringRead, reorg;
const hex = (n) => "0x" + BigInt(n).toString(16), hash = (n) => "0x" + BigInt(n).toString(16).padStart(64, "0");
const iso = (second) => new Date(second * 1000).toISOString();
const block = (n) => ({ number: hex(n), timestamp: hex(baseTime + Number(n)), hash: hash(n + (reorg && Number(n) === 1000 ? 1 : 0)) });
const log = (n, raw = 1n * 10n ** 18n, tx = 4000, index = 0) => ({ address: token, topics: [transferTopic, "0x" + sender.slice(2).padStart(64, "0"), "0x" + receiver.slice(2).padStart(64, "0")], data: hex(raw), transactionHash: hash(tx), logIndex: hex(index), blockNumber: hex(n), blockHash: hash(n) });
function reset() {
  sql("truncate public.account_recharge_order_scan_progress,public.account_recharge_order_scan_waivers,public.account_recharge_bep20_scan_events,public.account_recharge_chain_claims,public.bep20_transaction_usage_registry,public.recharge_review_events,public.balance_transactions,public.chain_payment_sessions,public.account_recharge_amount_reservations,public.account_recharges,public.profiles,auth.users,public.orders cascade;");
  baseTime = Math.floor(Date.now() / 1000) - 2000; head = 2000; logs = []; ranges = []; fault = null; headerCalls = rpcCalls = 0; addDuringRead = null; reorg = false;
  sql(`update public.account_recharge_order_scan_control set mode='order_driven',activated_at=${q(iso(baseTime - 100))},lease_token=null,lease_until=null;`);
}
function createOrder({ created = 100, amount = 1, expires = created + 900, status = "waiting_payment" } = {}) {
  const id = randomUUID(), user = randomUUID(), no = "TEST-ORDER-SCAN-" + id;
  sql(`insert into auth.users(id) values(${q(user)});insert into public.profiles(id,balance) values(${q(user)},0);
  insert into public.account_recharges(id,recharge_no,user_id,channel,channel_code,currency,settlement_currency,requested_cny_amount,expected_usdt_amount,payment_address,payment_token_contract,status,created_at,expires_at,locked_market_rate,locked_settlement_rate,rate_source,rate_effective_date,rate_effective_at,rate_locked_at)
  values(${q(id)},${q(no)},${q(user)},'usdt_bep20','usdt_bep20','CNY','USDT',10,${amount},${q(receiver)},${q(token)},${q(status)},${q(iso(baseTime + created))},${q(iso(baseTime + expires))},7,7,'SYNTHETIC',current_date,now(),now());
  insert into public.account_recharge_amount_reservations(payment_address,expected_usdt_amount,recharge_id,reserved_at,expires_at,quarantine_until)
  values(${q(receiver)},${amount},${q(id)},${q(iso(baseTime + created))},${q(iso(baseTime + expires))},${q(iso(baseTime + expires + 86400))});`);
  return { id, user, no };
}
function makeScanner() {
  const transport = load("lib/recharges/bep20-scanner-rpc.ts", {});
  let clock = 0;
  const request = transport.createScannerRpcTransport({ now: () => clock, sleep: async (n) => { clock += n; }, timeoutMs: 25,
    fetch: async (_url, init) => {
      rpcCalls++;
      const { method, params } = JSON.parse(init.body);
      if (fault && fault !== "out_of_range" && method === "eth_getLogs") {
        if (fault === "timeout") return new Promise(() => {});
        return new Response(JSON.stringify({ error: { code: fault === 429 ? -32029 : -32602 } }), { status: fault });
      }
      let result;
      if (method === "eth_chainId") result = "0x38";
      else if (method === "eth_call") result = "0x12";
      else if (method === "eth_blockNumber") result = hex(head);
      else if (method === "eth_getBlockByNumber") { headerCalls++; result = block(Number(BigInt(params[0]))); }
      else if (method === "eth_getLogs") {
        const [filter] = params, from = Number(BigInt(filter.fromBlock)), to = Number(BigInt(filter.toBlock));
        ranges.push([from, to]);
        if (addDuringRead) { const run = addDuringRead; addDuringRead = null; run(); }
        result = logs.filter((l) => Number(BigInt(l.blockNumber)) >= from && Number(BigInt(l.blockNumber)) <= to);
        if(fault === "out_of_range") result=logs;
      } else throw Error("UNEXPECTED_RPC_METHOD");
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    },
  });
  const service = {
    from(table) {
      assert.equal(table, "payment_channels", "old cursor table must never be touched");
      const chain = { select() { return this; }, or() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { public_config: { token_contract: token, payment_address: receiver } }, error: null }; } };
      return chain;
    },
    async rpc(name, args) {
      assert.ok(["lease_recharge_order_scan_v1", "apply_recharge_order_scan_chunk_v1", "release_recharge_order_scan_v1"].includes(name));
      const argSql = Object.entries(args).map(([k, v]) => `${ident(k)} => ${v === null ? "null" : Array.isArray(v) ? q(JSON.stringify(v)) + "::jsonb" : typeof v === "boolean" ? String(v) : typeof v === "number" ? String(v) : q(v)}`).join(",");
      const r = sql(`select public.${ident(name)}(${argSql});`, { role: "service_role", fail: true });
      return r.status ? { data: null, error: { code: "SYNTHETIC_SQL_ERROR", detail: r.stderr } } : { data: r.stdout.trim() ? JSON.parse(r.stdout.trim()) : null, error: null };
    },
  };
  return load("lib/recharges/bep20-recharge-scanner.ts", {
    "@/lib/supabase/service-role": { getSupabaseServiceRoleClient: () => service },
    "@/lib/email/recharge-success": { queueRechargeSuccessEmailBestEffort: async () => {} },
    "@/lib/recharges/bep20-scanner-rpc": { ...transport, requestScannerRpc: request },
    "@/lib/recharges/bep20-order-scan-planner": load("lib/recharges/bep20-order-scan-planner.ts", {}),
  }).scanRechargeBep20Transfers;
}
const balance = () => Number(value("select coalesce(sum(balance),0) from public.profiles"));
try {
  pass("DISK_RESERVE_4GIB", fs.statfsSync(out).bavail * fs.statfsSync(out).bsize > 4 * 1024 ** 3);
  pass("PG17_VERSION", /17\.11/.test(tool("postgres", ["--version"]).stdout));
  const listener = createServer(); await new Promise((r) => listener.listen(0, "127.0.0.1", r)); port = listener.address().port; await new Promise((r) => listener.close(r));
  fs.mkdirSync(path.dirname(data), { recursive: true });
  tool("initdb", ["-D", data, "-U", "scanner_test_owner", "--auth=trust", "--encoding=UTF8", "--locale=C"]);
  fs.appendFileSync(path.join(data, "postgresql.auto.conf"), `listen_addresses='127.0.0.1'\nport=${port}\nmax_connections=8\nshared_buffers='16MB'\nwork_mem='1MB'\nmaintenance_work_mem='8MB'\ntemp_file_limit='16MB'\nmax_worker_processes=0\nmax_parallel_workers=0\nautovacuum=off\nlog_statement='none'\nlogging_collector=off\njit=off\n`);
  const start = cp.spawnSync(path.join(bin, "pg_ctl.exe"), ["-D", data, "-l", path.join(out, "postgres-" + runId + ".log"), "-w", "start"], { env, windowsHide: true, stdio: "ignore", timeout: 30000 });
  assert.equal(start.status, 0); started = true;
  pass("CLUSTER_IDENTITY", value("select replace(current_setting('data_directory'),'\\','/')||'|'||host(inet_server_addr())") === data + "|127.0.0.1");
  sql("create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth to service_role,anon,authenticated;create table public.orders(id uuid primary key);create table public.order_payments(id uuid primary key);create table public.payment_sessions(id uuid primary key);");
  for (const name of [...new Set(schema.tables.map((t) => t.name))]) {
    const columns = schema.tables.filter((c) => c.name === name).map((c) => {
      const type = contract.types.find((t) => t.table === name && t.column === c.column).type;
      return `${ident(c.column)} ${type}${c.default ? " default " + c.default : ""}${c.nullable === "NO" ? " not null" : ""}`;
    });
    sql(`create table public.${ident(name)}(${columns.join(",")});alter table public.${ident(name)} enable row level security;grant all on public.${ident(name)} to service_role;`);
  }
  for (const type of ["p", "u", "c", "f"]) for (const c of contract.constraints.filter((c) => c.type === type)) sql(`alter table public.${ident(c.table)} add constraint ${ident(c.name)} ${c.definition};`);
  for (const index of contract.indexes) {
    const r = sql(index + ";", { fail: true });
    if (r.status && !r.stderr.includes("already exists")) throw Object.assign(Error("INDEX_RESTORE_FAILED"), { detail: r.stderr });
  }
  for (const t of contract.triggers) sql(t.function + ";" + t.trigger + ";");
  const expected = { credit_auto_matched_account_recharge_bep20_v3: "09f9894d55b4e11bbd99bdcdbac8ac17", match_account_recharge_bep20_fingerprint_v2: "ae16cfeccc3a33e14f5a44370c6f7039", match_and_credit_account_recharge_bep20_v3: "1f4307c0e21af6086b2d1721c37829e8" };
  for (const f of schema.functions) { assert.equal(f.md5, expected[f.name]); sql(f.definition + ";"); }
  sql("revoke all on all functions in schema public from public,anon,authenticated;grant execute on all functions in schema public to service_role;");
  pass("TEST_FINANCIAL_FUNCTIONS_MATCH_PRODUCTION_READONLY_FINGERPRINTS", schema.functions.length === 3);
  const financialBody=value("select md5(prosrc) from pg_proc where pronamespace='public'::regnamespace and proname='match_and_credit_account_recharge_bep20_v3'");
  sql(`insert into public.account_recharge_bep20_scan_state(scanner_key,chain_id,token_contract,receive_address,last_scanned_block) values('SYNTHETIC_OLD_GLOBAL',56,${q(token)},${q(receiver)},129397868);`);
  const candidateSQL=fs.readFileSync(path.join(root, "ops/recharge-order-scan-v1.sql"), "utf8");
  testedSQLSha256=createHash("sha256").update(candidateSQL).digest("hex");
  sql(candidateSQL);
  pass("CANDIDATE_SQL_INSTALLED_LOCAL_TEST_ONLY");
  pass("ORIGINAL_FINANCIAL_CORE_BODY_VERBATIM",value("select md5(prosrc) from pg_proc where pronamespace='recharge_scanner_private'::regnamespace and proname='match_and_credit_account_recharge_bep20_v3'")===financialBody);
  pass("SERVICE_ROLE_CANNOT_AUTHORIZE_WAIVER",sql("insert into public.account_recharge_order_scan_waivers(recharge_id,evidence_reference) values(gen_random_uuid(),'UNAUTHORIZED_SYNTHETIC_ATTEMPT')",{role:"service_role",fail:true}).status!==0);
  for (const role of ["anon", "authenticated"]) {
    pass(role + "_PROGRESS_DENIED", sql("select * from public.account_recharge_order_scan_progress", { role, fail: true }).status !== 0);
    pass(role + "_LEASE_RPC_DENIED", sql(`select public.lease_recharge_order_scan_v1(${q(receiver)},${q(token)},false)`, { role, fail: true }).status !== 0);
  }
  Object.assign(process.env, { RECHARGE_BEP20_SCANNER_MODE: "order_driven", BSC_RPC_URL: "https://legacy.invalid", BSC_CHAIN_ID: "56", BSC_USDT_CONTRACT: token, BSC_USDT_DECIMALS: "18", BSC_REQUIRED_CONFIRMATIONS: "12", RECHARGE_BEP20_MAX_BLOCKS_PER_RUN: "1500", RECHARGE_BEP20_LOG_CHUNK_SIZE: "50", RECHARGE_BEP20_RPC_URL: "https://rpc-bsc.blockmachine.io" });
  delete process.env.RECHARGE_BEP20_BLOCKMACHINE_API_KEY;
  reset(); let scan = makeScanner();
  let result = await scan(); pass("ZERO_ORDERS_NO_RPC_NO_GETLOGS", ranges.length === 0 && rpcCalls === 0 && result.idleReason === "NO_OPEN_WINDOWS");
  const order = createOrder(); logs = [log(200)];
  result = await scan(); pass("NEW_ORDER_STARTS_SCAN_AND_CREDITS_ATOMICALLY", result.credited === 1 && balance() === 10);
  pass("ALL_PAID_STOP_LOG_READS_WITHIN_SAME_RUN", ranges.length === 3);
  pass("FIFTEEN_MINUTE_EXPIRY", value(`select extract(epoch from expires_at-created_at) from public.account_recharges where id=${q(order.id)}`) === "900.000000");
  const count = rpcCalls; await makeScanner()(); pass("PAID_ORDER_RESTART_RETURNS_IDLE", rpcCalls === count);
  reset(); createOrder(); logs = [log(999)]; head = 1005; scan = makeScanner();
  await scan(); pass("PRE_EXPIRY_UNCONFIRMED_PAYMENT_NOT_PREMATURELY_CREDITED", balance() === 0);
  head = 1020; result = await makeScanner()(); pass("PRE_EXPIRY_PAYMENT_LATE_CONFIRMATION_CREDITED", result.credited === 1 && balance() === 10);
  reset(); createOrder(); logs = [log(1001)]; await makeScanner()(); pass("POST_EXPIRY_PAYMENT_NOT_CREDITED", balance() === 0);
  const previousCalls = rpcCalls; await makeScanner()(); pass("EXPIRED_CONFIRMED_WINDOW_RETIRES_NO_INFINITE_SCAN", rpcCalls === previousCalls);
  reset();createOrder();logs=[log(1999)];fault="out_of_range";await assert.rejects(makeScanner()());pass("OUT_OF_RANGE_UNCONFIRMED_EVIDENCE_NO_CREDIT",balance()===0);
  reset(); createOrder(); createOrder({ amount: 2 }); logs = [log(200), log(210, 2n * 10n ** 18n, 4001)]; result = await makeScanner()();
  pass("MULTI_ORDER_BOTH_CREDITED", result.credited === 2 && balance() === 20);
  pass("OVERLAPPING_WINDOWS_QUERY_EACH_BLOCK_ONCE", new Set(ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))).size === ranges.reduce((n, [a, b]) => n + b - a + 1, 0));
  reset();createOrder();createOrder({created:700,amount:2});logs=[log(200),log(800,2n*10n**18n,4050)];result=await makeScanner()();
  pass("RETIRED_EARLY_ORDER_SKIPS_UNUSED_GAP_BEFORE_LATER_ORDER",result.credited===2&&balance()===20&&!ranges.some(([a])=>a>=250&&a<700));
  reset(); createOrder(); logs = [log(200)];
  const collision = randomUUID();
  sql(`insert into public.orders(id) values(${q(collision)});insert into public.chain_payment_sessions(order_id,token_contract,expected_amount,expected_raw_amount,receive_address,created_at,expires_at) values(${q(collision)},${q(token)},1,1000000000000000000,${q(receiver)},${q(iso(baseTime+100))},${q(iso(baseTime+1000))});`);
  result = await makeScanner()(); pass("ORDER_RECHARGE_AMOUNT_COLLISION_REFUSES_CREDIT", result.ambiguous === 1 && balance() === 0);
  for (const failure of [403, 429, 503, "timeout"]) {
    reset(); createOrder(); fault = failure; await assert.rejects(makeScanner()());
    pass("RPC_" + failure + "_NO_PROGRESS_OR_CREDIT", value("select count(*) from public.account_recharge_order_scan_progress") === "0" && balance() === 0);
  }
  reset(); createOrder(); logs = [log(200), log(200)]; result = await makeScanner()();
  pass("DUPLICATE_LOG_REAL_SQL_ONE_LEDGER", balance() === 10 && value("select count(*) from public.balance_transactions") === "1" && result.alreadyCredited === 1);
  reset(); createOrder(); logs = [log(200)];
  sql("create function public.fail_progress_test() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_PROGRESS_FAILURE';end$$;create trigger synthetic_fail_progress before insert on public.account_recharge_order_scan_progress for each row execute function public.fail_progress_test();");
  await assert.rejects(makeScanner()()); pass("CHUNK_TRANSACTION_PROGRESS_FAILURE_ROLLS_BACK_CREDIT", balance() === 0 && value("select count(*) from public.balance_transactions") === "0");
  sql("drop trigger synthetic_fail_progress on public.account_recharge_order_scan_progress;drop function public.fail_progress_test();");
  result = await makeScanner()(); pass("RESTART_REPLAYS_UNCOMMITTED_CHUNK_ONCE", result.credited === 1 && balance() === 10);
  reset(); createOrder(); head = 450; logs = []; await makeScanner()();
  const last = Number(value("select last_scanned_block from public.account_recharge_order_scan_progress"));
  createOrder({ created: 400, amount: 2 }); head = 600; ranges = []; await makeScanner()();
  pass("NEW_ORDER_INSERTION_NOT_HIDDEN_BY_SHARED_CURSOR", ranges.some(([a, b]) => a <= 400 && b >= 400) && last > 400);
  reset(); createOrder(); logs = [log(200,2n*10n**18n,4500)]; addDuringRead=()=>createOrder({created:200,amount:2});
  result=await makeScanner()();pass("ORDER_CREATED_DURING_READ_NOT_CLAIMED_BY_OLD_SNAPSHOT",balance()===0);
  result=await makeScanner()();pass("CONCURRENT_NEW_ORDER_RECOVERED_FROM_ITS_OWN_START",result.credited===1&&balance()===10);
  reset(); const old = createOrder({ created: -200000 }); result = await makeScanner()(); pass("UNPROVEN_LEGACY_ORDER_REPORTED_NOT_WAIVED", result.blockedHistory === 1 && ranges.length === 0 && rpcCalls === 0);
  sql(`insert into public.account_recharge_order_scan_waivers(recharge_id,evidence_reference) values(${q(old.id)},'SYNTHETIC_ONLY_APPROVED_FIXTURE_NOT_PRODUCTION_WAIVER');`);
  result = await makeScanner()(); pass("EXACT_ID_SYNTHETIC_WAIVER_SKIPS_OLD_BACKFILL", result.blockedHistory === 0 && rpcCalls === 0);
  pass("OLD_GLOBAL_CURSOR_UNCHANGED", value("select last_scanned_block from public.account_recharge_bep20_scan_state where scanner_key='SYNTHETIC_OLD_GLOBAL'") === "129397868");
  const denied = sql(`select public.match_and_credit_account_recharge_bep20_v3(56,${q(hash(9999))},0,200,${q(hash(200))},now(),${q(token)},${q(sender)},${q(receiver)},1,1,12)`, { role: "service_role", fail: true });
  pass("LEGACY_SCANNER_FINANCIAL_ENTRY_DISABLED_IN_ORDER_MODE", denied.status !== 0 && denied.stderr.includes("LEGACY_SCANNER_DISABLED"));
  reset(); createOrder(); const lease = json(`select public.lease_recharge_order_scan_v1(${q(receiver)},${q(token)},false)`, { role: "service_role" });
  pass("SECOND_RUNNER_LEASE_REFUSED", sql(`select public.lease_recharge_order_scan_v1(${q(receiver)},${q(token)},false)`, { role: "service_role", fail: true }).status !== 0);
  sql(`select public.release_recharge_order_scan_v1(${q(lease.token)})`, { role: "service_role" });
  pass("LEASE_RELEASE_RESTORES_ELIGIBILITY", json(`select public.lease_recharge_order_scan_v1(${q(receiver)},${q(token)},true)`, { role: "service_role" }).windows.length === 1);
  const newer=json(`select public.lease_recharge_order_scan_v1(${q(receiver)},${q(token)},false)`,{role:"service_role"});
  sql(`select public.release_recharge_order_scan_v1(${q(lease.token)})`,{role:"service_role"});
  pass("STALE_RELEASE_CANNOT_CLEAR_NEW_LEASE",value("select lease_token from public.account_recharge_order_scan_control")===newer.token);
  sql("update public.account_recharge_order_scan_control set lease_until=now()-interval '1 second'");
  pass("EXPIRED_LEASE_CANNOT_WRITE_PROGRESS",sql(`select public.apply_recharge_order_scan_chunk_v1(${q(newer.token)},'[]','[]',56,${q(token)},${q(receiver)},now())`,{role:"service_role",fail:true}).status!==0);
} catch (e) { errors.push({ type: e.name, code: e.message, detail: e.detail ?? null }); console.log(JSON.stringify(errors.at(-1))); process.exitCode = 1; }
finally {
  names.forEach((n, i) => { if (savedEnv[i] === undefined) delete process.env[n]; else process.env[n] = savedEnv[i]; });
  if (started) { tool("pg_ctl", ["-D", data, "-w", "stop", "-m", "fast"]); started = false; }
  const result = { at: new Date().toISOString(), sourceProject: "czuoivbfxzachiobdohw", database: "OWNED_LOOPBACK_PG17_TEST_METADATA_CLONE", checks, passed: checks.length, errors, instanceStopped: !started, data, port, testOnly: true, productionWrites: false, externalAuthOrderPaymentTables: "ID_ONLY_STUBS",testedSQLSha256,functionsSha256: createHash("sha256").update(JSON.stringify(schema.functions)).digest("hex") };
  fs.writeFileSync(path.join(out, "database-test-" + runId + ".json"), JSON.stringify(result, null, 2), { flag: "wx" });
  console.log("RESULT=" + JSON.stringify({ passed: result.passed, failures: errors.length, instanceStopped: result.instanceStopped }));
}
