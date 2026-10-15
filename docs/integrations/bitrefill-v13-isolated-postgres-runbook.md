# V1.3 isolated PostgreSQL harness (local-only)

This documents disposable local PostgreSQL fixtures for the V1.3 candidate. It is **not** a Production migration instruction or permission to enable Bitrefill purchases.

## Instance used on 2026-10-15

| Property | Verified value |
| --- | --- |
| Binary source | EnterpriseDB PostgreSQL 17.11 Windows x64 portable ZIP |
| Official archive SHA-256 | `b9424ee7bc60b52450ff910a3630225df32e633f3cb29c1d126d9299d59aea28` |
| Supabase CLI | Official v2.121.0 Windows archive, checksum `bc0f27a29c1f4ccaf33a801b7cb9d10da6484568c88e232c9dea0b9e8666b0db` |
| Local binary/data directory | `D:/Jianlian/_bitrefill_v13_local_pg/portable/pgsql`, `D:/Jianlian/_bitrefill_v13_local_pg/data` |
| Host/port | `127.0.0.1:55433` |
| Database/user | `jianlian_bitrefill_v13_test` / `v13_local` |
| Windows service/firewall | Neither created nor changed |
| Production/existing Test | Neither connected |

The disposable database password is stored only in the local tools directory outside Git. Never copy a Production or existing Test credential here. The portable server was started directly with `postgres.exe -D <local-data-dir> -h 127.0.0.1 -p 55433`, because this sandbox's `pg_ctl` restricted-token launch failed even though `initdb` and direct `postgres.exe` succeeded. The process has no service registration. The SQL identity query returned the exact data directory above, PostgreSQL 17.11, and `inet_server_addr()=127.0.0.1` before any migration execution.

## Re-run on this disposable instance

Use the exact instance identity above. Do not substitute a remote URL or business Test database. After setting a local disposable `PGPASSWORD` in the current process (do not print it), from the V1.3 repository root:

```powershell
$env:V13_PGHOST='127.0.0.1'
$env:V13_PGPORT='55433'
$env:V13_PGDATABASE='jianlian_bitrefill_v13_test'
$env:V13_PGUSER='v13_local'
$env:V13_PSQL_PATH='D:\Jianlian\_bitrefill_v13_local_pg\portable\pgsql\bin\psql.exe'
$env:V13_EXPECTED_DATA_DIRECTORY='D:\Jianlian\_bitrefill_v13_local_pg\data'

& $env:V13_PSQL_PATH -X -v ON_ERROR_STOP=1 -h $env:V13_PGHOST -p $env:V13_PGPORT -U $env:V13_PGUSER -d $env:V13_PGDATABASE -Atqc "select current_database(),inet_server_addr(),inet_server_port(),current_setting('data_directory')"
& $env:V13_PSQL_PATH -X -v ON_ERROR_STOP=1 -h $env:V13_PGHOST -p $env:V13_PGPORT -U $env:V13_PGUSER -d $env:V13_PGDATABASE -f tests/support/supplier-v13-isolated-constraints.sql
node tests/support/supplier-v13-isolated-concurrency.mjs
& $env:V13_PSQL_PATH -X -v ON_ERROR_STOP=1 -h $env:V13_PGHOST -p $env:V13_PGPORT -U $env:V13_PGUSER -d $env:V13_PGDATABASE -f tests/support/supplier-v13-isolated-explain.sql
```

The first-time sequence for the original narrow fixture is `tests/support/supplier-v13-isolated-base.sql`, the original P2.3 activation evaluator extracted from `20261004180000_admin_catalog_transactional_bulk_activation_p2_3.sql`, then `supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql`, followed by the checks above. The P2.3 evaluator is a real dependency of the revised V1.3 migration; do not substitute a stub. The base fixture mirrors only the required Supplier Core columns and existing delivered-item uniqueness, not the full repository migration history. Each SQL fixture checks its disposable database name and loopback address; the concurrent Node probe also checks the PostgreSQL data directory. Do not run any of these against another database. The constraint and EXPLAIN fixtures roll their synthetic rows back. The concurrency probe leaves only synthetic attempts/receipt in the disposable database.

