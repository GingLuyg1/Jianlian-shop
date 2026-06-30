# Payment Provider Onboarding Checklist

This checklist is for real payment Provider onboarding. It contains placeholders only and must not store merchant secrets.

## Provider identity

- Provider name: `<provider name>`
- Channel codes: `<alipay | wechat | binance_pay | usdt_trc20 | usdt_bep20>`
- Official documentation URL: `<official docs URL>`
- Merchant console URL: `<merchant console URL>`
- Support contact: `<provider support contact>`

## Merchant information required from the Provider

- Merchant ID: `<merchant id>`
- Application ID: `<app id if applicable>`
- API base URL: `<production API base URL>`
- Sandbox API base URL: `<sandbox API base URL>`
- Create payment endpoint: `<endpoint>`
- Query payment endpoint: `<endpoint>`
- Close payment endpoint: `<endpoint>`
- Refund endpoint: `<endpoint or unsupported>`
- Callback URL format: `https://www.jianlian.shop/api/payments/callback/<channel>`
- Callback fields: `<field list>`
- Signing algorithm: `<algorithm>`
- Signing fields: `<field list and ordering>`
- Provider public key: `<public key source>`
- Success callback response format: `<body expected by Provider>`
- Order expiry rule: `<expiry minutes>`
- Amount unit: `<yuan | cents | USDT decimal>`
- Currency: `<CNY | USDT>`
- Network for crypto channels: `<TRON | BSC>`
- IP whitelist requirements: `<whitelist rules>`
- Certificate requirements: `<certificate rules>`
- Sandbox account: `<sandbox account identifier>`

## Separation rules

- Sandbox and production credentials must be separate.
- Provider verification must be completed in sandbox before the channel is marked connected.
- A channel that has complete environment variables but no verified sandbox run remains `pending_verification`.
- A Provider must not be used for real collection until callback signature, amount, currency, duplicate callback, query, and close flows are verified.

## Key rotation

- Store secrets only in server-side environment variables.
- Never use `NEXT_PUBLIC_*` for merchant secrets.
- Rotate keys when changing Provider accounts or after suspected exposure.
- Record rotation date, operator, affected channels, and verification result in admin audit notes.

## Acceptance criteria

- Create payment returns real Provider order reference.
- Query payment maps Provider status to local status.
- Close payment works or clearly reports unsupported.
- Callback verifies signature before any local state update.
- Callback amount and currency match local payment session.
- Duplicate callback is idempotent.
- No fake QR code, fake wallet address, fake transaction ID, or fake paid status is generated.
