项目执行原则：能由 Codex 自动完成的操作一律交给 Codex；仅在输入私密口令、必要授权或确实无法自动完成时要求用户操作，避免重复确认、反复测试和耗时等待。

# Account Security V1.1 — Issue #115

This follow-on Draft depends on auth PR114 at b4660299c1c2521933db3387fb93f75fd2cda8bd. Its PR base is the verified PR114 branch, not the older password-only main. Do not merge it ahead of #114, overwrite the original auth worktree or treat it as Production authorization.

## Embedded flow and provider contract

The existing account glass pane contains Email Security and Login Password sections. A bound email stays read-only until the user expands Change Email. No new page, account shell or login/register flow is introduced. First email binding and password change remain separate existing paths. Mobile uses one column; desktop can align email actions and the two proof cards.

Use Supabase updateUser(email) with Confirm email AND Secure email change enabled. Send is not success. Verify OTP type is email_change: current address with the current-address token, new address with the new-address token. The provider's first accepted proof can return no user/session and leave the original email unchanged; the second proof completes the same Auth identity. After every verification re-read the authoritative user, confirmed email and pending address, and check active/normal profile status. Reject conflicting/missing identity, pending address or profile. A returned foreign session is signed out only locally. Never use signInWithOtp, login/recovery token types, admin email_confirm, manual auth SQL, client metadata or UI step flags as ownership proof.

Official references checked 2026-11-07:

- https://supabase.com/docs/reference/javascript/auth-updateuser
- https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
- https://github.com/supabase/auth/blob/master/internal/api/verify.go

The provider may accept new proof first; that remains partial until the other proof succeeds. Refresh restores pending target from authenticated getUser, not a locally stored verification flag. Already used proof need not be replayed: the user can submit the remaining mailbox's token. Collapse only hides the UI and clears input; it does not revoke issued provider challenges. Do not label collapse as server cancellation. Resend delegates to provider email_change, rechecks pending identity, clears local code/progress and retains server throttling.

## Gates and state

NEXT_PUBLIC_SECURE_EMAIL_CHANGE_ENABLED defaults off. It is a rollout gate, NOT a replacement for Supabase's server-enforced double confirmation. Turn it on only after independently checking Confirm email, Secure email change, both templates, six-digit length, expiry, SMTP and real two-address Test acceptance. Never disable provider protections to make the UI pass. Do not reuse the Test flag as Production authorization.

The UI uses an immediate in-flight lock plus a 60-second send/resend cooldown; provider limits remain authoritative. Session storage holds only the account-scoped cooldown deadline, not addresses, codes, passwords, tokens or confirmed flags. Before each write/verify, validate the same account and allowed profile; a session switch disables the in-progress UI. Provider messages and payloads are never reflected in logs or errors. Code inputs are cleared after submission and collapse.

Test preview 3045 is for the email-change flow only. Existing Google E2E remains at its previously allowed 3040 callback; do not initiate new 3045 Google OAuth without separately validating its redirect allowlist. Unchanged Google/register flows reuse PR114 evidence, not an invented new E2E result. Google-linked change must retain provider identity IDs; a synthetic test alone cannot establish real provider behavior for a previously linked account.

## Validation and release boundary

Targeted actual-core tests cover two proofs, partial completion, new-first/resume, wrong/expired/replayed/misrouted codes, identity and pending drift, disabled/missing profile, auto-confirm misconfiguration, feature off, safe errors and foreign session. Actual-component 1440/390 synthetic scenarios cover collapsed layout, double-submit, cooldown, first binding, pending resume, session switch and linked-provider preservation. They are separate from real Test acceptance. Save real evidence without mailbox addresses, codes, payloads or tokens; prove original email before both confirmations, same UUID, final confirmed email, subsequent password login, persistence and unchanged business/identity fields.

Production remains untouched: no Migration, financial/order writes, supplier changes or deployment. Require #114's existing gates, this feature's real Test gates and separate Production Auth/config/code-release approval. Existing immutable release rollback restores the prior application and flag; it must not revert real user email records or overwrite the database. A successfully changed email is not automatically reverted. Preserve users, balances, invitations and Google identities.
