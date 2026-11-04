项目执行原则：能由 Codex 自动完成的操作一律交给 Codex；仅在输入私密口令、必要授权或确实无法自动完成时要求用户操作，避免重复确认、反复测试和耗时等待。

# Order-driven scanner monitoring: independent release

This change does not activate itself when the application deploys. It does not
change scanner business logic, RPC budgets, provider configuration, matching,
crediting, database functions, existing manual-review alerts or timer cadence.
Its own PR must be reviewed and released separately from Bitrefill PR94.

## Observed production source

On 2026-11-04 the authenticated VNC read-only discovery returned:

- timer `/etc/systemd/system/jianlian-recharge-scanner.timer`: active; two minutes
  after unit inactivity; triggers `jianlian-recharge-scanner.service`;
- service `/etc/systemd/system/jianlian-recharge-scanner.service`;
- actual ExecStart script `/usr/local/sbin/jianlian-recharge-scan.mjs`;
- original UTF-8 file: 9255 bytes, SHA256
  `ecf076f403beeaf991977209fe46920ca09e32a3d4b7dc5005130f041f84f1bf`.

The original computes `max(finalizedBlock - toBlock, 0)` (lines 379–382), then
unconditionally emails category `scanner_block_lag` if above MAX_LAG_BLOCKS
(427–444), even in order-driven mode. A partial order scan can legitimately
leave a large global lag. Categories have a 60-minute default cooldown and
hour-derived email idempotency keys, allowing repeated alerts for one incident.

Only five pinned source edits are generated: import the repository monitor;
decorate the existing scanner fetch; route operational failure through the new
state machine; gate the old global-lag branch away from order-driven mode; and
report top-level runner failure. The old scanner POST options/secret, 160-second
HTTP timeout, result validation, exit behavior, legacy mode and
`scanner_manual_review` branch are retained. There is still ONE scanner POST.

## Decision and data boundaries

The monitor reads the same authoritative channel, uses ONLY
`lease_recharge_order_scan_v1(...,p_dry_run=true)`, and SELECTs scan control and
durable progress. It never calls lease release/apply, credit/match, balances,
budget reservation or provider RPCs. The same pre-scan eligible IDs are checked
after the existing scanner call, including completed windows. Merely disappearing
from a new eligible list is not treated as progress. No customer IDs or lease
tokens are persisted or emailed.

- Actual HTTP/provider/parse/snapshot failure: FAILURE.
- Three distinct successful, normally spaced two-minute cycles with eligible
  windows but no durable advancement: STALLED.
- Lease left past its five-minute expiry plus one two-minute grace, or a future
  expiry beyond five minutes plus grace: LEASE_STUCK. A normally bounded BUSY
  lease is observation-only and cannot produce a recovery.
- Durable advancement, including RESOURCE_BUDGET partial progress: HEALTHY.
- Empty eligible windows on a successful call: HEALTHY. HTTP200 alone with
  pending windows never recovers an existing incident.
- Global cursor/lag is not a monitoring input in order-driven mode.

HEALTHY→incident sends one exception notice. Changing failure subtype does not
start another incident. Only actual progress or no eligible windows recovers an
incident and sends one recovery notice. Sustained healthy state stays quiet.
Failed/uncertain mail sends are recorded before network I/O and are not blindly
resent; the safe journal summary reports uncertainty. This trades automatic mail
retry for avoiding repeated notifications. Investigate any monitor error/uncertain
notification in the journal; do not delete state to force resend.

State is separate from the old category cooldown file:
`/var/lib/jianlian/recharge-order-monitor/state-v1.json`, parent 0700/file 0600,
exclusive transaction lock and atomic fsynced replacement. Corrupt state, symlinks,
loose permissions or a held lock fail visibly; none is silently reset. Emails
contain only event time, mode, provider HOST and state/recovery text.

## Validation and release order

1. Run only the affected Node tests and synthetic Linux POSIX acceptance. Public
   CI uses synthetic data and fake fetch/Resend; never supply production secrets.
2. Freeze the independent PR HEAD. Recheck actual unit/timer/script identity;
   drift from the original SHA stops preparation. Do not guess a new source pin.
3. Place reviewed repository code in immutable
   `/www/ops/jianlian-order-monitor-<FULL_MONITOR_SHA>` without app env copies.
4. Prepare a new root-only candidate, without executing it:

   ```sh
   node scripts/ops/prepare-order-scan-monitor-runner.mjs \
     /usr/local/sbin/jianlian-recharge-scan.mjs \
     /root/jianlian-order-monitor-<FULL_MONITOR_SHA>.candidate.mjs \
     /www/ops/jianlian-order-monitor-<FULL_MONITOR_SHA>/scripts/ops/recharge-order-scan-monitor-production.mjs
   ```

   The CLI enforces the original source SHA, exclusive candidate creation and
   `node --check`; it does NOT install, execute the runner, edit units, restart
   services or send email. Save candidate SHA and compare the five exact edits.
5. Independent production release must additionally prove runtime/secret/mail
   configuration, read-only snapshots and old runner backup. Keep existing unit,
   timer, EnvironmentFile and scanner core configuration. Do not install the
   candidate while a service invocation is active. Under that release's scope,
   atomically replace only the verified runner and wait for natural timer cycles;
   do not manually POST or manufacture a fault/payment to test monitoring.
6. Prove normal progress/empty windows are quiet through safe journal/state
   observation. Never mark the production alert fix PASS from local tests alone.

Rollback only the saved runner bytes after verifying no active invocation; leave
database/application/provider/configuration and committed financial/progress data
unchanged. Retain new state and old emails as evidence. The old global-lag alert
can resume if rolling back; record that limitation. No full database rollback or
scanner business rollback is part of this monitor release.
