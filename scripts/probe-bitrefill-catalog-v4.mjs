// Explicit opt-in, public product GET only. No raw responses or auth logged.
import { mkdir, writeFile } from "node:fs/promises";
import { createPersonalCatalogClient } from "../lib/providers/bitrefill/personal-catalog-client.mjs";
import { createBitrefillCatalogManager } from "../lib/providers/bitrefill/catalog-management.mjs";
if (!process.argv.includes("--live-get-only")) throw Error("EXPLICIT_LIVE_GET_ONLY_REQUIRED");
const result = { utc: new Date().toISOString(), personalKeySet: Boolean(process.env.BITREFILL_API_KEY), requests: [],
  realPurchaseEnabled: false, productionDatabaseAccess: false, trustedCost: false, resellerPermission: "NOT_VERIFIED" };
try {
  let count = 0;
  const budget = AbortSignal.timeout(45000);
  const client = createPersonalCatalogClient(process.env.BITREFILL_API_KEY, async (url, options) => {
    if (++count > 20 || budget.aborted) throw Error("CATALOG_BUDGET_EXCEEDED");
    const response = await fetch(url, { ...options, signal: AbortSignal.any([options.signal, budget]) });
    result.requests.push({ method: "GET", path: url.pathname, status: response.status });
    return response;
  });
  const catalog = createBitrefillCatalogManager(client, { maxPages: 15 });
  const page = await catalog.list({ country: "US" });
  result.catalog = { country: "US", total: page.total, pagesRead: page.pagesRead, truncated: page.truncated, categories: page.categories };
  result.candidates = {};
  for (const brand of ["Apple", "Amazon", "Steam"]) {
    const filtered = await catalog.list({ country: "US", q: brand });
    result.candidates[brand] = { total: filtered.total, products: filtered.products.map(({ id, name, currency, available, packages, range }) =>
      ({ id, name, currency, available, packageCount: packages.length, range, trustedCost: null, bindingWritten: false })) };
  }
  result.status = "PASS_PUBLIC_CATALOG_GET_ONLY";
} catch (e) { result.status = "BLOCKED"; result.code = /^[A-Z][A-Z0-9_]{1,90}$/.test(e?.code ?? "") ? e.code : "CATALOG_NETWORK_OR_CONFIGURATION_FAILURE"; }
const output = "D:/Jianlian/_bitrefill_catalog_mapping_v4_20261025";
await mkdir(output, { recursive: true });
await writeFile(`${output}/live-catalog.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ status: result.status, code: result.code, total: result.catalog?.total, requestCount: result.requests.length, evidence: `${output}/live-catalog.json` }));