## DB2 replay and gate status

The full-baseline target was separately created as `jianlian_bitrefill_v13_fullbaseline`. Before SQL execution, the connection reported `127.0.0.1:55433`, PostgreSQL 17.11 and the exact disposable data directory above. `supabase --version` with local `SUPABASE_HOME` and telemetry disabled returned `2.121.0`; no `supabase link` or remote `db push` was used. A minimal [platform shim](../../tests/support/supplier-v13-fullbaseline-bootstrap.sql) supplies empty `auth.users`, `storage` objects and local test roles. The repository's first migration applied. `supabase/schema.sql` and `supabase/orders-schema.sql` were then required for the second migration's `public.orders` dependency. The ordered replay proceeded through five migrations and stopped at historical `20260622_digital_delivery_hardening.sql:188` with an unterminated string. The failing migration was run transactionally and rolled back. This is an existing **repository fresh-bootstrap defect**, not an error in V1.3; it is not a harmless Supabase shim gap and cannot be skipped or silently edited. `FULL_BASELINE_REPLAY_PASS=no` and V1.3 could not be applied after the complete baseline.

The separate clean `jianlian_bitrefill_v13_db2` fixture was rebuilt from zero, loaded the narrow base and the original P2.3 evaluator, then applied the revised V1.3 migration. Run [RPC E2E](../../tests/support/supplier-v13-db2-rpc-e2e.mjs) only with `V13_PGHOST=127.0.0.1`, `V13_PGPORT=55433`, `V13_PGDATABASE=jianlian_bitrefill_v13_db2`, `V13_PGUSER=v13_local`, `V13_PSQL_PATH` set to the local `psql.exe`, `V13_EXPECTED_DATA_DIRECTORY` set to the verified local data directory, and a disposable `PGPASSWORD` read privately from the local tools directory. The script verifies the data-directory identity before writes. It exercises concurrent claim, semantic conflict, paid/frozen guards, 20+1 unit/child mapping, duplicate external identity, submit/UNCERTAIN, safe reconciliation evidence, 100 webhook replays, Daju/boolean activation fixtures, and actual ACL/RLS. It leaves only synthetic data in this disposable database; repeated runs use random identities.

The separate `jianlian_bitrefill_v13_dirty` fixture contains two synthetic historical roots sharing the same provider invoice ID. [Dirty-preflight E2E](../../tests/support/supplier-v13-db2-dirty-e2e.mjs) requires that exact database and the same loopback/data-directory identity variables, deliberately runs the migration expecting `SUPPLIER_PURCHASE_PREFLIGHT_DUPLICATE_EXTERNAL_INVOICE`, and verifies zero new purchase tables or RPCs afterward. Its only purpose is transactional dirty-data failure proof. These three disposable databases must never be replaced with the existing business Test or Production database.

The PostgreSQL process was launched directly as a user process. The sandbox did not permit `pg_ctl stop`; avoid forced termination. An operator with access to the owning session should stop it gracefully after confirming no local tests are running. Do not register a service, expose the port, or copy credentials into this repository.

## Scope of evidence

These checks verify real PostgreSQL uniqueness, triggers, transactions, row locks, compare-and-swap transitions, table ACL/RLS metadata and five index query plans with 1000 synthetic rows. DB2 additionally validates candidate RPC writes, paid/frozen guards, a P2.3 SQL fixture and dirty-preflight atomic failure. They do **not** validate Bitrefill HTTP POST, a full Supabase migration replay, application restart recovery, webhook/poll and private-secret delivery races, or Production equivalence. Keep the V1.3 and V1.4 gates closed until those are implemented and separately tested. The [production precheck](sql/bitrefill-v1-3-production-precheck.sql) is a read-only draft and has not been executed against Production.
