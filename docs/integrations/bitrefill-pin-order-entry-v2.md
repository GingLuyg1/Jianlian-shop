# Bitrefill PIN order entry V2 (candidate; not deployed)

This extends PR91's existing PIN workflow, not the payment engine or purchase
queue. Production migration, deployment, permission setup, funding, SKU sale
activation and a bounded real purchase are separate future gates.

## Exact scope

The existing `/api/orders` handler retains authentication, catalog/category,
agreements, risk, payment-channel checks and its ten-parameter order RPC. A
server preflight runs immediately before that RPC for exactly these SKU IDs:

|SKU code|SKU ID|Product ID|Bitrefill package|GBP face / MCP value|
|---|---|---|---|---|
|BFR-GB-GIFFGAFF-GBP-010|eeef050f-3b56-492d-a0a2-0640e4c1355f|e00553bf-a2da-48c7-9bdc-9b897b18b2fd|giff-gaff-pin-united-kingdom<&>10|10|
|BFR-GB-GIFFGAFF-GBP-015|4cf72256-72ca-47b0-8dca-9904a0d70f69|5e4025b0-9a14-4827-87a2-f7f3e0e79734|giff-gaff-pin-united-kingdom<&>15|15|
|BFR-GB-GIFFGAFF-GBP-020|f1333d43-8f0b-4041-a120-c980f7e58147|b2878f67-344a-40e4-af59-b32b6db21d29|giff-gaff-pin-united-kingdom<&>20|20|

All use upstream product `giff-gaff-pin-united-kingdom`, GB, GBP denomination,
USD procurement, PIN delivery, quantity one, no phone input. No product, SKU,
category, price, inventory or formal supplier binding is written by migration.
It seeds three *disabled* private sale authorizations with no approved financial
limits. Daju and non-target orders bypass the preflight without a new DB query.

## Private quote and immutable order binding

`bitrefill_pin_private.sale_authorizations` is operator-approved scope and caps.
`order_quotes` is a single-user/request short-lived quote ticket, not a second
purchase record/queue. RLS plus schema/table/function ACL prevents customer
access. Only service-role invoker wrappers reach private constrained issuer and
reader functions. Clients cannot supply costs, paid status or licensing claims.

The issuer verifies active product/SKU/category, exact identity, all-in USD cost,
verified CNY fees, settlement FX, quote/FX age (five minutes), balance age (60s),
account, permission/funding references, enforced cap and atomic budget readiness.
`allInUsd * fxRate + cnyFees <= salePriceCny * 0.85`; the original shared policy
also rechecks this after real payment and immediately before submission. SQL
uses exact numeric arithmetic; DB9 USD cost must fit six decimals and CNY sale
price must be positive whole cents. No invented price, FX or fee is accepted.

`create_order_with_item` consumes a quote only inside the original order
transaction under its original user/request advisory lock. It verifies auth.uid,
product/SKU, quantity one, current price, expiry, binding version and current
account/permission/funding/budget. Order insertion failure rolls back consumption.
The PIN payment deadline is shortened to the quote expiry. Requests retried with
another product/SKU/quantity are rejected; unchanged retries return the same
order. Non-PIN idempotency, Daju JSON, stock and payment statements are retained.

The public order snapshot holds exact delivery identities, version and opaque
quote reference, **no cost cap, minimum profit, account fingerprint or private
authorization/funding/budget**. The paid loader service RPC verifies the frozen
order/item reference and enriches the binding only in server memory. The PIN
policy rechecks the frozen account, authorization and cumulative cap too.
No table or routine adds a balance credit/debit or marks an order paid.

## Existing fulfillment and default closure

The existing DB9 logical key, root lease, CAS claim, budget reservation,
Invoice/Child reconciliation, private secrets and owner-only delivery are reused.
Local delivery remains before supplier fallback; timeout/unknown submission never
authorizes a replacement purchase. Purchase source and delivery type remain PIN.

