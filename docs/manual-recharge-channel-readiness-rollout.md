# Manual Recharge Channel Readiness Rollout

## Scope

This checklist covers the manual recharge channel readiness changes only:

- Admin payment-channel configuration
- Legacy/new payment channel field synchronization
- Safe public manual-payment instructions
- Manual recharge approval, rejection and idempotent credit handling
- Recharge review audit events
- Legacy `paid` to `succeeded` completion repair

It does not authorize database migrations, production writes, channel enablement,
real payment tests, recharge approval, balance credit, deployment or service restart.

## Current safety gates

- Automatic settlement remains disabled.
- All production recharge channels must remain disabled until separately approved.
- No real payment, review, credit or settlement operation is permitted during readiness checks.
- No production SQL or Migration may be executed under this checklist.
- No environment variable may be added, changed or printed.
- No branch merge, production deployment or PM2 restart is included.
- The feature branch must be retained until rollout and rollback validation are complete.

## Local verification

Required results before review:

- [ ] `git diff --check` reports no whitespace errors
- [ ] Focused manual recharge readiness tests pass
- [ ] Full `npm.cmd test` suite passes
- [ ] `npm.cmd run lint` completes without errors
- [ ] `npm.cmd run build` completes successfully
- [ ] No Migration or SQL file was added or modified
- [ ] No environment or credential file was added or modified
- [ ] No unexpected generated, temporary or build artifact is tracked

Verified locally for this review cycle:

- Production review-adapter behavior tests: 9 passed, 0 failed
- Recharge workflow tests: 24 passed, 0 failed
- Payment-channel readiness tests: 37 passed, 0 failed
- Source contract tests: 132 passed, 0 failed
- Combined focused tests: 202 passed, 0 failed
- Full `npm.cmd test` suite: 336 passed, 0 failed
- Typecheck: passed
- Lint: passed with existing warnings only
- Production build: passed with existing non-blocking dependency and rendering warnings

## Code review checks

### Payment-channel administration

- [ ] API reads both legacy and compatibility fields
- [ ] API writes synchronized values for:
  - `channel` and `code`
  - `min_amount` and `minimum_amount`
  - `provider_name` and `provider`
- [ ] Public responses never include `secret_config`
- [ ] Manual channels require a payment address and instructions
- [ ] USDT-BEP20 manual mode also requires a token contract
- [ ] An incomplete channel cannot be enabled
- [ ] Provider channels remain fail-closed when provider configuration is unavailable
- [ ] Legacy rows with only one of `provider` / `provider_name` remain disabled and read-only
- [ ] Public discovery and recharge creation fail closed for legacy compatibility rows
- [ ] Compatibility synchronization requires separate authorization and an `updated_at` match
- [ ] Compatibility synchronization leaves `configured=false` and `enabled=false`
- [ ] Compatibility synchronization has no ordinary UI entry point and is never called automatically
- [ ] The production `updated_at` trigger is confirmed separately with a read-only database check

### Public manual-payment information

- [ ] Only safe public fields are returned
- [ ] Payment address is displayed
- [ ] Token contract is displayed when configured
- [ ] Payment instructions are displayed when configured
- [ ] Currency and network warning is visible
- [ ] No secret, API key, signing key or internal configuration is exposed

### Recharge review and credit

- [ ] Approval requires a real transaction reference
- [ ] Every review transition uses the exact status read by that request as its CAS condition
- [ ] `approve` claims only `reviewing`; `retry_credit` claims only `approved` or `failed`
- [ ] Review intent event failure stops the state change and prevents the credit RPC call
- [ ] State updates check database errors and affected rows, then re-read after a zero-row CAS
- [ ] Balance credit continues to use `complete_account_recharge`
- [ ] Only `complete_account_recharge` provides atomic balance and ledger credit
- [ ] A successful credit RPC payload passes complete runtime validation before any result field is used
- [ ] Malformed or incomplete RPC payloads enter the unknown-outcome reconciliation path and never trigger an automatic second RPC call
- [ ] Application review status and review events are not one database transaction
- [ ] Successful RPC credit is never downgraded to `approved`
- [ ] Legacy database status `paid` is repaired to `succeeded` before a success event is written
- [ ] `completed_at` is written for the final workflow state
- [ ] A failed completion event never rolls back a successful state or triggers another RPC call
- [ ] Uncertain post-credit outcomes stop repeated action and require manual reconciliation of the recharge, balance transaction and account balance
- [ ] Repeated successful processing returns an idempotent result
- [ ] Review-event request-id de-duplication is best-effort because the current schema has no matching unique constraint
- [ ] Every write CAS treats a thrown request, network error or indeterminate response as a possibly committed write
- [ ] A write CAS transport failure performs at most one read-only reconciliation and never replays the UPDATE
- [ ] Reading `processing` after an uncertain claim never grants RPC ownership and never automatically invokes `complete_account_recharge`
- [ ] A `paid` repair CAS loser that observes `succeeded` returns idempotently and does not write a transition-success event
- [ ] A transport-unknown `paid` repair that observes `succeeded` remains uncertain and requires manual reconciliation

The review service must never claim that application status and audit events are
fully atomic. A durable intent event is written before a state CAS or credit
attempt. A completion-event failure after a successful state change is reported
as a partial success with a request ID; it is not converted into a normal
retryable failure.

A normal status CAS can have changed the database even when the caller receives
a network exception or no usable response. Such a write must not be retried
blindly. The service performs one read-only reconciliation; an unknown or
`processing` result remains `uncertain`, displays the diagnostic request ID and
requires manual reconciliation.

