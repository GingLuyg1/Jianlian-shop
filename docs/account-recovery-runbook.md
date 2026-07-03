# Account Recovery Runbook

## Required Supabase configuration

1. Enable email/password auth in Supabase Auth.
2. Configure SMTP or a supported email provider.
3. Set site URL and redirect URLs to include:
   - `https://www.jianlian.shop/auth/callback`
   - local development callback if needed: `http://localhost:3000/auth/callback`
4. Configure email confirmation and password recovery email templates.
5. Set appropriate token expiry for confirmation and recovery links in the Supabase dashboard.

Do not store SMTP passwords, service role keys, reset tokens, or auth tokens in frontend code or public environment variables.

## User registration recovery

If a user cannot verify email:

1. Ask the user to log in and open account center.
2. Use the "重新发送验证邮件" action.
3. The app calls `POST /api/auth/resend-verification` for the current logged-in user.
4. The endpoint is rate-limited and does not accept a frontend user id.
5. If mail provider is unavailable, fix Supabase email configuration before retrying.

## Password reset recovery

1. User opens `/forgot-password` and submits email.
2. The page always shows a generic success message to prevent account enumeration.
3. User clicks the Supabase recovery email link.
4. `/auth/callback` exchanges the code for a temporary session and redirects to `/reset-password`.
5. User sets a new password that satisfies the shared policy.
6. The app signs out globally and asks the user to log in again.

## Disabled or risk-blocked accounts

If login is rejected because `profiles.account_status = disabled` or `profiles.risk_status = blocked`:

1. Do not ask the user for passwords or tokens.
2. Verify the account status in the admin user management page.
3. Only authorized administrators should change account status.
4. Record the reason for any manual account status change through existing admin audit flows.

## Security rules

- Never paste reset links, access tokens, refresh tokens, or passwords into tickets, logs, or chat.
- Do not use service role keys in browser code.
- Do not manually edit Supabase auth users from the browser console.
- Do not expose whether an email exists during forgot-password flow.
- Treat repeated resend/reset attempts as suspicious and wait for rate limits to expire.