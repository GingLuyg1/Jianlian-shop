-- Candidate only; NEVER execute on Production without independent approval.
-- Test iteration SQL, not a replacement for any frozen historical migration.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

create schema if not exists recharge_scanner_private;
revoke all on schema recharge_scanner_private from public,anon,authenticated,service_role;

create table public.account_recharge_order_scan_control (
  singleton boolean primary key default true check(singleton),
  mode text not null default 'legacy' check(mode in('legacy','order_driven')),
  activated_at timestamptz,
  lease_token uuid,
  lease_until timestamptz
);
insert into public.account_recharge_order_scan_control(singleton) values(true);
create table public.account_recharge_order_scan_progress (
  recharge_id uuid primary key references public.account_recharges(id),
  start_block numeric(30,0), last_scanned_block numeric(30,0),
  complete boolean not null default false,
  updated_at timestamptz not null default now(),
  check(start_block is null or start_block>=0),
  check(last_scanned_block is null or last_scanned_block>=start_block)
);
create table public.account_recharge_order_scan_waivers (
  recharge_id uuid primary key references public.account_recharges(id),
  evidence_reference text not null check(length(evidence_reference)>=20),
  approved_at timestamptz not null default now()
);
alter table public.account_recharge_order_scan_control enable row level security;
alter table public.account_recharge_order_scan_progress enable row level security;
alter table public.account_recharge_order_scan_waivers enable row level security;
revoke all on public.account_recharge_order_scan_control,public.account_recharge_order_scan_progress,public.account_recharge_order_scan_waivers from public,anon,authenticated,service_role;
-- No service-role direct writes to mode, waiver or progress; only reviewed RPCs.
grant select on public.account_recharge_order_scan_control,public.account_recharge_order_scan_progress to service_role;

-- Preserve the original financial function body verbatim in an owner-only
-- schema; its public entry gets a mode guard. No original key/credit SQL edited.
do $install$
declare source text;
begin
  if to_regprocedure('recharge_scanner_private.match_and_credit_account_recharge_bep20_v3(integer,text,integer,numeric,text,timestamp with time zone,text,text,text,numeric,numeric,integer)') is not null then
    raise exception 'ORDER_SCAN_ALREADY_INSTALLED_REVIEW_REQUIRED';
  end if;
  source:=pg_get_functiondef('public.match_and_credit_account_recharge_bep20_v3(integer,text,integer,numeric,text,timestamp with time zone,text,text,text,numeric,numeric,integer)'::regprocedure);
  if md5(source)<>'1f4307c0e21af6086b2d1721c37829e8' then raise exception 'FINANCIAL_CORE_SOURCE_DRIFT'; end if;
  if md5(pg_get_functiondef('public.match_account_recharge_bep20_fingerprint_v2(integer,text,integer,numeric,text,timestamp with time zone,text,text,text,numeric,numeric,integer)'::regprocedure))<>'ae16cfeccc3a33e14f5a44370c6f7039'
    or md5(pg_get_functiondef('public.credit_auto_matched_account_recharge_bep20_v3(uuid,text)'::regprocedure))<>'09f9894d55b4e11bbd99bdcdbac8ac17' then raise exception 'FINANCIAL_DEPENDENCY_SOURCE_DRIFT'; end if;
  source:=replace(source,'FUNCTION public.match_and_credit_account_recharge_bep20_v3(', 'FUNCTION recharge_scanner_private.match_and_credit_account_recharge_bep20_v3(');
  execute source;
  if (select prosrc from pg_proc where oid='recharge_scanner_private.match_and_credit_account_recharge_bep20_v3(integer,text,integer,numeric,text,timestamp with time zone,text,text,text,numeric,numeric,integer)'::regprocedure)
    is distinct from (select prosrc from pg_proc where oid='public.match_and_credit_account_recharge_bep20_v3(integer,text,integer,numeric,text,timestamp with time zone,text,text,text,numeric,numeric,integer)'::regprocedure)
    then raise exception 'FINANCIAL_CORE_BODY_CHANGED'; end if;
end $install$;
revoke all on all functions in schema recharge_scanner_private from public,anon,authenticated,service_role;

