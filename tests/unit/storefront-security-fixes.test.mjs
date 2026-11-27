import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const response = { NextResponse: { json: (body, init) => Response.json(body, init) } };

function load(file, imports = {}) {
  const source = readFileSync(new URL(file, root), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)((key) => {
    if (key === "next/server") return response;
    if (key === "server-only") return {};
    if (Object.hasOwn(imports, key)) return imports[key];
    if (["crypto", "node:crypto"].includes(key)) return require(key);
    throw Error("Unexpected dependency: " + key);
  }, mod, mod.exports);
  return mod.exports;
}

const rate = load("lib/security/rate-limit.ts");

test("email lookup requires a purpose-specific code, consumes it, and retains token lookup", async () => {
  const mail = [];
  let emailReads = 0;
  const codes = load("lib/security/email-code-service.ts", {
    "@/lib/email/provider": { sendEmail: async (message) => { mail.push(message); return { status: "sent" }; } },
  });
  const route = load("app/api/order-query/route.ts", {
    "@/lib/security/rate-limit": rate,
    "@/lib/security/email-code-service": codes,
    "@/lib/security/turnstile": {
      isTurnstileConfigured: () => true,
      getTurnstileSiteKey: () => "",
      verifyTurnstileToken: async (value) => ({ ok: value === "synthetic-human" }),
    },
    "@/lib/orders/order-token-delivery": { loadVerifiedTokenDeliveries: async () => [{ id: "delivery-test" }] },
    "@/lib/orders/order-query-service": {
      lookupGuestOrder: async () => ({ ok: true, order: { paymentStatus: "paid" } }),
      lookupGuestOrdersByEmail: async () => { emailReads++; return { ok: true, orders: [{ orderNo: "fixture" }] }; },
    },
  });
  const email = "visitor@example.test";
  const post = (body) => route.POST(new Request("https://fixture.test/api/order-query", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, ...body }),
  }));
  assert.equal((await post({ mode: "email" })).status, 403);
  assert.equal(emailReads, 0);
  const start = await post({ mode: "email_request", turnstileToken: "synthetic-human" });
  assert.deepEqual(await start.json(), { status: "verification_required" });
  assert.equal(mail.length, 1);
  assert.equal(emailReads, 0);
  const code = mail[0].text.match(/\d{6}/)[0];
  assert.equal((await post({ mode: "email", email: "someone-else@example.test", emailCode: code })).status, 403);
  assert.equal((await post({ mode: "email", emailCode: code })).status, 200);
  assert.equal((await post({ mode: "email", emailCode: code })).status, 403);
  assert.equal(emailReads, 1);
  const token = await post({ email: "", orderNo: "fixture", queryToken: "synthetic-token" });
  assert.deepEqual((await token.json()).order.deliveries, [{ id: "delivery-test" }]);
});

test("bounded JSON rejects an over-limit stream without Content-Length", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"x":"'));
      controller.enqueue(new TextEncoder().encode("a".repeat(100)));
      controller.close();
    },
  });
  const request = new Request("https://fixture.test/", { method: "POST", body, duplex: "half" });
  const result = await rate.readBoundedJsonBody(request, 32);
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 413);
});

test("Bitrefill GET runs dry, POST applies server policy, and shared keys do not authorize", async (t) => {
  const before = process.env.BITREFILL_COST_SYNC_JOB_SECRET;
  const retail = process.env.BITREFILL_COST_SYNC_UPDATE_RETAIL_PRICE;
  process.env.BITREFILL_COST_SYNC_JOB_SECRET = "dedicated-fixture";
  delete process.env.BITREFILL_COST_SYNC_UPDATE_RETAIL_PRICE;
  t.after(() => {
    if (before === undefined) delete process.env.BITREFILL_COST_SYNC_JOB_SECRET;
    else process.env.BITREFILL_COST_SYNC_JOB_SECRET = before;
    if (retail === undefined) delete process.env.BITREFILL_COST_SYNC_UPDATE_RETAIL_PRICE;
    else process.env.BITREFILL_COST_SYNC_UPDATE_RETAIL_PRICE = retail;
  });
  const calls = [];
  const route = load("app/api/internal/bitrefill-cost-sync/route.ts", {
    "@/lib/providers/bitrefill/cost-sync-service": {
      syncBitrefillCostsAndRates: async (_, options) => { calls.push(options); return {}; },
    },
    "@/lib/supabase/service-role": { getSupabaseServiceRoleClient: () => ({}) },
  });
  const request = (token, search = "") => new Request("https://fixture.test/internal" + search, {
    headers: { authorization: "Bearer " + token },
  });
  assert.equal((await route.POST(request("shared-fixture"))).status, 401);
  assert.equal((await route.GET(request("dedicated-fixture", "?mode=apply"))).status, 400);
  assert.equal((await route.GET(request("dedicated-fixture"))).status, 200);
  assert.equal((await route.POST(request("dedicated-fixture"))).status, 200);
  assert.deepEqual(calls, [
    { mode: "dry_run", updateRetailPrice: false, notifyOnAnomaly: false },
    { mode: "apply", updateRetailPrice: false, notifyOnAnomaly: true },
  ]);
});

