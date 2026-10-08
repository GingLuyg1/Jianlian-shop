# SNPAY reconciliation execute-gate rollout V1

This is a runbook, **not authorization**. Code/CI approval does not authorize any
Production edit, restart, query, completion, service start or timer enable.
Every operational stage below needs explicit scope/rollback approval. Never
re-query or complete the already-paid third WeChat canary. Never access the
protected alternate PM2 tree. Main PM2 is exclusively `/root/.pm2`.

## Runtime chain and gate matrix

Timer -> root oneshot -> flock -> exact-release Node CLI -> `@next/env` -> REST
authenticated no-I/O gate GET -> candidate scan -> authenticated loopback POST -> app route -> reconciliation
service -> pinned SNPAY adapter -> verified evidence -> canonical
`completePayment(source: reconciliation)` -> `complete_payment_session` -> atomic
recharge/ledger/balance. No direct balance SQL, status resurrection or expiry edit.

| Gate | Missing / false / invalid | Literal `true` |
| --- | --- | --- |
| worker `SNPAY_RECONCILIATION_ENABLED` | zero network, disabled | permits scan |
| worker `SNPAY_RECONCILIATION_EXECUTE_ENABLED` + `--execute` | flag denied = zero network; **no flag = querying dry-run**, never completion | execute dispatch |
| app `SNPAY_RECONCILIATION_EXECUTE_ENABLED` | execute POST rejected 403 before service/query | permits authenticated execute |
| `PAYMENT_RECONCILIATION_SECRET` | absent/empty -> fail closed unless absent primary has fallback | matching authenticated request only; not an execution switch |
| `INTERNAL_API_SECRET` | fallback **only when primary is nullish**, empty primary does not fall back | same authentication role |
| `INTERNAL_JOB_SECRET` | **not** a reconciliation auth alias | no effect here |
| candidate / verified evidence / canonical RPC | reject excluded, mismatched, late or untrusted payment | completion only when all rules hold |

Only exact string `true` enables a boolean gate. `TRUE`, `1`, `no`, whitespace,
typos and missing values never enable. Gate environment is server-only, never
`NEXT_PUBLIC_*`; headers/body cannot enable the app gate. Body `execute=false`
is an explicitly authenticated, real-query dry-run even with app execute off.
Disabled CLI is different: it performs **zero** network calls. Public channels
control creation, not pinned historical recovery; no operation here opens them.

### Why Stage 3 was blocked

The worker and Next app are separate processes. `/etc/jianlian/snpay-reconciliation.env`
is read by systemd at service start, not by the PM2 app. The route reads the app's
`process.env.SNPAY_RECONCILIATION_EXECUTE_ENABLED` on **each request**; the service
also checks it before execution. Next `dynamic = force-dynamic` and the absence
of `next.config.js env` mappings keep this non-public variable runtime-bound,
not build-time inlined. Next loads production env at process startup; `@next/env`
caches loads within a process and existing process env wins over dotenv files.
Editing a persistent file cannot modify an already-running process. A controlled
PM2 restart/recreation is required; an ordinary restart without `--update-env`
is not proof that an inherited PM2 gate changed.

`ecosystem.production.config.cjs` sets NODE_ENV/PORT but not this gate. Release
switch uses delete/start with the caller environment and release dotenv, then
saves PM2. `pm2 save` persists a process definition; it does not update dotenv or
systemd and does not make future fresh release starts inherit the desired gate.
The authenticated **GET** on the existing internal reconciliation endpoint
returns only `{executeEnabled: boolean}` with no-store: authoritative app-runtime
evidence, no candidate reads/query/completion. Worker checks it before any scan.
Wrong/missing credentials, old-route405, malformed probe or a closed execute
gate prevent sensitive candidate reads. Authenticated dry-run accepts a false
app gate but still never completes. Readiness GET has a distinct authenticated
6/min budget, separate from SNPAY POST's 4/min budget. Generic internal jobs
retain their existing 3/5min limit. This avoids probes consuming write admission
and aligns four-candidate batches with the conservative minute cadence.
Old releases without GET are `unknown`, **not** ready.

## Architecture decision

