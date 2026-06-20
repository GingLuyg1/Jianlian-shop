-- Manual payment records for Jianlian Shop.
-- Execute this file in Supabase SQL Editor after orders tables exist.
-- This migration does not integrate any real payment gateway.

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text unique not null,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_method text not null,
  amount numeric not null default 0,
  currency text not null default 'CNY',
  status text not null default 'submitted' check (status in ('pending', 'submitted', 'under_review', 'paid', 'rejected', 'cancelled')),
  transaction_reference text,
  proof_url text,
  proof_urls jsonb not null default '[]'::jsonb,
  user_note text,
  admin_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_payments_order_id_idx on public.order_payments(order_id);
create index if not exists order_payments_user_id_idx on public.order_payments(user_id);
create index if not exists order_payments_status_idx on public.order_payments(status);
create index if not exists order_payments_payment_method_idx on public.order_payments(payment_method);
create index if not exists order_payments_created_at_idx on public.order_payments(created_at desc);

create or replace function public.set_order_payments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_order_payments_updated_at on public.order_payments;
create trigger trg_order_payments_updated_at
before update on public.order_payments
for each row execute function public.set_order_payments_updated_at();

alter table public.order_payments enable row level security;

drop policy if exists "Users can read own payment records" on public.order_payments;
create policy "Users can read own payment records"
on public.order_payments for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read all payment records" on public.order_payments;
create policy "Admins can read all payment records"
on public.order_payments for select
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins can update payment records" on public.order_payments;
create policy "Admins can update payment records"
on public.order_payments for update
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload own payment proofs" on storage.objects;
create policy "Users can upload own payment proofs"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read own payment proofs" on storage.objects;
create policy "Users can read own payment proofs"
on storage.objects for select
to authenticated
using (
  bucket_id = 'payment-proofs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
);

drop policy if exists "Admins can manage payment proofs" on storage.objects;
create policy "Admins can manage payment proofs"
on storage.objects for all
to authenticated
using (
  bucket_id = 'payment-proofs'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  bucket_id = 'payment-proofs'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create or replace function public.generate_payment_no()
returns text
language plpgsql
as $$
declare
  candidate text;
  tries integer := 0;
begin
  loop
    candidate := 'PAY' || to_char(now(), 'YYYYMMDDHH24MISS') || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.order_payments where payment_no = candidate);
    tries := tries + 1;
    if tries > 8 then
      raise exception '无法生成唯一支付编号';
    end if;
  end loop;
  return candidate;
end;
$$;

create or replace function public.submit_order_payment(
  p_order_no text,
  p_payment_method text,
  p_transaction_reference text default null,
  p_proof_urls jsonb default '[]'::jsonb,
  p_user_note text default null
)
returns public.order_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_payment public.order_payments%rowtype;
  v_first_proof text;
begin
  if v_user_id is null then
    raise exception '请先登录';
  end if;

  select * into v_order
  from public.orders
  where order_no = p_order_no and user_id = v_user_id
  for update;

  if not found then
    raise exception '订单不存在或无权访问';
  end if;

  if v_order.status in ('cancelled', 'refunded', 'failed') then
    raise exception '当前订单状态不允许提交支付凭证';
  end if;

  if v_order.payment_status = 'paid' then
    raise exception '订单已支付';
  end if;

  if exists (
    select 1 from public.order_payments
    where order_id = v_order.id
      and status in ('submitted', 'under_review', 'paid')
  ) then
    raise exception '该订单已有待审核支付记录，请勿重复提交';
  end if;

  if jsonb_typeof(coalesce(p_proof_urls, '[]'::jsonb)) <> 'array' then
    raise exception '支付凭证格式不正确';
  end if;

  if jsonb_array_length(coalesce(p_proof_urls, '[]'::jsonb)) > 3 then
    raise exception '最多上传 3 个支付凭证';
  end if;

  select value #>> '{}' into v_first_proof
  from jsonb_array_elements(coalesce(p_proof_urls, '[]'::jsonb))
  limit 1;

  insert into public.order_payments (
    payment_no, order_id, user_id, payment_method, amount, currency, status,
    transaction_reference, proof_url, proof_urls, user_note, submitted_at
  ) values (
    public.generate_payment_no(), v_order.id, v_user_id, p_payment_method,
    v_order.total_amount, v_order.currency, 'submitted',
    nullif(trim(coalesce(p_transaction_reference, '')), ''), nullif(v_first_proof, ''),
    coalesce(p_proof_urls, '[]'::jsonb), nullif(trim(coalesce(p_user_note, '')), ''), now()
  ) returning * into v_payment;

  insert into public.order_status_logs (order_id, from_status, to_status, operator_id, operator_type, note)
  values (v_order.id, v_order.status, v_order.status, v_user_id, 'user', '用户提交支付凭证，等待人工审核');

  return v_payment;
