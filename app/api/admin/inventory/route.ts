import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";

export const dynamic = "force-dynamic";

const INVENTORY_STATUSES = new Set(["all", "available", "reserved", "delivered", "disabled", "invalid"]);

type AuditAdmin = {
  id: string;
  email?: string | null;
};

function sanitizeError(error: unknown, fallback: string) {
  return getOrderErrorMessage(error, fallback).replace(/digital_inventory/gi, "库存").replace(/public\./gi, "");
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const next = Math.floor(Number(value ?? fallback));
  if (!Number.isFinite(next)) return fallback;
  return Math.min(Math.max(next, 1), max);
}

export async function GET(request: Request) {
  let auditAdmin: AuditAdmin | undefined;

  try {
    const admin = await getServerAdminContext();
    if (!admin.ok) {
      await writeAdminAuditLog({
        request,
        action: "view_inventory",
        module: "inventory",
        targetType: "inventory",
        result: "denied",
        errorMessage: admin.message,
      });
      return NextResponse.json({ error: admin.message }, { status: admin.status });
    }
    auditAdmin = { id: admin.user.id, email: admin.user.email };

    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") ?? "summary";

    if (mode === "products") {
      const { data, error } = await admin.supabase
        .from("products")
        .select("id,name,slug,delivery_type,status")
        .in("delivery_type", ["automatic", "auto", "card", "account"])
        .order("updated_at", { ascending: false })
        .limit(200);

      if (error) {
        const message = sanitizeError(error, "商品读取失败");
        await writeAdminAuditLog({
          request,
          admin: auditAdmin,
          action: "view_inventory_products",
          module: "inventory",
          targetType: "inventory",
          result: "failed",
          errorMessage: message,
        });
        return NextResponse.json({ error: message }, { status: 400 });
      }

      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "view_inventory_products",
        module: "inventory",
        targetType: "inventory",
        result: "success",
        metadata: { count: data?.length ?? 0 },
      });
      return NextResponse.json({ products: data ?? [] });
    }

    const status = url.searchParams.get("status") ?? "all";
    if (!INVENTORY_STATUSES.has(status)) {
      return NextResponse.json({ error: "无效库存状态" }, { status: 400 });
    }

    if (mode === "items") {
      const productId = url.searchParams.get("productId");
      if (!productId) {
        return NextResponse.json({ error: "请选择商品" }, { status: 400 });
      }

      const { data, error } = await admin.supabase.rpc("admin_list_digital_inventory_items", {
        p_product_id: productId,
        p_batch_no: url.searchParams.get("batchNo") || null,
        p_status: status,
        p_page: parsePositiveInt(url.searchParams.get("page"), 1, 9999),
        p_page_size: parsePositiveInt(url.searchParams.get("pageSize"), 50, 100),
      });

      if (error) {
        const message = sanitizeError(error, "库存详情读取失败");
        await writeAdminAuditLog({
          request,
          admin: auditAdmin,
          action: "view_inventory_items",
          module: "inventory",
          targetType: "product",
          targetId: productId,
          result: "failed",
          errorMessage: message,
        });
        return NextResponse.json({ error: message }, { status: 400 });
      }

      const rows = data ?? [];
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "view_inventory_items",
        module: "inventory",
        targetType: "product",
        targetId: productId,
        result: "success",
        metadata: {
          status,
          count: Number(rows[0]?.total_rows ?? 0),
          page: parsePositiveInt(url.searchParams.get("page"), 1, 9999),
        },
      });
      return NextResponse.json({
        items: rows,
        count: Number(rows[0]?.total_rows ?? 0),
      });
    }

    const { data, error } = await admin.supabase.rpc("admin_list_digital_inventory_summary", {
      p_search: url.searchParams.get("search") ?? "",
      p_status: status,
      p_page: parsePositiveInt(url.searchParams.get("page"), 1, 9999),
      p_page_size: parsePositiveInt(url.searchParams.get("pageSize"), 20, 100),
    });

    if (error) {
      const message = sanitizeError(error, "库存列表读取失败");
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "view_inventory_summary",
        module: "inventory",
        targetType: "inventory",
        result: "failed",
        errorMessage: message,
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const rows = data ?? [];
    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "view_inventory_summary",
      module: "inventory",
      targetType: "inventory",
      result: "success",
      metadata: {
        status,
        count: Number(rows[0]?.total_rows ?? 0),
      },
    });
    return NextResponse.json({
      rows,
      count: Number(rows[0]?.total_rows ?? 0),
    });
  } catch (error) {
    console.error("[Admin Inventory] GET failed", error);
    const message = sanitizeError(error, "库存读取失败");
    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "view_inventory",
      module: "inventory",
      targetType: "inventory",
      result: "failed",
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let auditAdmin: AuditAdmin | undefined;

  try {
    const admin = await getServerAdminContext();
    if (!admin.ok) {
      await writeAdminAuditLog({
        request,
        action: "import_inventory",
        module: "inventory",
        targetType: "inventory",
        result: "denied",
        errorMessage: admin.message,
      });
      return NextResponse.json({ error: admin.message }, { status: admin.status });
    }
    auditAdmin = { id: admin.user.id, email: admin.user.email };

    const body = (await request.json().catch(() => null)) as
      | {
          product_id?: string;
          contents?: string[];
          content?: string;
          batch_no?: string;
          remark?: string;
          expires_at?: string | null;
        }
      | null;

    const productId = body?.product_id;
    if (!productId) {
      return NextResponse.json({ error: "请选择商品" }, { status: 400 });
    }

    const contents = Array.isArray(body?.contents) ? body.contents : body?.content ? [body.content] : [];
    const normalized = contents.map((item) => String(item ?? "").trim()).filter(Boolean);

    if (normalized.length === 0) {
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "import_inventory",
        module: "inventory",
        targetType: "product",
        targetId: productId,
        result: "failed",
        errorCode: "empty_inventory_content",
        errorMessage: "请填写库存内容",
      });
      return NextResponse.json({ error: "请填写库存内容" }, { status: 400 });
    }

    if (normalized.length > 1000) {
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "import_inventory",
        module: "inventory",
        targetType: "product",
        targetId: productId,
        result: "failed",
        errorCode: "too_many_inventory_items",
        errorMessage: "单次最多导入 1000 条",
        metadata: { requested_count: normalized.length },
      });
      return NextResponse.json({ error: "单次最多导入 1000 条" }, { status: 400 });
    }

    const { data, error } = await admin.supabase.rpc("admin_import_digital_inventory", {
      p_product_id: productId,
      p_contents: normalized,
      p_batch_no: body?.batch_no ?? null,
      p_remark: body?.remark ?? null,
      p_expires_at: body?.expires_at ?? null,
    });

    if (error) {
      const message = sanitizeError(error, "库存导入失败");
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "import_inventory",
        module: "inventory",
        targetType: "product",
        targetId: productId,
        result: "failed",
        errorMessage: message,
        metadata: { batch_no: body?.batch_no ?? null, requested_count: normalized.length },
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const result = Array.isArray(data) ? data[0] : data;
    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "import_inventory",
      module: "inventory",
      targetType: "product",
      targetId: productId,
      result: "success",
      afterSummary: {
        batch_no: body?.batch_no ?? null,
        requested_count: normalized.length,
        result,
      },
    });
    return NextResponse.json({ result });
  } catch (error) {
    console.error("[Admin Inventory] import failed", error);
    const message = sanitizeError(error, "库存导入失败");
    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "import_inventory",
      module: "inventory",
      targetType: "inventory",
      result: "failed",
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  let auditAdmin: AuditAdmin | undefined;

  try {
    const admin = await getServerAdminContext();
    if (!admin.ok) {
      await writeAdminAuditLog({
        request,
        action: "disable_inventory",
        module: "inventory",
        targetType: "inventory_item",
        result: "denied",
        errorMessage: admin.message,
      });
      return NextResponse.json({ error: admin.message }, { status: admin.status });
    }
    auditAdmin = { id: admin.user.id, email: admin.user.email };

    const body = (await request.json().catch(() => null)) as
      | {
          inventory_id?: string;
          remark?: string;
        }
      | null;

    if (!body?.inventory_id) {
      return NextResponse.json({ error: "请选择库存记录" }, { status: 400 });
    }

    const { error } = await admin.supabase.rpc("admin_disable_digital_inventory", {
      p_inventory_id: body.inventory_id,
      p_remark: body.remark ?? null,
    });

    if (error) {
      const message = sanitizeError(error, "库存禁用失败");
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "disable_inventory",
        module: "inventory",
        targetType: "inventory_item",
        targetId: body.inventory_id,
        result: "failed",
        errorMessage: message,
        metadata: { has_remark: Boolean(body.remark) },
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "disable_inventory",
      module: "inventory",
      targetType: "inventory_item",
      targetId: body.inventory_id,
      result: "success",
      metadata: { has_remark: Boolean(body.remark) },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Admin Inventory] disable failed", error);
    const message = sanitizeError(error, "库存禁用失败");
    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "disable_inventory",
      module: "inventory",
      targetType: "inventory_item",
      result: "failed",
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