Recommend **A: explicitly managed persistent app gate + controlled PM2 restart,
with worker master/execute gates closed until single-run acceptance**. In steady
state app gate may remain true only while authorized reconciliation is enabled;
disable both worker gates and timer before maintenance/deploy/rollback. Preserve
all existing auth, evidence and RPC insurance. No new dynamic config framework.

| Option | Safety / operational trade-off |
| --- | --- |
| A (recommended) | explicit persistent state, authenticated runtime proof, controllable restart; drift must be audited |
| B (app permanently true) | simpler restart count but weaker independent emergency boundary; auth replay can execute while worker is off |
| C (dynamic runtime config) | avoids restart but introduces cache/ACL/config races and a new execution control plane; unnecessary |
| D (bypass app/use helper credit) | rejected: evades reviewed gates and formal worker acceptance |

## Stage A — read-only readiness

After this PR is reviewed/merged/deployed under separate authorization, run from
the exact active release. Before then the GET/tool availability is a blocker.

```sh
EXPECTED_SHA='<approved exact deployed SHA>'
ACTIVE_RELEASE="/www/releases/jianlian-shop-$EXPECTED_SHA"
PM2_HOME=/root/.pm2 pm2 pid jianlian-shop
/usr/bin/node "$ACTIVE_RELEASE/scripts/ops/snpay-reconciliation-readiness.mjs"
systemctl show jianlian-snpay-reconciliation.service -p ActiveState -p Result
systemctl is-enabled jianlian-snpay-reconciliation.timer
systemctl is-active jianlian-snpay-reconciliation.timer
```

Tool is root/Linux only, refuses absent PM2 daemon (no daemon bootstrap), uses
controlled PM2_HOME, reads root-only worker config, performs authenticated GET,
public channels/health GET and canonical channel SELECT. No provider endpoints,
POST, completion, env writes or runtime changes. It returns nonzero unless all
gates, live identity, unit equality, credentials, channels and idle timer match.
Before enabling gates a `READY_FOR_EXECUTE=no` is expected, not an instruction
to bypass checks. Unknown/401/403/405/timeout never becomes true. Redact PM2 jlist
and never print it: it may contain credentials. No secret in argv or curl headers.

Before Stage D: exact candidate-policy **DB-only** prescan (24h lookback, >=60s
old, pending/processing cadence60s, expired cadence300s, batch<=4). Validate parent
ownership/frozen amount/expiry, unique sibling, no credited ledger, no manual
special handling. Exclude failed/closed/paid, completed third canary and ambiguous
contexts. Capture root-only before snapshot: counts, candidate fields/balances/
ledger and completed third-canary baseline. Do not fabricate an order if empty.
Empty successful service is plumbing-only, not proof of paid execute E2E.

## Stage B — app gate enable (separate maintenance approval)

Keep timer disabled/inactive and both worker gates false. Use an interactive
root editor; never emit full env files or source them into a traced shell.
Confirm canonical env source `/www/jianlian-shop/.env.local` and exact active
release `.env.production.local` match. Backups must be root-only0600 in an
approved secret-storage path, never repo tracked/public paths. Set **only**
`SNPAY_RECONCILIATION_EXECUTE_ENABLED=true` in both under explicit env-maintenance
authorization; preserve all other bytes. No worker config change yet.

```sh
sudoedit /www/jianlian-shop/.env.local
sudoedit "$ACTIVE_RELEASE/.env.production.local"
```

This intentionally changes untracked release configuration, not tracked code.
It invalidates that release's env-hashed prepared/ready markers. Never rewrite
marker hashes or pretend old acceptance remains valid. Do not switch a release
with stale markers; future candidate must be freshly prepared/smoked with its
approved env. If immutable-release policy forbids this maintenance, STOP and
approve an explicit new-release/config plan instead. No new build is required
solely to evaluate this runtime variable, but existing release checks still apply.

## Stage C — controlled PM2 restart and runtime proof

Record exact PID/cwd/script/restart count first. Recheck no unexpected inherited
env drift. Explicitly set the non-secret gate and use `--update-env`; do not
delete app, change cwd, dump credentials or trust persistent dotenv alone.

```sh
SNPAY_RECONCILIATION_EXECUTE_ENABLED=true PM2_HOME=/root/.pm2 \
  pm2 restart jianlian-shop --update-env
/usr/bin/node "$ACTIVE_RELEASE/scripts/ops/snpay-reconciliation-readiness.mjs"
```

