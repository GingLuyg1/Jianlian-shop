import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { getPersonalCatalogManager } from "@/lib/providers/bitrefill/catalog-server";
import { createBitrefillMcpReadonlyClient } from "@/lib/providers/bitrefill/mcp-readonly-client.mjs";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function readonlyMcp() {
  const apiKey = process.env.BITREFILL_API_KEY;
  if (process.env.BITREFILL_AUTH_MODE !== "personal" || !apiKey) {
    throw new Error("BITREFILL_READONLY_BALANCE_NOT_CONFIGURED");
  }
  return createBitrefillMcpReadonlyClient({
    credentials: { authMode: "personal", apiKey },
    fetchImpl: fetch,
  });
}

function mapProduct(product: {
  id: string;
  name: string;
  currency: string;
  available: boolean;
  packages: Array<{ packageId: string; faceValue: string; valueLabel: string | null; catalogPrice: string | null }>;
}) {
  const first = product.packages[0];
  return {
    id: product.id,
    title: product.name,
    price: first?.catalogPrice ?? first?.faceValue ?? "0",
    currency: product.currency,
    stock: product.available ? 1 : 0,
    sales: 0,
    isAuto: false,
    sortId: null,
  };
}

function safeCode(error: unknown) {
  const raw = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : error instanceof Error
      ? error.message
      : "";
  return /^BITREFILL_[A-Z0-9_]{1,90}$/.test(raw) || /^[A-Z][A-Z0-9_]{1,89}$/.test(raw)
    ? raw
    : "BITREFILL_READONLY_UNAVAILABLE";
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) {
    return json({ error: admin.message, code: "BITREFILL_ADMIN_REQUIRED", requestId }, admin.status);
  }

  try {
    const params = new URL(request.url).searchParams;
    const resource = params.get("resource") ?? "balance";

    if (resource === "balance") {
      const result = await readonlyMcp().readBalances();
      const wallet = result.balances.find((entry: { paymentMethod: string; currency: string }) =>
        entry.paymentMethod === "balance" && entry.currency === "USD")
        ?? result.balances.find((entry: { paymentMethod: string }) => entry.paymentMethod === "balance");
      if (!wallet) throw new Error("BITREFILL_BALANCE_WALLET_MISSING");
      return json({
        supplier: "Bitrefill",
        balance: {
          balance: wallet.availableAmount,
          name: "Bitrefill",
          totalSpent: null,
          totalOrders: null,
          currency: wallet.currency,
        },
        purchaseEnabled: false,
        requestId,
      });
    }

    const manager = getPersonalCatalogManager();

    if (resource === "products") {
      const q = params.get("q")?.trim() ?? "";
      if (q.length > 100 || /[\u0000-\u001f<>]/u.test(q)) {
        return json({ error: "搜索关键词无效", code: "BITREFILL_CATALOG_QUERY_INVALID", requestId }, 400);
      }
      const result = await manager.list({ country: "US", q, page: 1, pageSize: 50 });
      return json({
        supplier: "Bitrefill",
        products: result.products.map(mapProduct),
        complete: !result.truncated && !result.hasMore,
        purchaseEnabled: false,
        requestId,
      });
    }

    if (resource === "product") {
      const id = params.get("id")?.trim() ?? "";
      const result = await manager.detail(id);
      return json({
        supplier: "Bitrefill",
        product: {
          ...mapProduct(result.product),
          isSku: result.product.packages.length > 1,
          description: null,
          minQty: 1,
          maxQty: 1,
          specs: [],
          skuVariants: result.product.packages.map((entry) => ({
            packageId: entry.packageId,
            faceValue: entry.faceValue,
            valueLabel: entry.valueLabel,
            catalogPrice: entry.catalogPrice,
          })),
          requiredInputs: [],
        },
        purchaseEnabled: false,
        requestId,
      });
    }

    return json({ error: "不支持的供应商查询", code: "BITREFILL_RESOURCE_INVALID", requestId }, 400);
  } catch (error) {
    const code = safeCode(error);
    console.error("[BitrefillAdmin] read failed", { requestId, code });
    const status = /AUTH|FORBIDDEN/.test(code)
      ? 403
      : /RATE|BUSY/.test(code)
        ? 429
        : /INVALID/.test(code)
          ? 400
          : /NOT_FOUND/.test(code)
            ? 404
            : 503;
    return json({ error: "Bitrefill 信息读取失败；不会执行购买", code, requestId }, status);
  }
}
