import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const alternate=readFileSync('components/auth/AlternateLoginMethods.tsx','utf8');
const screen=readFileSync('components/auth/AuthScreen.tsx','utf8');
const binding=readFileSync('app/account/security/page.tsx','utf8');
const verification=readFileSync('components/auth/EmailVerificationForm.tsx','utf8');
const callback=readFileSync('app/auth/callback/route.ts','utf8');
const googleStart=readFileSync('app/api/auth/google/route.ts','utf8');

test('login keeps password and gated Google without passwordless email',()=>{
  assert.match(alternate,/NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true"/);
  assert.match(alternate,/if \(!googleEnabled\) return null/);
  assert.match(screen,/auth\.signInWithPassword/);
  assert.doesNotMatch(screen + alternate + binding,/signInWithOtp|NEXT_PUBLIC_EMAIL_OTP_ENABLED/);
});
test('password signup waits for its own confirmed user before account access',()=>{
  assert.match(screen,/auth\.signUp\(\{\s*email: normalizedEmail,\s*password/);
  assert.match(screen,/if \(data\.session\) \{\s*await supabase\.auth\.signOut/);
  assert.match(screen,/email: registration\.email,\s*token: code,\s*type: "signup"/);
  assert.match(screen,/data\.user\?\.id !== registration\.userId \|\| !data\.user\.email_confirmed_at/);
  assert.match(screen,/auth\.resend\(\{\s*type: "signup",\s*email: registration\.email/);
  assert.match(verification,/autoComplete="one-time-code"/);
});
test('initial email binding verifies the pending address on the same authenticated account',()=>{
  assert.match(binding,/if \(busy \|\| !account \|\| account\.email\) return/);
  assert.match(binding,/auth\.updateUser\(\{ email: address \}\)/);
  assert.match(binding,/email: pendingEmail,\s*token: code,\s*type: "email_change"/);
  assert.match(binding,/user\?\.id !== account\.id \|\| user\.email\?\.toLowerCase\(\) !== pendingEmail \|\| !user\.email_confirmed_at/);
});

test('OAuth uses Google and existing same-site PKCE callback, not a second user store',()=>{
  assert.match(alternate,/fetch\("\/api\/auth\/google"/);
  assert.match(googleStart,/auth\.signInWithOAuth\(/);
  assert.match(googleStart,/provider: "google"/);
  assert.match(googleStart,/redirectTo: callback\.toString\(\)/);
  assert.match(callback,/exchangeCodeForSession/);
  assert.match(callback,/getSafeInternalRedirect/);
});
test('both new paths refuse restricted/unknown account status before navigation',()=>{
  assert.match(screen,/getLoginRestrictionMessage\(supabase, data\.user\.id, true\)/);
  assert.match(screen,/account_status === "disabled"/);
  assert.match(screen,/risk_status === "blocked"/);
  assert.match(callback,/auth\.getUser\(\)/);
  assert.match(callback,/profile\.account_status === "disabled"/);
  assert.match(callback,/profile\.risk_status === "blocked"/);
  assert.match(callback,/auth\.signOut\(\{ scope: "local" \}\)/);
});
test('signup both paths preserve invitation code without granting role or touching balances',()=>{
  assert.match(screen,/invite_code: normalizedInviteCode/);
  assert.match(screen,/input_invite_code: registration\.invite/);
  assert.match(callback,/bind_referrer_by_code/);
  assert.match(callback,/intent && isGoogle && isGoogleSignupAfterIntent/);
  assert.match(googleStart,/signGoogleSignupIntent/);
  assert.doesNotMatch(callback,/15 \* 60|searchParams\.get\("invite"\)/);
  assert.doesNotMatch(alternate,/\bservice_role\b|\badmin\b|\bbalance\s*=/);
});
test('OTP never logs code, email, access tokens or upstream exception',()=>{
  assert.doesNotMatch(alternate,/console\.(?:log|warn|error)\(/);
  assert.doesNotMatch(callback,/console\.(?:log|warn|error)\(/);
  assert.doesNotMatch(alternate,/localStorage|sessionStorage/);
});
test('new registration requires explicit terms confirmation',()=>{
  assert.match(alternate,/if \(isRegister && !acceptedTerms\)/);
  assert.match(screen,/if \(!acceptedTerms\)/);
});

test('callback only writes login session cookies and existing profile/referrer RPC',()=>{
  assert.doesNotMatch(callback,/\bservice_role\b|update\(\{.*balance|insert\(\{.*role/);
  assert.match(callback,/\.from\("profiles"\)/);
  assert.match(callback,/maybeSingle\(\)/);
});
