项目执行原则：能由 Codex 自动完成的操作一律交给 Codex；仅在输入私密口令、必要授权或确实无法自动完成时要求用户操作，避免重复确认、反复测试和耗时等待。

# Bitrefill purchase release preparation V1

Supplier-only Draft PR preparation; no real purchase, Invoice, balance debit, Production SQL or deployment. Preserve Personal commits `50740f9` and `1b849f1`, UI #87/#88, the formal Daju provider and the USDT scanner. Account observations, actual candidate prices and Production metadata stay in local evidence, not Git or public SKU metadata.

## Additional wiring, not a second purchasing engine

- `mcp-purchase-transport.mjs` binds exactly one canonical frozen REST Product/Package request to the prepared MCP `package_value`, `payment_method=balance`, `balance_currency=USD`. It has one POST attempt and no secondary pay. Both its instance switch and the unchanged compile-time release gate must pass; the gate remains false. The unchanged default registry does not enable this transport.
- MCP creation parsing accepts the documented JSON response envelope, retaining only an explicit Invoice UUID. An explicit valid ID accompanying `PAYMENT_UNCERTAIN` is retained only as a reconciliation reference. Missing/malformed/error responses stop as uncertain. Embedded codes/status are never delivered directly.
- Authoritative Invoice and Child reads delegate to the existing REST GET transport. The original exact product/package/face/currency/quantity/Invoice/Child checks and private-delivery RPC remain unchanged. **Actual visibility of an MCP-created Invoice through REST is a cross-interface acceptance item, not yet demonstrated by a live purchase.** If not readable or mismatched, stop for review; never buy again to resolve it.
- `runBitrefillMcpUsdSingleItemPurchase` uses the existing private `runClaimedPurchase` implementation: durable logical key, semantic hash, atomic CLAIMED→SUBMITTING, EXTERNAL_CREATED/UNCERTAIN persistence and replay suppression. Existing REST/Business functions and Daju are not redirected or rewritten.
- The USD preparation, server-paid order and immutable SKU/root/cost/profit/currency checks run before claim. Before sending, refresh evidence must retain price, credential, root/attempt token, binding and requested denomination. Drift is marked failed-before-send and conservatively requires review, never an automatic second attempt. USD shortage cannot fall back to another wallet.
- Local synthetic transport testing explicitly subclasses the existing FakeTransport and has no network callback. Real transport/entry paths remain blocked. No production route/Worker or alternative stock reservation is added.

## Existing local inventory and delivery

The unchanged unified delivery entry reserves all local card stock atomically. Full local delivery marks items delivered and prevents supplier selection. Only insufficient, unreserved stock follows the order-time frozen supplier mapping. Do not substitute Bitrefill for Daju or an unrelated account/gift-card SKU. Multiple/partial/failed/missing-secret responses never write private delivery content; uncertain purchases reconcile the persisted Invoice reference and require manual intervention when evidence remains incomplete.

## Quote and release limits

The actual MCP product-details price is an authenticated display price, not automatically a fee-inclusive guaranteed final debit. This task does not create an Invoice to discover fees. Unknown fees stay unknown and cannot be normalized to an approved quote. No approved CNY procurement FX contract is invented from old storefront face-value pricing or the separate USDT recharge conversion.

The live buy-products schema has no verified client-supplied maximum-debit or price-lock parameter. A pre-submit amount check cannot by itself enforce an atomic upstream spending cap across a price change. **Do not enable real purchasing until final fees and a provider-supported price/budget boundary are confirmed under the exact financial authorization.** Do not borrow x402/crypto lock semantics for USD store credit.

No corresponding storefront gift-card SKU is inferred from a same-brand digital account or a different-brand USD denomination. Candidate selection/binding and pricing remain internal and require a verified exact SKU. No Production product or stock write occurs here. Commercial resale remains separately gated even when personal technical access works.

## DB9/V6 paired preparation

Reuse the exact existing DB9 candidate `supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql` and V6 `scripts/security/bitrefill-security-aftercare-v6.sql`. Freeze original Git/LF checksums in the local release package; do not amend historical migrations or run db push.

Required fresh preflight: target project/release identity, generic supplier root and exact existing RPC signatures/types, trusted owner/role paths/default ACLs, metadata RLS/public views/column privileges, refund signatures/history ACL and migration history. An unavailable connection is BLOCKED, not a pass based on old evidence. The last actual stored Production evidence says the five DB9 tables are absent and ordinary roles can read metadata; this task's new SSH attempt timed out without a usable Schema/ACL receipt.

DB9 adds procurement persistence/RPCs and its ACL assertions; V6 narrows public product/SKU projections and includes refund-entry/history permissions. It is not merely a metadata-column revoke. Pair only with verified public DTO and admin-private reads in a compatible app release. After exact SQL authorization, execute the frozen increments in controlled transactions and use the existing independent read-only parity/role postchecks. Do not modify financial rows, scanner or Daju mappings.

Rollback: keep real purchasing off and switch only to compatible immutable app artifacts; retain all purchase/Child/idempotency evidence. Do not drop live procurement tables, restore public metadata access or replay a payment as a rollback. A committed SQL transaction needs separately reviewed forward correction, not a claimed SQL ROLLBACK.

## Focused evidence

New targeted tests exercise the original durable claim and private-delivery code through synthetic MCP envelopes, replay suppression, timeout/PAYMENT_UNCERTAIN, price/balance drift, partial/absent secrets, local-stock priority and the closed real transport. No historic full Mock/PG suite is repeated. Pure decoder default error handling remains strict for read-only calls; the guarded purchase parser alone may retain an explicit uncertain Invoice reference.

Local evidence and the single conditional small-purchase proposal: `D:/Jianlian/_bitrefill_purchase_release_prep_v1_20261031/`. Read-only product checks are limited to three known candidates. No actual payment or fulfillment acceptance is claimed.
