# Payment Production Gap Audit — 2026-09

## Scope and baseline

This is a repository-backed audit of Jianlian's payment creation, callback, reconciliation, recovery, completion, refund, channel administration, and Production operations. The code baseline was Production release `622adc11cd3d0bc2f326f26bdbbecbe5896bd044`; the only automatic production-logic change in this audit is the bounded WeChat watcher candidate-discovery parity fix described below. No historical migration is rewritten and no payment, refund, balance, ledger, or Production database action is performed by this document.

The observed Production architecture at the start of the audit was:

- Next.js/PM2 application with unified payment-session creation and callback routes.
- Liuhaoyi V1 aggregate provider for Alipay and WeChat, using merchant PID plus MD5 callback verification.
- Canonical completion through `completePayment()` and PostgreSQL `complete_payment_session(...)`; recharge credit remains inside database transactions.
- Separate one-minute Alipay and WeChat systemd watcher timers with dedicated locks and dual execute gates.
- Public channels: Alipay enabled, WeChat disabled, USDT-BEP20 enabled.
- Alipay and WeChat recovery are restricted to account recharge, CNY, and their pinned channel/provider identity.

## External benchmark principles

These references are principles, not drop-in protocol requirements:

- Stripe documents raw-body webhook signature verification and recommends idempotency keys for retry-safe create/update requests: [webhook signatures](https://docs.stripe.com/webhooks/signature), [idempotent requests](https://docs.stripe.com/api/idempotent_requests).
- The official WeChat Pay APIv3 SDK requires the original callback body plus signature metadata and treats verification failure as an authentication failure: [wechatpay-java callback guidance](https://github.com/wechatpay-apiv3/wechatpay-java#%E5%9B%9E%E8%B0%83%E9%80%9A%E7%9F%A5). Jianlian uses Liuhaoyi V1 MD5, not direct APIv3, so APIv3 headers/certificates must not be added to this adapter; the applicable principle is “no verification bypass.”
- Yansongda separates provider/gateway selection and exposes distinct pay/refund/close/find/verify lifecycle methods: [yansongda/pay v1 documentation](https://github.com/yansongda/pay/blob/master/web/docs/v1/index.md). Jianlian must still honor the narrower Liuhaoyi V1 capability actually documented and implemented.
- Medusa models payment behavior behind provider interfaces and workflows: [Medusa payment provider reference](https://docs.medusajs.com/resources/references/payment/provider). Jianlian's provider abstraction, canonical completion boundary, and database locks serve the corresponding separation and concurrency goals.

## Confirmed WeChat expiry-parity defect and repair

Before this change, `lib/payments/liuhaoyi-wechat-watcher.mjs` required `expires_at > now` both in the PostgREST query and `candidateMode()`. A user could therefore pay before expiry, lose/delay the callback, and become permanently invisible to the WeChat watcher once local time passed expiry—even though `evaluateLiuhaoyiWechatRechargeRecovery()` correctly accepts a trusted provider `paid_at` at or before both local expiry values.

The repair mirrors the already validated Alipay discovery model:

- select only pending Liuhaoyi/WeChat/CNY/recharge sessions created between `now-24h` and `now-60s`;
- require a parseable expiry but do not require it to remain in the future;
- keep the five-second future-expiry margin in dry-run mode;
- allow an expired session inside the bounded lookback to reach the recovery worker;
- leave all amount, currency, provider type, identity, ownership, transaction uniqueness, paid-time, ledger, status, dual-gate, and canonical database guards unchanged.

Allowing a row into the worker is not permission to credit it. `lib/payments/liuhaoyi-recovery-policy.mjs` and `lib/payments/liuhaoyi-wechat-recovery-service.ts` still require trusted `paid_at <= session.expires_at` and `paid_at <= recharge.expires_at`; missing, invalid, or late paid time is rejected/manual-review. `supabase/migrations/20260926130000_liuhaoyi_paid_before_expiry_completion.sql` keeps `FOR UPDATE`, idempotent paid returns, provider transaction uniqueness, and the same paid-time boundary at the canonical completion layer.

## A–AF findings

| ID | Control | Result | Priority | Repository evidence and conclusion |
|---|---|---|---|---|
| A | Callback authentication | PASS | — | `handlePaymentCallback()` in `lib/payments/payment-callback-service.ts` reads the raw body before provider verification; `verifyCallback()` in `lib/payments/providers/liuhaoyi.ts` verifies the Liuhaoyi MD5 signature and merchant identity. The localhost-invalid-signature regression proves there is no Host-based bypass. |
| B | Callback identity binding | PASS | — | `callbackSessionNoCandidate()` / `callbackSessionIdentityMatches()` and Liuhaoyi callback parsing bind `out_trade_no`, session, channel, provider PID/type, and provider transaction identity before completion. |
| C | Amount validation | PASS | — | `amountEqual()` in callback service and exact CNY comparison in `liuhaoyi-recovery-policy.mjs` reject mismatches and create manual-review evidence. |
| D | Currency validation | PASS | — | Callback service compares normalized session/provider currency; recovery policy requires CNY. |
| E | Status transition validation | PASS | — | `assertPaymentStatusTransition()` gates non-paid and paid transitions; terminal/local-completed states are rejected or returned idempotently. |
| F | Completion idempotency | PASS | — | `completePayment()` calls only `complete_payment_session(...)`; the canonical SQL returns idempotently for paid sessions and owns downstream recharge/order completion. |
| G | Database row locking | PASS | — | `complete_payment_session(...)` and `complete_account_recharge(...)` in `20260926130000_liuhaoyi_paid_before_expiry_completion.sql` use `FOR UPDATE`. |
| H | Provider transaction uniqueness | PASS | — | `payment_sessions_provider_transaction_unique` and `payment_sessions_provider_order_unique` in `20260623_payment_provider_core.sql`; recovery policy also rejects a conflicting local transaction. |
| I | Callback/recovery race | PASS | — | Both paths converge on canonical completion. `scripts/ci/payment-watcher-real-db.sh` exercises callback/recovery races against isolated PostgreSQL. |
| J | Double recovery | PASS | — | OS `flock`, per-process running guard, canonical row locks, reconciliation dedupe, and isolated PostgreSQL double-recovery races cover duplicate execution. |
| K | Callback replay | PASS | — | Paid sessions return duplicate success without a second completion; callback logs may repeat while ledger/credit remains exactly once. |
| L | Provider query timeout | PASS | — | Watchers bound candidate reads, provider queries, each worker, total batch, and systemd oneshot duration; malformed/timeout/network cases fail closed. |
| M | Reconciliation/manual review | PASS | — | `reconciliation-service.ts` and both recovery services upsert redacted evidence using `dedupe_key`; mismatch and late/unknown paid-time cases go to manual review. |
| N | Late-payment semantics | PASS | — | After this fix, discovery can reach paid-before-expiry rows after expiry; policy and canonical SQL allow `<` and `==` expiry while rejecting `>`/missing/invalid paid time. |
| O | Stale pending detection | GAP_CONFIRMED | P1 | Both Liuhaoyi watchers stop at a 24-hour lookback. There is no separate “about to leave lookback” alert or stale-pending/manual-review surfacing job. Do not silently enlarge the window; add an operational stale queue first. |
| P | Payment create/session idempotency | PASS | — | `reserve_payment_session(...)`, `payment_sessions_active_business_unique`, recharge `client_request_id`, and unique-violation recovery prevent duplicate active sessions/provider creation for the same business. |
| Q | Duplicate browser submission | PASS | — | Recharge POST requires and reuses `client_request_id`; payment-session creation first reuses/reserves the active business/channel session, including concurrent initialization waiting. |
| R | Payment-session reuse | PASS | — | `isReusablePaymentSession()` validates business, user, channel, provider, active status, and future expiry before reuse. |
| S | Rate limiting / abuse protection | GAP_CONFIRMED | P1 | User and business limits exist in `app/api/payments/create/route.ts` and user recharge limits in `app/api/recharges/route.ts`, but `lib/security/rate-limit.ts` is an in-process Map and the create routes do not enforce a durable/shared IP bucket. Multi-process/restart behavior is not a reliable Production abuse boundary. |
| T | Per-user outstanding payment limits | GAP_CONFIRMED | P1 | Per-business active-session uniqueness exists, but no bounded count of all active recharge/payment sessions per user was found before provider order creation. |
| U | Callback log growth / retention | GAP_CONFIRMED | P2 | `payment_callback_logs` has useful payment/channel/time/result/session indexes, but no callback-log retention or archival job was found. Preserve evidence; define an approved retention/archival policy before deletion. |
| V | Reconciliation log growth / retention | GAP_CONFIRMED | P2 | `payment_reconciliations` has dedupe and query indexes, but no Production retention/archival policy. Historical payment evidence must not be broadly deleted. |
| W | Timer/service failure observability | GAP_CONFIRMED | P1 | Structured journal events exist, but the Alipay/WeChat units have no `OnFailure=` hook or other repository-backed automatic alert for repeated service failure/stoppage. |
| X | Stale timer alerting | GAP_CONFIRMED | P1 | No heartbeat freshness monitor verifies that each enabled timer has completed within an expected interval. `systemctl active` alone does not prove recent successful execution. |
| Y | Backlog alerting | GAP_CONFIRMED | P1 | Watchers emit `backlog_present` and `remaining_count`, but no alerting consumer/escalation is implemented. |
| Z | Secret redaction | PASS | — | Callback summaries, watcher output, provider errors, monitoring logs, and admin audit values use allowlisted/sanitized summaries; runtime tests reject signed-URL/secret leakage. |
| AA | Secret rotation readiness | PASS | — | Provider/app/watcher secrets are environment-driven, watcher env files are independently replaceable, and current runbooks support root-only rotation without code changes. |
| AB | Admin audit | PASS | — | Payment-channel and payment/reconciliation/refund admin mutations call `writeAdminAuditLog()` with sanitized before/after summaries and request IDs. |
| AC | Refund lifecycle | NEEDS_DECISION | P1 | User refund requests, partial approved amounts, balance refunds, and manually recorded external refunds exist. Liuhaoyi automatic refund is not implemented; business policy must decide supported automatic vs manual scope and operator evidence requirements. |
| AD | Unsupported close/refund behavior | NEEDS_DECISION | P1 | Liuhaoyi `closePayment()` explicitly reports unsupported, while local close catches provider-close failure and closes locally; capabilities report `supportsRefund: false`. Decide whether to keep local-only close/manual external refund or adopt a documented provider API—do not invent one. |
| AE | Provider/channel enable validation | PASS | — | New sessions require enabled/configured channels, provider/channel/currency/amount capability, and trusted provider config. Existing valid sessions can still receive authenticated callbacks after a channel is hidden. |
| AF | Production health/runbook | PASS | — | `docs/operations/liuhaoyi-payment-runbook.md`, separate immutable releases, PM2 cwd/health checks, exact systemd release paths, locks, and channel-state gates define deploy/rollback verification. Runtime freshness alerting remains tracked separately under W/X. |

## Priority summary

### P0

No residual P0 item is known after the WeChat expiry-parity repair and its test/deployment gates. Any failure of callback authentication, canonical completion, row locking, uniqueness, or exactly-once regression would immediately reclassify as P0 and block channel enablement.

### P1

1. Surface Alipay and WeChat pending rows before they leave the 24-hour recovery lookback.
2. Replace process-local-only create throttling with a shared/durable user and IP control.
3. Add a per-user active/outstanding payment/recharge limit before provider order creation.
4. Alert on watcher service failures and disabled/stopped timers.
5. Alert when enabled timers have no recent successful heartbeat.
6. Consume watcher backlog metrics and alert on sustained backlog.
7. Decide Liuhaoyi automatic versus manual refund support, including partial-refund policy.
8. Decide whether local-only close is acceptable while Liuhaoyi V1 close/cancel remains unsupported/unconfirmed.

### P2

1. Define evidence-preserving retention/archival for `payment_callback_logs`.
2. Define evidence-preserving retention/archival for `payment_reconciliations` and run/log tables.

## Recommended future work

- Build a read-only stale-pending dashboard/job with explicit manual-review escalation before changing either 24-hour lookback.
- Store rate-limit counters in a shared atomic backend and apply both authenticated-user and trusted-source/IP policies; add a separately configured outstanding-session ceiling.
- Add a small systemd/monitoring heartbeat and failure-alert path for both watcher families, including sustained `backlog_present`.
- Write and approve retention periods, archival storage, legal/audit requirements, and indexed deletion batches before any payment-evidence cleanup.
- Document the Liuhaoyi V1 refund/close capability with provider-confirmed behavior; keep manual external refund evidence until an authenticated, idempotent API is proven.
- Keep WeChat public disabled until the exact parity-fix commit passes CI, is deployed, is the actual systemd runtime source, completes two normal timer cycles, and produces zero unexpected completion/fund mutation.
