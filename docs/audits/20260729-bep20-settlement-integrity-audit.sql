-- READ-ONLY / NO BUSINESS DATA MUTATION
-- Jianlian Shop BEP20 settlement aggregate integrity and idempotency audit.
-- Run only after the schema/permission audit confirms the required baseline.
-- Every embedded statement is a count-only SELECT and returns no identifiers.

with checks(check_name, required_tables, count_query) as (
  values
    (
      'null_ownership_reference_count'::text,
      array['chain_payment_sessions','payment_sessions','order_payments']::text[],
      $audit$
        select (
          (select count(*) from public.chain_payment_sessions
           where order_id is null or payment_session_id is null or payment_id is null)
          +
          (select count(*)
           from public.chain_payment_sessions cps
           left join public.payment_sessions ps on ps.id = cps.payment_session_id
           where cps.payment_session_id is not null
             and (
               ps.id is null
               or ps.business_type is distinct from 'order'
               or ps.business_id is null
               or ps.user_id is null
             ))
          +
          (select count(*)
           from public.chain_payment_sessions cps
           left join public.order_payments op on op.id = cps.payment_id
           where cps.payment_id is not null
             and (
               op.id is null
               or op.order_id is null
               or op.user_id is null
               or op.payment_session_id is null
             ))
        )::bigint as metric_count
      $audit$
    ),
    (
      'null_or_negative_log_index_count',
      array['chain_transactions'],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_transactions
        where log_index is null or log_index < 0
      $audit$
    ),
    (
      'null_confirmation_count',
      array['chain_transactions'],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_transactions
        where confirmation_count is null
      $audit$
    ),
    (
      'null_expected_or_received_amount_count',
      array['chain_payment_sessions','payment_sessions','order_payments'],
      $audit$
        select (
          (select count(*) from public.chain_payment_sessions
           where expected_amount is null or confirmed_amount is null
              or expected_raw_amount is null or confirmed_raw_amount is null)
          +
          (select count(*)
           from public.chain_payment_sessions cps
           join public.payment_sessions ps on ps.id = cps.payment_session_id
           where ps.payable_amount is null)
          +
          (select count(*)
           from public.chain_payment_sessions cps
           join public.order_payments op on op.id = cps.payment_id
           where op.payable_amount is null or op.received_amount is null)
        )::bigint as metric_count
      $audit$
    ),
    (
      'payment_amount_currency_snapshot_mismatch_count',
      array['chain_payment_sessions','payment_sessions','order_payments','orders'],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions cps
        join public.orders o on o.id = cps.order_id
        join public.payment_sessions ps on ps.id = cps.payment_session_id
        join public.order_payments op on op.id = cps.payment_id
        where ps.business_id is distinct from o.id
           or ps.user_id is distinct from o.user_id
           or op.order_id is distinct from o.id
           or op.user_id is distinct from o.user_id
           or op.payment_session_id is distinct from ps.id
           or ps.payable_amount is distinct from cps.expected_amount
           or op.payable_amount is distinct from cps.expected_amount
           or op.received_amount is distinct from cps.confirmed_amount
           or upper(coalesce(ps.currency, '')) <> 'USDT'
           or upper(coalesce(op.payable_currency, '')) <> 'USDT'
           or upper(coalesce(op.received_currency, '')) <> 'USDT'
      $audit$
    ),
    (
      'incomplete_deadline_count',
      array['chain_payment_sessions','payment_sessions','orders'],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions cps
        join public.orders o on o.id = cps.order_id
        left join public.payment_sessions ps on ps.id = cps.payment_session_id
        where o.payment_expires_at is null
           or ps.expires_at is null
           or cps.expires_at is null
      $audit$
    ),
    (
      'cross_business_transaction_reference_conflict_count',
      array['chain_transactions','chain_transaction_claims','account_recharges'],
      $audit$
        select count(*)::bigint as metric_count
        from (
          select normalized_reference
          from (
            select lower(tx_hash) as normalized_reference,
                   'order:' || order_id::text as business_key
            from public.chain_transactions
            where nullif(btrim(tx_hash), '') is not null
            union all
            select lower(tx_hash),
                   'order:' || order_id::text
            from public.chain_transaction_claims
            where nullif(btrim(tx_hash), '') is not null
            union all
            select lower(split_part(provider_trade_no, ':', 1)),
                   'recharge:' || id::text
            from public.account_recharges
            where nullif(btrim(provider_trade_no), '') is not null
          ) references_by_business
          group by normalized_reference
          having count(distinct business_key) > 1
        ) conflicts
      $audit$
    ),
    (
      'claim_without_unique_transaction_count',
      array['chain_transactions','chain_transaction_claims'],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_transaction_claims claim
        left join lateral (
          select
            count(*)::bigint as match_count
          from public.chain_transactions tx
          where tx.chain_id = claim.chain_id
            and lower(tx.tx_hash) = lower(claim.tx_hash)
        ) evidence on true
        where evidence.match_count <> 1
      $audit$
    ),
    (
      'transaction_without_claim_count',
      array['chain_transactions','chain_transaction_claims'],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_transactions tx
        where not exists (
          select 1
          from public.chain_transaction_claims claim
          where claim.chain_id = tx.chain_id
            and lower(claim.tx_hash) = lower(tx.tx_hash)
        )
      $audit$
    ),
    (
      'multiple_transactions_per_chain_reference_count',
      array['chain_transactions'],
      $audit$
        select count(*)::bigint as metric_count
        from (
          select tx.chain_id, lower(tx.tx_hash)
          from public.chain_transactions tx
          group by tx.chain_id, lower(tx.tx_hash)
          having count(*) > 1
        ) duplicate_transactions
      $audit$
    ),
    (
      'claim_transaction_ownership_mismatch_count',
      array['chain_transactions','chain_transaction_claims'],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_transaction_claims claim
        join public.chain_transactions tx
          on tx.chain_id = claim.chain_id
         and lower(tx.tx_hash) = lower(claim.tx_hash)
        where tx.order_id is distinct from claim.order_id
           or tx.chain_payment_session_id
                is distinct from claim.chain_payment_session_id
      $audit$
    ),
    (
      'disposition_missing_ledger_link_count',
      array['balance_transactions','bep20_overpayment_dispositions','bep20_underpayment_dispositions'],
      $audit$
        select (
          (select count(*)
           from public.bep20_overpayment_dispositions d
           left join public.balance_transactions bt on bt.id = d.balance_transaction_id
           where bt.id is null)
          +
          (select count(*)
           from public.bep20_underpayment_dispositions d
           left join public.balance_transactions bt on bt.id = d.balance_transaction_id
           where bt.id is null)
        )::bigint as metric_count
      $audit$
    ),
    (
      'ledger_missing_disposition_link_count',
      array['balance_transactions','bep20_overpayment_dispositions','bep20_underpayment_dispositions'],
      $audit$
        select count(*)::bigint as metric_count
        from public.balance_transactions bt
        where bt.metadata ->> 'subtype' in (
          'bep20_overpayment_wallet_credit',
          'bep20_underpayment_wallet_credit'
        )
          and not exists (
            select 1 from public.bep20_overpayment_dispositions od
            where od.balance_transaction_id = bt.id
          )
          and not exists (
            select 1 from public.bep20_underpayment_dispositions ud
            where ud.balance_transaction_id = bt.id
          )
      $audit$
    ),
    (
      'duplicate_ledger_or_disposition_business_key_count',
      array['balance_transactions','bep20_overpayment_dispositions','bep20_underpayment_dispositions'],
      $audit$
        select (
          (select count(*) from (
            select bt.business_type, bt.business_id
            from public.balance_transactions bt
            where bt.metadata ->> 'subtype' in (
              'bep20_overpayment_wallet_credit',
              'bep20_underpayment_wallet_credit'
            )
               or exists (
                 select 1
                 from public.bep20_overpayment_dispositions od
                 where od.balance_transaction_id = bt.id
               )
               or exists (
                 select 1
                 from public.bep20_underpayment_dispositions ud
                 where ud.balance_transaction_id = bt.id
               )
            group by bt.business_type, bt.business_id
            having count(*) > 1
          ) duplicate_ledger)
          +
          (select count(*) from (
            select order_id from public.bep20_overpayment_dispositions
            group by order_id having count(*) > 1
          ) duplicate_overpayment)
          +
          (select count(*) from (
            select order_id from public.bep20_underpayment_dispositions
            group by order_id having count(*) > 1
          ) duplicate_underpayment)
        )::bigint as metric_count
      $audit$
    ),
    (
      'credited_balance_with_inconsistent_terminal_state_count',
      array[
        'bep20_overpayment_dispositions','bep20_underpayment_dispositions',
        'orders','payment_sessions','order_payments','chain_payment_sessions'
      ],
      $audit$
        select (
          (select count(*)
           from public.bep20_overpayment_dispositions d
           join public.orders o on o.id = d.order_id
           join public.payment_sessions ps on ps.id = d.payment_session_id
           join public.chain_payment_sessions cps on cps.id = d.chain_session_id
           where o.payment_status <> 'paid'
              or o.status not in ('paid','processing','delivered','completed')
              or ps.status <> 'paid'
              or cps.status <> 'paid')
          +
          (select count(*)
           from public.bep20_underpayment_dispositions d
           join public.orders o on o.id = d.order_id
           join public.payment_sessions ps on ps.id = d.payment_session_id
           join public.order_payments op on op.id = d.payment_id
           join public.chain_payment_sessions cps on cps.id = d.chain_session_id
           where o.status <> 'cancelled'
              or o.payment_status <> 'failed'
              or ps.status <> 'closed'
              or op.status <> 'closed'
              or cps.status <> 'expired')
        )::bigint as metric_count
      $audit$
    ),
    (
      'payment_classification_overlap_count',
      array[
        'chain_payment_sessions','payment_sessions',
        'bep20_overpayment_dispositions','bep20_underpayment_dispositions'
      ],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions cps
        left join public.payment_sessions ps on ps.id = cps.payment_session_id
        cross join lateral (
          select
            (
              cps.confirmed_raw_amount = cps.expected_raw_amount
              and ps.status = 'paid'
            )::integer
            + (exists (
              select 1
              from public.bep20_overpayment_dispositions od
              where od.chain_session_id = cps.id
            ))::integer
            + (exists (
              select 1
              from public.bep20_underpayment_dispositions ud
              where ud.chain_session_id = cps.id
            ))::integer
              as matched_path_count
        ) classification
        where classification.matched_path_count > 1
      $audit$
    ),
    (
      'manual_review_missing_decision_count',
      array['chain_payment_sessions'],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions cps
        where cps.status = 'manual_review'
          and cps.manual_review_decision is null
      $audit$
    ),
    (
      'manual_review_missing_audit_count',
      array['chain_payment_sessions','bep20_admin_review_attempts'],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions cps
        where cps.status = 'manual_review'
          and not exists (
            select 1
            from public.bep20_admin_review_attempts attempt
            where attempt.chain_payment_session_id = cps.id
          )
      $audit$
    ),
    (
      'manual_review_missing_decision_or_audit_count',
      array['chain_payment_sessions','bep20_admin_review_attempts'],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions cps
        where cps.status = 'manual_review'
          and (
            cps.manual_review_decision is null
            or not exists (
              select 1
              from public.bep20_admin_review_attempts attempt
              where attempt.chain_payment_session_id = cps.id
            )
          )
      $audit$
    ),
    (
      'terminal_order_still_in_settlement_state_count',
      array['chain_payment_sessions','orders','payment_sessions'],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions cps
        join public.orders o on o.id = cps.order_id
        left join public.payment_sessions ps on ps.id = cps.payment_session_id
        where (
          o.status in ('cancelled','expired','failed','delivered','completed')
          or o.payment_status in ('paid','failed','refunded')
          or ps.status in ('paid','closed','expired','failed')
        )
          and cps.status in (
            'waiting_payment','submitted','confirming','verified',
            'underpaid','overpaid','manual_review'
          )
      $audit$
    )
),
object_state as (
  select
    c.check_name,
    c.required_tables,
    c.count_query,
    array(
      select required_table
      from unnest(c.required_tables) required_table
      where to_regclass(format('public.%I', required_table)) is null
      order by required_table
    ) as missing_tables
  from checks c
),
executed as (
  select
    os.check_name,
    os.missing_tables,
    case
      when cardinality(os.missing_tables) > 0 then null::xml
      else query_to_xml(os.count_query, true, false, '')
    end as result_document
  from object_state os
)
select
  'bep20_settlement_integrity_audit'::text as audit_name,
  e.check_name,
  case
    when cardinality(e.missing_tables) > 0 then null::bigint
    else ((xpath('/table/row/metric_count/text()', e.result_document))[1]::text)::bigint
  end as anomaly_count,
  case
    when cardinality(e.missing_tables) > 0 then 'NOT_CHECKED_MISSING_OBJECTS'
    when ((xpath('/table/row/metric_count/text()', e.result_document))[1]::text)::bigint = 0
      then 'PASS'
    else 'REVIEW_REQUIRED'
  end as audit_status,
  e.missing_tables
from executed e
order by e.check_name;
