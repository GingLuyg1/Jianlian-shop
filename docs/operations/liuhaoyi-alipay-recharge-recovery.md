# Liuhaoyi Alipay account recharge recovery watcher V2

This watcher is limited to Liuhaoyi `alipay` CNY account recharges. It does not scan store orders, WeChat, USDT, or another provider.

## Safety model

- Dry-run is the default.
- Execute mode requires both `--execute` and `LIUHAOYI_ALIPAY_WATCHER_EXECUTE_ENABLED=true`.
- The candidate must be pending, at least 60 seconds old, and not currently expired.
- The payment session, recharge, user, recharge number, amount, currency, provider trade number, and merchant trade number must match exactly.
- The recharge must not be credited or completed, and its completed ledger count must be zero.
- Provider `endtime`/`paidAt` is required and must be parseable. It may equal, but cannot exceed, either persisted expiry.
- Provider-paid cases that fail a safety check are recorded once using a reconciliation `dedupe_key` and require manual review.
- Automatic completion uses only `completePayment()` and the existing database locking/idempotency chain.

## Scheduling and bounds

The systemd timer runs once per minute with `Persistent=false`. Each scan processes at most four candidates: the newest three plus one rotating older backlog candidate. Provider queries are limited to six seconds, each item to eight seconds, and the service to 45 seconds.

Both systemd and direct manual watcher execution use:

`/run/lock/jianlian-liuhaoyi-alipay-recovery.lock`

The root-only environment file is `/etc/jianlian/liuhaoyi-alipay-recovery.env`. It must define the watcher enable flag, execute enable flag, local internal URL, internal reconciliation secret, Supabase URL, and Supabase service-role secret. Never print this file or place it in Git.

## Deployment note

Committing these files does not install or start the timer. Deployment, environment changes, channel enablement, and real payment testing require a separate Production-approved procedure. The existing `20260915210000_liuhaoyi_recharge_recovery_expiry_guards.sql` migration already supplies the required atomic/idempotent completion guard; V2 requires no new migration.
