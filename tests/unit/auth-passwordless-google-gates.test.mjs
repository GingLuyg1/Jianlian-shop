import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const alternate=readFileSync('components/auth/AlternateLoginMethods.tsx','utf8');
const screen=readFileSync('components/auth/AuthScreen.tsx','utf8');
const callback=readFileSync('app/auth/callback/route.ts','utf8');

test('passwordless and Google UI stay behind explicit, default-OFF flags',()=>{
  assert.match(alternate,/NEXT_PUBLIC_EMAIL_OTP_ENABLED === "true"/);
  assert.match(alternate,/NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true"/);
  assert.match(alternate,/if \(!otpEnabled && !googleEnabled\) return null/);
  assert.match(screen,/AlternateLoginMethods/);
  assert.match(screen,/acceptedTerms=\{acceptedTerms\}/);
});
test('email OTP uses documented method, explicit account-creation policy and 6 digits',()=>{
  assert.match(alternate,/auth\.signInWithOtp/);
  assert.match(alternate,/shouldCreateUser: isRegister/);
  assert.match(alternate,/auth\.verifyOtp/);
  assert.match(alternate,/type: "email"/);
  assert.match(alternate,/const CODE = \/\^\\d\{6\}\$\//);
  assert.match(alternate,/autoComplete="one-time-code"/);
});
test('OAuth uses Google and existing same-site PKCE callback, not a second user store',()=>{
  assert.match(alternate,/auth\.signInWithOAuth\(/);
  assert.match(alternate,/provider: "google"/);
  assert.match(alternate,/redirectTo: callbackUrl\(redirectTo, inviteCode\)/);
  assert.match(callback,/exchangeCodeForSession/);
  assert.match(callback,/getSafeInternalRedirect/);
});
test('both new paths refuse restricted/unknown account status before navigation',()=>{
  assert.match(alternate,/validateAccountAccess\(supabase, data\.user\.id\)/);
  assert.match(alternate,/account_status === "disabled"/);
  assert.match(alternate,/risk_status === "blocked"/);
  assert.match(callback,/auth\.getUser\(\)/);
  assert.match(callback,/profile\.account_status === "disabled"/);
  assert.match(callback,/profile\.risk_status === "blocked"/);
  assert.match(callback,/auth\.signOut\(\)/);
});
test('signup both paths preserve invitation code without granting role or touching balances',()=>{
  assert.match(alternate,/data: \{ invite_code: inviteCode\.toUpperCase\(\) \}/);
  assert.match(alternate,/bind_referrer_by_code/);
  assert.match(callback,/bind_referrer_by_code/);
  assert.match(callback,/isNewSignup && INVITE_CODE\.test\(invite\)/);
  assert.match(alternate,/isRegister && isNewSignup && INVITE\.test\(inviteCode\)/);
  assert.match(alternate,/const INVITE = \/\^JL/);
  assert.match(callback,/const INVITE_CODE = \/\^JL/);
  assert.doesNotMatch(alternate,/\bservice_role\b|\badmin\b|\bbalance\s*=/);
});
test('OTP never logs code, email, access tokens or upstream exception',()=>{
  assert.doesNotMatch(alternate,/console\.(?:log|warn|error)\(/);
  assert.doesNotMatch(callback,/console\.(?:log|warn|error)\(/);
  assert.doesNotMatch(alternate,/localStorage|sessionStorage/);
});
test('new registration requires explicit terms confirmation',()=>{
  assert.match(alternate,/if \(!isRegister \|\| acceptedTerms\) return true/);
  assert.match(alternate,/if \(busy \|\| cooldown \|\| !requireTerms\(\)\) return/);
  assert.match(alternate,/if \(busy \|\| !requireTerms\(\)\) return/);
});
test('callback only writes login session cookies and existing profile/referrer RPC',()=>{
  assert.doesNotMatch(callback,/\bservice_role\b|update\(\{.*balance|insert\(\{.*role/);
  assert.match(callback,/\.from\("profiles"\)/);
  assert.match(callback,/maybeSingle\(\)/);
});
