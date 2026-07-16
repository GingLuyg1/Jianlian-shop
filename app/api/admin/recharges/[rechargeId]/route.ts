import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET(request: Request, { params }: { params: { rechargeId: string } }) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });
  try {
    const { data: recharge, error } = await admin.supabase.from("account_recharges").select("id,recharge_no,user_id,user_email,channel_code,channel_name,currency,network,amount,payable_amount,credited_amount,status,review_mode,customer_note,user_note,payment_time,payer_account_summary,transaction_reference,proof_paths,submitted_at,reviewing_at,approved_at,rejected_at,cancelled_at,completed_at,reviewed_at,reviewed_by,review_reason,exception_type,error_summary,created_at,updated_at").eq("id", params.rechargeId).maybeSingle();
    if (error) throw error;
    if (!recharge) return NextResponse.json({ error: "充值申请不存在。" }, { status: 404 });
    const [{ data: events }, { count: historyCount }] = await Promise.all([
      admin.supabase.from("recharge_review_events").select("id,actor_type,action,from_status,to_status,reason,request_id,metadata,created_at").eq("recharge_id", params.rechargeId).order("created_at", { ascending: false }).limit(100),
      admin.supabase.from("account_recharges").select("id", { count: "exact", head: true }).eq("user_id", recharge.user_id),
    ]);
    const service = getSupabaseServiceRoleClient();
    const paths = Array.isArray(recharge.proof_paths) ? recharge.proof_paths.filter((value): value is string => typeof value === "string") : [];
    const proofs = service ? (await Promise.all(paths.map(async (path, index) => {
      const signed = await service.storage.from("payment-proofs").createSignedUrl(path, 300);
      return signed.data?.signedUrl ? { name: `凭证 ${index + 1}`, url: signed.data.signedUrl } : null;
    }))).filter(Boolean) : [];
    await writeAdminAuditLog({ request, admin: { id: admin.user.id, email: admin.user.email ?? null }, module: "recharges", action: "view_recharge_detail", targetType: "account_recharge", targetId: recharge.id, targetLabel: recharge.recharge_no, result: "success", metadata: { proofCount: proofs.length, historyCount: historyCount ?? 0 } });
    return NextResponse.json({ recharge: { ...recharge, proof_paths: undefined }, proofs, events: events ?? [], historyCount: historyCount ?? 0 });
  } catch (error) {
    const message = /account_recharges|recharge_review_events|proof_paths|schema cache|PGRST205|42P01|42703/i.test(String((error as { message?: unknown })?.message ?? "")) ? "充值审核结构尚未初始化，请先执行 migration。" : "充值详情读取失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
