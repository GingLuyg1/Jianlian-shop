项目执行原则：能由 Codex 自动完成的操作一律交给 Codex；仅在输入私密口令、必要授权或确实无法自动完成时要求用户操作，避免重复确认、反复测试和耗时等待。

# KuajingZY public sale safety V1

This change does not authorize deployment, publication, purchasing, or migrations.
The literal purchase release gate remains false. A complete binding with a false
purchase flag is well formed but cannot be activated or ordered.

KuajingZY uses MODEL_C: SKU website stock is a local sellable cap, while supplier
snapshot stock remains advisory upstream evidence. Readiness requires a positive
cap no greater than the positive snapshot, a successful non-stale sync within
five minutes, complete policy, and purchase capability. It never copies upstream
stock to website stock. Daju keeps its existing exact snapshot-equals-stock rule.

Product activation queries actual SKU rows even when has_skus is false. At least
one must be active; all active automatic SKUs must pass readiness. The shared
browser-safe readiness defaults closed; no credential or HTTP-supplied context
can open the Production literal gate. A future release opening that gate must
also review server activation context; this PR deliberately cannot activate a
KuajingZY SKU.

Order creation requires SKU selection when any SKU row exists or has_skus is true.
The server-only interlock validates trusted product/SKU policy and the selected
cap before calling the existing order RPC. Closed gates reject before supplier
network, payment or order persistence. Future fully enabled synthetic contexts
perform an exact GET-only product/SKU, quantity, price and cap check. Customer
input cannot supply purchase context or policy.

This is an admission check, not a durable inventory reservation. The current
order RPC supplier branch does not atomically decrement this MODEL_C cap; no
migration is included here. Before opening the release gate, a separate reviewed
atomic reservation/release design and concurrent-order tests remain required.
Fresh upstream availability does not reserve supplier inventory. Paid-order
verified allocation, fees, minimum profit and margin checks remain unchanged.

Remaining publication blockers include image/content readiness, actual SKU versus
has_skus data consistency, sellable cap configuration and atomic reservation,
financial all-in cost acceptance, and the intentionally closed release gate.
No live product, binding, stock, status, environment or payment is changed.
