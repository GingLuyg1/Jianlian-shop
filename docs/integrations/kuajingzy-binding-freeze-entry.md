项目执行原则：能由 Codex 自动完成的操作一律交给 Codex；仅在输入私密口令、必要授权或确实无法自动完成时要求用户操作，避免重复确认、反复测试和耗时等待。

# KuajingZY atomic order binding freeze: candidate only

Independent of PR141. The new migration only extends the body of the existing
10-argument public.create_order_with_item. No new RPC, table, column, payment
state, amount algorithm, provider request or purchase gate is introduced.
Production migration execution requires separate authorization.

The fixture records the previously read-only verified current function SOURCE,
without any customer data/credentials. Apply-time checks pin its normalized
SHA256, exact signature, unique declaration/branch/snapshot anchors and existing
Daju plus Bitrefill replay/consume/attach hooks. Unknown source versions fail
closed with no patch; a repeated exact applied candidate is idempotent.
CREATE OR REPLACE retains object identity/ACL, verified on isolated PostgreSQL.
The fingerprint pins source identity, not an authentication primitive.

Verified product/SKU row metadata is the sole source: SKU-first, product fallback
per existing field precedence. Website product/SKU UUIDs always come from actual
validated rows, not metadata-supplied website IDs or shipping/customer input.
Only explicit supplier=kuajingzy enters the branch; missing/invalid policy in a
declared KuajingZY binding raises KUAJINGZY_BINDING_INCOMPLETE. Website SKU and
automatic delivery are required. Supplier product ID is a bounded safe string;
SKU is bounded string or explicitly null; CNY, positive <=4-place cost/profit,
integer0..9999 margin bps and actual JSON boolean purchase flag are mandatory.
Fixtures default that flag false. A stored true admin flag can be frozen but
does not enable any runtime release/global/supplier gate.

The complete supplier_binding is inserted in the original order creation
transaction; there is no after-create order_items UPDATE. Supplier delivery skips
local digital inventory count/reservation using the existing supplier predicate.
Daju, Bitrefill, local inventory, original line-total computation and idempotency
logic remain otherwise verbatim. Ordinary SKU snapshot supplier_binding remains
null, preserving the established representation.

Local PG tests cover exact freezing, fake website IDs and shipping-field overrides,
metadata changes after order creation, priority/fallback, missing/invalid fields
and rollback, local reservation, Daju/Bitrefill, signature/ACL retention, source
drift rejection and migration idempotence. Test helpers for auth and Bitrefill are
explicit synthetic stubs, not real provider or auth implementations. CI additionally
runs isolated PostgreSQL17. Never execute the support fixture against a hosted DB.

This PR does not create Outlook products/bindings or authorize purchase.
Review A and the independent merchant-cost PR first; then separately rebase and
review PR141. Deployment, migration execution and activation remain later actions.
