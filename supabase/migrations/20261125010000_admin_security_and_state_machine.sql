-- ============================================================================
-- Migration: 20261125010000_admin_security_and_state_machine.sql
-- Purpose (Idempotent):
--   1. [A-P0-1] Fix admin_users self-read RLS so disabled admins' rows are never
--      hidden as NULL and cannot fall back to profiles.role = 'admin'.
--   2. [A-P0-1] Update manage_admin_user() to synchronize profiles.role when an
--      admin is disabled or restored.
--   3. [A-P0-6] Harden admin_update_order_status() with a strict order state
--      machine transition matrix preventing completed/delivered -> cancelled or
--      unpaid -> processing/delivered/completed bypasses.
-- ============================================================================

-- 1. Allow authenticated users to read their own admin_users row regardless of
--    status so 'disabled' is explicitly visible to authorization checks.
drop policy if exists "active admins can read own authorization" on public.admin_users;
create policy "active admins can read own authorization"
on public.admin_users for select to authenticated
using (user_id = auth.uid());

-- 2. Sync profiles.role whenever manage_admin_user disables or restores an admin.
create or replace function public.manage_admin_user(
  p_target_user_id uuid,
  p_admin_level text,
  p_status text,
  p_permissions jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator_id uuid := auth.uid();
  v_before public.admin_users%rowtype;
  v_after public.admin_users%rowtype;
  v_level text;
  v_status text;
  v_permissions jsonb;
  v_action text;
  v_active_super_admins bigint;
begin
  if auth.role() <> 'service_role' and not public.is_super_admin(v_operator_id) then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;
  if p_target_user_id is null or not exists (select 1 from auth.users where id = p_target_user_id) then
    raise exception 'ADMIN_TARGET_USER_NOT_FOUND';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'ADMIN_CHANGE_REASON_REQUIRED';
  end if;
  if p_permissions is not null and jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'ADMIN_PERMISSIONS_MUST_BE_OBJECT';
  end if;

  perform pg_advisory_xact_lock(hashtext('admin_users_super_admin_management'));
  select * into v_before from public.admin_users where user_id = p_target_user_id for update;

  v_level := coalesce(nullif(btrim(p_admin_level), ''), v_before.admin_level, 'admin');
  v_status := coalesce(nullif(btrim(p_status), ''), v_before.status, 'active');
  v_permissions := coalesce(p_permissions, v_before.permissions, '{}'::jsonb);
  if v_level not in ('admin','super_admin') then raise exception 'ADMIN_LEVEL_INVALID'; end if;
  if v_status not in ('active','disabled') then raise exception 'ADMIN_STATUS_INVALID'; end if;

  if v_operator_id is not null and p_target_user_id = v_operator_id
     and (v_status = 'disabled' or v_level <> 'super_admin') then
    raise exception 'SUPER_ADMIN_SELF_DEMOTION_FORBIDDEN';
  end if;

  if v_before.user_id is not null and v_before.admin_level = 'super_admin' and v_before.status = 'active'
     and (v_level <> 'super_admin' or v_status <> 'active') then
    select count(*) into v_active_super_admins
    from public.admin_users where admin_level = 'super_admin' and status = 'active';
    if v_active_super_admins <= 1 then
      raise exception 'LAST_ACTIVE_SUPER_ADMIN_REQUIRED';
    end if;
  end if;

  insert into public.admin_users(
    user_id, admin_level, status, permissions, created_by, updated_by, reason
  ) values (
    p_target_user_id, v_level, v_status, v_permissions, v_operator_id, v_operator_id, btrim(p_reason)
  )
  on conflict (user_id) do update set
    admin_level = excluded.admin_level,
    status = excluded.status,
    permissions = excluded.permissions,
    updated_by = excluded.updated_by,
    reason = excluded.reason
  returning * into v_after;

  -- Synchronize profiles.role to eliminate stale legacy admin role flags
  update public.profiles
  set role = case when v_after.status = 'active' then 'admin' else 'user' end,
      updated_at = now()
  where id = p_target_user_id;

  v_action := case
    when v_before.user_id is null then 'created'
    when v_before.admin_level <> v_after.admin_level and v_after.admin_level = 'super_admin' then 'promoted'
    when v_before.admin_level <> v_after.admin_level then 'demoted'
    when v_before.status <> v_after.status and v_after.status = 'disabled' then 'disabled'
    when v_before.status <> v_after.status then 'restored'
    else 'updated'
  end;

  insert into public.admin_user_authorization_events(
    operator_user_id, target_user_id, action, reason, before_state, after_state
  ) values (
    v_operator_id, p_target_user_id, v_action, btrim(p_reason),
    case when v_before.user_id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after)
  );

  return jsonb_build_object(
    'user_id', v_after.user_id,
    'admin_level', v_after.admin_level,
    'status', v_after.status,
    'permissions', v_after.permissions,
    'action', v_action
  );
