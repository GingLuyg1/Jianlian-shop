-- Production candidate only. Requires separate explicit Production DB write authorization.
-- Business rule: Alipay/WeChat max CNY 2000; USDT BEP20 is not modified by this SQL.
begin;
set local lock_timeout = '3s';

do $guard$
declare v_count integer;
begin
  select count(*) into v_count
  from public.payment_channels
  where code in ('alipay','wechat')
    and channel = code
    and provider = 'snpay'
    and provider_name = 'snpay'
    and currency = 'CNY'
    and enabled is true
    and configured is true
    and fee_rate = 0
    and coalesce(public_config->>'maximum_amount','') = '1000';

  if v_count <> 2 then
    raise exception 'PAYMENT_LIMIT_2000_BASELINE_DRIFT';
  end if;

  if not exists (
    select 1 from public.payment_channels
    where code='usdt_bep20'
      and channel='usdt_bep20'
      and provider='crypto_address'
      and provider_name='crypto_address'
      and currency='USDT'
      and enabled is true
      and configured is true
  ) then
    raise exception 'PAYMENT_LIMIT_2000_USDT_IDENTITY_DRIFT';
  end if;
end
$guard$;

update public.payment_channels
set public_config = jsonb_set(
  coalesce(public_config,'{}'::jsonb),
  '{maximum_amount}',
  '2000'::jsonb,
  true
)
where code in ('alipay','wechat')
  and channel = code
  and provider = 'snpay'
  and provider_name = 'snpay'
  and currency = 'CNY'
  and enabled is true
  and configured is true
  and fee_rate = 0
  and coalesce(public_config->>'maximum_amount','') = '1000';

do $post$
begin
  if (
    select count(*) from public.payment_channels
    where code in ('alipay','wechat')
      and channel=code
      and provider='snpay'
      and provider_name='snpay'
      and currency='CNY'
      and coalesce(public_config->>'maximum_amount','')='2000'
  ) <> 2 then
    raise exception 'PAYMENT_LIMIT_2000_POSTCHECK_FAILED';
  end if;
end
$post$;

commit;

select code, provider, currency, public_config->>'maximum_amount' as maximum_amount
from public.payment_channels
where code in ('alipay','wechat','usdt_bep20')
order by code;
