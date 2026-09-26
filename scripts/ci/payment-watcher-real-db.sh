#!/usr/bin/env bash
# Ephemeral CI database only. Never run against a hosted Supabase project.
set -euo pipefail

if [[ "${CI:-}" != "true" || "${PGHOST:-}" != "127.0.0.1" || "${PGPORT:-}" != "54322" ||
      "${PGUSER:-}" != "postgres" || "${PGDATABASE:-}" != "postgres" ]]; then
  echo "CI_LOCAL_POSTGRES_ONLY"
  exit 1
fi
if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" || -n "${DATABASE_URL:-}" || -n "${SUPABASE_DB_URL:-}" ]]; then
  echo "REMOTE_DATABASE_CONFIGURATION_FORBIDDEN"
  exit 1
fi
if [[ -n "${PGHOSTADDR:-}" || -n "${PGSERVICE:-}" || -n "${PGSERVICEFILE:-}" || -n "${PGOPTIONS:-}" ]]; then
  echo "LIBPQ_OVERRIDE_FORBIDDEN"
  exit 1
fi

ci_db_identity="$(psql -X -v ON_ERROR_STOP=1 -Atqc "
  select case
    when current_database() = 'postgres'
     and current_user = 'postgres'
     and to_regclass('public.ci_payment_watcher_database_identity') is not null
     and exists (
       select 1 from public.ci_payment_watcher_database_identity
       where singleton is true
         and identity_token = 'jianlian-payment-watcher-ephemeral-v1'
     )
    then 'CI_PAYMENT_WATCHER_DB_CONFIRMED'
    else 'CI_PAYMENT_WATCHER_DB_REJECTED'
  end;
")"
if [[ "$ci_db_identity" != "CI_PAYMENT_WATCHER_DB_CONFIRMED" ]]; then
  echo "CI_DATABASE_IDENTITY_UNCONFIRMED"
  exit 1
fi

task_logs="$(mktemp -d)"
cleanup() {
  local status=$?
  local cleanup_status=0
  local pid
  trap - EXIT
  while read -r pid; do
    [[ -n "$pid" ]] || continue
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  done < <(jobs -pr)
  psql -X -v ON_ERROR_STOP=1 -q <<'SQL' >/dev/null 2>&1 || cleanup_status=$?
delete from public.payment_reconciliations
where reconciliation_no like 'REC-CI-ALIPAY-%';
delete from public.balance_transactions
where business_type = 'account_recharge' and business_id like 'RC-CI-%';
delete from public.payment_sessions where session_no like 'PS-CI-%';
delete from public.account_recharges where recharge_no like 'RC-CI-%';
delete from public.profiles where email like 'ci-%@example.invalid';
delete from auth.users where email like 'ci-%@example.invalid';
SQL
  rm -r -- "$task_logs" 2>/dev/null || cleanup_status=$?
  if [[ $status -eq 0 && $cleanup_status -ne 0 ]]; then status=$cleanup_status; fi
  exit "$status"
}
trap cleanup EXIT

prepare_fixture() {
  local scenario="$1"
  local suffix="$2"
  local channel="${3:-wechat}"
  local user_id="00000000-0000-4000-8000-0000000001${suffix}"
  local recharge_id="00000000-0000-4000-8000-0000000002${suffix}"
  local session_id="00000000-0000-4000-8000-0000000003${suffix}"
  local recharge_no="RC-CI-${scenario}"
  local session_no="PS-CI-${scenario}"
  psql -X -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('$user_id','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
        'ci-${scenario}@example.invalid','',now(),now(),now());
insert into public.profiles (id,email,role,balance)
values ('$user_id','ci-${scenario}@example.invalid','user',10.00)
on conflict (id) do update set balance=10.00;
insert into public.account_recharges
  (id,recharge_no,user_id,channel,channel_code,provider,currency,amount,requested_amount,
   fee_amount,payable_amount,status,expires_at)
values
  ('$recharge_id','$recharge_no','$user_id','$channel','$channel','liuhaoyi','CNY',1.00,1.00,
   0,1.00,'pending',now() + interval '30 minutes');
insert into public.payment_sessions
  (id,session_no,business_type,business_id,business_no,user_id,channel_code,provider,currency,
   requested_amount,fee_amount,payable_amount,status,expires_at,provider_order_no)
values
  ('$session_id','$session_no','recharge','$recharge_id','$recharge_no','$user_id','$channel',
   'liuhaoyi','CNY',1.00,0,1.00,'pending',now() + interval '30 minutes','CI-ORDER-${scenario}');
SQL
}

