import { NextResponse } from "next/server";

import { getOrderErrorMessage, listUserOrders } from "@/lib/orders/order-queries";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ORDER_CREATE_ALLOWED_KEYS = new Set([
  "product_id",
  "productId",
  "sku_id",
  "skuId",
  "quantity",
  "client_request_id",
  "clientRequestId",
  "customer_email",
  "customer_name",
  "customer_phone",
  "shipping_address",
  "customer_note",
]);

export async function GET(request: Request) {
  try {
    if (!hasSupabaseServerConfig()) {
      return NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 500 });
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
    const status = url.searchParams.get("status") ?? "all";
    const paymentStatus = url.searchParams.get("paymentStatus") ?? "all";
    const search = url.searchParams.get("search") ?? "";
    const customerEmail = url.searchParams.get("email") ?? "";

    const result = await listUserOrders(supabase, user.id, {
      page,
      pageSize,
      status: status as never,
      paymentStatus: paymentStatus as never,
      search,
      customerEmail,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Orders] list failed", getOrderErrorMessage(error, "订单读取失败"));
    return NextResponse.json(
      { error: getOrderErrorMessage(error, "订单读取失败，请稍后重试") },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!hasSupabaseServerConfig()) {
      return NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 500 });
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "请先登录后再下单" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | {
          product_id?: string;
          productId?: string;
          sku_id?: string;
          skuId?: string;
          quantity?: number;
          client_request_id?: string;
          clientRequestId?: string;
          customer_email?: string;
          customer_name?: string;
          customer_phone?: string;
          shipping_address?: Record<string, unknown> | null;
          customer_note?: string;
        }
      | null;

    if (!body || Object.keys(body).some((key) => !ORDER_CREATE_ALLOWED_KEYS.has(key))) {
      return NextResponse.json({ error: "订单参数不正确" }, { status: 400 });
    }

    const productId = String(body.product_id ?? body.productId ?? "").trim();
    const skuId = String(body.sku_id ?? body.skuId ?? "").trim() || null;
    const clientRequestId = String(body.client_request_id ?? body.clientRequestId ?? "").trim();
    const quantityValue = Number(body.quantity ?? 1);
    const quantity = Math.floor(quantityValue);
    const customerEmail = body.customer_email?.trim() || user.email || null;
    const customerName = body.customer_name?.trim() || null;
    const customerPhone = body.customer_phone?.trim() || null;
    const customerNote = body.customer_note?.trim() || null;

    if (!productId) {
      return NextResponse.json({ error: "请选择商品" }, { status: 400 });
    }

    if (!Number.isInteger(quantityValue) || quantity <= 0 || quantity > 999) {
      return NextResponse.json({ error: "购买数量不正确" }, { status: 400 });
    }

    if (!clientRequestId || clientRequestId.length > 120) {
      return NextResponse.json({ error: "缺少有效的下单请求编号" }, { status: 400 });
    }

    if (!customerEmail) {
      return NextResponse.json({ error: "请填写联系邮箱" }, { status: 400 });
    }

    const { count: activeSkuCount, error: skuCountError } = await supabase
      .from("product_skus")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("status", "active");

    if (skuCountError && !/product_skus|does not exist|schema cache|PGRST/i.test(skuCountError.message)) {
      return NextResponse.json(
        { error: getOrderErrorMessage(skuCountError, "规格信息读取失败，请稍后重试") },
        { status: 400 }
      );
    }

    if ((activeSkuCount ?? 0) > 0 && !skuId) {
      return NextResponse.json({ error: "请选择完整商品规格" }, { status: 400 });
    }

    const orderPayload: Record<string, unknown> = {
      p_product_id: productId,
      p_quantity: quantity,
      p_customer_email: customerEmail,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_customer_note: customerNote,
      p_shipping_address: body.shipping_address ?? null,
      p_client_request_id: clientRequestId,
    };

    if (skuId) {
      orderPayload.p_sku_id = skuId;
    }

    const { data, error } = await supabase.rpc("create_order_with_item", orderPayload);

    if (error) {
      return NextResponse.json(
        { error: getOrderErrorMessage(error, "订单创建失败，请稍后重试") },
        { status: 400 }
      );
    }

    const created = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({ order: created });
  } catch (error) {
    console.error("[Orders] create failed", getOrderErrorMessage(error, "订单创建失败"));
    return NextResponse.json(
      { error: getOrderErrorMessage(error, "订单创建失败，请稍后重试") },
      { status: 500 }
    );
  }
}
