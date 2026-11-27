-- Promotion center (3% category-scoped commission + atomic transfer to balance)
-- and super-admin direct order refund to customer balance.
-- Forward-only, transactional, SECURITY DEFINER with fixed search_path.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- 1. Upgrade sync_referral_commission_for_order:
--    - 3% commission ONLY for "数字 / 社媒账号" (digital-accounts) and "国际 SIM 卡" (sim-cards)
--      EXCLUDING secondary category "SIM 卡服务" (id 94319387-0291-4e58-b9fd-e25fbdfbfaf1 / slug 'balance' / name match).
--    - Callable by service_role (from canonical payment completion) or authenticated admin.
create or replace function public.sync_referral_commission_for_order(
  p_order_id uuid,
  p_commission_rate numeric default 0.03
)
returns public.referral_commissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_order public.orders;
  v_referrer_id uuid;
  v_commission public.referral_commissions;
  v_eligible_subtotal numeric(18, 6) := 0;
  v_basis_amount numeric(12, 2) := 0;
  v_rate numeric(6, 4) := coalesce(p_commission_rate, 0.03);
  v_amount numeric(12, 2) := 0;
  v_is_eligible boolean;
begin
  if v_jwt_role <> 'service_role' and (auth.uid() is null or not public.is_admin(auth.uid())) then
    raise exception '无后台访问权限';
  end if;

  if v_rate <= 0 or v_rate > 0.5 then
    v_rate := 0.03;
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception '订单不存在';
  end if;

  select referred_by into v_referrer_id
  from public.profiles
  where id = v_order.user_id;

  if v_referrer_id is null or v_referrer_id = v_order.user_id then
    return null;
  end if;

  -- Sum line_total only for items in digital-accounts or sim-cards (excluding SIM 卡服务).
  select coalesce(sum(greatest(0, coalesce(oi.line_total, oi.unit_price * oi.quantity, 0))), 0)
  into v_eligible_subtotal
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  left join public.categories c on c.id = p.category_id
  left join public.categories parent_c on parent_c.id = c.parent_id
  where oi.order_id = v_order.id
    and lower(coalesce(parent_c.slug, c.slug, '')) in ('digital-accounts', 'sim-cards')
    and coalesce(c.id::text, '') <> '94319387-0291-4e58-b9fd-e25fbdfbfaf1'
    and lower(coalesce(c.slug, '')) <> 'balance'
    and coalesce(c.name, '') !~* 'sim\s*卡服务';

  v_basis_amount := round(least(coalesce(v_order.total_amount, 0), v_eligible_subtotal)::numeric, 2);

  v_is_eligible :=
    v_order.payment_status = 'paid'
    and v_order.status not in ('cancelled', 'refunded', 'failed')
    and coalesce(v_order.refund_status, 'none') not in ('full', 'partial')
    and v_basis_amount > 0;

  if v_is_eligible then
    v_amount := round((v_basis_amount * v_rate)::numeric, 2);

    if v_amount <= 0 then
      return null;
    end if;

    insert into public.referral_commissions (
      referrer_id,
      referred_user_id,
      order_id,
      order_no,
      order_amount,
      paid_at,
      referred_user_label,
      commission_rate,
      commission_amount,
      status,
      available_at
    )
    values (
      v_referrer_id,
      v_order.user_id,
      v_order.id,
      v_order.order_no,
      v_basis_amount,
      coalesce(v_order.paid_at, now()),
      v_order.customer_email,
      v_rate,
      v_amount,
      'available',
      now()
    )
    on conflict (order_id) do update
      set order_no = excluded.order_no,
          order_amount = excluded.order_amount,
          paid_at = excluded.paid_at,
          referred_user_label = excluded.referred_user_label,
          commission_rate = excluded.commission_rate,
          commission_amount = excluded.commission_amount,
          status = case
            when public.referral_commissions.status = 'withdrawn' then 'withdrawn'
            else 'available'
          end,
          available_at = coalesce(public.referral_commissions.available_at, now()),
          updated_at = now()
    returning * into v_commission;
  else
    update public.referral_commissions
    set status = case
          when status = 'withdrawn' then status
          else 'cancelled'
        end,
        updated_at = now()
    where order_id = v_order.id
    returning * into v_commission;
  end if;

  update public.profiles p
  set promotion_balance = coalesce((
    select sum(commission_amount)
    from public.referral_commissions rc
    where rc.referrer_id = p.id
      and rc.status = 'available'
  ), 0)
  where p.id = v_referrer_id;

  return v_commission;
end;
$$;

revoke all on function public.sync_referral_commission_for_order(uuid, numeric) from public;
grant execute on function public.sync_referral_commission_for_order(uuid, numeric) to authenticated, service_role;

