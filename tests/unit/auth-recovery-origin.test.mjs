import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { loadPureTypeScript } from "../helpers/load-pure-typescript.mjs";
const { getAuthRecoveryRedirectTo } = loadPureTypeScript(new URL("../../lib/auth/site-origin.ts", import.meta.url));
for (const origin of ["http://localhost:3000", "http://localhost:3040", "http://127.0.0.1:3040", "https://jianlian.shop", "https://www.jianlian.shop"]) {
  test(`recovery retains approved origin ${origin}`, () => {
    const result = new URL(getAuthRecoveryRedirectTo(origin));
    assert.equal(result.origin, origin);
    assert.equal(result.pathname, "/auth/callback");
    assert.equal(result.searchParams.get("next"), "/reset-password");
  });
}
test("recovery rejects lookalike loopback hosts and credential-bearing origins", () => {
  for (const origin of ["http://localhost.attacker.example:3040", "https://user:secret@jianlian.shop", "https://attacker.example", "not a URL"]) {
    assert.equal(new URL(getAuthRecoveryRedirectTo(origin)).origin, "https://www.jianlian.shop");
  }
});
test("server recovery fallback keeps canonical production callback", () => {
  assert.equal(getAuthRecoveryRedirectTo(), "https://www.jianlian.shop/auth/callback?next=%2Freset-password");
});
test("recovery callback accepts an email user without Google signup intent", async () => {
  const redirect = loadPureTypeScript(new URL("../../lib/auth/redirect.ts", import.meta.url));
  let exchange = 0;
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { account_status: "active", risk_status: "normal" }, error: null }) };
  const client = {
    auth: {
      exchangeCodeForSession: async () => { exchange++; return { error: null }; },
      getUser: async () => ({ data: { user: { id: "synthetic-recovery-user", app_metadata: { provider: "email" }, identities: [{ provider: "email" }] } }, error: null }),
      signOut: async () => { throw Error("RECOVERY_SHOULD_NOT_SIGN_OUT"); },
    },
    from: () => query,
    rpc: async () => { throw Error("RECOVERY_SHOULD_NOT_BIND_INVITER"); },
  };
  const imports = {
    "next/server": { NextResponse: { redirect: u => ({ headers: new Headers({ location: String(u) }), cookies: { set() {} } }) } },
    "@/lib/auth/redirect": redirect,
    "@/lib/supabase/server": { hasSupabaseServerConfig: () => true, getSupabaseServerClient: () => client },
    "@/lib/auth/google-signup-intent": { GOOGLE_SIGNUP_COOKIE: "synthetic-intent", readGoogleSignupIntent: () => { throw Error("NO_GOOGLE_COOKIE"); }, isGoogleSignupAfterIntent: () => false },
  };
  const code = ts.transpileModule(readFileSync(new URL("../../app/auth/callback/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(name => { if (!(name in imports)) throw Error("UNEXPECTED_IMPORT"); return imports[name]; }, mod, mod.exports);
  const response = await mod.exports.GET({ url: "http://localhost:3040/auth/callback?code=synthetic&next=%2Freset-password", cookies: { get: () => undefined } });
  assert.equal(response.headers.get("location"), "http://localhost:3040/reset-password");
  assert.equal(exchange, 1);
});