Approval is a multi-stage workflow:

1. change `reviewing` to `approved`;
2. claim credit processing by changing `approved` to `processing`;
3. invoke the atomic credit RPC;
4. confirm or repair the completed state.

If an earlier stage succeeds and a later stage fails, the result is
`partial_success` or `uncertain`, never a claim that nothing changed. If the
latest status is `processing` but it is unknown whether the RPC ran, an operator
must reconcile it manually. The administrator UI must show the request ID,
disable review/reject/retry writes and explicitly state that the operation must
not be repeated until the record, ledger and balance have been checked.

Only the request that wins the `paid` to `succeeded` CAS may write that
transition's `credit_succeeded` completion event. A concurrent CAS loser may
return an idempotent completed result after reading `succeeded`, but must not
write or claim the transition-success event.

A definite zero-row CAS and a transport-unknown CAS are different outcomes. If
the conditional UPDATE explicitly returns zero rows, this request is known not
to own the transition; a subsequent `succeeded` read may therefore be returned
as an idempotent completion without writing another success event. If the UPDATE
throws, the connection is interrupted or its response is lost, a later
`succeeded` read does not prove whether this request committed the transition.
That outcome remains `uncertain`, retains the diagnostic request ID and requires
manual comparison of the recharge status and review events. The completion
audit may be missing. Do not insert a possibly duplicate `credit_succeeded`
event, repeat the completion repair, or invoke the credit RPC again.

Public recharge APIs return stable diagnostic codes, fixed safe messages and a
request ID. They must not return or log raw database messages, details, hints,
table/column/constraint names, payment credentials or complete recharge rows.
The public recharge `amount` contract accepts only a positive ordinary decimal
string with at most six fractional digits. Boolean values, JSON numbers, blank
strings, hexadecimal notation, scientific notation and ambiguous forms such as
`.5`, `5.` or `+10` are rejected before the payment-channel query. Channel
minimum and maximum amount checks still apply after parsing.

The `complete_account_recharge` success payload is not trusted solely because
`ok` is true. `alreadyCompleted`, `rechargeNo` and `transactionNo` must match
the runtime contract before they may be used in completion audit metadata. A
malformed payload is an unknown RPC outcome: perform only the existing
read-only status reconciliation, never retry the RPC automatically, never
write an ordinary `credit_failed` transition and never downgrade a completed
recharge.

If the credit RPC may have completed but the result cannot be confirmed, do not
click retry. Reconcile all three records first:

1. `account_recharges` status and credited fields;
2. the matching `balance_transactions` ledger entry;
3. the user's profile/account balance.

Administrator review authorization and service-role balance-credit authority
remain separate. An administrator request may ask the trusted service to credit,
but browser or authenticated clients never receive direct balance-write access.

## Read-only production precheck

Run only after merge and deployment have been separately authorized.

Permitted checks:

- Confirm the intended release commit and branch
- Confirm the production domain traffic target
- Confirm PM2 process name and current release path
- Confirm application readiness endpoints respond
- Confirm the payment-channel table is readable
- Confirm enabled recharge channel count remains zero
- Confirm no enabled channel is incomplete
- Confirm public channel output contains no secret configuration
- Confirm administrator pages load without issuing PATCH requests
- Confirm logs contain no new payment-channel or recharge-review exceptions

Prohibited during precheck:

- Enabling any payment channel
- Saving production payment-channel settings
- Creating a recharge request
- Uploading payment proof
- Starting review
- Approving or rejecting a recharge
- Retrying credit
- Calling settlement RPCs
- Updating balances
- Running SQL or migrations
- Changing production environment variables
- Restarting PM2
- Removing releases or branches

## Future controlled rollout gates

Each gate requires separate explicit authorization.

1. Merge feature branch
2. Build a new immutable release
3. Deploy without enabling recharge channels
4. Run read-only production smoke checks
5. Review one proposed manual channel configuration
6. Save configuration while keeping the channel disabled
7. Verify safe public output while still disabled
8. Separately authorize enabling one manual channel
9. Separately authorize creation of one controlled test recharge
10. Separately authorize payment-proof or transaction-information submission
11. Separately authorize administrator review
12. Separately authorize balance credit
13. Separately authorize the post-credit read-only reconciliation

Do not combine these gates into one authorization.

Compatibility synchronization is not authorization to configure or enable a channel.
There is no ordinary compatibility-sync control in the current UI. Do not construct
or send a compatibility-sync request without separate explicit authorization.
The compatibility UPDATE and its audit-log write are not one database transaction.
Until that residual audit risk is resolved or explicitly accepted, compatibility
synchronization must not be used in production. An audit failure must never trigger
an automatic retry of the conditional UPDATE.
Before production use, separately confirm with a read-only catalog check that the
`payment_channels` `updated_at` trigger exists and is enabled; source code alone is
not evidence that the production database has executed the trigger Migration.
This readiness work does not authorize a BEP20 Migration, repair SQL, any other SQL,
or a production compatibility write.

## Rollback considerations

- Retain the feature branch.
- Retain the current and rollback production releases.
- Do not delete any release before production verification is complete.
- Application rollback alone may not reverse payment-channel data saved after deployment.
- Disable the affected channel before application rollback when channel state is uncertain.
- Never repeat credit solely because the UI or final status update failed.
- Reconcile the recharge record, balance transaction and profile balance before any retry.

## Completion record

Record the following after every authorized stage:

- Commit SHA
- Release path
- Deployment time
- Operator
- Exact authorized action
- Read-only verification results
- Enabled channel count
- Unexpected errors
- Rollback decision
