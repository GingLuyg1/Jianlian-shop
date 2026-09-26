# Liuhaoyi Alipay account recharge recovery watcher V2

This watcher is limited to Liuhaoyi `alipay` CNY account recharges. It does not scan store orders, WeChat, USDT, or another provider.

## Safety model

- Dry-run is the default.
- Execute mode requires both `--execute` and `LIUHAOYI_ALIPAY_WATCHER_EXECUTE_ENABLED=true`.
- The candidate must be pending, at least 60 seconds old, and no more than 24 hours old. Expired sessions may be queried only so a payment that the provider proves occurred before expiry can be recovered.
- The payment session, recharge, user, recharge number, amount, currency, provider trade number, and merchant trade number must match exactly.
- The recharge must not be credited or completed, and its completed ledger count must be zero.
- Provider `endtime`/`paidAt` is required and is interpreted as China Standard Time (`UTC+08:00`). It may equal, but cannot exceed, either persisted expiry and cannot precede either persisted creation time.
- Processing time is not payment time. A trusted payment made before expiry may complete after expiry; a payment made after expiry, a missing timestamp, or an impossible timestamp fails closed for manual review.
- Provider-paid cases that fail a safety check are recorded once using a reconciliation `dedupe_key` and require manual review.
- Automatic completion uses only `completePayment()` and the existing database locking/idempotency chain.

## Scheduling and bounds

The systemd timer runs once per minute with `Persistent=false`. Each scan processes at most four candidates: the newest three plus one rotating older backlog candidate. Provider queries are limited to six seconds, each item to eight seconds, and the service to 45 seconds.

Both systemd and direct manual watcher execution use:

`/run/lock/jianlian-liuhaoyi-alipay-recovery.lock`

The root-only environment file is `/etc/jianlian/liuhaoyi-alipay-recovery.env`. It must define `JIANLIAN_NODE_BINARY`, `JIANLIAN_RELEASE_DIR`, the watcher enable flag, execute enable flag, local internal URL, internal reconciliation secret, Supabase URL, and Supabase service-role secret. Never print this file or place it in Git.

## Execute and dry-run services

`jianlian-liuhaoyi-recovery.service` is the funds-execution path. It passes `--execute`, but execution still requires `LIUHAOYI_ALIPAY_WATCHER_EXECUTE_ENABLED=true` as the second gate.

`jianlian-liuhaoyi-alipay-recovery-dry-run.service` is for a single, manually approved Production observation and acceptance run. It uses the same root-only environment, release watcher script, lock, timeout, and systemd hardening as the execute service, but never passes `--execute`. Even when the watcher is enabled, this service remains dry-run only: it does not call `completePayment()` or automatically credit funds.

The dry-run unit has no `[Install]` section and no timer. Repository changes do not install, enable, or start it. Any future timer requires separate review and approval.

## Deployment note

Committing these files does not install or start the timer. Deployment, environment changes, channel enablement, and real payment testing require a separate Production-approved procedure. The forward migration `20260926130000_liuhaoyi_paid_before_expiry_completion.sql` preserves the atomic/idempotent completion chain while passing trusted provider payment time through both expiry guards. It does not update historical rows; do not rerun historical migrations.
