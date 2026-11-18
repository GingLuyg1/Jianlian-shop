import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { normalizeKuajingZyCatalog } from "@/lib/providers/kuajingzy/catalog-mapping.mjs";
import { getKuajingZyReadonlyRuntime } from "@/lib/providers/kuajingzy/production-server";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function safeCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (/^KUAJINGZY_[A-Z0-9_]{1,80}$/.test(code)) return code;
  const message = error instanceof Error ? error.message : "";
  return /^KUAJINGZY_[A-Z0-9_]{1,80}$/.test(message)
    ? message
    : "KUAJINGZY_READONLY_UNAVAILABLE";
}

function mapProduct(raw: unknown) {
  const rawRecord = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const normalized = normalizeKuajingZyCatalog(
    { domain: "mall", items: [raw] },
    { provenance: "authenticated_catalog", fieldMap: { stock: "stock", deliveryMethod: "delivery" } },
  ).items[0];
  if (!normalized.identityComplete || !normalized.productId || !normalized.name) {
    throw new Error("KUAJINGZY_CATALOG_ITEM_IDENTITY_UNVERIFIED");
  }
  const rawVariants = Array.isArray(rawRecord.variants) ? rawRecord.variants : [];
  const variantStockSum = rawVariants.reduce((sum: number, v: any) => {
    return sum + (typeof v?.stock === "number" && v.stock > 0 ? v.stock : 0);
  }, 0);
  const stockValue = normalized.observed.stock?.value;
  const computedStock =
    typeof stockValue === "number"
      ? stockValue
      : rawVariants.length > 0
        ? variantStockSum
        : stockValue === true
          ? 1
          : 0;
  const deliveryVal = String(rawRecord.delivery ?? normalized.observed.deliveryMethod?.value ?? "automatic").toLowerCase();
  const isAuto = deliveryVal !== "manual";
  return {
    id: normalized.productId,
    title: normalized.name,
    price: normalized.displayPrices.find((entry: { currency: string }) => entry.currency === "CNY")?.amount
      ?? normalized.displayUnitPrice
      ?? "0",
    currency: "CNY",
    stock: computedStock,
    sales: typeof rawRecord.sales === "number" ? rawRecord.sales : 0,
    isAuto,
    sortId: normalized.categoryName ?? normalized.categoryId ?? null,
    variantsCount: rawVariants.length,
  };
}

type CatalogBatchCacheEntry = {
  at: number;
  products: ReturnType<typeof mapProduct>[];
  total: number | null;
  nextCursor: string | null;
  complete: boolean;
  status: string;
};

