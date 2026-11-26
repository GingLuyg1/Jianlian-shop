import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext, getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { enforceAdminWriteGuard } from "@/lib/security/rate-limit";
import { chunkArray, POSTGREST_PAGE_SIZE, selectAllPaginated } from "@/lib/supabase/paginated-select";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const DEFAULT_USD_CNY_RATE = Number(process.env.CNY_USDT_FIXED_RATE || "7.2") || 7.2;
const IP_OR_CIDR_REGEX = /^[0-9a-fA-F.:/]{3,64}$/;

function isMissingAgentTableError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const code = String(error.code ?? "").toUpperCase();
  if (code === "42P01" || code === "PGRST205") return true;
  return /agent_applications|agent_ip_whitelists|schema cache/i.test(String(error.message ?? ""));
}

function generateMerchantAppId() {
  return `MCH_${randomBytes(5).toString("hex").toUpperCase()}`;
}

function generateMerchantAppSecret() {
  const raw = `jl_live_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  const prefix = `${raw.slice(0, 14)}****${raw.slice(-4)}`;
  return { raw, hash, prefix };
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractExplicitCostCny(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const meta = metadata as Record<string, unknown>;
  const directCny =
    toFiniteNumber(meta.cost_price_cny) ??
    toFiniteNumber(meta.supplier_cost_cny) ??
    toFiniteNumber(meta.cost_price);
  if (directCny !== null && directCny >= 0) return directCny;

  const supplierCost = toFiniteNumber(meta.supplier_cost) ?? toFiniteNumber(meta.supplier_unit_cost);
  if (supplierCost !== null && supplierCost >= 0) {
    const currency = String(meta.supplier_cost_currency ?? meta.supplier_currency ?? "CNY").trim().toUpperCase();
    return currency === "USD" || currency === "USDT" ? supplierCost * DEFAULT_USD_CNY_RATE : supplierCost;
  }
  return null;
}

function formatDateTime(value: unknown) {
  if (!value) return "—";
  const dt = new Date(String(value));
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export async function GET(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const service = getSupabaseServiceRoleClient() ?? admin.supabase;
  const url = new URL(request.url);
  if (url.searchParams.get("summary") === "1") {
    const { count, error } = await service
      .from("agent_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (error && !isMissingAgentTableError(error)) {
      return NextResponse.json({ error: "代理申请统计读取失败" }, { status: 500 });
    }
    return NextResponse.json(
      { pendingApplications: error ? 0 : count ?? 0 },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const [appsRes, whitelistsRes] = await Promise.all([
      service
        .from("agent_applications")
        .select("id,user_id,email,merchant_name,business_scenario,server_ips,contact,status,app_id,app_secret_prefix,reviewed_at,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(500),
      service
        .from("agent_ip_whitelists")
        .select("id,application_id,email,merchant_name,app_id,ip,remark,status,created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);

    const schemaReady =
      !isMissingAgentTableError(appsRes.error) && !isMissingAgentTableError(whitelistsRes.error);

    if (appsRes.error && !isMissingAgentTableError(appsRes.error)) {
      return NextResponse.json({ error: "代理申请列表读取失败" }, { status: 500 });
    }
    if (whitelistsRes.error && !isMissingAgentTableError(whitelistsRes.error)) {
      return NextResponse.json({ error: "IP 白名单列表读取失败" }, { status: 500 });
    }

    const applications = ((appsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      email: String(row.email ?? ""),
      merchantName: String(row.merchant_name ?? ""),
      businessScenario: String(row.business_scenario ?? ""),
      serverIps: Array.isArray(row.server_ips) ? row.server_ips.map((ip) => String(ip)).filter(Boolean) : [],
      contact: String(row.contact ?? ""),
      status: String(row.status ?? "pending"),
      appliedAt: formatDateTime(row.created_at),
      appId: row.app_id ? String(row.app_id) : undefined,
      appSecret: row.app_secret_prefix ? String(row.app_secret_prefix) : undefined,
    }));

    const whitelists = ((whitelistsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      email: String(row.email ?? ""),
      merchantName: String(row.merchant_name ?? ""),
      appId: String(row.app_id ?? ""),
      ip: String(row.ip ?? ""),
      remark: String(row.remark ?? ""),
      addedAt: formatDateTime(row.created_at),
      status: row.status === "disabled" ? "disabled" : "active",
    }));

    // Match orders belonging to approved agent merchants and aggregate real cost/profit
    const approvedByEmail = new Map<string, { appId: string }>();
    const approvedEmailList: string[] = [];
    for (const app of applications) {
      if (app.status === "approved" && app.email && app.appId) {
        const rawEmail = app.email.trim();
        const lower = rawEmail.toLowerCase();
        approvedByEmail.set(lower, { appId: app.appId });
        if (!approvedEmailList.includes(rawEmail)) approvedEmailList.push(rawEmail);
        if (lower !== rawEmail && !approvedEmailList.includes(lower)) approvedEmailList.push(lower);
      }
    }

    const agentRawOrders: Array<Record<string, unknown>> = [];
    if (approvedEmailList.length > 0) {
      for (const emailChunk of chunkArray(approvedEmailList, 100)) {
        const ordersRes = await selectAllPaginated<Record<string, unknown>>(
          (from, to) =>
            service
              .from("orders")
              .select("id,order_no,customer_email,total_amount,subtotal,status,payment_status,created_at,order_items(id,product_id,sku_id,product_name,quantity,line_total)")
              .in("customer_email", emailChunk)
              .order("created_at", { ascending: false })
              .range(from, to) as unknown as PromiseLike<{
              data: Record<string, unknown>[] | null;
              error: { code?: string; message?: string } | null;
            }>,
          { pageSize: POSTGREST_PAGE_SIZE, maxRows: 5000 }
        );
        if (!ordersRes.error) {
          agentRawOrders.push(...ordersRes.rows);
        }
      }
    }

    const itemIds: string[] = [];
    const skuIds = new Set<string>();
    const productIds = new Set<string>();
    for (const ord of agentRawOrders) {
      const items = Array.isArray(ord.order_items) ? (ord.order_items as Array<Record<string, unknown>>) : [];
      for (const it of items) {
        if (it.id) itemIds.push(String(it.id));
        if (it.sku_id) skuIds.add(String(it.sku_id));
        if (it.product_id) productIds.add(String(it.product_id));
      }
    }

    const [sfrChunks, skuChunks, prodChunks] = await Promise.all([
      Promise.all(
        chunkArray(itemIds, 200).map((ids) =>
          service
            .from("supplier_fulfillment_requests")
            .select("order_item_id,supplier_total_price,supplier_unit_price,status")
            .in("order_item_id", ids)
        )
      ),
      Promise.all(
        chunkArray(Array.from(skuIds), 200).map((ids) =>
          service.from("product_skus").select("id,metadata").in("id", ids)
        )
      ),
      Promise.all(
        chunkArray(Array.from(productIds), 200).map((ids) =>
          service.from("products").select("id,metadata").in("id", ids)
        )
      ),
    ]);

    const sfrCostByItem = new Map<string, number>();
    for (const res of sfrChunks) {
      for (const row of (res.data ?? []) as Array<Record<string, unknown>>) {
        if (!row.order_item_id) continue;
        const total = toFiniteNumber(row.supplier_total_price) ?? toFiniteNumber(row.supplier_unit_price);
        if (total !== null && total >= 0) sfrCostByItem.set(String(row.order_item_id), total);
      }
    }
    const skuCostById = new Map<string, number>();
    for (const res of skuChunks) {
      for (const row of (res.data ?? []) as Array<Record<string, unknown>>) {
        const c = extractExplicitCostCny(row.metadata);
        if (c !== null) skuCostById.set(String(row.id), c);
      }
    }
    const prodCostById = new Map<string, number>();
    for (const res of prodChunks) {
      for (const row of (res.data ?? []) as Array<Record<string, unknown>>) {
        const c = extractExplicitCostCny(row.metadata);
        if (c !== null) prodCostById.set(String(row.id), c);
      }
    }

    const orders = agentRawOrders.map((row) => {
      const email = String(row.customer_email ?? "").trim();
      const agentInfo = approvedByEmail.get(email.toLowerCase());
      const items = Array.isArray(row.order_items) ? (row.order_items as Array<Record<string, unknown>>) : [];
      const itemSummary =
        items.length > 0
          ? items.map((it) => `${String(it.product_name ?? "商品")} x${Number(it.quantity ?? 1)}`).join("、")
          : "平台数字商品订单";

      let totalCost = 0;
      let hasConfiguredCost = false;
      for (const it of items) {
        const qty = Math.max(1, Number(it.quantity ?? 1));
        const itemId = it.id ? String(it.id) : "";
        const skuId = it.sku_id ? String(it.sku_id) : "";
        const productId = it.product_id ? String(it.product_id) : "";
        if (itemId && sfrCostByItem.has(itemId)) {
          totalCost += sfrCostByItem.get(itemId)!;
          hasConfiguredCost = true;
        } else if (skuId && skuCostById.has(skuId)) {
          totalCost += skuCostById.get(skuId)! * qty;
          hasConfiguredCost = true;
        } else if (productId && prodCostById.has(productId)) {
          totalCost += prodCostById.get(productId)! * qty;
          hasConfiguredCost = true;
        }
      }

      const paidAmount = Math.max(0, Number(row.total_amount ?? 0));
      const orderAmount = Math.max(paidAmount, Number(row.subtotal ?? paidAmount));
      const costAmount = hasConfiguredCost ? Number(totalCost.toFixed(2)) : 0;
      const profitAmount = Number((paidAmount - costAmount).toFixed(2));
      const statusStr = String(row.status ?? "").toLowerCase();
      const deliveryStatus =
        statusStr === "delivered" || statusStr === "completed"
          ? "auto_delivered"
          : statusStr === "pending_payment"
            ? "pending"
            : "processing";

      return {
        id: String(row.id),
        orderNo: String(row.order_no ?? row.id),
        merchantEmail: email || "未知商户",
        appId: agentInfo?.appId ?? "API_AGENT",
        productName: itemSummary,
        amount: paidAmount,
        orderAmount,
        costAmount,
        profitAmount,
        costConfigured: hasConfiguredCost,
        deliveryStatus,
        createdAt: formatDateTime(row.created_at),
      };
    });

    return NextResponse.json(
      { schemaReady, applications, whitelists, orders },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "代理与分销数据加载失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const guardError = enforceAdminWriteGuard(request, admin.user.id, "agent_manage", 32 * 1024);
  if (guardError) return guardError;

  const service = getSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ error: "服务端数据库写入权限未配置" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "").trim();
  const auditActor = { id: admin.user.id, email: admin.user.email ?? null };

  try {
    if (action === "approve") {
      const id = String(body?.id ?? "").trim();
      if (!id) return NextResponse.json({ error: "缺少申请记录 ID" }, { status: 400 });

      const { data: existing, error: readErr } = await service
        .from("agent_applications")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (readErr) {
        if (isMissingAgentTableError(readErr)) {
          return NextResponse.json({ error: "代理数据表尚未初始化，请先执行数据库迁移" }, { status: 503 });
        }
        return NextResponse.json({ error: "读取申请记录失败" }, { status: 500 });
      }
      if (!existing) return NextResponse.json({ error: "代理申请不存在" }, { status: 404 });

      const appId = existing.app_id ? String(existing.app_id) : generateMerchantAppId();
      const secret = generateMerchantAppSecret();

      const { error: updErr } = await service
        .from("agent_applications")
        .update({
          status: "approved",
          app_id: appId,
          app_secret_hash: secret.hash,
          app_secret_prefix: secret.prefix,
          reviewed_by: admin.user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (updErr) return NextResponse.json({ error: "审批通过保存失败" }, { status: 500 });

      const ips = Array.isArray(existing.server_ips)
        ? (existing.server_ips as unknown[]).map((v) => String(v).trim()).filter((v) => IP_OR_CIDR_REGEX.test(v))
        : [];
      if (ips.length > 0) {
        await service.from("agent_ip_whitelists").insert(
          ips.map((ip) => ({
            application_id: id,
            email: String(existing.email ?? ""),
            merchant_name: String(existing.merchant_name ?? ""),
            app_id: appId,
            ip,
            remark: "API审核通过自动加白",
            status: "active",
            created_by: admin.user.id,
          }))
        );
      }

      await writeAdminAuditLog({
        request,
        admin: auditActor,
        action: "approve_agent_application",
        module: "users",
        targetType: "agent_application",
        targetId: id,
        targetLabel: String(existing.merchant_name ?? existing.email ?? id),
        result: "success",
        afterSummary: { status: "approved", app_id: appId, auto_whitelisted_ips: ips.length },
      });

      return NextResponse.json({ ok: true, appId, issuedSecret: secret.raw, secretPrefix: secret.prefix });
    }

    if (action === "reject") {
      const id = String(body?.id ?? "").trim();
      if (!id) return NextResponse.json({ error: "缺少申请记录 ID" }, { status: 400 });
      const { error: updErr } = await service
        .from("agent_applications")
        .update({
          status: "rejected",
          reviewed_by: admin.user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (updErr) return NextResponse.json({ error: "拒绝申请失败" }, { status: 500 });

      await writeAdminAuditLog({
        request,
        admin: auditActor,
        action: "reject_agent_application",
        module: "users",
        targetType: "agent_application",
        targetId: id,
        result: "success",
        afterSummary: { status: "rejected" },
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "revoke") {
      const id = String(body?.id ?? "").trim();
      if (!id) return NextResponse.json({ error: "缺少商户记录 ID" }, { status: 400 });
      const { data: existing } = await service
        .from("agent_applications")
        .select("id,email,merchant_name,app_id")
        .eq("id", id)
        .maybeSingle();

      const { error: updErr } = await service
        .from("agent_applications")
        .update({
          status: "revoked",
          app_secret_hash: null,
          app_secret_prefix: null,
          reviewed_by: admin.user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (updErr) return NextResponse.json({ error: "吊销商户权限失败" }, { status: 500 });

      await service.from("agent_ip_whitelists").delete().eq("application_id", id);

      await writeAdminAuditLog({
        request,
        admin: auditActor,
        action: "revoke_agent_application",
        module: "users",
        targetType: "agent_application",
        targetId: id,
        targetLabel: String(existing?.merchant_name ?? existing?.email ?? id),
        result: "success",
        afterSummary: { status: "revoked", app_id: existing?.app_id ?? null },
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "add_whitelist") {
      const ip = String(body?.ip ?? "").trim();
      if (!IP_OR_CIDR_REGEX.test(ip)) {
        return NextResponse.json({ error: "请输入有效的服务器公网 IP 或 CIDR" }, { status: 400 });
      }
      const email = String(body?.email ?? "").trim() || "admin_manual@jianlian.shop";
      const merchantName = String(body?.merchantName ?? "").trim() || "平台受控代理商户";
      const remark = String(body?.remark ?? "").trim() || "管理员手动加白";

      const { data: matchedApp } = await service
        .from("agent_applications")
        .select("id,app_id")
        .ilike("email", email)
        .eq("status", "approved")
        .maybeSingle();

      const appId = matchedApp?.app_id ? String(matchedApp.app_id) : generateMerchantAppId();
      const { data: inserted, error: insErr } = await service
        .from("agent_ip_whitelists")
        .insert({
          application_id: matchedApp?.id ?? null,
          email,
          merchant_name: merchantName,
          app_id: appId,
          ip,
          remark,
          status: "active",
          created_by: admin.user.id,
        })
        .select("id,ip,app_id")
        .single();
      if (insErr) {
        if (isMissingAgentTableError(insErr)) {
          return NextResponse.json({ error: "代理白名单数据表尚未初始化，请先执行数据库迁移" }, { status: 503 });
        }
        return NextResponse.json({ error: "新增 IP 白名单失败" }, { status: 500 });
      }

      await writeAdminAuditLog({
        request,
        admin: auditActor,
        action: "add_agent_ip_whitelist",
        module: "users",
        targetType: "agent_ip_whitelist",
        targetId: String(inserted?.id ?? ip),
        targetLabel: ip,
        result: "success",
        afterSummary: { email, merchantName, appId, ip, remark },
      });
      return NextResponse.json({ ok: true, entry: inserted }, { status: 201 });
    }

    if (action === "delete_whitelist") {
      const id = String(body?.id ?? "").trim();
      if (!id) return NextResponse.json({ error: "缺少白名单 ID" }, { status: 400 });
      const { error: delErr } = await service.from("agent_ip_whitelists").delete().eq("id", id);
      if (delErr) return NextResponse.json({ error: "移除 IP 白名单失败" }, { status: 500 });

      await writeAdminAuditLog({
        request,
        admin: auditActor,
        action: "delete_agent_ip_whitelist",
        module: "users",
        targetType: "agent_ip_whitelist",
        targetId: id,
        result: "success",
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "不支持的代理管理操作" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "代理管理操作执行失败，请稍后重试" }, { status: 500 });
  }
}
