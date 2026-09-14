-- Give Liuhaoyi its own provider identity without changing payment lifecycle tables.
-- This migration intentionally does not enable a channel or store credentials.

begin;

update public.payment_channels
set provider = 'liuhaoyi',
    provider_name = 'liuhaoyi',
    min_amount = 1,
    minimum_amount = 1,
    fee_rate = 0,
    public_config = jsonb_set(
      coalesce(public_config, '{}'::jsonb),
      '{maximum_amount}',
      '2000'::jsonb,
      true
    )
where channel in ('alipay', 'wechat')
  and code = channel
  and coalesce(provider, provider_name) in ('generic_api', 'liuhaoyi')
  and (provider is null or provider in ('generic_api', 'liuhaoyi'))
  and (provider_name is null or provider_name in ('generic_api', 'liuhaoyi'));

update public.payment_sessions
set provider = 'liuhaoyi'
where channel_code in ('alipay', 'wechat')
  and provider = 'generic_api';

commit;