`pin-runtime.mjs` is a server composition point for the authorizer and existing
paid handler. Both must be installed in each serving process using trusted
loaders and a real authorized transport. The compiled release flag stays false,
runtime is uninstalled, all three private scopes default disabled, products stay
draft and stock stays zero. A request cannot install the runtime. This commit is
safe to deploy closed; it does **not** claim live stock-zero storefront ordering,
commercial approval, a live quote/budget loader or automatic sale activation.
Those must be proved before future activation; flipping one boolean is insufficient.

## Migration and release sequence (NOT executed)

1. Obtain independent Production migration and code release authorization. Freeze
   the exact commit and `20261101064049_bitrefill_pin_order_entry_v2.sql` SHA256.
2. Recheck project `qvbovrvybirscaurwuov`, PostgreSQL17, DB9, original ten-arg
   signature and canonical function MD5 `c45e1803c49709ae7480c30ac83f19a5`
   (strip CR only; raw Production MD5 `afbc647a11cad528b230f217f3481450`).
   Verify the three exact existing SKU/product/code pairs and permissions. Drift
   or an already-applied candidate stops, never an automatic replacement.
3. Apply only this incremental migration, as postgres, in its single transaction
   with `lock_timeout='3s'`. No db push over historical manual migrations, no
   DB9/V6 replay, no data cleanup. The function patch uses the pinned definition,
   checks its anchors and preserves existing function signature/owner/ACL.
4. Read-only check schema ownership/RLS/ACL, three disabled scopes, zero newly
   created quotes, function MD5 matching the isolated patched definition, unchanged
   products/SKUs, Daju and private delivery. Record migration history only for
   actual successful execution through the established accounting process.
5. Release exact code via existing full-SHA/health/PM2/rollback workflow with
   Bitrefill still closed. Non-target Daju, payments and USDT remain unchanged.
6. Future, independently approved activation: verify commercial scope, actual
   supported procurement endpoint, all fees/settlement FX, enforced debit cap,
   atomic single/cumulative budget and real account balance, then trusted runtime
   composition, approved exact private scope, audited formal SKU/stock readiness
   and final prices. Verify UI/orderability with zero invented stock. No activation
   SQL/config values or real test purchase are authorized in this task.

## Failure / rollback boundaries

- A migration error rolls back its whole transaction. Preserve diagnostics; do
  not continue, delete objects or relax fingerprint/ACL to make it pass.
- After deployment, close new PIN entry through existing release gate/runtime
  stop and disable only the three private authorizations via separately approved
  scoped control. Preserve all quote/order/payment/DB9/secret records. This stops
  new PIN order creation, not Daju or USDT.
- Drain or investigate SUBMITTING/UNCERTAIN attempts using their original invoice
  identities; no blind repeat purchase and no automatic refund of an unknown
  supplier result. Delivered records stay delivered.
- Application rollback to a pre-V2 binary is allowed only when no pending V2
  order/attempt requires its private reader. Otherwise keep a compatible V2
  reconciliation path with new sales closed. A safe stop is not restored sales.
- Leave additive schema and private binding/read RPCs in place. Restoring the
  old order function, if independently needed, requires a separately reviewed
  reverse migration and no live V2 writes. Never DROP private quote evidence or
  restore an old database over newer orders/financial records.

## Incremental verification

`node --test tests/unit/bitrefill-pin-order-entry.test.mjs` executes the actual
route against explicit auth/catalog/risk mocks, validates pre-RPC failure,
authenticated user binding, no legacy PIN fallback, Daju payload and private
binding enrichment. `scripts/verify-bitrefill-pin-order-entry-pg.mjs` uses a fresh
synthetic PG17 cluster/container, the exact frozen original order function and
original DB9/private-delivery definitions. It creates unpaid orders through the
real function, then explicitly simulates payment before invoking the actual TS
delivery/router and existing PIN handler. Auth, payment transition, local delivery
RPC boundary, supplier replies and budget reservation are labelled synthetic.
It is not a real payment, live supplier, or full Production-schema acceptance.
Previous 65/65 unit and 20/20 PG17 evidence is reused, not manually repeated.
