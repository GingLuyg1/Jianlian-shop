-- Synthetic disposable PostgreSQL only; never execute against a hosted database.
do $$ begin
 if current_database()<>'kuajingzy_freeze_isolated' or inet_server_addr()<>'127.0.0.1'::inet then
   raise exception 'DISPOSABLE_DATABASE_REQUIRED';
 end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql as $$select '10000000-0000-4000-8000-000000000001'::uuid$$;
create schema bitrefill_pin_private;
create table bitrefill_pin_private.sale_authorizations(product_id uuid,sku_id uuid);
create function bitrefill_pin_private.replay_guard(uuid,uuid,uuid,integer) returns void language plpgsql as $$begin return;end$$;
create function bitrefill_pin_private.attach_quote(uuid,uuid) returns void language plpgsql as $$begin return;end$$;
create function bitrefill_pin_private.consume_quote(uuid,text,uuid,uuid,integer,numeric) returns jsonb language sql as $$
select jsonb_build_object('quote_id','10000000-0000-4000-8000-000000000099',
'binding',jsonb_build_object('supplier','bitrefill'),'expires_at',now()+interval '30 minutes')$$;
create table categories(id uuid primary key,name text,is_active boolean default true);
create table products(id uuid primary key,status text,metadata jsonb,price numeric,original_price numeric,
stock integer,delivery_type text,image_url text,category_id uuid,name text,slug text);
create table product_skus(id uuid primary key,product_id uuid,status text,metadata jsonb,price numeric,original_price numeric,
stock integer,delivery_type text,image_url text,sku_title text,sku_code text,updated_at timestamptz);
create table product_option_groups(id uuid,name text,sort_order integer,created_at timestamptz);
create table product_option_values(id uuid,name text);
create table product_sku_values(sku_id uuid,group_id uuid,value_id uuid,sort_order integer);
create table orders(id uuid primary key default gen_random_uuid(),order_no text unique,user_id uuid,status text,payment_status text,
subtotal numeric,discount_amount numeric,total_amount numeric,currency text,customer_email text,customer_name text,
customer_phone text,shipping_address jsonb,customer_note text,delivery_type text,payment_method text,
client_request_id text,payment_expires_at timestamptz);
create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid,sku_id uuid,
sku_code text,sku_title text,option_snapshot jsonb,product_name text,product_slug text,product_image_url text,
category_name text,unit_price numeric,quantity integer,line_total numeric,delivery_type text,product_snapshot jsonb);
create table digital_inventory(id uuid primary key default gen_random_uuid(),product_id uuid,sku_id uuid,status text,
expires_at timestamptz,created_at timestamptz default now(),order_id uuid,reserved_order_id uuid,
reserved_order_item_id uuid,reserved_at timestamptz);
create table order_status_logs(order_id uuid,from_status text,to_status text,operator_id uuid,operator_type text,note text);
insert into categories values('20000000-0000-4000-8000-000000000001','SYNTHETIC',true);
insert into products(id,status,metadata,price,stock,delivery_type,category_id,name,slug)
values('30000000-0000-4000-8000-000000000001','active','{}',1.23,0,'auto_delivery',
'20000000-0000-4000-8000-000000000001','SYNTHETIC_PRODUCT','synthetic');
insert into product_skus(id,product_id,status,metadata,price,stock,delivery_type,sku_code)
values('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
'active','{}',1.23,0,'auto_delivery','SYNTHETIC_SKU');
