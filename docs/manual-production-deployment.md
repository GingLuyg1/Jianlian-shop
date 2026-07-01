# Jianlian Shop Manual Production Deployment

Last updated: 2026-06-30

This runbook is manual by design. Do not run it automatically from Codex.

## Pre-deployment Checks

Local Windows:

```powershell
cd D:\Jianlian-shop
git fetch origin
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
npm run typecheck
npm run build
```

GitHub:

- Confirm `main` contains the intended commit.
- Confirm CI checks, if present, passed.
- Confirm no `.env.local`, `.next`, logs, or cache files were committed.

Supabase:

- Confirm pending migration files and execution order.
- Confirm no destructive SQL is scheduled without backup.
- Confirm service role keys are not exposed in frontend environment variables.

## Deployment Steps

Linux server:

```bash
cd /www/jianlian-shop
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
git status --short --branch
```

If the server has local changes, stop and inspect them before continuing.

Deploy intended `main`:

```bash
cd /www/jianlian-shop
git reset --hard origin/main
npm ci
npm run build
pm2 restart jianlian-shop
pm2 save
```

Only reload Nginx after validating the config:

```bash
nginx -t
systemctl reload nginx
```

## Version and Health Verification

```bash
cd /www/jianlian-shop
git rev-parse HEAD
pm2 describe jianlian-shop
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:3001/api/health/readiness
curl -I https://www.jianlian.shop/
curl -I https://www.jianlian.shop/_next/static/chunks/webpack.js
```

If the exact webpack filename differs, copy a real asset URL from the rendered HTML or browser console.

Expected:

- PM2 app is online.
- App listens on port `3001`.
- Health endpoint returns JSON, not HTML.
- Static assets return 200 and correct JavaScript/CSS content types.
- Homepage, product page, checkout page, `/admin`, and `/admin/orders` render without white screen.

## Rollback

Record the current commit before rollback:

```bash
cd /www/jianlian-shop
git rev-parse HEAD
```

Rollback to a known stable commit:

```bash
cd /www/jianlian-shop
git reset --hard <stable_commit_sha>
npm ci
npm run build
pm2 restart jianlian-shop
pm2 save
```

Do not roll back database migrations blindly. If schema changes were applied, verify whether the old code is compatible with the current schema before switching traffic.

## Stop Conditions

Stop and do not restart production if:

- `npm ci` changes dependency versions unexpectedly.
- `npm run build` fails.
- PM2 restarts repeatedly.
- `/api/health` is `unhealthy`.
- Nginx config test fails.
- Supabase tables required by the release are missing.
- Static assets return 400/404/502.

