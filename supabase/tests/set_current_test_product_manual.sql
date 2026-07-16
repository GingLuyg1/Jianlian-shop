-- Jianlian-shop-test only.
-- Purpose: temporarily change one checkout test product to manual delivery.
--
-- Before running:
-- 1. Confirm the SQL Editor is connected to the Jianlian-shop-test Supabase project.
-- 2. Replace the UUID below with the value after product= in the checkout URL.
-- 3. Do not run this against production.

begin;

-- Replace this UUID in all three places if your SQL editor does not support find/replace.
-- Current placeholder is intentionally invalid for real use and will raise before update.

select
  p.id,
  p.name,
  p.slug,
  p.stock,
  p.delivery_type
from public.products p
where p.id = '20ec421d-4d8b-40f6-80ee-1b9804697d55'::uuid;

do $$
declare
  v_product_id uuid := '20ec421d-4d8b-40f6-80ee-1b9804697d55'::uuid;
  v_exists boolean;
begin
  if v_product_id = '20ec421d-4d8b-40f6-80ee-1b9804697d55'::uuid then
    raise exception 'Replace the placeholder UUID with the checkout product UUID before running this test SQL.';
  end if;

  select exists (
    select 1
    from public.products p
    where p.id = v_product_id
  )
  into v_exists;

  if not v_exists then
    raise exception 'Test product % does not exist in public.products. Check that you are connected to Jianlian-shop-test and copied the checkout product UUID correctly.', v_product_id;
  end if;

  update public.products p
     set delivery_type = 'manual',
         updated_at = now()
   where p.id = v_product_id;
end;
$$;

select
  p.id,
  p.name,
  p.slug,
  p.stock,
  p.delivery_type
from public.products p
where p.id = '20ec421d-4d8b-40f6-80ee-1b9804697d55'::uuid;

commit;
