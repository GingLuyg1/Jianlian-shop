# Supplier operations runbook — offline hardening V1

Status: design and local tests only; **Bitrefill production purchase closed**. Date: 2026-10-14.

## Operating boundary

The active fulfillment-handler route still registers Daju only. Bitrefill HTTP transport allows GET only; invoice creation is available solely through FakeTransport tests. Do not turn on supplier bindings, sync, payment, purchase, migrations, scheduled reconciliation or a real canary under this runbook without a separate release authorization. Existing SQL has atomic delivery/secret insertion and unique order-item delivery constraints, but it does not contain the durable invoice/individual order model needed for Bitrefill. The five crash fixtures are evidence of conservative decisions, **not production automatic recovery**.

Keep a single purchase-disabled switch at the provider routing layer for future rollout. Its default is closed; an incident operator must be able to close it without disabling Daju or read-only GETs. An unknown post-submit outcome must remain `UNCERTAIN`, never be repurchased automatically. If an external invoice ID was persisted, use authenticated GET to reconcile; if it was not, stop for manual supplier/support and finance investigation. Do not guess an invoice from time, amount, or webhook body.

## Catalog and stock evidence

For a future cache, key by `(provider, country)`; refresh no more frequently than hourly as the normal cadence, respecting provider quotas. Record last successful timestamp, attempt timestamp, response class and stale flag separately. On 503, retain the last successful directory for browsing, mark it stale and alert; do **not** use stale evidence to authorize purchase. Availability is Bitrefill boolean `in_stock`; quantity is unknown, not zero or an invented integer. Never replace a frozen product/package with a similarly named current product. At purchase planning, require a fresh product/package read and exact frozen product, package, currency, face, decimal quote and cost ceiling match. A changed price, package or currency blocks the plan and needs operator review; no FX service is consulted.

## Reconciliation and incidents

The webhook is an untrusted wake-up signal: final status IDs only, at most 64 KiB, bounded read time/JSON complexity, no delivery or DB writes. Future workers must fetch invoice and each order via authenticated GET, compare durable invoice/order bindings and use one transactional private delivery path. Duplicate notifications must collapse by stable event fingerprint, but that fingerprint is not authority. No reusable webhook rate-limit infrastructure was found in this worktree; provider/IP-aware rate limiting and abuse telemetry are a **future infrastructure requirement**, not a claim of current protection.

For a known invoice ID, use a finite reconciliation schedule such as 1, 2, 5, 10 and 30 minutes (five attempts, jitter and quota-aware `429` wait), then stop in a human queue. Never poll forever. Each read has a timeout and finite GET retry. Neither a timeout nor 5xx can trigger a second purchase POST. If all orders are not delivered with authoritative redemption, keep the affected order items in reconciliation; completed items may be individually considered only when their external order-to-item unit binding is durable and unique. A partial invoice is never globally fulfilled.

| Event class | Operator action |
| --- | --- |
| Auth 401/403, credential leak suspicion | Close Bitrefill purchase; rotate credential, verify old credential revoked, audit access. Do not log headers. |
| 429 or quota exhaustion | Stop active read burst; honor bounded retry/backoff; keep stale catalog visible but not purchasable. |
| 503, DNS/TLS/network/GET timeout | Retain last successful catalog as stale; limited GET retry; alert if sustained. |
| POST timeout or process loss after send | `UNCERTAIN`; no POST retry. If invoice ID absent, manual reconciliation. |
| Price/currency/face/package drift or missing cost | Block plan, investigate mapping/quote; never substitute package or calculate FX. |
| Delivered/failed/refunded mix, unknown status, missing redemption | Reconcile affected units via authoritative GET; no blanket fulfillment. |
| Webhook replay/malformed/oversized/slow | Reject or safely acknowledge the ID-only signal; no side effects. Escalate abuse volume to edge/WAF owners. |

## Credential rotation and read-only probe

Store Personal or Business credentials in the approved server-side secret manager only; never in browser, logs, docs, tickets or test fixtures that resemble real keys. Provision a replacement, test authenticated read-only GET with the purchase switch closed, switch secret reference, revoke the old credential, then verify 401 on the old secret and monitor the new read path. Record who approved and when. The existing `scripts/probe-bitrefill-readonly.mjs` is a bounded GET-only candidate probe; run it only after credential approval and explicit operational window. Do not paste its raw response or credential. No probe ran in this offline task.

## Real canary design (not executed)

After the checklist gates pass, separately authorize one low-value fixed-package canary with a known merchant order item, frozen exact quote/cost/currency, durable attempt and invoice/order schema, unique delivery semantics, a pre-funded approved payment method and manual rollback/incident contacts. Keep concurrency at one and the kill switch closed by default. Observe submit, persisted invoice ID, authenticated GET, private delivery and duplicate notification/restart; stop on any drift or uncertainty. A canary is a real purchase and requires separate authority.

## Daju precision audit

Daju's `parseDajuDecimal` accepts a finite JavaScript number and converts it to a string; its comparison guard then uses decimal strings/BigInt. The input conversion may already have lost precision for upstream JSON numeric literals, and existing public/DB contracts use the current shape. No zero-contract-change proof was established, so this task **records the risk without changing Daju amount parsing or storage**. A future change needs fixture compatibility, schema/contract review and release authorization.