Verify app runtime `APP_GATE=true`, exact cwd/script/proc cwd, online and local/
public health200, recharge page and unchanged closed channels. Save PM2 only
after these checks with separate save authorization. If failed, keep worker
false/timer disabled, restore prior approved env + explicit false restart, inspect
health; no DB reversal or canary reprocessing. Expected availability interruption
is documented, not called zero-downtime.

## Stage D — exactly one formal oneshot

Requires fresh DB-only prescan/snapshots and separate query/completion approval.
Use root-only dedicated config editing to set these two non-secret worker values
to true: `SNPAY_RECONCILIATION_ENABLED`, `SNPAY_RECONCILIATION_EXECUTE_ENABLED`.
Do not add secrets to unit. Ensure `JIANLIAN_RELEASE_DIR` equals active release,
`JIANLIAN_NODE_PATH=/usr/bin/node`, internal base `http://127.0.0.1:3001`.
Re-read root:root0600 permissions and readiness; timer must be disabled/inactive.

```sh
sudoedit /etc/jianlian/snpay-reconciliation.env
/usr/bin/node "$ACTIVE_RELEASE/scripts/ops/snpay-reconciliation-readiness.mjs"
# Once only, and only if READY_FOR_EXECUTE=yes plus approved prescan passes:
systemctl start jianlian-snpay-reconciliation.service
systemctl show jianlian-snpay-reconciliation.service \
  -p Result -p ExecMainStatus -p ActiveState -p SubState -p InvocationID
```

Use a root-only server-local controller with finally cleanup, or a responsible
operator who will complete cleanup despite SSH interruption. Record invocation
ID/attempt **before** start; never retry after lost stdout. Whether success/fail,
restore both worker gates=false immediately after this one invocation. Env file
is read on next start; editing it does **not** change an in-flight process.
Raw journal may contain operational evidence: parse aggregate summary only, do
not indiscriminately print secret-bearing logs. No manual query/completion.

## Stage E — post-execute acceptance

Match journal to InvocationID; require Result=success/ExecMainStatus0 and
inactive/dead, heartbeat/logs intact. Report actual scanned/query/paid/unpaid/error
counts. Existing aggregate `completed` counts successes; do **not** invent exact
completion-attempt/failure counts when journal/evidence cannot distinguish them.
Read per-candidate reconciliation evidence and before/after business snapshots.
Only verified paid-before-both-original-expiries canonical completion is legal:
>=both created_at, <=now+5min, signature/timestamp/identity/merchant/order/amount/
currency/type all match. Missing/late/untrusted time, mismatches, failed/closed
and query errors never credit. After legal completion: exactly one ledger, exact
principal balance delta, provider identity unique, no external 3% fee credit.
Do not run worker again to test idempotency. Third canary remains unchanged.
Classify `last_synced_at` claim + deduped reconciliation evidence separately from
money/status writes; execute on unpaid may create observability rows, so total
row equality is **not** the definition of zero business mutation.

## Stage F/G — timer enable and first invocation (new authorization)

Only after Stage E and explicit steady-state approval: enable worker gates,
verify app gate/live/unit/env agreement and accepted candidates, then:

```sh
systemctl enable --now jianlian-snpay-reconciliation.timer
systemctl list-timers jianlian-snpay-reconciliation.timer
```

Observe first scheduled InvocationID with the same evidence/accounting checks.
No channels are opened. Failed acceptance invokes emergency disable, not another
manual start. Application deployment does not install/enable these units.

## Stage H — steady-state

Timer OnBoot90s, OnUnitInactive60s, jitter10s, Accuracy5s. No Persistent=true
(default false); no missed-calendar catch-up. Type oneshot/no Restart, timeout50s,
worker budget45s, per-query7s/internal10s, serial max4 dispatches, stop at2 errors.
Two-page/cursor progression defeats first-N starvation; max160 inspected/turn.
Heartbeat persists last success and distinguishes empty/no-progress/failure.
Service activity + flock prevent overlap; DB CAS claims and canonical RPC protect
worker/worker and worker/callback races. Monitor missing/stale heartbeat, query
timeouts, repeated no_progress, manual_review, release drift and ledger anomalies.
An inactive oneshot is normal; it alone is not proof of success.

## Stage I — emergency disable

