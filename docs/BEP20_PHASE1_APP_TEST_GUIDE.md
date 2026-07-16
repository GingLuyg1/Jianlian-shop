# BEP20 Phase 1 App Test Guide

This guide is for local application testing against the `Jianlian-shop-test` Supabase project. It does not require production deployment and must not be used for real USDT transfers unless the explicit small-value chain test step is being performed later.

## Scope

Phase 1 supports:

- Fixed BEP20 receive address.
- User-created order with `usdt_bep20`.
- Server-side CNY to USDT pricing snapshot.
- User-submitted TxHash.
- Server-side BSC RPC verification.
- Manual review for late/overpaid/ambiguous cases.
- Admin recheck / approve / reject.

Phase 1 does not include:

- Automatic chain listener.
- Per-order deposit addresses.
- Private key custody.
- Auto sweep / gas distribution.
- Automatic refunds.

## Environment Variables

| Variable | Used by | Required for BEP20 app test | Runtime | Test value type | Sensitive |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/service-role.ts`, `middleware.ts` | Yes | Client and server | Jianlian-shop-test project URL | No secret, but environment-specific |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase/client.ts`, `lib/supabase/server.ts`, `middleware.ts` | Yes | Client and server | Jianlian-shop-test anon key | Public key, not service secret |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/service-role.ts`, BEP20 service via service-role client, readiness/admin APIs | Yes | Server only | Test project service role JWT or `sb_secret_...` | Yes |
| `SUPABASE_SERVICE_ROLE` | `lib/supabase/service-role.ts` fallback | Optional | Server only | Leave blank unless intentionally using fallback | Yes |
| `SUPABASE_SECRET_KEY` | `lib/supabase/service-role.ts` fallback | Optional | Server only | Leave blank unless intentionally using fallback | Yes |
| `SUPABASE_SECRET` | `lib/supabase/service-role.ts` fallback | Optional | Server only | Leave blank unless intentionally using fallback | Yes |
| `SUPABASE_SERVICE_KEY` | `lib/supabase/service-role.ts` fallback | Optional | Server only | Leave blank unless intentionally using fallback | Yes |
| `BSC_RPC_URL` | `lib/payments/bep20-chain-service.ts` | Yes for successful session creation and TxHash verification | Server only | Test/mock BSC RPC URL; real success requires real BSC RPC | Sensitive operational endpoint |
| `BSC_CHAIN_ID` | `lib/payments/bep20-chain-service.ts` | Yes | Server only | `56` | No |
| `BSC_USDT_CONTRACT` | `lib/payments/bep20-chain-service.ts` | Yes | Server only | EVM address for BEP20 USDT contract in test configuration | Public address |
| `BSC_USDT_DECIMALS` | `lib/payments/bep20-chain-service.ts` | Yes | Server only | `18` for BSC USDT | No |
| `BSC_RECEIVE_ADDRESS` | `lib/payments/bep20-chain-service.ts` | Yes | Server only, returned to user after session creation | Dedicated test receive EVM address | Public address, operationally sensitive |
| `BSC_REQUIRED_CONFIRMATIONS` | `lib/payments/bep20-chain-service.ts` | Yes | Server only | Positive integer, commonly `12` | No |
| `BSC_PAYMENT_EXPIRE_MINUTES` | `lib/payments/bep20-chain-service.ts` | Yes | Server only | Integer `>= 5`, commonly `30` | No |
| `BSC_EXPLORER_BASE_URL` | `lib/payments/bep20-chain-service.ts`, admin chain detail link | Optional | Server only generated link | `https://bscscan.com/tx` or explorer tx URL base | No |
| `USDT_PRICING_MODE` | `lib/payments/bep20-chain-service.ts` | Yes | Server only | `manual_fixed_rate`; `provider_rate` is not implemented and blocks creation | No |
| `CNY_USDT_FIXED_RATE` | `lib/payments/bep20-chain-service.ts` | Yes when `manual_fixed_rate` | Server only | Positive decimal CNY per 1 USDT, e.g. placeholder only | No secret, finance-sensitive |
| `CNY_USDT_RATE_TTL_SECONDS` | `lib/payments/bep20-chain-service.ts` | Yes | Server only | Integer `60` to `86400`, commonly `300` | No |
| `USDT_AMOUNT_SCALE` | `lib/payments/bep20-chain-service.ts` | Yes | Server only | Integer `2` to `18`, commonly `6` | No |
| `MONITORING_WEBHOOK_URL` | `app/api/health/readiness/route.ts`, monitoring alerts | No | Server only | Leave blank for local BEP20 testing | Yes if configured |
| `ALERT_WEBHOOK_URL` | `app/api/health/readiness/route.ts`, monitoring alerts | No | Server only | Leave blank for local BEP20 testing | Yes if configured |
| Hard-coded `SUPER_ADMIN_EMAIL` | Many admin APIs and `lib/risk/admin-risk.ts` | Admin tests require this account or matching profile role path | Server-side code constant | Use matching test admin account where required | Personal identifier |

