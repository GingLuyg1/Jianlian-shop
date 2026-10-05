\set ON_ERROR_STOP on

do $$
begin
  if not exists (
    select 1
    from public.ci_admin_local_inventory_guard
    where marker = 'JOB_LOCAL_ADMIN_INVENTORY_DB'
  ) then
    raise exception 'LOCAL_INVENTORY_DB_GUARD_FAILED';
  end if;
end
$$;
select 'LOCAL_INVENTORY_DB_GUARD_PASS';

create or replace function public.ci_assert(p_condition boolean, p_message text)
returns void language plpgsql set search_path = pg_catalog as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'CI_ASSERT_FAILED: %', p_message;
  end if;
end
$$;

create or replace function public.ci_transition_items(p_ids uuid[])
returns jsonb language sql stable set search_path = pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'inventory_id', inventory.id,
    'expected_updated_at', inventory.updated_at,
    'expected_status', inventory.status
  ) order by inventory.id), '[]'::jsonb)
  from public.digital_inventory as inventory
  where inventory.id = any(p_ids)
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', false);
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000001","email":"admin@example.invalid","role":"authenticated"}',
  false
);

-- Baseline successful import and idempotent replay.
select public.admin_import_local_inventory(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '["BASE-SECRET-A","BASE-SECRET-B"]'::jsonb,
  'card_key', 'baseline', 'ci.txt',
  '70000000-0000-4000-8000-000000000001'
);
select public.ci_assert(
  (select count(*) = 2 from public.digital_inventory where product_id = '10000000-0000-4000-8000-000000000001'),
  'baseline import count'
);
select public.ci_assert(
  (select stock = 2 from public.products where id = '10000000-0000-4000-8000-000000000001')
  and (select count(*) = 2 from public.digital_inventory
       where product_id = '10000000-0000-4000-8000-000000000001'
         and sku_id = '20000000-0000-4000-8000-000000000001'
         and status = 'available'),
  'P2.5A diagnostics observes imported available inventory'
);
select public.admin_import_local_inventory(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '["BASE-SECRET-A","BASE-SECRET-B"]'::jsonb,
  'card_key', 'baseline', 'ci.txt',
  '70000000-0000-4000-8000-000000000001'
);
select public.ci_assert(
  (select count(*) = 2 from public.digital_inventory where product_id = '10000000-0000-4000-8000-000000000001')
  and (select count(*) = 1 from public.admin_audit_logs where request_id = '70000000-0000-4000-8000-000000000001'),
  'import idempotent retry'
);

do $$
begin
  begin
    perform public.admin_import_local_inventory(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '["DIFFERENT-SEMANTIC-PAYLOAD"]'::jsonb,
      'card_key', 'baseline', 'ci.txt',
      '70000000-0000-4000-8000-000000000001'
    );
    raise exception 'EXPECTED_IDEMPOTENCY_CONFLICT';
  exception when others then
    if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
end
$$;

-- 9 valid + 1 invalid must write nothing, including audit/idempotency rows.
do $$
declare v_before_inventory bigint; v_before_audit bigint; v_before_ops bigint;
begin
  select count(*) into v_before_inventory from public.digital_inventory;
  select count(*) into v_before_audit from public.admin_audit_logs;
  select count(*) into v_before_ops from public.admin_local_inventory_operations;
  begin
    perform public.admin_import_local_inventory(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '["I1","I2","I3","I4","I5","I6","I7","I8","I9","   "]'::jsonb,
      'card_key', 'invalid', 'ci.txt',
      '70000000-0000-4000-8000-000000000002'
    );
    raise exception 'EXPECTED_INVALID_BATCH';
  exception when others then
    if sqlerrm <> 'INVALID_BATCH' then raise; end if;
  end;
  perform public.ci_assert((select count(*) from public.digital_inventory) = v_before_inventory, 'invalid batch inventory rollback');
  perform public.ci_assert((select count(*) from public.admin_audit_logs) = v_before_audit, 'invalid batch audit rollback');
  perform public.ci_assert((select count(*) from public.admin_local_inventory_operations) = v_before_ops, 'invalid batch operation rollback');
end
$$;

-- Duplicate inside the request is atomic.
do $$
declare v_before bigint;
begin
  select count(*) into v_before from public.digital_inventory;
  begin
    perform public.admin_import_local_inventory(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '["D1","D2","D3","D4","D5","D6","D7","D8","D9","D1"]'::jsonb,
      'card_key', null, null,
      '70000000-0000-4000-8000-000000000003'
    );
    raise exception 'EXPECTED_DUPLICATE_IN_REQUEST';
  exception when others then
    if sqlerrm <> 'DUPLICATE_IN_REQUEST' then raise; end if;
  end;
  perform public.ci_assert((select count(*) from public.digital_inventory) = v_before, 'request duplicate rollback');
