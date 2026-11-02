-- Rollback candidate only. Do not execute automatically.
-- Reverts only the two fiat channel config values from 2000 back to the prior 1000.
begin;
set local lock_timeout = '3s';

do $guard$
begin
  if (
    select count(*) from public.payment_channels
    where code in ('alipay','wechat')
      and channel=code
      and provider='snpay'
      and provider_name='snpay'
      and currency='CNY'
      and enabled is true
      and configured is true
      and fee_rate=0
      and coalesce(public_config->>'maximum_amount','')='2000'
  ) <> 2 then
    raise exception 'PAYMENT_LIMIT_2000_ROLLBACK_BASELINE_DRIFT';
  end if;
end
$guard$;

update public.payment_channels
set public_config = jsonb_set(
  coalesce(public_config,'{}'::jsonb),
  '{maximum_amount}',
  '1000'::jsonb,
  true
)
where code in ('alipay','wechat')
  and channel=code
  and provider='snpay'
  and provider_name='snpay'
  and currency='CNY'
  and enabled is true
  and configured is true
  and fee_rate=0
  and coalesce(public_config->>'maximum_amount','')='2000';

commit;
