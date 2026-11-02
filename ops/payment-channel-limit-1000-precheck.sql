-- READ ONLY. Production precheck for the 2026-11-02 payment-limit correction.
select
  code,
  channel,
  provider,
  currency,
  enabled,
  configured,
  minimum_amount,
  fee_rate,
  public_config->>'maximum_amount' as maximum_amount
from public.payment_channels
where code in ('alipay','wechat','usdt_bep20')
order by code;
