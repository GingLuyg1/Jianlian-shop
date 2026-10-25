-- Disposable local fixture ONLY. Contains no credentials, real customers or DB9.
create role anon nologin nosuperuser;
create role authenticated nologin nosuperuser;
create role service_role nologin nosuperuser bypassrls;
revoke create on schema public from public;
grant usage on schema public to anon, authenticated, service_role;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$ select current_user::text $$;
create table auth.users(id uuid primary key);
insert into auth.users values
 ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),('44444444-4444-4444-8444-444444444444');
create table public.profiles(id uuid primary key, email text, role text, balance numeric default 100, updated_at timestamptz default now());
insert into public.profiles(id, role) select id, case when id::text like '3%' or id::text like '4%' then 'admin' else 'user' end from auth.users;
create table public.admin_users(user_id uuid primary key, admin_level text, status text, permissions jsonb default '{}');
insert into public.admin_users(user_id, admin_level, status) values
 ('33333333-3333-4333-8333-333333333333','super_admin','active'),
 ('44444444-4444-4444-8444-444444444444','admin','active');
create function public.is_admin(user_id uuid) returns boolean language sql stable security definer set search_path = public as $$
 select exists(select 1 from public.admin_users a where a.user_id = $1 and a.status = 'active' and a.admin_level in ('admin','super_admin'))
$$;
create function public.is_admin() returns boolean language sql stable as $$ select public.is_admin(auth.uid()) $$;
create function public.is_super_admin(user_id uuid) returns boolean language sql stable security definer set search_path = public as $$
 select exists(select 1 from public.admin_users a where a.user_id = $1 and a.status = 'active' and a.admin_level = 'super_admin')
$$;
grant select on public.profiles, public.admin_users to authenticated;
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
create policy own_profile on public.profiles for select to authenticated using(id = auth.uid());
create policy own_authorization on public.admin_users for select to authenticated using(user_id = auth.uid());

create table public.categories(id uuid primary key, parent_id uuid, level integer, name text, slug text, sort_order integer default 0, is_active boolean);
insert into public.categories(id,level,name,slug,is_active) values('77777777-7777-4777-8777-777777777777',1,'MOCK Gifts','mock-gifts',true);
grant select on public.categories to anon, authenticated, service_role;
create table public.products(
 id uuid primary key, category_id uuid, subcategory_id uuid, name text, slug text,
 short_description text, description text, image_url text, gallery text[], price numeric, original_price numeric,
 stock integer, has_skus boolean, delivery_type text, status text, sort_order integer default 0,
 metadata jsonb default '{}', internal_notes text default 'SYNTHETIC_INTERNAL',
 created_at timestamptz default now(), updated_at timestamptz default now()
);
insert into public.products(id,category_id,name,slug,price,stock,has_skus,delivery_type,status,metadata) values
 ('55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-777777777777','MOCK Gift','mock-gift',20,8,true,'automatic','active',
 '{"supplier":"daju","supplier_max_unit_cost":"9","supplier_api_key":"SYNTHETIC_ONLY","supplier_binding_candidate":{"supplier":"bitrefill","supplier_cost":"4.12","supplier_auto_purchase_enabled":false},"supplier_binding_audit":[{"actor":"MOCK-ADMIN"}]}'),
 ('66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777','MOCK Hidden','mock-hidden',21,8,false,'manual','inactive','{}');
create table public.product_skus(
 id uuid primary key, product_id uuid references public.products(id), sku_code text, sku_title text, combination_key text,
 price numeric, original_price numeric, stock integer, status text, delivery_type text, image_url text,
 sort_order integer default 0, note text, metadata jsonb default '{}', created_at timestamptz default now(), updated_at timestamptz default now()
);
insert into public.product_skus(id,product_id,sku_code,sku_title,price,stock,status,delivery_type,metadata)
 select '88888888-8888-4888-8888-888888888888', id,'mock-us-5','MOCK US 5',20,8,'active','automatic',metadata from public.products where slug='mock-gift';
insert into public.product_skus(id,product_id,sku_code,sku_title,price,stock,status,metadata)
 values('99999999-9999-4999-8999-999999999999','55555555-5555-4555-8555-555555555555','mock-inactive','MOCK Hidden',20,0,'inactive','{}');
alter table public.products enable row level security;
alter table public.product_skus enable row level security;
create policy visible_products on public.products for select using(status in ('active','sold_out') or public.is_admin());
create policy visible_skus on public.product_skus for select using(status in ('active','sold_out') or public.is_admin());
grant select on public.products, public.product_skus to anon, authenticated;
grant select(metadata) on public.products, public.product_skus to public;
grant all on public.products, public.product_skus to service_role;

create table public.orders(id uuid primary key default gen_random_uuid(), order_no text unique, user_id uuid, total_amount numeric,
 currency text default 'CNY', status text default 'completed', payment_status text default 'paid', payment_method text,
 delivery_type text default 'automatic', created_at timestamptz default now(), updated_at timestamptz default now());
create table public.order_payments(id uuid primary key default gen_random_uuid(), order_id uuid, status text default 'paid', paid_at timestamptz default now(), updated_at timestamptz default now());
create table public.order_deliveries(id uuid primary key default gen_random_uuid(), order_id uuid, delivery_status text);
create table public.balance_transactions(id uuid primary key default gen_random_uuid(), user_id uuid, transaction_no text, business_type text,
 business_id text, direction text, amount numeric, balance_before numeric, balance_after numeric, currency text, status text, remark text, metadata jsonb);
create table public.digital_inventory(id uuid primary key default gen_random_uuid(), status text, reserved_order_id uuid,
 delivered_order_id uuid, reserved_at timestamptz, updated_at timestamptz default now());
create table public.order_status_logs(id uuid primary key default gen_random_uuid(), order_id uuid, from_status text,
 to_status text, operator_id uuid, operator_type text, note text);
insert into public.orders(order_no,user_id,total_amount,payment_method) values
 ('MOCK-V6-BALANCE','11111111-1111-4111-8111-111111111111',10,'balance'),
 ('MOCK-V6-EXTERNAL','11111111-1111-4111-8111-111111111111',20,'mock_external'),
 ('MOCK-V6-OTHER','22222222-2222-4222-8222-222222222222',10,'balance');
insert into public.order_payments(order_id) select id from public.orders;
insert into public.order_deliveries(order_id,delivery_status) select id,'pending' from public.orders;
insert into public.digital_inventory(status,delivered_order_id) select 'delivered',id from public.orders where order_no='MOCK-V6-BALANCE';
alter table public.orders enable row level security;
create policy own_orders on public.orders for select to authenticated using(user_id=auth.uid() or public.is_admin());
grant select on public.orders to authenticated;
