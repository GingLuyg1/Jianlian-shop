# Jianlian Shop User Account And Balance Verification

Date: 2026-06-29

## Scope

This pass covers the user account center, profile management, balance display, recharge creation, recharge records, balance ledger, order asset display, and account security boundaries.

No real payment Provider was connected. No fake recharge success, fake balance, fake ledger, or simulated credited data was added.

## Account Center Result

- `/account` now reads a server-side account asset summary from `/api/account/assets`.
- The account center displays profile basics, current balance, available balance, cumulative recharge, cumulative spend, order count, unfinished order count, recent recharges, and recent balance changes.
- Each section has isolated error fallback. A failed orders/recharges/balance-ledger query no longer blanks the whole account page.
- Frozen balance is displayed as `未接入` when the project has no frozen-balance source, instead of showing fake zero.

## User Profile Management Result

- Existing profile editing only writes allowed fields: display name, phone, country, recipient name, shipping address, and avatar URL.
- It does not write `role`, admin flags, balance, or permissions.
- The update is scoped to the current authenticated user ID from Supabase Auth, not a user ID supplied by the browser.
- Current remaining risk: profile updates still use the browser Supabase client and rely on RLS for write protection. This is acceptable for this pass, but a future server action/API would make validation and audit logging stronger.

## Balance Data Source

- The single current balance source is `public.profiles.balance`.
- `public.balance_transactions` is the ledger source for balance changes.
- If `balance_transactions` is not initialized, the UI shows a Chinese initialization message and falls back to order totals for cumulative spend display.
- The compatibility RPC `public.credit_account_recharge_balance(...)` updates `profiles.balance`, marks the recharge paid, and inserts a `balance_transactions` row in one database transaction.

## Balance Calculation Result

- Current balance and available balance are read from `profiles.balance`.
- Available balance is clamped to non-negative in the UI.
- Cumulative recharge uses paid/succeeded recharge rows and credited/requested amounts.
- Cumulative spend prefers completed debit ledger rows. If the ledger is unavailable, it falls back to paid/processing/delivered/completed order totals as a read-only compatibility view.
- No frontend code writes balance or balance transactions.

## Recharge Creation Result

- `/api/recharges` accepts only `channel`, `amount`, and `client_request_id` / `clientRequestId`.
- The server reads enabled payment channels from `payment_channels` and recalculates fee/payable amount.
- Frontend amount, fee, credited amount, and status are not trusted.
- The recharge UI now sends a browser-generated `client_request_id` to prevent duplicate recharge creation on retry.
- If the idempotency migration has not been executed yet, the API retries without `client_request_id` so existing deployments do not break, but duplicate protection is weaker until SQL is applied.

## Recharge Idempotency Result

- New migration `20260629_account_recharge_client_request_id.sql` adds `account_recharges.client_request_id`.
- It adds a unique index on `(user_id, client_request_id)` for non-empty request IDs.
- The API reuses an existing pending/processing recharge for the same user/request ID.
- Paid/closed/expired/failed recharges are not reused as active payment attempts.

## Recharge Records Result

- Recharge records remain served by `/api/recharges`.
- The account recharge page displays real recharge records with pagination.
- Users can only read their own records through the authenticated Supabase session and RLS.
- Missing payment tables degrade to a Chinese initialization message.

## Balance Ledger Result

- New endpoint `/api/account/balance-transactions` returns paginated balance ledger rows for the current user.
- The `资金变动记录` tab now reads real `balance_transactions` data instead of showing a placeholder.
- The UI displays transaction number, business type, amount direction, before/after balance, business reference, remark, and creation time.
- Missing ledger schema returns a Chinese initialization message and does not white-screen.

## Balance Payment Result

- No new balance payment feature was added.
- Existing order/payment rules were not changed.
- The current verification only confirms that account UI and recharge/ledger reads do not directly modify balances.

## Permission Isolation Result

- `/api/account/assets` and `/api/account/balance-transactions` require a logged-in user.
- Both endpoints derive `user_id` from `supabase.auth.getUser()`.
- Browser-supplied `user_id` is ignored.
- Users only query their own orders, recharges, profiles, and balance ledger rows.
- The endpoints do not expose internal user IDs, payment secrets, Provider configuration, callback payloads, or database stack traces.

## Found And Fixed Issues

- Account overview text and layout were still focused on order-only data. It now displays account assets and recent finance activity.
- `资金变动记录` was a static placeholder. It now reads real balance ledger rows.
- Recharge creation had no client request idempotency. It now supports `client_request_id` and includes an idempotency migration.
- Recharge API accepted only amount/channel and could create duplicate pending records on repeated clicks. It now rejects unknown parameters and reuses pending/processing records for the same request ID when the migration is applied.

## Remaining Issues

- `balance_transactions` and `client_request_id` migrations must be executed manually before full ledger/idempotency guarantees are active in production.
- Existing profile updates rely on RLS and browser Supabase writes; server-side profile update plus admin audit logging remains a recommended hardening step.
- The project uses `paid` as the credited recharge status. Requested external terminology such as `succeeded` is treated as compatible display/query logic, not a database status migration.
- Balance payment was not added because the request explicitly says to validate it only if already present.

## Manual Migration Required

Execute in Supabase SQL Editor after existing payment core migrations:

1. `supabase/migrations/20260623_payment_balance_transactions_compatibility.sql`
2. `supabase/migrations/20260629_account_recharge_client_request_id.sql`

## Test Checklist

- Unauthenticated account access redirects via existing account shell.
- Account assets API returns 401 when no session exists.
- Account assets API ignores browser user IDs.
- Recharge API rejects unknown fields.
- Recharge API rejects missing `client_request_id`.
- Repeated recharge create requests with the same request ID reuse pending/processing records after the migration is applied.
- Balance ledger missing schema returns a Chinese initialization message.
- Recharge records and balance transactions show empty states when no data exists.

## Build Verification

To be completed by this task:

- `tsc --noEmit`
- `npm run build`
