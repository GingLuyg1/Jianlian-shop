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
