# Jianlian Shop Staging Deployment

This runbook prepares a staging deployment only. It does not execute database migrations, modify production Nginx/PM2/Crontab/firewall, or deploy the production domain.

## Required Environment Variables

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server-only required for protected backend operations:

- `SUPABASE_SERVICE_ROLE_KEY`

Server-only required for internal reconciliation jobs:

- `PAYMENT_RECONCILIATION_SECRET` or `INTERNAL_API_SECRET`

Optional or not yet connected:

- `NEXT_PUBLIC_SITE_URL`
- `PAYMENT_CALLBACK_SECRET`
- `ALIPAY_APP_ID`
- `WECHAT_MCH_ID`
- `BINANCE_PAY_PROVIDER_KEY`
- `USDT_TRC20_WALLET_ADDRESS`
- `USDT_BEP20_WALLET_ADDRESS`

Do not put service role keys, payment secrets, callback secrets, provider private keys, or reconciliation secrets in `NEXT_PUBLIC_*`.

## Windows Local Checks

```powershell
cd D:\Jianlian-shop
node scripts/staging-preflight.mjs
npm run typecheck
npm run build
git status --short --branch
```

## Linux Staging Deployment

Record the current stable commit before changing anything:

```bash
cd /var/www/jianlian-shop
git rev-parse --short HEAD
pm2 status
```

Deploy the latest `main`:

```bash
git fetch origin
git reset --hard origin/main
node scripts/staging-preflight.mjs
npm ci
npm run build
pm2 startOrReload ecosystem.config.cjs --only jianlian-shop-staging --update-env
pm2 save
pm2 status
curl -I http://127.0.0.1:3001/api/health
curl -I http://127.0.0.1:3001/api/health/readiness
nginx -t
systemctl reload nginx
```

Stop conditions:

- `node scripts/staging-preflight.mjs` reports any error.
- `npm ci` fails.
- `npm run build` fails.
- Health check returns non-2xx.
- Readiness reports missing critical database structure.

Do not restart the old PM2 process after a failed build. Keep the previous process running and investigate logs.

## PM2

Recommended staging app:

- app name: `jianlian-shop-staging`
- port: `3001`
- mode: `fork`
- instances: `1`
- command: `node_modules/next/dist/bin/next start -p 3001`

Log commands:

```bash
pm2 logs jianlian-shop-staging --lines 200
pm2 describe jianlian-shop-staging
pm2 monit
```

## Nginx Example

```nginx
server {
  listen 443 ssl http2;
  server_name staging.jianlian.shop;

  client_max_body_size 10m;

  location /_next/static/ {
    proxy_pass http://127.0.0.1:3001;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  location ~ ^/(account|admin|payment|checkout|order-success|api/payments/callback|api/internal)/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    add_header Cache-Control "no-store";
  }

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
  }
}
```

Validate manually:

```bash
nginx -t
systemctl reload nginx
```

