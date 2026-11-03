-- Read-only catalogue proof. Behavioral proof is in isolated PG17, not synthetic
-- Production rows. Never create orders or invoke financial RPCs here.
begin transaction read only;
select oid::regprocedure::text as signature,md5(replace(pg_get_functiondef(oid),chr(13),'')) as md5,
       pg_get_userbyid(proowner) as owner,prosecdef,proconfig,proacl::text,
       strpos(pg_get_functiondef(oid),'10 minutes')>0 as contains_10m,
       strpos(pg_get_functiondef(oid),'15 minutes')>0 as contains_legacy_15m
from pg_proc where oid in (
  to_regprocedure('public.lease_recharge_order_scan_v1(text,text,boolean)'),
  to_regprocedure('public.apply_recharge_order_scan_chunk_v1(uuid,jsonb,jsonb,integer,text,text,timestamp with time zone)'));
select mode from public.account_recharge_order_scan_control where singleton;
rollback;
