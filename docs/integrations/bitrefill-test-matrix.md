# Supplier hardening V1 test matrix and evidence limits

Date: 2026-10-14. All network/provider interactions in this matrix are fixtures; no live Bitrefill credential or purchase.

| Contract | Daju simulated response | Bitrefill FakeTransport / pure test | Production meaning |
| --- | --- | --- | --- |
| Identity and capabilities | Daju handler remains active; quantity stock | Provider registered; boolean stock; real purchase disabled | Bitrefill not active in fulfillment routing. |
| Catalog, frozen binding, cost | Parsed product/detail, Daju cost comparator | Exact frozen product/package/currency/face/decimal quote/cost ceiling; no replacement | Live mapping/cost pending. |
| Purchase and status | One simulated POST, parsed order, GET reconcile | Fake-only invoice, order/redemption; HTTP POST blocked | No real Bitrefill purchase capability. |
| Duplicate delivery/redaction | Simulated order ID and safe log shape | External order dedupe, private redemption, allowlisted log metadata | Durable external order relation still missing. |
| Crash points | Shared claim/outcome semantics | Before claim; after claim before submit; after submit before ID; after ID before query; after atomic delivery before ACK | Unknown invoice ID stays manual `UNCERTAIN`. |
| Timeout/error classification | Existing Daju no-autoretry POST behavior | GET 429/503 bounded retry; 500/401 terminal; transport bounded retry; POST not sent | Requires live quota/timeouts in canary. |
| Split/partial | Not applicable | 20/21/40/41 units and per-unit allocation; cross-invoice partial, duplicate binding fail-closed | Requires reviewed schema for durable unit mapping. |
| Malicious/boundary data | Existing Daju tests | 51-item catalog/package reject, bad currency/price/name, stale snapshot, bad URL, webhook replay/redaction, 64 KiB/timeout/depth | Rate limiting is future infrastructure. |

Validation on 2026-10-14: targeted supplier, Daju, order and local-stock tests had 147 total / 146 pass / 1 known Daju failure; one additional GET-timeout/POST-timeout matrix test was added and passed afterward. `npm run typecheck`, targeted ESLint and `npm run build` passed (build reported pre-existing optional `ws`/Supabase bundling and client-rendering warnings). Full `npm test` after the final test addition had **1,435 total / 1,428 pass / 7 fail**. Saved V1.1 baseline was 1,419 total / 1,412 pass / the same 7 known failures (one Daju `CREATE_ORDER_CONTRACT_DRIFT`, six Windows migration-runner harness assertions). Thus 16 new tests passed and **new failures = 0**. No new dependency, secret or UI file was introduced. `LIVE_MAPPING_PENDING` and `COST_DATA_UNAVAILABLE` remain explicit until approved live evidence exists.
