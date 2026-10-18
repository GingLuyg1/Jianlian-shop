// Explicit opt-in. No remote URL, business Test credentials or supplier key used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

assert.ok(process.argv.includes("--local-pinned"), "RC1_EXPLICIT_LOCAL_OPT_IN_REQUIRED");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const local = "D:/Jianlian/_bitrefill_v13_local_pg";
const expectedSha = "90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0";
assert.equal(createHash("sha256").update(readFileSync(resolve(root,
  "supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql"))).digest("hex"), expectedSha);
const seconds = Number(process.argv.find((v) => v.startsWith("--stability-seconds="))?.split("=")[1] ?? 60);
assert.ok(Number.isInteger(seconds) && seconds >= 1 && seconds <= 1800);
const env = { ...process.env };
for (const name of Object.keys(env)) {
  if (/^(?:PG|V13_|BITREFILL_|(?:NEXT_PUBLIC_)?SUPABASE_)/i.test(name) || /DATABASE_URL$/i.test(name)) delete env[name];
}
Object.assign(env, { V13_PGHOST: "127.0.0.1", V13_PGPORT: "55433", V13_PGUSER: "v13_local",
  V13_PSQL_PATH: `${local}/portable/pgsql/bin/psql.exe`,
  V13_EXPECTED_DATA_DIRECTORY: `${local}/data`,
  PGPASSWORD: readFileSync(`${local}/initdb-password.txt`, "utf8").trim() });
// Generated test output outside Git, not a source/config or secret file.
const log = `${local}/rc1-local-acceptance.log`;
function output(part) { process.stdout.write(part); appendFileSync(log, part); }
async function run(script, args) {
  output(`RC1_STAGE=${script}\n`);
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, env,
      shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => { child.kill(); rejectRun(new Error("RC1_CHILD_TIMEOUT")); },
      (seconds + 1800) * 1000);
    child.stdout.on("data", (part) => output(part.toString()));
    child.stderr.on("data", (part) => output(part.toString()));
    child.on("error", (error) => { clearTimeout(timer); rejectRun(error); });
    child.on("close", (code) => { clearTimeout(timer);
      if (code === 0) resolveRun(); else rejectRun(new Error(`RC1_STAGE_FAILED:${script}:${code}`)); });
  });
}
await run("tests/support/supplier-v13-db9-acl-local.mjs", ["--local-pinned", "--acl-only", "--rc1-postmigration-plan"]);
await run("tests/support/supplier-v13-db5-local-e2e.mjs",
  ["--db9-production-default-acl", "--rc1-acceptance", `--p3-stability-seconds=${seconds}`]);
await run("tests/support/supplier-v13-db7b-local-evidence.mjs", ["--db9-owner", "--rc1-preserve-manifest"]);
output(`RC1_ALL_LOCAL_POSTGRES_STAGES_PASS; MIGRATION_SHA256=${expectedSha}; PRODUCTION_READ_EXECUTED=no\n`);
