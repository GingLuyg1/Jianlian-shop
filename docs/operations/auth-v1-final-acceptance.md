项目执行原则：能由 Codex 自动完成的操作一律交给 Codex；仅在输入私密口令、必要授权或确实无法自动完成时要求用户操作，避免重复确认、反复测试和耗时等待。

# Auth V1 final acceptance — Issue #109

This auth-only change starts from deployed main 55025ea7150b0791c5c8654eb4581b8f667fe40e. It preserves the original uncommitted registration and first-binding implementation. The old passwordless Draft #105 is not merged. UI #112 and business-number Draft #113 remain separate.

## Behavior

- Email/password login; no passwordless email login entry.
- Password registration requires signup confirmation using six digits and type signup. Reject an automatic pre-confirmation session, a mismatched identity, or unconfirmed user. Errors after verification sign out. Original registration layout remains intact.
- Refreshing the registration tab can restore bounded, one-hour pending identity progress from sessionStorage. It contains no password, OTP or token and grants no session; the real signup OTP and matching confirmed user are still required. Corrupt/expired/extra-field progress is rejected and successful confirmation clears it.
- First email binding rechecks the authenticated account before send and verification, then verifies email_change and the same account's confirmed address. Existing email remains display-only.
- Profile reads fail closed; disabled/blocked users sign out before navigation. Roles and financial authorization never come from user_metadata.
- Google starts through a same-origin, size/rate-limited endpoint using the existing Supabase PKCE identity store. Retain loopback ports and approved first-party origins; existing internal redirect checks remain effective.
- Invited Google registration uses a ten-minute signed HttpOnly SameSite=Lax intent and a unique callback nonce. Only an Auth-server account creation time after the intent qualifies for the existing referral RPC. A recently created returning account cannot retroactively bind. Corrupt, expired or cross-flow state fails closed, and the callback clears intent.

## Test configuration and evidence

Test project only: czuoivbfxzachiobdohw. Reuse existing SMTP and signup/email-change code templates; Confirm email remains enabled. Google Provider was configured via protected native clipboard transfer, without reading the clipboard into logs or tool parameters; clipboard cleared afterward. A dedicated free Google Test project and Web client were created. The upstream callback is https://czuoivbfxzachiobdohw.supabase.co/auth/v1/callback. Application remains Testing, with no public publication or billing resource enabled.

Local preview uses http://localhost:3040. Its Test additional redirect pattern is http://localhost:3040/auth/callback** to retain encoded next and flow nonce under this controlled local callback. Existing Site URL and other redirects are preserved. Production redirect configuration is unchanged.

AUTH_OAUTH_INTENT_SECRET is a server-only random signing key, at least 32 characters. It must never be public, committed or printed. Test preview generates it in process memory. Missing configuration stops invited signup before OAuth starts. Rotation invalidates pending intent, not users.

Read-only Test schema checks found no referrals table, ensure_my_referral_code, generate_unique_referral_code, or bind_referrer_by_code; there is no existing email-less phone test account. Real invitation and first-binding E2E remain gated on legitimate Test dependencies. Do not replay old Production migrations or fabricate authenticated tokens to hide these gaps.

29 targeted tests pass. Ten browser scenarios execute actual React components with a synthetic provider and no external/write requests. They cover terms, confirmation-before-access, invalid/expired code, resend, confirmation success, restricted login, first binding, existing-email display, identity mismatch and desktop/mobile layout. These are synthetic evidence, not real SMTP/Google/database E2E. Exact real receipts and CI are recorded separately.

Three additional pending-progress tests pass. Real SMTP acceptance found Test Email OTP length was eight while the page accepts six; only the Test setting was corrected to six, keeping expiration 3600 seconds and email confirmation enabled. The same pending identity then confirmed successfully, with no additional signup. Real confirmation-before-session, confirmation, refresh persistence, used/wrong-code rejection, password login, duplicate registration, existing-email display-only and disabled-profile sign-out passed. The original controller lost its process-only signup password, so password login uses a separately prepared password on this same newly created, owned Test fixture; it is protected with CurrentUser DPAPI and is not claimed as validation of the lost original password. The temporary disabled status was restored to active/normal. No older or Production user was modified. Google actual user consent/callback and legitimate first-binding/invitation fixtures remain separate real gates.

## Production plan — not authorized by this document

1. Require real Test SMTP confirmation, password login, legitimate first-binding/invitation fixtures, Google new/returning identity, callback persistence and restrictions. Do not substitute CI or synthetic results.
2. Review exact auth-only diff, live SHA and complete rollback release. Preserve UI, Daju, USDT, payment, supplier permissions and all existing users/data.
3. Obtain separate Auth configuration/code-release authorization. Validate Production SMTP/templates/Confirm email, dedicated Google client, approved callback paths and server-only signing key. Keep Google entry off until provider verification passes; never reuse Test configuration as Production approval.
4. Follow existing preflight, prepare, isolated 3002 smoke and switch. Verify owned-account registration, old password login, callback cookies and no financial writes.
5. On failure, disable only the newly enabled Google entry, restore the exact prior application release and recorded Auth configuration as appropriate. Preserve confirmed users; never reset users/balances/orders or disable confirmation to bypass verification.

No Production migration, Auth configuration, user data modification, financial operation, supplier purchase, merge or deployment is included in this stage.