end
$$;

-- One existing duplicate also rolls back every new item.
do $$
declare v_before bigint;
begin
  select count(*) into v_before from public.digital_inventory;
  begin
    perform public.admin_import_local_inventory(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '["E1","E2","E3","E4","E5","E6","E7","E8","E9","BASE-SECRET-A"]'::jsonb,
      'card_key', null, null,
      '70000000-0000-4000-8000-000000000004'
    );
    raise exception 'EXPECTED_DUPLICATE_EXISTING';
  exception when others then
    if sqlerrm <> 'DUPLICATE_EXISTING' then raise; end if;
  end;
  perform public.ci_assert((select count(*) from public.digital_inventory) = v_before, 'existing duplicate rollback');
end
$$;

-- Wrong product and wrong SKU write nothing.
do $$
declare v_before bigint;
begin
  select count(*) into v_before from public.digital_inventory;
  begin
    perform public.admin_import_local_inventory(
      '10000000-0000-4000-8000-000000000099', null,
      '["WRONG-PRODUCT"]'::jsonb, 'card_key', null, null,
      '70000000-0000-4000-8000-000000000005'
    );
    raise exception 'EXPECTED_INVALID_PRODUCT';
  exception when others then if sqlerrm <> 'INVALID_PRODUCT' then raise; end if; end;
  begin
    perform public.admin_import_local_inventory(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000003',
      '["WRONG-SKU"]'::jsonb, 'card_key', null, null,
      '70000000-0000-4000-8000-000000000006'
    );
    raise exception 'EXPECTED_SKU_PRODUCT_MISMATCH';
  exception when others then if sqlerrm <> 'SKU_PRODUCT_MISMATCH' then raise; end if; end;
  perform public.ci_assert((select count(*) from public.digital_inventory) = v_before, 'wrong product or SKU rollback');
end
$$;

-- Audit failure must roll back the entire import.
reset role;
alter table public.admin_audit_logs add constraint ci_block_import_audit check (action <> 'import_local_inventory');
set role authenticated;
do $$
declare v_before bigint;
begin
  select count(*) into v_before from public.digital_inventory;
  begin
    perform public.admin_import_local_inventory(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '["AUDIT-ROLLBACK-SECRET"]'::jsonb, 'card_key', null, null,
      '70000000-0000-4000-8000-000000000007'
    );
    raise exception 'EXPECTED_AUDIT_FAILURE';
  exception when check_violation then null;
  end;
  perform public.ci_assert((select count(*) from public.digital_inventory) = v_before, 'audit failure import rollback');
  perform public.ci_assert(not exists (
    select 1 from public.admin_local_inventory_operations
    where request_id = '70000000-0000-4000-8000-000000000007'
  ), 'audit failure operation rollback');
end
$$;
reset role;
alter table public.admin_audit_logs drop constraint ci_block_import_audit;
set role authenticated;

-- Create ten transition candidates.
select public.admin_import_local_inventory(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10"]'::jsonb,
  'redeem_code', 'transition', 'ci.txt',
  '70000000-0000-4000-8000-000000000008'
);

-- Exact-set failure: 9 existing IDs + 1 missing ID must change zero rows.
do $$
declare v_ids uuid[]; v_items jsonb; v_before_disabled bigint;
begin
  select array_agg(id order by id) into v_ids
  from (select id from public.digital_inventory where sku_id='20000000-0000-4000-8000-000000000002' order by id limit 9) as chosen;
  v_items := public.ci_transition_items(v_ids)
    || jsonb_build_array(jsonb_build_object(
      'inventory_id','50000000-0000-4000-8000-000000000099',
      'expected_updated_at','2026-10-06T00:00:00Z',
      'expected_status','available'
    ));
  select count(*) into v_before_disabled from public.digital_inventory where status='disabled';
  begin
    perform public.admin_transition_local_inventory(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      v_items, 'disabled', 'exact set',
      '70000000-0000-4000-8000-000000000009'
    );
    raise exception 'EXPECTED_INVENTORY_NOT_FOUND';
  exception when others then if sqlerrm <> 'INVENTORY_NOT_FOUND' then raise; end if; end;
  perform public.ci_assert((select count(*) from public.digital_inventory where status='disabled') = v_before_disabled, 'transition exact set rollback');
end
$$;

-- Wrong ownership is atomic.
do $$
declare v_id uuid; v_items jsonb;
begin
  select id into v_id from public.digital_inventory where sku_id='20000000-0000-4000-8000-000000000002' order by id limit 1;
  v_items := public.ci_transition_items(array[v_id]);
  begin
    perform public.admin_transition_local_inventory(
      '10000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003',
      v_items, 'disabled', null,
      '70000000-0000-4000-8000-000000000010'
    );
    raise exception 'EXPECTED_OWNERSHIP_MISMATCH';
  exception when others then if sqlerrm <> 'INVENTORY_OWNERSHIP_MISMATCH' then raise; end if; end;
