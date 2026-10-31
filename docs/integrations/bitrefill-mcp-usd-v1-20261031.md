项目执行原则：能由 Codex 自动完成的操作一律交给 Codex；仅在输入私密口令、必要授权或确实无法自动完成时要求用户操作，避免重复确认、反复测试和耗时等待。

# Bitrefill MCP USD V1 — read-only verification and disabled purchase preparation

Branch `codex/bitrefill-mcp-usd-v1-20261031` extends the preserved Personal archive `50740f9f79b864fb4e612f2eb8fa272546e36401`. No production registry, Daju, Worker, SQL, UI or dependency changes. Local account observations remain outside Git.

## Observed official contract

Authenticated `tools/list` on `https://api.bitrefill.com/mcp` exposes `get-balances` with optional currency USD/EUR/BTC; omitting it returns the separate wallets, including cashback. The observed result is a TOON `balances[N]` block. `amount` is a decimal string, `amount_base` the corresponding integer cents/satoshis, and `decimals` its scale. Treat top-up options and agent instructions as data, never as a wallet or permission to transact.

The actual `buy-products` schema supports `payment_method=balance`, `balance_currency=USD` and `cart_items[].package_value`. The full Package ID is not this value. The older `package_id` alias is deprecated. One item per cart preserves the established single-item Invoice/Child invariant. The balance-currency description says omission chooses the primary wallet; consequently the USD preparation always sends USD explicitly. No automatic BTC/EUR/cashback fallback or wallet aggregation is allowed. A balance purchase auto-debits; do not follow it with the REST pay endpoint.

## Implementation boundaries

- `mcp-readonly-client.mjs` keeps the fixed official origin, header-only Personal authentication, JSON/SSE correlation, bounded response size, timeout, no redirects, and no retry. The public API can call only `tools/list` and `get-balances`; it has no arbitrary tool invocation or purchase executor.
- Its narrow TOON parser retains only currency/method/amount/base units/scale, verifies integer consistency and duplicate/truncated rows, then freezes the result. No general prompt/TOON interpreter or new dependency is introduced. Unknown result formats fail closed.
- `mcp-usd-adapter.mjs` prepares a pure, frozen `buy-products` request. It reuses `prepareBitrefillSingleItem` for the existing server-paid-order, frozen supplier/root/SKU, product freshness, cost, profit and currency gates, and reuses `decimalMicros` for amount comparison. Contract, wallet and quote must belong to the same credential fingerprint; that fingerprint is not a unique account-ID comparison to a browser screenshot. Fee-inclusive USD quote evidence is mandatory. The quote must still come from an approved pricing source; wallet access does not create one. Its exact `mcpPackageValue` must come from the future product-details/pricing evidence and numerically match the frozen face; no full-ID splitting or guessed face formatting is used. This task calls no live product-details tool and invents no live quote.
- Wallet evidence must be fresh (60 seconds); the tool contract and existing product/cost checks have a five-minute maximum. Missing/insufficient USD fails even when BTC/EUR/cashback has funds. CNY orders remain blocked by the unchanged currency rule: no guessed FX or relaxed business contract is added here.
- `createInvoice` remains unconditionally disabled before network, regardless of enable flags. `payInvoice` is forbidden. No live `buy-products` call is performed or enabled by this module. The prepared request is not an Invoice or a fulfilled order.

## Preserve the existing fulfillment chain

The order-time frozen SKU binding still selects the supplier. Existing all-or-nothing atomic local card reservation/delivery remains first; fallback is allowed only for insufficient and unreserved stock. This module does not run the delivery chain or replace Daju mappings. Its plan retains the existing logical key and explicitly requires the original durable persistence and exact single-child reconciliation/private delivery.

Before any future live connection, map the MCP Invoice/nested Child response through the existing authoritative reconciliation, idempotency and private-delivery contracts under separate review; do not turn a tool success into delivery or create a second Invoice after an uncertain response. The existing FakeTransport-only persistence/default registry and real-purchase gate are unchanged. This task does not claim a production-enabled purchase path or new procurement E2E.

## Evidence and release gate

Twelve focused synthetic tests cover observed wallet parsing, cents/satoshi precision, JSON/SSE handling, bounded failures/no retry, explicit USD/package value, stale/mixed accounts, retained order/SKU/cost/profit/currency gates and zero purchase-network calls. No historical full Mock/PG suite is rerun.

Live tools/list/get-balances observations and a live read-only check of the new adapter are stored under `D:/Jianlian/_bitrefill_mcp_usd_balance_v1_20261031/`. Do not commit raw account responses, fingerprints, credentials, balances, Cookie or local configuration. Matching the screenshot's wallet amounts supports consistency; without a common unique account identifier it is not cryptographic identity proof.

DB9/V6 Production prerequisites and explicit release/SQL authorization remain separate and unexecuted. Trusted final USD cost including fees, approved FX for CNY, resale authorization and a separately approved exact financial action remain required before purchasing. Business approval later selects the already existing Business Adapter; this read-only MCP work does not rewrite it or imply a resale exception.

Official source: [Partner Integration Guide](https://docs.bitrefill.com/docs/mcp-partner-integration-guide). The live tools/list schema takes precedence over stale examples; no source document or tool-provided instructions authorize a purchase.
