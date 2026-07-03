# Auth, Session, and Account Security Verification

## Current authentication chain

Pages and routes:

- `/register`: email/password registration through Supabase Auth.
- `/login`: email/password login through Supabase Auth.
- `/forgot-password`: password reset email request through Supabase Auth.
- `/reset-password`: password update after `/auth/callback` exchanges the reset code for a session.
- `/auth/callback`: server route that exchanges Supabase auth code for a cookie session, then redirects to a safe internal path.
- `/account` and `/account/*`: user account center protected by middleware and `AccountShell` session checks.
- `/admin` and `/admin/*`: unauthenticated requests are redirected by middleware; admin role is verified again in `app/admin/layout.tsx` and admin API helpers.

Supabase clients:

- Browser client: `getSupabaseBrowserClient()` in `lib/supabase/client.ts` for interactive auth pages and account shell.
- Server client: `getSupabaseServerClient()` in `lib/supabase/server.ts` for route handlers, middleware session exchange, and server-side guards.
- Service role client: `getSupabaseServiceRoleClient()` in `lib/supabase/service-role.ts`, server-only and not exposed through `NEXT_PUBLIC_*`.

## Registration result

Registration now uses shared password and email validation from `lib/auth/password-policy.ts`:

- Email is normalized and validated.
- Password must be at least 8 characters and include letters and numbers.
- Confirm password must match.
- Terms/privacy checkbox defaults to unchecked and is required.
- Registration errors are mapped to safe Chinese messages.
- Passwords are not logged.
- Duplicate email errors use a safe generic registration failure message instead of exposing extra account details.

If Supabase returns a session immediately, the profile is prepared and the user enters `/account`. If email confirmation is enabled, the page shows the verification-required message.

## Email verification result

Supabase email verification links continue to land on `/auth/callback`, where the server exchanges the code for a session. Invalid or expired links redirect to `/login?auth_error=invalid_link`.

A new protected endpoint was added:

- `POST /api/auth/resend-verification`

It requires the current logged-in user, rate-limits by user id, does not accept a frontend `user_id`, and does not log tokens. It calls Supabase Auth resend only for the current user's own email. If the mail/Auth provider is unavailable, it returns a real unavailable error instead of claiming success.

## Login result

Login uses Supabase Auth `signInWithPassword` and then checks the local profile state:

- `account_status = disabled` is rejected.
- `risk_status = blocked` is rejected.
- Failed login uses the same safe message for wrong email/password.
- Password input is cleared on failed login.
- Successful login returns to the safe `redirect` path.
- Existing logged-in users visiting login/register are redirected to `/account` or the safe redirect target.

## Forgot password and reset password result

`/forgot-password` returns the same user-facing success text whether the email exists or not. It keeps a 60-second client cooldown and does not log reset tokens.

`/reset-password` checks for an active Supabase session created by `/auth/callback`, applies the shared password policy, clears password fields on failure, updates the password through Supabase Auth, then signs out globally and redirects to login.

## Session protection result

Middleware now performs server-side unauthenticated protection for:

- `/account`
- `/account/*`
- `/admin`
- `/admin/*`

Unauthenticated users are redirected to `/login?redirect=<original-path>`. Admin role remains enforced server-side by `getServerAdminContext()` and API-level admin helpers. Account pages still use `AccountShell` to handle session expiry and multi-tab sign-out events.

## Logout and account switching

`AccountShell` now signs out with `{ scope: "global" }`, clears local account identity state, redirects to `/`, and refreshes the router. Supabase `onAuthStateChange` handles cross-tab sign-out propagation.

## Rate limiting and security logging

New rate-limit policy:

- `auth_resend`: 3 requests per 5 minutes per user.

Existing rate limits continue to protect order/payment/recharge/refund/admin operations. Auth pages avoid logging raw password, tokens, and full Supabase auth error objects.

## Manual configuration required

Supabase Auth email templates and SMTP/email provider must be configured in Supabase. The app cannot prove email delivery without that provider. If not configured, resend/reset flows will return or show an unavailable/failure state rather than fake success, except the forgot-password page intentionally uses a privacy-preserving generic response for account enumeration protection.

## Tests run

- Node regression/unit tests: pending in this pass.
- `tsc --noEmit`: passed after auth changes.
- `npm run build`: pending in this pass.

## Remaining issues

- Email verification and password reset link expiry are enforced by Supabase Auth settings; confirm these values in the Supabase dashboard.
- Fine-grained security event persistence for failed login attempts is not implemented as a database-backed audit event in this pass; only safe UI handling and route protection were added.