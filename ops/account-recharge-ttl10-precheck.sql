-- Production qvbovrvybirscaurwuov ONLY, independently authorized release step.
-- Read only. Do not expose customer rows or credentials.
begin transaction read only;
select current_database(),current_user,version();
select oid::regprocedure::text as signature,md5(replace(pg_get_functiondef(oid),chr(13),'')) as md5,
       pg_get_userbyid(proowner) as owner,prosecdef,proconfig,proacl::text
from pg_proc where oid in (
  to_regprocedure('public.lease_recharge_order_scan_v1(text,text,boolean)'),
  to_regprocedure('public.apply_recharge_order_scan_chunk_v1(uuid,jsonb,jsonb,integer,text,text,timestamp with time zone)'));
select mode,activated_at is not null as activation_present,
       lease_until>clock_timestamp() as active_lease
from public.account_recharge_order_scan_control where singleton;
select count(*) filter(where expires_at=created_at+interval '15 minutes') as legacy_15m,
       count(*) filter(where expires_at=created_at+interval '10 minutes') as new_10m
from public.account_recharges where channel='usdt_bep20';
rollback;
