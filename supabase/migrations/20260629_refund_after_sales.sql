-- Refund and after-sales workflow for Jianlian Shop.
-- Execute manually in Supabase SQL Editor. This migration is additive and idempotent.
-- It does not call any real refund provider and does not delete historical order/payment/delivery data.

create extension if not exists pgcrypto;

alter table if exists public.orders
  add column if not exists refund_status text not null default 'none',
  add column if not exists refunded_amount numeric(18, 6) not null default 0;

alter table if exists public.orders drop constraint if exists orders_refund_status_check;
alter table if exists public.orders
  add constraint orders_refund_status_check
  check (refund_status in ('none','partial','processing','full','failed'));

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  refund_no text not null unique,
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id uuid references public.order_payments(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null default 'refund',
  reason_code text not null default 'other',
  reason_detail text,
  contact_info text,
  requested_amount numeric(18, 6) not null,
  approved_amount numeric(18, 6),
  currency text not null default 'CNY',
  status text not null default 'requested',
  refund_method text not null default 'balance',
  provider_refund_id text,
  provider_status text,
  delivery_status_snapshot jsonb not null default '{}'::jsonb,
  review_note text,
  user_visible_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  client_request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refund_requests_type_check check (request_type in ('refund','after_sales')),
  constraint refund_requests_status_check check (status in ('requested','reviewing','approved','processing','succeeded','rejected','failed','cancelled')),
  constraint refund_requests_method_check check (refund_method in ('balance','external','manual')),
  constraint refund_requests_amount_check check (requested_amount > 0 and (approved_amount is null or approved_amount >= 0)),
  constraint refund_requests_reason_check check (length(btrim(reason_code)) > 0)
);

create unique index if not exists refund_requests_user_client_request_unique
  on public.refund_requests(user_id, client_request_id)
  where client_request_id is not null and client_request_id <> '';

create unique index if not exists refund_requests_provider_refund_unique
  on public.refund_requests(provider_refund_id)
  where provider_refund_id is not null and provider_refund_id <> '';

create unique index if not exists refund_requests_active_order_unique
  on public.refund_requests(order_id)
  where status in ('requested','reviewing','approved','processing');

create index if not exists refund_requests_user_created_idx on public.refund_requests(user_id, created_at desc);
create index if not exists refund_requests_status_created_idx on public.refund_requests(status, created_at desc);
create index if not exists refund_requests_order_idx on public.refund_requests(order_id);
create index if not exists refund_requests_refund_no_idx on public.refund_requests(refund_no);