complete_once() {
  local scenario="$1" suffix="$2" label="$3" app_name="${4:-ci_sequential}"
  local session_id="00000000-0000-4000-8000-0000000003${suffix}"
  PGAPPNAME="$app_name" psql -X -v ON_ERROR_STOP=1 -qAt <<SQL >"$task_logs/${scenario}-${label}.log"
set request.jwt.claim.role = 'service_role';
select public.complete_payment_session('$session_id'::uuid,'CI-TRADE-${scenario}',1.00,'CNY',now())::text;
SQL
}

assert_exactly_once() {
  local scenario="$1" suffix="$2"
  local user_id="00000000-0000-4000-8000-0000000001${suffix}"
  local recharge_id="00000000-0000-4000-8000-0000000002${suffix}"
  local session_id="00000000-0000-4000-8000-0000000003${suffix}"
  psql -X -v ON_ERROR_STOP=1 -q <<SQL
do \$\$
begin
  if (select balance from public.profiles where id='$user_id') <> 11.00
     or (select status from public.payment_sessions where id='$session_id') <> 'paid'
     or (select paid_at is null from public.payment_sessions where id='$session_id')
     or (select status from public.account_recharges where id='$recharge_id') <> 'paid'
     or (select completed_at is null from public.account_recharges where id='$recharge_id')
     or (select count(*) from public.balance_transactions
         where business_type='account_recharge' and business_id='RC-CI-${scenario}'
           and status='completed') <> 1
     or (select count(*) from public.balance_transactions
         where business_type='account_recharge' and business_id='RC-CI-${scenario}'
           and amount=1.00 and balance_before=10.00 and balance_after=11.00) <> 1
  then
    raise exception 'CI_PAYMENT_NOT_EXACTLY_ONCE';
  end if;
end
\$\$;
SQL
}

race_connection() {
  local scenario="$1" suffix="$2" label="$3" barrier_ms="$4"
  local session_id="00000000-0000-4000-8000-0000000003${suffix}"
  PGAPPNAME="ci_race_${scenario}_${label}" psql -X -v ON_ERROR_STOP=1 -qAt <<SQL >"$task_logs/${scenario}-${label}.log"
begin;
set local request.jwt.claim.role = 'service_role';
select pg_sleep(greatest(0, ${barrier_ms} / 1000.0 - extract(epoch from clock_timestamp())));
select public.complete_payment_session('$session_id'::uuid,'CI-TRADE-${scenario}',1.00,'CNY',now())::text;
select pg_sleep(0.75);
commit;
SQL
}

run_true_race() {
  local scenario="$1" suffix="$2" first="$3" second="$4"
  prepare_fixture "$scenario" "$suffix"
  # Both independent connections wait at the same wall-clock barrier. The
  # winner holds the actual payment row lock until commit; the loser waits.
  local barrier_ms=$(( $(date +%s%3N) + 500 ))
  race_connection "$scenario" "$suffix" "$first" "$barrier_ms" &
  local first_pid=$!
  race_connection "$scenario" "$suffix" "$second" "$barrier_ms" &
  local second_pid=$!
  local lock_wait=no
  for _ in {1..35}; do
    if [[ "$(psql -X -v ON_ERROR_STOP=1 -Atqc "select count(*) from pg_stat_activity where application_name like 'ci_race_${scenario}_%' and wait_event_type='Lock'")" == "1" ]]; then
      lock_wait=yes; break
    fi
    sleep 0.05
  done
  wait "$first_pid"
  wait "$second_pid"
  test "$lock_wait" = yes
  grep -q '"idempotent": true' "$task_logs/${scenario}-${first}.log" "$task_logs/${scenario}-${second}.log"
  grep -q '"idempotent": false' "$task_logs/${scenario}-${first}.log" "$task_logs/${scenario}-${second}.log"
  assert_exactly_once "$scenario" "$suffix"
}

