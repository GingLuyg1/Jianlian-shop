-- READ-ONLY / NO BUSINESS DATA MUTATION
-- Jianlian Shop BEP20 settlement aggregate integrity and idempotency audit.
-- Run only after the schema/permission audit confirms the required baseline.
-- Every embedded statement is a count-only SELECT and returns no identifiers.

with column_type_contracts(table_name, column_name, allowed_udt_names) as (
  values
    ('chain_payment_sessions'::text, 'id'::text, array['uuid']::text[]),
    ('chain_payment_sessions', 'order_id', array['uuid']),
    ('chain_payment_sessions', 'payment_id', array['uuid']),
    ('chain_payment_sessions', 'payment_session_id', array['uuid']),
    ('chain_payment_sessions', 'expected_amount', array['numeric']),
    ('chain_payment_sessions', 'confirmed_amount', array['numeric']),
    ('chain_payment_sessions', 'expected_raw_amount', array['numeric']),
    ('chain_payment_sessions', 'confirmed_raw_amount', array['numeric']),
    ('chain_payment_sessions', 'submitted_tx_hash', array['text','varchar']),
    ('chain_payment_sessions', 'expires_at', array['timestamp','timestamptz']),
    ('chain_payment_sessions', 'status', array['text','varchar']),
    ('chain_payment_sessions', 'manual_review_decision', array['text','varchar']),
    ('chain_transactions', 'id', array['uuid']),
    ('chain_transactions', 'chain_payment_session_id', array['uuid']),
    ('chain_transactions', 'order_id', array['uuid']),
    ('chain_transactions', 'chain_id', array['int2','int4','int8','numeric']),
    ('chain_transactions', 'tx_hash', array['text','varchar']),
    ('chain_transactions', 'log_index', array['int2','int4','int8','numeric']),
    ('chain_transactions', 'confirmation_count', array['int2','int4','int8','numeric']),
    ('chain_transaction_claims', 'chain_payment_session_id', array['uuid']),
    ('chain_transaction_claims', 'order_id', array['uuid']),
    ('chain_transaction_claims', 'chain_id', array['int2','int4','int8','numeric']),
    ('chain_transaction_claims', 'tx_hash', array['text','varchar']),
    ('payment_sessions', 'id', array['uuid']),
    ('payment_sessions', 'business_type', array['text','varchar']),
    ('payment_sessions', 'business_id', array['uuid']),
    ('payment_sessions', 'user_id', array['uuid']),
    ('payment_sessions', 'payable_amount', array['numeric']),
    ('payment_sessions', 'currency', array['text','varchar']),
    ('payment_sessions', 'expires_at', array['timestamp','timestamptz']),
    ('payment_sessions', 'status', array['text','varchar']),
    ('order_payments', 'id', array['uuid']),
    ('order_payments', 'order_id', array['uuid']),
    ('order_payments', 'user_id', array['uuid']),
    ('order_payments', 'payment_session_id', array['uuid']),
    ('order_payments', 'payable_amount', array['numeric']),
    ('order_payments', 'payable_currency', array['text','varchar']),
    ('order_payments', 'received_amount', array['numeric']),
    ('order_payments', 'received_currency', array['text','varchar']),
    ('order_payments', 'status', array['text','varchar']),
    ('orders', 'id', array['uuid']),
    ('orders', 'user_id', array['uuid']),
    ('orders', 'payment_expires_at', array['timestamp','timestamptz']),
    ('orders', 'status', array['text','varchar']),
    ('orders', 'payment_status', array['text','varchar']),
    ('account_recharges', 'id', array['uuid']),
    ('account_recharges', 'provider_trade_no', array['text','varchar']),
    ('balance_transactions', 'id', array['uuid']),
    ('balance_transactions', 'business_type', array['text','varchar']),
    ('balance_transactions', 'business_id', array['text','varchar']),
    ('balance_transactions', 'metadata', array['jsonb']),
    ('bep20_overpayment_dispositions', 'chain_session_id', array['uuid']),
    ('bep20_overpayment_dispositions', 'order_id', array['uuid']),
    ('bep20_overpayment_dispositions', 'payment_id', array['uuid']),
    ('bep20_overpayment_dispositions', 'balance_transaction_id', array['uuid']),
    ('bep20_underpayment_dispositions', 'chain_session_id', array['uuid']),
    ('bep20_underpayment_dispositions', 'order_id', array['uuid']),
    ('bep20_underpayment_dispositions', 'payment_id', array['uuid']),
    ('bep20_underpayment_dispositions', 'payment_session_id', array['uuid']),
    ('bep20_underpayment_dispositions', 'balance_transaction_id', array['uuid']),
    ('bep20_admin_review_attempts', 'chain_payment_session_id', array['uuid']),
    ('bep20_admin_review_attempts', 'action', array['text','varchar']),
    ('bep20_admin_review_attempts', 'result_status', array['text','varchar'])
),
checks(check_name, required_tables, required_columns, count_query) as (
  values
    (
      'null_chain_session_ownership_count'::text,
      array['chain_payment_sessions']::text[],
      array[
        'chain_payment_sessions.order_id',
        'chain_payment_sessions.payment_session_id',
        'chain_payment_sessions.payment_id'
      ]::text[],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions cps
        where cps.order_id is null
           or cps.payment_session_id is null
           or cps.payment_id is null
      $audit$
    ),
    (
      'null_chain_transaction_ownership_count',
      array['chain_transactions'],
      array[
        'chain_transactions.order_id',
        'chain_transactions.chain_payment_session_id'
      ],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_transactions ct
        where ct.order_id is null
           or ct.chain_payment_session_id is null
      $audit$
    ),
    (
      'null_chain_claim_ownership_count',
      array['chain_transaction_claims'],
      array[
        'chain_transaction_claims.order_id',
        'chain_transaction_claims.chain_payment_session_id'
      ],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_transaction_claims claim
        where claim.order_id is null
           or claim.chain_payment_session_id is null
      $audit$
    ),
    (
      'null_payment_link_ownership_count',
      array['chain_payment_sessions','payment_sessions','order_payments'],
      array[
        'chain_payment_sessions.payment_session_id',
        'chain_payment_sessions.payment_id',
        'payment_sessions.id',
        'payment_sessions.business_type',
        'payment_sessions.business_id',
        'payment_sessions.user_id',
        'order_payments.id',
        'order_payments.order_id',
        'order_payments.user_id',
        'order_payments.payment_session_id'
      ]::text[],
      $audit$
        select (
          (select count(*)
           from public.chain_payment_sessions cps
           left join public.payment_sessions ps on ps.id = cps.payment_session_id
           where cps.payment_session_id is null
              or (
               ps.id is null
               or ps.business_type is distinct from 'order'
               or ps.business_id is null
               or ps.user_id is null
             ))
          +
          (select count(*)
           from public.chain_payment_sessions cps
           left join public.order_payments op on op.id = cps.payment_id
           where cps.payment_id is null
              or (
               op.id is null
               or op.order_id is null
               or op.user_id is null
               or op.payment_session_id is null
             ))
        )::bigint as metric_count
      $audit$
    ),
    (
      'null_ownership_reference_count',
      array[
        'chain_payment_sessions','chain_transactions',
        'chain_transaction_claims','payment_sessions','order_payments'
      ],
      array[
        'chain_payment_sessions.order_id',
        'chain_payment_sessions.payment_session_id',
        'chain_payment_sessions.payment_id',
        'chain_transactions.order_id',
        'chain_transactions.chain_payment_session_id',
        'chain_transaction_claims.order_id',
        'chain_transaction_claims.chain_payment_session_id',
        'payment_sessions.id',
        'payment_sessions.business_type',
        'payment_sessions.business_id',
        'payment_sessions.user_id',
        'order_payments.id',
        'order_payments.order_id',
        'order_payments.user_id',
        'order_payments.payment_session_id'
      ],
      $audit$
        select (
          (select count(*)
           from public.chain_payment_sessions cps
           where cps.order_id is null
              or cps.payment_session_id is null
              or cps.payment_id is null)
          +
          (select count(*)
           from public.chain_transactions ct
           where ct.order_id is null
              or ct.chain_payment_session_id is null)
          +
          (select count(*)
           from public.chain_transaction_claims claim
           where claim.order_id is null
              or claim.chain_payment_session_id is null)
          +
          (select count(*)
           from public.chain_payment_sessions cps
           left join public.payment_sessions ps on ps.id = cps.payment_session_id
           where cps.payment_session_id is null
              or ps.id is null
              or ps.business_type is distinct from 'order'
              or ps.business_id is null
              or ps.user_id is null)
          +
          (select count(*)
           from public.chain_payment_sessions cps
           left join public.order_payments op on op.id = cps.payment_id
           where cps.payment_id is null
              or op.id is null
              or op.order_id is null
              or op.user_id is null
              or op.payment_session_id is null)
        )::bigint as metric_count
      $audit$
    ),
    (
      'null_or_negative_log_index_count',
      array['chain_transactions'],
      array['chain_transactions.log_index'],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_transactions
        where log_index is null or log_index < 0
      $audit$
    ),
    (
      'null_confirmation_count',
      array['chain_transactions'],
      array['chain_transactions.confirmation_count'],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_transactions
        where confirmation_count is null
      $audit$
    ),
    (
      'missing_expected_snapshot_count',
      array['chain_payment_sessions'],
      array[
        'chain_payment_sessions.expected_amount',
        'chain_payment_sessions.expected_raw_amount'
      ],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions
        where expected_amount is null or expected_raw_amount is null
      $audit$
    ),
    (
      'missing_confirmed_evidence_amount_count',
      array['chain_payment_sessions','chain_transactions'],
      array[
        'chain_payment_sessions.id',
        'chain_payment_sessions.submitted_tx_hash',
        'chain_payment_sessions.status',
        'chain_payment_sessions.confirmed_amount',
        'chain_payment_sessions.confirmed_raw_amount',
        'chain_transactions.chain_payment_session_id'
      ],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions cps
        where (
          nullif(btrim(cps.submitted_tx_hash), '') is not null
          or exists (
            select 1
            from public.chain_transactions ct
            where ct.chain_payment_session_id = cps.id
          )
          or cps.status in (
            'confirming','verified','completing','payment_failed',
            'paid','underpaid','overpaid','manual_review','failed'
          )
        )
          and (
            cps.confirmed_amount is null
            or cps.confirmed_raw_amount is null
          )
      $audit$
    ),
    (
      'missing_order_payment_received_amount_count',
      array[
        'chain_payment_sessions','order_payments',
        'bep20_overpayment_dispositions','bep20_underpayment_dispositions'
      ],
      array[
        'chain_payment_sessions.id',
        'chain_payment_sessions.payment_id',
        'chain_payment_sessions.status',
        'order_payments.id',
        'order_payments.status',
        'order_payments.received_amount',
        'bep20_overpayment_dispositions.chain_session_id',
        'bep20_underpayment_dispositions.chain_session_id'
      ],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions cps
        join public.order_payments op on op.id = cps.payment_id
        where (
          cps.status = 'paid'
          or op.status in ('paid','closed')
          or exists (
            select 1
            from public.bep20_overpayment_dispositions od
            where od.chain_session_id = cps.id
          )
          or exists (
            select 1
            from public.bep20_underpayment_dispositions ud
            where ud.chain_session_id = cps.id
          )
        )
          and op.received_amount is null
      $audit$
    ),
    (
      'payment_amount_currency_snapshot_mismatch_count',
      array['chain_payment_sessions','payment_sessions','order_payments','orders'],
      array[
        'chain_payment_sessions.order_id',
        'chain_payment_sessions.payment_session_id',
        'chain_payment_sessions.payment_id',
        'chain_payment_sessions.expected_amount',
        'chain_payment_sessions.confirmed_amount',
        'orders.id',
        'orders.user_id',
        'payment_sessions.id',
        'payment_sessions.business_id',
        'payment_sessions.user_id',
        'payment_sessions.payable_amount',
        'payment_sessions.currency',
        'order_payments.id',
        'order_payments.order_id',
        'order_payments.user_id',
        'order_payments.payment_session_id',
        'order_payments.payable_amount',
        'order_payments.received_amount',
        'order_payments.payable_currency',
        'order_payments.received_currency'
      ],
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
           or (
             op.received_amount is not null
             and op.received_amount is distinct from cps.confirmed_amount
           )
           or upper(coalesce(ps.currency, '')) <> 'USDT'
           or upper(coalesce(op.payable_currency, '')) <> 'USDT'
           or (
             op.received_amount is not null
             and upper(coalesce(op.received_currency, '')) <> 'USDT'
           )
      $audit$
    ),
    (
      'incomplete_deadline_count',
      array['chain_payment_sessions','payment_sessions','orders'],
      array[
        'chain_payment_sessions.order_id',
        'chain_payment_sessions.payment_session_id',
        'chain_payment_sessions.expires_at',
        'orders.id',
        'orders.payment_expires_at',
        'payment_sessions.id',
        'payment_sessions.expires_at'
      ],
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
      array[
        'chain_transactions.tx_hash',
        'chain_transactions.order_id',
        'chain_transaction_claims.tx_hash',
        'chain_transaction_claims.order_id',
        'account_recharges.provider_trade_no',
        'account_recharges.id'
      ],
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
      array[
        'chain_transactions.chain_id',
        'chain_transactions.tx_hash',
        'chain_transaction_claims.chain_id',
        'chain_transaction_claims.tx_hash'
      ],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_transaction_claims claim
        left join lateral (
          select count(*)::bigint as match_count
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
      array[
        'chain_transactions.chain_id',
        'chain_transactions.tx_hash',
        'chain_transaction_claims.chain_id',
        'chain_transaction_claims.tx_hash'
      ],
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
      array['chain_transactions.chain_id','chain_transactions.tx_hash'],
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
      array[
        'chain_transactions.chain_id',
        'chain_transactions.tx_hash',
        'chain_transactions.order_id',
        'chain_transactions.chain_payment_session_id',
        'chain_transaction_claims.chain_id',
        'chain_transaction_claims.tx_hash',
        'chain_transaction_claims.order_id',
        'chain_transaction_claims.chain_payment_session_id'
      ],
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
      'disposition_missing_business_link_count',
      array[
        'orders','payment_sessions','order_payments','chain_payment_sessions',
        'balance_transactions',
        'bep20_overpayment_dispositions',
        'bep20_underpayment_dispositions'
      ],
      array[
        'orders.id',
        'payment_sessions.id',
        'payment_sessions.business_type',
        'payment_sessions.business_id',
        'order_payments.id',
        'order_payments.order_id',
        'order_payments.payment_session_id',
        'chain_payment_sessions.id',
        'chain_payment_sessions.order_id',
        'chain_payment_sessions.payment_id',
        'chain_payment_sessions.payment_session_id',
        'balance_transactions.id',
        'bep20_overpayment_dispositions.order_id',
        'bep20_overpayment_dispositions.payment_id',
        'bep20_overpayment_dispositions.chain_session_id',
        'bep20_overpayment_dispositions.balance_transaction_id',
        'bep20_underpayment_dispositions.order_id',
        'bep20_underpayment_dispositions.payment_id',
        'bep20_underpayment_dispositions.payment_session_id',
        'bep20_underpayment_dispositions.chain_session_id',
        'bep20_underpayment_dispositions.balance_transaction_id'
      ],
      $audit$
        select (
          (select count(*)
           from public.bep20_overpayment_dispositions d
           left join public.orders o on o.id = d.order_id
           left join public.order_payments op on op.id = d.payment_id
           left join public.chain_payment_sessions cps on cps.id = d.chain_session_id
           left join public.payment_sessions ps on ps.id = cps.payment_session_id
           left join public.balance_transactions bt on bt.id = d.balance_transaction_id
           where o.id is null
              or op.id is null
              or cps.id is null
              or ps.id is null
              or bt.id is null
              or op.order_id is distinct from d.order_id
              or cps.order_id is distinct from d.order_id
              or cps.payment_id is distinct from d.payment_id
              or op.payment_session_id is distinct from cps.payment_session_id
              or ps.business_type is distinct from 'order'
              or ps.business_id is distinct from d.order_id)
          +
          (select count(*)
           from public.bep20_underpayment_dispositions d
           left join public.orders o on o.id = d.order_id
           left join public.payment_sessions ps on ps.id = d.payment_session_id
           left join public.order_payments op on op.id = d.payment_id
           left join public.chain_payment_sessions cps on cps.id = d.chain_session_id
           left join public.balance_transactions bt on bt.id = d.balance_transaction_id
           where o.id is null
              or ps.id is null
              or op.id is null
              or cps.id is null
              or bt.id is null
              or op.order_id is distinct from d.order_id
              or cps.order_id is distinct from d.order_id
              or cps.payment_id is distinct from d.payment_id
              or op.payment_session_id is distinct from d.payment_session_id
              or cps.payment_session_id is distinct from d.payment_session_id
              or ps.business_type is distinct from 'order'
              or ps.business_id is distinct from d.order_id)
        )::bigint as metric_count
      $audit$
    ),
    (
      'ledger_missing_disposition_link_count',
      array[
        'balance_transactions',
        'bep20_overpayment_dispositions',
        'bep20_underpayment_dispositions'
      ],
      array[
        'balance_transactions.id',
        'balance_transactions.metadata',
        'bep20_overpayment_dispositions.balance_transaction_id',
        'bep20_underpayment_dispositions.balance_transaction_id'
      ],
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
      array[
        'balance_transactions',
        'bep20_overpayment_dispositions',
        'bep20_underpayment_dispositions'
      ],
      array[
        'balance_transactions.id',
        'balance_transactions.business_type',
        'balance_transactions.business_id',
        'balance_transactions.metadata',
        'bep20_overpayment_dispositions.order_id',
        'bep20_overpayment_dispositions.balance_transaction_id',
        'bep20_underpayment_dispositions.order_id',
        'bep20_underpayment_dispositions.balance_transaction_id'
      ],
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
      array[
        'bep20_overpayment_dispositions.order_id',
        'bep20_overpayment_dispositions.payment_id',
        'bep20_overpayment_dispositions.chain_session_id',
        'bep20_overpayment_dispositions.balance_transaction_id',
        'bep20_underpayment_dispositions.order_id',
        'bep20_underpayment_dispositions.payment_id',
        'bep20_underpayment_dispositions.payment_session_id',
        'bep20_underpayment_dispositions.chain_session_id',
        'bep20_underpayment_dispositions.balance_transaction_id',
        'orders.id',
        'orders.status',
        'orders.payment_status',
        'payment_sessions.business_type',
        'payment_sessions.business_id',
        'payment_sessions.id',
        'payment_sessions.status',
        'order_payments.id',
        'order_payments.order_id',
        'order_payments.payment_session_id',
        'order_payments.status',
        'chain_payment_sessions.id',
        'chain_payment_sessions.order_id',
        'chain_payment_sessions.payment_id',
        'chain_payment_sessions.payment_session_id',
        'chain_payment_sessions.status',
        'balance_transactions.id'
      ],
      $audit$
        select (
          (select count(*)
           from public.bep20_overpayment_dispositions d
           join public.orders o on o.id = d.order_id
           join public.order_payments op on op.id = d.payment_id
           join public.chain_payment_sessions cps on cps.id = d.chain_session_id
           join public.payment_sessions ps on ps.id = cps.payment_session_id
           join public.balance_transactions bt on bt.id = d.balance_transaction_id
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
           join public.balance_transactions bt on bt.id = d.balance_transaction_id
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
      array[
        'chain_payment_sessions.id',
        'chain_payment_sessions.payment_session_id',
        'chain_payment_sessions.confirmed_raw_amount',
        'chain_payment_sessions.expected_raw_amount',
        'payment_sessions.id',
        'payment_sessions.status',
        'bep20_overpayment_dispositions.chain_session_id',
        'bep20_underpayment_dispositions.chain_session_id'
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
      'manual_review_missing_final_decision_count',
      array['chain_payment_sessions'],
      array[
        'chain_payment_sessions.status',
        'chain_payment_sessions.manual_review_decision'
      ],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions cps
        where cps.status = 'manual_review'
          and (
            cps.manual_review_decision is null
            or cps.manual_review_decision = 'pending'
          )
      $audit$
    ),
    (
      'manual_review_missing_any_attempt_count',
      array['chain_payment_sessions','bep20_admin_review_attempts'],
      array[
        'chain_payment_sessions.id',
        'chain_payment_sessions.status',
        'chain_payment_sessions.manual_review_decision',
        'bep20_admin_review_attempts.chain_payment_session_id'
      ],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions cps
        where (
          cps.status = 'manual_review'
          or cps.manual_review_decision in ('approved','rejected')
        )
          and not exists (
            select 1
            from public.bep20_admin_review_attempts attempt
            where attempt.chain_payment_session_id = cps.id
          )
      $audit$
    ),
    (
      'manual_review_missing_terminal_attempt_count',
      array['chain_payment_sessions','bep20_admin_review_attempts'],
      array[
        'chain_payment_sessions.id',
        'chain_payment_sessions.status',
        'chain_payment_sessions.manual_review_decision',
        'bep20_admin_review_attempts.chain_payment_session_id',
        'bep20_admin_review_attempts.action',
        'bep20_admin_review_attempts.result_status'
      ],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions cps
        where (
          cps.status = 'manual_review'
          or cps.manual_review_decision in ('approved','rejected')
        )
          and not exists (
            select 1
            from public.bep20_admin_review_attempts attempt
            where attempt.chain_payment_session_id = cps.id
              and attempt.action in (
                'recheck','approve_late_payment','reject_late_payment'
              )
              and attempt.result_status in ('succeeded','failed','rejected')
          )
      $audit$
    ),
    (
      'manual_review_decision_attempt_mismatch_count',
      array['chain_payment_sessions','bep20_admin_review_attempts'],
      array[
        'chain_payment_sessions.id',
        'chain_payment_sessions.manual_review_decision',
        'bep20_admin_review_attempts.chain_payment_session_id',
        'bep20_admin_review_attempts.action',
        'bep20_admin_review_attempts.result_status'
      ],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions cps
        where cps.manual_review_decision in ('approved','rejected')
          and exists (
            select 1
            from public.bep20_admin_review_attempts attempt
            where attempt.chain_payment_session_id = cps.id
              and attempt.result_status in ('succeeded','failed','rejected')
          )
          and not exists (
            select 1
            from public.bep20_admin_review_attempts attempt
            where attempt.chain_payment_session_id = cps.id
              and (
                (
                  cps.manual_review_decision = 'approved'
                  and attempt.action = 'approve_late_payment'
                  and attempt.result_status = 'succeeded'
                )
                or (
                  cps.manual_review_decision = 'rejected'
                  and attempt.action = 'reject_late_payment'
                  and attempt.result_status = 'rejected'
                )
              )
          )
      $audit$
    ),
    (
      'manual_review_missing_decision_or_valid_audit_count',
      array['chain_payment_sessions','bep20_admin_review_attempts'],
      array[
        'chain_payment_sessions.id',
        'chain_payment_sessions.status',
        'chain_payment_sessions.manual_review_decision',
        'bep20_admin_review_attempts.chain_payment_session_id',
        'bep20_admin_review_attempts.action',
        'bep20_admin_review_attempts.result_status'
      ],
      $audit$
        select count(*)::bigint as metric_count
        from public.chain_payment_sessions cps
        where (
          cps.status = 'manual_review'
          or cps.manual_review_decision in ('approved','rejected')
        )
          and (
            cps.manual_review_decision is null
            or cps.manual_review_decision = 'pending'
            or not exists (
              select 1
              from public.bep20_admin_review_attempts attempt
              where attempt.chain_payment_session_id = cps.id
                and (
                  (
                    cps.manual_review_decision = 'approved'
                    and attempt.action = 'approve_late_payment'
                    and attempt.result_status = 'succeeded'
                  )
                  or (
                    cps.manual_review_decision = 'rejected'
                    and attempt.action = 'reject_late_payment'
                    and attempt.result_status = 'rejected'
                  )
                )
            )
          )
      $audit$
    ),
    (
      'terminal_order_still_in_settlement_state_count',
      array['chain_payment_sessions','orders','payment_sessions'],
      array[
        'chain_payment_sessions.order_id',
        'chain_payment_sessions.payment_session_id',
        'chain_payment_sessions.status',
        'orders.id',
        'orders.status',
        'orders.payment_status',
        'payment_sessions.id',
        'payment_sessions.status'
      ],
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
    c.required_columns,
    c.count_query,
    array(
      select required_table
      from unnest(c.required_tables) required_table
      where to_regclass(format('public.%I', required_table)) is null
      order by required_table
    ) as missing_tables,
    array(
      select required_column
      from unnest(c.required_columns) required_column
      left join information_schema.columns ic
        on ic.table_schema = 'public'
       and ic.table_name = split_part(required_column, '.', 1)
       and ic.column_name = split_part(required_column, '.', 2)
      where ic.column_name is null
      order by required_column
    ) as missing_columns,
    array(
      select format(
        '%s expected %s actual %s',
        required_column,
        array_to_string(ctc.allowed_udt_names, '|'),
        ic.udt_name
      )
      from unnest(c.required_columns) required_column
      join information_schema.columns ic
        on ic.table_schema = 'public'
       and ic.table_name = split_part(required_column, '.', 1)
       and ic.column_name = split_part(required_column, '.', 2)
      left join column_type_contracts ctc
        on ctc.table_name = ic.table_name
       and ctc.column_name = ic.column_name
      where ctc.column_name is null
         or not (ic.udt_name = any(ctc.allowed_udt_names))
      order by required_column
    ) as unexpected_column_types
  from checks c
),
executed as (
  select
    os.check_name,
    os.missing_tables,
    os.missing_columns,
    os.unexpected_column_types,
    case
      when cardinality(os.missing_tables) > 0
        or cardinality(os.missing_columns) > 0
        or cardinality(os.unexpected_column_types) > 0
        then null::xml
      else query_to_xml(os.count_query, true, false, '')
    end as result_document
  from object_state os
)
select
  'bep20_settlement_integrity_audit'::text as audit_name,
  e.check_name,
  case
    when cardinality(e.missing_tables) > 0
      or cardinality(e.missing_columns) > 0
      or cardinality(e.unexpected_column_types) > 0
      then null::bigint
    else ((xpath('/table/row/metric_count/text()', e.result_document))[1]::text)::bigint
  end as anomaly_count,
  case
    when cardinality(e.missing_tables) > 0
      or cardinality(e.missing_columns) > 0
      then 'NOT_CHECKED_MISSING_OBJECTS'
    when cardinality(e.unexpected_column_types) > 0
      then 'NOT_CHECKED_UNEXPECTED_COLUMN_TYPE'
    when ((xpath('/table/row/metric_count/text()', e.result_document))[1]::text)::bigint = 0
      then 'PASS'
    else 'REVIEW_REQUIRED'
  end as audit_status,
  e.missing_tables,
  e.missing_columns,
  e.unexpected_column_types
from executed e
order by e.check_name;