create table if not exists public.refund_status_logs (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.refund_requests(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  operator_id uuid references auth.users(id) on delete set null,
  operator_type text not null default 'system',
  note text,
  created_at timestamptz not null default now(),
  constraint refund_status_logs_operator_check check (operator_type in ('user','admin','system','provider'))
);

create index if not exists refund_status_logs_refund_created_idx on public.refund_status_logs(refund_id, created_at desc);
create index if not exists refund_status_logs_order_created_idx on public.refund_status_logs(order_id, created_at desc);

create table if not exists public.site_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'system',
  title text not null,
  content text not null,
  link_url text,
  related_type text,
  related_id uuid,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists site_notifications_dedupe_unique
  on public.site_notifications(dedupe_key)
  where dedupe_key is not null and dedupe_key <> '';
create index if not exists site_notifications_user_created_idx on public.site_notifications(user_id, created_at desc);

create or replace function public.set_refund_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_refund_requests_updated_at on public.refund_requests;
create trigger trg_refund_requests_updated_at
before update on public.refund_requests
for each row execute function public.set_refund_requests_updated_at();

alter table public.refund_requests enable row level security;
alter table public.refund_status_logs enable row level security;
alter table public.site_notifications enable row level security;

drop policy if exists "Users read own refund requests" on public.refund_requests;
create policy "Users read own refund requests"
  on public.refund_requests for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Admins read all refund requests" on public.refund_requests;
create policy "Admins read all refund requests"
  on public.refund_requests for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "Deny direct refund request writes" on public.refund_requests;
create policy "Deny direct refund request writes"
  on public.refund_requests for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists "Users read own refund status logs" on public.refund_status_logs;
create policy "Users read own refund status logs"
  on public.refund_status_logs for select
  to authenticated
  using (exists (select 1 from public.refund_requests r where r.id = refund_id and r.user_id = auth.uid()));

drop policy if exists "Admins read all refund status logs" on public.refund_status_logs;
create policy "Admins read all refund status logs"
  on public.refund_status_logs for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "Users read own notifications" on public.site_notifications;
create policy "Users read own notifications"
  on public.site_notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Admins read all notifications" on public.site_notifications;
create policy "Admins read all notifications"
  on public.site_notifications for select
  to authenticated
  using (public.is_admin(auth.uid()));

revoke all on table public.refund_requests from anon;
revoke all on table public.refund_status_logs from anon;
revoke all on table public.site_notifications from anon;
grant select on table public.refund_requests to authenticated;
grant select on table public.refund_status_logs to authenticated;
grant select on table public.site_notifications to authenticated;
grant all on table public.refund_requests to service_role;
grant all on table public.refund_status_logs to service_role;
grant all on table public.site_notifications to service_role;

create or replace function public.generate_refund_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := 'RF' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') || lpad(floor(random() * 10000)::int::text, 4, '0');
    exit when not exists (select 1 from public.refund_requests where refund_no = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.get_order_refundable_amount(p_order_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_succeeded numeric(18, 6) := 0;
  v_processing numeric(18, 6) := 0;
begin
  select * into v_order from public.orders where id = p_order_id limit 1;
  if not found or coalesce(v_order.payment_status, 'unpaid') <> 'paid' then
    return 0;
  end if;

  select coalesce(sum(coalesce(approved_amount, requested_amount)), 0)
    into v_succeeded
  from public.refund_requests
  where order_id = p_order_id and status = 'succeeded';

  select coalesce(sum(coalesce(approved_amount, requested_amount)), 0)
    into v_processing
  from public.refund_requests
  where order_id = p_order_id and status in ('requested','reviewing','approved','processing');

  return greatest(round((coalesce(v_order.total_amount, 0) - v_succeeded - v_processing)::numeric, 6), 0);
end;
$$;

create or replace function public.get_order_refundable_amount_excluding(p_order_id uuid, p_refund_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_succeeded numeric(18, 6) := 0;
  v_processing numeric(18, 6) := 0;
begin
  select * into v_order from public.orders where id = p_order_id limit 1;
  if not found or coalesce(v_order.payment_status, 'unpaid') <> 'paid' then
    return 0;
  end if;

  select coalesce(sum(coalesce(approved_amount, requested_amount)), 0)
    into v_succeeded
  from public.refund_requests
  where order_id = p_order_id and status = 'succeeded' and id <> p_refund_id;

  select coalesce(sum(coalesce(approved_amount, requested_amount)), 0)
    into v_processing
  from public.refund_requests
  where order_id = p_order_id and status in ('requested','reviewing','approved','processing') and id <> p_refund_id;

  return greatest(round((coalesce(v_order.total_amount, 0) - v_succeeded - v_processing)::numeric, 6), 0);
end;
$$;

create or replace function public.create_refund_request(
  p_order_no text,
  p_reason_code text,
  p_reason_detail text,
  p_requested_amount numeric,
  p_contact_info text default null,
  p_client_request_id text default null
)
returns public.refund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders;
  v_payment public.order_payments;
  v_existing public.refund_requests;
  v_refund public.refund_requests;
  v_refundable numeric(18, 6);
  v_amount numeric(18, 6) := round(coalesce(p_requested_amount, 0)::numeric, 6);
  v_delivery_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception '请先登录后再申请退款';
  end if;
  if v_amount <= 0 then
    raise exception '退款金额必须大于 0';
  end if;
  if length(btrim(coalesce(p_reason_code, ''))) = 0 then
    raise exception '请选择退款原因';
  end if;

  if nullif(btrim(coalesce(p_client_request_id, '')), '') is not null then
    select * into v_existing
    from public.refund_requests
    where user_id = v_user_id and client_request_id = btrim(p_client_request_id)
    limit 1;
    if found then
      return v_existing;
    end if;
  end if;

  select * into v_order
  from public.orders
  where order_no = btrim(p_order_no) and user_id = v_user_id
  for update;
  if not found then
    raise exception '订单不存在或无权申请退款';
  end if;
  if coalesce(v_order.payment_status, 'unpaid') <> 'paid' then
    raise exception '未支付订单不能申请退款';
  end if;
  if v_order.status in ('cancelled','refunded','failed') or coalesce(v_order.refund_status, 'none') = 'full' then
    raise exception '当前订单状态不能重复申请退款';
  end if;

  if exists (
    select 1 from public.refund_requests
    where order_id = v_order.id and status in ('requested','reviewing','approved','processing')
  ) then
    raise exception '该订单已有处理中的退款申请';
  end if;

  v_refundable := public.get_order_refundable_amount(v_order.id);
  if v_amount > v_refundable then
    raise exception '申请金额超过当前可退金额';
  end if;

  select * into v_payment
  from public.order_payments
  where order_id = v_order.id and status = 'paid'
  order by paid_at desc nulls last, updated_at desc
  limit 1;

  select jsonb_build_object(
    'delivered_count', count(*) filter (where coalesce(delivery_status, '') in ('delivered')),
    'pending_count', count(*) filter (where coalesce(delivery_status, '') in ('pending','processing')),
    'failed_count', count(*) filter (where coalesce(delivery_status, '') = 'failed')
  ) into v_delivery_snapshot
  from public.order_deliveries
  where order_id = v_order.id;

  insert into public.refund_requests (
    refund_no, order_id, payment_id, user_id, reason_code, reason_detail, contact_info,
    requested_amount, currency, status, refund_method, delivery_status_snapshot, client_request_id
  ) values (
    public.generate_refund_no(), v_order.id, v_payment.id, v_user_id, btrim(p_reason_code), nullif(btrim(coalesce(p_reason_detail, '')), ''), nullif(btrim(coalesce(p_contact_info, '')), ''),
    v_amount, coalesce(v_order.currency, 'CNY'), 'requested', case when coalesce(v_order.payment_method, '') = 'balance' then 'balance' else 'external' end,
    coalesce(v_delivery_snapshot, '{}'::jsonb), nullif(btrim(coalesce(p_client_request_id, '')), '')
  ) returning * into v_refund;

  update public.orders
  set refund_status = 'processing', updated_at = now()
  where id = v_order.id;

  insert into public.refund_status_logs(refund_id, order_id, from_status, to_status, operator_id, operator_type, note)
  values (v_refund.id, v_order.id, null, 'requested', v_user_id, 'user', '用户提交退款申请');

  insert into public.site_notifications(user_id, type, title, content, link_url, related_type, related_id, dedupe_key)
  values (v_user_id, 'refund', '退款申请已提交', '您的退款申请已提交，请等待管理员审核。', '/account/orders/' || v_order.order_no, 'refund', v_refund.id, 'refund-submitted-' || v_refund.id::text)
  on conflict do nothing;

  return v_refund;
end;
$$;

create or replace function public.admin_process_refund_request(
  p_refund_id uuid,
  p_action text,
  p_approved_amount numeric default null,
  p_review_note text default null,
  p_user_visible_note text default null,
  p_provider_refund_id text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_refund public.refund_requests;
  v_order public.orders;
  v_profile public.profiles;
  v_before_status text;
  v_next_status text;
  v_amount numeric(18, 6);
  v_refundable numeric(18, 6);
  v_before_balance numeric(18, 6);
  v_after_balance numeric(18, 6);
  v_transaction public.balance_transactions;
  v_transaction_no text;
  v_already public.balance_transactions;
  v_full_refund boolean;
  v_note text := btrim(coalesce(p_review_note, ''));
begin
  if v_admin_id is null or not public.is_admin(v_admin_id) then
    raise exception '无退款审核权限';
  end if;
  if p_action not in ('approve_balance','reject','cancel','mark_processing','complete_external','fail') then
    raise exception '退款操作不合法';
  end if;
  if p_action in ('approve_balance','reject','cancel','mark_processing','complete_external','fail') and length(v_note) = 0 then
    raise exception '请填写审核备注';
  end if;

  select * into v_refund from public.refund_requests where id = p_refund_id for update;
  if not found then raise exception '退款申请不存在'; end if;
  if v_refund.status in ('succeeded','rejected','cancelled') then
    return jsonb_build_object('ok', true, 'idempotent', true, 'refund_no', v_refund.refund_no, 'status', v_refund.status);
  end if;

  select * into v_order from public.orders where id = v_refund.order_id for update;
  if not found then raise exception '关联订单不存在'; end if;

  v_before_status := v_refund.status;
  v_amount := round(coalesce(p_approved_amount, v_refund.approved_amount, v_refund.requested_amount, 0)::numeric, 6);

  if p_action = 'reject' then
    v_next_status := 'rejected';
    update public.refund_requests
    set status = v_next_status, reviewed_by = v_admin_id, reviewed_at = now(), review_note = v_note,
        user_visible_note = nullif(btrim(coalesce(p_user_visible_note, '')), '')
    where id = v_refund.id returning * into v_refund;

  elsif p_action = 'cancel' then
    v_next_status := 'cancelled';
    update public.refund_requests
    set status = v_next_status, reviewed_by = v_admin_id, reviewed_at = now(), review_note = v_note,
        user_visible_note = nullif(btrim(coalesce(p_user_visible_note, '')), '')
    where id = v_refund.id returning * into v_refund;

  elsif p_action = 'mark_processing' then
    v_next_status := 'processing';
    update public.refund_requests
    set status = v_next_status, approved_amount = v_amount, reviewed_by = v_admin_id, reviewed_at = now(),
        review_note = v_note, user_visible_note = nullif(btrim(coalesce(p_user_visible_note, '')), ''),
        provider_refund_id = coalesce(nullif(btrim(coalesce(p_provider_refund_id, '')), ''), provider_refund_id), provider_status = 'manual_processing'
    where id = v_refund.id returning * into v_refund;

  elsif p_action = 'fail' then
    v_next_status := 'failed';
    update public.refund_requests
    set status = v_next_status, failed_at = now(), reviewed_by = v_admin_id, reviewed_at = coalesce(reviewed_at, now()),
        review_note = v_note, user_visible_note = nullif(btrim(coalesce(p_user_visible_note, '')), ''), provider_status = 'failed'
    where id = v_refund.id returning * into v_refund;

  elsif p_action = 'complete_external' then
    if coalesce(nullif(btrim(coalesce(p_provider_refund_id, v_refund.provider_refund_id, '')), ''), '') = '' then
      raise exception '请填写外部渠道人工退款参考号';
    end if;
    v_refundable := public.get_order_refundable_amount_excluding(v_order.id, v_refund.id);
    if v_amount <= 0 or v_amount > v_refundable then
      raise exception '批准金额超过当前可退金额';
    end if;
    v_next_status := 'succeeded';
    update public.refund_requests
    set status = v_next_status, approved_amount = v_amount, refund_method = 'manual', reviewed_by = v_admin_id,
        reviewed_at = coalesce(reviewed_at, now()), completed_at = now(), review_note = v_note,
        user_visible_note = nullif(btrim(coalesce(p_user_visible_note, '')), ''),
        provider_refund_id = nullif(btrim(coalesce(p_provider_refund_id, v_refund.provider_refund_id, '')), ''),
        provider_status = 'manual_succeeded'
    where id = v_refund.id returning * into v_refund;

  elsif p_action = 'approve_balance' then
    v_refundable := public.get_order_refundable_amount_excluding(v_order.id, v_refund.id);
    if v_amount <= 0 or v_amount > v_refundable then
      raise exception '批准金额超过当前可退金额';
    end if;

    select * into v_already from public.balance_transactions
    where business_type = 'refund' and business_id = v_refund.refund_no and status = 'completed'
    limit 1;
    if found then
      v_next_status := 'succeeded';
      update public.refund_requests
      set status = v_next_status, approved_amount = coalesce(approved_amount, v_amount), refund_method = 'balance',
          reviewed_by = coalesce(reviewed_by, v_admin_id), reviewed_at = coalesce(reviewed_at, now()), completed_at = coalesce(completed_at, now()),
          review_note = coalesce(review_note, v_note), user_visible_note = coalesce(user_visible_note, nullif(btrim(coalesce(p_user_visible_note, '')), ''))
      where id = v_refund.id returning * into v_refund;
    else
      select * into v_profile from public.profiles where id = v_refund.user_id for update;
      if not found then raise exception '用户资料不存在'; end if;
      v_before_balance := coalesce(v_profile.balance, 0);
      v_after_balance := v_before_balance + v_amount;
      update public.profiles set balance = v_after_balance, updated_at = now() where id = v_refund.user_id;

      v_transaction_no := 'BT' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') || upper(substr(md5(v_refund.refund_no || random()::text), 1, 8));
      insert into public.balance_transactions(
        user_id, transaction_no, business_type, business_id, direction, amount,
        balance_before, balance_after, currency, status, remark, metadata
      ) values (
        v_refund.user_id, v_transaction_no, 'refund', v_refund.refund_no, 'credit', v_amount,
        v_before_balance, v_after_balance, coalesce(v_refund.currency, 'CNY'), 'completed', v_note,
        jsonb_build_object('refund_id', v_refund.id, 'order_id', v_order.id, 'order_no', v_order.order_no, 'admin_id', v_admin_id, 'request_id', nullif(btrim(coalesce(p_request_id, '')), ''))
      ) returning * into v_transaction;

      v_next_status := 'succeeded';
      update public.refund_requests
      set status = v_next_status, approved_amount = v_amount, refund_method = 'balance', reviewed_by = v_admin_id,
          reviewed_at = now(), completed_at = now(), review_note = v_note,
          user_visible_note = nullif(btrim(coalesce(p_user_visible_note, '')), ''), provider_status = 'balance_refunded'
      where id = v_refund.id returning * into v_refund;
    end if;
  end if;

  if v_next_status in ('succeeded','rejected','cancelled','failed') then
    update public.orders
    set refunded_amount = case when v_next_status = 'succeeded' then coalesce(refunded_amount, 0) + coalesce(v_refund.approved_amount, 0) else coalesce(refunded_amount, 0) end,
        refund_status = case
          when v_next_status = 'succeeded' and coalesce(refunded_amount, 0) + coalesce(v_refund.approved_amount, 0) >= coalesce(total_amount, 0) then 'full'
          when v_next_status = 'succeeded' then 'partial'
          when exists (select 1 from public.refund_requests r where r.order_id = v_order.id and r.status in ('requested','reviewing','approved','processing')) then 'processing'
          when v_next_status = 'failed' then 'failed'
          else case when coalesce(refunded_amount, 0) > 0 then 'partial' else 'none' end
        end,
        status = case
          when v_next_status = 'succeeded' and coalesce(refunded_amount, 0) + coalesce(v_refund.approved_amount, 0) >= coalesce(total_amount, 0) then 'refunded'
          else status
        end,
        payment_status = case
          when v_next_status = 'succeeded' and coalesce(refunded_amount, 0) + coalesce(v_refund.approved_amount, 0) >= coalesce(total_amount, 0) then 'refunded'
          else payment_status
        end,
        updated_at = now()
    where id = v_order.id;
  else
    update public.orders set refund_status = 'processing', updated_at = now() where id = v_order.id;
  end if;

  if v_next_status = 'succeeded' then
    update public.digital_inventory
    set status = 'available', reserved_order_id = null, reserved_at = null, updated_at = now()
    where reserved_order_id = v_order.id and delivered_order_id is null and status = 'reserved';
  end if;

  insert into public.refund_status_logs(refund_id, order_id, from_status, to_status, operator_id, operator_type, note)
  values (v_refund.id, v_order.id, v_before_status, coalesce(v_next_status, v_refund.status), v_admin_id, 'admin', v_note);

  insert into public.order_status_logs(order_id, from_status, to_status, operator_id, operator_type, note)
  values (v_order.id, v_order.status, (select status from public.orders where id = v_order.id), v_admin_id, 'admin', '退款处理：' || coalesce(v_next_status, v_refund.status))
  on conflict do nothing;

  insert into public.site_notifications(user_id, type, title, content, link_url, related_type, related_id, dedupe_key)
  values (
    v_refund.user_id, 'refund',
    case coalesce(v_next_status, v_refund.status)
      when 'succeeded' then '退款已完成'
      when 'rejected' then '退款申请被拒绝'
      when 'failed' then '退款处理失败'
      when 'processing' then '退款处理中'
      else '退款状态已更新'
    end,
    coalesce(nullif(v_refund.user_visible_note, ''), '您的退款申请状态已更新，请查看订单详情。'),
    '/account/orders/' || v_order.order_no,
    'refund', v_refund.id,
    'refund-status-' || v_refund.id::text || '-' || coalesce(v_next_status, v_refund.status)
  ) on conflict do nothing;

  return jsonb_build_object('ok', true, 'refund_no', v_refund.refund_no, 'status', v_refund.status, 'approved_amount', v_refund.approved_amount);
end;
$$;

revoke execute on function public.generate_refund_no() from public, anon;
revoke execute on function public.get_order_refundable_amount(uuid) from public, anon;
revoke execute on function public.get_order_refundable_amount_excluding(uuid, uuid) from public, anon;
revoke execute on function public.create_refund_request(text,text,text,numeric,text,text) from public, anon;
revoke execute on function public.admin_process_refund_request(uuid,text,numeric,text,text,text,text) from public, anon;
grant execute on function public.get_order_refundable_amount(uuid) to authenticated, service_role;
grant execute on function public.create_refund_request(text,text,text,numeric,text,text) to authenticated;
grant execute on function public.admin_process_refund_request(uuid,text,numeric,text,text,text,text) to authenticated, service_role;
grant execute on function public.generate_refund_no() to service_role;
grant execute on function public.get_order_refundable_amount_excluding(uuid, uuid) to service_role;
