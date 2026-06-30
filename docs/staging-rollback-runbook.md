# Staging Rollback Runbook

This runbook documents rollback steps. It must not be executed automatically from Codex.

## Before Deployment

Record the stable commit and process state:

```bash
cd /var/www/jianlian-shop
git rev-parse --short HEAD
pm2 status
curl -I http://127.0.0.1:3001/api/health
```

Write the stable commit into the deployment record with timestamp, operator, branch, and reason.

## Rollback Trigger

Rollback if any P0/P1 issue appears after deployment:

- build succeeded but PM2 app fails to start
- health check fails
- admin login inaccessible
- product/category public browse broken
- order creation broken
- payment status/session API returns fake or unsafe data
- user data isolation failure

## Rollback Steps

```bash
cd /var/www/jianlian-shop
FAULT_COMMIT=$(git rev-parse --short HEAD)
git fetch origin
git reset --hard <stable_commit>
npm ci
npm run build
pm2 startOrReload ecosystem.config.cjs --only jianlian-shop-staging --update-env
pm2 save
curl -I http://127.0.0.1:3001/api/health
curl -I http://127.0.0.1:3001/api/health/readiness
```

Do not automatically roll back database migrations. Prefer forward-fix compatibility migrations. If a migration caused the failure, pause writes, export affected tables, and decide manually.

## Post Rollback Checks

- Home page renders.
- Admin login works.
- Database connection works.
- Order create/status APIs respond.
- Payment readiness does not expose secrets.
- PM2 logs do not contain stack traces with secrets.
- Nginx config is unchanged unless explicitly approved.

## PM2 Recovery

If restart fails:

```bash
pm2 logs jianlian-shop-staging --lines 300
pm2 describe jianlian-shop-staging
pm2 restart jianlian-shop-staging --update-env
```

If the app still fails, keep Nginx pointing to the last healthy process or show a maintenance page configured outside this repository.

