-- Jianlian Shop system settings and audit logs.
-- Execute this migration in Supabase SQL Editor before using /admin/settings.

create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null default 'null'::jsonb,
  setting_type text not null check (setting_type in ('string','number','boolean','json')),
  setting_group text not null check (setting_group in ('basic','store','order','promotion','security')),
  is_public boolean not null default false,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.site_setting_logs (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null,
  old_value jsonb,
  new_value jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists site_settings_group_idx
  on public.site_settings(setting_group);

create index if not exists site_settings_public_idx
  on public.site_settings(is_public)
  where is_public = true;

create index if not exists site_setting_logs_key_time_idx
  on public.site_setting_logs(setting_key, updated_at desc);

create or replace function public.set_site_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
before update on public.site_settings
for each row execute function public.set_site_settings_updated_at();

alter table public.site_settings enable row level security;
alter table public.site_setting_logs enable row level security;

drop policy if exists "public can read public settings" on public.site_settings;
create policy "public can read public settings"
on public.site_settings for select
using (is_public = true);

drop policy if exists "admins can read all settings" on public.site_settings;
create policy "admins can read all settings"
on public.site_settings for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can insert settings" on public.site_settings;
create policy "admins can insert settings"
on public.site_settings for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admins can update settings" on public.site_settings;
create policy "admins can update settings"
on public.site_settings for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can read setting logs" on public.site_setting_logs;
create policy "admins can read setting logs"
on public.site_setting_logs for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can insert setting logs" on public.site_setting_logs;
create policy "admins can insert setting logs"
on public.site_setting_logs for insert
to authenticated
with check (public.is_admin());

insert into public.site_settings
  (setting_key, setting_value, setting_type, setting_group, is_public, description)
values
  ('site_name', jsonb_build_object('value','Jianlian'), 'string', 'basic', true, '站点名称'),
  ('site_subtitle', jsonb_build_object('value','数字商品服务'), 'string', 'basic', true, '站点副标题'),
  ('site_status', jsonb_build_object('value','open'), 'string', 'basic', true, '站点状态'),
  ('top_announcement', jsonb_build_object('value','请牢记域名www.jianlian.shop，本站不提供任何中国大陆业务。网站出售的商品以及社媒服务仅限个人或团体合法电商拓客使用。严禁任何人利用购买的商品进行任何违法犯罪活动。消费者若使用本网站提供商品发生未经授权的违法犯罪行为所产生的一切责任，均由消费者自行承担，与本站制作者无关。'), 'string', 'basic', true, '顶部公告'),
  ('support_contact', jsonb_build_object('value','Telegram：\nWhatsApp：\nEmail：\n上班时间：（12:00 AM - 24:00 PM GMT+8）\n有问题均可留言'), 'string', 'basic', true, '客服联系方式'),
  ('default_currency', jsonb_build_object('value','CNY'), 'string', 'store', true, '默认货币'),
  ('currency_symbol', jsonb_build_object('value','¥'), 'string', 'store', true, '货币符号'),
  ('products_per_page', jsonb_build_object('value',20), 'number', 'store', true, '商品默认每页数量'),
  ('show_original_price', jsonb_build_object('value',true), 'boolean', 'store', true, '是否显示原价'),
  ('show_stock', jsonb_build_object('value',true), 'boolean', 'store', true, '是否显示库存'),
  ('show_sold_out_products', jsonb_build_object('value',true), 'boolean', 'store', true, '是否允许缺货商品展示'),
  ('order_auto_cancel_minutes', jsonb_build_object('value',30), 'number', 'order', false, '订单自动取消时间（分钟）'),
  ('allow_user_cancel_pending_order', jsonb_build_object('value',true), 'boolean', 'order', false, '是否允许用户取消待支付订单'),
  ('order_no_prefix', jsonb_build_object('value','JL'), 'string', 'order', false, '订单编号前缀'),
  ('default_order_note_hint', jsonb_build_object('value','请填写必要的订单备注。'), 'string', 'order', true, '默认订单备注提示'),
  ('promotion_enabled', jsonb_build_object('value',true), 'boolean', 'promotion', true, '推广功能是否启用'),
  ('promotion_commission_rate', jsonb_build_object('value',0.03), 'number', 'promotion', true, '默认佣金比例'),
  ('promotion_min_withdraw_amount', jsonb_build_object('value',100), 'number', 'promotion', true, '最低提现金额'),
  ('promotion_available_order_status', jsonb_build_object('value','completed'), 'string', 'promotion', false, '佣金变为可用的订单状态'),
  ('require_email_verification', jsonb_build_object('value',false), 'boolean', 'security', false, '是否要求邮箱验证'),
  ('admin_action_confirm', jsonb_build_object('value',true), 'boolean', 'security', false, '管理员操作二次确认'),
  ('login_failure_hint_strategy', jsonb_build_object('value','generic'), 'string', 'security', false, '登录失败提示策略')
on conflict (setting_key) do nothing;

create or replace function public.get_site_setting_text(
  p_setting_key text,
  p_default text
)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(trim(setting_value ->> 'value'), ''),
    p_default
  )
  from public.site_settings
  where setting_key = p_setting_key
  limit 1
