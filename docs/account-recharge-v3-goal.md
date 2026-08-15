# Account Recharge V3 Goal

## Goal

Complete Jianlian Shop USDT-BEP20 -> CNY account recharge V3 with:

- one shared BEP20 receiving address;
- daily USDT/CNY market rate truncated down to one decimal place, e.g. 6.85 -> 6.8;
- the user's requested CNY amount as the exact final credited CNY amount;
- a four-decimal unique USDT amount fingerprint used to identify the recharge;
- 20-minute payment validity;
- a 24-hour address+amount reuse quarantine so a late old payment cannot be credited to a new recharge;
- automatic BSC USDT detection and automatic atomic CNY credit after deterministic verification;
- manual TxHash/admin handling retained as fallback for exceptions.

## Out of scope

V4 dedicated addresses, address pools, sweeping/collection and cold-wallet architecture are not part of this phase.

## Safety invariants

1. One recharge can credit at most once.
2. One BEP20 transaction can be claimed at most once across business objects.
3. One receiving-address + fingerprint-amount combination can identify at most one active/quarantined recharge.
4. Normal automatic credit requires BSC chain id 56, configured USDT contract, configured receiving address, exact fingerprint amount, sufficient confirmations and an in-window block timestamp.
5. The credited CNY amount is requested_cny_amount, not actual_received_usdt * exchange_rate.
6. Late, ambiguous, wrong-token, wrong-address, amount-mismatch and RPC-uncertain cases go to manual handling and never blindly credit.
7. Production SQL/Migrations/env/deploy/restart/real-money tests require separate explicit authorization.

## Phase status

### Phase 1

The fingerprint reservation foundation has passed the TEST migration and schema checks.

### Phase 2

The BEP20 discovery and pure-match write path has passed TEST acceptance. The acceptance covered:

- exact fingerprint matching;
- replay idempotency;
- shared order/recharge ambiguity failing closed;
- global TxHash conflicts failing closed;
- successful cursor progression and no cursor progression after an uncertain match;
- precise fixture cleanup and baseline restoration.

Phase 2 intentionally does not credit CNY (`PHASE2_AUTO_CREDIT=false`).

### Phase 3

Migration `20260815120000_account_recharge_bep20_auto_credit_v3.sql` has been installed successfully in TEST. The Phase 3 function, privilege and fixed-search-path postcheck passed.

The synthetic TEST end-to-end result is `PHASE3_E2E_PASS`. It verified:

- a unique fingerprint transfer returned `matched=1` and `credited=1`;
- the credited balance and completed ledger amount exactly equalled `requested_cny_amount`;
- exactly one completed `account_recharge` ledger entry was created;
- paid replay returned `alreadyMatched=1` and `alreadyCredited=1` without another balance credit (`DOUBLE_CREDIT=false`);
- an intentional credit-stage failure rolled back the Phase 2 match, chain claim, global TxHash registry ownership, scan/review events and balance effects in the same transaction;
- the scanner cursor did not advance after that atomic failure;
- shared-address order ambiguity never credited the recharge;
- an existing global TxHash assignment never credited the recharge and retained its original ownership;
- cleanup restored the profile balance, scanner cursor, ledger and all fixture tables to their pre-test baseline.

The TEST E2E used a deterministic synthetic BSC RPC bound only to localhost. It did not broadcast or observe a real USDT transfer and did not use real funds.

**Production status: NOT DEPLOYED / NOT MIGRATED / NOT VERIFIED IN PRODUCTION.** Nothing in the TEST acceptance means that Recharge V3 is live in Production.

## Phase 3 atomic architecture

The scanner write path calls one PostgreSQL RPC for each confirmed transfer. That RPC performs Phase 2 matching and the requested-CNY credit in one database transaction. It does not perform a match RPC followed by a separate completion RPC from TypeScript.

The atomic function:

1. recognizes a fully compatible pre-existing chain claim before invoking the Phase 2 matcher, so a paid recharge can be replayed safely without changing its original matched scan event to a terminal outcome;
2. calls the existing Phase 2 pure-match contract only for new evidence;
3. credits only `matched` or legitimate `already_matched` results;
4. verifies the amount-fingerprint match, chain claim and global TxHash ownership before crediting;
5. locks the recharge and profile, checks the completed balance ledger idempotency key, and credits exactly `requested_cny_amount`;
6. changes the recharge to `paid` and records a system review event in the same transaction.

If any credit validation or ledger operation fails, the RPC fails as a whole. The match claim, transaction ownership, recharge state, audit events and balance change roll back together, and the scanner does not advance that chunk's cursor. Ambiguous, unmatched, conflicting, terminal and invalid-window results remain non-crediting outcomes.

## RPC operational note

Earlier TEST diagnostics found that the originally configured RPC endpoint did not provide an `eth_getLogs` behavior suitable for this scanner. A PublicNode candidate subsequently passed `eth_chainId`, `eth_blockNumber`, token `decimals`, `eth_getLogs` and a temporary scanner GET dry-run. No persistent RPC configuration was changed.

Before any Production rollout, the selected Production RPC endpoint must be revalidated for reliable `eth_getLogs` support as well as the required chain-id, block and token-decimals calls. That validation does not authorize a Production environment change or deployment.