```sh
systemctl disable --now jianlian-snpay-reconciliation.timer
systemctl stop jianlian-snpay-reconciliation.service
sudoedit /etc/jianlian/snpay-reconciliation.env
# Restore both worker gates=false, root:root0600; verify disabled/inactive.
```

Fastest action disables future timer invocations. It does not cancel the running
service: stopping it is separate. Killing worker does not cancel a request already
accepted by Next or an RPC already in PostgreSQL. Close persistent/release app
gate and use controlled explicit false PM2 restart under incident authorization
if app-side isolation is needed. Already committed transactions cannot be undone
by any gate/restart/rollback. Inspect in-flight outcomes/ledger after shutdown;
never reverse balances manually, delete evidence, promise instant transaction
cancellation, or damage/delete PM2 configuration.

## Stage J — future deploy/rollback contract

The unit does not hardcode the SHA: it expands `JIANLIAN_RELEASE_DIR` from the
dedicated env. That env **currently pins ef263f**; app switch does not update it.
Hence a later deploy/rollback can leave old worker code talking to a new app.
Recommend explicit pinned env update while timer is stopped, not symlink/dynamic
launcher and not automatic release-script installation. Audit unit byte equality
against new release; copy audited units + daemon-reload **only with authorization
if unit content changed**. Env-only edits need no daemon-reload, next start reads
them. Node stays explicit non-home `/usr/bin/node` for ProtectHome=true.

For every deploy/rollback: disable timer -> close worker gates -> drain/inventory
in-flight service/app requests -> approve app env -> prepare/smoke -> exact switch
-> verify app gate/cwd/health -> pin worker env to same SHA -> re-audit units ->
fresh prescan + single execute acceptance -> separately authorize timer resume.
Explicit approved gate must accompany delete/start invocation, e.g.:

```sh
SNPAY_RECONCILIATION_EXECUTE_ENABLED=false PM2_HOME=/root/.pm2 \
  bash /www/jianlian-shop/scripts/production-release.sh switch "$EXPECTED_SHA"
```

Use false for rollback by default, reauthorize enable only after compatibility
review; do not blindly resume old worker. Persistent/target dotenv and hashed
release markers must still match release workflow. Do not assume PM2 save carries
gate across fresh start. Keep worker gates closed if app probe, unit match, env
consistency, RPC compatibility or channels is unknown.

## Node compatibility

package.json has no engines pin; Next13.5.1 loads on supported Node>=16.14.
App/build previously Node20.20.2, worker `/usr/bin/node`22.22.3. Worker is ESM,
uses fetch/AbortSignal.timeout, RSA SHA256/PKCS1v1.5, Next env loader; both Node20
and22 provide these APIs. Worker calls TS service through the compiled Next app,
not by trying to execute TypeScript in Node22. CI tests both majors; isolated SQL
matrix uses real PostgreSQL with RSA mock transport (no real Provider). Keep
explicit `/usr/bin/node` while its version is audited; do not change Production
Node during this task. Runtime warnings/lockfile changes require independent review.

## Development evidence (2026-10-09, not Production activation)

- Exact base: `ef263f9122bf884bc9d1718bb2a892addd9b27ab`.
- Gate/admission/readiness + reconciliation tests: 56/56.
- Payment regressions: 450/450; release regression/contracts: 25/25.
- Node20.20.2 and Node22.22.3 targeted RSA/gate/release suites: 150/150 each.
- Typecheck and local build passed. Initial sandbox build could not fetch public
  Google Fonts; retry with authorized public network access passed, no code workaround.
- Full Windows suite: 1251/1258. Existing failures reproduced in untouched base
  worktree: one Daju snapshot formatting contract + six migration-runner platform
  tests. Do not label this full local suite PASS or change unrelated contracts.
- Fresh isolated native PostgreSQL: fail-closed, pending/processing/expired
  exactly-once, RSA-to-worker-to-route-to-RPC chain, evidence dedupe, worker/worker
  and worker/callback races (10 rounds each) passed; mock Provider transport only.
- Production read-only: active ef263f, both worker gates false, app gate missing
  (disabled), timer disabled/inactive, service inactive, channels closed except
  USDT, business counts35/26/20, completed third canary unchanged.
- Actual GitHub exact-commit Actions conclusion must be recorded separately;
  neither the above nor a push is CI/Production activation approval.
