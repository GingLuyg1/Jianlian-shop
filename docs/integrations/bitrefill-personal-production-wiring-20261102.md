项目执行原则：能由 Codex 自动完成的操作一律交给 Codex；仅在输入私密口令、必要授权或确实无法自动完成时要求用户操作，避免重复确认、反复测试和耗时等待。

# Personal production wiring — developed candidate, not deployed

Base: `2a224449d1bb8d6fdbf8996bc17e4112f5dfc7ef`. This change supplies server composition and loaders around the existing PIN V2/DB9 workflow; it does not enable purchasing or create a second queue, attempt state machine or secret store.

## Boundaries

- `production-server.ts` is `server-only`, called at the existing PIN order preflight and frozen supplier router. Non-Bitrefill/Daju traffic does not initialize this runtime. Missing/closed Bitrefill never falls back to Daju.
- The literal `REAL_BITREFILL_PURCHASE_ENABLED=false` remains unchanged. The additional `BITREFILL_PURCHASE_ENABLED` opt-in alone cannot enable anything. Future release authorization is separate from this PR.
- `createBitrefillServerAccount` trims/validates Personal credentials and keeps them inside network-client closures, not a serializable credential DTO. Business authentication/REST transport remains supported as a separate account adapter. Switching requires new account/quote/balance/SKU authorization, not new persistence or private delivery.
- Runtime only covers the three existing Giffgaff UUIDs. Each item must freeze GB/GBP/PIN/product/package, account and auth mode. Quantity is one. This does not authorize all three canaries or customer traffic.

## Real loaders, explicit missing evidence

Pricing reads authenticated MCP detail plus catalog identity and availability. It parses only the observed identity fields and `packages[n]{package_value,package_currency,payment_price,payment_currency}`. Agent instructions are ignored. The observed prices are **DISPLAY_PRICE**, with `allInCostVerified=false`; they cannot become `TRUSTED_ALL_IN_COST`. The default production composition has no approved all-in cost source and therefore fails closed before submitting.

Financial loading rereads canonical server orders/items, refund state and refund requests and obtains the private PIN binding through the existing service-only RPC. It requires server-derived paid allocation/verified CNY costs and explicit fresh dispute/risk evidence, never customer assertions. Missing settlement/risk adapters stop safely. These are explicit trusted integration interfaces, **not a claim that Production processing-fee/dispute evidence already exists**. FX requires an independently approved fresh USD/CNY source; no rate, fee or clear-risk default is invented. The current server startup provides none of these unverified financial adapters. Enabling only flags therefore cannot make current orders purchasable.

Balance reads authenticated MCP wallets, selects one USD **balance** wallet (not cashback), checks same account and at most 60s age, and rereads immediately before reserving. `$5.61` versus the observed `$13.44` display price is insufficient; tests with adequate synthetic balances do not change this real fact.

`createBitrefillPinOrderRuntime` and `createBitrefillPinFulfillment` remain the entry/paid handler; the existing claim, CAS, one-submit, Invoice/Child GET and owner-only private delivery remain authoritative. POST contents never deliver PINs. Unknown outcomes cannot retry the purchase. A known original Invoice ID is persisted by DB9 and reconciled, not paid a second time.

## Atomic budget migration — developed, NOT applied Production

`20261102100746_bitrefill_pin_atomic_budget_personal_runtime.sql`:

- Adds `auth_mode` (default business) to the existing private sale authorization, with no activation or rebinding. Extends the existing quote issuer at checked anchors to validate/freeze that mode.
- Adds only a private budget ledger, not another supplier queue or delivery secret store. RLS is enabled, direct table privileges denied, public wrappers are invoker-only and service-role-only; private definers use `search_path=pg_catalog` and explicit role checks.
- Account advisory lock followed by authorization row lock serializes shared-wallet checks across SKU workers. Unique logical key, exact account/contract/SKU/auth, server-owned unit/cumulative caps, fresh balance snapshot, server-paid order and DB9 SUBMITTING claim are required. Amount precision is checked before numeric(18,6) storage.
- RESERVED -> HELD occurs immediately before the existing transport submit. HELD -> RELEASED is impossible, even on timeout/unknown result; it needs authoritative/manual investigation, never automatic refund/rebuy.
- RESERVED -> RELEASED is reserved for proven pre-send failures. Releasing capacity never makes the same logical key reservable again. No automatic TTL frees possibly-spent money.
- HELD -> CONSUMED requires server authoritative-debit evidence and the same DB9-persisted original Invoice ID. A POST response, invoice “complete” alone or an unexplained wallet decrease is not enough. Without a verified invoice debit parser, budget remains HELD conservatively; there is no fabricated final debit amount adapter.
- Consumed amounts stay counted toward SKU cumulative cap; held/reserved amounts stay counted against the account's available balance. No customer balance/ledger mutation exists in this migration.

## Candidate authorization / future release

All £10/£15/£20 authorizations stay disabled and all products/SKUs stay draft/stock0. Any future approved candidate must independently bind `supplier=bitrefill`, auth mode, exact product/package/GB/GBP/face/PIN, account fingerprint, maximum USD unit cost, minimum CNY profit, cumulative USD cap and binding version. Never store an API key there.

Only after migration review, approved actual all-in debit/fees/cap, FX/CNY settlement/risk sources, sufficient fresh balance and explicit canary authorization may a separately reviewed release enable the compiled gate and configure trusted adapters. The first canary is £10 × 1 with an explicit USD hard cap; do not auto-open £15/£20 after it succeeds. Business application materials remain retained. No vendor KYC/risk/limit evasion is implemented or permitted.

## Verification

- Targeted composition/credential redaction/Business compatibility/display-vs-cost/financial/balance tests plus existing Bitrefill/PIN/transport/Daju tests.
- `node scripts/verify-bitrefill-pin-order-entry-pg.mjs --isolated-local --personal-budget` uses a disposable loopback PostgreSQL17 cluster. Existing V2 order creation, DB9, owner-only PIN and Daju checks run, then the exact budget migration and concurrent cap/idempotency/HELD/ACL/consume cases.
- CI uses the existing container harness (`--isolated-ci-container --personal-budget`), with no Production URL or secret. Synthetic supplier, auth and payment boundaries are explicit; this is not real supplier purchasing.
- Typecheck/build/full suite and `git diff --check` are required. Windows raw SQL checksum tests need Git LF bytes: only the two unchanged historical SQL checkouts were normalized to their exact Git object, with zero Git diff, not a changed expected hash or SQL contract.

## Remaining real-world blockers

Trusted all-in USD debit/fees and supplier-enforced cap unknown; real USD balance last observed5.61; default settlement/FX/risk/invoice-debit adapters intentionally absent pending verified source contracts. This PR is closed wiring, not ready-to-purchase or customer E2E acceptance. No Production migration/deploy/PM2 change, funding, supplier write or SKU activation is part of it.
