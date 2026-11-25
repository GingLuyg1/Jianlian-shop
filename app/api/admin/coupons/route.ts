import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import {
  generateUniqueCouponCodes,
  isCouponSchemaMissing,
  isValidCouponCodeFormat,
  normalizeCouponCode,
} from "@/lib/coupons/coupon-service";
import {
  checkRateLimit,
  getAdminRateLimitKey,
  readBoundedJsonBody,
} from "@/lib/security/rate-limit";
import { sanitizePostgrestFilterTerm } from "@/lib/security/postgrest-sanitize";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["all", "active", "exhausted", "disabled"]);

function jsonError(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

export async function GET(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;

  const service = getSupabaseServiceRoleClient();
  if (!service) return jsonError("缺少服务端数据库权限配置", 503);

  const url = new URL(request.url);
  const search = sanitizePostgrestFilterTerm(url.searchParams.get("search") ?? "", 80);
  const statusParam = (url.searchParams.get("status") ?? "all").trim();
  const status = ALLOWED_STATUSES.has(statusParam) ? statusParam : "all";
  const batch = (url.searchParams.get("batch") ?? "").trim().slice(0, 80);
  const discountFilter = url.searchParams.get("discount");
  const exportAll = url.searchParams.get("export") === "1";
  const page = Math.max(1, Math.min(1000, Number(url.searchParams.get("page") ?? 1) || 1));
  const pageSize = exportAll ? 500 : Math.max(10, Math.min(200, Number(url.searchParams.get("pageSize") ?? 30) || 30));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = service
      .from("coupons")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("code", { ascending: true });

    if (status !== "all") query = query.eq("status", status);
    if (batch) query = query.eq("batch_label", batch);
    if (discountFilter && Number.isFinite(Number(discountFilter)) && Number(discountFilter) > 0) {
      query = query.eq("discount_amount", Number(discountFilter));
    }
    if (search) {
      query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%,batch_label.ilike.%${search}%`);
    }

    const [listRes, statsRes, redemptionsRes] = await Promise.all([
      query.range(from, to),
      service.from("coupons").select("status,discount_amount,used_count,batch_label").limit(5000),
      service
        .from("coupon_redemptions")
        .select("coupon_id,order_id,discount_amount,status,created_at")
        .eq("status", "applied")
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

    if (listRes.error) {
      if (isCouponSchemaMissing(listRes.error)) {
        return NextResponse.json({
          schemaReady: false,
          coupons: [],
          count: 0,
          batches: [],
          summary: { total: 0, active: 0, exhausted: 0, disabled: 0, totalRedeemed: 0, totalDiscountGranted: 0 },
          error: "优惠券数据表尚未初始化，请先执行 20261125030000_coupons_system.sql migration。",
        });
      }
      throw listRes.error;
    }

    const allStatRows = (statsRes.data ?? []) as Array<{
      status?: string;
      discount_amount?: number | string;
      used_count?: number;
      batch_label?: string | null;
    }>;
    const redemptionRows = (redemptionsRes.data ?? []) as Array<{
      coupon_id?: string;
      order_id?: string;
      discount_amount?: number | string;
      created_at?: string;
    }>;

    const batchSet = new Set<string>();
    let activeCount = 0;
    let exhaustedCount = 0;
    let disabledCount = 0;
    let totalRedeemed = 0;

    for (const row of allStatRows) {
      if (row.batch_label) batchSet.add(row.batch_label);
      if (row.status === "active") activeCount += 1;
      else if (row.status === "exhausted") exhaustedCount += 1;
      else if (row.status === "disabled") disabledCount += 1;
      totalRedeemed += Number(row.used_count ?? 0);
    }

    let totalDiscountGranted = 0;
    const latestOrderByCoupon = new Map<string, string>();
    for (const r of redemptionRows) {
      totalDiscountGranted += Number(r.discount_amount ?? 0);
      if (r.coupon_id && r.order_id && !latestOrderByCoupon.has(r.coupon_id)) {
        latestOrderByCoupon.set(r.coupon_id, r.order_id);
      }
    }

    const orderIds = Array.from(new Set(Array.from(latestOrderByCoupon.values()))).slice(0, 200);
    const orderNoById = new Map<string, string>();
    if (orderIds.length > 0) {
      const { data: orderRows } = await service
        .from("orders")
        .select("id,order_no")
        .in("id", orderIds);
      for (const o of (orderRows ?? []) as Array<{ id?: string; order_no?: string }>) {
        if (o.id && o.order_no) orderNoById.set(o.id, o.order_no);
      }
    }

    const coupons = ((listRes.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const cid = String(row.id ?? "");
      const oid = latestOrderByCoupon.get(cid);
      return {
        ...row,
        discount_amount: Number(row.discount_amount ?? 0),
        min_order_amount: Number(row.min_order_amount ?? 0),
        last_order_no: oid ? orderNoById.get(oid) ?? null : null,
      };
    });

    return NextResponse.json({
      schemaReady: true,
      coupons,
      count: listRes.count ?? coupons.length,
      page,
      pageSize,
      batches: Array.from(batchSet).sort().reverse(),
      summary: {
        total: allStatRows.length,
        active: activeCount,
        exhausted: exhaustedCount,
        disabled: disabledCount,
        totalRedeemed,
        totalDiscountGranted: Number(totalDiscountGranted.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("[AdminCoupons] GET failed", error);
    return jsonError("优惠券列表读取失败，请稍后重试", 500);
  }
}

export async function POST(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;

  const rateLimit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, "coupons_create"));
  if (!rateLimit.allowed) return rateLimit.response!;

  const parsed = await readBoundedJsonBody<Record<string, unknown>>(request, 64 * 1024);
  if (!parsed.ok) return parsed.response;

  const service = getSupabaseServiceRoleClient();
  if (!service) return jsonError("缺少服务端数据库权限配置", 503);

  const body = parsed.data;
  const count = Math.trunc(Number(body.count ?? 1));
  const discountAmount = Number(body.discountAmount ?? body.discount_amount);
  const minOrderAmount = Number(body.minOrderAmount ?? body.min_order_amount ?? 0);
  const maxUses = Math.trunc(Number(body.maxUses ?? body.max_uses ?? 1));
  const customCode = normalizeCouponCode(body.code);
  const prefix = String(body.prefix ?? (discountAmount >= 10 ? `JL${Math.trunc(discountAmount)}` : `JL${Math.trunc(discountAmount) || 1}`)).trim();
  const name = String(body.name ?? `¥${discountAmount} 优惠券`).trim().slice(0, 80);
  const batchLabel = String(body.batchLabel ?? body.batch_label ?? "").trim().slice(0, 80) || null;
  const note = String(body.note ?? "").trim().slice(0, 240) || null;
  const expiresAtRaw = typeof body.expiresAt === "string" ? body.expiresAt.trim() : typeof body.expires_at === "string" ? body.expires_at.trim() : "";
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).toISOString() : null;

  if (!Number.isFinite(count) || count < 1 || count > 500) {
    return jsonError("单次生成数量必须在 1 到 500 张之间");
  }
  if (!Number.isFinite(discountAmount) || discountAmount <= 0 || discountAmount > 10000) {
    return jsonError("优惠金额必须大于 0 且不超过 ¥10000");
  }
  if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0 || minOrderAmount > 100000) {
    return jsonError("最低消费门槛格式无效");
  }
  if (!Number.isFinite(maxUses) || maxUses < 1 || maxUses > 10000) {
    return jsonError("单券可用次数必须在 1 到 10000 之间");
  }
  if (expiresAtRaw && (!expiresAt || Number.isNaN(Date.parse(expiresAt)))) {
    return jsonError("过期时间格式无效");
  }

  let codes: string[];
  if (count === 1 && customCode) {
    if (!isValidCouponCodeFormat(customCode)) {
      return jsonError("自定义优惠券码只允许 4-40 位字母、数字、下划线或短横线");
    }
    codes = [customCode];
  } else {
    codes = generateUniqueCouponCodes(count, prefix);
  }

  const rowsToInsert = codes.map((code) => ({
    code,
    name: name || `¥${discountAmount} 优惠券`,
    batch_label: batchLabel,
    discount_type: "fixed",
    discount_amount: Number(discountAmount.toFixed(2)),
    min_order_amount: Number(minOrderAmount.toFixed(2)),
    max_uses: maxUses,
    status: "active",
    expires_at: expiresAt,
    note,
    created_by: admin.user.id,
  }));

  const { data, error } = await service.from("coupons").insert(rowsToInsert).select("id,code,name,discount_amount,min_order_amount,max_uses,batch_label,expires_at");
  if (error) {
    if (isCouponSchemaMissing(error)) {
      return jsonError("优惠券数据表尚未初始化，请先执行 migration。", 503, "COUPON_SCHEMA_NOT_READY");
    }
    if (error.code === "23505") {
      return jsonError("优惠券码已存在，请更换券码或重试生成", 409, "COUPON_DUPLICATE");
    }
    console.error("[AdminCoupons] POST failed", error);
    return jsonError("创建优惠券失败，请稍后重试", 500);
  }

  await writeAdminAuditLog({
    request,
    admin: { id: admin.user.id, email: admin.user.email ?? null },
    module: "orders",
    action: "create_coupons",
    targetType: "coupon",
    targetId: batchLabel ?? codes[0],
    targetLabel: `${name} x ${codes.length}`,
    result: "success",
    afterSummary: { count: codes.length, discountAmount, minOrderAmount, maxUses, batchLabel, expiresAt },
  });

  return NextResponse.json({
    ok: true,
    createdCount: data?.length ?? codes.length,
    coupons: data ?? [],
    codes: (data ?? []).map((r: { code: string }) => r.code),
  });
}

export async function PATCH(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;

  const rateLimit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, "coupons_update"));
  if (!rateLimit.allowed) return rateLimit.response!;

  const parsed = await readBoundedJsonBody<Record<string, unknown>>(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;

  const service = getSupabaseServiceRoleClient();
  if (!service) return jsonError("缺少服务端数据库权限配置", 503);

  const id = String(parsed.data.id ?? "").trim();
  const nextStatus = typeof parsed.data.status === "string" ? parsed.data.status.trim() : undefined;
  const note = typeof parsed.data.note === "string" ? parsed.data.note.trim().slice(0, 240) : undefined;

  if (!id) return jsonError("缺少优惠券 ID");
  if (nextStatus && nextStatus !== "active" && nextStatus !== "disabled") {
    return jsonError("只能切换为启用（active）或停用（disabled）");
  }

  const { data: existing, error: readErr } = await service
    .from("coupons")
    .select("id,code,status,used_count,max_uses")
    .eq("id", id)
    .maybeSingle();

  if (readErr || !existing) return jsonError("优惠券不存在", 404);

  const updatePatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (nextStatus) {
    if (nextStatus === "active" && Number(existing.used_count) >= Number(existing.max_uses)) {
      return jsonError("该优惠券已核销完毕，不能重新启用", 409);
    }
    updatePatch.status = nextStatus;
  }
  if (note !== undefined) updatePatch.note = note || null;

  const { data: updated, error: updateErr } = await service
    .from("coupons")
    .update(updatePatch)
    .eq("id", id)
    .select("*")
    .single();

  if (updateErr) return jsonError("更新优惠券失败", 500);

  await writeAdminAuditLog({
    request,
    admin: { id: admin.user.id, email: admin.user.email ?? null },
    module: "orders",
    action: "update_coupon",
    targetType: "coupon",
    targetId: id,
    targetLabel: String(existing.code),
    result: "success",
    beforeSummary: { status: existing.status },
    afterSummary: updatePatch,
  });

  return NextResponse.json({ ok: true, coupon: updated });
}

export async function DELETE(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;

  const rateLimit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, "coupons_delete"));
  if (!rateLimit.allowed) return rateLimit.response!;

  const service = getSupabaseServiceRoleClient();
  if (!service) return jsonError("缺少服务端数据库权限配置", 503);

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return jsonError("缺少优惠券 ID");

  const { data: existing, error: readErr } = await service
    .from("coupons")
    .select("id,code,used_count")
    .eq("id", id)
    .maybeSingle();

  if (readErr || !existing) return jsonError("优惠券不存在", 404);
  if (Number(existing.used_count ?? 0) > 0) {
    return jsonError("已使用过的优惠券不可删除（以保留财务对账记录），如需停用请点击停用。", 409);
  }

  const { error: delErr } = await service.from("coupons").delete().eq("id", id);
  if (delErr) return jsonError("删除优惠券失败", 500);

  await writeAdminAuditLog({
    request,
    admin: { id: admin.user.id, email: admin.user.email ?? null },
    module: "orders",
    action: "delete_coupon",
    targetType: "coupon",
    targetId: id,
    targetLabel: String(existing.code),
    result: "success",
  });

  return NextResponse.json({ ok: true });
}
