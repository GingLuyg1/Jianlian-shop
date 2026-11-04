# Giffgaff display-price +10% markup: pricing decision (2026-11-04)

Operator decision: take the authenticated Bitrefill Giffgaff USD **display** price and mark it up by **10%**, then convert to CNY using independently validated USD/CNY FX. Round only the final CNY retail price upward to the next cent.

This is **markup, not 10% net profit**. Exclude provider fees/cost from the *display markup formula* only; do not assume that such fees are zero or that the observed display quote is a guaranteed supplier debit. Final realized margin remains unknown until actual authoritative all-in cost, CNY settlement fees and FX evidence exist. An additional fee can eliminate the intended margin.

The pure helper `calculateBitrefillDisplayMarkup10Preview({displayPriceUsd, usdCnyRate})` computes deterministic display pricing, returning `allInCostVerified=false`, `netProfitVerified=false` and `canActivateSales=false`. This branch does not wire the preview into customer checkout, update Production SKUs or change existing `evaluateBitrefillDirectSale` fail-closed gates. In particular, the pre-existing 15%-gross-margin release policy remains unchanged until a separately reviewed transition; it is not falsely represented as compatible with 10% markup.

Known 2026-11-04 read-only reference display USD prices, not guaranteed charges:
- Giffgaff £10: 13.44 USD → 14.784 USD before CNY cent rounding.
- £15: 20.15 USD → 22.165 USD before CNY cent rounding.
- £20: 26.87 USD → 29.557 USD before CNY cent rounding.

Current Production SKU prices were observed at 105.85 / 158.77 / 211.61 CNY, with draft status, stock=0 and disabled supplier sale authorizations. No Production price mutation is in scope.

Commercial gating: Under Bitrefill Terms §19 (https://www.bitrefill.com/terms/), resale requires an express contract. As of the referenced communications the Partner application has been submitted, but no express resale permission confirmed. Personal API authentication and an earlier manually purchased £10 product are not equivalent to commercial permission. Do not activate customer checkout, production purchase compile-time gate, direct sales authorization or stock until this requirement and the existing financial/fulfillment preflight gates are met.

Operator may add their own Bitrefill wallet balance independently; this authorizes no supplier POST or real-money test. No secret, personal order details or private pricing response is committed.

Next independent task after supplier authorization and trusted fee-inclusive debit contract: reconcile the display markup decision with the old 15% gross-margin policy, load authenticated fresh USD/CNY FX, compare exact current sale price to authoritative full cost + fees, enforce positive net profitability and supplier-enforced spend cap, then separately authorize one £10 canary E2E only. Existing USDT and Daju scopes are untouched.
