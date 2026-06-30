# Jianlian Shop Disaster Recovery Runbook

This runbook is for controlled recovery. Do not restore directly into production without approval and validation.

## Recovery scenarios

- Database complete loss
- Bad migration
- Accidental order deletion
- Balance data anomaly
- Digital inventory damage
- Storage file loss
- Application rollback required

## Stop conditions

Stop and escalate if:

- Backup checksum fails.
- Backup is unencrypted but contains digital inventory or delivery content.
- Target database is production and `CONFIRM_RESTORE` is not explicitly approved.
- Application version does not match restored schema.
- Balance or payment consistency checks fail after restore.
- Digital inventory consistency checks fail.

## General recovery flow

1. Pause writes where possible.
2. Record current commit, schema version, and database status.
3. Verify selected backup checksum.
4. Restore into a temporary database first.
5. Run `scripts/restore-consistency-check.sql`.
6. Validate application against the temporary database.
7. Decide whether to promote restored data to production.
8. Apply matching application version.
9. Run health checks and smoke tests.
10. Reopen writes only after sign-off.

## Database complete loss

1. Provision a clean temporary database.
2. Restore latest verified encrypted full backup.
3. Apply any forward-compatible migrations after backup time if required.
4. Run consistency checks.
5. Verify login, catalog, orders, payments, balance, inventory, and admin pages.

## Bad migration

1. Stop new writes.
2. Do not edit historical migration files.
3. Prefer a forward corrective migration.
4. If restoring is required, restore to temporary database first.
5. Compare `app_migration_history` and `/admin/system/database`.

## Order, payment, balance, and refund recovery

These records are highest business priority. Before replacing production data:

- Compare order counts.
- Compare paid payment counts.
- Compare successful recharge counts.
- Compare balance ledger totals.
- Confirm no duplicate payment入账.
- Confirm refund states match balance transactions.

## Digital inventory recovery

Digital inventory and delivery content are highest sensitivity.

Rules:

- Never print raw inventory content in logs.
- Restore encrypted backup only.
- Confirm `delivered` inventory is not restored to `available`.
- Confirm one inventory item is not assigned to multiple orders.
- Confirm SKU-specific inventory remains isolated.

## Storage file recovery

1. Restore files to a temporary bucket or prefix first.
2. Compare manifest checksums.
3. Check database references to `image_url`, SKU images, category images, logos, and private files.
4. Do not delete orphan files automatically.
5. Promote after manual review.

## Application rollback

1. Record current commit.
2. Confirm database schema compatibility.
3. Check whether new migrations are backward compatible.
4. Roll back app code only if previous version can read current schema.
5. Rebuild and restart app.
6. Run health checks.

## Health checks after recovery

- Home page loads.
- Admin login works.
- `/admin/system/database` passes or shows known tolerated warnings.
- Orders and payments can be listed.
- User balances match ledger.
- Digital inventory counts are consistent.
- Storage images load.
- No ChunkLoadError or unstyled HTML.