## Security Findings

- The service role key is read through `lib/supabase/service-role.ts`, which imports `server-only`; it supports `SUPABASE_SERVICE_ROLE_KEY` plus fallback server-only names.
- No BEP20 service role variable is exposed as `NEXT_PUBLIC_*`.
- `BSC_RPC_URL`, service role keys, webhook URLs, and private operational endpoints are server-only. They must not be returned to browsers or docs with real values.
- `BSC_EXPLORER_BASE_URL` has a default of `https://bscscan.com/tx`; this only affects admin/user links, not RPC verification.
- `USDT_PRICING_MODE=provider_rate` is intentionally unavailable and blocks payment session creation. Use `manual_fixed_rate` for phase 1 tests.
- The app does not start a chain listener, cron, webhook receiver, or background BEP20 polling on boot. BSC RPC is accessed only when readiness performs decimals checks or when BEP20 session/verification/admin recheck flows run.

## Connect Local App To Jianlian-shop-test

1. Copy `.env.local.example.bep20-test` to your local `.env.local` manually.
2. Fill `NEXT_PUBLIC_SUPABASE_URL` from the Jianlian-shop-test Project Settings API URL.
3. Fill `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Jianlian-shop-test API anon key.
4. Fill `SUPABASE_SERVICE_ROLE_KEY` from the Jianlian-shop-test server key. Use either old service role JWT or new `sb_secret_...`; never use a production key.
5. Fill BEP20 variables with test-only placeholders or a controlled test/mock RPC endpoint.
6. Keep `.env.local` uncommitted.

## Local Startup

Use the project’s existing local startup command manually. Do not deploy and do not point local variables at production.

Before testing, confirm the browser session is authenticated against Jianlian-shop-test, not production. A simple check is to inspect user IDs or created test records in the test Supabase dashboard.

## App Integration Paths

### 1. Create Order

- Frontend: checkout flow.
- API: `POST /api/orders`.
- Relevant server path: `app/api/orders/route.ts`.
- For `payment_method = "usdt_bep20"`, the order API creates the order, stores the payment method, and then calls `createBep20PaymentSession(order_no, user.id)`.

Expected without BEP20 config:

- Order may be created.
- BEP20 session creation returns `BEP20_SESSION_FAILED` or config-related error.
- No fake address, fake QR, or fake success should be generated.

### 2. Create Or Reuse BEP20 Payment Session

- Frontend: `app/payment/page.tsx`.
- API:
  - `POST /api/payments/bep20/session`
  - `GET /api/payments/bep20/session?order=<order_no>`
- Service: `createBep20PaymentSession()` / `getBep20PaymentSession()`.

This path requires:

- Service role client.
- Valid BEP20 configuration.
- Successful `decimals()` check via BSC RPC.
- Supported order currency (`CNY` or `USDT`).

What it returns:

- `orderAmount` / `orderCurrency`.
- `expectedAmount` / `paymentCurrency=USDT`.
- Fixed `receiveAddress`.
- `requiredConfirmations`.
- `expiresAt`.

### 3. Display Amount, Address, Local QR

- Frontend: `Bep20PaymentPanel` in `app/payment/page.tsx`.
- QR content: receive address only.
- No third-party QR service is required.
- No private key, mnemonic, or RPC URL is displayed.

### 4. Submit Fake TxHash

- Frontend: payment page TxHash input.
- API: `POST /api/payments/bep20/verify`.
- Payload:

```json
{
  "order": "<order_no>",
  "tx_hash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

Expected result without real RPC receipt:

- If RPC is missing or invalid: config/RPC error.
- If RPC is configured but the TxHash does not exist: submitted/expired/failure message depending on session expiry and RPC result.
- It must not mark the order paid.
- It must not create fake chain success.

### 5. Chain Verification

Service path: `verifyBep20TxHash()` -> `verifyBep20TxHashForOrder()`.

Required RPC calls:

- `eth_chainId`
- `eth_getTransactionReceipt`
- `eth_getBlockByNumber`
- `eth_blockNumber`
- `eth_call` for token `decimals()`

Success requires a real receipt containing:

- Correct chain ID `56`.
- Correct USDT token contract.
- Correct fixed receive address.
- Sufficient amount in raw token units.
- Required confirmations.
- Transfer timestamp within session/rate deadlines, unless routed to manual review.

### 6. Manual Review

Manual review may occur for late payment, overpayment, or ambiguous conditions.

Admin API:

- `GET /api/admin/payments/[paymentId]`
- `PATCH /api/admin/payments/[paymentId]`

Admin actions:

- `recheck_bep20`
- `approve_late_payment`
- `reject_late_payment`

UI:

- `components/admin/payments/AdminPaymentRecordsPage.tsx`

Approval/rejection requires:

- Super admin access.
- Reason text.
- Existing chain payment session.
- Audit attempt rows through `bep20_admin_review_attempts`.

### 7. Payment Completion And Digital Delivery

When chain verification qualifies as paid:

- `prepare_bep20_payment_completion` acquires completion ownership.
- `completePayment()` is called with frozen USDT amount/currency.
- `finish_bep20_payment_completion` marks chain session paid or payment_failed.
- Payment core updates order/payment records and triggers downstream delivery.

Repeated verification must be idempotent and must not duplicate payment or delivery.

## What Can Be Tested With Fake TxHash Only

You can test:

- UI rendering of BEP20 panel when a session can be created.
- TxHash format validation.
- API authentication and authorization.
- Missing/invalid config errors.
- RPC unreachable errors.
- Non-existent TxHash flow if using a real RPC but fake hash.
- Admin page visibility and action validation where data exists.

You cannot test full successful payment with fake TxHash because the service verifies a real BSC receipt and Transfer log.

## What Requires BSC RPC

These require a configured BSC RPC:

- BEP20 readiness decimals verification.
- Creating a payment session because token decimals are checked before creation.
- TxHash verification.
- Admin recheck/approve flows that re-read chain data.

These require a real on-chain transaction for success:

- Successful TxHash verification.
- Confirmed amount matching.
- Completion to paid.
- End-to-end digital delivery after chain payment.

## Steps That Must Fail In Current State

Because real test environment variables are not configured yet:

- `POST /api/payments/bep20/session` should fail with a BEP20 config/service error.
- `POST /api/payments/bep20/verify` should fail before success because RPC/session config is unavailable.
- Admin readiness should report BEP20 config items as `missing` or `invalid`, not configured.

These failures are expected and safer than generating fake payment data.

## Server Logs To Check

Check local terminal output for:

- BEP20 config invalid errors.
- Service role not configured errors.
- BSC RPC timeout / RPC error.
- Decimals mismatch or check failure.
- Payment completion failure.
- Admin review audit failure.

Never paste service role keys, RPC tokens, full cookies, or wallet secrets into bug reports.

## Confirm The App Is Not Connected To Production

Before app-layer testing:

1. Confirm `.env.local` `NEXT_PUBLIC_SUPABASE_URL` contains the Jianlian-shop-test project ref.
2. Confirm `SUPABASE_SERVICE_ROLE_KEY` belongs to Jianlian-shop-test.
3. Log in with a test user only.
4. Create a clearly test-labeled order.
5. Verify new records appear in Jianlian-shop-test dashboard, not production.

## Manual Values To Fill Next

Fill these manually in `.env.local` for test app integration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BSC_RPC_URL`
- `BSC_CHAIN_ID=56`
- `BSC_USDT_CONTRACT`
- `BSC_USDT_DECIMALS=18`
- `BSC_RECEIVE_ADDRESS`
- `BSC_REQUIRED_CONFIRMATIONS`
- `BSC_PAYMENT_EXPIRE_MINUTES`
- `USDT_PRICING_MODE=manual_fixed_rate`
- `CNY_USDT_FIXED_RATE`
- `CNY_USDT_RATE_TTL_SECONDS`
- `USDT_AMOUNT_SCALE`

Do not fill production keys or production receive addresses for local testing.
