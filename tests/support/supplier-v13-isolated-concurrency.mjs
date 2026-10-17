// LOCAL DISPOSABLE POSTGRES ONLY. No supplier HTTP calls or existing Test DB.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const host = process.env.V13_PGHOST;
const port = process.env.V13_PGPORT;
const db = process.env.V13_PGDATABASE;
const user = process.env.V13_PGUSER;
const psql = process.env.V13_PSQL_PATH;
const dataDirectory = process.env.V13_EXPECTED_DATA_DIRECTORY;

assert.equal(host, "127.0.0.1", "V13_LOCAL_LOOPBACK_ONLY");
assert.match(port ?? "", /^\d{4,5}$/);
assert.ok(["jianlian_bitrefill_v13_test", "jianlian_bitrefill_v13_db2"].includes(db),
  "V13_DISPOSABLE_DB_ONLY");
assert.ok(user && psql && dataDirectory && process.env.PGPASSWORD,
  "V13_LOCAL_CONNECTION_CONFIGURATION_REQUIRED");
assert.match(resolve(dataDirectory).toLowerCase(), /[\\/]_bitrefill_v13_local_pg[\\/]data$/);

function query(sql) {
  return new Promise((resolveQuery, rejectQuery) => {
    const child = spawn(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", port,
      "-U", user, "-d", db, "-Atqc", sql], { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (value) => { stdout += value; });
    child.stderr.setEncoding("utf8").on("data", (value) => { stderr += value; });
    child.on("error", rejectQuery);
    child.on("close", (code) => code === 0
      ? resolveQuery(stdout.trim())
      : rejectQuery(new Error(`LOCAL_PSQL_FAILED(${code}): ${stderr.trim()}`)));
  });
}

const identity = await query("select current_setting('data_directory')");
assert.equal(resolve(identity).toLowerCase(), resolve(dataDirectory).toLowerCase(),
  "V13_LOCAL_INSTANCE_IDENTITY_MISMATCH");

const key = `v13-concurrent-${randomUUID()}`;
const hash = "e".repeat(64);
const claim = `with claimed as (
  insert into public.supplier_purchase_attempts(supplier,logical_request_key,semantic_request_hash)
  values ('bitrefill','${key}','${hash}')
  on conflict (supplier,logical_request_key) do nothing returning id
) select count(*) from claimed`;
const first = query(`begin; ${claim}; select pg_sleep(2); commit`);
await delay(250);
const second = query(`begin; ${claim}; commit`);
const [firstClaim, secondClaim] = await Promise.all([first, second]);
assert.equal(Number(firstClaim.split(/\s+/)[0]) + Number(secondClaim.split(/\s+/)[0]), 1,
  "CONCURRENT_LOGICAL_CLAIM_NOT_UNIQUE");
assert.equal(await query(`select count(*) from public.supplier_purchase_attempts where logical_request_key='${key}'`), "1");

const submit = `with transitioned as (
  update public.supplier_purchase_attempts set status='SUBMITTING',submit_started_at=now()
  where logical_request_key='${key}' and status='CLAIMED' returning id
) select count(*) from transitioned`;
const firstSubmit = query(`begin; ${submit}; select pg_sleep(2); commit`);
await delay(250);
const secondSubmit = query(`begin; ${submit}; commit`);
const [firstState, secondState] = await Promise.all([firstSubmit, secondSubmit]);
assert.equal(Number(firstState.split(/\s+/)[0]) + Number(secondState.split(/\s+/)[0]), 1,
  "CONCURRENT_SUBMIT_TRANSITION_NOT_UNIQUE");

await query(`update public.supplier_purchase_attempts set status='UNCERTAIN'
  where logical_request_key='${key}' and status='SUBMITTING'`);
assert.equal(await query(`select status from public.supplier_purchase_attempts where logical_request_key='${key}'`),
  "UNCERTAIN", "POST_SUBMIT_UNCERTAIN_NOT_DURABLE");

const reconcileKey = `v13-reconcile-${randomUUID()}`;
await query(`insert into public.supplier_purchase_attempts
  (supplier,logical_request_key,semantic_request_hash,status,submit_started_at,external_invoice_id)
  values('bitrefill','${reconcileKey}','${"f".repeat(64)}','EXTERNAL_CREATED',now(),'${reconcileKey}')`);
const reconcile = `with transitioned as (
  update public.supplier_purchase_attempts set status='RECONCILING'
  where logical_request_key='${reconcileKey}' and status='EXTERNAL_CREATED' returning id
) select count(*) from transitioned`;
const firstReconcile = query(`begin; ${reconcile}; select pg_sleep(2); commit`);
await delay(250);
const secondReconcile = query(`begin; ${reconcile}; commit`);
const [firstRec, secondRec] = await Promise.all([firstReconcile, secondReconcile]);
assert.equal(Number(firstRec.split(/\s+/)[0]) + Number(secondRec.split(/\s+/)[0]), 1,
  "CONCURRENT_RECONCILE_TRANSITION_NOT_UNIQUE");

const fingerprint = randomUUID().replaceAll("-", "").padEnd(64, "0");
await query(`insert into public.supplier_webhook_receipts(supplier,event_fingerprint)
  select 'bitrefill','${fingerprint}' from generate_series(1,100)
  on conflict (supplier,event_fingerprint) do nothing`);
assert.equal(await query(`select count(*) from public.supplier_webhook_receipts
  where supplier='bitrefill' and event_fingerprint='${fingerprint}'`), "1",
"WEBHOOK_REPLAY_NOT_DEDUPED");

console.log("V13_ISOLATED_CONCURRENCY_PRIMITIVES_PASS");
