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

task_logs="$(mktemp -d)"
trap 'rm -f "$task_logs"/*; rmdir "$task_logs"' EXIT

prepare_fixture() {
  local scenario="$1"
  local suffix="$2"
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
  ('$recharge_id','$recharge_no','$user_id','wechat','wechat','liuhaoyi','CNY',1.00,1.00,
   0,1.00,'pending',now() + interval '30 minutes');
insert into public.payment_sessions
  (id,session_no,business_type,business_id,business_no,user_id,channel_code,provider,currency,
   requested_amount,fee_amount,payable_amount,status,expires_at,provider_order_no)
values
  ('$session_id','$session_no','recharge','$recharge_id','$recharge_no','$user_id','wechat',
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
     or (select status from public.account_recharges where id='$recharge_id') <> 'paid'
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

run_true_race() {
  local scenario="$1" suffix="$2" first="$3" second="$4"
  local session_id="00000000-0000-4000-8000-0000000003${suffix}"
  prepare_fixture "$scenario" "$suffix"
  # First connection completes within a transaction, then holds its row lock.
  # Start the second independent connection only after the first reports LOCK_HELD.
  PGAPPNAME="ci_first_${scenario}" psql -X -v ON_ERROR_STOP=1 -qAt <<SQL >"$task_logs/${scenario}-${first}.log" &
begin;
set local request.jwt.claim.role = 'service_role';
select public.complete_payment_session('$session_id'::uuid,'CI-TRADE-${scenario}',1.00,'CNY',now())::text;
select pg_sleep(3);
commit;
SQL
  local first_pid=$!
  local ready=no
  for _ in {1..50}; do
    if [[ "$(psql -X -v ON_ERROR_STOP=1 -Atqc "select count(*) from pg_stat_activity where application_name='ci_first_${scenario}' and query like 'select pg_sleep(3)%' and state='active'")" == "1" ]]; then
      ready=yes; break
    fi
    sleep 0.1
  done
  if [[ "$ready" != yes ]]; then wait "$first_pid" || true; echo "FIRST_CONNECTION_LOCK_NOT_HELD"; exit 1; fi
  complete_once "$scenario" "$suffix" "$second" "ci_second_${scenario}" &
  local second_pid=$!
  local lock_wait=no
  for _ in {1..20}; do
    if [[ "$(psql -X -v ON_ERROR_STOP=1 -Atqc "select count(*) from pg_stat_activity where application_name='ci_second_${scenario}' and wait_event_type='Lock'")" == "1" ]]; then
      lock_wait=yes; break
    fi
    sleep 0.1
  done
  wait "$first_pid"
  wait "$second_pid"
  test "$lock_wait" = yes
  grep -q '"idempotent": true' "$task_logs/${scenario}-${second}.log"
  assert_exactly_once "$scenario" "$suffix"
}

run_true_race callback_recovery 01 callback watcher
echo "REAL_DB_CALLBACK_RECOVERY_RACE=pass"
run_true_race double_recovery 02 watcher_a watcher_b
echo "REAL_DB_DOUBLE_RECOVERY_RACE=pass"

prepare_fixture watcher_then_callback 03
complete_once watcher_then_callback 03 watcher
complete_once watcher_then_callback 03 callback
grep -q '"idempotent": true' "$task_logs/watcher_then_callback-callback.log"
assert_exactly_once watcher_then_callback 03

prepare_fixture callback_then_watcher 04
complete_once callback_then_watcher 04 callback
complete_once callback_then_watcher 04 watcher
grep -q '"idempotent": true' "$task_logs/callback_then_watcher-watcher.log"
assert_exactly_once callback_then_watcher 04
echo "REAL_DB_LEDGER_EXACTLY_ONCE=pass"
