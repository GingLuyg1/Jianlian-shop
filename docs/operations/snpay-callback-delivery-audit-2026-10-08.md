# SNPAY WeChat callback delivery audit — 2026-10-08

Production application remained `c5069f627f99706b208a30b6e336735e7ee9c788`,
PM2 PID 3829174, online. No Provider query/create, deployment, migration, recovery
or business mutation was performed during this audit.

## Evidence and limits

- Runtime `SNPAY_SITE_URL` host is `jianlian.shop`; the unchanged create adapter
  derives `https://jianlian.shop/api/payments/callback/wechat` and core passes
  `notify_url` into the signed create request. This verifies current configuration,
  not the Provider's retained copy of the original request.
- Local workstation and Production DNS A: `216.195.204.32`. Neither resolver
  returned an AAAA record; no IPv6-target issue was observed.
- Production through public HTTPS: normal certificate/hostname/chain verification,
  SNI for jianlian.shop, negotiated TLS 1.3, root HTTP 200.
- Loaded Nginx configuration forwards the callback through `location /` to
  `127.0.0.1:3001`. No basic-auth, allow/deny, geo, limit_req, method restriction
  or ModSecurity directive was found. Existing sensitive-file/WordPress filters
  do not match the callback path. No external WAF's unpublished policy can be
  disproved from Nginx alone.
- Historical window: **09:25:47–10:30:47 UTC**, i.e. 17:25:47–18:30:47 Beijing;
  payment at 09:30:47 UTC. Available access logs: callback requests 0, 4xx 0,
  5xx 0. Nginx error entries naming the callback in that window: 0. PM2 structured
  callback observations and payment_callback_logs for WeChat in that window: 0.
  This is absence in available logs, not proof that the Provider never sent.
- Exactly two synthetic attempts with **empty JSON and no session identity**:
  workstation request timed out/failed locally, no matching app observation;
  Production via public domain returned 400 and its unique request ID appeared
  in payment_callback_logs. No retry/additional probe was sent.
- Before/after hashes of all three recharge/session rows, their user's balance
  and matching ledger rows were identical. Only permitted callback log records
  were generated. The first two canaries remained uncredited and the third
  retained its prior exactly-once completion. Alipay/WeChat remained disabled,
  USDT enabled. The temporary server audit helper was removed; root-only safe
  audit state was retained.

## Official protocol

Primary sources checked: [SNPAY create](https://www.snpay.cn/doc/pay_create.html)
and [SNPAY payment notification](https://www.snpay.cn/doc/pay_notify.html).
The create request requires notify_url. The asynchronous notification is **GET**,
not POST; the existing route supports both. Merchant must verify RSA signature,
timestamp and transaction state, and respond with the plain success token only
after safe handling. These pages do **not** specify a retry schedule, a required
merchant-dashboard toggle, or a mandatory source-IP allowlist. Those facts remain
**unknown** and require Provider support confirmation; other payment platforms'
retry rules must not be substituted.

## Classification and next evidence

**PROVIDER_CALLBACK_NOT_SENT_OR_NOT_OBSERVED**. Current notify configuration and
server-public route work, and historical incoming evidence is absent. The failed
workstation probe is an explicit limitation; it is not evidence of an application
rejection or a global website outage. No conclusive Provider-side root cause is
claimed. Ask support for the exact order's saved notify_url, delivery attempts,
DNS resolution/IP family, timestamps, transport errors/HTTP responses, retries
and any required async-notification setting. Supply identifiers privately, never
include keys/signatures or customer data in this document. Keep WeChat closed.
