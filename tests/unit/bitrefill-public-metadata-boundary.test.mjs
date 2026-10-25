import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as visibility from "../../lib/catalog/effective-category-visibility.mjs";

async function load(relative, deps) {
  const source = await readFile(new URL(relative, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = { exports: {} };
  new Function("require", "module", "exports", compiled)((n) => {
    assert.ok(n in deps, `Unmocked import: ${n}`); return deps[n];
  }, m, m.exports);
  return m.exports;
}
const privateMetadata = {
  supplier: "daju", supplier_max_unit_cost: "4.12", supplier_api_key: "SYNTHETIC_SECRET",
  supplier_binding_candidate: { supplier: "bitrefill", supplier_cost: "3.15", supplier_configured_fees: "0.12" },
  supplier_binding_audit: [{ actor: "SYNTHETIC_INTERNAL_ACTOR", before: { supplier_cost: "3.10" } }],
  profit_margin: "0.2", future_private_field: { password: "SYNTHETIC_SECRET" },
};
async function catalog(client = {}) {
  return load("../../lib/supabase/public-catalog.ts", {
    "@/lib/supabase/client": { getSupabaseBrowserClient: () => client },
    "@/lib/catalog/effective-category-visibility.mjs": visibility,
  });
}
test("public product and SKU DTOs never expose binding/cost/audit/secrets; navigation and public prices survive", async () => {
  const c = await catalog();
  const metadata = { ...privateMetadata, category_slug: "gift-cards", category_path: "gift-cards/us", category: "gift", subcategory_slug: "us" };
  const before = structuredClone(metadata);
  const row = { id: "mock-product", name: "MOCK", price: 20, stock: 8, slug: "mock-gift", status: "active", metadata };
  const product = c.normalizePublicProduct(row), sku = c.normalizePublicSku({ ...row, product_id: row.id });
  assert.deepEqual(product.metadata, { category: "gift", category_slug: "gift-cards", subcategory_slug: "us", category_path: "gift-cards/us" });
  assert.equal(sku.metadata, null);
  const card = c.mapPublicProductToProduct(row, "gift-cards", "Gift cards");
  assert.equal(card.price, 20); assert.equal(card.metadata.slug, "mock-gift"); assert.equal(card.metadata.minPrice, 20);
  for (const object of [product, sku, card]) {
    const json = JSON.stringify(object);
    for (const forbidden of ["supplier", "profit_margin", "SYNTHETIC_SECRET", "INTERNAL_ACTOR", "future_private_field", "3.15"]) assert.ok(!json.includes(forbidden), forbidden);
  }
  assert.deepEqual(metadata, before, "Projection must not modify authoritative bindings");
  for (const malformed of [null, [], "bad", { category_path: { supplier_cost: 10 } }, { category_path: "x".repeat(513) }]) assert.equal(c.publicProductMetadata(malformed), null);
});

test("actual public detail Route Handler redacts metadata on normal and service-role fallback paths", async () => {
  const c = await catalog();
  const id = "11111111-1111-4111-8111-111111111111";
  const product = { id, category_id: "mock-category", name: "MOCK", slug: "mock-gift", status: "active", price: 20, stock: 8, metadata: privateMetadata };
  const sku = { ...product, id: "mock-sku", product_id: id, metadata: privateMetadata };
  let fallback = false, serviceCalls = 0;
  function client(service = false) {
    return { from(table) {
      let single = false;
      const q = {
        select: () => q, eq: () => q, in: () => q, limit: () => q, order: () => q,
        maybeSingle: () => { single = true; return Promise.resolve(result()); },
        then: (ok, fail) => Promise.resolve(result()).then(ok, fail),
      };
      function result() {
        if (table === "products") return { data: fallback && !service ? null : single ? product : [product], error: null };
        if (table === "product_skus") return { data: [sku], error: null };
        assert.equal(table, "categories"); return { data: [{ id: "mock-category", level: 1, parent_id: null, is_active: true }], error: null };
      }
      return q;
    } };
  }
  const route = await load("../../app/api/catalog/products/[identifier]/route.ts", {
    crypto: await import("node:crypto"),
    "next/server": { NextResponse: { json: (b, o) => new Response(JSON.stringify(b), o) } },
    "@/lib/supabase/public-catalog": c,
    "@/lib/supabase/server": { getSupabaseServerClient: () => client() },
    "@/lib/supabase/service-role": { getSupabaseServiceRoleClient: () => { serviceCalls++; return client(true); } },
    "@/lib/catalog/effective-category-visibility.mjs": visibility,
  });
  // The UUID fallback can also consult the catalog list. Keep this loopback
  // dependency synthetic, never make a network request from this unit test.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: { products: [], totalPages: 1 } }));
  try {
    for (const mode of [false, true]) {
      fallback = mode;
      const response = await route.GET(new Request(`http://127.0.0.1/api/catalog/products/${id}`), { params: { identifier: id } });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.data.product.metadata, null); assert.equal(body.data.skus[0].metadata, null);
      assert.equal(body.data.product.price, 20); assert.equal(body.data.skus[0].stock, 8);
      assert.ok(!JSON.stringify(body).includes("supplier"));
    }
    assert.equal(serviceCalls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("browser-side legacy public reads do not request raw metadata from Supabase", async () => {
  const selects = [];
  const client = { from(table) {
    assert.equal(table, "products");
    const q = { select: (s) => { selects.push(s); return q; }, eq: () => q, limit: () => q,
      maybeSingle: async () => ({ data: { id: "mock", metadata: privateMetadata }, error: null }) };
    return q;
  } };
  const c = await catalog(client);
  const product = await c.getProductByIdOrSlug("mock");
  assert.equal(product.metadata, null);
  assert.equal(selects.length, 1); assert.ok(!selects[0].split(",").includes("metadata"));
});
