# Migration Rollback Runbook

This runbook is for manual rollback planning. It does not contain executable destructive SQL. Do not use it as a production script.

## Core Rule

Stop at the first failed migration. Do not continue applying later migrations to "see what happens." Record the failed statement, error code, migration file name, current database project, and timestamp.

## Before Any Migration

1. Confirm the Supabase project is the intended test or production project.
2. Export a schema snapshot.
3. Export business-critical data when the environment is not disposable.
4. Record the application commit SHA.
5. Record the exact migration list and execution order.
6. Run `docs/migration-preflight-checks.md`.

## If A Migration Fails In The Test Database

1. Stop execution.
2. Save the full SQL Editor error.
3. Run the relevant readonly preflight section.
4. Compare existing objects with the migration file.
5. Decide whether to fix the migration, add a new compatibility migration, or reset the disposable test database.

Disposable test databases may be rebuilt from baseline. Production databases must not be reset.

## If A Migration Fails In Production

1. Stop deployment immediately.
2. Do not run later migrations.
3. Do not deploy code that expects the failed schema.
4. Capture logs, error code, and failed SQL statement.
5. Run readonly preflight queries only.
6. Decide with a human operator whether to:
   - apply a small forward-fix migration,
   - restore from backup,
   - or temporarily roll application code back to the previous commit.

## Rollback By Object Type

### Added Nullable Columns

Usually safe to leave in place. Application rollback can ignore extra nullable columns.

### Added Tables

Usually safe to leave unused tables in place until a planned cleanup. Do not delete tables that may contain partial business records without a data review.

### Replaced Functions

Rollback requires reapplying the previous known function body. Keep the previous migration file available and confirm the exact signature with `pg_proc` before replacing.

High-risk functions:

- `public.create_order_with_item`
- `public.release_order_inventory`
- `public.deliver_digital_order`
- `public.complete_payment_session`
- `public.complete_order_payment`
- `public.claim_bep20_chain_transaction`
- `public.prepare_bep20_payment_completion`
- `public.finish_bep20_payment_completion`
- `public.decide_bep20_manual_review`

### Added Constraints

If a constraint migration fails, do not force it. Inspect existing rows first. The data may need cleanup or a compatibility migration.

### Added Unique Indexes

If a unique index fails, find duplicate rows using readonly checks. Do not delete duplicates without a business decision.

High-risk unique areas:

- Product and category slugs.
- Order `(user_id, client_request_id)` idempotency.
- Chain transaction claim `(chain_id, tx_hash)`.
- Delivered digital inventory uniqueness.

### RLS And Policies

If access breaks after RLS changes, do not disable RLS globally. Compare policies and helper function availability first, especially `public.is_admin()`.

### Triggers

If trigger behavior is wrong, identify the trigger name and function. Avoid dropping triggers in production without understanding whether they maintain `updated_at`, profile initialization, audit history, or inventory state.

## BEP20-Specific Rollback Notes

BEP20 migrations touch payment state, chain transaction claims, completion attempts, and manual review decisions. Do not roll back only one function from the BEP20 chain unless the dependent functions are also reviewed.

Safe rollback posture:

1. Disable BEP20 as a payment option through configuration if needed.
2. Keep existing chain records for audit.
3. Do not release TxHash claims after manual rejection or failed completion.
4. Do not mark external payments as successful through ad hoc SQL.
5. Prefer forward-fix migrations for state machine issues.

## Application Rollback Coordination

If code is rolled back but migrations remain:

- Extra columns are usually tolerated.
- New status values may not be understood by old code.
- Replaced RPC signatures may break old code.
- New RLS restrictions can break old server/client paths.

Always verify:

1. Product list and checkout.
2. Pending order creation.
3. Admin product edit and status update.
4. User profile load.
5. Legal documents endpoint.
6. BEP20 disabled or manually verified in test only.

## Documentation To Save During Incident

- Migration file name.
- Failed statement.
- Supabase error code and safe message.
- Application commit SHA.
- Database project ref, without keys.
- Manual actions taken.
- Decision maker and timestamp.

## Recovery Completion Criteria

Recovery is complete only when:

- The database schema matches the application version being run.
- Critical APIs return expected safe responses.
- No migration is half-applied without an owner and follow-up task.
- Operators know which migrations still need to be applied or replaced.
