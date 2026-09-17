# Payment provider coupling audit (V2)

This is a local code audit, not a Production readiness claim. Financial completion, credit, USDT, and recovery execution gates remain unchanged; callback adapter routing now uses the historical session provider.

| Location | Coupling | Disposition |
| --- | --- | --- |
| `lib/payments/providers/liuhaoyi.ts`, `liuhaoyi-core.mjs` | MD5, `wxpay`/`alipay`, `mapi.php`, query status, QR/payurl/urlscheme | Keep in provider adapter. The adapter now also exposes normalized artifact/query fields without removing legacy fields. |
| `lib/payments/providers.ts` | Registry, configuration names, capability/limits and recovery policy | Shared registry metadata; add a definition for each real adapter. Unavailable placeholders are not advertised as live create/query/callback providers. |
| `lib/payments/request-client-device.mjs` | User-Agent classification | Already shared (`pc/mobile/wechat/alipay`); provider maps this finite enum to its own request vocabulary. |
| `lib/payments/payment-session-service.ts` | Liuhaoyi protocol-specific amount guard and historical submit-form reconstruction | New sessions resolve the selected channel provider and enforce provider/channel capability min/max. Preserve the Liuhaoyi ¥2000, zero-site-fee and expiry guards. Historical submit-form validation remains provider-specific compatibility code. |
| `lib/payments/payment-callback-service.ts` | Callback bootstrap and historical provider pinning | Uses bounded unverified `out_trade_no` only to find `payment_sessions.session_no`, then chooses `session.provider` for signature verification. Unknown session and mismatched channel/provider/identity reject before financial completion. Current channel enabled/default provider is not consulted. |
| `app/api/recharges/route.ts`, `components/account/AccountRechargeContent.tsx`, `app/checkout/page.tsx` | Provider limits, fee and artifact presentation | Frontend consumes effective min/max and optional `providerExternalFeeDisclosure`; redirect/QR/deeplink/submit actions use artifact fields. Server repeats generic capability checks; Liuhaoyi protocol guards remain. |
| `app/payment/page.tsx` | Liuhaoyi-specific recharge panel and legacy `qrCodeValue` fields | Presentation compatibility only. QR payload is rendered locally; do not treat it as image URL or automatic redirect. |
| `lib/payments/recharge-utils.ts`, `manual-channel-readiness.mjs`, `channels.ts` | Finite provider allowlist and historical default alipay/wechat identity | Compatibility is now a provider-to-supported-channels map, independent of historical defaults. A provider switch resets configured/enabled until separately verified; unavailable placeholders cannot create payments. New provider must still be added deliberately. Do not infer `wechat == liuhaoyi` for historical sessions. |
| `lib/payments/liuhaoyi-*-recovery-*`, ops scripts | Provider-specific recovery policy and execution | Existing WeChat recovery now checks `session.provider` and uses the pinned provider for query. Provider-specific financial gates remain; a second acquirer requires its own reviewed recovery policy. Watcher is not enabled by this code. |

```text
NEW PAYMENT:      channel → selected provider → persist payment_sessions.provider
EXISTING PAYMENT: session → persisted provider → query / recovery / callback adapter

CALLBACK: route channel + unverified out_trade_no
          → bounded session lookup → stored channel/provider
          → pinned adapter signature verification → parse
          → identity/amount/currency validation → canonical completion
```

The bootstrap `out_trade_no` is not proof of payment. Unknown sessions are audited as `SESSION_NOT_FOUND` and never fall back to the channel's current default provider. Disabled channels may still receive valid callbacks for older sessions.

Remaining coupling: the finite provider registry/readiness and channel compatibility/type definitions; Liuhaoyi-specific submit-form reconstruction, protocol amount and expiry guards; and Liuhaoyi-specific recovery implementation. A new non-submit acquirer should need an adapter/protocol helper, registry capability/config entry, compatibility/type/admin label entry, env-name documentation, tests, and controlled channel configuration. A new submit-mode acquirer additionally needs a safe server-side form validator. None of this establishes Production callback ingress or readiness.

Provider priority is a future configuration concern, not live failover. Once a provider may have created an order, automatic failover is forbidden. Even a definitive pre-submission rejection requires a separately authorized **new session**; never repoint an existing session.
