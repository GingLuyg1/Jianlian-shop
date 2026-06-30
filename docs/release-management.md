# Jianlian Shop Release Management

This document is the release checklist for Jianlian Shop. It does not contain secrets and does not replace manual production approval.

## Pre-release checks

Run these checks locally before pushing or deploying:

```bash
node scripts/pre-deploy-check.mjs
npm run typecheck
npm run build
```

Stop if any step fails.

## Required environment variable names

Do not print or commit values.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Payment provider secrets, only when a real provider is enabled

`SUPABASE_SERVICE_ROLE_KEY` must only be available on the server. It must never use a `NEXT_PUBLIC_` prefix.

## Release metadata

The app exposes safe release metadata in admin database status:

- release
- commit
- build time
- environment
- schema version

Recommended production environment variables:

```bash
APP_VERSION=0.1.0
GIT_COMMIT=<commit-sha>
BUILD_TIME=<UTC timestamp>
APP_ENV=production
```

## Manual deployment outline

Linux server example:

```bash
cd /www/jianlian-shop
git fetch origin
git reset --hard origin/main
npm ci
npm run build
pm2 restart jianlian-shop
pm2 save
nginx -t
systemctl reload nginx
curl -I https://www.jianlian.shop/
curl -I https://www.jianlian.shop/api/health
```

Stop if `npm run build`, `pm2 restart`, `nginx -t`, or health checks fail.

## Smoke tests

After deployment:

- Home page loads with CSS.
- Login and register pages load.
- Admin login works for the configured super admin.
- `/admin/system/database` loads.
- Product list reads Supabase data.
- Checkout page loads a real product.
- Orders page handles empty and non-empty data.
- Recharge page handles disabled channels without fake payment success.

## Rollback rule

If application deployment fails before database migrations are applied, roll back the app commit.

If database migrations were applied, do not blindly roll back application code. First confirm whether the previous app version can tolerate the new schema.
