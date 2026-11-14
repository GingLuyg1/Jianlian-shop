import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadPureTypeScript } from '../helpers/load-pure-typescript.mjs';

const { encodePendingSignup, decodePendingSignup } = loadPureTypeScript(new URL('../../lib/auth/pending-signup.ts', import.meta.url));
const now = 1800000000000;
const progress = { email: 'fixture@example.invalid', userId: '11111111-1111-4111-8111-111111111111', invite: '' };

test('refresh restores only pending identity; storage contains no login credential', () => {
  const stored = encodePendingSignup(progress, now);
  assert.deepEqual(Object.keys(JSON.parse(stored)).sort(), ['email', 'invite', 'savedAt', 'userId']);
  assert.deepEqual(decodePendingSignup(stored, now + 1), progress);
  assert.equal(/password|token|session|otp/i.test(stored), false);
});

test('rejects corrupted, expired, future and unexpected credential-bearing progress', () => {
  for (const value of [null, '{', 'null', '[]', 'x'.repeat(1025)]) assert.equal(decodePendingSignup(value, now), null);
  for (const patch of [{ savedAt: now - 3600001 }, { savedAt: now + 1 }, { userId: 'other' },
    { email: 'invalid' }, { invite: 'invalid' }, { password: 'SYNTHETIC-ONLY' }, { token: 'SYNTHETIC-ONLY' }]) {
    assert.equal(decodePendingSignup(JSON.stringify({ ...progress, savedAt: now, ...patch }), now), null);
  }
});

test('resumed progress cannot bypass real signup OTP or matching confirmed user', () => {
  const source = readFileSync(new URL('../../components/auth/AuthScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /decodePendingSignup\(window\.sessionStorage\.getItem\(PENDING_SIGNUP_KEY\)\)/);
  assert.match(source, /type: "signup"/);
  assert.match(source, /data\.user\?\.id !== registration\.userId/);
  assert.match(source, /!data\.user\.email_confirmed_at/);
  assert.match(source, /forgetPendingSignup\(\);\s*router\.replace\("\/account"\)/);
});
