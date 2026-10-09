# Backend Operations V1 — separate Production rollout gate

No Production migration, deployment or systemd changes have been performed by
this development task. Payment core and historical canaries remain frozen.

## Exact migration and dependency order

`supabase/migrations/20261009170042_profiles_insert_privilege_hardening.sql`
was created by Supabase CLI, not copied from a dirty tree or applied remotely.
It only revokes profiles INSERT table/column ACLs; no business rows, policies,
triggers, functions or existing UPDATE/SELECT privileges are modified.

Deploy and verify the new verified-user server bootstrap **before** applying the
ACL migration. Old browser/client and account POST fallback use authenticated
INSERT; deploying code first avoids breaking missing-profile recovery.

### SELECT-only preflight

```sql
select c.relrowsecurity, c.relkind from pg_class c
where c.oid='public.profiles'::regclass;
select p.oid::regprocedure,p.prosecdef,p.proconfig,
  has_table_privilege(p.proowner,'public.profiles','INSERT') as owner_can_insert
from pg_proc p where p.oid='public.handle_new_user()'::regprocedure;
select tgname,tgenabled,pg_get_triggerdef(oid)
from pg_trigger where tgrelid='auth.users'::regclass
and tgfoid='public.handle_new_user()'::regprocedure and not tgisinternal;
select role_name,
  has_table_privilege(role_name,'public.profiles','INSERT') as table_insert,
  has_any_column_privilege(role_name,'public.profiles','INSERT') as any_insert,
  has_column_privilege(role_name,'public.profiles','display_name','UPDATE') as safe_update,
  has_column_privilege(role_name,'public.profiles','role','UPDATE') as role_update
from unnest(array['anon','authenticated','service_role']) role_name;
select count(*) as missing_profiles from auth.users u
where not exists(select 1 from public.profiles p where p.id=u.id);
```

Confirm trigger identity, owner privilege, RLS and safe UPDATE ACL match the
checked baseline. Migration includes fail-closed checks and rolls back on
unexpected inherited INSERT permissions. Re-run the ACL SELECT afterward.

Expected ACL (unchanged SELECT/RLS applies):

| Role | Direct INSERT table/any column | Safe self UPDATE | Sensitive UPDATE |
|---|---|---|---|
| anon | no | no | no |
| authenticated (including Admin JWT) | no | existing five fields, RLS | no |
| service_role | yes, unchanged | yes, unchanged | yes, canonical server authority |
| postgres / signup definer owner | unchanged | unchanged | unchanged |

The legacy `is_admin` fallback remains: Production SELECT-only audit found one
admin profile and one covered admin_users record. Removing compatibility
authorization is a separate decision; this patch does not change permissions.

## Rollback strategy

Migration is transactional and idempotent. Failure leaves prior ACLs intact.
After successful hardening, **do not restore broad authenticated INSERT**.
Keep the server bootstrap available when rolling back other UI changes. If it
fails, fail closed and repair server code under separate authority; do not use
an old client that depends on direct INSERT. No business-data reversal needed.

## Worker observation

Web API reads fixed bounded JSON files only. It never invokes systemctl or shell.
Heartbeat is `/run/jianlian-snpay-reconciliation/heartbeat.json`; private snapshot
is `/run/jianlian-operations/worker-status.json`. Snapshot older than 120 seconds
shows timer unknown. Heartbeat older than 180 seconds shows stale. Empty
InvocationID is unknown (systemd can clear it after oneshot); do not infer success.

Optional privileged **host-only** publisher, under future explicit approval:
`node <exact-new-release>/scripts/ops/publish-operations-worker-status.mjs --publish`.
It only reads `is-enabled`, `is-active`, `show InvocationID`, and writes a
sanitized root-only runtime JSON. Arrange observation cadence <=60 seconds via
approved host orchestration; do not give Web Admin any shell/systemd control or
modify the payment worker execution model in this patch. Until enabled, the UI
deliberately shows unknown timer state, not false. It is not installed here.

## Sole remaining manual UI checklist (no authenticated browser available)

- Desktop + small screen: refunds next/previous page, fast search switches,
  loading/empty/error and existing action dialog unchanged; do not execute actions.
- Inventory global search: batch import_status and quantities; no card contents.
- Worker: heartbeat, stale/error, unknown timer explanation; after approved
  publisher rollout, fresh timer snapshot and invocation if available.
- Supplier queue: actual uppercase backend status, pending/processing,
  retryable/permanent failures, uncertain/needs-input/completed filters, order
  link and safe error codes; no retry/force-complete controls.
- Ledger (superadmin only): full-history pagination, email/user/transaction
  search, business/direction/status, UTC dates, amount/currency/reference; no
  balance adjustment/delete; ordinary admin receives 403 without data.

No test requires real customer credentials, payment, provider query, Production
synthetic users, balance writes or historical canary processing.
