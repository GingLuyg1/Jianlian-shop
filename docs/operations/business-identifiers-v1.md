# Business identifiers V1 — Issue #111

## Exact implementation scope

This Draft changes **only new account recharge numbers** to `CZ` + Asia/Shanghai `YYYYMMDD` + six uppercase base36 symbols. `crypto.randomInt(36 ** 6)` samples the full suffix space without modulo bias; leading zeroes are retained. The database remains the authority for uniqueness. Existing user/request idempotency is checked before retry. Only the confirmed `account_recharges_recharge_no_key` conflict permits regeneration, bounded to four inserts. A network/timeout error or an unrelated unique conflict never causes a new identifier.

New CZ numbers are shown in full. Legacy display aliases remain presentation-only; copy, lookup, payment and support still use the original complete number. No existing record is updated or renumbered.

## Authoritative generator audit (Production schema read-only, 2026-11-07)

|Record|Canonical column and actual generator|Usage / visible|Decision|
|---|---|---|---|
|Account recharge|account_recharges.recharge_no; app/api/recharges/route.ts insertRecharge|recharge lookup, payment session business_no, account/admin display|CZ new-only implemented; existing unique index and idempotency index unchanged|
|Shop order|orders.order_no; overloaded create_order_with_item RPC, including ten-argument SKU/payment/request overload|order lookup, frozen fulfillment, balance payment and callbacks|DD proposed, NOT implemented here. Requires separate exact SQL/RPC change and isolated payment/refund compatibility proof. Editing the unused lib/orders/generate-order-number.ts would not implement it|
|Wallet ledger|balance_transactions.transaction_no; credit_account_recharge_balance overloads, pay_order_with_balance, admin_adjust_user_balance, admin_process_refund_request, BEP20 overpayment functions|wallet/admin audit, refund and credit reference|YE applies only to ledger, NOT balance-paid orders. NOT implemented: must preserve deterministic BT-BEP20 identities and each original atomic/idempotent transaction|
|Payment session|payment_sessions.session_no; payment-session-service.ts and BEP20 chain service|gateway out_trade_no, signed callback lookup, reconcile|Unchanged; not shortened to DD/CZ/YE|
|Gateway payment|order_payments.payment_no; generate_payment_no / AUTO-session references|gateway payment evidence|Unchanged|
|Provider identifiers|provider_order_no, provider_transaction_id, supplier invoice/child|third-party authority and exactly-once|Unchanged|
|Internal IDs and request keys|UUID, client_request_id, procurement locks, SKU codes|foreign keys / idempotency / inventory / supplier mapping|Unchanged|

Production unique indexes were confirmed on orders.order_no, account_recharges.recharge_no, balance_transactions.transaction_no, order_payments.payment_no and payment_sessions.session_no. Recharge constraints impose no RC-prefix requirement. Current ten-argument order function definition MD5: ebd57970a6d4d2399a3735898ce03d58. Three overloads and multiple ledger generators exist; no Production SQL was executed.

## Validation and release boundary

Ten new focused tests execute the real private route functions and cover Shanghai midnight, fixed-width suffix limits, concurrent distinct requests, known collision and bounded exhaustion, authoritative idempotency reuse, unrelated unique conflict and uncertain-response refusal, legacy display/copy. Existing affected payment/session/expiry and account display tests remain in scope. TypeScript and targeted ESLint are required; exact-head GitHub CI must pass.

This is a separate Draft, NOT a Production release authorization. Do not merge or deploy with the UI or login stage. No Migration is required for this CZ-only patch. Before future rollout, verify exact deployed baseline and rollback release, the callback/session lookup and original financial contracts in the isolated workflow; authorize code release separately. Real payment tests are not authorized. Roll back the application to its previous release if required; retain already-created CZ records and read them by their original canonical number. Never rewrite them to RC.

DD/YE remain a documented follow-up gate; no financial SQL, historical migration, new balance fields or deterministic-key changes are included. No claim of unified DD/YE completion is made.
