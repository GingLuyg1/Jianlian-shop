import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { syncKuajingZyAvailabilitySnapshot } from "@/lib/providers/kuajingzy/stock-sync";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic="force-dynamic";

export async function POST(request:Request,props:{params:Promise<{productId:string}>}) {
  const {productId}=await props.params;
  const requestId=randomUUID();
  const admin=await getServerAdminContext();
  if(!admin.ok) return NextResponse.json({error:admin.message,code:"KUAJINGZY_ADMIN_REQUIRED",requestId},{status:admin.status});
  const service=getSupabaseServiceRoleClient();
  if(!service) return NextResponse.json({error:"服务端库存快照权限不可用",code:"SERVICE_ROLE_UNAVAILABLE",requestId},{status:503});

  const result=await syncKuajingZyAvailabilitySnapshot({service,productId});
  await writeAdminAuditLog({
    request,
    admin:{id:admin.user.id,email:admin.user.email},
    action:"sync_kuajingzy_availability_snapshot",
    module:"products",
    targetType:"product",
    targetId:productId,
    result:result.ok?"success":result.updated>0?"partial":"failed",
    afterSummary:{
      code:result.code,
      updated:result.updated,
      available:"available" in result?result.available:null,
      outOfStock:"outOfStock" in result?result.outOfStock:null,
      failures:"failures" in result?result.failures:null,
      stock_mutated:false,
      status_mutated:false,
      purchase_attempted:false,
    },
    errorCode:result.ok?undefined:result.code,
  });
  return NextResponse.json({result,requestId},{
    status:result.ok?200:result.updated>0?207:409,
    headers:{"Cache-Control":"no-store"},
  });
}
