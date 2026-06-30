# Backup Automation Setup

This document describes how to schedule backups. It does not modify Crontab, PM2, Nginx, or server configuration automatically.

## Required tools

- `pg_dump`
- `pg_restore`
- `gzip`
- `openssl`
- `sha256sum`
- Optional: `curl` for Storage manifests

## Required secret environment variables

Do not store values in Git.

- `DATABASE_URL`
- `BACKUP_OUTPUT_DIR`
- `BACKUP_ENCRYPTION_PASS`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STORAGE_BACKUP_BUCKETS`

## Linux cron example

Review manually before installing:

```cron
15 2 * * * cd /www/jianlian-shop && /usr/bin/env bash scripts/backup-database.sh >> /var/log/jianlian-backup.log 2>&1
45 2 * * * cd /www/jianlian-shop && /usr/bin/env bash scripts/backup-storage.sh >> /var/log/jianlian-storage-backup.log 2>&1
```

Do not install this automatically. Confirm environment loading and permissions first.

## Windows Task Scheduler outline

1. Create a dedicated backup user.
2. Store secrets in a secure location, not in the repository.
3. Run `powershell -File scripts/backup-database.ps1`.
4. Write logs to a protected directory.
5. Alert on non-zero exit code.

## Backup verification schedule

- Verify checksum after every backup.
- Perform a restore drill monthly.
- Restore to a temporary database, never directly to production first.
- Run `scripts/restore-consistency-check.sql`.

## Backup metadata registration

After `20260630_backup_runs.sql` is applied, backup workers may register metadata into `backup_runs`.

Store only:

- file name
- file size
- checksum
- status
- timestamps
- storage location label
- retention date
- error summary

Never store:

- database URL
- password
- encryption passphrase
- service role key
- raw inventory content
- raw callback payload

## Alerting

Backup failures should create an operational alert. If `system_error_events` is enabled, record a sanitized failure summary without secrets.

## Disaster recovery drill

Recommended monthly drill:

1. Select latest weekly backup.
2. Verify checksum.
3. Restore to a temporary database.
4. Run consistency checks.
5. Point a staging app to the temporary database.
6. Smoke test catalog, orders, payments, balance, and inventory.
7. Record results in the incident log or release notes.
