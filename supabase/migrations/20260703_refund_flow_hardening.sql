-- Harden refund review flow.
-- Manual execution required. This migration does not change product/order core tables.
-- Key guarantees:
-- 1. Balance refund can only complete balance-paid refunds.
-- 2. External/manual refunds cannot be marked succeeded without a real reference summary.
-- 3. Delivered digital inventory is never restored to available during refund.
-- 4. Full refunds synchronize order_payments.status to refunded when possible.
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
    raise exception 'REFUND_ADMIN_PERMISSION_DENIED';
  end if;

  if p_action not in ('approve_balance','reject','cancel','mark_processing','complete_external','fail') then
    raise exception 'INVALID_REFUND_ACTION';
  end if;

  if p_action in ('approve_balance','reject','cancel','mark_processing','complete_external','fail') and length(v_note) = 0 then
    raise exception 'REFUND_REVIEW_NOTE_REQUIRED';
  end if;

  select * into v_refund
  from public.refund_requests
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'REFUND_REQUEST_NOT_FOUND';
  end if;

  if v_refund.status in ('succeeded','rejected','cancelled') then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'refund_no', v_refund.refund_no,
      'status', v_refund.status
    );
  end if;

  select * into v_order
  from public.orders
  where id = v_refund.order_id
  for update;

  if not found then
    raise exception 'REFUND_ORDER_NOT_FOUND';
  end if;

  if p_action = 'approve_balance'
     and (coalesce(v_order.payment_method, '') <> 'balance' or coalesce(v_refund.refund_method, '') <> 'balance') then
    raise exception 'EXTERNAL_REFUND_CANNOT_USE_BALANCE_FLOW';
  end if;

  if p_action = 'complete_external'
     and (coalesce(v_order.payment_method, '') = 'balance' or coalesce(v_refund.refund_method, '') = 'balance') then
    raise exception 'BALANCE_REFUND_MUST_USE_BALANCE_FLOW';
  end if;

  v_before_status := v_refund.status;
  v_amount := round(coalesce(p_approved_amount, v_refund.approved_amount, v_refund.requested_amount, 0)::numeric, 6);

  if p_action = 'reject' then
    v_next_status := 'rejected';
    update public.refund_requests
    set status = v_next_status,
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        review_note = v_note,
        user_visible_note = nullif(btrim(coalesce(p_user_visible_note, '')), '')
    where id = v_refund.id
    returning * into v_refund;

  elsif p_action = 'cancel' then
    v_next_status := 'cancelled';
    update public.refund_requests
    set status = v_next_status,
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        review_note = v_note,
        user_visible_note = nullif(btrim(coalesce(p_user_visible_note, '')), '')
    where id = v_refund.id
    returning * into v_refund;

  elsif p_action = 'mark_processing' then
    v_next_status := 'processing';
    update public.refund_requests
    set status = v_next_status,
        approved_amount = v_amount,
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        review_note = v_note,
        user_visible_note = nullif(btrim(coalesce(p_user_visible_note, '')), ''),
        provider_refund_id = coalesce(nullif(btrim(coalesce(p_provider_refund_id, '')), ''), provider_refund_id),
        provider_status = 'manual_processing'
    where id = v_refund.id
    returning * into v_refund;

  elsif p_action = 'fail' then
    v_next_status := 'failed';
    update public.refund_requests
    set status = v_next_status,
        failed_at = now(),
        reviewed_by = v_admin_id,
        reviewed_at = coalesce(reviewed_at, now()),
        review_note = v_note,
        user_visible_note = nullif(btrim(coalesce(p_user_visible_note, '')), ''),
        provider_status = 'failed'
    where id = v_refund.id
    returning * into v_refund;

  elsif p_action = 'complete_external' then
    if coalesce(nullif(btrim(coalesce(p_provider_refund_id, v_refund.provider_refund_id, '')), ''), '') = '' then
      raise exception 'EXTERNAL_REFUND_REFERENCE_REQUIRED';
    end if;

    v_refundable := public.get_order_refundable_amount_excluding(v_order.id, v_refund.id);
    if v_amount <= 0 or v_amount > v_refundable then
      raise exception 'REFUND_AMOUNT_EXCEEDS_REFUNDABLE';
    end if;

    v_next_status := 'succeeded';
    update public.refund_requests
    set status = v_next_status,
        approved_amount = v_amount,
        refund_method = 'manual',
        reviewed_by = v_admin_id,
        reviewed_at = coalesce(reviewed_at, now()),
        completed_at = now(),
        review_note = v_note,
        user_visible_note = nullif(btrim(coalesce(p_user_visible_note, '')), ''),
        provider_refund_id = nullif(btrim(coalesce(p_provider_refund_id, v_refund.provider_refund_id, '')), ''),
        provider_status = 'manual_succeeded'
    where id = v_refund.id
    returning * into v_refund;

  elsif p_action = 'approve_balance' then
    v_refundable := public.get_order_refundable_amount_excluding(v_order.id, v_refund.id);
    if v_amount <= 0 or v_amount > v_refundable then
      raise exception 'REFUND_AMOUNT_EXCEEDS_REFUNDABLE';
    end if;

    select * into v_already
    from public.balance_transactions
    where business_type = 'refund'
      and business_id = v_refund.refund_no
      and status = 'completed'
    limit 1;

    if found then
      v_next_status := 'succeeded';
      update public.refund_requests
      set status = v_next_status,
          approved_amount = coalesce(approved_amount, v_amount),
          refund_method = 'balance',
          reviewed_by = coalesce(reviewed_by, v_admin_id),
          reviewed_at = coalesce(reviewed_at, now()),
          completed_at = coalesce(completed_at, now()),
          review_note = coalesce(review_note, v_note),
          user_visible_note = coalesce(user_visible_note, nullif(btrim(coalesce(p_user_visible_note, '')), ''))
      where id = v_refund.id
      returning * into v_refund;
    else
      select * into v_profile
      from public.profiles
      where id = v_refund.user_id
      for update;

      if not found then
        raise exception 'REFUND_USER_PROFILE_NOT_FOUND';
      end if;

      v_before_balance := coalesce(v_profile.balance, 0);
      v_after_balance := v_before_balance + v_amount;

      update public.profiles
      set balance = v_after_balance,
          updated_at = now()
      where id = v_refund.user_id;

      v_transaction_no := 'BT' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') || upper(substr(md5(v_refund.refund_no || random()::text), 1, 8));

      insert into public.balance_transactions(
        user_id, transaction_no, business_type, business_id, direction, amount,
        balance_before, balance_after, currency, status, remark, metadata
      ) values (
        v_refund.user_id,
        v_transaction_no,
        'refund',
        v_refund.refund_no,
        'credit',
        v_amount,
        v_before_balance,
        v_after_balance,
        coalesce(v_refund.currency, 'CNY'),
        'completed',
        v_note,
        jsonb_build_object(
          'refund_id', v_refund.id,
          'order_id', v_order.id,
          'order_no', v_order.order_no,
          'admin_id', v_admin_id,
          'request_id', nullif(btrim(coalesce(p_request_id, '')), '')
        )
      ) returning * into v_transaction;

      v_next_status := 'succeeded';
      update public.refund_requests
      set status = v_next_status,
          approved_amount = v_amount,
          refund_method = 'balance',
          reviewed_by = v_admin_id,
          reviewed_at = now(),
          completed_at = now(),
          review_note = v_note,
          user_visible_note = nullif(btrim(coalesce(p_user_visible_note, '')), ''),
          provider_status = 'balance_refunded'
      where id = v_refund.id
      returning * into v_refund;
    end if;
  end if;

  if v_next_status in ('succeeded','rejected','cancelled','failed') then
    update public.orders
    set refunded_amount = case
          when v_next_status = 'succeeded' then coalesce(refunded_amount, 0) + coalesce(v_refund.approved_amount, 0)
          else coalesce(refunded_amount, 0)
        end,
        refund_status = case
          when v_next_status = 'succeeded'
            and coalesce(refunded_amount, 0) + coalesce(v_refund.approved_amount, 0) >= coalesce(total_amount, 0) then 'full'
          when v_next_status = 'succeeded' then 'partial'
          when exists (
            select 1 from public.refund_requests r
            where r.order_id = v_order.id
              and r.status in ('requested','reviewing','approved','processing')
          ) then 'processing'
          when v_next_status = 'failed' then 'failed'
          else case when coalesce(refunded_amount, 0) > 0 then 'partial' else 'none' end
        end,
        status = case
          when v_next_status = 'succeeded'
            and coalesce(refunded_amount, 0) + coalesce(v_refund.approved_amount, 0) >= coalesce(total_amount, 0) then 'refunded'
          else status
        end,
        payment_status = case
          when v_next_status = 'succeeded'
            and coalesce(refunded_amount, 0) + coalesce(v_refund.approved_amount, 0) >= coalesce(total_amount, 0) then 'refunded'
          else payment_status
        end,
        updated_at = now()
    where id = v_order.id;
  else
    update public.orders
    set refund_status = 'processing',
        updated_at = now()
    where id = v_order.id;
  end if;

  if v_next_status = 'succeeded' then
    select coalesce(refunded_amount, 0) >= coalesce(total_amount, 0)
    into v_full_refund
    from public.orders
    where id = v_order.id;

    if v_full_refund and v_refund.payment_id is not null then
      update public.order_payments
      set status = 'refunded',
          updated_at = now()
      where id = v_refund.payment_id;
    end if;

    update public.digital_inventory
    set status = 'available',
        reserved_order_id = null,
        reserved_at = null,
        updated_at = now()
    where reserved_order_id = v_order.id
      and delivered_order_id is null
      and status = 'reserved';
  end if;

  insert into public.refund_status_logs(refund_id, order_id, from_status, to_status, operator_id, operator_type, note)
  values (v_refund.id, v_order.id, v_before_status, coalesce(v_next_status, v_refund.status), v_admin_id, 'admin', v_note);

  insert into public.order_status_logs(order_id, from_status, to_status, operator_id, operator_type, note)
  values (v_order.id, v_order.status, (select status from public.orders where id = v_order.id), v_admin_id, 'admin', 'refund processed: ' || coalesce(v_next_status, v_refund.status))
  on conflict do nothing;

  insert into public.site_notifications(user_id, type, title, content, link_url, related_type, related_id, dedupe_key)
  values (
    v_refund.user_id,
    'refund',
    case coalesce(v_next_status, v_refund.status)
      when 'succeeded' then 'Refund completed'
      when 'rejected' then 'Refund rejected'
      when 'failed' then 'Refund failed'
      when 'processing' then 'Refund processing'
      else 'Refund status updated'
    end,
    coalesce(nullif(v_refund.user_visible_note, ''), 'Your refund request status has been updated. Please check the order details.'),
    '/account/orders/' || v_order.order_no,
    'refund',
    v_refund.id,
    'refund-status-' || v_refund.id::text || '-' || coalesce(v_next_status, v_refund.status)
  ) on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'refund_no', v_refund.refund_no,
    'status', v_refund.status,
    'approved_amount', v_refund.approved_amount
  );
end;
$$;

revoke execute on function public.admin_process_refund_request(uuid,text,numeric,text,text,text,text) from public, anon;
grant execute on function public.admin_process_refund_request(uuid,text,numeric,text,text,text,text) to authenticated, service_role;
