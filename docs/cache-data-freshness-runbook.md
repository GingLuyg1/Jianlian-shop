# Jianlian Shop Cache Data Freshness Runbook

Last updated: 2026-07-01

## Scope

This runbook covers Next.js route caching, browser fetch behavior, Supabase-backed data reads, client state updates, and manual verification for product, SKU, order, payment, inventory, settings, and legal document freshness.

No Redis, Cloudflare, Nginx, PM2, Supabase SQL execution, or production deployment is performed by this document.

## Data Classes

| Class | Examples | Strategy |
| --- | --- | --- |
| Public low-frequency | site settings, announcements, legal documents | short public cache where safe, explicit tag invalidation after admin changes |
| Public high-frequency | product list, category list, product detail, public SKU summary | short public cache, service-side stock validation remains authoritative |
| User private | profile, orders, recharge records, refunds, balance | `no-store`, session-bound server/API queries |
| Admin | products, orders, users, reports, audit logs | `no-store`, admin session required |
| Real-time transaction | payment status, order status, inventory reservation, delivery status | `no-store`, poll with stop conditions |
| Sensitive | tokens, keys, full payment callbacks, digital inventory content | never publicly cached, never logged in full |

## Cache Tags

Central definitions live in `lib/cache/cache-tags.ts`.

| Tag | Purpose |
| --- | --- |
| `products` | public product collections and search results |
| `product:{id}` | one product detail |
| `product-slug:{slug}` | one product detail addressed by slug |
| `categories` | public category navigation |
| `category:{id}` | category-scoped product list |
| `product-skus:{productId}` | public SKU price/stock/status summary |
| `site-settings` | public settings |
| `announcements` | public announcements |
| `legal-documents` | published legal documents |

Do not create public cache tags for payment status, balances, digital inventory content, private orders, or admin reports.

## Invalidation Points

| Operation | Required invalidation |
| --- | --- |
| Product create | `products`, `product:{id}`, `product-slug:{slug}`, `category:{categoryId}`, `product-skus:{id}` |
| Product update | current product tags plus old slug and old category if changed |
| Product delete | product tags, product collection, category list for the old category |
| Category create/update/delete | `categories`, `products`, current category, parent category |
| Site settings update | `site-settings`, `announcements` |
| Legal publish/archive | `legal-documents` |

## Manual Verification

1. Update a test product name, price, status, category, stock, and image in Admin.
2. Confirm the admin API returns the latest persisted record.
3. Confirm the admin table updates the single edited row rather than relying on a browser hard refresh.
4. Open the public category and product detail pages and confirm the updated product data appears after the short public cache window or explicit invalidation.
5. Move a product between categories and confirm the old category no longer lists it and the new category does.
6. Mark a product sold out and confirm public listing and buy button state no longer imply availability.
7. Update legal documents or site settings and confirm `/api/legal/current` or public settings endpoints return updated values.

## Debugging

Development-only checks may log cache tags and invalidation reasons. Production logs should only keep request IDs, affected entity type, affected ID, and high-level result. Do not log:

- full request bodies for payment callbacks
- tokens or authorization headers
- full digital inventory content
- passwords or reset tokens
- private user data

## Operational Notes

If an emergency full public cache clear is required, perform it manually through a protected deployment or hosting mechanism. This project does not expose a browser-accessible "clear all cache" button.
