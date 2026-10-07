// CI job-local only. Every SQL statement uses psql stdin, never remote credentials.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const e = process.env;
assert.equal(e.CI, "true"); assert.equal(e.PGHOST, "127.0.0.1"); assert.equal(e.PGPORT, "54322");
assert.equal(e.PGUSER, "postgres"); assert.equal(e.PGDATABASE, "postgres");
for (const name of ["DATABASE_URL", "SUPABASE_DB_URL", "SUPABASE_ACCESS_TOKEN", "PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGOPTIONS"]) {
  assert.ok(!e[name], "FORBIDDEN_DB_OVERRIDE:" + name);
}
const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"];
function sql(text) { return execFileSync("psql", args, { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim(); }
assert.equal(sql("select identity_token from public.ci_payment_watcher_database_identity where singleton;"),
  "jianlian-payment-watcher-ephemeral-v1");
assert.equal(sql("select current_database() || '/' || current_user;"), "postgres/postgres");
const migration = readFileSync("supabase/migrations/20261007100000_snpay_late_payment_manual_review_v1.sql", "utf8");
// Load ONLY the new RPC into the disposable fixture; never run historical migrations.
sql(migration);
const uid = "10000000-0000-4000-8000-000000000001", admin = "10000000-0000-4000-8000-000000000002";
const rid = "10000000-0000-4000-8000-000000000003", sid = "10000000-0000-4000-8000-000000000004";
const second = "10000000-0000-4000-8000-000000000005";
const created = "2026-01-01T00:00:00Z", expires = "2026-01-01T00:15:00Z", paid = "2026-01-01T00:26:27Z";
const baseArgs = [`'${rid}'`,`'${sid}'`,`'${uid}'`,"'PS-CI-SNPAY-LATE'","'SN-CI-LATE'","1",`'${paid}'`,
  `'${created}'`,`'${expires}'`,`'${created}'`,`'${expires}'`,`'${admin}'`,"'verified manual exception'","'ci-review'" ];
const rpc = values => `public.complete_account_recharge_late_payment_manual_v1(${values.join(",")})`;
const call = values => `set request.jwt.claim.role='service_role'; select ${rpc(values)};`;
function concurrent(text) {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "", error = ""; child.stdout.on("data", x => { output += x; }); child.stderr.on("data", x => { error += x; });
    child.on("error", reject); child.on("close", code => code === 0 ? resolve(output.trim()) : reject(Error("CI_SQL_FAILED:" + error)));
    child.stdin.end(text);
  });
}
function rejected(setup, values = baseArgs, expected = "LATE_PAYMENT_") {
  sql(`begin; set local request.jwt.claim.role='service_role'; ${setup}
    do $$ declare v_balance numeric; v_ledgers bigint; begin
      select balance into v_balance from public.profiles where id='${uid}';
      select count(*) into v_ledgers from public.balance_transactions where business_id='RC-CI-SNPAY-LATE';
      begin perform ${rpc(values)}; raise exception 'TEST_UNEXPECTED_SUCCESS';
      exception when others then
        if position('${expected}' in sqlerrm) <> 1 then raise; end if;
      end;
      if (select balance from public.profiles where id='${uid}') <> v_balance
        or (select count(*) from public.balance_transactions where business_id='RC-CI-SNPAY-LATE') <> v_ledgers then
        raise exception 'TEST_PARTIAL_CREDIT';
      end if;
    end $$; rollback;`);
}
try {
  sql(`insert into auth.users(id,email) values ('${uid}','ci-snpay-user@example.invalid'),('${admin}','ci-snpay-admin@example.invalid');
    insert into public.profiles(id,email,balance,role) values ('${uid}','ci-snpay-user@example.invalid',28,'user'),('${admin}','ci-snpay-admin@example.invalid',0,'admin');
    insert into public.admin_users(user_id,status,admin_level) values ('${admin}','active','admin');
    insert into public.account_recharges(id,recharge_no,user_id,channel,channel_code,provider,currency,status,amount,requested_amount,payable_amount,created_at,expires_at)
      values('${rid}','RC-CI-SNPAY-LATE','${uid}','alipay','alipay','snpay','CNY','expired',1,1,1,'${created}','${expires}');
    insert into public.payment_sessions(id,session_no,business_type,business_id,business_no,user_id,channel_code,provider,currency,status,payable_amount,provider_order_no,created_at,expires_at)
      values('${sid}','PS-CI-SNPAY-LATE','recharge','${rid}','RC-CI-SNPAY-LATE','${uid}','alipay','snpay','CNY','expired',1,'SN-CI-LATE','${created}','${expires}');`);
  const unauthorized = sql(`select has_function_privilege('anon','${rpc(baseArgs).split("(")[0]}(uuid,uuid,uuid,text,text,numeric,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,uuid,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.complete_account_recharge_late_payment_manual_v1(uuid,uuid,uuid,text,text,numeric,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,uuid,text,text)','EXECUTE');`);
  assert.equal(unauthorized, "f");
  rejected("", baseArgs.map((x,i) => i===11?`'${uid}'`:x), "LATE_PAYMENT_ADMIN_REQUIRED");
  rejected("", baseArgs.map((x,i) => i===12?"''":x));
  rejected("", baseArgs.map((x,i) => i===5?"1.03":x));
  rejected("", baseArgs.map((x,i) => i===6?`'${expires}'`:x));
  rejected("", baseArgs.map((x,i) => i===6?"null":x));
  rejected("", baseArgs.map((x,i) => i===6?"'infinity'":x));
  rejected("", baseArgs.map((x,i) => i===6?"statement_timestamp()+interval '6 minutes'":x));
  rejected("", baseArgs.map((x,i) => i===4?"'OTHER'":x));
  rejected(`update public.account_recharges set provider='liuhaoyi' where id='${rid}';`);
  rejected(`update public.account_recharges set credited_amount=1 where id='${rid}';`);
  rejected(`insert into public.balance_transactions(user_id,transaction_no,business_type,business_id,direction,amount,status)
    values('${uid}','BT-CI-CONFLICT','account_recharge','RC-CI-SNPAY-LATE','credit',1,'completed');`);
  rejected(`update public.account_recharges set status='pending' where id='${rid}';`);
  rejected(`update public.account_recharges set expires_at=expires_at+interval '1 second' where id='${rid}';`);
  rejected(`update public.payment_sessions set user_id='${admin}' where id='${sid}';`);
  rejected(`update public.payment_sessions set provider_order_no=null where id='${sid}';`);
  rejected(`insert into public.payment_sessions select '${second}', 'PS-CI-OTHER',business_type,business_id,business_no,user_id,channel_code,provider,currency,requested_amount,fee_amount,payable_amount,status,'SN-CI-OTHER',null,expires_at,paid_at,last_synced_at,reconcile_status,last_error,metadata,created_at,updated_at from public.payment_sessions where id='${sid}';`);
  // Force failure AFTER profile/ledger updates: entire function must roll back.
  sql(`create function public.ci_reject_snpay_review() returns trigger language plpgsql as $$ begin raise exception 'TEST_REVIEW_FAILURE'; end $$;
    create trigger ci_reject_snpay_review before insert on public.recharge_review_events for each row execute function public.ci_reject_snpay_review();`);
  rejected("", baseArgs, "TEST_REVIEW_FAILURE");
  sql("drop trigger ci_reject_snpay_review on public.recharge_review_events; drop function public.ci_reject_snpay_review();");
  console.log("ATOMIC_ROLLBACK_AFTER_ACCOUNTING_PASS=yes");
  const responses = await Promise.all([concurrent(call(baseArgs)), concurrent(call(baseArgs))]);
  const results = responses.map(JSON.parse);
  assert.deepEqual(results.map(x => x.idempotent).sort(), [false, true]);
  assert.equal(sql(`select balance from public.profiles where id='${uid}';`), "29.00");
  assert.equal(sql("select count(*) from public.balance_transactions where business_id='RC-CI-SNPAY-LATE' and status='completed';"), "1");
  assert.equal(sql("select amount from public.balance_transactions where business_id='RC-CI-SNPAY-LATE';"), "1.000000");
  assert.equal(sql(`select count(*) from public.recharge_review_events where recharge_id='${rid}';`), "1");
  assert.equal(sql(`select status || '/' || exception_type from public.account_recharges where id='${rid}';`), "succeeded/snpay_late_payment_manual_v1");
  assert.equal(JSON.parse(sql(call(baseArgs))).idempotent, true);
  // Late callback invokes canonical completion with the SAME paid session.
  const delayed = JSON.parse(sql(`set request.jwt.claim.role='service_role';
    select public.complete_payment_session('${sid}','SN-CI-LATE',1,'CNY','${paid}');`));
  assert.equal(delayed.idempotent, true);
  assert.equal(sql(`select balance from public.profiles where id='${uid}';`), "29.00");
  assert.equal(sql("select count(*) from public.balance_transactions where business_id='RC-CI-SNPAY-LATE';"), "1");
  console.log("ATOMIC_EXACTLY_ONCE_PASS=yes\nCONCURRENT_APPROVAL_EXACTLY_ONCE_PASS=yes\nREPEAT_APPROVAL_IDEMPOTENT_PASS=yes\nDELAYED_CALLBACK_NO_DUPLICATE_PASS=yes\nEXTERNAL_FEE_CREDITED=no\nREAL_PROVIDER_REQUEST_COUNT=0");
} finally {
  sql(`delete from public.recharge_review_events where recharge_id='${rid}';
    delete from public.balance_transactions where business_id='RC-CI-SNPAY-LATE';
    delete from public.payment_sessions where id in ('${sid}','${second}');
    delete from public.account_recharges where id='${rid}';
    delete from public.admin_users where user_id='${admin}';
    delete from public.profiles where id in ('${uid}','${admin}');
    delete from auth.users where id in ('${uid}','${admin}');`);
  console.log("CI_FIXTURE_CLEANUP_PASS=yes");
}
