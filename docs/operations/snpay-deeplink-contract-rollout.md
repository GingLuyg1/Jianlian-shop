# SNPAY payment-type contract alignment

Base: c5069f627f99706b208a30b6e336735e7ee9c788.
The application already maps signed `urlscheme` responses to `deeplink`.
The historical CHECK allows only redirect/qrcode/address. The new forward
migration adds only deeplink, retains the canonical constraint name, validates
all existing rows and executes both ALTER statements atomically. A lock/statement
timeout aborts rather than leaving a partially changed constraint.

No application/accounting/callback/RSA/amount/expiry semantics change. No runtime
deployment is needed to correct this particular schema mismatch.

## Separately authorized Production rollout (not executed here)

1. Review/merge the migration and regression evidence into version control.
2. Keep Alipay and WeChat disabled; confirm USDT remains enabled.
3. Obtain separate authorization to execute only
   `20261008082216_payment_sessions_deeplink_contract.sql`.
4. Read-only verify the canonical CHECK contains exactly four values and remains
   validated; compare pre/post business rows and funds baselines.
5. Do not repair/revive the second failed canary or backfill its provider order.
   Its upstream order was found unpaid, local session failed, credited amount
   and completed ledger count were zero. Do not pay or retry that recharge.
6. Only after postcheck, separately authorize a third, entirely new canary.

Migration in Git is not evidence of Production migration execution. Do not run
bulk migration replay/db push against Production or remove the failed-session guard.
