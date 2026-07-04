-- Allow verified administrators to manage products through server-side session clients.
-- Safe to run repeatedly; does not modify product data.

do $$
begin
  if to_regclass('public.products') is not null then
    alter table public.products enable row level security;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
        and policyname = 'admins can read all products'
    ) then
      create policy "admins can read all products"
        on public.products
        for select
        to authenticated
        using (public.is_admin(auth.uid()));
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
        and policyname = 'admins can insert products'
    ) then
      create policy "admins can insert products"
        on public.products
        for insert
        to authenticated
        with check (public.is_admin(auth.uid()));
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
        and policyname = 'admins can update products'
    ) then
      create policy "admins can update products"
        on public.products
        for update
        to authenticated
        using (public.is_admin(auth.uid()))
        with check (public.is_admin(auth.uid()));
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
        and policyname = 'admins can delete products'
    ) then
      create policy "admins can delete products"
        on public.products
        for delete
        to authenticated
        using (public.is_admin(auth.uid()));
    end if;
  end if;
end $$;