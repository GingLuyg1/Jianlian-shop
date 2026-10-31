# Mobile top-up preparation: purchase stays disabled

This change adds offline catalog planning and diagnostics. It does not register
a procurement handler, enable the release switch, create products, or add a
second purchase queue. Existing DB9 claims, state transitions, reconciliation
and private PIN delivery remain the intended persistence path.

`mobile-catalog.mjs` separates PIN, direct phone refill, direct data and unknown
recipient types. It preserves exact supplier package IDs and range rules. An
unsupported bundle is quarantined for review without relaxing the existing
purchase parser. REST `price` is not promoted to an authenticated USD all-in
cost or a CNY selling price. Country/operator labels are supplier observations,
not proof that a particular phone number is supported.

The recipient validator requires E.164 and an authoritative country/operator/
number lookup; it does not return or log the number. It has no customer-facing
route. The existing log redactor also masks phone, recipient, MSISDN and
destination fields recursively.

`mobile-readiness.mjs` is a diagnostic checklist, not an authorization primitive.
Even a synthetic PASS returns `purchaseAuthorized=false`. Evidence must come
from authenticated server-side sources, never from a customer's request flags.
It checks paid-order risk, local inventory priority, applicable Business resale
scope, verified credentials, fee-inclusive supplier-enforced USD cap, verified
USD/CNY conversion of net CNY revenue, sufficient balance, atomic reservations
for single/cumulative budgets, private typed input and durable reconciliation.

## Remaining integration requirements

- Obtain the existing Business application's actual approval, product/country
  scope and Business credentials; Personal access is not resale permission.
- Establish an upstream enforceable all-in debit contract and an authenticated
  quote/FX builder. Reserve cumulative budgets atomically in the existing
  persistence system; this diagnostic module does not implement reservations.
- Connect the existing paid-order handler and reconciliation worker only in a
  separately approved release. Webhook bodies are hints, not delivery evidence.
- Add an authenticated private order-input path and immutable recipient binding
  for direct refills. Existing invoice builders discard `phone_number`; do not
  turn on direct refill merely because the planning validator accepts it.
- Implement direct-refill completion from authoritative Invoice AND Child GETs
  with the same frozen recipient, product, package and amount. It must not demand
  a PIN or invent one. Existing PIN delivery requires actual code/link evidence.
- Prove each path in an isolated database and official zero-cost supplier test
  flow before requesting any Production activation or monetary authorization.
- Keep unknown outcomes in reconciliation/manual review. A supplier failure or
  refund is not evidence that a customer's CNY balance was refunded.

Official references: [API access](https://docs.bitrefill.com/docs/api-overview),
[phone refill contract](https://docs.bitrefill.com/docs/phone-topups),
[integration flow](https://docs.bitrefill.com/docs/integration-flow),
[official test products](https://docs.bitrefill.com/docs/test-products).
The docs describe free test products, but the current authenticated catalog
returns nonzero raw prices for those products. No invoice is submitted until
the zero-debit contract is established for the available account/transport.

No Daju, USDT, payment core, UI, production schema or live release change is
included. Existing Giffgaff and 19 gift-card drafts remain protected.

## Direct sales target: 15% gross margin

`direct-sales-policy.mjs` implements exact fixed-point cost arithmetic using
the existing money parser. Fee-inclusive USD cost times the approved USD/CNY
settlement rate, plus additional CNY costs, retains 16 decimal places. Only
the final `allInCny / 0.85` retail price rounds upward to CNY cents. Rounding
can produce a margin slightly above 15%; it never uses a 15% cost markup.

The Bitrefill-only decision rejects missing resale scope, unverified Business
credentials, stale/future quote or FX, missing full fees or supplier-enforced
cap, a different Product/Package, unavailability, insufficient margin, missing
typed delivery/reconciliation evidence, unauthorized/unreserved budgets, and
insufficient balance or limits. Unknown/display costs return no actual margin.
Other suppliers return `UNCHANGED`.

This is a server-side decision function, **not a deployed checkout hook or a
background SKU updater**. It does not create an order, update stock/status,
change a price, reserve a budget, call a supplier, or override the false release
gate. Trusted input loaders, the authenticated quote/FX and budget contract,
and a separately verified runtime integration are still required before sales.
