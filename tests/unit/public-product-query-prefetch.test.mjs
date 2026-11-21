import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";

function harness({ saveData = false, visibility = "visible", effectiveType = "4g" } = {}) {
  const calls = [];
  const previews = [];
  const countHints = [];
  let now = 1000;
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(new URL("../../lib/catalog/public-product-query-cache.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mockRequire = (id) => {
    if (id.endsWith("public-catalog")) return {
      getChildCategories: (rows, id) => rows.filter(row => row.parent_id === id),
      searchPublicCatalogProducts: query => new Promise((resolve, reject) => calls.push({ query, resolve, reject })),
    };
    if (id.endsWith("public-product-preview")) return { rememberPublicProductPreview(product) { previews.push(product); }, clearPublicProductPreviews() { previews.length = 0; } };
    if (id.endsWith("public-product-count-cache")) return { rememberPublicProductCount(...args) { countHints.push(args); } };
    if (id.endsWith("visible-storefront-category-routes")) return { findVisibleStorefrontPrimaryCategory: (_href, rows) => rows[0] };
    throw new Error(`Unexpected dependency: ${id}`);
  };
  new Function("require", "module", "exports", "document", "navigator", "Date", code)(mockRequire, module, module.exports,
    { visibilityState: visibility }, { connection: { saveData, effectiveType } }, { now: () => now });
  return { api: module.exports, calls, previews, countHints, advance: ms => { now += ms; } };
}
const query = { primaryCategoryId: "primary-a", secondaryCategoryId: "secondary-a", keyword: "", page: 1, pageSize: 20 };
const result = { products: [{ id: "old-product", price: 10, stock: 1 }], total: 1, page: 1, pageSize: 20, totalPages: 1, deliveryTypes: [] };

const updated = { ...result, products: [{ id: "new-product", price: 12, stock: 5 }], total: 2 };

async function seedPage(api, calls) {
  const request = api.getPublicProductPage(query);
  calls.at(-1).resolve(result);
  await request;
}

test("hover and click share one request and refresh at the exact fresh TTL", async () => {
  const { api, calls, advance } = harness();
  const hover = api.prefetchPublicProductPage(query);
  const click = api.getPublicProductPage(query);
  assert.equal(calls.length, 1);
  calls[0].resolve(result);
  assert.equal(await hover, true);
  assert.equal(await click, result);
  advance(14_999);
  assert.equal(await api.prefetchPublicProductPage(query), true);
  assert.equal(await api.getPublicProductPage(query), result);
  assert.equal(calls.length, 1);

  advance(1);
  assert.equal(api.peekPublicProductPage(query), result);
  const staleHover = api.prefetchPublicProductPage(query);
  const staleClick = api.getPublicProductPage(query);
  assert.equal(calls.length, 2);
  assert.equal(await Promise.race([staleClick, Promise.resolve("pending")]), "pending");
  assert.equal(api.peekPublicProductPage(query), result);
  calls[1].resolve(updated);
  assert.equal(await staleClick, updated);
  assert.equal(await staleHover, true);
  assert.equal(api.peekPublicProductPage(query), updated);
});

test("stale foreground access paints cached rows and returns refreshed rows", async () => {
  const { api, calls, advance } = harness();
  await seedPage(api, calls);
  advance(15_000);
  assert.equal(api.peekPublicProductPage(query), result);
  const refresh = api.getPublicProductPage(query);
  assert.equal(calls.length, 2);
  calls[1].resolve(updated);
  assert.equal(await refresh, updated);
});

test("failed stale refresh leaves its original age and permits the next prefetch and foreground attempt", async () => {
  const { api, calls, advance } = harness();
  await seedPage(api, calls);
  advance(15_000);
  const refresh = api.getPublicProductPage(query);
  calls[1].reject(new Error("offline"));
  assert.equal(await refresh, result);

  const prefetch = api.prefetchPublicProductPage(query);
  assert.equal(calls.length, 3);
  calls[2].reject(new Error("still offline"));
  assert.equal(await prefetch, false);

  const retry = api.getPublicProductPage(query);
  assert.equal(calls.length, 4);
  calls[3].resolve(updated);
  assert.equal(await retry, updated);
});

test("the stale display window expires at 30 minutes even during a failed refresh", async () => {
  const { api, calls, advance } = harness();
  await seedPage(api, calls);
  advance(1_799_999);
  assert.equal(api.peekPublicProductPage(query), result);
  const refresh = api.getPublicProductPage(query);
  advance(1);
  assert.equal(api.peekPublicProductPage(query), undefined);
  calls[1].reject(new Error("offline"));
  await assert.rejects(refresh, /offline/);

  const expired = api.getPublicProductPage(query);
  assert.equal(calls.length, 3);
  assert.equal(await Promise.race([expired, Promise.resolve("pending")]), "pending");
  calls[2].resolve(updated);
  assert.equal(await expired, updated);
});

for (const operation of ["clear", "forget"]) {
  test(`${operation} during stale refresh prevents late cache and preview writes`, async () => {
    const { api, calls, previews, advance } = harness();
    await seedPage(api, calls);
    advance(15_000);
    const refresh = api.getPublicProductPage(query);
    if (operation === "clear") api.clearPublicProductPages();
    else api.forgetPublicProductPage(query);
    calls[1].resolve(updated);
    assert.equal(await refresh, updated);
    assert.equal(api.peekPublicProductPage(query), undefined);
    assert.deepEqual(previews, operation === "clear" ? [] : result.products);

    const retry = api.getPublicProductPage(query);
    assert.equal(calls.length, 3);
    calls[2].resolve(updated);
    assert.equal(await retry, updated);
  });
}

test("a late default route refresh cannot publish count hints after its entry is forgotten", async () => {
  const { api, calls, countHints, advance } = harness();
  await seedPage(api, calls);
  advance(15_000);
  const rows = [{ id: "primary-a" }, { id: "secondary-a", parent_id: "primary-a" }];
  const refresh = api.prefetchDefaultPublicProductPage("/products/sim-cards", rows);
  assert.equal(calls.length, 2);
  api.forgetPublicProductPage(query);
  const replacement = api.getPublicProductPage(query);
  assert.equal(calls.length, 3);

  calls[2].resolve(updated);
  assert.equal(await replacement, updated);
  calls[1].resolve(result);
  assert.equal(await refresh, false);
  assert.equal(api.peekPublicProductPage(query), updated);
  assert.deepEqual(countHints, []);
});

test("catalog selection paints cached rows and commits the awaited result under its request guard", () => {
  const page = fs.readFileSync(new URL("../../components/products/SupabaseMallContent.tsx", import.meta.url), "utf8");
  const select = page.slice(page.indexOf("function handleCategorySelect"), page.indexOf("function handlePendingCategorySelect"));
  assert.match(select, /const cached = peekPublicProductPage\(query\);\s*if \(cached\) \{\s*setProducts\(\s*cached.products.map/);
  assert.match(select, /setTotal\(cached.total\)/);
  assert.doesNotMatch(select, /setProducts\(\[\]\)|setTotal\(0\)/);
  const load = page.slice(page.indexOf("async function loadProducts"), page.indexOf("void loadProducts()"));
  assert.match(load, /if \(products.length === 0\) \{[^}]*setProducts\(\[\]\)/);
  assert.match(load, /await getPublicProductPage\(query\);\s*if \(!mounted \|\| requestId !== productRequestIdRef.current\) return;/);
  assert.match(load, /setProducts\(\s*result.products.map[\s\S]*?setTotal\(result.total\)/);
});

test("background budget limits speculative traffic without blocking foreground selection", async () => {
  const { api, calls } = harness();
  const a = api.prefetchPublicProductPage(query);
  const b = api.prefetchPublicProductPage({ ...query, secondaryCategoryId: "b" });
  assert.equal(await api.prefetchPublicProductPage({ ...query, secondaryCategoryId: "c" }), false);
  const foreground = api.getPublicProductPage({ ...query, secondaryCategoryId: "c" });
  assert.equal(calls.length, 3);
  calls.forEach(call => call.resolve(result));
  await Promise.all([a, b, foreground]);
});

test("save-data, slow network and hidden page suppress optional prefetch", async () => {
  for (const options of [{ saveData: true }, { effectiveType: "2g" }, { visibility: "hidden" }]) {
    const { api, calls } = harness(options);
    assert.equal(await api.prefetchPublicProductPage(query), false);
    assert.equal(calls.length, 0);
  }
});

test("failed prefetch cannot poison a later explicit query", async () => {
  const { api, calls } = harness();
  const failed = api.prefetchPublicProductPage(query);
  calls[0].reject(new Error("offline"));
  assert.equal(await failed, false);
  assert.equal(api.peekPublicProductPage(query), undefined);
  const retry = api.getPublicProductPage(query);
  assert.equal(calls.length, 2);
  calls[1].resolve(result);
  assert.equal(await retry, result);
});

test("every listing filter has its own cache identity", () => {
  const { api } = harness();
  const variants = [query, { ...query, primaryCategoryId: "other" }, { ...query, secondaryCategoryId: "other" },
    { ...query, keyword: "search" }, { ...query, page: 2 }, { ...query, pageSize: 10 }, { ...query, excludeId: "excluded" }];
  assert.equal(new Set(variants.map(api.publicProductQueryKey)).size, variants.length);
});
