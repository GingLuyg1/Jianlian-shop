// Explicit catalog-only inspection. No account/balance/order/invoice endpoint.
import { createBitrefillClient } from "../lib/providers/bitrefill/client-core.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function inspectLaunchCatalog(client, result = { auth: "NOT_CHECKED", catalog: {}, searches: {}, products: [],
  mapping: [], trustedCost: false, resellerPermission: "NOT_VERIFIED" }) {
  const ping = await client.ping();
  result.auth = ping.message === "pong" ? "PASS_PERSONAL_GET_ONLY" : "FAIL";
  if (result.auth !== "PASS_PERSONAL_GET_ONLY") return result;
  const seen = new Map();
  const pages = await client.listProductsBounded({ country: "US", pageSize: 50,
    maxPages: 13, maxProducts: 650 });
  for (const product of pages.products) seen.set(product.id, product);
  result.catalog.US = { records: pages.products.length, unique: seen.size,
    pages: pages.pagesRead, truncated: pages.truncated };
  for (const brand of ["Apple", "Amazon", "Steam"]) {
    const page = await client.searchProducts(brand, { limit: 10 });
    result.searches[brand] = page.products.map(({ id, name, country, currency, inStock }) =>
      ({ id, name, country, currency, inStock }));
    for (const product of page.products) if (product.country === "US") seen.set(product.id, product);
  }
  const candidates = [...seen.values()].filter((p) =>
    /\b(?:apple|amazon|steam|google play|playstation|netflix)\b/i.test(p.name)).slice(0, 8);
  for (const candidate of candidates) {
    const { product } = await client.getProduct(candidate.id);
    result.products.push({ id: product.id, name: product.name, country: product.country,
      currency: product.currency, inStock: product.inStock, stockQuantity: null,
      packages: product.packages.map(({ packageId, value, price, valueLabel }) => ({
        packageId, faceValue: value, ...(valueLabel ? { valueLabel } : {}), catalogPrice: price,
        procurementCost: null, costCurrency: null,
      })), range: product.range, trustedProcurementCost: false });
  }
  const apple = result.products.filter((p) => p.country === "US" && p.currency === "USD" && /^Apple\b/i.test(p.name));
  // Existing ten mapping targets, not proof of current Production SKU rows.
  result.mapping = [2, 3, 4, 5, 10, 15, 20, 25, 50, 100].map((value) => ({
    targetCurrency: "USD", targetFaceValue: value,
    matches: apple.flatMap((p) => p.packages.filter((v) => Number(v.faceValue) === value)
      .map((v) => ({ productId: p.id, packageId: v.packageId }))),
    bindingWritten: false, enabled: false,
  }));
  return result;
}

async function main() {
  if (!process.argv.includes("--live-get-only")) throw new Error("EXPLICIT_LIVE_GET_ONLY_OPT_IN_REQUIRED");
  if (process.env.NODE_DEBUG || process.env.NODE_DEBUG_NATIVE) throw new Error("DEBUG_LOGGING_MUST_BE_DISABLED");
  const key = process.env.BITREFILL_API_KEY;
  const result = { utc: new Date().toISOString(), personalCredential: Boolean(key),
    businessCredential: Boolean(process.env.BITREFILL_API_ID && process.env.BITREFILL_API_SECRET),
    requests: [], productionDatabaseAccess: false, realPurchase: false };
  if (!key) result.error = "BITREFILL_PERSONAL_CREDENTIAL_MISSING";
  else {
    let count = 0;
    const budget = AbortSignal.timeout(180_000);
    const fetchImpl = async (url, options) => {
      const parsed = new URL(url);
      if (parsed.origin !== "https://api.bitrefill.com" || options.method !== "GET" ||
          !/^\/v2\/(?:ping|products|products\/search|products\/[A-Za-z0-9_-]+)$/.test(parsed.pathname)) {
        throw new Error("CATALOG_ONLY_REQUEST_REQUIRED");
      }
      if (++count > 26 || budget.aborted) throw new Error("READONLY_REQUEST_BUDGET_EXCEEDED");
      const response = await fetch(url, { ...options, redirect: "error",
        signal: AbortSignal.any([options.signal, budget]) });
      // Do not retain URL query, headers, raw response/error text or credentials.
      result.requests.push({ path: parsed.pathname, start: parsed.searchParams.has("start") ? Number(parsed.searchParams.get("start")) : null,
        method: "GET", status: response.status });
      if (response.status === 429) throw new Error("RATE_LIMIT_STOP");
      return response;
    };
    try {
      const client = createBitrefillClient({ authMode: "personal", apiKey: key,
        maxRetries: 0, timeoutMs: 8_000, fetchImpl });
      result.inspection = { auth: "NOT_CHECKED", catalog: {}, searches: {}, products: [],
        mapping: [], trustedCost: false, resellerPermission: "NOT_VERIFIED" };
      await inspectLaunchCatalog(client, result.inspection);
    } catch (error) {
      result.error = /^[A-Z][A-Z0-9_]{1,90}$/.test(error?.code ?? "")
        ? error.code : "READONLY_UPSTREAM_OR_BUDGET_FAILURE";
      result.mappedClientStatus = error?.status ?? null;
    }
  }
  const dir = "D:/Jianlian/_bitrefill_launch_connect_v1_20261025";
  await mkdir(dir, { recursive: true });
  const output = resolve(dir, `catalog-${Date.now()}.json`);
  await writeFile(output, JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ evidence: output, auth: result.inspection?.auth ?? "NOT_VERIFIED",
    requests: result.requests.length, error: result.error ?? null }));
  if (result.error) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.log('{"error":"READONLY_PROBE_SAFE_STOP"}'); process.exitCode = 1; });
}