end;
$$;

create or replace function public.admin_review_order_payment(
  p_payment_id uuid,
  p_action text,
  p_admin_note text default null
)
returns public.order_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_is_admin boolean;
  v_payment public.order_payments%rowtype;
  v_order public.orders%rowtype;
  v_next_status text;
begin
  select exists(select 1 from public.profiles where id = v_admin_id and role = 'admin') into v_is_admin;
  if v_admin_id is null or not v_is_admin then
    raise exception '无后台访问权限';
  end if;

  select * into v_payment from public.order_payments where id = p_payment_id for update;
  if not found then
    raise exception '支付记录不存在';
  end if;

  select * into v_order from public.orders where id = v_payment.order_id for update;
  if not found then
    raise exception '关联订单不存在';
  end if;

  if p_action = 'start_review' then
    if v_payment.status <> 'submitted' then raise exception '当前支付记录状态不允许开始审核'; end if;
    v_next_status := 'under_review';
  elsif p_action = 'approve' then
    if v_payment.status not in ('submitted', 'under_review') then raise exception '当前支付记录状态不允许确认到账'; end if;
    if v_order.payment_status = 'paid' then raise exception '订单已支付，不能重复确认'; end if;
    if v_order.status in ('cancelled', 'refunded', 'failed') then raise exception '当前订单状态不允许确认到账'; end if;
    v_next_status := 'paid';
  elsif p_action = 'reject' then
    if v_payment.status not in ('submitted', 'under_review') then raise exception '当前支付记录状态不允许驳回'; end if;
    if nullif(trim(coalesce(p_admin_note, '')), '') is null then raise exception '驳回支付记录必须填写原因'; end if;
    v_next_status := 'rejected';
  elsif p_action = 'cancel' then
    if v_payment.status not in ('pending', 'submitted', 'under_review') then raise exception '当前支付记录状态不允许取消'; end if;
    v_next_status := 'cancelled';
  else
    raise exception '未知审核操作';
  end if;

  update public.order_payments
  set status = v_next_status,
      admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
      reviewed_by = v_admin_id,
      reviewed_at = now()
  where id = p_payment_id
  returning * into v_payment;

  if p_action = 'approve' then
    update public.orders
    set payment_status = 'paid',
        status = case when status = 'pending_payment' then 'paid' else status end,
        payment_method = v_payment.payment_method,
        paid_at = now(),
        updated_at = now()
    where id = v_order.id;

    insert into public.order_status_logs (order_id, from_status, to_status, operator_id, operator_type, note)
    values (v_order.id, v_order.status, case when v_order.status = 'pending_payment' then 'paid' else v_order.status end,
            v_admin_id, 'admin', coalesce(nullif(trim(coalesce(p_admin_note, '')), ''), '管理员确认支付到账'));
  else
    insert into public.order_status_logs (order_id, from_status, to_status, operator_id, operator_type, note)
    values (v_order.id, v_order.status, v_order.status, v_admin_id, 'admin',
            coalesce(nullif(trim(coalesce(p_admin_note, '')), ''), '支付记录状态更新为 ' || v_next_status));
  end if;

  return v_payment;
end;
$$;

grant execute on function public.submit_order_payment(text, text, text, jsonb, text) to authenticated;
grant execute on function public.admin_review_order_payment(uuid, text, text) to authenticated;