const catalogBatchCache = new Map<string, CatalogBatchCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  const requestId = randomUUID();
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) {
    return json({ error: admin.message, code: "KUAJINGZY_ADMIN_REQUIRED", requestId }, admin.status);
  }

  try {
    const client = getKuajingZyReadonlyRuntime();
    const params = new URL(request.url).searchParams;
    const resource = params.get("resource") ?? "balance";

    if (resource === "balance") {
      const balance = await client.readBalance();
      return json({
        supplier: "跨境资源网",
        balance: {
          balance: balance.availableBalance,
          name: "跨境资源网",
          totalSpent: null,
          totalOrders: null,
          currency: "CNY",
        },
        purchaseEnabled: false,
        requestId,
      });
    }

    if (resource === "products") {
      const q = params.get("q")?.trim() ?? "";
      const category = params.get("category")?.trim() ?? "";
      const initialCursor = params.get("cursor")?.trim() || undefined;
      if (q.length > 100 || /[\u0000-\u001f<>]/u.test(q)) {
        return json({ error: "搜索关键词无效", code: "KUAJINGZY_QUERY_INVALID", requestId }, 400);
      }

      const cacheKey = `${q}::${category}::${initialCursor ?? ""}`;
      const cached = catalogBatchCache.get(cacheKey);
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return json({
          supplier: "跨境资源网",
          products: cached.products,
          total: cached.total,
          nextCursor: cached.nextCursor,
          complete: cached.complete,
          status: cached.status,
          purchaseEnabled: false,
          requestId,
        });
      }

      const baseFilters: { search?: string; category?: string } = {};
      if (q) baseFilters.search = q;
      else if (category) baseFilters.category = category;

      // Use limit: 25 so each single page stays well below the 256 KiB stream limit,
      // and collect up to 3 bounded batches (up to 375 products per click).
      const collectedRaw: unknown[] = [];
      let cursor = initialCursor;
      let reportedTotal: number | null = null;
      let finalStatus = "COMPLETE";
      let isComplete = false;
      const maxBatches = initialCursor ? 2 : 3;

      for (let batch = 0; batch < maxBatches; batch += 1) {
        const result = await client.collectMallCatalog({
          ...baseFilters,
          limit: 25,
          ...(cursor ? { cursor } : {}),
        });
        const batchItems = "items" in result ? result.items : result.partial.items;
        collectedRaw.push(...batchItems);
        const batchTotal = "total" in result ? result.total : result.partial.reportedTotal;
        if (typeof batchTotal === "number") reportedTotal = batchTotal;
        finalStatus = result.status;
        const nextCur = "partial" in result ? result.partial.nextCursor : null;
        if ("items" in result && result.complete === true) {
          cursor = undefined;
          isComplete = true;
          break;
        }
        if (!nextCur || batchItems.length === 0) {
          cursor = nextCur ?? undefined;
          isComplete = !nextCur;
          break;
        }
        cursor = nextCur;
      }

      const mappedProducts: ReturnType<typeof mapProduct>[] = [];
      const seenIds = new Set<string>();
      for (const raw of collectedRaw) {
        try {
          const mapped = mapProduct(raw);
          if (!seenIds.has(mapped.id)) {
            seenIds.add(mapped.id);
            mappedProducts.push(mapped);
          }
        } catch {
          // Skip malformed upstream item without failing the entire catalog batch
        }
      }

      const entry: CatalogBatchCacheEntry = {
        at: Date.now(),
        products: mappedProducts,
        total: reportedTotal ?? mappedProducts.length,
        nextCursor: cursor ?? null,
        complete: isComplete && !cursor,
        status: finalStatus,
      };
      catalogBatchCache.set(cacheKey, entry);
      while (catalogBatchCache.size > 20) {
        const oldestKey = catalogBatchCache.keys().next().value;
        if (oldestKey !== undefined) catalogBatchCache.delete(oldestKey);
        else break;
      }

      return json({
        supplier: "跨境资源网",
        products: entry.products,
        total: entry.total,
        nextCursor: entry.nextCursor,
        complete: entry.complete,
        status: entry.status,
        purchaseEnabled: false,
        requestId,
      });
    }

    if (resource === "product") {
      const id = params.get("id")?.trim() ?? "";
      if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(id)) {
        return json({ error: "供应商商品 ID 无效", code: "KUAJINGZY_PRODUCT_ID_INVALID", requestId }, 400);
      }
      const result = await client.collectMallCatalog({ itemId: id, limit: 1 });
      const items = "items" in result ? result.items : result.partial.items;
      if (items.length !== 1 || String(items[0]?.id ?? "") !== id) {
        return json({ error: "供应商商品不存在或身份未确认", code: "KUAJINGZY_PRODUCT_NOT_FOUND", requestId }, 404);
      }
      const rawItem = items[0] && typeof items[0] === "object" ? (items[0] as Record<string, unknown>) : {};
      const mapped = mapProduct(items[0]);
      const rawVariants = Array.isArray(rawItem.variants) ? rawItem.variants : [];
      const skuVariants = rawVariants.map((v: any, idx: number) => ({
        id: String(v?.id ?? idx + 1),
        sku: String(v?.id ?? ""),
        title: String(v?.name ?? v?.title ?? v?.specification ?? `规格 #${v?.id ?? idx + 1}`),
        price: String(v?.prices?.CNY ?? v?.unitPrice ?? v?.price ?? mapped.price),
        currency: "CNY",
        stock: typeof v?.stock === "number" ? v.stock : null,
        minQty: typeof v?.minimum === "number" ? v.minimum : null,
        maxQty: typeof v?.maximum === "number" ? v.maximum : null,
      }));
      return json({
        supplier: "跨境资源网",
        product: {
          ...mapped,
          isSku: skuVariants.length > 0,
          description: typeof rawItem.description === "string" ? rawItem.description : null,
          minQty: typeof rawItem.minimum === "number" ? rawItem.minimum : (skuVariants[0]?.minQty ?? 1),
          maxQty: typeof rawItem.maximum === "number" ? rawItem.maximum : (skuVariants[0]?.maxQty ?? null),
          specs: [],
          skuVariants,
          requiredInputs: [],
        },
        purchaseEnabled: false,
        requestId,
      });
    }

    return json({ error: "不支持的供应商查询", code: "KUAJINGZY_RESOURCE_INVALID", requestId }, 400);
  } catch (error) {
    const code = safeCode(error);
    console.error("[KuajingZyAdmin] read failed", { requestId, code });
    const status = /AUTH|PERMISSION/.test(code)
      ? 403
      : /RATE/.test(code)
        ? 429
        : /INVALID/.test(code)
          ? 400
          : 503;
    return json({ error: "跨境资源网信息读取失败；不会执行购买", code, requestId }, status);
  }
}
