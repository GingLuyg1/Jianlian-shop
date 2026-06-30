# Restore Verification Checklist

Run this checklist after restoring a backup to a temporary database and before reopening production writes.

## Count checks

Run `scripts/restore-consistency-check.sql` and record:

- user count
- product count
- SKU count
- order count
- payment session count
- recharge count
- balance transaction count
- refund request count
- digital inventory count
- order delivery count

## Financial consistency checks

- User balances are not negative.
- Successful recharge records have matching balance transactions.
- Order paid amount matches payment record amount.
- Refund completed amount matches refund and balance records.
- No payment session has produced duplicate balance entries.
- No recharge is marked paid without an入账 record.

## Inventory consistency checks

- `delivered` inventory remains delivered.
- No delivered inventory is available.
- No inventory item is assigned to more than one delivered order.
- SKU inventory is not mixed across SKUs.
- Disabled inventory is not used for delivery.
- Reserved inventory has a reserved order.

## Delivery consistency checks

- Delivered orders have delivery records.
- Delivery content is not printed in reports.
- User can only access own delivery records.
- Admin access still requires admin role.

## Storage consistency checks

- Product images referenced by database exist in Storage or public paths.
- SKU images referenced by database exist.
- Category images referenced by database exist.
- Site logo and favicon exist.
- Private file manifests are encrypted and checksummed.
- Orphan files are listed but not deleted automatically.

## Application smoke tests

- `/`
- `/login`
- `/products/gift-cards`
- `/checkout?product=<known-product-id>`
- `/account/orders`
- `/admin`
- `/admin/orders`
- `/admin/inventory`
- `/admin/system/database`

## Failure handling

If any P0 check fails:

1. Keep production writes paused.
2. Do not promote temporary restore.
3. Record failure summary without sensitive raw content.
4. Select an earlier verified backup or apply a corrective migration in staging.
