# Bitrefill V1.3-DB9 — default ACL compatibility and RPC-only mutation

LOCAL ONLY — 2026-10-16. No Production connection, mutation, migration,
advisory call, deployment, Bitrefill HTTP call, real purchase or remote Git operation.
DB10 is prepared, not executed. Production/schema/release gates remain closed.

## Baseline and current package

- Worktree: `D:/Jianlian/Jianlian-shop-supplier-bitrefill-v1-3-persistence`.
- Branch: `codex/supplier-bitrefill-purchase-persistence-v1-3`.
- Start HEAD: `ed8a9c492d755461e09441b324f3e317f4c64321`; clean on entry.
- Modified file: only the explicitly authorized, not-yet-deployed candidate
  `supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql`.
- Old SHA256: `2b31673100d15b6c55968aa71eb092a5f278032f8ec808e3a3f5b949fa38d108`.
- New SHA256: `90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0`.

Production migration absence, target-conflict absence, five zero dirty counts
and existing-object compatibility come from the authorized DB8 evidence at
`D:/Jianlian/_bitrefill-db8-readonly-evidence-20261016/report.md`. DB9 did not
refresh those observations or assert they cannot have changed since DB8.
No deployed historical migration or protected recharge SQL was changed.

## DB8 root cause and reproduction

DB8 captured postgres/public default table grants of SELECT, INSERT, UPDATE,
DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN to anon, authenticated and
service_role, plus default function EXECUTE. PostgreSQL also supplies PUBLIC
EXECUTE on newly created functions by default. Existing table/function owner
was postgres; service_role was NOSUPERUSER/INHERIT/BYPASSRLS. Browser roles were
NOSUPERUSER/INHERIT/NOBYPASSRLS. Public/auth schema CREATE was not available to
application roles. DB8 did not capture the full pg_auth_members graph; this
remaining Production observation is explicitly added to the DB10 plan.

The old candidate revoked table privileges from PUBLIC/anon/authenticated,
but not service_role. A later GRANT SELECT added a privilege without removing
default write privileges. BYPASSRLS meant RLS could not implement the intended
service-read-only boundary. The original six internal RPCs were already
SECURITY DEFINER; converting INVOKER functions was not the needed fix.

The opt-in local runner uses PostgreSQL **17.11**, `127.0.0.1:55433` and the
exact dedicated data directory `D:/Jianlian/_bitrefill_v13_local_pg/data`.
Version, host and data-directory identity are checked before creating anything.
Every database name is randomly generated and restricted to the DB5 disposable
prefix. Only databases created by this runner are dropped after an identity check.
The existing local password is read privately outside Git and passed only to
local child processes; no environment file, Production URL or supplier key is read.
Inherited libpq variables are cleared before any connection. A repeat with a
deliberately wrong loopback PGHOSTADDR, nonexistent PGSERVICE and PGOPTIONS role
override still passes the complete ACL core, proving these cannot redirect or
silently change the pinned local connection. Persistent environment is unchanged.

Database A loads the full scoped current-schema fixture, exact repo private
outcome RPC and the DB8 default-ACL fixture, then applies the **old migration
extracted from the immutable start commit**, with its old SHA verified. The
default table rights are checked separately for every privilege on all five
tables. Actual service-role INSERT/UPDATE/DELETE succeeds on a synthetic webhook
receipt inside a rolled-back transaction. This is an actual PostgreSQL
reproduction, not an inference from grant text.

Database B is a separate random database with the same owner/default model and
the hardened candidate. Subsequent independent databases exercise fault injection
and fresh-fixture replay. The local owner analogue is postgres with NOLOGIN,
NOSUPERUSER, NOCREATEROLE and BYPASSRLS; it owns the database and relevant objects.
Only the harness creates this local role. Its pg_read_all_settings membership
is an explicitly synthetic read-only capability needed by fixture identity
guards, not a claim about Production membership or a migration requirement.

The reproduction mirrors observed defaults/owner/role attributes, not every
Supabase object or an unobserved Production membership graph. Synthetic unsafe
inheritance and SET-only membership paths are tested separately.

## Chosen security model

**Narrow existing-owner SECURITY DEFINER RPCs**, not INVOKER plus broad grants.
INVOKER would require granting direct writes back to service_role and would
therefore fail the stated boundary. A dedicated new NOLOGIN owner might narrow
owner privileges further, but would introduce unproven Production CREATE ROLE,
membership and ALTER OWNER requirements. This candidate creates no roles,
alters no owner and does not assume those deployment capabilities.

