项目执行原则：能由 Codex 自动完成的操作一律交给 Codex；仅在输入私密口令、必要授权或确实无法自动完成时要求用户操作，避免重复确认、反复测试和耗时等待。

# Verified merchant costs: balance ledger V1

Independent of PR141. No change to payOrderWithBalance, pay_order_with_balance,
payment providers, customer fees, checkout, purchasing gates or schema.
No production writes, new sessions, ledger mutations or live purchases.

getVerifiedMerchantCostsForOrder(service, orderId) is server-only. It reads paid
CNY balance orders and requires exactly one completed order_payment debit with
matching business id, owner, currency, positive amount and exact six-place
balance_before - balance_after = amount = order.total_amount. Two matches fail
closed; it never silently chooses a first row. Stable identity is the real
balance_transactions.id plus transaction_no, not an invented session UUID.
It rechecks order eligibility and amount after reading the ledger; reads taking
over30 seconds or a backwards clock fail closed. checkedAt describes fresh DB
verification, not the age of an immutable historical settlement.

The existing internal implementation transfers profiles.balance to the
balance_transactions ledger and invokes complete_order_payment, without external
provider submit. Under the approved contract the incremental external costs of
THIS ORDER SETTLEMENT are paymentFee=otherFees=0.000000.
source=verified_payment_costs, settlementKind=balance_ledger,
provider=internal_balance, costScope=order_settlement_only.
There is no paymentSessionId property.

BALANCE_ORDER_SETTLEMENT_COST_VERIFIED_ZERO=YES.
No claim of zero historical recharge/funding cost is made. Recharge economics,
funding allocation and full-lifecycle P&L remain separate work, without guessed
amortization in order settlement. Customer fee_amount and arbitrary metadata are
neither merchant cost evidence nor overrides.

SUPPORTED_PAYMENT_METHODS=balance; VERIFIED_PAYMENT_METHOD_COUNT=1.
Alipay, Wechat, USDT and other methods fail closed: payment success/customer fee
does not establish actual merchant net settlement costs. Future external-provider
evidence may use settlementKind=payment_session and a genuine paymentSessionId.

After independent review/merge, PR141 must explicitly consume this union of
settlement identities and support balance-backed principal allocation; its current
mandatory payment-session loader is NOT changed in this PR. No caller should
coerce settlementId into paymentSessionId. Keep all supplier gates closed.
