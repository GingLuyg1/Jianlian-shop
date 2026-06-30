# Automated Testing and CI Verification

Date: 2026-06-30

## Existing Test Capability

- Package scripts include `typecheck`, `build`, `test:e2e`, and `test:e2e:ui`.
- Existing automated test file: `tests/e2e/home.spec.ts`.
- No unit test runner dependency was configured before this baseline.
- No GitHub Actions workflow was present.
- E2E tests require a running app and browser, so they are not part of the safe CI baseline until a controlled test server setup is added.

## Test Environment Isolation

- Added `.env.test.example` with placeholder values only.
- CI uses placeholder Supabase values and does not use `.env.local`.
- CI does not run migrations.
- CI does not deploy.
- CI does not call real payment providers or notification services.
- Unit tests are pure logic tests and do not connect to Supabase.

## New Test Files

- `tests/unit/catalog-logic.test.mjs`
- `tests/unit/order-payment-logic.test.mjs`
- `tests/unit/inventory-permission-logic.test.mjs`
- `tests/unit/helpers/catalog-logic.mjs`
- `tests/unit/helpers/order-payment-logic.mjs`
- `tests/unit/helpers/inventory-auth-logic.mjs`

## Product Save Regression Coverage

Covered by pure logic tests:

- Product form normalization.
- Product dirty-state comparison.
- Required name, slug, category, price, stock validation.
- Invalid slug rejection.
- Category field normalization.
- Image URL validation.
- Null and empty string compatibility.

Not covered yet:

- Real Supabase update affected-row checks.
- Product dialog UI state transitions.
- Audit log write verification.

These require either a mocked service boundary in production code or a safe test database.

## Multi-SKU Regression Coverage

Covered:

- 1 to 3 option groups.
- Cartesian product SKU generation.
- Duplicate option value rejection.
- Stable combination keys when option group order changes.
- Existing SKU ID, code, price, stock, and status preservation.
- New combinations use defaults.
- CSV formula injection protection.

Not covered yet:

- Database uniqueness constraints.
- Existing-order physical delete prevention.
- Admin SKU table UI editing.

## Order and Payment Coverage

Covered:

- Order total is calculated from server-side prices.
- Client price cannot override server price.
- Invalid quantity rejection.
- Money precision handling.
- `client_request_id` idempotency behavior.
- Provider-not-configured callback rejection.
- Payment amount mismatch rejection.
- Payment currency mismatch rejection.
- Duplicate recharge callback does not duplicate balance ledger entries.

Not covered yet:

- Real `/api/orders` transaction behavior.
- Real payment callback route persistence.
- Real order status log writes.

## Inventory and Permission Coverage

Covered:

- Inventory is reserved only for the requested SKU.
- Different SKU inventory cannot be mixed.
- Insufficient SKU inventory is rejected.
- Reservation is idempotent for the same order.
- Delivery is idempotent.
- Delivered inventory cannot be released back to available.
- Anonymous admin access returns 401.
- Normal user admin access returns 403.
- Cross-user resource access is blocked.

Not covered yet:

- Database row locking.
- Actual digital inventory import.
- Actual delivery content visibility in pages.

## GitHub Actions

Added `.github/workflows/ci.yml`.

CI checks:

1. `npm ci`
2. `node --test tests/unit/catalog-logic.test.mjs tests/unit/order-payment-logic.test.mjs tests/unit/inventory-permission-logic.test.mjs`
3. `npm run typecheck`
4. `npm run build`

CI intentionally does not:

- Execute Supabase SQL.
- Connect to production databases.
- Run deployment commands.
- Call payment or notification providers.
- Print secrets.

## Uncovered Modules

- Browser-level checkout and order pages.
- Admin product dialog UI behavior.
- Admin order drawer actions.
- Real RLS policy behavior.
- Real Supabase RPC transactions.
- Playwright E2E on CI.

## Items That Cannot Be Safely Automated Yet

- Real payment callbacks.
- Production database migrations.
- Production digital inventory delivery.
- Production backup and restore.
- Email, Telegram, or external notification delivery.

## Verification Commands

Run locally:

```bash
node --test tests/unit/catalog-logic.test.mjs tests/unit/order-payment-logic.test.mjs tests/unit/inventory-permission-logic.test.mjs
npm run typecheck
npm run build
```

Do not run production migrations or production payment callbacks from CI.

## Local Verification Result

Executed on 2026-06-30:

- `node --test tests/unit/catalog-logic.test.mjs tests/unit/order-payment-logic.test.mjs tests/unit/inventory-permission-logic.test.mjs`: passed, 19 tests.
- `tsc --noEmit`: passed.
- `npm run build`: passed.

Build warnings observed:

- Supabase package dynamic dependency warning.
- Several client-rendering deopt warnings from existing pages.

No `MODULE_NOT_FOUND`, `ChunkLoadError`, or type errors were observed during this verification.
