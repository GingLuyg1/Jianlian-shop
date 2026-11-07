import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import ts from "typescript";
import { loadPureTypeScript } from "../helpers/load-pure-typescript.mjs";

const root = new URL("../../", import.meta.url);
function load(file, imports) {
  const code = ts.transpileModule(readFileSync(new URL(file, root), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    if (!Object.hasOwn(imports, name)) throw Error("UNMOCKED_IMPORT:" + name);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
const intent = load("lib/auth/google-signup-intent.ts", { "node:crypto": crypto });
const redirects = loadPureTypeScript(new URL("../../lib/auth/redirect.ts", import.meta.url));
const origins = loadPureTypeScript(new URL("../../lib/auth/site-origin.ts", import.meta.url));
const secret = "SYNTHETIC-ONLY-".repeat(5);
const invite = "JLABC123";
const now = Date.now();
const cookie = () => intent.signGoogleSignupIntent(invite, secret, now - 10000);
function response(body, status = 200) {
  return { body, status, headers: new Headers(), cookies: { values: new Map(), set(k, v, options) { this.values.set(k, { value: v, ...options }); } } };
}
const next = { NextResponse: { redirect: url => response(null, 307 + 0 * String(url).length), json: (body, options) => response(body, options?.status ?? 200) } };
// Redirect responses carry the same Location surface used by NextResponse.
next.NextResponse.redirect = url => { const out = response(null, 307); out.headers.set("location", String(url)); return out; };

function callbackFixture(options = {}) {
  const stats = { exchange: 0, signOut: 0, binds: [] };
  const client = {
    auth: {
      async exchangeCodeForSession() { stats.exchange++; return { error: options.exchangeError ?? null }; },
      async getUser() {
        if (options.throwUser) throw Error("SYNTHETIC-SENSITIVE-DETAIL");
        return { data: { user: options.noUser ? null : { id: "fixture-user", created_at: options.createdAt ?? new Date(now - 5000).toISOString(), app_metadata: { provider: "google" } } }, error: null };
      },
      async signOut(options) { assert.deepEqual(options, { scope: "local" }); stats.signOut++; },
    },
    from(table) {
      assert.equal(table, "profiles");
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({
        data: options.noProfile ? null : { account_status: options.disabled ? "disabled" : "active", risk_status: options.blocked ? "blocked" : "normal" },
        error: options.profileError ?? null,
      }) }; return q;
    },
    async rpc(name, args) { assert.equal(name, "bind_referrer_by_code"); stats.binds.push(args); return { error: options.bindError ?? null }; },
  };
  const module = load("app/auth/callback/route.ts", {
    "next/server": next, "@/lib/auth/redirect": redirects, "@/lib/auth/google-signup-intent": intent,
    "@/lib/supabase/server": { getSupabaseServerClient: () => client, hasSupabaseServerConfig: () => true },
  });
  return { stats, async run(value, query) {
    const previous = process.env.AUTH_OAUTH_INTENT_SECRET;
    process.env.AUTH_OAUTH_INTENT_SECRET = secret;
    const parsed = value ? intent.readGoogleSignupIntent(value, secret) : null;
    const suffix = query ?? `?code=fixture&next=%2Faccount${parsed ? "&signup_nonce=" + parsed.nonce : ""}`;
    try { return await module.GET({ url: "http://localhost:3040/auth/callback" + suffix, cookies: { get: () => value ? { value } : undefined } }); }
    finally { if (previous === undefined) delete process.env.AUTH_OAUTH_INTENT_SECRET; else process.env.AUTH_OAUTH_INTENT_SECRET = previous; }
  } };
}

test("callback origins preserve loopback ports and allow only existing first-party hosts", () => {
  assert.equal(origins.getAuthSiteOrigin("http://localhost:3040"), "http://localhost:3040");
  assert.equal(origins.getAuthSiteOrigin("http://127.0.0.1:3041"), "http://127.0.0.1:3041");
  assert.equal(origins.getAuthSiteOrigin("https://jianlian.shop"), "https://jianlian.shop");
  for (const value of ["https://jianlian.shop.evil.test", "https://attacker@jianlian.shop", "http://jianlian.shop", "https://www.jianlian.shop:8443"]) {
    assert.equal(origins.getAuthSiteOrigin(value), "https://www.jianlian.shop");
  }
});

test("signed invitation rejects tampering, missing secret, malformed payload and expiry", () => {
  const value = cookie();
  assert.equal(intent.readGoogleSignupIntent(value, secret, now).invite, invite);
  assert.equal(intent.readGoogleSignupIntent(value + "X", secret, now), null);
  assert.equal(intent.readGoogleSignupIntent(value, "different-secret".repeat(4), now), null);
  assert.equal(intent.readGoogleSignupIntent(value, undefined, now), null);
  assert.equal(intent.readGoogleSignupIntent(value, secret, now + 601000), null);
  assert.equal(intent.readGoogleSignupIntent("{bad}.x", secret, now), null);
  assert.throws(() => intent.signGoogleSignupIntent(invite, undefined), /UNAVAILABLE/);
});

test("genuinely new Google account binds only the signed invitation and clears it", async () => {
  const h = callbackFixture(); const out = await h.run(cookie());
  assert.equal(new URL(out.headers.get("location")).pathname, "/account");
  assert.deepEqual(h.stats.binds, [{ input_invite_code: invite }]);
  assert.equal(out.cookies.values.get(intent.GOOGLE_SIGNUP_COOKIE).maxAge, 0);
});

test("even a 30-second-old existing Google account cannot retroactively bind", async () => {
  const h = callbackFixture({ createdAt: new Date(now - 30000).toISOString() });
  const out = await h.run(cookie());
  assert.equal(h.stats.binds.length, 0); assert.equal(h.stats.signOut, 0);
  assert.equal(new URL(out.headers.get("location")).pathname, "/account");
});

test("unsigned URL invitation is not authority, and external next cannot redirect off-site", async () => {
  const h = callbackFixture(); const out = await h.run(null, "?code=x&invite=JLABC123&next=https://evil.test");
  assert.equal(h.stats.binds.length, 0);
  assert.equal(out.headers.get("location"), "http://localhost:3040/account");
});

test("a different simultaneous OAuth flow cannot consume another signed signup intent", async () => {
  const h = callbackFixture(); const out = await h.run(cookie(), "?code=x&signup_nonce=wrong-flow");
  assert.equal(new URL(out.headers.get("location")).searchParams.get("auth_error"), "invite");
  assert.equal(h.stats.signOut, 1); assert.deepEqual(h.stats.binds, []);
});

for (const [name, options] of Object.entries({
  disabled: { disabled: true }, blocked: { blocked: true }, missingProfile: { noProfile: true },
  profileError: { profileError: { code: "FIXTURE" } }, missingUser: { noUser: true }, networkFailure: { throwUser: true },
})) {
  test(`${name} callback clears session and cannot bind or enter account`, async () => {
    const h = callbackFixture(options); const out = await h.run(cookie());
    assert.equal(new URL(out.headers.get("location")).searchParams.get("auth_error"), "restricted");
    assert.equal(h.stats.signOut, 1); assert.deepEqual(h.stats.binds, []);
    assert.equal(out.cookies.values.get(intent.GOOGLE_SIGNUP_COOKIE).maxAge, 0);
  });
}

test("invalid exchange, corrupted intent and failed binding stop without exposing detail", async () => {
  for (const [options, value, reason] of [[{ exchangeError: { message: "SECRET-FIXTURE" } }, cookie(), "invalid_link"],
    [{}, cookie() + "X", "invite"], [{ bindError: { message: "SECRET-FIXTURE" } }, cookie(), "invite"]]) {
    const h = callbackFixture(options); const out = await h.run(value);
    assert.equal(new URL(out.headers.get("location")).searchParams.get("auth_error"), reason);
    assert.equal(h.stats.signOut, 1);
    assert.doesNotMatch(out.headers.get("location"), /SECRET-FIXTURE/);
  }
});

function startFixture() {
  const stats = { oauth: 0 };
  const module = load("app/api/auth/google/route.ts", {
    "next/server": next, "@/lib/auth/redirect": redirects, "@/lib/auth/site-origin": origins,
    "@/lib/auth/google-signup-intent": intent,
    "@/lib/supabase/server": { hasSupabaseServerConfig: () => true, getSupabaseServerClient: () => ({ auth: { async signInWithOAuth(input) {
      stats.oauth++; assert.equal(input.provider, "google"); assert.equal(input.options.skipBrowserRedirect, true);
      assert.equal(new URL(input.options.redirectTo).origin, "http://localhost:3040");
      return { data: { url: "https://example.supabase.co/auth/v1/authorize?provider=google" }, error: null };
    } } }) },
    "@/lib/security/rate-limit": { checkRequestSize: () => null, checkRateLimit: () => ({ allowed: true }), getRequestSourceKey: () => "synthetic-source" },
  });
  return { stats, async run(body, { origin = "http://localhost:3040", enabled = true, signingSecret = secret } = {}) {
    const previous = [process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED, process.env.AUTH_OAUTH_INTENT_SECRET];
    process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = String(enabled);
    if (signingSecret === null) delete process.env.AUTH_OAUTH_INTENT_SECRET; else process.env.AUTH_OAUTH_INTENT_SECRET = signingSecret;
    try { return await module.POST(new Request("http://localhost:3040/api/auth/google", {
      method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
    })); } finally {
      for (const [i, key] of ["NEXT_PUBLIC_GOOGLE_AUTH_ENABLED", "AUTH_OAUTH_INTENT_SECRET"].entries()) {
        if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i];
      }
    }
  } };
}

test("Google start signs a server timestamp only after signup terms and safe invitation", async () => {
  const h = startFixture(); const out = await h.run({ mode: "register", acceptedTerms: true, invite, next: "//evil.test" });
  assert.equal(out.status, 200); assert.equal(h.stats.oauth, 1);
  const saved = out.cookies.values.get(intent.GOOGLE_SIGNUP_COOKIE);
  assert.equal(saved.httpOnly, true); assert.equal(saved.path, "/auth");
  assert.equal(intent.readGoogleSignupIntent(saved.value, secret).invite, invite);
  assert.equal(out.headers.get("cache-control"), "no-store");
});

for (const [name, body, config, expected] of [
  ["off switch", { mode: "login" }, { enabled: false }, 503],
  ["cross origin", { mode: "login" }, { origin: "https://evil.test" }, 403],
  ["missing terms", { mode: "register", invite }, {}, 400],
  ["invalid invite", { mode: "register", acceptedTerms: true, invite: "bad" }, {}, 400],
  ["missing signing secret", { mode: "register", acceptedTerms: true, invite }, { signingSecret: null }, 503],
]) {
  test(`${name} starts no OAuth request`, async () => {
    const h = startFixture(); const out = await h.run(body, config);
    assert.equal(out.status, expected); assert.equal(h.stats.oauth, 0);
  });
}

test("returning Google login ignores supplied invite and clears stale signup intent", async () => {
  const h = startFixture(); const out = await h.run({ mode: "login", invite, next: "/account" }, { signingSecret: null });
  assert.equal(out.status, 200); assert.equal(h.stats.oauth, 1);
  assert.equal(out.cookies.values.get(intent.GOOGLE_SIGNUP_COOKIE).maxAge, 0);
});