end
$$;

-- Optimistic concurrency: B changes the row, then A's old snapshot writes nothing.
do $$
declare v_id uuid; v_old jsonb; v_current jsonb;
begin
  select id into v_id from public.digital_inventory where sku_id='20000000-0000-4000-8000-000000000002' and status='available' order by id limit 1;
  v_old := public.ci_transition_items(array[v_id]);
  perform public.admin_transition_local_inventory(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    v_old, 'disabled', 'admin B',
    '70000000-0000-4000-8000-000000000011'
  );
  perform public.ci_assert(
    (public.admin_transition_local_inventory(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      v_old, 'disabled', 'admin B',
      '70000000-0000-4000-8000-000000000011'
    )->>'updated_count')::integer = 1,
    'transition idempotent retry'
  );
  begin
    perform public.admin_transition_local_inventory(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      v_old, 'disabled', 'different semantic payload',
      '70000000-0000-4000-8000-000000000011'
    );
    raise exception 'EXPECTED_IDEMPOTENCY_CONFLICT';
  exception when others then
    if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  begin
    perform public.admin_transition_local_inventory(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      v_old, 'disabled', 'admin A stale',
      '70000000-0000-4000-8000-000000000012'
    );
    raise exception 'EXPECTED_STALE_STATE';
  exception when serialization_failure then
    if sqlerrm <> 'STALE_STATE' then raise; end if;
  end;
  perform public.ci_assert((select status='disabled' from public.digital_inventory where id=v_id), 'stale row remains disabled');
  perform public.ci_assert(
    (select stock = 11 from public.products where id='10000000-0000-4000-8000-000000000001'),
    'P2.5A diagnostics decreases after disable'
  );
  v_current := public.ci_transition_items(array[v_id]);
  perform public.admin_transition_local_inventory(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    v_current, 'available', 'restore',
    '70000000-0000-4000-8000-000000000013'
  );
  perform public.ci_assert(
    (select stock = 12 from public.products where id='10000000-0000-4000-8000-000000000001'),
    'P2.5A diagnostics restores available count'
  );
end
$$;

-- Reserved and delivered states are never mutable by Admin transitions.
do $$
declare v_reserved uuid; v_delivered uuid; v_items jsonb;
begin
  select id into v_reserved from public.digital_inventory where sku_id='20000000-0000-4000-8000-000000000002' and status='available' order by id limit 1;
  update public.digital_inventory set status='reserved', reserved_at=now() where id=v_reserved;
  v_items := public.ci_transition_items(array[v_reserved]);
  begin
    perform public.admin_transition_local_inventory(
      '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
      v_items,'disabled',null,'70000000-0000-4000-8000-000000000014');
    raise exception 'EXPECTED_RESERVED_BLOCK';
  exception when others then if sqlerrm <> 'INVENTORY_HAS_RESERVATION' then raise; end if; end;
  perform public.ci_assert((select status='reserved' from public.digital_inventory where id=v_reserved), 'reserved unchanged');

  select id into v_delivered from public.digital_inventory where sku_id='20000000-0000-4000-8000-000000000002' and status='available' order by id limit 1;
  update public.digital_inventory set status='delivered', delivered_at=now() where id=v_delivered;
  v_items := public.ci_transition_items(array[v_delivered]);
  begin
    perform public.admin_transition_local_inventory(
      '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
      v_items,'disabled',null,'70000000-0000-4000-8000-000000000015');
    raise exception 'EXPECTED_DELIVERED_BLOCK';
  exception when others then if sqlerrm <> 'INVENTORY_ALREADY_DELIVERED' then raise; end if; end;
  perform public.ci_assert((select status='delivered' from public.digital_inventory where id=v_delivered), 'delivered unchanged');
end
$$;

