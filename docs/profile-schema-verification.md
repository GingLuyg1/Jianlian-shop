# Profile Schema Verification

## Current Source Of Truth

The repository baseline defines `public.profiles` in:

- `supabase/schema.sql`
- `supabase/profiles.sql`
- supplemental migrations under `supabase/migrations`

Base fields:

- `id`
- `email`
- `phone`
- `role`
- `balance`
- `promotion_balance`
- `invite_code`
- `referred_by`
- `created_at`
- `updated_at`

Account/profile extension fields:

- `display_name`
- `recipient_name`
- `shipping_address`
- `avatar_url`
- `metadata`
- `account_status`
- `risk_status`
- `status_reason`
- `risk_reason`
- `last_login_at`

`country` is not part of the current profile contract. Current UI uses an address region field stored inside `shipping_address.region`.

## Required Migration

Run manually in test or production after review:

- `supabase/migrations/20260709_profiles_schema_alignment.sql`

The migration is additive. It does not delete or rewrite existing profile data and does not disable RLS.

## Field Contract

Read/create initialization uses only base fields so login and top navigation do not fail when optional profile UI fields are missing.

Account profile editing uses the service API:

- `GET /api/account/profile`
- `POST /api/account/profile`
- `PATCH /api/account/profile`

The service API never selects or writes `country`.
