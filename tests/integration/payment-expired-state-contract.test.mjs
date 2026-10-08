import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const migration=source('supabase/migrations/20261008103916_paid_before_expiry_expired_state_completion.sql');
test('unknown baseline fails closed before function DDL, with atomic bounded migration',()=>{
 assert.match(migration,/BEGIN;[\s\S]*COMMIT;/);assert.match(migration,/UNKNOWN_CANONICAL_FUNCTION_BASELINE/);
 assert.equal((migration.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,4);
 assert.ok(migration.indexOf('UNKNOWN_CANONICAL_FUNCTION_BASELINE')<migration.indexOf('CREATE OR REPLACE FUNCTION'));
 assert.match(migration,/CANONICAL_FUNCTION_SECURITY_POSTCHECK_FAILED/);
 assert.match(migration,/LEGACY_CREDIT_CHANGED/);
});
test('expired rescue requires explicit finite time and both lifetimes, not just removing expired',()=>{
 for(const marker of ['EXPIRED_SESSION_TRUSTED_RECHARGE_EVIDENCE_REQUIRED','EXPIRED_RECHARGE_SESSION_EVIDENCE_INVALID',
 'EXPIRED_RECHARGE_SESSION_NOT_UNIQUE','EXPIRED_RECHARGE_EXISTING_CREDIT_CONFLICT','UNTRUSTED_WRAPPER_EXPIRED_REJECTED'])assert.ok(migration.includes(marker));
 assert.match(migration,/p_paid_at is null or not isfinite\(p_paid_at\)/);
 assert.match(migration,/p_paid_at < v_linked_session.created_at or p_paid_at > v_linked_session.expires_at/);
 assert.match(migration,/v_session.status = 'expired' and v_session.business_type not in \('recharge','account_recharge'\)/);
 assert.match(migration,/\('closed','failed','refunded'\)/);
});
test('new trusted-time credit overload is service-only; legacy credit is not rewritten',()=>{
 assert.match(migration,/credit_account_recharge_balance\(p_recharge_no text, p_provider_trade_no text, p_received_amount numeric, p_currency text, p_paid_at timestamp with time zone\)/);
 assert.match(migration,/FROM PUBLIC,anon,authenticated/);
 assert.match(migration,/TO service_role/);
 assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION public.credit_account_recharge_balance\([^\n]+DEFAULT/);
});
test('runtime completion still uses canonical RPC and existing security policies remain present',()=>{
 assert.match(source('lib/payments/complete-payment-service.ts'),/rpc\("complete_payment_session"/);
 assert.match(source('lib/payments/complete-payment-service.ts'),/source: "callback" \| "reconciliation"/);
 assert.ok(source('lib/payments/payment-session-service.ts').includes('SESSION_FAILED_REQUIRES_REVIEW'));
 assert.ok(source('lib/payments/payment-callback-service.ts').includes('callbackSessionIdentityMatches'));
});