for iteration in $(seq -w 1 20); do
  run_true_race "callback_recovery_${iteration}" "${iteration}" callback watcher
done
echo "REAL_DB_CALLBACK_RECOVERY_RACE=pass"
echo "CALLBACK_RECOVERY_RACE_ITERATIONS=20"
for iteration in $(seq -w 1 20); do
  suffix="$(printf '%02d' "$((10#$iteration + 20))")"
  run_true_race "double_recovery_${iteration}" "$suffix" watcher_a watcher_b
done
echo "REAL_DB_DOUBLE_RECOVERY_RACE=pass"
echo "DOUBLE_RECOVERY_RACE_ITERATIONS=20"

prepare_fixture watcher_then_callback 41
complete_once watcher_then_callback 41 watcher
complete_once watcher_then_callback 41 callback
grep -q '"idempotent": true' "$task_logs/watcher_then_callback-callback.log"
assert_exactly_once watcher_then_callback 41

prepare_fixture callback_then_watcher 42
complete_once callback_then_watcher 42 callback
complete_once callback_then_watcher 42 watcher
grep -q '"idempotent": true' "$task_logs/callback_then_watcher-watcher.log"
assert_exactly_once callback_then_watcher 42
echo "REAL_DB_LEDGER_EXACTLY_ONCE=pass"
echo "REAL_DB_BALANCE_EXACTLY_ONCE=pass"

prepare_fixture alipay_reconciliation_dedupe 43 alipay
complete_once alipay_reconciliation_dedupe 43 first
complete_once alipay_reconciliation_dedupe 43 replay
grep -q '"idempotent": true' "$task_logs/alipay_reconciliation_dedupe-replay.log"
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.payment_reconciliations
  (reconciliation_no,payment_session_id,business_type,business_id,channel_code,provider,
   result,provider_trade_no,dedupe_key)
values
  ('REC-CI-ALIPAY-1','00000000-0000-4000-8000-000000000343','recharge',
   'RC-CI-alipay_reconciliation_dedupe','alipay','liuhaoyi','manual_review',
   'CI-TRADE-alipay_reconciliation_dedupe',
   'alipay-recovery:00000000-0000-4000-8000-000000000343:provider_paid_local_unpaid:CI-TRADE-alipay_reconciliation_dedupe')
on conflict (dedupe_key) do update set updated_at=excluded.updated_at;

insert into public.payment_reconciliations
  (reconciliation_no,payment_session_id,business_type,business_id,channel_code,provider,
   result,provider_trade_no,dedupe_key)
values
  ('REC-CI-ALIPAY-2','00000000-0000-4000-8000-000000000343','recharge',
   'RC-CI-alipay_reconciliation_dedupe','alipay','liuhaoyi','manual_review',
   'CI-TRADE-alipay_reconciliation_dedupe',
   'alipay-recovery:00000000-0000-4000-8000-000000000343:provider_paid_local_unpaid:CI-TRADE-alipay_reconciliation_dedupe')
on conflict (dedupe_key) do update set updated_at=excluded.updated_at;

do $$
begin
  if (select count(*) from public.payment_reconciliations
      where dedupe_key='alipay-recovery:00000000-0000-4000-8000-000000000343:provider_paid_local_unpaid:CI-TRADE-alipay_reconciliation_dedupe') <> 1
     or (select count(*) from public.balance_transactions
         where business_type='account_recharge'
           and business_id='RC-CI-alipay_reconciliation_dedupe'
           and status='completed') <> 1
  then
    raise exception 'CI_ALIPAY_RECONCILIATION_OR_LEDGER_DUPLICATED';
  end if;
end
$$;
SQL
assert_exactly_once alipay_reconciliation_dedupe 43
echo "REAL_DB_ALIPAY_RECONCILIATION_DEDUPE=pass"
echo "REAL_DB_ALIPAY_LEDGER_REPLAY=pass"

prepare_expired_fixture() {
  local scenario="$1" suffix="$2"
  prepare_fixture "$scenario" "$suffix" alipay
  psql -X -v ON_ERROR_STOP=1 -q <<SQL
update public.account_recharges
set created_at=now()-interval '30 minutes', expires_at=now()-interval '10 minutes'
where id='00000000-0000-4000-8000-0000000002${suffix}';
update public.payment_sessions
set created_at=now()-interval '30 minutes', expires_at=now()-interval '10 minutes'
where id='00000000-0000-4000-8000-0000000003${suffix}';
SQL
}

complete_at() {
  local scenario="$1" suffix="$2" paid_at_sql="$3"
  PGAPPNAME="ci_expiry_${scenario}" psql -X -v ON_ERROR_STOP=1 -qAt <<SQL >"$task_logs/${scenario}-expiry.log"
set request.jwt.claim.role = 'service_role';
select public.complete_payment_session(
  '00000000-0000-4000-8000-0000000003${suffix}'::uuid,
  'CI-TRADE-${scenario}',1.00,'CNY',${paid_at_sql}
)::text;
SQL
}

assert_zero_completion() {
  local scenario="$1" suffix="$2"
  psql -X -v ON_ERROR_STOP=1 -qAt <<SQL | grep -qx ZERO_MUTATION
select case when
  (select balance from public.profiles where id='00000000-0000-4000-8000-0000000001${suffix}')=10.00
  and (select status from public.payment_sessions where id='00000000-0000-4000-8000-0000000003${suffix}')='pending'
  and (select status from public.account_recharges where id='00000000-0000-4000-8000-0000000002${suffix}')='pending'
  and not exists (select 1 from public.balance_transactions where business_id='RC-CI-${scenario}')
then 'ZERO_MUTATION' else 'UNEXPECTED_MUTATION' end;
SQL
}

# Core regression: the provider accepted payment before expiry while the
# canonical recovery transaction runs after expiry.
prepare_expired_fixture paid_before_expiry_processed_late 44
complete_at paid_before_expiry_processed_late 44 "now()-interval '11 minutes'"
assert_exactly_once paid_before_expiry_processed_late 44
echo "REAL_DB_PAID_BEFORE_EXPIRY_PROCESSED_LATE=pass"

prepare_expired_fixture paid_at_expiry_boundary 45
complete_at paid_at_expiry_boundary 45 "(select expires_at from public.payment_sessions where id='00000000-0000-4000-8000-000000000345')"
assert_exactly_once paid_at_expiry_boundary 45
echo "REAL_DB_PAID_AT_EXPIRY_BOUNDARY=pass"

prepare_expired_fixture paid_after_expiry_rejected 46
if complete_at paid_after_expiry_rejected 46 "now()-interval '9 minutes'"; then
  echo "LATE_PAYMENT_UNEXPECTEDLY_COMPLETED"; exit 1
fi
assert_zero_completion paid_after_expiry_rejected 46
echo "REAL_DB_PAID_AFTER_EXPIRY_REJECTED=pass"

prepare_expired_fixture missing_paid_time_rejected 47
if complete_at missing_paid_time_rejected 47 "null"; then
  echo "MISSING_PAID_TIME_UNEXPECTEDLY_COMPLETED"; exit 1
fi
assert_zero_completion missing_paid_time_rejected 47
echo "REAL_DB_MISSING_PAID_TIME_REJECTED=pass"

prepare_expired_fixture paid_before_creation_rejected 48
if complete_at paid_before_creation_rejected 48 "now()-interval '31 minutes'"; then
  echo "PRE_CREATION_PAYMENT_UNEXPECTEDLY_COMPLETED"; exit 1
fi
assert_zero_completion paid_before_creation_rejected 48
echo "REAL_DB_PRE_CREATION_PAID_TIME_REJECTED=pass"
