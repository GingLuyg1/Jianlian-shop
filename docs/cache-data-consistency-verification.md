# Jianlian Shop Cache Data Consistency Verification

Last updated: 2026-07-01

## Cache Usage Inventory

Search targets checked:

- `cache:`
- `next:`
- `revalidate:`
- `revalidatePath(`
- `revalidateTag(`
- `router.refresh(`
- `router.replace(`
- `unstable_cache`
- `force-cache`
- `no-store`
- `dynamic =`
- `force-dynamic`

Main findings:

- User/account/order/payment/recharge/refund/admin APIs are mostly `force-dynamic` and client fetches use `cache: "no-store"`.
- Public catalog product search used `cache: "no-store"` on the browser side and had no explicit response freshness policy.
- Admin catalog write APIs returned persisted rows but did not consistently invalidate public product/category data.
- Site settings and legal document write paths did not consistently invalidate public settings/legal data.
- There is no SWR or React Query cache layer in the checked code paths.

## Data Classification And Strategy

| Data | Class | Strategy |
| --- | --- | --- |
| Products, categories, public SKU summary | Public high-frequency | short public cache, explicit invalidation after admin writes |
| Site settings, announcements, legal documents | Public low-frequency | centralized tags, explicit invalidation after admin writes |
| Orders, payment state, balance, recharge, refunds | User private / real-time | `no-store`, session-bound reads |
| Admin lists, reports, audit logs | Admin | `no-store`, admin-only |
| Digital inventory content, callback payloads, tokens, keys | Sensitive | never public cached |

## Cache Tag Standard

Implemented in `lib/cache/cache-tags.ts`:

- `products`
- `product:{id}`
- `product-slug:{slug}`
- `categories`
- `category:{id}`
- `product-skus:{productId}`
- `site-settings`
- `announcements`
- `legal-documents`

Dynamic tag values are sanitized and length-limited. User input is not used directly as an unbounded tag.

## Product Save Invalidation Result

Changed:

- `app/api/admin/catalog/products/route.ts`
- `app/api/admin/catalog/products/[productId]/route.ts`

Result:

- Product create invalidates product collection, product detail, product slug, category, and SKU summary tags.
- Product update invalidates current product tags, previous slug if changed, previous category if moved, and SKU summary.
- Product delete invalidates old product, slug, category, and collection tags.
- Invalidation happens only after database persistence and verification succeed.

## Category Invalidation Result

Changed:

- `app/api/admin/catalog/categories/route.ts`
- `app/api/admin/catalog/categories/[categoryId]/route.ts`

Result:

- Category create/update/delete invalidates category collection, product collection, affected category, and parent category.
- Category moves and deletions no longer rely on browser hard refresh for public category data.

## SKU And Inventory Freshness Result

Result:

- Public catalog API calculates effective SKU stock from `product_skus` at request time.
- Product write invalidation also invalidates `product-skus:{productId}`.
- No public cache is created for digital inventory content.
- Final purchase and inventory validation remains service-side; cached public stock is treated as display-only.

Remaining manual verification:

- Real SKU edit UI/API was not found as a separate route in this code pass. If SKU editing is later added, it must call `revalidateProductCache({ id: productId })` after a successful database write.

## Order And Payment Freshness Result

Checked private/transaction paths:

- `/api/orders`
- `/api/orders/[orderNo]`
- `/api/payments/status/[sessionNo]`
- account recharge, refunds, balance, delivery, fulfillment APIs

Result:

- These routes are dynamic/no-store.
- Payment status and order detail reads are not public cached.
- Digital delivery content is not public cached.

## Client State Result

Findings:

- Admin catalog writes return persisted records from the server and the UI can update local rows from the trusted response.
- Public product search no longer forces `cache: "no-store"` on the browser fetch path. It now follows the API response cache policy.
- Existing payment polling already uses `no-store` and stop conditions should remain the source of truth for payment transitions.

## Sensitive Cache Check

No new public cache tags were introduced for:

- password or auth session data
- service role keys
- payment callback payloads
- provider secrets
- digital inventory content
- user balance or private orders

## Fixed Issues

1. Public product API lacked explicit short-cache freshness policy.
2. Public product browser fetch bypassed all caching even for public search data.
3. Product create/update/delete did not explicitly invalidate public product/category/SKU cache tags.
4. Category create/update/delete did not explicitly invalidate public category/product cache tags.
5. Site settings updates did not invalidate public settings and announcement tags.
6. Legal publish/archive did not invalidate published legal document tags.

## Remaining Issues

- Several existing files contain mojibake Chinese text. This was not expanded into a localization refactor for this cache task.
- Current repository also contains untracked email notification documents from another task; they were not part of this cache verification.
- Browser-based visual freshness checks were not executed in this pass because no dev server was started.

## Manual Test Matrix

| Scenario | Expected result |
| --- | --- |
| Modify product name | Admin row updates from returned server record; public detail/list refresh after invalidation |
| Modify product price | Public detail/list show updated price after invalidation |
| Modify product stock/status | Public stock and buy state update; server remains final purchase authority |
| Move product category | Old category removes it; new category shows it |
| Modify product image | Public detail/list use new image |
| Publish legal document | `/api/legal/current` returns the new current version |
| Update site settings/announcement | public settings/announcement cache invalidates |
| Payment status changes | status endpoint remains dynamic/no-store |
| User logs out/in as another account | account/order/balance APIs remain session-bound and no-store |
