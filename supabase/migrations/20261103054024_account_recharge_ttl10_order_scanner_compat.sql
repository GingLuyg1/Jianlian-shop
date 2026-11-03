-- Forward-only. No historical row rewrite, financial-core change or activation.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $migration$
declare
  control public.account_recharge_order_scan_control;
  item record;
  source text;
  patched text;
  old_owner oid;
  old_acl aclitem[];
  old_config text[];
  old_security boolean;
begin
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace
      and proname in ('lease_recharge_order_scan_v1','apply_recharge_order_scan_chunk_v1'))<>2 then
    raise exception 'ORDER_SCAN_SIGNATURE_DRIFT';
  end if;
  select * into control from public.account_recharge_order_scan_control where singleton for update nowait;
  if not found or control.mode is distinct from 'order_driven' then raise exception 'ORDER_SCAN_MODE_DRIFT'; end if;
  if control.lease_until>clock_timestamp() then raise exception 'ORDER_SCAN_ACTIVE_LEASE'; end if;
  if exists(select 1 from public.account_recharges where channel='usdt_bep20'
      and expires_at=created_at+interval '10 minutes') then raise exception 'TEN_MINUTE_ROWS_ALREADY_PRESENT_REVIEW'; end if;
  for item in select * from (values
    ('public.lease_recharge_order_scan_v1(text,text,boolean)','4872e61fee39c3d2333ea6359eadbe2c'),
    ('public.apply_recharge_order_scan_chunk_v1(uuid,jsonb,jsonb,integer,text,text,timestamp with time zone)','8dcda5d2cac5a66ce2c41bf81dcfa67e')
  ) as expected(signature, fingerprint) loop
    if to_regprocedure(item.signature) is null then raise exception 'ORDER_SCAN_SIGNATURE_MISSING'; end if;
    select pg_get_functiondef(p.oid),p.proowner,p.proacl,p.proconfig,p.prosecdef
      into source,old_owner,old_acl,old_config,old_security from pg_proc p where p.oid=to_regprocedure(item.signature);
    source:=replace(source,chr(13),'');
    if md5(source)<>item.fingerprint then raise exception 'ORDER_SCAN_SOURCE_DRIFT'; end if;
    if not old_security then raise exception 'ORDER_SCAN_SECURITY_DRIFT'; end if;
    if item.signature like 'public.lease_%' then
      patched:=replace(source,
        'r.expires_at is distinct from r.created_at+interval ''15 minutes''',
        '(r.expires_at is distinct from r.created_at+interval ''10 minutes'' and r.expires_at is distinct from r.created_at+interval ''15 minutes'')');
      patched:=replace(patched,
        'r.expires_at=r.created_at+interval ''15 minutes''',
        '(r.expires_at=r.created_at+interval ''10 minutes'' or r.expires_at=r.created_at+interval ''15 minutes'')');
    else
      patched:=replace(source,
        'target.expires_at is distinct from target.created_at+interval ''15 minutes''',
        '(target.expires_at is distinct from target.created_at+interval ''10 minutes'' and target.expires_at is distinct from target.created_at+interval ''15 minutes'')');
    end if;
    if patched=source then raise exception 'ORDER_SCAN_PATCH_ANCHOR_MISSING'; end if;
    execute patched;
    if exists(select 1 from pg_proc p where p.oid=to_regprocedure(item.signature)
      and (p.proowner is distinct from old_owner or p.proacl is distinct from old_acl
        or p.proconfig is distinct from old_config or p.prosecdef is distinct from old_security)) then
      raise exception 'ORDER_SCAN_PRIVILEGE_DRIFT';
    end if;
    if replace(pg_get_functiondef(to_regprocedure(item.signature)),chr(13),'') is distinct from patched then
      raise exception 'ORDER_SCAN_POSTCHECK_DRIFT';
    end if;
  end loop;
end $migration$;
commit;