Instead, the migration reuses and validates the trusted executing owner:

- Executor cannot be an application role and must already be superuser or
  BYPASSRLS; the non-superuser BYPASSRLS owner is tested locally.
- Required existing delivery/root tables and the activation/outcome functions
  must be owned by that executor; the outcome must already be DEFINER.
- No application role may inherit or SET ROLE into the owner, have public
  schema CREATE, or possess unsafe superuser/BYPASSRLS attributes.
- New tables/functions are created by and remain owned by that validated owner.
- No SECURITY DEFINER widening of a previously INVOKER RPC is introduced.

This deliberately retains normal administrator/object-owner powers. It does
not claim the existing database administrator is a globally least-privileged
role. Least privilege is enforced at the application entry points: no direct
table mutations, six necessary RPCs, no browser EXECUTE and no extra worker
permissions. Future owner/default/membership drift makes the migration fail
closed rather than silently transferring functions to a new role.

All six RPCs retain fixed `search_path=pg_catalog`, qualified business objects,
typed/bounded inputs and no dynamic SQL. Existing payment/frozen-binding,
quantity, supplier/product/package, cost ceiling, semantic hash, state transition,
external identity, idempotency and private-delivery checks remain unchanged.
The RPC ACL is the actual caller boundary; the migration does not trust a
front-end assertion of payment or add a caller-supplied role switch. The reused
private outcome function also retains its existing service-role check.

