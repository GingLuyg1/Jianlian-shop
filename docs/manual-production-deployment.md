# Manual Production Deployment

This runbook is intentionally manual. It does not execute SQL, deploy code, restart PM2, or edit Nginx automatically.

## Safe Deployment Order

1. Local tests pass.
2. Push reviewed code to GitHub `main`.
3. Back up the production database.
4. Manually execute required migrations in Supabase SQL Editor.
5. Verify database structure and RLS.
6. Back up the server code directory or record current commit.
7. Pull code with fast-forward only.
8. Install dependencies with lockfile.
9. Build.
10. Restart PM2 only after build passes.
11. Run health checks.
12. Run core page smoke tests.

## Local Preflight

```bash
git status --short --branch
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
npm.cmd run typecheck
npm.cmd run build
```

Stop if:

- Local branch is not `main`.
- Local code is behind `origin/main`.
- Required migration is not reviewed.
- TypeScript or build fails.
- `.env.local`, `.next`, or `node_modules` appears in staged files.

## Database Sequence

Before server deployment:

1. Export a Supabase backup.
2. Pause risky writes if possible.
3. Execute pending migrations manually in recommended order from `docs/database-schema-verification.md`.
4. Run the manual schema checks from that same document.
5. Confirm RLS is enabled on private tables.

Do not auto-run migrations from the app server.

## Server Commands

Run manually on the server:

```bash
cd /www/jianlian-shop
git status
git branch --show-current
git log -1 --oneline
git rev-parse HEAD
```

Record the stable commit:

```bash
OLD_SHA=$(git rev-parse HEAD)
echo "$OLD_SHA"
```

Deploy code:

```bash
git fetch origin
git pull --ff-only origin main
npm ci
npm run build
pm2 restart jianlian-shop --update-env
pm2 save
pm2 status
```

Nginx checks:

```bash
nginx -t
systemctl reload nginx
```

Only reload Nginx if configuration changed or certificate/proxy changes require it.

## Health Checks

```bash
curl -I http://127.0.0.1:3001
curl -fsS http://127.0.0.1:3001/api/health/readiness
curl -I https://www.jianlian.shop
curl -fsS https://www.jianlian.shop/api/health/readiness
```

Smoke test:

- Home page
- Product category page
- Product detail page
- Login
- Account orders page
- Admin login
- Admin products page
- Admin orders page
- Admin system database page

## Rollback Steps

Code rollback:

```bash
cd /www/jianlian-shop
git status
git rev-parse HEAD
git checkout <OLD_SHA>
npm ci
npm run build
pm2 restart jianlian-shop --update-env
pm2 save
curl -fsS http://127.0.0.1:3001/api/health/readiness
```

Database rollback principle:

- Prefer forward-fix compatibility migrations.
- Do not drop production tables.
- Do not delete order, payment, balance, inventory, delivery, or audit data.
- If a migration caused data corruption risk, pause writes and restore from a verified backup after human approval.

## Environment File Safety

- `.env.local` must remain server-local.
- Git pull must not overwrite production secrets.
- Do not print environment variable values.
- Do not put service role, payment secrets, reconciliation secrets, or webhook secrets in `NEXT_PUBLIC_*`.

## Stop Conditions

Stop and roll back or hold release if:

- Build fails.
- Health readiness is unhealthy.
- Admin database page reports blocked schema.
- Product save fails.
- Public product pages are unavailable.
- Users can access other users' data.
- Payment or balance endpoints return unsafe states.
