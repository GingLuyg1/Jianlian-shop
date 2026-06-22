import { NextResponse } from "next/server";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";

export const dynamic = "force-dynamic";

const INVENTORY_STATUSES = new Set([
  "all",
  "available",
  "reserved",
  "delivered",
  "disabled",
  "invalid",
]);

function sanitizeError(error: unknown, fallback: string) {
  return getOrderErrorMessage(error, fallback)
    .replace(/digital_inventory/gi, "库存")
    .replace(/public\./gi, "");
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const next = Math.floor(Number(value ?? fallback));
  if (!Number.isFinite(next)) return fallback;
  return Math.min(Math.max(next, 1), max);
}

export async function GET(request: Request) {
  try {
    const admin = await getServerAdminContext();
    if (!admin.ok) {
      return NextResponse.json({ error: admin.message }, { status: admin.status });
    }

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
        return NextResponse.json({ error: sanitizeError(error, "商品读取失败") }, { status: 400 });
      }

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
        return NextResponse.json({ error: sanitizeError(error, "库存详情读取失败") }, { status: 400 });
      }

      const rows = data ?? [];
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
      return NextResponse.json({ error: sanitizeError(error, "库存列表读取失败") }, { status: 400 });
    }

    const rows = data ?? [];
    return NextResponse.json({
      rows,
      count: Number(rows[0]?.total_rows ?? 0),
    });
  } catch (error) {
    console.error("[Admin Inventory] GET failed", error);
    return NextResponse.json({ error: sanitizeError(error, "库存读取失败") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getServerAdminContext();
    if (!admin.ok) {
      return NextResponse.json({ error: admin.message }, { status: admin.status });
    }

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
      return NextResponse.json({ error: "请填写库存内容" }, { status: 400 });
    }

    if (normalized.length > 1000) {
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
      return NextResponse.json({ error: sanitizeError(error, "库存导入失败") }, { status: 400 });
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ result });
  } catch (error) {
    console.error("[Admin Inventory] import failed", error);
    return NextResponse.json({ error: sanitizeError(error, "库存导入失败") }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await getServerAdminContext();
    if (!admin.ok) {
      return NextResponse.json({ error: admin.message }, { status: admin.status });
    }

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
      return NextResponse.json({ error: sanitizeError(error, "库存禁用失败") }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Admin Inventory] disable failed", error);
    return NextResponse.json({ error: sanitizeError(error, "库存禁用失败") }, { status: 500 });
  }
}
