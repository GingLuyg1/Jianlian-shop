# Payment provider coupling audit (V2)

This is a local code audit, not a Production readiness claim. Current financial completion, callback, USDT and recovery execution are intentionally unchanged.

| Location | Coupling | Disposition |
| --- | --- | --- |
| `lib/payments/providers/liuhaoyi.ts`, `liuhaoyi-core.mjs` | MD5, `wxpay`/`alipay`, `mapi.php`, query status, QR/payurl/urlscheme | Keep in provider adapter. The adapter now also exposes normalized artifact/query fields without removing legacy fields. |
| `lib/payments/providers.ts` | Registry, configuration names, capability/limits and recovery policy | Shared registry metadata; add a definition for each real adapter. Unavailable placeholders are not advertised as live create/query/callback providers. |
| `lib/payments/request-client-device.mjs` | User-Agent classification | Already shared (`pc/mobile/wechat/alipay`); provider maps this finite enum to its own request vocabulary. |
| `lib/payments/payment-session-service.ts` | Liuhaoyi amount/expiry checks; presentation normalization | Keep existing guards and compatibility path for now. New sessions snapshot provider. A future change must use generic channel/provider policy without weakening the ¥2000 server guard. |
| `lib/payments/payment-callback-service.ts` | Channel loader selects current channel provider before session lookup | **Open pinning gap:** after channel provider changes, historical callbacks may select the wrong adapter. Resolve with a separately reviewed, fail-closed callback routing change before switching a live channel provider. No financial callback code was changed in V2. |
| `app/api/recharges/route.ts`, `components/account/AccountRechargeContent.tsx`, `app/checkout/page.tsx` | Liuhaoyi-specific amount, 3% disclosure, redirect branching | Business/UI coupling. Channel API already includes `maximumAmount`, but UI still hardcodes the Liuhaoyi limit. Generic capability-backed UI requires a separate regression-reviewed change. |
| `app/payment/page.tsx` | Liuhaoyi-specific recharge panel and legacy `qrCodeValue` fields | Presentation compatibility only. QR payload is rendered locally; do not treat it as image URL or automatic redirect. |
| `lib/payments/recharge-utils.ts`, `manual-channel-readiness.mjs`, `channels.ts` | Finite provider allowlist and default alipay/wechat identity | New provider must be added deliberately. Do not infer `wechat == liuhaoyi` for historical sessions. |
| `lib/payments/liuhaoyi-*-recovery-*`, ops scripts | Provider-specific query parsing and recovery policy | Retain first implementation; generic recovery contract is descriptive only. Watcher remains disabled. Never auto-complete on a query unless explicitly authorized and all financial gates pass. |

Provider priority is a future configuration concern, not live failover. Once a provider may have created an order, automatic failover is forbidden. Even a definitive pre-submission rejection requires a separately authorized **new session**; never repoint an existing session.
