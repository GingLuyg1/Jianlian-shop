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

- Phase 1 fingerprint reservation foundation has passed TEST migration and schema checks.
- Phase 2 BEP20 discovery and pure matching has passed TEST write-path acceptance, including exact fingerprint matching, idempotent replay, shared order/recharge ambiguity, global TxHash conflict handling, cursor progression and fixture cleanup.
- Phase 2 intentionally does not credit CNY (`PHASE2_AUTO_CREDIT=false`).
- Phase 3 atomic auto-credit is implemented as a migration candidate and scanner source change only. The Phase 3 migration has not been executed in TEST, and Phase 3 TEST end-to-end acceptance has not been performed.

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
