-- System settings extension, public announcements, and maintenance-mode fields.
-- Safe to run manually after 20260620_site_settings.sql.

insert into public.site_settings
  (setting_key, setting_value, setting_type, setting_group, is_public, description)
values
  ('site_description', jsonb_build_object('value','数字商品服务'), 'string', 'basic', true, '站点描述'),
  ('support_email', jsonb_build_object('value',''), 'string', 'basic', true, '公开客服邮箱'),
  ('support_phone', jsonb_build_object('value',''), 'string', 'basic', true, '公开客服电话'),
  ('currency', jsonb_build_object('value','CNY'), 'string', 'store', true, '币种'),
  ('timezone', jsonb_build_object('value','Asia/Shanghai'), 'string', 'store', true, '时区'),
  ('default_language', jsonb_build_object('value','zh-CN'), 'string', 'store', true, '默认语言'),
  ('order_expire_minutes', jsonb_build_object('value',30), 'number', 'order', true, '订单支付有效期（分钟）'),
  ('maintenance_enabled', jsonb_build_object('value',false), 'boolean', 'basic', true, '维护模式开关'),
  ('maintenance_message', jsonb_build_object('value','网站正在维护升级，请稍后再访问。管理员后台和健康检查保持可用。'), 'string', 'basic', true, '维护模式提示'),
  ('checkout_notice', jsonb_build_object('value','所有账号/卡密类商品请仔细核对说明，非商品问题不支持退换。售后期通常为商品发货后 24 小时内，请收到后第一时间检查。'), 'string', 'basic', true, 'Checkout 购买提醒')
on conflict (setting_key) do nothing;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  announcement_type text not null default 'info',
  is_enabled boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 100,
  placement text not null default 'global_top',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists announcements_public_idx
  on public.announcements(placement, is_enabled, sort_order, starts_at, ends_at);

create or replace function public.set_announcements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists announcements_set_updated_at on public.announcements;
create trigger announcements_set_updated_at
before update on public.announcements
for each row execute function public.set_announcements_updated_at();

alter table public.announcements enable row level security;

drop policy if exists "public can read active announcements" on public.announcements;
create policy "public can read active announcements"
on public.announcements for select
using (
  is_enabled = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
);

drop policy if exists "admins can read announcements" on public.announcements;
create policy "admins can read announcements"
on public.announcements for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can insert announcements" on public.announcements;
create policy "admins can insert announcements"
on public.announcements for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admins can update announcements" on public.announcements;
create policy "admins can update announcements"
on public.announcements for update
to authenticated
using (public.is_admin())
with check (public.is_admin());