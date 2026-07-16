# Profile Initialization Flow

## Flow

1. Browser obtains authenticated Supabase user.
2. Shared profile helper queries `profiles` by `auth.users.id` with `.maybeSingle()`.
3. If a row exists, it is normalized.
4. If no row exists, one insert is attempted with base fields only.
5. If insert conflicts, the profile is read once again.
6. If creation fails, the app returns a safe fallback profile and does not retry endlessly.

## Account Profile Page

The account profile page uses `/api/account/profile` instead of direct browser writes to `profiles`.

`GET`:

- returns the current user's profile or `exists: false`
- retries with base fields if optional profile columns are not migrated

`POST`:

- creates only the current user's base profile
- treats conflict as idempotent by reading again

`PATCH`:

- only updates whitelisted public profile fields
- never accepts `role`, `balance`, `promotion_balance`, `invite_code`, `referred_by`, `account_status`, or `risk_status`

## Retry Rules

There is one in-flight profile creation promise per user id in the browser helper. Failed creation is remembered for the session so components do not loop GET/POST.
