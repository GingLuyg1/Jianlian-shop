# RC1 integration matrix — recorded before integration

LOCAL ONLY, 2026-10-16. This document was created before merging P3 into the
new RC1 worktree. It is not release or migration authorization.

## Baselines and ancestry

| Source | Frozen HEAD | Entry state |
| --- | --- | --- |
| DB9 / RC1 start | 6c53783ccffc5137b523e4f62a0a81b2a2c6489a | clean |
| P1 | 761947367f66ddfc5c8493219fe614d684ed775a | clean |
| P2 | da8eb3c7da382534778cb2c570129dea2ab2002d | clean |
| P3 | fcc2d7c73118120e8952f95dad0d1b9b2d553b19 | clean |
| Common DB7B ancestor | ed8a9c492d755461e09441b324f3e317f4c64321 | immutable source |

Git confirms P1 is ancestor of P2, P2 ancestor of P3, and DB9/P3 merge-base is
DB7B. Integrating P3 once includes all P1/P2 commits; do not cherry-pick them
again. DB9 has three independent fix/test/doc commits after that ancestor.
RC1 starts from DB9 and will merge P3 locally, preserving both histories.
All four source worktrees remain untouched. Command-local safe.directory was
needed to inspect user-owned source worktrees; no global Git config was changed.

## Change and conflict matrix

| Area | DB9 side | P1/P2/P3 side | Integration decision / verification |
| --- | --- | --- | --- |
| Code | no purchase application rewrites | single-item purchase, paid-order local handler, quote guards, hard release gate | retain P3 additions; actual paid-order path must pass under DB9 |
| Migration | explicit service/public/browser REVOKE, six controlled definers, owner/effective ACL postflight | unchanged old DB7B SQL | retain DB9 SQL byte-for-byte, SHA90f165ae…; any required SQL edit stops integration |
| RPC contract | same six signatures/results; service SELECT and RPC-only mutation | adapter uses those six RPCs and SELECT; private bridge reused | no new write grants or second fulfillment system; real-role tests |
| Environment | no new variables/files | injected synthetic dependencies; false code release constant, no environment enablement | no env files/credentials added; pinned disposable test child config only |
| Supplier route | default registry Daju-only | optional explicitly injected local Bitrefill handler | retain optional argument; production callers unchanged, no registration |
| Order fulfillment | SQL payment/root checks unchanged | actual delivery/router invocation and FakeTransport-only handler | merge existing service injection; no payment/recharge/order-core change |
| Delivery | exact existing private outcome RPC, controlled binding RPC | exact child identity checks before bridge | retain DB9 atomic bridge and P3 fail-closed child checks |
| Tests | default-ACL fixture, hardened owner mode, fault matrix, SHA pin | P1/P2/P3 full application cases and stability/restart guards | combine harness paths, never substitute permissive old-owner tests |

Only two tracked paths are changed by both branches relative to DB7B:

1. `tests/support/supplier-v13-local-fixture.mjs`: DB9 changes the expected SHA;
   P1 canonicalizes CRLF only. Keep the DB9 checksum and both strict source and
   runtime checks. Do not normalize away SQL differences or change migration SQL.
2. `tests/support/supplier-v13-db5-local-e2e.mjs`: DB9 adds explicit postgres owner,
   production-default fixture and trusted-role identity checks; P1/P2/P3 add UTF-8
   stdin, timeouts, application cases and safety assertions. Combine those
   nonexclusive behaviors. In particular, retain DB9's default SQL-role prefix
   when merging P3's stdin execution. An unexplained semantic conflict is a stop,
   not an automatic ours/theirs selection.

P3 contributes 23 files / 2611 insertions / 19 deletions relative to DB7B,
including the two shared harness files. No P3 changes under app/components/hooks,
lib/payments, lib/orders, supabase/migrations or package manifests were found.
DB9 contributes20 files including the one explicitly reviewed candidate SQL;
no other migration is to be changed by RC1.

## Remote main and PR78 boundary

Read-only GitHub metadata confirms current remote main is
4575d802d653e4dca726427bce826aa68c93d9e2, also the DB9/main merge-base.
Local main is older (48a7a3aad0ee7412a772eff79dde10701474fd0c); do not mistake it
for the remote baseline or merge it here. SSH ls-remote was denied; the GitHub
read-only connector supplied the authoritative current ref instead.

PR78 remains open/unmerged at7f9a25b1bfe1fadf553179074f8f4c8869568ed4, base4575d802…,
31 changed files. It is an earlier inherited offline-provider layer, not an
independent patch to apply again. Among the23 incoming P3 paths, its only file
overlap is lib/providers/core/supplier-router.ts (optional local injection).
RC1 vs remote main also includes inherited catalog/read-only/provider/V1.3 work;
the entire candidate is not a replacement diff for PR78. All remote PRs/refs
remain unchanged. Record the final exact diff separately after integration.

## Planned acceptance

Use the already pinned PostgreSQL17.11 loopback cluster/data-directory guards;
create only random, runner-owned disposable databases. DB9 ACL core and full
merged DB5/P1/P2/P3 path must both pass with reproduced Production defaults and
non-superuser trusted owner. Retain independent-session claim, poll/webhook,
private delivery and ACK-loss recovery. Use synthetic paid orders, quotes,
balance evidence and card markers only. No Bitrefill network request.

Run focused P1/P2/P3, Daju, Local Inventory, activation/payment-failed regression,
typecheck, targeted lint, full suite and one normal build. The historical seven
failures and external Inter network error must be reported rather than hidden.
Generate a separately reviewed SELECT-only post-install metadata plan; do not
execute it against Production. Final worktree clean with explicit local staging.
