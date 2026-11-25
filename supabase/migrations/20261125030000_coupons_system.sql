-- Coupon System v1: coupons, coupon_redemptions, orders discount columns, strict RLS, and atomic SECURITY DEFINER RPCs.
-- Designed to prevent enumeration, concurrent double-redemption, negative totals, and direct anon/authenticated table access.

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  batch_label text,
  discount_type text not null default 'fixed' check (discount_type in ('fixed')),
  discount_amount numeric(12,2) not null check (discount_amount > 0),
  min_order_amount numeric(12,2) not null default 0 check (min_order_amount >= 0),
  max_uses integer not null default 1 check (max_uses >= 1),
  used_count integer not null default 0 check (used_count >= 0),
  status text not null default 'active' check (status in ('active', 'disabled', 'exhausted')),
  starts_at timestamptz,
  expires_at timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_code_upper_trimmed check (code = upper(btrim(code)) and length(code) between 4 and 40),
  constraint coupons_used_not_exceed_max check (used_count <= max_uses)
);

create index if not exists idx_coupons_status_created on public.coupons (status, created_at desc);
create index if not exists idx_coupons_batch_label on public.coupons (batch_label) where batch_label is not null;

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  coupon_code text not null,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  user_id uuid not null,
  original_amount numeric(12,2) not null check (original_amount >= 0),
  discount_amount numeric(12,2) not null check (discount_amount >= 0),
  final_amount numeric(12,2) not null check (final_amount >= 0.01),
  status text not null default 'applied' check (status in ('applied', 'released')),
  created_at timestamptz not null default now(),
  released_at timestamptz
);

create index if not exists idx_coupon_redemptions_coupon_id on public.coupon_redemptions (coupon_id, created_at desc);
create index if not exists idx_coupon_redemptions_user_id on public.coupon_redemptions (user_id, created_at desc);

alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists discount_amount numeric(12,2) not null default 0;
alter table public.orders add column if not exists original_total_amount numeric(12,2);

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;

-- Lock down direct client access: attackers extracting anon key cannot enumerate or read coupons.
revoke all on table public.coupons from public, anon, authenticated;
revoke all on table public.coupon_redemptions from public, anon, authenticated;
grant all on table public.coupons to service_role;
grant all on table public.coupon_redemptions to service_role;

create or replace function public.apply_coupon_to_order(
  p_order_id uuid,
  p_user_id uuid,
  p_coupon_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_coupon_code, '')));
  v_order public.orders%rowtype;
  v_coupon public.coupons%rowtype;
  v_existing public.coupon_redemptions%rowtype;
  v_original numeric(12,2);
  v_discount numeric(12,2);
  v_final numeric(12,2);
  v_next_used integer;
  v_next_status text;
