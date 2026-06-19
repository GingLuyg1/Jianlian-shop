# Catalog Migration

This script copies the local static Jianlian catalog into Supabase `public.categories`
and `public.products`.

It does not run automatically during build or page rendering.

## Requirements

The Supabase database must already contain:

- `public.categories`
- `public.products`
- RLS policies that allow the signed-in admin user to insert, update, and read rows.
- A `profiles` row where the admin user has `role = 'admin'`.

The script signs in as an admin user with the public Supabase anon key. Do not use a
service role key in this script.

## Environment Variables

PowerShell example:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
$env:SUPABASE_ADMIN_EMAIL="gac000189@gmail.com"
$env:SUPABASE_ADMIN_PASSWORD="your-admin-password"
npm run catalog:migrate
```

Linux shell example:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key" \
SUPABASE_ADMIN_EMAIL="gac000189@gmail.com" \
SUPABASE_ADMIN_PASSWORD="your-admin-password" \
npm run catalog:migrate
```

## What It Does

- Upserts categories by `slug`.
- Inserts level 1 categories first, then child categories with `parent_id`.
- Upserts products by `slug`.
- Resolves each product `category_id` from the category slug.
- Keeps product `description` empty so product detail pages remain controlled by code.

## Status Values

- `active`: visible on the storefront.
- `inactive`: hidden/down.
- `sold_out`: sold out.
- `draft`: draft.
