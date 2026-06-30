-- Secure guest order lookup token fields.
-- Execute manually in Supabase SQL Editor. Existing logged-in order access does not require these fields.

alter table public.orders
  add column if not exists order_query_token_hash text,
  add column if not exists order_query_token_created_at timestamptz,
  add column if not exists order_query_token_expires_at timestamptz,
  add column if not exists order_query_token_revoked_at timestamptz;

create index if not exists orders_order_query_token_hash_idx
  on public.orders(order_query_token_hash)
  where order_query_token_hash is not null;

create index if not exists orders_order_no_query_token_idx
  on public.orders(order_no, order_query_token_hash)
  where order_query_token_hash is not null;

-- No public RLS policy is added for token lookup.
-- Guest order lookup must go through server-side API verification.