end;
$$;

revoke all on function public.manage_admin_user(uuid,text,text,jsonb,text) from public, anon;
grant execute on function public.manage_admin_user(uuid,text,text,jsonb,text) to authenticated, service_role;

-- 3. Strict state machine matrix for admin_update_order_status()
create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_to_status text,
  p_payment_status text default null,
  p_admin_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_from_status text;
  v_to_status text := lower(nullif(btrim(coalesce(p_to_status, '')), ''));
  v_payment_status text := lower(nullif(btrim(coalesce(p_payment_status, '')), ''));
  v_release jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin permission required';
  end if;

  if v_to_status in ('paid', 'payment_completed', 'completed_payment')
     or v_payment_status = 'paid' then
    raise exception 'ORDER_PAYMENT_STATUS_REQUIRES_PAYMENT_FLOW: use complete_payment_session / complete_order_payment for paid transitions';
  end if;

  if v_to_status not in ('pending_payment','processing','delivered','completed','cancelled','expired','refunded','failed') then
    raise exception 'invalid order status';
  end if;

  if v_payment_status is not null
     and v_payment_status not in ('unpaid','refunded','partially_refunded','failed') then
    raise exception 'invalid payment status';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order not found';
  end if;

  v_from_status := lower(coalesce(v_order.status, ''));

  -- Strict order state transition matrix (same-status note updates are permitted)
  if v_from_status <> v_to_status then
    if v_to_status = 'pending_payment' then
      raise exception 'ORDER_STATUS_TRANSITION_FORBIDDEN: 不可将订单逆转为待支付状态';
    end if;

    if v_from_status in ('completed', 'delivered', 'refunded')
       and v_to_status in ('cancelled', 'expired', 'failed') then
      raise exception 'ORDER_STATUS_TRANSITION_FORBIDDEN: 已交付、已完成或已退款的订单不可逆转为取消/过期/失败，请使用退款流程';
    end if;

    if v_from_status = 'refunded' then
      raise exception 'ORDER_STATUS_TRANSITION_FORBIDDEN: 已退款订单为终态，不可继续流转';
    end if;

    if v_from_status in ('cancelled', 'expired')
       and v_to_status in ('processing', 'delivered', 'completed', 'refunded') then
      raise exception 'ORDER_STATUS_TRANSITION_FORBIDDEN: 已取消或已过期订单不可流转为履约或完成状态';
    end if;

    if v_to_status in ('processing', 'delivered', 'completed')
       and lower(coalesce(v_order.payment_status, 'unpaid')) <> 'paid' then
      raise exception 'ORDER_STATUS_TRANSITION_FORBIDDEN: 未支付订单不可跳过支付直接进入处理中、已交付或已完成状态';
    end if;

    if v_to_status = 'refunded'
       and lower(coalesce(v_order.payment_status, 'unpaid')) <> 'paid' then
      raise exception 'ORDER_STATUS_TRANSITION_FORBIDDEN: 未支付订单不可标记为已退款';
    end if;
  end if;

  -- Only release reserved inventory when transitioning an unpaid order into cancelled/expired
  if v_to_status in ('cancelled', 'expired')
     and v_from_status not in ('cancelled', 'expired')
     and lower(coalesce(v_order.payment_status, 'unpaid')) <> 'paid' then
    v_release := public.release_order_inventory(
      p_order_id,
      'admin_status:' || v_to_status || ':' || coalesce(nullif(btrim(p_admin_note), ''), 'no_reason')
    );
  end if;

  update public.orders
  set status = v_to_status,
      payment_status = coalesce(v_payment_status, payment_status),
      admin_note = coalesce(nullif(trim(p_admin_note), ''), admin_note),
      processed_at = case when v_to_status = 'processing' and processed_at is null then now() else processed_at end,
      completed_at = case when v_to_status = 'completed' and completed_at is null then now() else completed_at end,
      cancelled_at = case when v_to_status = 'cancelled' and cancelled_at is null then now() else cancelled_at end,
      expired_at = case when v_to_status = 'expired' and expired_at is null then now() else expired_at end,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.order_status_logs (
    order_id, from_status, to_status, operator_id, operator_type, note
  ) values (
    p_order_id,
    v_from_status,
    v_to_status,
    auth.uid(),
    'admin',
    nullif(trim(coalesce(p_admin_note, '')), '')
  );

  return v_order;
end;
$$;

revoke execute on function public.admin_update_order_status(uuid,text,text,text) from anon;
grant execute on function public.admin_update_order_status(uuid,text,text,text) to authenticated, service_role;
