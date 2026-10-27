// Authorized public catalog GET only. Never queries balances/invoices/orders.
import { mkdir, writeFile } from "node:fs/promises";
import { createPersonalCatalogClient } from "../lib/providers/bitrefill/personal-catalog-client.mjs";
import { createBitrefillCatalogManager } from "../lib/providers/bitrefill/catalog-management.mjs";
import { parseBitrefillProduct } from "../lib/providers/bitrefill/protocol.mjs";
import { readCatalogDiagnosticBody } from "./diagnose-bitrefill-catalog-shape.mjs";
if (!process.argv.includes("--live-get-only")) throw Error("EXPLICIT_GET_ONLY_REQUIRED");
const result = { utc: new Date().toISOString(), requests: [], searches: {}, realPurchase: false, productionDatabase: false,
  resellerPermission: "NOT_VERIFIED", trustedCost: false };
try {
  let calls = 0; const budget = AbortSignal.timeout(120000);
  const client = createPersonalCatalogClient(process.env.BITREFILL_API_KEY, async (url, options) => {
    if (++calls > 35 || budget.aborted) throw Error("CATALOG_BUDGET_REACHED");
    const r = await fetch(url, { ...options, signal: AbortSignal.any([options.signal, budget]) });
    result.requests.push({ method: "GET", path: url.pathname, status: r.status,
      country: url.searchParams.get("country"), start: url.searchParams.get("start") }); return r;
  });
  if (process.argv.includes("--diagnose-last-country-page")) {
    const r = await fetch("https://api.bitrefill.com/v2/products?country=US%2CXI&start=550&limit=50", { method: "GET", redirect: "error",
      headers: { Accept: "application/json", Authorization: `Bearer ${process.env.BITREFILL_API_KEY}` }, signal: AbortSignal.timeout(8000) });
    const body = await readCatalogDiagnosticBody(r);
    result.shape = { status: r.status, records: Array.isArray(body.data) ? body.data.length : null,
      invalid: (Array.isArray(body.data) ? body.data : []).filter((p) => !parseBitrefillProduct(p)).map((p) => ({
        id: /^[A-Za-z0-9_-]{1,200}$/.test(p.id) ? p.id : null, country: p.country ?? p.country_code, fields: Object.keys(p).slice(0, 40),
        baseParses: Boolean(parseBitrefillProduct({ ...p, packages: [], range: undefined })),
        packageCount: Array.isArray(p.packages) ? p.packages.length : null,
        invalidPackages: (Array.isArray(p.packages) ? p.packages : []).filter((x) => !parseBitrefillProduct({ ...p, packages: [x], range: undefined }))
          .slice(0, 3).map((x) => ({ idType: typeof x.package_id, valueType: typeof x.value, priceType: typeof x.price,
            label: typeof x.value === "string" && /^[A-Za-z0-9 /.,+()&$'-]{1,80}$/.test(x.value) ? x.value : null })) })) };
  }
  if (!process.argv.includes("--search-only")) {
  const country = await client.listProductsBounded({ country: "US,XI", pageSize: 50, maxPages: 20, maxProducts: 1000 });
  result.usAndInternational = { records: country.products.length, pages: country.pagesRead, truncated: country.truncated,
    countries: [...new Set(country.products.map((p) => p.country))], types: [...new Set(country.products.map((p) => p.type))] };
  }
  const manager = createBitrefillCatalogManager(client, { maxPages: 4 });
  for (const q of process.argv.includes("--country-only") ? [] : ["Apple", "Amazon", "Steam"]) {
    const page = await manager.list({ country: "US", includeInternational: true, q });
    result.searches[q] = { total: page.total, truncated: page.truncated, scope: page.queryScope, products: page.products.map((p) => ({
      id: p.id, name: p.name, country: p.country, currency: p.currency, type: p.category, available: p.available,
      packages: p.packages.length, range: p.range, reviewed: false, cost: null })) };
  }
  result.status = "PASS_GET_ONLY";
} catch (e) { result.status = "BLOCKED"; result.code = /^[A-Z][A-Z0-9_]{1,90}$/.test(e?.code ?? "") ? e.code : "PUBLIC_CATALOG_ACCESS_OR_NETWORK_FAILURE"; }
const directory = "D:/Jianlian/_bitrefill_unified_binding_v5_20261025";
const path = `${directory}/live-search-${Date.now()}.json`;
await mkdir(directory, { recursive: true }); await writeFile(path, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ status: result.status, code: result.code, requests: result.requests.length, evidence: path }));
