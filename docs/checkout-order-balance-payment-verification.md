# Checkout, Order Creation, and Balance Payment Verification

## Current checkout submit chain

`/checkout?product=<product_id>` reads the public product detail through `/api/catalog/products/[identifier]`. The page submits to `POST /api/orders` with:

- `product_id`
- `sku_id` when a database SKU is selected
- `quantity`
- `customer_email`
- `customer_name`
- `customer_phone`
- `shipping_address`
- `customer_note`
- `payment_method`
- `agreement_version_ids` / `agreements`
- `client_request_id`

The client still shows the original checkout layout and only adds the payment-method selector. Non-balance channels remain unavailable until real Provider configuration exists.

## Order API and service

`POST /api/orders` is the only checkout order creation endpoint. It validates the authenticated user, request size, rate limit, account restrictions, product id, SKU id, quantity, email, payment method, risk checks, and legal agreement versions.

Order creation is delegated to the database RPC `create_order_with_item`, which is expected to create:

- `orders`
- `order_items`
- initial order status log / related reservation records, depending on the installed order migration

The API stores the chosen `payment_method` on the order after successful creation and records order agreement acceptances before attempting balance payment.

## Server-side price, SKU, and stock validation

The checkout page never sends product price, SKU price, stock, product name, or total amount as trusted inputs. The order API requires a `sku_id` when the product has active SKUs, and `create_order_with_item` is responsible for recalculating unit price, totals, product/SKU status, and stock from the database.

The product detail API now uses a service-role server client when available, while still filtering to public visible statuses (`active`, `sold_out`). This fixes valid UUID checkout links that were incorrectly shown as not found because public RLS or catalog fallback pagination could miss the row.

## Balance payment transaction

New migration: `supabase/migrations/20260703_balance_order_payment.sql`.

It adds `public.pay_order_with_balance(p_order_id, p_user_id, p_client_request_id)`, executable only by `service_role`. The RPC performs the balance payment in one database transaction:

1. Lock the order.
2. Verify order ownership, status, payment method, and amount.
3. Return idempotently if the order is already paid or an order-payment balance transaction already exists.
4. Lock the user profile row.
5. Verify balance is sufficient.
6. Deduct `profiles.balance`.
7. Insert one `balance_transactions` debit with business type `order_payment`.
8. Call `complete_order_payment` to update order payment/order status and create the payment record.

`lib/orders/balance-payment-service.ts` calls this RPC through the service-role client and then triggers digital delivery through the existing delivery service. Delivery failure does not roll back a successfully confirmed balance payment; it is returned as `deliveryError` for follow-up.

## Duplicate order and duplicate debit protection

- Checkout uses a stable `client_request_id` per submit attempt.
- `create_order_with_item` remains the order idempotency boundary for duplicate order creation.
- `pay_order_with_balance` uses the order id and a unique `balance_transactions.business_type + business_id` lookup to avoid duplicate debits.
- Already-paid orders return the current paid result instead of deducting again.

## Non-balance channels

The checkout selector keeps these options:

- `balance`
- `alipay`
- `wechat_pay`
- `binance_pay`
- `usdt_trc20`
- `usdt_bep20`

Only `balance` is currently accepted by `POST /api/orders`. Other values return a safe Chinese error and do not create fake payment sessions, fake QR codes, fake wallet addresses, or fake paid states.

## Order detail and permissions

User order reading remains scoped through the authenticated user order APIs. The checkout response redirects by public order number. Cross-user order access is protected by the existing user-order query/detail services and RLS/server-side checks.

## Tests run

- `node --test tests/regression/core-logic.test.mjs tests/regression/source-contract.test.mjs tests/unit/catalog-logic.test.mjs tests/unit/inventory-permission-logic.test.mjs tests/unit/order-payment-logic.test.mjs`: passed, 51 tests.
- `tsc --noEmit`: passed.
- `npm run build`: passed with existing Supabase dynamic import warnings and existing client-side rendering deopt warnings.

## Manual migration required

Execute this migration in Supabase SQL Editor before testing real balance checkout payment:

1. `supabase/migrations/20260703_balance_order_payment.sql`

This migration depends on the existing payment/balance migrations that create `balance_transactions` and `complete_order_payment`.

## Remaining issues

- Live balance payment cannot be considered verified until the new migration has been executed in the target Supabase database.
- Playwright e2e was not run in this pass because the task prohibited dependency changes and the available safe regression coverage is Node/unit plus typecheck/build.
- The local dev server on port 3000 may need a restart after the build because the running dev instance returned a blank 500 for `/checkout` while the product detail API returned 200 and production build passed.