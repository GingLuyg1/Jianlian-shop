-- Synthetic storefront column boundary only. Never applied to Production.
alter table public.products add column name text,add column slug text,add column image_url text,add column original_price numeric,
 add column price numeric,add column status text,add column delivery_type text,add column category_id uuid,add column metadata jsonb default '{}',add column updated_at timestamptz;
alter table public.product_skus add column product_id uuid,add column sku_code text,add column sku_title text,add column price numeric,
 add column original_price numeric,add column stock integer default 0,add column status text,add column delivery_type text,
 add column image_url text,add column metadata jsonb default '{}',add column updated_at timestamptz;
create table public.categories(id uuid primary key,name text,is_active boolean);
create table public.product_sku_values(sku_id uuid,group_id uuid,value_id uuid,sort_order integer);
create table public.product_option_groups(id uuid,name text,sort_order integer,created_at timestamptz);
create table public.product_option_values(id uuid,name text);
alter table public.orders add column subtotal numeric,add column discount_amount numeric,add column total_amount numeric,
 add column customer_email text,add column customer_name text,add column customer_phone text,add column shipping_address jsonb,
 add column customer_note text,add column delivery_type text,add column payment_method text,add column client_request_id text,add column payment_expires_at timestamptz;
create unique index pin_synthetic_order_request on public.orders(user_id,client_request_id);
alter table public.order_items add column sku_code text,add column sku_title text,add column option_snapshot jsonb,add column product_slug text,
 add column product_image_url text,add column category_name text;
alter table public.digital_inventory add column product_id uuid,add column sku_id uuid,add column expires_at timestamptz,
 add column created_at timestamptz default now(),add column order_id uuid,add column reserved_order_id uuid,
 add column reserved_order_item_id uuid,add column reserved_at timestamptz;
create table public.order_status_logs(order_id uuid,from_status text,to_status text,operator_id uuid,operator_type text,note text);
insert into public.categories values('94319387-0291-4e58-b9fd-e25fbdfbfaf1','SYNTHETIC Giffgaff',true);
insert into public.products(id,name,slug,price,status,delivery_type,category_id) values
 ('e00553bf-a2da-48c7-9bdc-9b897b18b2fd','SYNTHETIC GBP10','synthetic-10',110,'active','auto_delivery','94319387-0291-4e58-b9fd-e25fbdfbfaf1'),
 ('5e4025b0-9a14-4827-87a2-f7f3e0e79734','SYNTHETIC GBP15','synthetic-15',170,'active','auto_delivery','94319387-0291-4e58-b9fd-e25fbdfbfaf1'),
 ('b2878f67-344a-40e4-af59-b32b6db21d29','SYNTHETIC GBP20','synthetic-20',220,'active','auto_delivery','94319387-0291-4e58-b9fd-e25fbdfbfaf1');
insert into public.product_skus(id,product_id,sku_code,price,status,delivery_type) values
 ('eeef050f-3b56-492d-a0a2-0640e4c1355f','e00553bf-a2da-48c7-9bdc-9b897b18b2fd','BFR-GB-GIFFGAFF-GBP-010',110,'active','auto_delivery'),
 ('4cf72256-72ca-47b0-8dca-9904a0d70f69','5e4025b0-9a14-4827-87a2-f7f3e0e79734','BFR-GB-GIFFGAFF-GBP-015',170,'active','auto_delivery'),
 ('f1333d43-8f0b-4041-a120-c980f7e58147','b2878f67-344a-40e4-af59-b32b6db21d29','BFR-GB-GIFFGAFF-GBP-020',220,'active','auto_delivery');
