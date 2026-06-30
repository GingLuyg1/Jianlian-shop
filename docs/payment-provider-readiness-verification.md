# Payment Provider Readiness Verification

Date: 2026-06-30

## Current Provider Structure

Payment Provider files:

- `lib/payments/channel-types.ts`
- `lib/payments/providers.ts`
- `lib/payments/sandbox-provider.ts`
- `lib/payments/payment-session-service.ts`
- `lib/payments/payment-callback-service.ts`
- `lib/payments/reconciliation-service.ts`
- `app/api/payments/create/route.ts`
- `app/api/payments/status/[sessionNo]/route.ts`
- `app/api/payments/close/route.ts`
- `app/api/payments/callback/route.ts`
- `app/api/payments/callback/[channel]/route.ts`
- `app/api/admin/payments/readiness/route.ts`

## Real Implementations

- Local payment session creation and reuse.
- Local payment status query.
- Local payment close.
- Callback route with signature verification hook.
- Callback amount and currency validation.
- Duplicate paid callback idempotency through `completePayment`.
- Reconciliation service that queries Provider through the unified adapter.

## Placeholder Implementations

- `generic_api`, `binance`, and `crypto_address` Providers currently use unavailable implementations.
- They fail closed and do not generate fake QR codes, fake wallet addresses, fake transaction IDs, or fake paid states.
- Refund creation and refund query are declared but unsupported until real Provider docs are supplied.

## Not Implemented

- Real Alipay Provider API.
- Real WeChat Pay Provider API.
- Real Binance Pay API.
- Real TRC20/BEP20 address allocation and confirmation service.
- Real Provider refund APIs.
- Real Provider-specific callback response formats.

## Unified Provider Interface

The unified interface now covers:

- `createPayment`
- `queryPayment`
- `closePayment`
- `verifyCallback`
- `parseCallback`
- `formatCallbackResponse`
- `queryRefund`
- `createRefund`

Provider inputs include business number, amount, currency, channel, notify URL, return URL, expiry and metadata. Provider outputs are normalized before being stored or returned.

## Config Validation Result

`getPaymentProviderReadiness()` returns:

- provider code
- status
- environment
- required environment variable names
- missing environment variable names
- capability matrix

It does not return secret values.

Status values:

- `not_configured`
- `partially_configured`
- `pending_verification`
- `connected`

The readiness API now includes `providerReadiness`.

## Channel Capability Matrix

| Provider | Create | Query | Close | Callback | Refund | QR Code | Redirect | Wallet Address | Sandbox |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `generic_api` | yes | yes | yes | yes | no | yes | yes | no | no |
| `binance` | yes | yes | yes | yes | no | yes | yes | no | no |
| `crypto_address` | yes | no | no | yes | no | no | no | yes | no |

TRC20 and BEP20 must use distinct network configuration and cannot be mixed.

## Create Payment Flow

Current flow:

1. Validate logged-in user and business record.
2. Read server-side amount and currency.
3. Load enabled channel.
4. Require Provider configured flag.
5. Reserve or reuse active payment session.
6. Call Provider adapter.
7. Store sanitized Provider result.
8. Return safe payment fields only.

If Provider is not configured, payment creation returns a clear failure. It does not produce fake payment information.

## Query, Close, and Callback Flow

Query:

- Calls Provider through adapter.
- Normalizes status.
- Does not mark paid if amount or currency mismatches.

Close:

- Only closes closeable local states.
- Does not close paid sessions.
- If Provider does not support close, local close remains explicit and safe.

Callback:

- Reads raw body first.
- Verifies signature before business updates.
- Rejects missing or invalid signature.
- Checks amount and currency.
- Uses idempotent completion.
- Stores sanitized callback summaries only.

## Test Provider Isolation

`lib/payments/sandbox-provider.ts` provides a sandbox-only mock Provider factory.

Rules:

- Available only when `NODE_ENV=test` or `PAYMENT_PROVIDER_MODE=sandbox`.
- Not registered in production Provider map.
- Provider name and URLs clearly use `sandbox`.
- Does not connect to real money channels.
- Production mode throws `MOCK_PROVIDER_DISABLED`.

## Missing Channel Onboarding Data

Alipay:

- Official API docs.
- Merchant ID.
- API base URL.
- Signing algorithm.
- Callback success response.
- Sandbox account.

WeChat Pay:

- Official API docs.
- Merchant ID and app ID.
- Certificate rules.
- API v3 key or equivalent.
- Callback signature rules.
- Sandbox or test merchant rules.

Binance Pay:

- Official API docs.
- Merchant ID.
- API key and secret.
- Webhook signature rules.
- Sandbox account.

USDT-TRC20:

- Address allocation or payment Provider docs.
- TRON confirmation policy.
- Required confirmation count.
- Callback verification rule.

USDT-BEP20:

- Address allocation or payment Provider docs.
- BSC confirmation policy.
- Required confirmation count.
- Callback verification rule.

## Real Payment Blockers

- No real Provider documentation supplied.
- No merchant credentials supplied.
- No sandbox callback verification completed.
- No real query/close/refund API verified.
- No crypto network confirmation service configured.
- Current state is pre-integration readiness, not real collection.

## Test Results

- Node unit tests cover Provider config states, capability matrix, mock Provider isolation, amount mismatch, currency mismatch, duplicate callback idempotency, and Provider-not-configured rejection.
- `tsc --noEmit` and `npm run build` must still be run after this change.

## Remaining Issues

- Real Provider adapters remain intentionally unavailable.
- Real sandbox verification is manual and cannot be completed without Provider credentials and docs.
- GitHub push may fail if local network cannot reach GitHub.
