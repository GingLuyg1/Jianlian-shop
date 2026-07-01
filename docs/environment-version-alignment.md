# Jianlian Shop Environment Version Alignment

Last updated: 2026-06-30

This document defines the version fields and manual checks used to compare the local project, GitHub `main`, production server code, PM2 runtime, and Supabase schema.

## Known Environment Targets

| Item | Value |
| --- | --- |
| Local project | `D:\Jianlian-shop` |
| GitHub repository | `GingLuyg1/Jianlian-shop` |
| Production code directory | `/www/jianlian-shop` |
| PM2 app name | `jianlian-shop` |
| App port | `3001` |
| Production URL | `https://www.jianlian.shop` |

## Release Identifier

The app exposes release metadata through:

- `GET /api/health`
- `GET /api/health/readiness`
- `GET /api/admin/system/version`

The expected fields are:

| Field | Source | Notes |
| --- | --- | --- |
| `application_version` / `version` | `APP_VERSION`, `NEXT_PUBLIC_APP_VERSION`, package fallback | Use a semantic version or release tag. |
| `commit_sha` | `GIT_COMMIT`, `VERCEL_GIT_COMMIT_SHA`, `NEXT_PUBLIC_COMMIT_SHA` | Should match deployed Git commit. |
| `branch` | `GIT_BRANCH`, `VERCEL_GIT_COMMIT_REF` | Should be `main` for production. |
| `build_time` | `BUILD_TIME`, `NEXT_PUBLIC_BUILD_TIME` | ISO timestamp generated during build. |
| `environment` | `APP_ENV`, `NODE_ENV` | Should be `production` on server. |

Do not expose secrets through these fields. Commit SHA and build metadata are safe operational metadata.

## Local Git Check

Run locally:

```powershell
git -C D:\Jianlian-shop fetch origin
git -C D:\Jianlian-shop status --short --branch
git -C D:\Jianlian-shop rev-parse HEAD
git -C D:\Jianlian-shop rev-parse origin/main
git -C D:\Jianlian-shop rev-list --left-right --count origin/main...HEAD
```

Current verified snapshot on 2026-06-30:

| Check | Result |
| --- | --- |
| Local HEAD | `49061b1f3c37d3be353c5088b89516ea32263422` |
| origin/main | `779cf53f439ea5b3b4299a17b27231d4b0be210c` |
| Ahead / behind | local is ahead by 3 commits after fetch |
| Working tree | contains staged and unstaged feature changes; do not deploy until reviewed |

## Server Version Check

Run on the server manually:

```bash
cd /www/jianlian-shop
git rev-parse HEAD
git rev-parse --abbrev-ref HEAD
git status --short --branch
pm2 describe jianlian-shop
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS https://www.jianlian.shop/api/health
```

Expected:

- Server Git SHA matches the intended GitHub `main` release.
- PM2 `cwd` is `/www/jianlian-shop`.
- PM2 script starts Next.js on port `3001`.
- `/api/health` returns JSON with release and database reachability fields.
- Static assets under `/_next/static/` return 200 and are not intercepted by middleware.

## Supabase Schema Alignment

Migration files must be applied in filename order. Current local migration order:

```text
20260620_digital_inventory_delivery.sql
20260620_order_payments.sql
20260620_referral_system.sql
20260620_site_settings.sql
20260622_digital_delivery_hardening.sql
20260622_fix_referral_signup_and_short_links.sql
20260622_recharge_records.sql
20260622_super_admin_payment_console.sql
20260623_admin_audit_logs.sql
20260623_digital_inventory_batches.sql
20260623_mixed_order_item_fulfillment.sql
20260623_payment_balance_transactions_compatibility.sql
20260623_payment_core_linkage.sql
20260623_payment_provider_core.sql
20260623_payment_reconciliation_system.sql
20260624_admin_visit_analytics.sql
20260629_account_recharge_client_request_id.sql
20260629_admin_user_controls.sql
20260629_app_migration_history_and_schema_check.sql
20260629_direct_purchase_order_idempotency.sql
20260629_i18n_currency_timezone_settings.sql
20260629_media_assets.sql
20260629_multi_sku_core.sql
20260629_payment_reconciliation_runs_logs.sql
20260629_refund_after_sales.sql
20260629_system_error_events.sql
20260630_backup_runs.sql
20260630_business_id_global_search_indexes.sql
20260630_data_consistency_scan.sql
20260630_data_origin_labels.sql
20260630_order_query_tokens.sql
20260630_privacy_account_controls.sql
```

Before production deployment, compare this list with the Supabase migration history table or the SQL Editor result for applied schema changes. Do not run migrations automatically from the application.

## Release Stop Conditions

Stop deployment if any of these are true:

- Local branch is not clean except for reviewed release files.
- GitHub `main` does not contain the intended commit.
- Server Git SHA does not match the intended release commit after pull/reset.
- `/api/health` reports `unhealthy`.
- Supabase schema is missing required order, payment, inventory, SKU, or privacy tables.
- `npm run typecheck` or `npm run build` fails.
- Static assets under `/_next/static/` return 400/404/502.