-- Historical stale-link fixtures fail closed and are never repaired by Admin RPCs.
do $$
declare v_stale_reserved uuid; v_stale_delivery uuid; v_items jsonb;
begin
  insert into public.orders(id) values ('60000000-0000-4000-8000-000000000001');
  insert into public.digital_inventory(product_id,sku_id,content,content_hash,status,reserved_order_id,reserved_at)
  values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','STALE-RESERVATION',encode(extensions.digest('STALE-RESERVATION','sha256'),'hex'),'available','60000000-0000-4000-8000-000000000001',now())
  returning id into v_stale_reserved;
  v_items := public.ci_transition_items(array[v_stale_reserved]);
  begin
    perform public.admin_transition_local_inventory(
      '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
      v_items,'disabled',null,'70000000-0000-4000-8000-000000000016');
    raise exception 'EXPECTED_RESERVATION_EVIDENCE_BLOCK';
  exception when others then if sqlerrm <> 'INVENTORY_HAS_RESERVATION' then raise; end if; end;
  perform public.ci_assert((select status='available' and reserved_order_id is not null from public.digital_inventory where id=v_stale_reserved), 'stale reservation preserved fail closed');

  insert into public.digital_inventory(product_id,sku_id,content,content_hash,status)
  values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','STALE-DELIVERY',encode(extensions.digest('STALE-DELIVERY','sha256'),'hex'),'disabled')
  returning id into v_stale_delivery;
  insert into public.order_deliveries(inventory_id,delivery_status) values(v_stale_delivery,'delivered');
  v_items := public.ci_transition_items(array[v_stale_delivery]);
  begin
    perform public.admin_transition_local_inventory(
      '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
      v_items,'available',null,'70000000-0000-4000-8000-000000000017');
    raise exception 'EXPECTED_DELIVERY_EVIDENCE_BLOCK';
  exception when others then if sqlerrm <> 'INVENTORY_ALREADY_DELIVERED' then raise; end if; end;
  perform public.ci_assert((select status='disabled' from public.digital_inventory where id=v_stale_delivery), 'delivery evidence preserved fail closed');
end
$$;

-- Expired and invalid rows cannot be restored.
do $$
declare v_expired uuid; v_invalid uuid; v_items jsonb;
begin
  insert into public.digital_inventory(product_id,sku_id,content,status)
  values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','EXPIRED-ROW','expired') returning id into v_expired;
  insert into public.digital_inventory(product_id,sku_id,content,status)
  values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','INVALID-ROW','invalid') returning id into v_invalid;
  v_items := public.ci_transition_items(array[v_expired,v_invalid]);
  begin
    perform public.admin_transition_local_inventory(
      '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
      v_items,'available',null,'70000000-0000-4000-8000-000000000018');
    raise exception 'EXPECTED_INVALID_STATE';
  exception when others then if sqlerrm <> 'INVALID_STATE' then raise; end if; end;
end
$$;

-- Transition audit failure is atomic.
reset role;
alter table public.admin_audit_logs add constraint ci_block_transition_audit check (action <> 'transition_local_inventory');
set role authenticated;
do $$
declare v_id uuid; v_items jsonb;
begin
  select id into v_id from public.digital_inventory where sku_id='20000000-0000-4000-8000-000000000002' and status='available' and reserved_order_id is null order by id limit 1;
  v_items := public.ci_transition_items(array[v_id]);
  begin
    perform public.admin_transition_local_inventory(
      '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
      v_items,'disabled','audit rollback','70000000-0000-4000-8000-000000000019');
    raise exception 'EXPECTED_AUDIT_FAILURE';
  exception when check_violation then null;
  end;
  perform public.ci_assert((select status='available' from public.digital_inventory where id=v_id), 'transition audit rollback');
  perform public.ci_assert(not exists(select 1 from public.admin_local_inventory_operations where request_id='70000000-0000-4000-8000-000000000019'), 'transition operation rollback');
end
$$;
reset role;
alter table public.admin_audit_logs drop constraint ci_block_transition_audit;
set role authenticated;

-- Secret-free audit and masked list response.
select public.ci_assert(
  not exists (
    select 1 from public.admin_audit_logs
    where metadata::text like '%BASE-SECRET-A%'
       or coalesce(target_label,'') like '%BASE-SECRET-A%'
       or coalesce(error_message,'') like '%BASE-SECRET-A%'
  ),
  'audit contains no inventory secret'
);
select public.ci_assert(
  not exists (
    select 1 from public.admin_list_digital_inventory_items_v2(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001','all',1,50
    ) where masked_content = 'BASE-SECRET-A'
  ),
  'list response is masked'
);

-- ACL contract: only authenticated can invoke; raw tables remain unavailable.
reset role;
select public.ci_assert(not has_function_privilege('public','public.admin_import_local_inventory(uuid,uuid,jsonb,text,text,text,uuid)','EXECUTE'), 'PUBLIC import execute revoked');
select public.ci_assert(not has_function_privilege('anon','public.admin_import_local_inventory(uuid,uuid,jsonb,text,text,text,uuid)','EXECUTE'), 'anon import execute revoked');
select public.ci_assert(has_function_privilege('authenticated','public.admin_import_local_inventory(uuid,uuid,jsonb,text,text,text,uuid)','EXECUTE'), 'authenticated import execute granted');
select public.ci_assert(not has_table_privilege('authenticated','public.admin_local_inventory_operations','SELECT'), 'operation table private');

select 'ADMIN_LOCAL_INVENTORY_ATOMICITY_CASES_PASS';
