# Payment closed-loop finalization V1

Base: `2780bf3d9a2147522a564d00bb742dc5f15a92ef`. Development only;
no Production deploy, migration, channel change or payment is authorized here.

## Approved amount contract

The user explicitly selected **cashier-collected buyer fee**. Do not add 3%
to local `payable_amount`: SNPAY API `money` and verified callback/query money
represent the principal, while the cashier may charge extra. A local surcharge
would risk charging the buyer twice. Settlement cost (e.g. a reported upstream
5%) is separate and has no verified settlement evidence in these records.

| Meaning | Principal 100 example | Persisted/canonical source |
|---|---:|---|
| PRINCIPAL / ORDER_AMOUNT | 100.00 | recharge requested/amount; order total_amount |
| Site fee | 0.00 | fee_amount; canonical channel fee_rate=0 |
| API payable/provider money | 100.00 | payable_amount; create/callback/query/RPC comparison |
| BUYER_FEE estimate | 3.00 | display-only 3% cashier estimate, integer cents half-up |
| TOTAL_PAYABLE cashier estimate | 103.00 | display-only; actual cashier total is authoritative |
| CREDIT_AMOUNT | 100.00 | canonical recharge RPC credits original principal once |
| PROVIDER_FEE / settlement cost | unknown | do not substitute the 3% estimate or infer net settlement |

The estimate never supplies a create request, callback amount or ledger input.
0.01 principal estimates 0.00 fee; 0.50 estimates 0.02. This rounding rule is
only for disclosure, not a promise about the Provider's rounding.

## Limits and canonical configuration

The 2000 CNY online boundary is the **local principal/API payable**, consistent
with current Alipay/WeChat DB maximum 2000 and the approved fee contract.
Principal 2000 may result in a cashier gross estimate 2060: this does not cross
the principal boundary. 2000.01 is rejected before ordinary online creation.
SNPAY capability now hard-caps 2000 even if a channel config is raised.

Recharge applies the 2000 CNY principal limit to SNPAY/Liuhaoyi and to the CNY
input for BEP20 recharge before conversion. Checkout applies it to external
payment order amounts, including BEP20. Internal balance spending is not an
external payment and keeps its existing behavior. Existing lower channel
maximums and minimums still apply; no new minimum is invented.

SAFE_READ_ONLY Production inspection found:
- Alipay and WeChat minimum 1 CNY, maximum 2000, site fee 0.
- USDT-BEP20 minimum 1 USDT, configured maximum 100000 USDT, site fee 0.
- BEP20's token-unit min/max remain distinct from the new CNY principal cap.
  The daily locked rate and exact fingerprint amount continue unchanged.

Both existing Radix dialogs display:
`支付金额大于2000联系人工客服处理。`
They use `openPublicSupport()` (the existing public support entrypoint), not
hard-coded contact details. The recharge primary action opens this dialog and
returns without fetch. The server also enforces limits and rejects overprecision.

## Audited paths and proof boundaries

- Recharge POST validates server canonical enabled/configured channel, amount,
  fee and immutable parent; payment-session creation independently validates
  the same contract before reservation and Provider dispatch.
- SNPAY create/query/callback uses pinned session/provider identity, signed
  responses, trusted timestamps, principal money and currency/channel checks.
- Recharge reconciliation supports pending/processing/expired only, finite
  lookback/cadence, CAS claim, fail-closed query errors, trusted paid-before-both-
  expiries. Completed, failed and closed sessions are not revived.
- Canonical completion locks session/recharge/profile and principal ledger;
  isolated PostgreSQL tests cover duplicates and callback/worker and worker/
  worker races (10 rounds each). Cashier fees cannot enter the credit.
- Purchases use canonical order payment transition and post-payment delivery.
  Balance uses its own transactional payment RPC, not a fabricated Provider
  session. BEP20 uses the chain session/verified transfer and canonical completion.
