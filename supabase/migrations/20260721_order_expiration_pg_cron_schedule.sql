-- Production order-expiration scheduler.
--
-- Target project (must be confirmed manually before execution):
--   Jianlian-shop / qvbovrvybirscaurwuov
--
-- This migration intentionally does not create or update the Vault secret. Before
-- running it, create exactly one Vault secret named:
--   order_expiration_cron_secret
-- The value must equal the production server's CRON_SECRET. Never paste that value
-- into this file or any cron command.

begin;

do $extension_precheck$
begin
  if not exists (
    select 1
    from pg_catalog.pg_available_extensions
    where name = 'pg_cron'
  ) then
    raise exception 'ORDER_EXPIRATION_CRON_PREFLIGHT_PG_CRON_UNAVAILABLE';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_available_extensions
    where name = 'pg_net'
  ) then
    raise exception 'ORDER_EXPIRATION_CRON_PREFLIGHT_PG_NET_UNAVAILABLE';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_extension
    where extname = 'supabase_vault'
  ) then
    raise exception 'ORDER_EXPIRATION_CRON_PREFLIGHT_VAULT_NOT_INSTALLED';
  end if;
end
$extension_precheck$;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $scheduler$
declare
  v_job_name constant text := 'expire-unpaid-orders-every-5-minutes';
  v_secret_name constant text := 'order_expiration_cron_secret';
  v_endpoint constant text := 'https://jianlian.shop/api/internal/orders/expire?limit=10';
  v_job_id bigint;
  v_secret_count integer;
  v_conflicting_job_count integer;
  v_command constant text := $cron_command$
    select net.http_post(
      url := 'https://jianlian.shop/api/internal/orders/expire?limit=10',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'order_expiration_cron_secret'
        ),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'limit', 10,
        'reason', 'payment_timeout'
      ),
      timeout_milliseconds := 15000
    ) as request_id;
  $cron_command$;
begin
  if pg_catalog.to_regclass('vault.decrypted_secrets') is null then
    raise exception 'ORDER_EXPIRATION_CRON_PREFLIGHT_VAULT_VIEW_MISSING';
  end if;

  select count(*)
  into v_secret_count
  from vault.decrypted_secrets
  where name = v_secret_name
    and nullif(pg_catalog.btrim(decrypted_secret), '') is not null;

  if v_secret_count <> 1 then
    raise exception 'ORDER_EXPIRATION_CRON_PREFLIGHT_SECRET_COUNT:%', v_secret_count;
  end if;

  if pg_catalog.to_regclass('cron.job') is null then
    raise exception 'ORDER_EXPIRATION_CRON_PREFLIGHT_JOB_TABLE_MISSING';
  end if;

  -- A differently named job targeting this endpoint could process the same order
  -- concurrently. Stop instead of silently deleting an operator-owned job.
  select count(*)
  into v_conflicting_job_count
  from cron.job
  where command ilike '%/api/internal/orders/expire%'
    and jobname is distinct from v_job_name;

  if v_conflicting_job_count <> 0 then
    raise exception 'ORDER_EXPIRATION_CRON_PREFLIGHT_CONFLICTING_JOBS:%', v_conflicting_job_count;
  end if;

  -- Remove every exact-name copy before scheduling. This makes a retry converge to
  -- one job even if a historical environment allowed duplicate names.
  for v_job_id in
    select jobid
    from cron.job
    where jobname = v_job_name
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    v_job_name,
    '*/5 * * * *',
    v_command
  );
end
$scheduler$;