create or replace function public.match_and_credit_account_recharge_bep20_v3(
 p_chain_id integer,p_tx_hash text,p_log_index integer,p_block_number numeric,p_block_hash text,
 p_block_timestamp timestamptz,p_token_contract text,p_from_address text,p_to_address text,
 p_raw_amount numeric,p_actual_received_usdt numeric,p_confirmation_count integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 perform 1 from public.account_recharge_order_scan_control where singleton and mode='legacy' for share;
 if not found then raise exception 'LEGACY_SCANNER_DISABLED'; end if;
 return recharge_scanner_private.match_and_credit_account_recharge_bep20_v3(p_chain_id,p_tx_hash,p_log_index,p_block_number,p_block_hash,p_block_timestamp,p_token_contract,p_from_address,p_to_address,p_raw_amount,p_actual_received_usdt,p_confirmation_count);
end $$;

create function public.lease_recharge_order_scan_v1(p_address text,p_contract text,p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.account_recharge_order_scan_control; rows jsonb; blocked integer; token uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 if not p_dry_run then
   select * into c from public.account_recharge_order_scan_control where singleton for update;
 else select * into c from public.account_recharge_order_scan_control where singleton;
 end if;
 if c.mode is distinct from 'order_driven' or c.activated_at is null then raise exception 'ORDER_SCANNER_NOT_ACTIVE'; end if;
 if p_address !~ '^0x[0-9a-f]{40}$' or p_contract !~ '^0x[0-9a-f]{40}$' then raise exception 'INVALID_CHANNEL'; end if;
 if not p_dry_run and c.lease_until>clock_timestamp() then raise exception 'ORDER_SCAN_BUSY'; end if;
 -- Never turn an age cutoff into an implicit backfill waiver. Every unresolved
 -- legacy row is reported, and requires evidence plus explicit owner approval.
 select count(*) into blocked from public.account_recharges r
 where r.channel='usdt_bep20' and r.channel_code='usdt_bep20' and r.status in('waiting_payment','submitted')
 and (r.created_at<c.activated_at or r.created_at<now()-interval '24 hours' or r.expires_at is distinct from r.created_at+interval '15 minutes')
 and not exists(select 1 from public.account_recharge_order_scan_waivers w where w.recharge_id=r.id);
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'created_at',r.created_at,'expires_at',r.expires_at,'last_scanned_block',p.last_scanned_block::text) order by r.created_at,r.id),'[]') into rows
 from public.account_recharges r left join public.account_recharge_order_scan_progress p on p.recharge_id=r.id
 where r.channel='usdt_bep20' and r.channel_code='usdt_bep20' and r.status in('waiting_payment','submitted')
 and lower(r.payment_address)=p_address and lower(r.payment_token_contract)=p_contract
 and r.created_at>=c.activated_at and r.created_at>=now()-interval '24 hours'
 and r.expires_at=r.created_at+interval '15 minutes' and not coalesce(p.complete,false)
 and exists(select 1 from public.account_recharge_amount_reservations a where a.recharge_id=r.id)
 and not exists(select 1 from public.account_recharge_order_scan_waivers w where w.recharge_id=r.id);
 if jsonb_array_length(rows)>1000 then raise exception 'ORDER_SCAN_WINDOW_LIMIT'; end if;
 if not p_dry_run and jsonb_array_length(rows)>0 then
   token:=gen_random_uuid();
   update public.account_recharge_order_scan_control set lease_token=token,lease_until=clock_timestamp()+interval '5 minutes' where singleton;
 end if;
 return jsonb_build_object('token',token,'windows',rows,'blockedHistory',blocked);
end $$;

