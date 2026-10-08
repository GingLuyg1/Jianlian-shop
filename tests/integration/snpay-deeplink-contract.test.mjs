import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,harness,source,failedRow} from '../helpers/payment-session-guard-harness.mjs';
import {fixtureProvider} from '../helpers/snpay-deeplink-fixture.mjs';

test('forward migration extends only the canonical payment-type constraint',()=>{
  const sql=source('supabase/migrations/20261008082216_payment_sessions_deeplink_contract.sql');
  assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
  assert.match(sql,/CHECK \(payment_type IN \('redirect', 'qrcode', 'address', 'deeplink'\)\)/);
  assert.equal((sql.match(/ALTER TABLE public.payment_sessions/g)||[]).length,2);
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  assert.match(source('lib/payments/channel-types.ts'),/"redirect" \| "qrcode" \| "address" \| "deeplink"/);
});
for(const [payType,channel,expected] of [['urlscheme','wechat','deeplink'],['jump','alipay','redirect'],['qrcode','wechat','qrcode']]){
  test(`signed mock ${channel} ${payType} passes real core, adapter and session service`,async()=>{
    const data=fixture('snpay',channel),mock=fixtureProvider(payType);
    const h=harness({data,providerCreate:input=>mock.provider.createPayment(input)});
    const before=JSON.stringify([data.profiles,data.balance_transactions,data.payment_reconciliations]);
    const result=await h.create();assert.equal(result.paymentType,expected);
    assert.equal(data.payment_sessions.length,1);const s=data.payment_sessions[0];
    assert.equal(s.payment_type,expected);assert.equal(s.status,'pending');
    assert.equal(s.provider_order_no,'SN_FIXTURE_ORDER');assert.equal(s.metadata.initializing,false);
    assert.equal(expected==='qrcode'?s.qr_code_url:s.payment_url,mock.artifact);
    assert.deepEqual(mock.calls,[channel==='wechat'?'wxpay':'alipay']);
    assert.equal(JSON.stringify([data.profiles,data.balance_transactions,data.payment_reconciliations]),before);
  });
}
test('failed WeChat recharge remains blocked before any provider dispatch',async()=>{
  const data=fixture('snpay','wechat');data.payment_sessions.push(failedRow(data));
  const mock=fixtureProvider(),h=harness({data,providerCreate:input=>mock.provider.createPayment(input)});
  await assert.rejects(h.create(),e=>e.code==='SESSION_FAILED_REQUIRES_REVIEW');
  assert.equal(mock.calls.length,0);assert.equal(h.stats.provider,0);
});
