# Staging Smoke Test Verification

Status values:

- `pass`: verified on staging.
- `fail`: verified and failed.
- `blocked`: cannot test because deployment, migration, credentials, or provider setup is missing.
- `not_tested`: not yet executed.

## Deployment Prerequisites

- GitHub branch: `main`
- Node.js: 20.x recommended
- install command: `npm ci`
- build command: `npm run build`
- start command: `pm2 startOrReload ecosystem.config.cjs --only jianlian-shop-staging --update-env`
- app port: `3001`
- health: `/api/health`
- readiness: `/api/health/readiness`

## Migration Status

Required migration files are present in the repository, but staging database execution must be confirmed manually. Do not mark staging ready until `/api/health/readiness` confirms required structures or an administrator confirms the SQL was executed.

## Page Smoke Tests

| Area | URL | Expected | Actual | Status | Blocker |
| --- | --- | --- | --- | --- | --- |
| Home | `/` | Page renders, public catalog loads or shows Chinese empty/error state | not executed | not_tested | no staging URL in this session |
| Product list | `/products/sim-cards` | Active products load, no mock data | not executed | not_tested | no staging URL |
| Product detail | `/products/{id}` | Real product, price, stock, buy button state | not executed | not_tested | needs test product |
| Category navigation | public category URL | First/second category hierarchy works | not executed | not_tested | needs staging data |
| Login | `/login` | Login form renders, wrong credentials show generic Chinese error | not executed | not_tested | needs staging |
| Register | `/register` | Agreement unchecked by default; duplicate email handled safely | not executed | not_tested | needs staging |
| Admin login | `/admin` | Anonymous redirects or denies; admin can enter | not executed | not_tested | needs admin session |
| Admin products | `/admin/products` | Table loads, internal scrolling works | not executed | not_tested | needs admin session |
| Product edit | `/admin/products` | Test product can be saved and audited | not executed | not_tested | use test product only |
| Multi SKU | product with SKUs | SKU selection and stock validation work | not executed | not_tested | needs SKU product |
| Direct purchase | `/checkout?product={id}` | Server recalculates amount, no cart flow | not executed | not_tested | needs login/product |
| Cashier | `/payment?order={orderNo}` | Enabled channels only; unconfigured providers show unavailable | not executed | not_tested | needs test order |
| User orders | `/account/orders` | User sees only own orders | not executed | not_tested | needs login |
| Inventory admin | `/admin/inventory` | Admin only; no plaintext leak to users | not executed | not_tested | needs admin |
| Payment readiness | `/api/admin/payments/readiness` | Admin only; no secrets | not executed | not_tested | needs admin |
| Health | `/api/health` | 2xx and no secrets | not executed | not_tested | no staging URL |

## API Smoke Tests

| API | Expected | Actual | Status |
| --- | --- | --- | --- |
| `GET /api/health` | 2xx, no secret values | not executed | not_tested |
| `GET /api/health/readiness` | Database readiness summary, no secret values | not executed | not_tested |
| catalog read API | Public read works or clear Chinese init message | not executed | not_tested |
| product save API | Anonymous 401; normal user 403; admin can update test product | not executed | not_tested |
| order create API | Does not trust frontend amount | not executed | not_tested |
| payment session API | Provider missing returns unavailable, no fake payment data | not executed | not_tested |
| payment status API | Reads server state only | not executed | not_tested |
| digital inventory API | Anonymous/user denied, admin allowed | not executed | not_tested |
| internal reconciliation API | Wrong secret denied | not executed | not_tested |

## Current Result

- P0 blockers: staging smoke tests have not been executed against a live staging server in this session.
- P1 blockers: real payment providers intentionally not configured; mark as `未接入`.
- Can deploy to staging: only after `npm run build` passes and required environment variables are configured.
- Recommend production deployment: no, not until staging smoke tests are executed and P0 list is empty.

