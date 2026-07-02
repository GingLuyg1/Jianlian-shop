# Environment Version Alignment

## Local Git Check

Latest local check:

- Branch: `main`
- Local HEAD: `9a01e101304f4c9a0aac5d4f11fa8d255e006fd9`
- Cached `origin/main`: `c7c3a7a7c32020562a0ea9218bb9b5f8567489c8`
- Ahead/behind from cached refs: `0 behind / 1 ahead`
- Untracked local file: `.codex-dev.log`

`git fetch origin` was attempted for fresh GitHub verification but timed out after 124 seconds. Treat the cached `origin/main` SHA as stale until network access is restored and `git fetch origin` succeeds.

## Required Local Commands

Run locally before deployment:

```bash
git status --short --branch
git branch --show-current
git remote -v
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
git rev-list --left-right --count origin/main...HEAD
```

Rules:

- Do not auto merge.
- Do not auto rebase.
- Do not use `git reset --hard`.
- Do not force push.
- Do not commit `.env.local`, `.next`, `node_modules`, or local logs.

## Application Version Identifiers

The project already exposes safe release metadata through:

- Public health/readiness route: `/api/health/readiness`
- Admin version route: `/api/admin/system/version`
- Admin database schema route: `/api/admin/system/database`

Fields:

- `environment`
- `commit_sha`
- `build_time`
- `application_version`
- `database_schema_status`

Safety notes:

- Routes do not expose server filesystem paths.
- Routes do not expose environment variable values.
- Routes do not expose payment keys.
- Admin system endpoints require super-admin authentication.
- Missing Git metadata returns `unknown`.
- Database unavailable returns warning/blocked status instead of secrets.

## Server Manual Verification

Do not connect automatically. On the test or production server, run manually:

```bash
cd /www/jianlian-shop
git status
git branch --show-current
git log -1 --oneline
git rev-parse HEAD
pm2 describe jianlian-shop
pm2 logs jianlian-shop --lines 80
```

Confirm:

- Server SHA equals the intended GitHub `main` SHA.
- PM2 working directory is `/www/jianlian-shop`.
- PM2 command starts the built Next.js app.
- Application port is `3001` unless the server runbook explicitly says otherwise.
- Nginx proxy points to the same local application port.
- Server worktree is clean before pulling.

If the server worktree is dirty:

1. Stop deployment.
2. Record `git status --short`.
3. Back up changed files outside the project.
4. Ask for human confirmation before overwriting anything.

## Health Check Commands

After deployment:

```bash
curl -fsS http://127.0.0.1:3001/api/health/readiness
curl -fsS https://www.jianlian.shop/api/health/readiness
```

Admin-only checks:

- Open `/admin/system/database`.
- Open `/admin/system/project-status`.
- Open `/admin/system/production-readiness`.

Do not paste secrets or environment variable values into tickets or reports.

## P1 Version Risk

Current local `git fetch origin` could not refresh remote refs due network timeout. Before production deployment, repeat the fetch and SHA comparison from a network that can reach GitHub.
