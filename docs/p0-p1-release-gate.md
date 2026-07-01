# Jianlian Shop P0/P1 Release Gate

Last updated: 2026-07-01

## Status Vocabulary

| Status | Meaning |
| --- | --- |
| PASS | Verified by a reproducible check. |
| FAIL | Verified failure. Must be fixed before release if P0/P1. |
| BLOCKED | Verification could not be executed. Reason is recorded. |
| NOT_IMPLEMENTED | Feature is absent or incomplete. |
| NOT_APPLICABLE | Out of scope for this release. |

## Release Decision Rules

### GO

- All P0 items are PASS.
- Key P1 items are PASS or explicitly accepted.
- Required migrations are confirmed applied in the target database.
- Core business chains have been tested against real data.
- Real payment is verified, or payment is explicitly closed.

### CONDITIONAL GO

- No P0 items remain.
- Remaining P1 items do not affect core transaction safety.
- Blocked checks have documented manual handling steps.
- Payment remains closed if real providers are not verified.

### NO-GO

Any of the following makes the release NO-GO:

- Product save cannot be proven against the database.
- Cross-user order or delivery access is possible.
- Balance, payment, refund, or recharge idempotency risk is present.
- Fake payment success, fake QR code, or fake wallet address is returned.
- Digital inventory can be delivered twice or across SKU.
- Required migrations are missing or not confirmed.
- Core pages white-screen or critical APIs return unhandled 500.
- Production server/PM2 version cannot be matched to GitHub `main`.

## Current Gate Result

**NO-GO**

Reason:

- Automated logic tests, TypeScript, and production build passed.
- Real browser flow, real Supabase write/read verification, production PM2 version, and production database migration state were not executed in this task.
- Checkout still contains local static SKU option mapping (`SKU_OPTIONS_BY_PRODUCT_ID`) in `app/checkout/page.tsx`, so the full multi-SKU purchase path is not proven to be driven entirely by Supabase SKU data.

## P0 List

| ID | Item | Status | Severity | Evidence | Blocker / Fix |
| --- | --- | --- | --- | --- | --- |
| P0-001 | Product save updates the real database | BLOCKED | P0 | Logic tests passed, but no real Supabase write/read test was executed. | Test with admin session and Supabase staging data before release. |
| P0-002 | Cross-user order and delivery isolation | BLOCKED | P0 | Source tests passed permission helpers; no live user A/B browser/API test executed. | Run live A/B account test against staging. |
| P0-003 | Payment callback cannot create fake success | PASS | P0 | Node regression tests verify provider verification and no browser-paid path. | Keep provider disabled until real sandbox is verified. |
| P0-004 | Recharge/balance idempotency | PASS | P0 | Node tests verify recharge callback applies once. | Still requires staging callback replay test. |
| P0-005 | Digital inventory SKU isolation | PASS | P0 | Node tests verify SKU-isolated allocation and idempotent delivery. | Still requires staging order-delivery test. |
| P0-006 | Multi-SKU checkout uses real SKU data | FAIL | P0 | `app/checkout/page.tsx` contains `SKU_OPTIONS_BY_PRODUCT_ID`. | Replace static SKU mapping with Supabase SKU query before selling multi-SKU products. |
| P0-007 | Required migrations applied in production | BLOCKED | P0 | Local migration files listed; production Supabase was not queried. | Manually compare applied migrations in Supabase before release. |
| P0-008 | Production server SHA equals GitHub main | BLOCKED | P0 | Local/GitHub state checked; server was not connected. | Run manual server version commands in deployment runbook. |

## P1 List

| ID | Item | Status | Severity | Evidence | Fix |
| --- | --- | --- | --- | --- | --- |
| P1-001 | Build warnings cleaned up | BLOCKED | P1 | Build passes but emits Supabase dynamic require and CSR deopt warnings. | Accept for now or reduce CSR deopts later. |
| P1-002 | Encoding cleanup in admin/payment strings | FAIL | P1 | Static inspection found garbled Chinese strings in payment-channel route output. | Normalize user-facing strings to UTF-8 Chinese or stable ASCII. |
| P1-003 | Runtime browser console/network check | BLOCKED | P1 | Dev server/browser verification not executed in this task. | Run local or staging browser checklist. |
| P1-004 | Production static assets return 200 | BLOCKED | P1 | Build generated assets; production Nginx not checked. | Verify `/_next/static` after deployment. |

