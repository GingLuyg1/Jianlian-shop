import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { syncDajuProductStock } from "@/lib/providers/daju/stock-sync";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = randomUUID();
  const admin = await getServerAdminContext();
  if (!admin.ok) return NextResponse.json({ error: admin.message, requestId }, { status: admin.status });
  const service = getSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ error: "服务端库存同步权限不可用", requestId }, { status: 503 });
  const { data, error } = await service.from("products").select("id").contains("metadata", { fulfillment_source: "supplier", supplier: "daju" }).limit(100);
  if (error) return NextResponse.json({ error: "供应商商品列表读取失败", requestId }, { status: 500 });
  const results = [];
  for (const product of data ?? []) results.push({ productId: product.id, ...(await syncDajuProductStock({ service, productId: product.id })) });
  const failures = results.filter((result) => !result.ok);
  await writeAdminAuditLog({
    request,
    admin: { id: admin.user.id, email: admin.user.email },
    action: "sync_daju_supplier_stock_batch",
    module: "products",
    targetType: "supplier",
    targetId: "daju",
    result: failures.length === 0 ? "success" : "failed",
    afterSummary: { requested: results.length, succeeded: results.length - failures.length, failed: failures.length },
    errorMessage: failures.length === 0 ? undefined : "PARTIAL_OR_FAILED",
  });
  return NextResponse.json({ results, requestId }, { headers: { "Cache-Control": "no-store" } });
}
