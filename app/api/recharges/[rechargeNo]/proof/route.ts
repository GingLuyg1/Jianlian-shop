import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { checkRateLimit, getUserRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 3;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function safeFileName(name: string) {
  const extension = name.toLowerCase().match(/\.(jpg|jpeg|png|webp|pdf)$/)?.[0] ?? "";
  return `${Date.now()}-${randomUUID()}${extension}`;
}

async function getUserContext() {
  if (!hasSupabaseServerConfig()) return null;
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, user: data.user } : null;
}

export async function GET(_request: Request, { params }: { params: { rechargeNo: string } }) {
  const context = await getUserContext();
  if (!context) return NextResponse.json({ error: "请先登录后再查看充值凭证。" }, { status: 401 });
  const { data, error } = await context.supabase.from("account_recharges").select("id,recharge_no,proof_paths,status,submitted_at,transaction_reference,payment_time,payer_account_summary").eq("recharge_no", params.rechargeNo).eq("user_id", context.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "充值凭证读取失败，请稍后重试。" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "充值申请不存在。" }, { status: 404 });
  const service = getSupabaseServiceRoleClient();
  const paths = Array.isArray(data.proof_paths) ? data.proof_paths.filter((value): value is string => typeof value === "string") : [];
  const signedUrls = service ? await Promise.all(paths.map(async (path) => {
    const result = await service.storage.from("payment-proofs").createSignedUrl(path, 300);
    return result.data?.signedUrl ?? null;
  })) : [];
  return NextResponse.json({ rechargeNo: data.recharge_no, status: data.status, submittedAt: data.submitted_at, transactionReference: data.transaction_reference, paymentTime: data.payment_time, payerAccountSummary: data.payer_account_summary, proofs: signedUrls.filter(Boolean) });
}

export async function POST(request: Request, { params }: { params: { rechargeNo: string } }) {
  const context = await getUserContext();
  if (!context) return NextResponse.json({ error: "请先登录后再提交充值凭证。" }, { status: 401 });
  const rateLimit = checkRateLimit("media_upload", getUserRateLimitKey(context.user.id, `recharge_proof:${params.rechargeNo}`));
  if (!rateLimit.allowed) return rateLimit.response!;
  const { data: recharge, error: readError } = await context.supabase.from("account_recharges").select("id,recharge_no,user_id,status,proof_paths,review_mode,payable_amount").eq("recharge_no", params.rechargeNo).eq("user_id", context.user.id).maybeSingle();
  if (readError) return NextResponse.json({ error: "充值申请读取失败，请稍后重试。" }, { status: 500 });
  if (!recharge) return NextResponse.json({ error: "充值申请不存在。" }, { status: 404 });
  if (!["pending", "waiting_payment", "submitted", "rejected"].includes(String(recharge.status))) return NextResponse.json({ error: "当前充值状态不允许提交凭证。" }, { status: 409 });
  if (recharge.review_mode !== "manual") return NextResponse.json({ error: "当前渠道不使用人工凭证审核。" }, { status: 400 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "凭证表单格式不正确。" }, { status: 400 });
  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  const existingPaths = Array.isArray(recharge.proof_paths) ? recharge.proof_paths.filter((value): value is string => typeof value === "string") : [];
  if (!files.length && !String(form.get("transactionReference") ?? "").trim()) return NextResponse.json({ error: "请上传支付凭证或填写交易流水号。" }, { status: 400 });
  if (files.length + existingPaths.length > MAX_FILES) return NextResponse.json({ error: "每个充值申请最多保存 3 个凭证文件。" }, { status: 400 });
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "仅支持 JPG、PNG、WEBP 或 PDF 凭证。" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "单个凭证文件不能超过 5MB。" }, { status: 400 });
  }
  const paymentTimeValue = String(form.get("paymentTime") ?? "").trim();
  const paymentTime = paymentTimeValue ? new Date(paymentTimeValue) : null;
  if (paymentTime && Number.isNaN(paymentTime.getTime())) return NextResponse.json({ error: "付款时间格式不正确。" }, { status: 400 });
  const transactionReference = String(form.get("transactionReference") ?? "").trim().slice(0, 160);
  const paymentAmount = Number(form.get("paymentAmount"));
  if (!Number.isFinite(paymentAmount) || Math.round(paymentAmount * 1_000_000) !== Math.round(Number(recharge.payable_amount ?? 0) * 1_000_000)) return NextResponse.json({ error: "付款金额必须与充值应付金额一致。" }, { status: 400 });
  const payerAccountSummary = String(form.get("payerAccountSummary") ?? "").trim().slice(0, 120);
  const userNote = String(form.get("userNote") ?? "").trim().slice(0, 500);
  const service = getSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ error: "凭证存储服务暂不可用。" }, { status: 503 });

  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const path = `${context.user.id}/recharges/${recharge.id}/${safeFileName(file.name)}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error } = await service.storage.from("payment-proofs").upload(path, buffer, { contentType: file.type, upsert: false });
      if (error) throw error;
      uploaded.push(path);
    }
    const now = new Date().toISOString();
    const { data, error } = await service.from("account_recharges").update({ status: "submitted", proof_paths: [...existingPaths, ...uploaded], payment_time: paymentTime?.toISOString() ?? null, transaction_reference: transactionReference || null, payer_account_summary: payerAccountSummary || null, user_note: userNote || null, submitted_at: now, rejected_at: null, review_reason: null }).eq("id", recharge.id).eq("user_id", context.user.id).in("status", ["pending", "waiting_payment", "submitted", "rejected"]).select("recharge_no,status,submitted_at").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("充值状态已变化，请刷新后重试。");
    await service.from("recharge_review_events").insert({ recharge_id: recharge.id, recharge_no: recharge.recharge_no, actor_user_id: context.user.id, actor_type: "user", action: "submit_proof", from_status: recharge.status, to_status: "submitted", request_id: request.headers.get("x-request-id") ?? randomUUID(), metadata: { proof_count: uploaded.length, has_transaction_reference: Boolean(transactionReference) } });
    return NextResponse.json(data);
  } catch (error) {
    if (uploaded.length) await service.storage.from("payment-proofs").remove(uploaded);
    return NextResponse.json({ error: error instanceof Error ? error.message : "凭证提交失败，请稍后重试。" }, { status: 409 });
  }
}