test("customer delivery GET has no supplier or compensation dependency", async () => {
  const service = { from() { throw Error("diagnostic read failure"); } };
  const handler = load("app/api/orders/[orderNo]/delivery/route.ts", {
    "@/lib/orders/order-queries": { getOrderErrorMessage: () => "fixture" },
    "@/lib/supabase/server": {
      hasSupabaseServerConfig: () => true,
      getSupabaseServerClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: "fixture" } } }) },
        rpc: async () => ({ data: [], error: null }),
      }),
    },
    "@/lib/supabase/service-role": { getSupabaseServiceRoleClient: () => service },
    "@/lib/users/account-guard": { assertUserBusinessAllowed: async () => undefined, isAccountRestrictionError: () => false },
  });
  const reply = await handler.GET(new Request("https://fixture.test/delivery"), {
    params: Promise.resolve({ orderNo: "fixture" }),
  });
  assert.equal((await reply.json()).status, "pending");
});

test("delivery recovery fails closed on missing or unreadable fulfillment state", async (t) => {
  const original = process.env.INTERNAL_DELIVERY_RECOVERY_SECRET;
  process.env.INTERNAL_DELIVERY_RECOVERY_SECRET = "recovery-fixture-secret";
  t.after(() => {
    if (original === undefined) delete process.env.INTERNAL_DELIVERY_RECOVERY_SECRET;
    else process.env.INTERNAL_DELIVERY_RECOVERY_SECRET = original;
  });
  let localCalls = 0;
  let requestState = { count: null, error: { code: "FIXTURE_READ_FAILURE" } };
  const service = {
    from(table) {
      if (table === "orders") return { select: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: {
          status: "paid", payment_status: "paid", delivery_type: "automatic",
          paid_at: new Date(Date.now() - 20_000).toISOString(),
        } }),
      }) }) };
      assert.equal(table, "supplier_fulfillment_requests");
      return { select: () => ({ eq: async () => requestState }) };
    },
    rpc: async (name) => { assert.equal(name, "deliver_digital_order"); localCalls++; return { error: null }; },
  };
  const noAttempts = { handled: 0, fulfilled: 0 };
  const route = load("app/api/internal/orders/delivery-recovery/route.ts", {
    "@/lib/security/rate-limit": rate,
    "@/lib/supabase/service-role": { getSupabaseServiceRoleClient: () => service },
    "@/lib/providers/bitrefill/live-fulfillment": { reconcileBitrefillOrder: async () => noAttempts },
    "@/lib/providers/kuajingzy/purchase-server": {
      createKuajingZyProductionRuntime: () => ({ reconcileExistingOrder: async () => noAttempts }),
    },
  });
  const post = (secret) => route.POST(new Request("https://fixture.test/internal", {
    method: "POST",
    headers: { authorization: "Bearer " + secret },
    body: JSON.stringify({ orderId: "00000000-0000-4000-8000-000000000001" }),
  }));
  assert.equal((await post("other-task-secret")).status, 401);
  assert.equal((await post("recovery-fixture-secret")).status, 503);
  assert.equal(localCalls, 0);
  requestState = { count: 1, error: null };
  assert.equal((await (await post("recovery-fixture-secret")).json()).status, "manual_review");
  assert.equal(localCalls, 0);
  requestState = { count: 0, error: null };
  assert.equal((await (await post("recovery-fixture-secret")).json()).status, "local_delivery_checked");
  assert.equal(localCalls, 1);
});

test("admin capabilities require an active grant and boolean permission", () => {
  const { hasAdminCapability } = load("lib/auth/require-admin.ts", {
    "@/lib/supabase/server": {},
    "@/lib/supabase/service-role": {},
  });
  const admin = { status: "active", admin_level: "admin", permissions: { "orders.write": true, "delivery.manual": "true" } };
  assert.equal(hasAdminCapability(admin, "orders.write"), true);
  assert.equal(hasAdminCapability(admin, "delivery.manual"), false);
  assert.equal(hasAdminCapability({ ...admin, status: "disabled" }, "orders.write"), false);
  assert.equal(hasAdminCapability({ ...admin, admin_level: "super_admin" }, "delivery.manual"), true);
  assert.equal(hasAdminCapability(null, "orders.write"), false);
});

test("ordinary report export masks contact emails and preserves CSV escaping", () => {
  const { buildCsv } = load("lib/reports/business-reports.ts", {
    "@/lib/i18n/datetime": { formatDateTime: () => "2026-11-27" },
    "@/lib/i18n/money": { normalizeAmount: (amount) => amount, formatAmountWithCurrency: (amount) => String(amount) },
  });
  const report = { raw: { orders: [{ order_no: "JTEST", customer_email: "alice@example.test", total_amount: 1 }] } };
  assert.match(buildCsv("orders", report), /"a\*\*\*"/);
  assert.doesNotMatch(buildCsv("orders", report), /alice@example\.test/);
  assert.match(buildCsv("orders", report, true), /alice@example\.test/);
});
