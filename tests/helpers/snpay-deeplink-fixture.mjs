import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import * as core from '../../lib/payments/providers/snpay-core.mjs';
import { loadTs } from './payment-session-guard-harness.mjs';

// Ephemeral RSA fixtures only. All HTTP is mocked, including the real adapter.
export function fixtureProvider(payType = 'urlscheme') {
  const keys = () => generateKeyPairSync('rsa', {modulusLength:2048,
    privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  const merchant=keys(), platform=keys(), calls=[];
  const artifact = payType==='urlscheme' ? 'weixin://wxpay/bizpayurl?pr=test-only'
    : payType==='jump' ? 'https://checkout.example.test/fixture' : 'fixture-qr-payload';
  const env={SNPAY_MERCHANT_ID:'900001',SNPAY_PRIVATE_KEY_FILE:'fixture-private',
    SNPAY_PLATFORM_PUBLIC_KEY_FILE:'fixture-platform',SNPAY_SITE_URL:'https://shop.example.test',
    SNPAY_API_BASE:'https://provider.example.test'};
  const fetchImpl=async(url,init)=>{
    assert.equal(new URL(url).origin,'https://provider.example.test');
    assert.equal(new URL(url).pathname,'/api/pay/create');
    const request=Object.fromEntries(new URLSearchParams(init.body));
    assert.equal(core.verifySnpaySignedPayload(request,merchant.publicKey,{now:Date.now()}),true);
    assert.equal(request.money,'1.00');calls.push(request.type);
    const payload={code:0,trade_no:'SN_FIXTURE_ORDER',pay_type:payType,pay_info:artifact,
      timestamp:String(Math.floor(Date.now()/1000)),sign_type:'RSA'};
    payload.sign=core.createSnpaySignature(payload,platform.privateKey);
    return Response.json(payload);
  };
  const provider=loadTs('lib/payments/providers/snpay.ts',{
    'node:fs':{readFileSync:p=>p==='fixture-private'?merchant.privateKey:
      p==='fixture-platform'?platform.publicKey:(()=>{throw Error('UNEXPECTED_FILE');})()},
    '@/lib/payments/providers/snpay-core.mjs':{...core,
      createSnpayClient:config=>core.createSnpayClient({...config,fetchImpl})},
  },undefined,{process:{env}}).snpayProvider;
  return {provider,calls,artifact};
}
