// Disposable synthetic PostgreSQL harness. No migrations are read or executed.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile, readFile, statfs } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { emptyMockState } from "./support/bitrefill-mock-store.mjs";
import { runMockHttpCases } from "../tests/support/bitrefill-mock-http-cases.mjs";
import { runMappingV4Cases, runAftercareHttpCases } from "../tests/support/bitrefill-mapping-v4-cases.mjs";
import { runUnifiedBindingCases } from "../tests/support/bitrefill-binding-v5-fixture.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const binaryRoot = resolve(process.argv[2] ?? "D:/Jianlian/_bitrefill_v13_local_pg/portable/pgsql/bin");
const evidenceRoot = resolve(process.argv[3] ?? "D:/Jianlian/_bitrefill_mock_supplier_v2_20261025");
assert.ok(evidenceRoot.startsWith("D:\\Jianlian\\_") || evidenceRoot.startsWith("D:/Jianlian/_"));
await mkdir(evidenceRoot, { recursive: true });
const disk = await statfs(evidenceRoot); assert.ok(disk.bavail * disk.bsize > 4 * 1024 ** 3, "DISK_HEADROOM_REQUIRED");
const runDir = await mkdtemp(join(evidenceRoot, "pg-synthetic-")), dataDir = join(runDir, "data");
const binary = (name) => join(binaryRoot, `${name}${process.platform === "win32" ? ".exe" : ""}`);
function exec(name, args, input, ignore = false) {
  return new Promise((ok, fail) => {
    // Child-process allowlist only; does not modify the parent/user environment.
    // In particular no real libpq service/password or supplier key is inherited.
    const childEnvironment = Object.fromEntries(Object.keys(process.env).filter((key) =>
      /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP)$/i.test(key)).map((key) => [key, process.env[key]]));
    const child = spawn(binary(name), args, { windowsHide: true, env: childEnvironment,
      stdio: ignore ? "ignore" : ["pipe", "pipe", "pipe"] });
    let output = "", error = "", bytes = 0;
    const timer = setTimeout(() => { child.kill(); fail(new Error(`MOCK_${name}_TIME_LIMIT`)); }, 120000);
    child.stdout?.on("data", (chunk) => { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) child.kill(); else output += chunk; });
    child.stderr?.on("data", (chunk) => { error += chunk; });
    child.once("error", (e) => { clearTimeout(timer); fail(e); });
    child.once("close", (code) => { clearTimeout(timer); code === 0 ? ok(output.trim()) : fail(new Error(`MOCK_${name}_FAILED:${error.slice(0, 300)}`)); });
    if (child.stdin) { child.stdin.on("error", () => {}); child.stdin.end(input ?? ""); }
  });
}
const reserve = createServer(); await new Promise((ok) => reserve.listen(0, "127.0.0.1", ok));
const port = reserve.address().port; await new Promise((ok) => reserve.close(ok));
let started = false, result;
let sqlUser = "mock_synthetic_only";
const sql = (statement) => exec("psql", ["-X", "-q", "-A", "-t", "-w", "-h", "127.0.0.1", "-p", String(port), "-U", sqlUser, "-d", "postgres", "-v", "ON_ERROR_STOP=1"], statement);
try {
  assert.match(await exec("postgres", ["--version"]), /17\.11/);
  await exec("initdb", ["-D", dataDir, "-U", "mock_synthetic_only", "--auth=trust", "--encoding=UTF8", "--locale=C"]);
  await writeFile(join(dataDir, "postgresql.auto.conf"), `listen_addresses='127.0.0.1'\nport=${port}\nmax_connections=16\nshared_buffers='16MB'\nwork_mem='1MB'\nmaintenance_work_mem='8MB'\ntemp_file_limit='16MB'\nmax_worker_processes=0\nmax_parallel_workers=0\nautovacuum=off\nlogging_collector=off\nlog_statement='none'\njit=off\n`);
  // pg_ctl children must not inherit pipes held open by the server.
  await exec("pg_ctl", ["-D", dataDir, "-l", join(runDir, "postgres.log"), "-w", "start"], null, true); started = true;
  const sessions = await Promise.all([sql("select pg_backend_pid() from pg_sleep(0.1)"), sql("select pg_backend_pid() from pg_sleep(0.1)")]);
  assert.equal(new Set(sessions).size, 2);
  // Entirely independent mock fixture. This does not install DB9 or claim to test
  // DB9 table constraints, SECURITY DEFINER functions or Production RLS contracts.
  await sql("create schema mock_supplier_v2; revoke all on schema mock_supplier_v2 from public; create table mock_supplier_v2.state(id int primary key check(id=1), revision bigint not null, body jsonb not null); revoke all on mock_supplier_v2.state from public;");
  const literal = (value) => `convert_from(decode('${Buffer.from(JSON.stringify(value)).toString("hex")}','hex'),'UTF8')::jsonb`;
  await sql(`insert into mock_supplier_v2.state values(1,0,${literal(emptyMockState())})`);
  await sql("create role mock_app login nosuperuser nocreatedb nocreaterole; grant usage on schema mock_supplier_v2 to mock_app; grant select,update on mock_supplier_v2.state to mock_app; revoke create on schema public from public; alter role mock_app set statement_timeout='5s';");
  sqlUser = "mock_app";
  const backend = { kind: "PostgreSQL17.11_mock_fixture_CAS",
    async read() { return JSON.parse(await sql("select body::text from mock_supplier_v2.state where id=1")); },
    async transact(fn) {
      for (let retry = 0; retry < 100; retry++) {
        const row = JSON.parse(await sql("select json_build_object('revision',revision,'body',body)::text from mock_supplier_v2.state where id=1"));
        const value = fn(row.body);
        const committed = await sql(`update mock_supplier_v2.state set revision=revision+1,body=${literal(row.body)} where id=1 and revision=${row.revision} returning revision`);
        if (committed) return value;
      }
      throw new Error("MOCK_CAS_CONTENTION_LIMIT");
    } };
  result = await runMockHttpCases({ backend, root });
  const snapshot = await backend.read();
  assert.ok(snapshot.privateDeliveries.every((r) => r.content.code.startsWith("MOCK-CARD-")));
  assert.equal(await sql("select count(*) from pg_namespace where nspname='supabase_migrations'"), "0");
  result = { ...result, independentPostgresSessions: sessions.length, migrationExecuted: false,
    balancesSynthetic: true, realCredentialsUsed: false, runDir };
  if (process.argv.includes("--with-mapping-v4")) {
    result.mappingV4 = await runMappingV4Cases(backend);
    result.aftercareV4 = await runAftercareHttpCases(backend);
  }
  if (process.argv.includes("--with-binding-v5")) result.unifiedBindingV5 = await runUnifiedBindingCases(backend);
} finally {
  if (started || await readFile(join(dataDir, "postmaster.pid"), "utf8").catch(() => null)) {
    await exec("pg_ctl", ["-D", dataDir, "-w", "stop", "-m", "fast"], null, true);
  }
}
result.instanceStopped = true;
await writeFile(join(runDir, "result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
