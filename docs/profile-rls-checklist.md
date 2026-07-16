# Profile RLS Checklist

## Expected Policies

- Anonymous users cannot read `public.profiles`.
- Authenticated users can read their own profile.
- Authenticated users can insert their own profile.
- Authenticated users can update their own non-sensitive profile fields.
- Super administrators can read and update profiles through controlled admin flows.

## Sensitive Fields

Users must not directly modify:

- `id`
- `email`
- `role`
- `balance`
- `promotion_balance`
- `invite_code`
- `referred_by`
- `account_status`
- `risk_status`
- `status_reason`
- `risk_reason`
- `last_login_at`

`supabase/migrations/20260709_profiles_schema_alignment.sql` adds `profiles_protect_sensitive_fields` to block these changes for non-admin users while allowing service-role/admin operations.

## Manual Checks

Run in a test Supabase project only:

1. User A can read User A profile.
2. User A cannot read User B profile.
3. User A can update `display_name`, `phone`, `recipient_name`, `shipping_address`, and `avatar_url`.
4. User A cannot update `balance`, `role`, `account_status`, or `risk_status`.
5. Service-role admin APIs still work.
