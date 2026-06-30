-- Jianlian media asset registry and safe reference tracking.
-- Execute manually in Supabase SQL editor after reviewing bucket names and policies.

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null default 'unassigned',
  owner_id uuid null,
  bucket text not null,
  storage_path text not null,
  public_url text null,
  original_name text null,
  mime_type text not null,
  file_size bigint not null default 0,
  width integer null,
  height integer null,
  checksum text null,
  alt_text text null,
  status text not null default 'unused',
  uploaded_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint media_assets_status_check check (status in ('active','unused','archived','deleted','failed')),
  constraint media_assets_owner_type_check check (owner_type in ('product','sku','category','site_setting','profile','announcement','unassigned')),
  constraint media_assets_storage_path_not_empty check (length(trim(storage_path)) > 0),
  constraint media_assets_file_size_check check (file_size >= 0),
  constraint media_assets_dimensions_check check ((width is null or width > 0) and (height is null or height > 0))
);

create unique index if not exists media_assets_bucket_path_key on public.media_assets(bucket, storage_path);
create index if not exists media_assets_owner_idx on public.media_assets(owner_type, owner_id);
create index if not exists media_assets_status_idx on public.media_assets(status, created_at desc);
create index if not exists media_assets_checksum_idx on public.media_assets(checksum) where checksum is not null;
create index if not exists media_assets_uploaded_by_idx on public.media_assets(uploaded_by, created_at desc);

create or replace function public.set_media_assets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_media_assets_updated_at on public.media_assets;
create trigger trg_media_assets_updated_at
before update on public.media_assets
for each row execute function public.set_media_assets_updated_at();

alter table public.media_assets enable row level security;

drop policy if exists "Admins can read media assets" on public.media_assets;
create policy "Admins can read media assets"
on public.media_assets for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can insert media assets" on public.media_assets;
create policy "Admins can insert media assets"
on public.media_assets for insert
to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can update media assets" on public.media_assets;
create policy "Admins can update media assets"
on public.media_assets for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Public users do not need to query media_assets. They read public image URLs from business tables.
-- Storage bucket creation is intentionally not included here. Configure buckets manually:
-- public-assets, product-images, avatars, private-assets.