do $postcheck$
declare
  v_job_name constant text := 'expire-unpaid-orders-every-5-minutes';
  v_secret_name constant text := 'order_expiration_cron_secret';
  v_job_count integer;
  v_endpoint_job_count integer;
  v_schedule text;
  v_command text;
  v_active boolean;
  v_secret text;
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    raise exception 'ORDER_EXPIRATION_CRON_POSTCHECK_PG_CRON_MISSING';
  end if;

  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    raise exception 'ORDER_EXPIRATION_CRON_POSTCHECK_PG_NET_MISSING';
  end if;

  select count(*), min(schedule), bool_and(active), min(command)
  into v_job_count, v_schedule, v_active, v_command
  from cron.job
  where jobname = v_job_name;

  if v_job_count <> 1 then
    raise exception 'ORDER_EXPIRATION_CRON_POSTCHECK_JOB_COUNT:%', v_job_count;
  end if;

  if v_schedule <> '*/5 * * * *' or v_active is not true then
    raise exception 'ORDER_EXPIRATION_CRON_POSTCHECK_SCHEDULE_OR_ACTIVE_FAILED';
  end if;

  select count(*)
  into v_endpoint_job_count
  from cron.job
  where command ilike '%/api/internal/orders/expire%';

  if v_endpoint_job_count <> 1 then
    raise exception 'ORDER_EXPIRATION_CRON_POSTCHECK_ENDPOINT_JOB_COUNT:%', v_endpoint_job_count;
  end if;

  if position('net.http_post' in v_command) = 0
     or position('https://jianlian.shop/api/internal/orders/expire?limit=10' in v_command) = 0
     or position('vault.decrypted_secrets' in v_command) = 0
     or position('order_expiration_cron_secret' in v_command) = 0
     or position('jsonb_build_object(''limit'', 10' in v_command) = 0
     or position('timeout_milliseconds := 15000' in v_command) = 0 then
    raise exception 'ORDER_EXPIRATION_CRON_POSTCHECK_COMMAND_CONTRACT_FAILED';
  end if;

  select decrypted_secret
  into strict v_secret
  from vault.decrypted_secrets
  where name = v_secret_name
    and nullif(pg_catalog.btrim(decrypted_secret), '') is not null;

  if position(v_secret in v_command) <> 0 then
    raise exception 'ORDER_EXPIRATION_CRON_POSTCHECK_PLAINTEXT_SECRET_IN_COMMAND';
  end if;
end
$postcheck$;

commit;

-- ---------------------------------------------------------------------------
-- Manual read-only precheck (run separately before the migration).
-- It deliberately returns only secret counts and command hashes, never values.
-- ---------------------------------------------------------------------------
-- select extname, extversion
-- from pg_catalog.pg_extension
-- where extname in ('pg_cron', 'pg_net', 'supabase_vault')
-- order by extname;
--
-- select
--   count(*) filter (where name = 'order_expiration_cron_secret') as named_secret_count,
--   count(*) filter (
--     where name = 'order_expiration_cron_secret'
--       and nullif(pg_catalog.btrim(decrypted_secret), '') is not null
--   ) as nonempty_named_secret_count
-- from vault.decrypted_secrets;
--
-- select
--   jobid,
--   jobname,
--   schedule,
--   active,
--   md5(command) as command_hash,
--   command ilike '%/api/internal/orders/expire%' as targets_expiration_endpoint
-- from cron.job
-- where jobname = 'expire-unpaid-orders-every-5-minutes'
--    or command ilike '%/api/internal/orders/expire%'
-- order by jobid;

-- ---------------------------------------------------------------------------
-- Manual read-only postcheck (run after commit and after at least one schedule).
-- Do not export the cron command itself; the stored command references Vault and
-- must not contain the decrypted secret.
-- ---------------------------------------------------------------------------
-- select
--   jobid,
--   jobname,
--   schedule,
--   active,
--   md5(command) as command_hash,
--   command ilike '%net.http_post%' as uses_pg_net,
--   command ilike '%vault.decrypted_secrets%' as reads_vault_at_runtime,
--   command ilike '%/api/internal/orders/expire?limit=10%' as targets_expected_url
-- from cron.job
-- where jobname = 'expire-unpaid-orders-every-5-minutes';
--
-- select
--   status,
--   return_message,
--   start_time,
--   end_time
-- from cron.job_run_details
-- where jobid = (
--   select jobid
--   from cron.job
--   where jobname = 'expire-unpaid-orders-every-5-minutes'
-- )
-- order by start_time desc
-- limit 10;
--
-- select
--   id,
--   status_code,
--   timed_out,
--   error_msg,
--   created
-- from net._http_response
-- order by created desc
-- limit 20;

-- ---------------------------------------------------------------------------
-- Complete rollback (execute separately only with explicit authorization).
-- It removes only this exact job. Extensions and the Vault secret are retained
-- because they may be shared by other workloads.
-- ---------------------------------------------------------------------------
-- begin;
-- do $rollback$
-- declare
--   v_job_id bigint;
-- begin
--   if pg_catalog.to_regclass('cron.job') is not null then
--     for v_job_id in
--       select jobid
--       from cron.job
--       where jobname = 'expire-unpaid-orders-every-5-minutes'
--     loop
--       perform cron.unschedule(v_job_id);
--     end loop;
--   end if;
-- end
-- $rollback$;
-- commit;
