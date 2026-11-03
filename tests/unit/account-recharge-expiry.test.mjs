import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACCOUNT_RECHARGE_EXPIRY_MS, ACCOUNT_RECHARGE_EXPIRY_MINUTES, createAccountRechargeExpiryWindow } from '../../lib/payments/account-recharge-expiry.mjs';
import { createPaymentExpiryWindow } from '../../lib/payments/payment-expiry.mjs';
import { createLiuhaoyiRechargeWindow } from '../../lib/payments/recharge-expiry.mjs';
import ts from 'typescript';
const now=new Date('2026-11-03T01:00:00Z');
for(const channel of ['usdt_bep20','alipay','wechat'])test(channel+' account funding has exactly600 seconds',()=>{
 const w=createAccountRechargeExpiryWindow(now);assert.equal(ACCOUNT_RECHARGE_EXPIRY_MINUTES,10);assert.equal(ACCOUNT_RECHARGE_EXPIRY_MS,600000);assert.equal(Date.parse(w.expiresAt)-Date.parse(w.createdAt),600000);
 if(channel!=='usdt_bep20')assert.deepEqual(createLiuhaoyiRechargeWindow(now),w);
});
test('shop payment remains900 seconds and malformed creation time is rejected',()=>{
 const w=createPaymentExpiryWindow(now);assert.equal(Date.parse(w.expiresAt)-Date.parse(w.createdAt),900000);assert.throws(()=>createAccountRechargeExpiryWindow('invalid'),TypeError);
});
test('actual payment-session expiry expression preserves authoritative recharge deadline for Alipay/WeChat',()=>{
 const source=fs.readFileSync('lib/payments/payment-session-service.ts','utf8');
 const tree=ts.createSourceFile('session.ts',source,ts.ScriptTarget.Latest,true);let expression;
 function walk(n){if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='expiresAt'){const candidate=n.initializer?.getText(tree);if(candidate?.includes('businessType === "recharge"'))expression=candidate;};ts.forEachChild(n,walk);}walk(tree);
 assert.ok(expression?.includes('businessType === "recharge"'));
 const resolve=new Function('businessType','business','createPaymentExpiryWindow','return '+expression);
 for(const channel of ['alipay','wechat']){const business={expiresAt:createAccountRechargeExpiryWindow(now).expiresAt,channel};assert.equal(resolve('recharge',business,()=>assert.fail('must not recompute')),business.expiresAt);}
 assert.equal(resolve('order',{},()=>createPaymentExpiryWindow(now)),createPaymentExpiryWindow(now).expiresAt);
});
