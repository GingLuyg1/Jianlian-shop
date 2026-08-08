import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { getServerAdminContext } from "@/lib/auth/require-admin";
import { createDajuClient } from "@/lib/providers/daju/client";
import { getSafeDajuError } from "@/lib/providers/daju/errors";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const admin = await getServerAdminContext();
  if (!admin.ok) return json({ error: admin.message, code: "DAJU_ADMIN_REQUIRED", requestId }, admin.status);

  try {
    const client = createDajuClient();
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource") ?? "balance";
    if (resource === "balance") {
      const balance = await client.getBalance();
      return json({ supplier: "大橘AI", balance, requestId });
    }
    if (resource === "products") {
      const products = await client.getProducts(url.searchParams.get("q")?.slice(0, 120) ?? "");
      return json({ supplier: "大橘AI", products, requestId });
    }
    if (resource === "product") {
      const id = Number(url.searchParams.get("id"));
      if (!Number.isSafeInteger(id) || id < 1) return json({ error: "供应商商品 ID 无效", code: "DAJU_PRODUCT_ID_INVALID", requestId }, 400);
      const product = await client.getProduct(id);
      return json({ supplier: "大橘AI", product, requestId });
    }
    return json({ error: "不支持的供应商查询", code: "DAJU_RESOURCE_INVALID", requestId }, 400);
  } catch (error) {
    const safe = getSafeDajuError(error);
    console.error("[DajuAdmin] supplier read failed", { requestId, code: safe.code, kind: safe.kind });
    return json({ error: "大橘AI供应商信息读取失败", code: safe.code, requestId }, safe.status);
  }
}
