# Bitrefill Giffgaff £10 — known Invoice/Child read-only audit (2026-11-04)

## Scope and preserved production evidence

- Mainline: restricted-budget stockout auto-purchase only. Reuse PR99's completed public-sale local-stock payment/delivery (one customer charge and one PIN delivery).
- Last reported app Production SHA: `e679e9daad7c55b36b12463552dcf900eacef1d2`. Actual supplier's single £10 PIN purchase debited USD 13.46; the local card was delivered for CNY 98.80 and stock is zero.
- The original local execution evidence is in `D:/Jianlian/_giffgaff_public_stock_launch_20261104/FINAL_REPORT.md`. Re-read it through local Codex before a server probe. The customer order `JL202611040940168773` is **not** an invoice ID.
- USD wallet last snapshot was USD 0.75, not enough for another £10 purchase. Do not fund, purchase, enable stockout checkout, rerun Production migrations, or re-test money.

## Reused code, no new purchase engine

`auditKnownBitrefillPinInvoice` in `lib/providers/bitrefill/single-item-purchase.mjs` invokes **only** the existing injected `readInvoice(invoiceId)` and `readOrder(childId)` methods. It reuses `verifiedSingleChild` from the live fulfillment chain. The caller supplies the known existing supplier Invoice ID and an exact immutable Giffgaff product, Package, GBP face and optionally the known child ID. It refuses a missing, mismatched or multiple child; no invoice enumeration or inferred order ID.

The returned frozen summary contains only Invoice/Child statuses, exact-identity and redemption-presence booleans. It does not expose PIN, card code, redemption URL, credentials, raw supplier JSON or customer identifiers. The function does **not** claim an authoritative USD debit or fee schedule or a supplier-enforced spending cap, even when a valid delivered PIN is found. It performs no ledger or inventory write.

The REST client can be constructed with `purchaseEnabled:false`; the compile-time purchase gate stays `false`. The audit is not wired into a public route, Worker, scheduled job or checkout path.

## On-host read-only check for local Codex

1. Read master + supplier handoffs and the original private 2026-11-04 purchase report. Verify that the **supplier's own** Invoice ID is known. If not, STOP (do not guess or list all invoices). Reuse only that already-owned ID.
2. Check exact current GitHub source SHA, then stage the reviewed standalone helper with installed dependencies. Reuse a server-protected credential source; do not print/export/log its value.
3. Construct the existing `BitrefillPurchaseHttpTransport` with Personal credentials, `purchaseEnabled:false`, `fetchImpl:fetch`. Call `auditKnownBitrefillPinInvoice({transport,invoiceId,expectedProductId,expectedPackageId,expectedFaceValue:'10',expectedFaceCurrency:'GBP',expectedChildId})` using the frozen local supplier identity. Obtain product/Package identity from private supplier binding evidence; do not hard-code a speculative Package ID.
4. Verify precisely one authenticated GET Invoice and one GET Child. If any API response fails, or Invoice statuses/child identity disagree, classify as manual review. Do not retry purchase, issue any POST, call list-invoices, or expose redemption fields.
5. Save only a redacted status summary and exact source SHA in protected local evidence. Record whether invoice/debit/fees/price-lock fields are **actually present and authenticated**, and mark unknowns unverified; do not extrapolate the prior USD 13.46 debit to future orders.
6. Update master + Bitrefill handoffs with exact on-host outcome, blockers and a STOP marker. No Production application deploy or schema modification is required for this read-only audit.

## Acceptance, limits and follow-on

- Targeted tests: `node --test tests/unit/bitrefill-known-invoice-audit.test.mjs tests/unit/bitrefill-p1-purchase.test.mjs tests/unit/bitrefill-pin-fulfillment.test.mjs`. All responses are synthetic; no network purchase.
- Pass requires correctly matched frozen Invoice/Child identities and the fixed redacted summary. A delivered order proves read-only supplier reconciliation only, not fee-inclusive pre-purchase pricing, authentic final USD debit or a guaranteed provider debit ceiling.
- Keep three Giffgaff supplier stockout authorizations disabled and preserve the existing local-first fulfillment; no fallback customer payment when local stock is zero. Only after independent verified debit/fees, budget/FX economics and a reviewed release may auto-purchase be considered.
- Return: `KNOWN_INVOICE_GET`, `CHILD_GET`, `FROZEN_IDENTITY_MATCH`, `SECRET_REDACTION`, `USD_DEBIT_AUTHORITATIVE`, `FEE_INCLUSION_VERIFIED`, `SUPPLIER_MAX_DEBIT_ENFORCEABLE`, `PAYMENT_EXECUTED=no`, `SUPPLIER_PURCHASE_EXECUTED=no`, `PRODUCTION_CHANGED=no`, `EXACT_BLOCKER`, `NEXT_ACTION=STOP`.

This preparation deliberately does **not** reinterpret a fixture as Production evidence.