$$;

create or replace function public.get_site_setting_boolean(
  p_setting_key text,
  p_default boolean
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (setting_value ->> 'value')::boolean,
    p_default
  )
  from public.site_settings
  where setting_key = p_setting_key
  limit 1
$$;

create or replace function public.create_order_with_item(
  p_product_id uuid,
  p_quantity integer default 1,
  p_customer_email text default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_note text default null,
  p_shipping_address jsonb default null
)
returns table (
  order_id uuid,
  order_no text,
  status text,
  payment_status text,
  total_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product record;
  v_category record;
  v_quantity integer := greatest(coalesce(p_quantity, 1), 1);
  v_order_id uuid;
  v_order_no text;
  v_order_prefix text := public.get_site_setting_text('order_no_prefix', 'JL');
  v_line_total numeric;
  v_try integer := 0;
begin
  if v_user_id is null then
    raise exception '请先登录后再下单';
  end if;

  select p.*
    into v_product
  from public.products p
  where p.id = p_product_id
    and p.status = 'active'
  limit 1;

  if not found then
    raise exception '商品不存在或已下架';
  end if;

  if coalesce(v_product.stock, 0) < v_quantity then
    raise exception '库存不足';
  end if;

  select c.*
    into v_category
  from public.categories c
  where c.id = v_product.category_id
    and coalesce(c.is_active, true) = true
  limit 1;

  if not found then
    raise exception '商品分类不可用';
  end if;

  v_order_prefix := regexp_replace(upper(coalesce(v_order_prefix, 'JL')), '[^A-Z0-9]', '', 'g');
  if v_order_prefix = '' then
    v_order_prefix := 'JL';
  end if;

  v_line_total := round((coalesce(v_product.price, 0)::numeric * v_quantity)::numeric, 2);

  loop
    v_try := v_try + 1;
    v_order_no := v_order_prefix || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') ||
      lpad(floor(random() * 10000)::text, 4, '0');

    begin
      insert into public.orders (
        order_no,user_id,status,payment_status,subtotal,discount_amount,total_amount,currency,
        customer_email,customer_name,customer_phone,shipping_address,customer_note,delivery_type
      )
      values (
        v_order_no,v_user_id,'pending_payment','unpaid',v_line_total,0,v_line_total,'CNY',
        nullif(trim(p_customer_email), ''),nullif(trim(p_customer_name), ''),
        nullif(trim(p_customer_phone), ''),
        case
          when p_shipping_address is null or p_shipping_address = '{}'::jsonb then null
          else p_shipping_address
        end,
        nullif(trim(p_customer_note), ''),
        v_product.delivery_type
      )
      returning id into v_order_id;
      exit;
    exception when unique_violation then
      if v_try >= 5 then
        raise exception '订单号生成失败，请重试';
      end if;
    end;
  end loop;

  insert into public.order_items (
    order_id,product_id,product_name,product_slug,product_image_url,category_name,
    unit_price,quantity,line_total,delivery_type,product_snapshot
  )
  values (
    v_order_id,v_product.id,v_product.name,v_product.slug,v_product.image_url,v_category.name,
    v_product.price,v_quantity,v_line_total,v_product.delivery_type,
    jsonb_build_object(
      'id', v_product.id,
      'name', v_product.name,
      'slug', v_product.slug,
      'image_url', v_product.image_url,
      'price', v_product.price,
      'original_price', v_product.original_price,
      'delivery_type', v_product.delivery_type,
      'category_id', v_product.category_id,
      'category_name', v_category.name
    )
  );

  insert into public.order_status_logs (
    order_id,from_status,to_status,operator_id,operator_type,note
  )
  values (
    v_order_id,null,'pending_payment',v_user_id,'user','用户创建订单'
  );

  return query
  select v_order_id, v_order_no, 'pending_payment'::text, 'unpaid'::text, v_line_total;
end;
$$;
