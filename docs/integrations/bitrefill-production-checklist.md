# Bitrefill staged production checklist

Date: 2026-10-14. All actual gates below are **NOT_STARTED**. A passing offline fixture is not a production gate pass.

| Stage / gate | State | Required evidence and sign-off |
| --- | --- | --- |
| Business API approval and terms | NOT_STARTED | Approved account, permitted products/countries, resale/refund terms, named owner. |
| Server-side Business credentials and rotation | NOT_STARTED | Secret-manager references, no browser exposure, rotation/revocation drill. |
| Read-only production probe | NOT_STARTED | Explicitly authorized bounded GETs, 10 Apple target mapping review, quota/403/503 evidence; no writes. |
| Cost and margin review | NOT_STARTED | Live package IDs, exact currency/face/cost quote, tax/funding fees and approved margin policy; no FX assumptions. |
| Schema and security review | NOT_STARTED | Durable attempt→invoice→external-order→order-item allocation, RLS, non-public exposure, minimum service-role grants, transactional unique delivery. No SQL generated here. |
| Migration pre/postchecks and rollback | NOT_STARTED | Separate DB authorization, non-destructive rollback for already purchased items, staged verification. |
| Provider-neutral availability gate | NOT_STARTED | Boolean Bitrefill stock without fabricated quantity; provider+country hourly cache and stale 503 behavior. |
| Purchase switch and observability | NOT_STARTED | Default closed, Daju unaffected, incident taxonomy/alerts, credential redaction, operator drill. |
| Reconciliation worker | NOT_STARTED | Authenticated invoice/order GET, bounded 1/2/5/10/30-minute polling, unknown-ID manual path, partial outcomes. |
| Webhook edge controls | NOT_STARTED | Rate limiting/abuse telemetry, bounded body read, replay queue dedupe; body never authoritative. |
| Real canary approval and execution | NOT_STARTED | One low-value fixed package, business/finance/security sign-offs, durable record, kill switch, manual on-call. |
| Gradual rollout | NOT_STARTED | Country/SKU allowlist, low concurrency, stop criteria, refund/support flow and monitoring window. |

Release blocker: `MIGRATION_REQUIRED_FOR_PURCHASE=yes`. Existing SQL atomically inserts a delivery plus private secret and enforces one delivered supplier row per Jianlian order item, but it cannot persist a shared Bitrefill invoice and each external order/unit. The offline post-submit-without-ID crash remains `UNCERTAIN` and requires manual reconciliation. Do not claim production automatic recovery. No deployment, migration, environment update, binding, sync, probe, canary or purchase occurred in this task.
