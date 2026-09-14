import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { syncDajuProductStock } from "@/lib/providers/daju/stock-sync";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { productId: string } }) {
  const requestId = randomUUID();
  const admin = await getServerAdminContext();
  if (!admin.ok) return NextResponse.json({ error: admin.message, requestId }, { status: admin.status });
  const service = getSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ error: "服务端库存同步权限不可用", requestId }, { status: 503 });
  const result = await syncDajuProductStock({ service, productId: params.productId });
  await writeAdminAuditLog({
    request,
    admin: { id: admin.user.id, email: admin.user.email },
    action: "sync_daju_supplier_stock",
    module: "products",
    targetType: "product",
    targetId: params.productId,
    result: result.ok ? "success" : "failed",
    afterSummary: { code: result.code, updated: result.updated, stock: result.stock ?? null },
    errorMessage: result.ok ? undefined : result.code,
  });
  return NextResponse.json({ result, requestId }, { status: result.ok ? 200 : 409, headers: { "Cache-Control": "no-store" } });
}
