# Jianlian Shop Environment Version Verification

Last updated: 2026-06-30

## Scope

This report covers local code, GitHub `main`, server deployment expectations, PM2 runtime checks, and Supabase schema alignment. No server deployment and no Supabase SQL execution were performed.

## Local and GitHub Result

After `git fetch origin`:

| Item | Result |
| --- | --- |
| Local path | `D:\Jianlian-shop` |
| Branch | `main` |
| Local HEAD | `49061b1f3c37d3be353c5088b89516ea32263422` |
| origin/main | `779cf53f439ea5b3b4299a17b27231d4b0be210c` |
| Ahead / behind | local ahead by 3 commits |
| GitHub fetch | succeeded |

The working tree contains existing staged and unstaged changes from prior tasks. These must be reviewed before production deployment.

## Version Endpoints

Added or verified:

- `GET /api/health`
- `GET /api/health/readiness`
- `GET /api/admin/system/version`

`/api/admin/system/version` is admin-only and returns:

```json
{
  "version": {
    "application_version": "0.1.0",
    "commit_sha": "unknown",
    "short_commit_sha": "unknown",
    "branch": "unknown",
    "build_time": "unknown",
    "environment": "production"
  }
}
```

Actual values depend on production environment variables such as `APP_VERSION`, `GIT_COMMIT`, `GIT_BRANCH`, and `BUILD_TIME`.

## Health Endpoint Result

`/api/health/readiness` now includes:

- `environment`
- `version`
- `commit_sha`
- `build_time`
- `database_reachable`
- `database_schema_status`
- detailed component checks

The endpoint uses `Cache-Control: no-store`.

## Supabase Structure Check

Local migration files are present for:

- products/categories and multi-SKU
- orders and order payments
- account recharges and payment sessions
- balance transactions and reconciliation
- digital inventory and deliveries
- visitor analytics and system errors
- backup runs
- privacy/account controls
- order query tokens
- business ID search
- data consistency scans

No SQL was executed. Production Supabase must be checked manually by comparing applied migrations with the local migration list in `docs/environment-version-alignment.md`.

## Product Save and Multi-SKU Dependencies

The codebase depends on these schema areas for product saving and SKU features:

- `products`
- `categories`
- `product_option_groups`
- `product_option_values`
- `product_skus`
- `product_sku_values`
- `admin_audit_logs`

If any of these tables or policies are missing in Supabase, product editing or SKU management can fail even if the frontend builds.

## Server Manual Verification

Run on the server:

```bash
cd /www/jianlian-shop
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
git status --short --branch
pm2 describe jianlian-shop
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS https://www.jianlian.shop/api/health
```

Expected:

- Server commit equals the intended GitHub `main` commit.
- PM2 `cwd` is `/www/jianlian-shop`.
- PM2 app is `online`.
- Health endpoint returns JSON.
- Static assets are not blocked by middleware or Nginx.

## Found Issues

- Existing health readiness source contained garbled Chinese strings; the endpoint was normalized to stable ASCII operational messages.
- Local repo is ahead of GitHub and has a non-clean worktree. This is a deployment risk until reviewed and pushed.
- Production server and Supabase were not directly inspected in this task by design.

## Fixed Issues

- Added release metadata to health readiness output.
- Added admin-only version endpoint.
- Added manual deployment and rollback documentation.
- Added environment version alignment documentation.

## Remaining Manual Items

- Execute pending Supabase migrations manually after backup.
- Verify production server Git SHA and PM2 runtime.
- Verify `/_next/static` assets return 200 in production.
- Push local ahead commits to GitHub after review.

