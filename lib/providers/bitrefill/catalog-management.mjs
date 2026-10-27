// Public-catalog DTOs only. No balance, invoice, order or purchase API.
import { createHash } from "node:crypto";
export class BitrefillCatalogError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const fail = (code) => { throw new BitrefillCatalogError(code); };
export function catalogQuery(params = {}) {
  const country = String(params.country ?? "US"), query = String(params.q ?? "").trim();
  const page = Number(params.page ?? 1), pageSize = Number(params.pageSize ?? 20);
  const category = String(params.category ?? "all"), stock = String(params.stock ?? "all");
  if (!/^[A-Z]{2}$/.test(country) || query.length > 100 || /[\u0000-\u001f<>]/u.test(query) ||
    !Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
    !/^(all|[A-Za-z0-9_-]{1,80})$/.test(category) || !["all", "available", "unavailable"].includes(stock)) fail("BITREFILL_CATALOG_QUERY_INVALID");
  if (params.includeInternational !== undefined && ![true, false, "true", "false"].includes(params.includeInternational)) fail("BITREFILL_CATALOG_QUERY_INVALID");
  return { country, query, page, pageSize, category, stock, includeInternational: params.includeInternational === true || params.includeInternational === "true" };
}
export function catalogProduct(product) {
  return { id: product.id, name: product.name, country: product.country, currency: product.currency,
    category: product.type ?? "unknown", categories: product.categories ?? [], available: product.inStock === true, stockQuantity: null,
    packages: product.packages.map((p) => ({ packageId: p.packageId, faceValue: p.value,
      valueLabel: p.valueLabel ?? null, catalogPrice: p.price ?? null, trustedCost: null })),
    range: product.range ? { min: product.range.min, max: product.range.max, step: product.range.step } : null };
}
export function createBitrefillCatalogManager(client, { now = () => Date.now(), ttlMs = 300000, maxPages = 20 } = {}) {
  const cache = new Map(), pending = new Map();
  async function countrySnapshot(country, query, includeInternational) {
    const cacheKey = `${country}:${includeInternational}:${query.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached && now() - cached.at < ttlMs) return cached;
    if (pending.has(cacheKey)) return pending.get(cacheKey);
    if (pending.size >= 4) throw new BitrefillCatalogError("BITREFILL_CATALOG_BUSY", 429);
    const task = (async () => {
      // Bounded country snapshot makes combined filters/pagination truthful:
      // search/type/stock are applied before pagination, not just to one page.
      const signal = AbortSignal.timeout(45000);
      let snapshot;
      if (query) {
        // Official search is global; apply explicit country/XI filtering only
        // after all bounded search pages, never silently invent a country param.
        const products = []; let start = 0, pagesRead = 0, truncated = false, rateLimit = null;
        for (; pagesRead < maxPages && products.length < 1000;) {
          const page = await client.searchProducts(query, { start, limit: 50, signal }); pagesRead++;
          products.push(...page.products); rateLimit = page.rateLimit ?? null;
          const more = Boolean(page.meta.next) || page.meta.totalResults !== null && page.meta.totalResults > start + page.products.length;
          if (!more) break;
          if (!page.products.length || page.meta.start !== start || page.meta.limit !== 50) fail("BITREFILL_CATALOG_PAGINATION_INVALID");
          start += 50; truncated = pagesRead >= maxPages || products.length >= 1000;
        }
        snapshot = { products, pagesRead, truncated, rateLimit };
      } else snapshot = await client.listProductsBounded({ country: includeInternational && country !== "XI" ? `${country},XI` : country,
        pageSize: 50, maxPages, maxProducts: 1000, signal });
      const unique = new Map(snapshot.products.filter((p) => p.country === country || includeInternational && p.country === "XI").map((p) => [p.id, catalogProduct(p)]));
      const value = { at: now(), products: [...unique.values()], truncated: snapshot.truncated,
        pagesRead: snapshot.pagesRead, rateLimit: snapshot.rateLimit ?? null };
      cache.delete(cacheKey); cache.set(cacheKey, value);
      while (cache.size > 4) cache.delete(cache.keys().next().value);
      return value;
    })();
    pending.set(cacheKey, task);
    try { return await task; } finally { pending.delete(cacheKey); }
  }
  return Object.freeze({
    async list(params) {
      const q = catalogQuery(params), snapshot = await countrySnapshot(q.country, q.query, q.includeInternational);
      const matches = snapshot.products.filter((p) =>
        (q.category === "all" || p.category === q.category || p.categories.includes(q.category)) && (q.stock === "all" || p.available === (q.stock === "available")));
      return { products: matches.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), page: q.page, pageSize: q.pageSize,
        total: matches.length, hasMore: q.page * q.pageSize < matches.length,
        categories: [...new Set(snapshot.products.flatMap((p) => [p.category, ...p.categories]))].sort(), checkedAt: new Date(snapshot.at).toISOString(),
        truncated: snapshot.truncated, pagesRead: snapshot.pagesRead, rateLimit: snapshot.rateLimit,
        source: "personal_catalog_get_only", queryScope: q.query ? "official_global_search_country_filtered" : "country_catalog",
        includeInternational: q.includeInternational, trustedLiveCost: false, realPurchaseEnabled: false };
    },
    async detail(productId) {
      if (typeof productId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(productId)) fail("BITREFILL_PRODUCT_ID_INVALID");
      const { product } = await client.getProduct(productId);
      if (product.id !== productId) fail("BITREFILL_PRODUCT_IDENTITY_MISMATCH");
      const dto = catalogProduct(product);
      return { product: dto, checkedAt: new Date(now()).toISOString(), source: "personal_catalog_get_only",
        fingerprint: createHash("sha256").update(JSON.stringify(dto)).digest("hex") };
    },
  });
}
