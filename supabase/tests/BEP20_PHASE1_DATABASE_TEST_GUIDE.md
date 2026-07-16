# BEP20 Phase 1 Database Integration Test Guide

This guide is for the **Jianlian-shop-test** Supabase project only.

Do not run this test file in the production Supabase project. It creates temporary users, products, orders, payment sessions, chain sessions, claims, transactions, and review decisions inside a transaction and ends with `rollback`.

## Files

- `supabase/tests/bep20_phase1_database_integration_test.sql`

## Before Running

Confirm all required baseline and BEP20 migrations have already been applied to the test project:

1. `schema.sql`
2. `20260619_products_categories_baseline.sql`
3. `orders-schema.sql`
4. `20260620_order_payments.sql`
5. `20260620_digital_inventory_delivery.sql`
6. `20260622_super_admin_payment_console.sql`
7. `20260623_payment_balance_transactions_compatibility.sql`
8. `20260623_payment_provider_core.sql`
9. `20260623_payment_core_linkage.sql`
10. `20260704_000_bep20_phase1_preflight.sql`
11. `20260704_bep20_chain_payment_phase1.sql`
12. `20260708_bep20_phase1_atomic_hardening.sql`
13. `20260708_bep20_phase1_completion_hardening.sql`
14. `20260708_bep20_phase1_manual_review_decision.sql`
15. `20260708_order_payment_currency_snapshot_fix.sql`

Also confirm the order delivery type normalizer exists before running this test:

- Required function: `public.normalize_order_item_delivery_type(text)`
- Why: `complete_payment_session(...)` calls `complete_order_payment(...)`, and `complete_order_payment(...)` filters order items through `public.normalize_order_item_delivery_type(delivery_type)`.
- Existing migration that defines it: `supabase/migrations/20260703_digital_delivery_atomic_hardening.sql`
- Earlier migration that also defines it: `supabase/migrations/20260623_mixed_order_item_fulfillment.sql`

For the current BEP20 phase 1 database test stack, execute `20260703_digital_delivery_atomic_hardening.sql` in the test database if `public.normalize_order_item_delivery_type(text)` is missing. Review it first: it adds or hardens digital delivery support tables, delivery logs, delivery status columns, delivery normalization functions, and related RLS/policies. It does not need real RPC credentials and does not perform chain calls.

The test SQL includes a preflight assertion named `00_preflight_normalize_order_item_delivery_type_exists`; if that assertion fails, apply the missing dependency migration in the test database and rerun the full test script.

Confirm the current Supabase project is `Jianlian-shop-test`. The SQL uses fixed-format fake TxHash values and fake EVM addresses; it does not require a real BSC RPC endpoint and does not perform any network request.

## How To Run

1. Open the Supabase Dashboard for `Jianlian-shop-test`.
2. Open SQL Editor.
3. Paste the entire contents of `supabase/tests/bep20_phase1_database_integration_test.sql`.
4. Execute it as one complete script.
5. Do not split the script into separate executions. It relies on one transaction and temporary objects.

## Successful Result

The script should return rows from `_bep20_test_results` and then execute `rollback`.

Successful output includes test names such as:

- `01_minimal_order_original_amount_is_69_cny`
- `02_chain_session_payable_amount_is_9583334_usdt`
- `03_first_txhash_claim_succeeds`
- `05_other_order_same_txhash_is_rejected`
- `07_first_prepare_completion_acquires_lock`
- `13_complete_payment_session_is_idempotent_for_order_payment_row`
- `17_manual_review_approve_succeeds`
- `18_manual_review_reject_succeeds`
- `24_rejected_txhash_claim_is_not_released_to_other_order`
- `28_bep20_tables_have_rls_enabled`
- `29_active_session_unique_index_status_set_matches_server_contract`

Because the script ends with `rollback`, no test users, orders, products, or payment rows should remain after completion.

## Failure Handling

Every assertion failure raises an exception in this format:

```text
BEP20 phase1 database integration test failed [test_name]: detail
```

Use the `test_name` to locate the failing section in the SQL file. Common causes:

- A required migration was not applied.
- A function signature differs from the repository migration files.
- RPC privileges were not revoked from `anon` or `authenticated`.
- `chain_payment_sessions_active_order_unique` does not match the service contract.
- A status transition function was overwritten by an older migration.

After fixing the schema in a disposable test database, rerun the full script from the beginning.

## Covered Database Logic

The SQL script covers:

1. Creating minimal test `auth.users`, `profiles`, `categories`, `products`, `orders`, `order_items`, `payment_sessions`, and `chain_payment_sessions`.
2. A `69 CNY` order with a frozen `9.583334 USDT` BEP20 payable amount.
3. Preservation of the original order amount and currency.
4. BEP20 payable amount and currency stored on `chain_payment_sessions`.
5. First TxHash claim success through `claim_bep20_chain_transaction`.
6. Same-order repeated TxHash claim idempotency.
7. Other-order same TxHash rejection.
8. `chain_transaction_claims` and `chain_transactions.order_id` consistency.
9. First completion prepare lock acquisition.
10. Second completion prepare not acquiring a new execution right.
11. Wrong `attempt_id` not overwriting the active completion attempt.
12. Correct `attempt_id` status update.
13. `payment_failed` retry path.
14. Manual review approve decision.
15. Manual review reject decision.
16. Reject-after-approve and approve-after-reject protection.
17. Repeated approve/reject idempotency.
18. Rejected TxHash claim retention.
19. `complete_payment_session` idempotency for order payment records.
20. No duplicate `order_payments` row for repeated completion calls.
21. Basic no-duplicate `order_deliveries` assertion in this minimal dataset.
22. `anon` and `authenticated` lack core RPC `EXECUTE` privileges.
23. RLS is enabled on `chain_payment_sessions`, `chain_transactions`, and `chain_transaction_claims`.
24. Active session unique index predicate includes the expected active status set.

## Not Fully Covered By Single-Connection SQL

Some risks require a separate Node test or manual test harness using two independent database connections. The SQL file marks these explicitly instead of pretending serial statements are concurrent tests.

Still required:

- True concurrent `prepare_bep20_payment_completion` calls from two independent connections.
- True concurrent `approve` and `reject` decisions from two independent connections.
- Transaction isolation behavior under simultaneous TxHash claims.
- Full application-level digital delivery idempotency if delivery is triggered outside the database RPC path.
- Real chain receipt parsing and confirmation handling.
- Real BSC RPC `decimals()` validation and timeout handling.

## Safety Notes

- Do not run this file in production.
- Do not run a real USDT transfer for this SQL test.
- Do not configure production RPC, wallet, or secret values for this SQL test.
- Do not execute only part of the SQL file.
- The SQL Editor result should end with `ROLLBACK`, not `COMMIT`.

## Next Step After Passing

After this database logic test passes in `Jianlian-shop-test`, the project can proceed to the test environment variable configuration phase:

- Configure test-only BSC RPC.
- Configure Chain ID `56`.
- Configure the verified BEP20 USDT contract.
- Configure a dedicated test receive address.
- Configure fixed CNY to USDT pricing.
- Run application-level BEP20 session creation and TxHash verification against a controlled small-value test.

Do not perform a real chain transfer until the database script and the application readiness checks both pass.
