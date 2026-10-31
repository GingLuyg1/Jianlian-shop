项目执行原则：能由 Codex 自动完成的操作一律交给 Codex；仅在输入私密口令、必要授权或确实无法自动完成时要求用户操作，避免重复确认、反复测试和耗时等待。

# Bitrefill Personal integration V1 — non-transactional technical wiring

Independent branch `codex/bitrefill-personal-api-v1-20261031`, main baseline `9f0f99a`. No deployed route, default registry, Worker, SQL, browser DTO or real-purchase switch changes.

## Existing code reused

The new server-side dependency `personal-adapter.mjs` reuses the existing `BitrefillPurchaseHttpTransport`, authentication, fixed v2 origin, bounded responses, timeout and redirect handling. It adds no alternative purchase engine. The shared transport gains only `readBalance()` GET. Personal and Business identities are explicit and mutually exclusive; there is no silent credential fallback.

Balance normalization retains only amount, currency, observation time and source. It never infers invoice permission, trustworthiness of a quote, FX or adequate funds from successful GET. Small BTC JSON numbers such as 1e-8 are expanded without rounding a satoshi to zero. Missing/negative/invalid values fail closed. No persistent user-sensitive cache is created.

The adapter exposes catalog/product and known-owned Invoice/Order GET methods. The latter are not invoked against live accounts in this task: there is no identified existing transaction needing reconciliation. Never enumerate historical transactions just to test an endpoint or log redemption values.

`createInvoice` and `payInvoice` reuse the existing transport but are always disabled before fetch, including if extra factory flags attempt to enable them. `REAL_BITREFILL_PURCHASE_ENABLED=false` remains unchanged. A contract-preparation request is not permission to create an unpaid Invoice: even auto_pay=false is a transactional POST and remains blocked.

## Real read-only verification and limits

The existing Personal credential was used only for ping, balance, one catalog row and the four already-discovered US products; the earlier 543-product snapshot was reused instead of refetching all pages. The new adapter itself was checked with live balance and Steam GET. Private account observations are stored only in the local evidence directory, not this document, fixtures or Git.

Successful GET demonstrates endpoint access, not this account's ability to create/pay an Invoice or its contractual resale rights. Official Personal balance-purchase examples establish the general request contract; they do not establish this specific account's approval, spendable funds or authorization to resell. The user has submitted a Business application; approval/contract remains pending. Do not duplicate the application.

Existing 24 fixed Packages and two Range definitions are internal candidates. Product country/currency/denomination and in-stock boolean are distinct from balance currency, quantity guarantee and final procurement cost. Raw price values changed between the earlier catalog snapshot and current Steam detail. Do not freeze old catalog prices, invent fee/FX calculations or label a denomination as trusted supplier cost. A Range definition is parse-only until the exact value and pricing/purchase contract are verified; this existing purchase transport accepts fixed Packages only.

## Required future release path

1. Confirm which account/credit wallet the current Personal credential represents; obtain a reliable same-currency live cost/fees and approved FX contract if settlement differs. Do not accept website labels or a synthetic quote as a live quote. Zero reported balance does not establish that another Store Credit wallet is empty, nor authorize a deposit.
2. Preserve the unique flow: server-confirmed paid order, immutable order-time supplier binding, existing atomic all-or-nothing local reservation, local delivery first, supplier fallback only if unreserved and insufficient. Existing generic supplier reservation is reused through the historical Daju compatibility wrapper; do not duplicate or replace Daju.
3. Existing Bitrefill V2–V6 fake/local flow, Invoice/Child persistence, idempotency, GET reconciliation, webhook signal handling and private delivery remain intact. The default production registry still registers Daju only; FakeTransport-only persistence and synthetic evidence are deliberately not relaxed here. They need a separately reviewed live orchestration connection after cost/account/database/authorization gates pass. No new route is silently enabled by importing this adapter.
4. DB9 and V6 Production prerequisites retain their independent release gates. The last verified Production DB9 five-table absence and browser metadata column read access are carried forward with their recorded timestamp, not claimed freshly rechecked here. Do not write internal costs, candidate bindings or account data into those metadata columns. No Production SQL is run.
5. A minimal paired release must verify current root/RPC/owner compatibility, deploy the existing public-column whitelist/admin-only private reads, apply only approved frozen DB9/V6 increments with actual permission postchecks, and retain compatible application rollback. Add a final live quote/balance/identity check before submission. Uncertain outcomes reconcile the existing persisted reference; never blind-retry a POST, regenerate a purchase or auto-refund.
6. Before any real Invoice, payment or balance debit, separately authorize the exact account, SKU/Package or verified Range value, quantity, currency, maximum spend, fees, payment flow and applicable commercial conditions. Business credentials later select the existing Business Adapter, not a new engine. A Personal technical integration is not a resale exception.

## Focused evidence

Seven new offline tests cover authenticated balance GET and field stripping, early POST blocking, credential separation, invalid balances/satoshi precision, known-ID validation, existing local-priority composition and blocked reservation. All pass, no skipped tests. These are synthetic unit/composition checks, not a new full PostgreSQL procurement E2E. Historical V2–V6 full Mock/PG evidence is reused and not rerun. No false claim of real purchasing or full live fulfillment.

Local evidence: `D:/Jianlian/_bitrefill_personal_integration_v1_20261031/` (`live-readonly.json`, `adapter-live-verification.json`, `sku-candidates.json`, `targeted-tests.log`). Do not commit private account responses or credentials. UI PR87, admin PR88 and the original supplier recovery tree remain untouched. No commit/push/merge/deploy was requested in this task.

Official references checked: [Quickstart](https://docs.bitrefill.com/docs/quickstart-2), [balance GET](https://docs.bitrefill.com/reference/get_accounts-balance), [Invoice contract](https://docs.bitrefill.com/reference/post_invoices), [resale terms section 19](https://www.bitrefill.com/terms).
