-- LOCAL DISPOSABLE PostgreSQL only. This is a minimal Supabase platform shim,
-- not application schema and never a Production migration.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'jianlian_bitrefill_v13_fullbaseline'
     or inet_server_addr() is distinct from '127.0.0.1'::inet then
    raise exception 'V13_FULLBASELINE_IDENTITY_GUARD_FAILED';
  end if;
end $$;

do $$ begin
  if to_regrole('anon') is null then create role anon nologin; end if;
  if to_regrole('authenticated') is null then create role authenticated nologin; end if;
  if to_regrole('service_role') is null then create role service_role nologin bypassrls; end if;
  if to_regrole('authenticator') is null then create role authenticator nologin; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
create schema if not exists auth;
create schema if not exists storage;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  phone text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text not null
);
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select string_to_array(name, '/') $$;