PostgreSQL documents that privileges are additive across direct, PUBLIC and
membership grants, and that definer functions require restricted execution
and safe resolution. See [REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html)
and [CREATE FUNCTION security guidance](https://www.postgresql.org/docs/17/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).

## Five-table access contract

Applies to supplier_purchase_attempts, supplier_purchase_attempt_items,
supplier_external_orders, supplier_webhook_receipts and
supplier_reconciliation_evidence:

| Role | SELECT | INSERT / UPDATE / DELETE | TRUNCATE / REFERENCES / TRIGGER / MAINTAIN | Six internal RPCs |
| --- | --- | --- | --- | --- |
| PUBLIC | no grant | no grant | no grant | no EXECUTE |
| anon | denied | denied | denied | denied |
| authenticated | denied | denied | denied | denied |
| service_role | retained | denied | denied | permitted |
| trusted owner / DBA | normal owner/admin rights | retained | retained | retained |

The migration explicitly REVOKEs ALL from all four application/public principals
**before** restoring SELECT to service_role. RLS remains enabled with no browser
policies. Three INVOKER guard trigger functions revoke application/public EXECUTE,
including service_role creation defaults; RPC-owned writes still fire them.
Internal RPCs revoke PUBLIC/anon/authenticated EXECUTE and grant only service_role.
The P2.3 activation signature, invoker mode and service-only grant remain unchanged.
No existing supplier-worker read grant on other tables is removed.

Before COMMIT, catalog assertions check actual effective table/column grants,
PUBLIC function ACL, six definer/three invoker modes, owners, safe paths and
service/browser execution. They include every role reachable using USAGE or
SET, including a NOINHERIT parent with SET TRUE. An unexpected inherited/default
grant aborts the entire transaction. No broad role memberships or existing
grants outside the five new tables/new functions are silently revoked to pass.

## Real-role and transactional tests

Tests execute SET ROLE anon/authenticated/service_role, not mocked role labels.
On each new table and each application role:

- Actual INSERT, UPDATE, DELETE and TRUNCATE attempts fail with privilege errors.
- REFERENCES is tested from a separately role-owned disposable schema, so failure
  is not merely lack of schema CREATE. Actual CREATE TRIGGER also fails.
- SELECT and every mutation privilege, including PG17 MAINTAIN, are checked
  individually with has_table_privilege; column-level effective grants are
  enforced by the migration's postflight. No reliance on a multi-privilege
  has_table_privilege call that only tests whether *any* listed right is present.
- All six internal RPCs are actually invoked as each browser role and denied.
- Owner/function/security metadata confirms six trusted-owner definers, three
  invoker triggers, no PUBLIC execution and fixed paths.

As service_role, the current and frozen P1/P2/P3 adapters each perform real
claim, transition, child registration, evidence, webhook receipt and private
delivery writes through RPCs against Database B. Worker SELECT paths continue
to work. The local SQL client preserves the adapters' parameter names and shapes.

Two independent psql processes report different backend PIDs and race the same
logical claim: exactly one CLAIMED, one ALREADY_CLAIMED and one attempt ID.
Different semantic hash conflicts. Malformed UUID, cross-order root/item,
forged supplier, missing/excess cost, long product/key, malicious key, invalid
child ID, unknown delivery child and forbidden UNCERTAIN transitions fail closed.
A caller-controlled temporary table/search_path cannot redirect the qualified
webhook RPC. No live HTTP request occurs.

The existing approved customer get_order_delivery_for_user RPC and its existing
mask helper are extracted unchanged into the disposable fixture. The real owner
sees the synthetic private card; another customer gets access denied; anon gets
permission denied. No second secret store or new customer-read API is created.
Synthetic markers occur in digital_delivery_secrets only, not ordinary purchase,
webhook, evidence, delivery relation or log rows.

## Failure atomicity

Every failure uses a separate random disposable database. ON_ERROR_STOP closes
the failing session, and the candidate's enclosing transaction rolls back.
The harness verifies zero new target tables and zero new internal/guard functions
after each failure, rather than swallowing SQL errors and calling it success.

| Fault | Expected outcome |
| --- | --- |
| Application role attempts migration | trusted-owner rejection |
| Existing activation function has another owner | dependency-owner rejection |
| Trusted owner lacks public CREATE | actual PostgreSQL permission failure |
| Required role lookup points to an absent synthetic role | roles-missing rejection |
| Injected failure after table/ACL creation, before claim function | whole transaction rollback |
| Default table INSERT granted through INHERIT parent | effective-write rejection |
| Default table INSERT through NOINHERIT / SET TRUE parent | effective-write rejection |
| Browser inherits default function EXECUTE | effective-execute rejection |
| service_role has schema CREATE | unsafe-role-path rejection |

The missing-role test changes only the test stream's lookup to a genuinely absent
synthetic role. It does not drop shared cluster roles or alter the candidate file.
Extra PUBLIC default table grants are also tested as a successful normalization
case: the explicit REVOKE removes them. Synthetic parent roles are tracked and
dropped after their test databases; no existing business database is changed.

## Full current-schema / delivery regression

The full DB5 runner was rerun with `--db9-production-default-acl`, meaning the
same non-superuser owner/default grants as Database B, not just the earlier
minimal fixture. It passed:

- Two fake invoices and exact 21/21 unit/child mapping, with known-ID GET recovery.
- Invoice complete with delivered/pending/failed children does not deliver all.
- Restart before/after submit, ambiguous submission remains UNCERTAIN, no blind retry.
- Duplicate external child uniqueness and idempotency.
- Webhook/Poll race across separate sessions and 100 notification replays.
- Two-worker private delivery produces one delivery/secret/link.
- Failure inside private insertion rolls back root/delivery/secret/link together.
- Restart before transaction and after lost commit acknowledgement does not duplicate.
- Eleven non-private tables scanned: zero card/PIN markers; log matches zero.
- Daju 27-case SQL golden comparison against the original activation evaluator;
  Bitrefill boolean UNKNOWN/stale/error cases and unverified Apple SKU isolation.
- Five index lookup classes on 1,000-row synthetic datasets.

The two-fresh-DB DB7B replay uses `--db9-owner` so the role named postgres is
the explicit object owner, not an accidental unprivileged role introduced into
the old fallback model. Both fresh schemas apply successfully and reproduce
the unchanged canonical V1 fixture fingerprint:

`e036759cd8baa297a4de29c3bf3dc1460bd7959fdc00ebb26a6b7807849193fb`.

The canonical algorithm, baseline schema, 1,389 records and seven marked helper
stubs are unchanged. Only migration_sha256 changes in the regenerated manifest.
An intermediate run with the old fallback owner produced a different *local
harness role* fingerprint; this was corrected by explicit owner modeling, not
by normalizing hashes, changing the baseline or asserting Production drift.

## Cross-branch read-only handoff

| Frozen worktree | Exact HEAD | Compatibility |
| --- | --- | --- |
| bitrefill-auto-purchase-p1 | 761947367f66ddfc5c8493219fe614d684ed775a | six RPC + SELECT adapter paths pass against hardened local DB |
| bitrefill-paid-order-p2 | da8eb3c7da382534778cb2c570129dea2ab2002d | same parameter/result contracts and private binding pass |
| bitrefill-prelaunch-p3 | fcc2d7c73118120e8952f95dad0d1b9b2d553b19 | same parameter/result contracts and read-only recovery access pass |

No frozen worktree was edited or merged. Daju routing, Local Inventory, payment,
recharge, Apple products and UI source are unchanged. P1/P2/P3 compatibility here
is V1.3 RPC/SELECT contract compatibility, not a fresh execution of their entire
independent checkout/payment/30-minute soak acceptance suites.

Future separately authorized integration checklist:

1. Adopt this reviewed migration candidate atomically with its new SHA; never
   copy the older migration back over it from a frozen branch.
2. Update each integration branch's migration checksum pin/manifest reference
   and runbook only when authorized; existing frozen old pins remain unchanged.
3. Re-run each branch's complete application integration suite after that adoption.
4. Keep real purchase, bulk live child mapping and Production switches disabled;
   RPC compatibility is not a release approval.

## Verification receipt and limits

| Check | Result |
| --- | --- |
| PostgreSQL old ACL reproduction | PASS; actual synthetic service-role mutations succeed before fix |
| New ACL / controlled RPC / owner / inheritance / search path | PASS on real PG17.11 roles |
| Atomic failure matrix | PASS, nine fault cases; PUBLIC-default normalization also passes |
| Full DB5 + fresh DB7B | PASS, synthetic-only; fingerprint deterministic across two fresh DBs |
| DB10 draft and libpq isolation | PASS locally for absent/present targets and hostile inherited connection settings; no Production request |
| Focused supplier/Daju/inventory/activation/payment-failed tests | 217 total, 216 pass; one unchanged Daju snapshot baseline failure |
| Typecheck | PASS |
| Targeted ESLint | PASS |
| Build | BLOCKED_EXTERNAL_FONT_NETWORK: Inter Google Fonts connect EACCES; no UI/font workaround |
| Full suite | 1460 total, 1453 passed, same seven known baseline failures; exit 1, NEW_FAILURES=0 |

Known baseline failures are the unchanged Daju snapshot-patch source assertion
and six Windows migration-runner tests (immutable inputs, target validation,
dry-run/execute, connection overrides, confirmation text, status/redaction).
They are not suppressed or repaired in this task. A nonzero full-suite exit due
to these failures is not described as an all-green suite. Font fetching fails
before a complete build; no claim of build success.

## DB8 follow-up and DB10 preparation

DB8's existing-object compatibility evidence remains historical evidence, not
new Production verification. DB9 locally resolves its confirmed default-ACL
defect under reproduced conditions; this **does not** pass the Production DB gate.
The DB8 scoped fingerprint does not include default ACL/membership, so it is
insufficient by itself for the new candidate.

Prepared SELECT-only draft:
`docs/integrations/sql/bitrefill-v1-3-db10-acl-precheck.sql`. It has been tested
locally against both absent and present target objects, with READ ONLY session
flags. It is not run against Production. Alongside the unchanged authoritative
parity query, future separately authorized DB10 should verify:

- Target/project identity and transaction_read_only, roles/attributes, actual
  full direct/transitive memberships including INHERIT/SET/admin options.
- Public/auth schema owner, USAGE/CREATE and effective role paths.
- Global and schema defaults for the actual migration executor; extra grants
  through reachable roles that the candidate correctly rejects.
- Existing dependency owners/private-function/activation compatibility and
  unchanged migration history, object-conflict and approved five COUNT-only checks.
- Candidate checksum and all current-schema differences, keeping test stubs
  excluded from authoritative equality.
- Before migration: absent new tables are ABSENT_PREMIGRATION, not observed
  service-role denials. Whether direct grants are denied is proven locally and
  predicted from the candidate; actual Production post-install ACL would need
  separately authorized metadata verification after a separately authorized migration.

The older generic production-precheck template contains additional COUNT
categories and is explicitly NOT the DB10 approved query set. DB9 did not execute
it. No Production advisors/CLI/link/db push are invoked to satisfy a local check.

Remaining release limits: Production state can change; actual membership/default
owner compatibility still needs DB10. Live child identity, trusted supplier cost,
commercial Business API permission and deployment/real purchase authorizations
remain absent. No scheduler, switch, environment value or binding is installed.

DB9_LOCAL_ACL_HARDENING_COMPLETE=yes
DB10_READONLY_RECHECK_READY=yes
V13_LOCAL_E2E_GATE_COMPLETE=yes
AUTHORITATIVE_SCHEMA_PARITY_COMPLETE=no
V13_DB_GATE_COMPLETE=no
V13_FULL_RELEASE_ACCEPTANCE=no
READY_FOR_PRODUCTION_MIGRATION=no
REAL_PURCHASE_ENABLED=no

Next safe step: user reviews the local commits and, only if desired, separately
authorizes DB10 read-only verification. STOP; no DB10 query, migration, deployment,
push/PR/merge, real invoice/payment/purchase or V1.4 follows automatically.
