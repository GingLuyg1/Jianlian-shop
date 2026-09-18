# Jianlian Payment Callback Relay V1

This service is a deliberately small network relay for Liuhaoyi GET callbacks.
It has no merchant key, database, Supabase, payment-state, balance, ledger, or
completion capability.

## Fixed routing

| Public relay path | Fixed Jianlian origin path |
| --- | --- |
| `/callback/wechat` | `https://jianlian.shop/api/payments/callback/wechat` |
| `/callback/alipay` | `https://jianlian.shop/api/payments/callback/alipay` |

Only `GET` is accepted. The raw query string is appended byte-for-byte to the
fixed origin path; parameters are not parsed, sorted, decoded, signed, or
rebuilt. Clients cannot supply an origin host or origin path.

The origin response status and body are returned only after the origin responds.
An origin timeout returns `504`, and other network failures return `502`; the
relay never fabricates `success`. Duplicate callbacks are forwarded every time,
leaving idempotency to Jianlian's canonical completion path.

## Runtime safety

- Production origin: hard-coded `https://jianlian.shop`
- Connect timeout: 900 ms
- Origin first-byte timeout: 2500 ms
- Total timeout: 3500 ms
- Retry: none
- Maximum origin response body: 64 KiB
- Every response: `Cache-Control: no-store`
- Every request: a new `X-Request-ID`, forwarded to the origin
- Forwarded identity: socket peer address only; inbound `X-Forwarded-For` is not trusted
- Logs: metadata and timings only; never the query string, signature, callback URL, or response body

The relay sets `X-Forwarded-For`, `X-Forwarded-Proto: https`, and
`X-Request-ID`. These headers are operational metadata only and do not
participate in Liuhaoyi MD5 verification, which remains entirely in the
Jianlian callback service.

## Local verification

```bash
npm --prefix infra/payment-callback-relay run typecheck
npm --prefix infra/payment-callback-relay test
npm --prefix infra/payment-callback-relay run build
```

No Production deployment, DNS change, or payment-channel change is performed by
these commands.

## Hosting assessment

| Option | Mainland/provider reachability | Origin reachability | Fixed IP | Logs/timeouts | Maintenance |
| --- | --- | --- | --- | --- | --- |
| Hong Kong VPS | Usually the best first candidate, but must be tested from Liuhaoyi's network | Direct and controllable | Yes | Full control | Medium |
| Asia VPS | Depends strongly on carrier and region | Direct and controllable | Yes | Full control | Medium |
| Cloudflare Worker | Broad edge network, but provider/carrier behavior and platform routing must be proven | Generally good | No dedicated fixed egress/ingress IP by default | Good, platform-limited | Low |
| Other edge/serverless | Provider-specific | Provider-specific | Often no | Platform-specific | Low to medium |

Recommended first deployment candidate: a small, independently monitored Hong
Kong VPS with a dedicated IP and no database credentials. This is a hypothesis
to validate with controlled provider connectivity tests, not an assumption that
Hong Kong routing is universally reliable. Keep Cloudflare Worker as a measured
alternative rather than the default.

Use a dedicated hostname such as `pay-callback.<domain>`. Only Liuhaoyi
`notify_url` changes to the relay; `return_url` continues to point to Jianlian.
The existing WeChat recovery watcher remains the second safety layer.