- Delivery reserves local inventory transactionally. Supplier fallback uses
  `claim_supplier_fulfillment`: per-item unique request, row lock, attempt token;
  FULFILLED returns NONE, PURCHASING/UNCERTAIN cannot dispatch another purchase.
  Duplicate completion may call delivery again; the database claim/stock locks,
  not the fact that the delivery function is called once, prevent duplicate goods.
- New BEP20 sessions now read canonical enabled/configured channel and check
  the CNY order limit before chain network/reservation. Existing transfer
  verification is intentionally unaffected by channel closure.

### Explicit remaining blockers (do not report complete shop recovery coverage)

1. SNPAY reconciliation V1 deliberately excludes `business_type=order`. The
   default reconciliation path also does not grant automatic SNPAY order credit.
   A missing purchase callback therefore has no equivalent worker completion.
2. Current paid-before-expiry expired-state RPC exception is recharge-specific.
   The existing isolated test explicitly preserves rejection of expired orders.
   Delayed purchase callbacks can require a separate transactional order-expiry
   design/migration and stock reservation policy; do not relax it incidentally.
3. Isolated native DB tests here prove recharge races, **not** real order-payment/
   supplier-claim races. Supplier and order unit/source-contract passes cannot
   be relabelled as full native DB/Production fulfillment proof.
4. Admin recharge normalization now exposes the frozen Provider, and separates
   cashier estimate from API payable/credit. Historical order payment records
   do not expose a pinned Provider in this API; explicitly show unavailable,
   never infer it from today's channel. Actual cashier gross and settlement cost
   are not persisted and must remain unknown, not manufactured as accounting.

No new migration is needed for the fee-disclosure/limit patch. Completing
purchase expiry parity may require a separately reviewed development migration;
no migration has been created or executed by this patch. Full closed-loop readiness
remains blocked by the purchase gaps, even if this patch's CI passes.

## Final Production real E2E runbook (not executed)

1. After a separate approved PR, deploy review, prepare and activation, record
   exact SHA, enabled gates/timer, channels, new-window counts, and private
   baseline user balance/ledger. Never include customer/session IDs in public logs.
2. With separate canary authority, briefly enable ONE SNPAY channel via Admin,
   create ONE fresh recharge at its canonical safe minimum, immediately close
   it, and minimally verify exactly one session/artifact, principal, identity and
   adequate expiry time. Do not reuse any previous abandoned/completed canary.
3. User pays **once**, checks actual cashier fee, and records receipt privately.
   Do not run manual completion, recovery, retries, or process the historical
   third WeChat canary. Wait for callback/normal gated worker cadence.
4. Read-only verify provider evidence already persisted, session paid, recharge
   paid/succeeded, original expiries unchanged, principal credited exactly once,
   one completed ledger, balance delta=principal, cashier fee credited=0.
   Observe duplicate callbacks/normal worker passes without triggering another
   completion as an idempotency test. Timeout/mismatch becomes an incident,
   not another payment or a forced status change.
5. Purchase using available balance can validate order and fulfillment without
   a second *external* payment, after separately authorized purchase/stock actions.
   It does NOT validate SNPAY purchase callback/reconciliation. End-to-end SNPAY
   external purchase proof requires a second distinct paid order and the purchase
   recovery/expiry gaps resolved first. Never equate balance purchase with it.
6. Channels remain closed unless the user separately authorizes rollout. A/W
   real new paid automatic reconciliation E2E remains `not_tested` here.

## Validation record

Local targeted tests, payment/fulfillment/reconciliation/release regressions,
Node 20/22, typecheck, production build, and disposable localhost PostgreSQL
are run for this branch. The Windows full suite retains the previously documented
one Daju contract-drift and six Windows migration-runner baseline failures.
CI is authoritative only after its final conclusion is retrieved for the exact
commit; never mark a pushed or queued run as success.

SAFE_READ_ONLY Production: exact active 2780bf3; main PM2 online; localhost and
public health 200; app/worker gates true; reconciliation timer enabled/active;
Alipay/WeChat false, USDT true; 35 sessions, 26 recharges, 20 balance transactions;
historical third WeChat paid once, one principal ledger, profile balance 30.
No Provider query or business mutation was performed by this task.
