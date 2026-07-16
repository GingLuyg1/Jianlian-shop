# Order Lifecycle Verification

## Current Call Chain

1. `app/checkout/page.tsx`
   - submits `POST /api/orders`
   - payload includes `product_id`, `sku_id`, `quantity`, `customer_email`, `customer_phone`, `customer_note`, `payment_method`, agreement version payloads, and `client_request_id`.
2. `app/api/orders/route.ts`
   - validates auth, rate limit, request keys, email, quantity, payment method, agreement versions, SKU requirement, and risk.
   - calls `public.create_order_with_item`.
   - stores/returns the created order, then leaves existing payment-specific branches unchanged.
3. `public.create_order_with_item`
   - server-side RPC re-reads product/SKU, calculates price, creates `orders`, creates `order_items`, reserves/decrements stock, records status log, and returns the order.
4. `app/api/orders/[orderNo]/route.ts`
   - `GET` reads the current user's order only.
   - `PATCH` calls `public.cancel_unpaid_order`.
5. `app/api/internal/orders/expire/route.ts`
   - authorized internal job calls `processExpiredOrders`.
6. `lib/orders/order-expiration.ts`
   - calls `public.list_expirable_unpaid_orders` and `public.expire_unpaid_order`.

## Real Status Values

`pending_payment`, `paid`, `processing`, `delivered`, `completed`, `cancelled`, `expired`, `refunded`, `failed`.

Payment status values remain:

`unpaid`, `paid`, `refunded`, `partially_refunded`, `failed`.

## Verification Results

- Checkout request key whitelist rejects unknown frontend price/name/stock fields.
- Server-side RPC is responsible for product/SKU reads and amount calculation.
- `client_request_id` is stored on `orders` and protected by a partial unique index per user.
- Repeated `client_request_id` returns the existing order instead of creating a duplicate.
- User order detail/list queries are scoped by `orders.user_id = auth.uid()`.
- User cancellation is limited to `pending_payment` orders.
- Expiration is limited to unpaid `pending_payment` orders whose server-side deadline has passed.

## Required Manual Migration

Execute after existing order, product, SKU, digital inventory, and expiration migrations:

`supabase/migrations/20260709_order_lifecycle_non_payment_hardening.sql`

Do not execute this against production before testing it on `Jianlian-shop-test`.
