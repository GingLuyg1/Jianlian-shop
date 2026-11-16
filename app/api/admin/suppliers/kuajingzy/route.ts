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
  const normalized = normalizeKuajingZyCatalog(
    { domain: "mall", items: [raw] },
    { provenance: "authenticated_catalog", fieldMap: { stock: "stock", deliveryMethod: "delivery" } },
  ).items[0];
  if (!normalized.identityComplete || !normalized.productId || !normalized.name) {
    throw new Error("KUAJINGZY_CATALOG_ITEM_IDENTITY_UNVERIFIED");
  }
  const stockValue = normalized.observed.stock?.value;
  return {
    id: normalized.productId,
    title: normalized.name,
    price: normalized.displayPrices.find((entry: { currency: string }) => entry.currency === "CNY")?.amount
      ?? normalized.displayUnitPrice
      ?? "0",
    currency: "CNY",
    stock: typeof stockValue === "number" ? stockValue : stockValue === true ? 1 : 0,
    sales: 0,
    isAuto: false,
    sortId: null,
  };
}

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
      if (!q) {
        return json({
          supplier: "跨境资源网",
          products: [],
          searchRequired: true,
          purchaseEnabled: false,
          requestId,
        });
      }
      if (q.length > 100 || /[\u0000-\u001f<>]/u.test(q)) {
        return json({ error: "搜索关键词无效", code: "KUAJINGZY_QUERY_INVALID", requestId }, 400);
      }

      const result = await client.collectMallCatalog({ search: q, limit: 50 });
      const allItems = "items" in result ? result.items : result.partial.items;
      const items = allItems.slice(0, 50);
      return json({
        supplier: "跨境资源网",
        products: items.map(mapProduct),
        complete: "items" in result && result.complete === true && allItems.length <= 50,
        status: result.status,
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
      return json({
        supplier: "跨境资源网",
        product: {
          ...mapProduct(items[0]),
          isSku: false,
          description: null,
          minQty: null,
          maxQty: null,
          specs: [],
          skuVariants: [],
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
