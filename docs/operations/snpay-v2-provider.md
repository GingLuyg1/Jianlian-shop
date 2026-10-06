# SNPAY V2 Provider — Stage 1

Status: code and isolated tests only. This stage does not enable a public payment channel, install a watcher, or authorize automatic recovery.

## Runtime contract

- Provider code: `snpay`
- Supported channels: `alipay`, `wechat`
- Currency: `CNY`
- Create endpoint: `POST /api/pay/create`
- Query endpoint: `POST /api/pay/query`
- Callback routes: the existing `/api/payments/callback/alipay` and `/api/payments/callback/wechat`
- Request encoding: `application/x-www-form-urlencoded`
- Signature: SHA256WithRSA, RSA PKCS#1 v1.5, Base64
- Timestamp: ten-digit Unix seconds
- TLS: normal platform certificate verification; no bypass is implemented

Every successful create/query response is accepted only after its business code, timestamp, and platform RSA signature pass validation. Query and callback evidence must also match merchant order identity, provider order identity, channel, and amount. A browser return URL is never payment evidence.

Callbacks first use an untrusted bounded `out_trade_no` only to locate the persisted session. The persisted session pins the provider. Provider verification and parsing then run before the existing callback service invokes canonical `completePayment`. SNPAY code does not credit balances or insert ledger rows directly.

## Secret model

Formal runtime secrets must be independent from `/etc/jianlian/snpay-readonly/`. The deployment stage must provision root-owned files without placing key material in Git, logs, command arguments, PM2 dumps, or systemd output.

Required configuration names:

- `SNPAY_MERCHANT_ID`
- `SNPAY_API_BASE` (expected Production value: `https://www.snpay.cn`)
- `SNPAY_PRIVATE_KEY_FILE`
- `SNPAY_PLATFORM_PUBLIC_KEY_FILE`
- `SNPAY_SITE_URL`
- `SNPAY_TIMEOUT_MS` (optional)

Recommended permissions for a future formal secret directory are directory `0700`, private/config files `0600`, and platform public key `0644`, all owned by `root:root`. Provisioning and Production values are deliberately outside this repository.

## Fail-closed Stage 1 boundaries

- Public Alipay and WeChat channel state is unchanged.
- Existing sessions never fail over between Liuhaoyi and SNPAY.
- SNPAY reconciliation may perform a verified query, but `providerRecoveryPolicies.snpay` disables automatic completion.
- Close and refund are unsupported.
- No formal watcher/timer is introduced.
- No migration is required by this code stage.

## Promotion plan

1. Merge only after unit, payment regression, typecheck, build, full test suite, and Ubuntu CI pass.
2. Hidden deploy with public Alipay/WeChat still disabled and no SNPAY secrets copied from the read-only probe.
3. Provision and validate independent formal credentials without creating an order.
4. Run one controlled minimum-amount Alipay canary, immediately close the public window, and verify exactly-once callback completion.
5. Separately run one controlled minimum-amount WeChat canary with the same controls.
6. Only after both canaries pass may a later change route new sessions to SNPAY. Existing sessions remain pinned to their original provider.

Any signature, timestamp, identity, amount, channel, paid-time, or exactly-once discrepancy stops promotion. Automatic recovery remains a separate reviewed stage.

## Business-rejection diagnostics

HTTP-success JSON responses with a nonzero business code still fail closed with
`SNPAY_API_REJECTED`. Only a bounded primitive business code, sanitized message,
and `providerErrorResponseSignatureVerified` are retained on the error and failed
session metadata. Message candidates are `msg`, `message`, `error`, then `errmsg`.
HTML, JSON, URLs, canonical/signature assignments and key material are rejected;
opaque tokens are redacted and messages are limited to 200 Unicode characters.
Existing reservation metadata is preserved; `last_error` and public recharge
errors remain generic. Structured server logs contain only the diagnostic
allowlist, operation, HTTP status and elapsed time.

Error-response signature availability is not assumed. The existing platform RSA
and timestamp verifier is attempted: missing, invalid or stale signatures yield
`false`. Such messages are untrusted diagnostics, never payment evidence. Even
a verified error response cannot create a payment artifact, complete a session,
credit a balance or start recovery. Successful responses retain mandatory RSA
and timestamp verification. Prior failed sessions are not repaired or retried.
