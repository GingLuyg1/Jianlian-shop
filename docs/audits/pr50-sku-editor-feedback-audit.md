# PR #50 SKU editor and feedback audit

Branch: `codex/catalog-sku-supplier-stock-checkout`.

## Editing and compatibility

- The product price/stock section is replaced by one compact SKU table.
- Legacy products without database SKUs seed a default row from product fields.
- Only populated, validated rows persist; the trailing empty row does not.
- Product summary uses active SKU minimum price and total stock. SKU write routes
  paginate the summary read rather than trusting the PostgREST default row cap.
- Summary failure is surfaced, not silently treated as success. If an insert
  succeeded before summary failed, the returned SKU ID is remembered for retry.
- This is not a new atomic RPC or migration; concurrent summary updates are not
  claimed to have a transaction-level guarantee.
- Supplier binding reuses the existing sheet. Refresh preserves dirty fields
  while accepting updated stock when that field was not locally changed.

## Transient feedback classification

Runtime searches covered `app`, `components` and `hooks`: `setError`, `setNotice`,
`successMessage`, `errorMessage`, `window.alert` and `alert(`.

34 former inline feedback branches were converted, including checkout submit,
profile/security save, product save, recharge submit/proof/verification, payment
session/verification, supplier binding, email actions, consistency scan/update,
system-error update and the payment-settings save guard. Conditional payment
session handlers still retain inline errors for initialization/read failures.
Clipboard actions additionally report failures instead of failing silently.

Remaining inline states are intentionally retained for field validation, page
load/query failures, incomplete configuration, pending-order status, agreement
loading, business/security warnings and destructive confirmations. Some helpers
named `setNotice`/`setMessage` already delegate to Sonner and are not inline UI.
Server audit-log `errorMessage` fields are not user-feedback banners.
No runtime `window.alert`/`alert(` matches remain in those source directories.
Product detail templates are explicitly excluded and unchanged.

Customer-service data still comes from the same public settings fallback.
The new UI uses existing Radix dialog primitives and the existing root Toaster.

## Verification and remaining acceptance

- Targeted SKU/supplier/checkout/public contracts: 61/61.
- Admin regression/source-contract: 228/228.
- Full npm test: 667/673; six existing Windows migration-runner failures.
  The failing test file is unchanged relative to origin/main.
- Typecheck/build/directed lint/diff check pass; existing warnings remain.
- Local Chrome component fixtures at 1440/1600/390 validate continuous rows,
  half-filled-row rejection, exactly two persisted rows, summary price 9/stock 22,
  support dialog sizing, keyboard focus restoration and no page overflow.
  Fixtures are memory-only and do not invoke real business APIs.
- Vercel Preview acceptance remains pending: no discoverable Preview URL or safe
  existing authenticated session was available. Local fixtures are not claimed
  as authenticated Preview acceptance.
- No Production access, migration, real purchase/payment or secret/session export.
