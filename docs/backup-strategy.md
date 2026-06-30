# Jianlian Shop Backup Strategy

This document defines what must be backed up before real payment launch. It does not contain secrets and does not execute backups.

## Backup asset inventory

### Critical business data: must back up

| Data | Tables | Sensitivity | Notes |
| --- | --- | --- | --- |
| Users and account state | `profiles` | High | Includes email, balance, status, risk status. |
| Catalog | `categories`, `products`, `product_option_groups`, `product_option_values`, `product_skus`, `product_sku_values` | Medium | Required for order and SKU consistency. |
| Orders | `orders`, `order_items`, `order_status_logs` | Highest business | Legal and financial record. |
| Payments | `payment_sessions`, `payments`, `order_payments`, `payment_callback_logs`, `payment_reconciliations` | Highest business and sensitive | Callback payloads must be redacted where possible. |
| Recharges and balances | `account_recharges`, `balance_transactions` | Highest business | Must match user balances. |
| Refunds | `refund_requests` | Highest business | Must match payment and balance records. |
| Digital inventory | `digital_inventory`, `digital_inventory_batches` | Highest sensitive | Raw content and delivery content require encryption. |
| Deliveries | `order_deliveries` | Highest sensitive | User-facing delivery records. |
| Settings | `site_settings`, `announcements` | Medium | Required for site operation. |
| Audit and operations | `admin_audit_logs`, `system_error_events` | High | Security investigation and incident response. |

### Recommended backup

| Data | Tables | Notes |
| --- | --- | --- |
| Notifications | `user_notifications` | Can be restored from event history in some cases, but useful for support. |
| Visitor statistics | `visitor_events` | Keep shorter retention. |
| Media metadata | any media asset table if enabled | Must match Storage paths. |

### Rebuildable or excluded data

- `.next` build output is excluded.
- `node_modules` is excluded.
- Runtime cache and temporary logs are excluded unless needed for incident investigation.
- Generated analytics aggregates can be rebuilt from raw events when available.

## File and media resources

Back up Supabase Storage and static media references:

- Product images
- SKU images
- Category images
- Site logo
- Favicon
- Announcement images
- User avatars
- Other Supabase Storage files

Public buckets can be backed up without encrypting for confidentiality, but integrity checks are still required. Private buckets and user-uploaded files must be encrypted.

## Backup frequency

| Backup | Frequency | Retention |
| --- | --- | --- |
| Daily logical backup | Daily | 14 to 30 days |
| Weekly full backup | Weekly | 8 to 12 weeks |
| Monthly archive | Monthly | 12 months |
| Digital inventory encrypted export | Daily and before bulk import | 30 days minimum |
| Storage manifest and media backup | Daily manifest, weekly full copy | 8 to 12 weeks |

## Database backup commands

Full encrypted backup:

```bash
DATABASE_URL="postgresql://..." \
BACKUP_OUTPUT_DIR="/secure/backups" \
BACKUP_ENCRYPTION_PASS="from-secret-store" \
APP_ENV="production" \
APP_VERSION="0.1.0" \
bash scripts/backup-database.sh
```

Windows template:

```powershell
$env:DATABASE_URL="postgresql://..."
$env:BACKUP_OUTPUT_DIR="D:\secure-backups"
$env:BACKUP_ENCRYPTION_PASS="from-secret-store"
$env:APP_ENV="production"
$env:APP_VERSION="0.1.0"
powershell -File scripts/backup-database.ps1
```

Do not commit the environment values.

## Key table export

Use `backup-database.ps1 -KeyTablesOnly` or add `--table` parameters to `pg_dump` for the critical tables listed above.

## Encryption and checksum

Required:

- Compress backup output.
- Encrypt database and digital inventory backups.
- Generate SHA-256 checksum.
- Verify checksum before upload and before restore.

Never upload unencrypted digital inventory or delivery backups to public storage.

## Off-site storage

Keep encrypted backups in at least two locations:

- Primary secure storage
- Off-site or cloud archive

The encryption passphrase must be stored in a secret manager or equivalent restricted system, not in Git.

## Backup record metadata

Use `backup_runs` after the migration is executed to record:

- backup type
- environment
- status
- started and completed time
- encrypted file name
- file size
- checksum
- storage location
- retention date
- error summary

Do not store passwords or connection strings.