-- 2. Atomic transfer of available promotion commission into the user's site balance ONLY.
create or replace function public.transfer_promotion_commission_to_balance(
  p_request_id text default null,
  p_min_amount numeric default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
  v_min numeric(12, 2) := greatest(0.01, round(coalesce(p_min_amount, 10)::numeric, 2));
  v_available numeric(12, 2) := 0;
  v_count integer := 0;
  v_before_balance numeric(18, 6);
  v_after_balance numeric(18, 6);
  v_req_id text := nullif(btrim(coalesce(p_request_id, '')), '');
  v_biz_id text;
  v_tx_no text;
  v_existing public.balance_transactions;
  v_commission_ids uuid[];
begin
  if v_user_id is null then
    raise exception 'PROMOTION_LOGIN_REQUIRED';
  end if;

  -- Lock user profile first for strict serializability
  select * into v_profile
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'PROMOTION_PROFILE_NOT_FOUND';
  end if;

  if v_req_id is not null then
    select * into v_existing
    from public.balance_transactions
    where business_type = 'promotion'
      and business_id = v_req_id
      and status = 'completed'
    limit 1;

    if found then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'transferred_amount', v_existing.amount,
        'balance_before', v_existing.balance_before,
        'balance_after', v_existing.balance_after,
        'transaction_no', v_existing.transaction_no
      );
    end if;
  end if;

  select array_agg(id), coalesce(round(sum(commission_amount)::numeric, 2), 0), count(*)
  into v_commission_ids, v_available, v_count
  from (
    select id, commission_amount
    from public.referral_commissions
    where referrer_id = v_user_id
      and status = 'available'
    for update
  ) locked_rows;

  if v_available <= 0 or v_count = 0 then
    raise exception 'PROMOTION_NO_AVAILABLE_COMMISSION';
  end if;

  if v_available < v_min then
    raise exception 'PROMOTION_BELOW_MIN_TRANSFER';
  end if;

  v_before_balance := coalesce(v_profile.balance, 0);
  v_after_balance := v_before_balance + v_available;
  v_biz_id := coalesce(v_req_id, 'PROMO-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || substr(md5(v_user_id::text || random()::text), 1, 8));
  v_tx_no := 'PT' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') || upper(substr(md5(v_biz_id || random()::text), 1, 8));

  update public.referral_commissions
  set status = 'withdrawn',
      withdrawn_at = now(),
      updated_at = now()
  where id = any(v_commission_ids);

  update public.profiles
  set balance = v_after_balance,
      promotion_balance = 0,
      updated_at = now()
  where id = v_user_id;

  insert into public.balance_transactions (
    user_id,
    transaction_no,
    business_type,
    business_id,
    direction,
    amount,
    balance_before,
    balance_after,
    currency,
    status,
    remark,
    metadata
  ) values (
    v_user_id,
    v_tx_no,
    'promotion',
    v_biz_id,
    'credit',
    v_available,
    v_before_balance,
    v_after_balance,
    'CNY',
    'completed',
    '推广返佣转入本站账户余额',
    jsonb_build_object(
      'commission_count', v_count,
      'commission_ids', v_commission_ids,
      'destination', 'site_balance'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'transferred_amount', v_available,
    'balance_before', v_before_balance,
    'balance_after', v_after_balance,
    'transaction_no', v_tx_no,
    'commission_count', v_count
  );
end;
$$;

revoke all on function public.transfer_promotion_commission_to_balance(text, numeric) from public;
grant execute on function public.transfer_promotion_commission_to_balance(text, numeric) to authenticated;

-- 3. Super-admin direct order refund to customer's site balance from Admin Order Detail.
--    Atomically credits profiles.balance, inserts balance_transactions + refund_requests + refund_status_logs,
--    updates orders.refunded_amount/refund_status/status/payment_status, and cancels unwithdrawn referral commission.
--    Never restores delivered digital inventory.
create or replace function public.super_admin_direct_order_refund(
  p_order_id uuid,
  p_refund_amount numeric default null,
  p_reason text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_order public.orders;
  v_profile public.profiles;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_req_id text := nullif(btrim(coalesce(p_request_id, '')), '');
  v_refundable numeric(18, 6);
  v_amount numeric(18, 6);
  v_before_balance numeric(18, 6);
  v_after_balance numeric(18, 6);
  v_new_refunded numeric(18, 6);
  v_full_refund boolean;
  v_refund_no text;
  v_tx_no text;
  v_biz_id text;
  v_existing public.balance_transactions;
  v_refund_id uuid;
  v_referrer_id uuid;
begin
  if v_admin_id is null or not public.is_admin(v_admin_id) then
    raise exception 'REFUND_ADMIN_PERMISSION_DENIED';
  end if;

  if length(v_reason) = 0 then
    raise exception 'REFUND_REASON_REQUIRED';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'REFUND_ORDER_NOT_FOUND';
  end if;

  if coalesce(v_order.payment_status, '') <> 'paid' then
    raise exception 'REFUND_ORDER_NOT_PAID';
  end if;

  if v_order.user_id is null then
    raise exception 'REFUND_ORDER_NO_USER_ACCOUNT';
  end if;

  v_biz_id := coalesce(v_req_id, 'ADMIN-RF-' || v_order.order_no);

  select * into v_existing
  from public.balance_transactions
  where business_type = 'refund'
    and business_id = v_biz_id
    and status = 'completed'
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_no', v_order.order_no,
      'refunded_amount', v_existing.amount,
      'transaction_no', v_existing.transaction_no,
      'balance_after', v_existing.balance_after
    );
  end if;

  v_refundable := round(greatest(0, coalesce(v_order.total_amount, 0) - coalesce(v_order.refunded_amount, 0))::numeric, 6);
  if v_refundable <= 0 then
    raise exception 'REFUND_ORDER_ALREADY_REFUNDED';
  end if;

  v_amount := round(coalesce(p_refund_amount, v_refundable)::numeric, 6);
  if v_amount <= 0 or v_amount > v_refundable then
    raise exception 'REFUND_AMOUNT_EXCEEDS_REFUNDABLE';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_order.user_id
  for update;

  if not found then
    raise exception 'REFUND_USER_PROFILE_NOT_FOUND';
  end if;

  v_before_balance := coalesce(v_profile.balance, 0);
  v_after_balance := v_before_balance + v_amount;
  v_refund_no := 'RF' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') || upper(substr(md5(v_order.id::text || random()::text), 1, 6));
  v_tx_no := 'BT' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') || upper(substr(md5(v_refund_no || random()::text), 1, 8));

  update public.profiles
  set balance = v_after_balance,
      updated_at = now()
  where id = v_order.user_id;

  insert into public.refund_requests (
    refund_no,
    order_id,
    user_id,
    request_type,
    reason_code,
    reason_detail,
    requested_amount,
    approved_amount,
    currency,
    status,
    refund_method,
    provider_status,
    review_note,
    user_visible_note,
    reviewed_by,
    reviewed_at,
    completed_at,
    client_request_id
  ) values (
    v_refund_no,
    v_order.id,
    v_order.user_id,
    'refund',
    'admin_direct_refund',
    v_reason,
    v_amount,
    v_amount,
    coalesce(v_order.currency, 'CNY'),
    'succeeded',
    'balance',
    'admin_balance_refunded',
    v_reason,
    '管理员已将订单金额退回至您的账户余额',
    v_admin_id,
    now(),
    now(),
    v_biz_id
  )
  returning id into v_refund_id;

  insert into public.refund_status_logs (
    refund_id,
    order_id,
    from_status,
    to_status,
    operator_id,
    operator_type,
    note
  ) values (
    v_refund_id,
    v_order.id,
    null,
    'succeeded',
    v_admin_id,
    'admin',
    v_reason
  );

  insert into public.balance_transactions (
    user_id,
    transaction_no,
    business_type,
    business_id,
    direction,
    amount,
    balance_before,
    balance_after,
    currency,
    status,
    remark,
    metadata
  ) values (
    v_order.user_id,
    v_tx_no,
    'refund',
    v_biz_id,
    'credit',
    v_amount,
    v_before_balance,
    v_after_balance,
    coalesce(v_order.currency, 'CNY'),
    'completed',
    '订单退款：' || v_order.order_no || '（' || v_reason || '）',
    jsonb_build_object(
      'refund_id', v_refund_id,
      'refund_no', v_refund_no,
      'order_id', v_order.id,
      'order_no', v_order.order_no,
      'admin_id', v_admin_id,
      'request_id', v_biz_id
    )
  );

  v_new_refunded := round((coalesce(v_order.refunded_amount, 0) + v_amount)::numeric, 6);
  v_full_refund := v_new_refunded >= round(coalesce(v_order.total_amount, 0)::numeric, 6);

  update public.orders
  set refunded_amount = v_new_refunded,
      refund_status = case when v_full_refund then 'full' else 'partial' end,
      status = case when v_full_refund then 'refunded' else status end,
      payment_status = case when v_full_refund then 'refunded' else payment_status end,
      admin_note = case
        when nullif(btrim(coalesce(admin_note, '')), '') is null then '[退款] ' || v_reason
        else admin_note || E'\n[退款] ' || v_reason
      end,
      updated_at = now()
  where id = v_order.id;

  -- Cancel unwithdrawn referral commission for refunded order
  update public.referral_commissions
  set status = 'cancelled',
      updated_at = now()
  where order_id = v_order.id
    and status in ('pending', 'available')
  returning referrer_id into v_referrer_id;

  if v_referrer_id is not null then
    update public.profiles p
    set promotion_balance = coalesce((
      select sum(commission_amount)
      from public.referral_commissions rc
      where rc.referrer_id = p.id
        and rc.status = 'available'
    ), 0)
    where p.id = v_referrer_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'refund_id', v_refund_id,
    'refund_no', v_refund_no,
    'order_id', v_order.id,
    'order_no', v_order.order_no,
    'refunded_amount', v_amount,
    'total_refunded_amount', v_new_refunded,
    'full_refund', v_full_refund,
    'balance_before', v_before_balance,
    'balance_after', v_after_balance,
    'transaction_no', v_tx_no
  );
end;
$$;

revoke all on function public.super_admin_direct_order_refund(uuid, numeric, text, text) from public;
grant execute on function public.super_admin_direct_order_refund(uuid, numeric, text, text) to authenticated;

commit;