begin
  if v_code = '' then
    return jsonb_build_object('ok', false, 'code', 'COUPON_CODE_EMPTY', 'error', '请输入优惠券码');
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND', 'error', '订单不存在');
  end if;

  if v_order.user_id <> p_user_id then
    return jsonb_build_object('ok', false, 'code', 'ORDER_FORBIDDEN', 'error', '无权操作该订单');
  end if;

  -- Idempotency: if this exact order already has an applied redemption, return it safely.
  select * into v_existing
  from public.coupon_redemptions
  where order_id = p_order_id and status = 'applied';

  if found then
    if v_existing.coupon_code = v_code then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'coupon_code', v_existing.coupon_code,
        'original_amount', v_existing.original_amount,
        'discount_amount', v_existing.discount_amount,
        'final_amount', v_existing.final_amount
      );
    else
      return jsonb_build_object('ok', false, 'code', 'ORDER_COUPON_ALREADY_APPLIED', 'error', '该订单已使用其他优惠券');
    end if;
  end if;

  if coalesce(v_order.payment_status, 'unpaid') <> 'unpaid' or coalesce(v_order.status, '') <> 'pending_payment' then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_ELIGIBLE', 'error', '当前订单状态不可使用优惠券');
  end if;

  select * into v_coupon
  from public.coupons
  where code = v_code
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'COUPON_NOT_FOUND', 'error', '优惠券不存在或无效');
  end if;

  if v_coupon.status = 'disabled' then
    return jsonb_build_object('ok', false, 'code', 'COUPON_DISABLED', 'error', '该优惠券已停用');
  end if;

  if v_coupon.status = 'exhausted' or v_coupon.used_count >= v_coupon.max_uses then
    return jsonb_build_object('ok', false, 'code', 'COUPON_EXHAUSTED', 'error', '该优惠券已被使用完');
  end if;

  if v_coupon.starts_at is not null and now() < v_coupon.starts_at then
    return jsonb_build_object('ok', false, 'code', 'COUPON_NOT_STARTED', 'error', '该优惠券尚未到生效时间');
  end if;

  if v_coupon.expires_at is not null and now() > v_coupon.expires_at then
    return jsonb_build_object('ok', false, 'code', 'COUPON_EXPIRED', 'error', '该优惠券已过期');
  end if;

  v_original := coalesce(v_order.original_total_amount, v_order.total_amount);
  if v_original < v_coupon.min_order_amount then
    return jsonb_build_object(
      'ok', false,
      'code', 'COUPON_MIN_AMOUNT_NOT_MET',
      'error', format('订单金额需满 ¥%s 才可使用该优惠券', to_char(v_coupon.min_order_amount, 'FM999999990.00'))
    );
  end if;

  if v_original <= 0.01 then
    return jsonb_build_object('ok', false, 'code', 'ORDER_AMOUNT_TOO_SMALL', 'error', '当前订单金额过低，无法叠加优惠券');
  end if;

  -- Floor final payable amount at ¥0.01 so all online payment channels & wallet flows stay strictly positive.
  v_discount := least(v_coupon.discount_amount, round(v_original - 0.01, 2));
  if v_discount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'COUPON_NO_DISCOUNT', 'error', '当前订单金额无法应用该优惠券');
  end if;
  v_final := round(v_original - v_discount, 2);

  v_next_used := v_coupon.used_count + 1;
  v_next_status := case when v_next_used >= v_coupon.max_uses then 'exhausted' else 'active' end;

  update public.coupons
  set used_count = v_next_used,
      status = v_next_status,
      updated_at = now()
  where id = v_coupon.id;

  insert into public.coupon_redemptions (
    coupon_id, coupon_code, order_id, user_id, original_amount, discount_amount, final_amount, status
  ) values (
    v_coupon.id, v_coupon.code, p_order_id, p_user_id, v_original, v_discount, v_final, 'applied'
  );

  update public.orders
  set original_total_amount = v_original,
      discount_amount = v_discount,
      total_amount = v_final,
      coupon_code = v_coupon.code,
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'coupon_id', v_coupon.id,
    'coupon_code', v_coupon.code,
    'original_amount', v_original,
    'discount_amount', v_discount,
    'final_amount', v_final
  );
end;
$$;

create or replace function public.release_order_coupon(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption public.coupon_redemptions%rowtype;
  v_coupon public.coupons%rowtype;
begin
  select * into v_redemption
  from public.coupon_redemptions
  where order_id = p_order_id and status = 'applied'
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'released', false);
  end if;

  select * into v_coupon
  from public.coupons
  where id = v_redemption.coupon_id
  for update;

  if found then
    update public.coupons
    set used_count = greatest(used_count - 1, 0),
        status = case when status = 'exhausted' and greatest(used_count - 1, 0) < max_uses then 'active' else status end,
        updated_at = now()
    where id = v_coupon.id;
  end if;

  update public.coupon_redemptions
  set status = 'released',
      released_at = now()
  where id = v_redemption.id;

  return jsonb_build_object('ok', true, 'released', true, 'coupon_code', v_redemption.coupon_code);
end;
$$;

revoke all on function public.apply_coupon_to_order(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.apply_coupon_to_order(uuid, uuid, text) to service_role;

revoke all on function public.release_order_coupon(uuid) from public, anon, authenticated;
grant execute on function public.release_order_coupon(uuid) to service_role;