create function public.release_recharge_order_scan_v1(p_token uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 update public.account_recharge_order_scan_control set lease_token=null,lease_until=null where singleton and lease_token=p_token;
end $$;

create function public.apply_recharge_order_scan_chunk_v1(
 p_token uuid,p_progress jsonb,p_evidence jsonb,p_chain_id integer,p_contract text,p_address text,p_boundary_timestamp timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.account_recharge_order_scan_control; item jsonb; ev jsonb; target public.account_recharges; old public.account_recharge_order_scan_progress; results jsonb:='[]'; answer jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into c from public.account_recharge_order_scan_control where singleton for update;
 if c.mode is distinct from 'order_driven' or p_token is null or c.lease_token is distinct from p_token or c.lease_until<=clock_timestamp() then raise exception 'ORDER_SCAN_LEASE_LOST'; end if;
 if p_chain_id is distinct from 56 or p_contract !~ '^0x[0-9a-f]{40}$' or p_address !~ '^0x[0-9a-f]{40}$' or p_boundary_timestamp is null
 or jsonb_typeof(p_progress) is distinct from 'array' or jsonb_typeof(p_evidence) is distinct from 'array'
 or jsonb_array_length(p_progress) not between 1 and 1000 or jsonb_array_length(p_evidence)>10000 then raise exception 'ORDER_SCAN_CHUNK_INVALID'; end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_progress)x)<>jsonb_array_length(p_progress) then raise exception 'DUPLICATE_WINDOW'; end if;
 -- Lock windows in stable order before the financial core; all progress and
 -- credits in this chunk commit or roll back together.
 for item in select x from jsonb_array_elements(p_progress)x order by x->>'id' loop
   select * into target from public.account_recharges where id=(item->>'id')::uuid for update;
   if not found or target.channel is distinct from 'usdt_bep20' or target.channel_code is distinct from 'usdt_bep20'
   or lower(target.payment_address) is distinct from p_address or lower(target.payment_token_contract) is distinct from p_contract
   or target.created_at<c.activated_at or target.expires_at is distinct from target.created_at+interval '15 minutes'
   or exists(select 1 from public.account_recharge_order_scan_waivers w where w.recharge_id=target.id) then raise exception 'ORDER_SCAN_WINDOW_INVALID'; end if;
   select * into old from public.account_recharge_order_scan_progress where recharge_id=target.id for update;
   if old.complete or (old.last_scanned_block is not null and (item->>'from')::numeric<>old.last_scanned_block+1)
   or (item->>'from')::numeric<0 or (item->>'to')::numeric<(item->>'from')::numeric
   or (item->>'to')::numeric-(item->>'from')::numeric>=1000
   or (coalesce((item->>'complete')::boolean,false) and p_boundary_timestamp<=target.expires_at) then raise exception 'ORDER_SCAN_PROGRESS_INVALID'; end if;
 end loop;
 for ev in select x from jsonb_array_elements(p_evidence)x loop
   -- Only permit this leased snapshot's exact funding windows, never a new
   -- order that appeared while the network read was in progress.
   if exists(select 1 from jsonb_array_elements(p_progress)x join public.account_recharges r on r.id=(x->>'id')::uuid
     join public.account_recharge_amount_reservations a on a.recharge_id=r.id
     where a.expected_usdt_amount=(ev->>'actualReceivedUsdt')::numeric
     and lower(a.payment_address)=p_address
     and (ev->>'blockTimestamp')::timestamptz>=date_trunc('second',r.created_at)
     and (ev->>'blockTimestamp')::timestamptz<=least(r.expires_at,a.expires_at)
     and (ev->>'blockNumber')::numeric between (x->>'from')::numeric and (x->>'to')::numeric) then
     answer:=recharge_scanner_private.match_and_credit_account_recharge_bep20_v3(
       p_chain_id,ev->>'txHash',(ev->>'logIndex')::integer,(ev->>'blockNumber')::numeric,ev->>'blockHash',(ev->>'blockTimestamp')::timestamptz,
       p_contract,ev->>'fromAddress',p_address,(ev->>'rawAmount')::numeric,(ev->>'actualReceivedUsdt')::numeric,(ev->>'confirmationCount')::integer);
     results:=results||jsonb_build_array(answer);
   end if;
 end loop;
 for item in select x from jsonb_array_elements(p_progress)x loop
   insert into public.account_recharge_order_scan_progress(recharge_id,start_block,last_scanned_block,complete)
   values((item->>'id')::uuid,(item->>'from')::numeric,(item->>'to')::numeric,coalesce((item->>'complete')::boolean,false) or exists(select 1 from public.account_recharges where id=(item->>'id')::uuid and status in('paid','succeeded')))
   on conflict(recharge_id) do update set last_scanned_block=excluded.last_scanned_block,complete=excluded.complete,updated_at=now();
 end loop;
 update public.account_recharge_order_scan_control set lease_until=clock_timestamp()+interval '5 minutes' where singleton;
 return jsonb_build_object('results',results,'completed',(select coalesce(jsonb_agg(p.recharge_id),'[]') from public.account_recharge_order_scan_progress p where p.complete and p.recharge_id in(select (x->>'id')::uuid from jsonb_array_elements(p_progress)x)));
end $$;

revoke all on function public.lease_recharge_order_scan_v1(text,text,boolean),public.release_recharge_order_scan_v1(uuid),public.apply_recharge_order_scan_chunk_v1(uuid,jsonb,jsonb,integer,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.lease_recharge_order_scan_v1(text,text,boolean),public.release_recharge_order_scan_v1(uuid),public.apply_recharge_order_scan_chunk_v1(uuid,jsonb,jsonb,integer,text,text,timestamptz) to service_role;
revoke all on function public.match_and_credit_account_recharge_bep20_v3(integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer) from public,anon,authenticated;
grant execute on function public.match_and_credit_account_recharge_bep20_v3(integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer) to service_role;
do $security$
begin
 if has_function_privilege('anon','public.lease_recharge_order_scan_v1(text,text,boolean)','execute')
   or has_function_privilege('authenticated','public.apply_recharge_order_scan_chunk_v1(uuid,jsonb,jsonb,integer,text,text,timestamptz)','execute')
   or has_table_privilege('service_role','public.account_recharge_order_scan_waivers','insert')
   or (select count(*)<>3 or not bool_and(relrowsecurity) from pg_class where relnamespace='public'::regnamespace and relname in('account_recharge_order_scan_control','account_recharge_order_scan_progress','account_recharge_order_scan_waivers'))
   then raise exception 'ORDER_SCAN_SECURITY_POSTCHECK_FAILED'; end if;
end $security$;
-- Deliberately stay in legacy mode. Activation/waivers need a separately
-- reviewed exact-id plan after the timer is quiescent; never advance old cursor.
commit;
