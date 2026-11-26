import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { deliverDigitalOrder, getDeliveryErrorMessage } from "@/lib/delivery/delivery-service";
import { sendEmail } from "@/lib/email/provider";
import { expireUnpaidOrder } from "@/lib/orders/order-expiration";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import {
  ORDER_STATUS_VALUES,
  PAYMENT_STATUS_VALUES,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/orders/order-status";
import { PROMOTION_COMMISSION_RATE } from "@/lib/promotion";
import { getPromotionSettings } from "@/lib/settings/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { reconcileDajuExistingOrderWithSupabase } from "@/lib/providers/daju/fulfillment";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    orderId: string;
  }>;
};

type AuditAdmin = {
  id: string;
  email?: string | null;
};

function getOrderLabel(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const orderNo = (data as Record<string, unknown>).order_no;
  return typeof orderNo === "string" ? orderNo : null;
}

const PAYMENT_FLOW_ONLY_ORDER_STATUSES = new Set(["paid", "payment_completed", "completed_payment"]);


function validateOrderStatusTransition(
  fromStatusRaw: string | null | undefined,
  paymentStatusRaw: string | null | undefined,
  toStatusRaw: string
): string | null {
  const fromStatus = String(fromStatusRaw ?? "").trim().toLowerCase();
  const paymentStatus = String(paymentStatusRaw ?? "unpaid").trim().toLowerCase();
  const toStatus = toStatusRaw.trim().toLowerCase();
  if (!fromStatus || fromStatus === toStatus) return null;
  if (toStatus === "pending_payment") {
    return "不可将订单逆转为待支付状态";
  }
  if (["completed", "delivered", "refunded"].includes(fromStatus) && ["cancelled", "expired", "failed"].includes(toStatus)) {
    return "已交付、已完成或已退款的订单不可逆转为取消/过期/失败，请使用退款流程";
  }
  if (fromStatus === "refunded") {
    return "已退款订单为终态，不可继续流转";
  }
  if (["cancelled", "expired"].includes(fromStatus) && ["processing", "delivered", "completed", "refunded"].includes(toStatus)) {
    return "已取消或已过期订单不可流转为履约或完成状态";
  }
  if (["processing", "delivered", "completed"].includes(toStatus) && paymentStatus !== "paid") {
    return "未支付订单不可跳过支付直接进入处理中、已交付或已完成状态";
  }
  if (toStatus === "refunded" && paymentStatus !== "paid") {
    return "未支付订单不可标记为已退款";
  }
  return null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { orderId } = await context.params;
  let auditAdmin: AuditAdmin | undefined;

  try {
    const admin = await getServerAdminContext();
    if (!admin.ok) {
      await writeAdminAuditLog({
        request,
        action: "update_order_status",
        module: "orders",
        targetType: "order",
        targetId: orderId,
        result: "denied",
        errorMessage: admin.message,
      });
      return NextResponse.json({ error: admin.message }, { status: admin.status });
    }
    auditAdmin = { id: admin.user.id, email: admin.user.email };

    const body = (await request.json().catch(() => null)) as
      | {
          status?: OrderStatus;
          payment_status?: PaymentStatus;
          admin_note?: string;
          adminNote?: string;
        }
      | null;

    const adminNote = (body?.admin_note ?? body?.adminNote ?? null) || null;
    const requestedStatus = String(body?.status ?? "").trim();
    const requestedPaymentStatus = String(body?.payment_status ?? "").trim();
    if (PAYMENT_FLOW_ONLY_ORDER_STATUSES.has(requestedStatus) || requestedPaymentStatus === "paid") {
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "update_order_status",
        module: "orders",
        targetType: "order",
        targetId: orderId,
        result: "failed",
        errorCode: "ORDER_PAYMENT_STATUS_REQUIRES_PAYMENT_FLOW",
        errorMessage: "订单支付成功状态必须通过支付完成流程写入",
        metadata: { requestedStatus: requestedStatus || null, requestedPaymentStatus: requestedPaymentStatus || null },
      });
      return NextResponse.json(
        {
          error: "订单支付成功状态必须通过支付完成流程写入",
          code: "ORDER_PAYMENT_STATUS_REQUIRES_PAYMENT_FLOW",
        },
        { status: 409 }
      );
    }
    const toStatus = body?.status;
    if (!toStatus || !ORDER_STATUS_VALUES.includes(toStatus)) {
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "update_order_status",
        module: "orders",
        targetType: "order",
        targetId: orderId,
        result: "failed",
        errorCode: "invalid_order_status",
        errorMessage: "无效订单状态",
        metadata: { requestedStatus: toStatus ?? null },
      });
      return NextResponse.json({ error: "无效订单状态" }, { status: 400 });
    }

    const paymentStatus = body?.payment_status;
    if (paymentStatus && !PAYMENT_STATUS_VALUES.includes(paymentStatus)) {
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "update_order_status",
        module: "orders",
        targetType: "order",
        targetId: orderId,
        result: "failed",
        errorCode: "invalid_payment_status",
        errorMessage: "无效支付状态",
        metadata: { requestedPaymentStatus: paymentStatus },
      });
      return NextResponse.json({ error: "无效支付状态" }, { status: 400 });
    }

    const { data: currentOrder } = await admin.supabase
      .from("orders")
      .select("id,status,payment_status")
      .eq("id", orderId)
      .maybeSingle();
    if (currentOrder) {
      const transitionError = validateOrderStatusTransition(
        currentOrder.status,
        currentOrder.payment_status,
        toStatus
      );
      if (transitionError) {
        await writeAdminAuditLog({
          request,
          admin: auditAdmin,
          action: "update_order_status",
          module: "orders",
          targetType: "order",
          targetId: orderId,
          result: "failed",
          errorCode: "ORDER_STATUS_TRANSITION_FORBIDDEN",
          errorMessage: transitionError,
          metadata: { fromStatus: currentOrder.status, toStatus, paymentStatus: currentOrder.payment_status },
        });
        return NextResponse.json(
          { error: transitionError, code: "ORDER_STATUS_TRANSITION_FORBIDDEN" },
          { status: 409 }
        );
      }
    }

    const { data, error } = await admin.supabase.rpc("admin_update_order_status", {
      p_order_id: orderId,
      p_to_status: toStatus,
      p_payment_status: paymentStatus ?? null,
      p_admin_note: adminNote,
    });

    if (error) {
      const message = getOrderErrorMessage(error, "订单状态更新失败");
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "update_order_status",
        module: "orders",
        targetType: "order",
        targetId: orderId,
        result: "failed",
        errorCode: typeof error.code === "string" ? error.code : null,
        errorMessage: message,
        metadata: { toStatus, paymentStatus: paymentStatus ?? null },
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const promotionSettings = await getPromotionSettings(admin.supabase).catch(() => ({
      enabled: true,
      commissionRate: PROMOTION_COMMISSION_RATE,
      minWithdrawAmount: 100,
    }));

    if (promotionSettings.enabled) {
      const { error: commissionError } = await admin.supabase.rpc("sync_referral_commission_for_order", {
        p_order_id: orderId,
        p_commission_rate: promotionSettings.commissionRate,
      });

      if (commissionError) {
        console.warn("[Admin Orders] referral commission sync skipped", commissionError);
      }
    }

    const audit = await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "update_order_status",
      module: "orders",
      targetType: "order",
      targetId: orderId,
      targetLabel: getOrderLabel(data),
      result: "success",
      afterSummary: {
        status: toStatus,
        payment_status: paymentStatus ?? null,
        has_admin_note: Boolean(adminNote),
      },
    });

    return NextResponse.json({
      order: data,
      warning_code: audit.ok ? null : "GENERAL_AUDIT_WRITE_FAILED",
    });
  } catch (error) {
    console.error("[Admin Orders] update failed", error);
    const message = getOrderErrorMessage(error, "订单状态更新失败");
    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "update_order_status",
      module: "orders",
      targetType: "order",
      targetId: orderId,
      result: "failed",
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  let auditAdmin: AuditAdmin | undefined;

  try {
    const admin = await getServerAdminContext();
    if (!admin.ok) {
      await writeAdminAuditLog({
        request,
        action: "update_delivery",
        module: "delivery",
        targetType: "order",
        targetId: (await context.params).orderId,
        result: "denied",
        errorMessage: admin.message,
      });
      return NextResponse.json({ error: admin.message }, { status: admin.status });
    }
    auditAdmin = { id: admin.user.id, email: admin.user.email };

    const body = (await request.json().catch(() => null)) as
      | {
          action?: "retry_auto_delivery" | "reconcile_daju_order" | "manual_inventory" | "manual_content" | "mark_failed" | "expire_unpaid_order" | "ship_logistics";
          provider_order_code?: string;
          delivery_type?: string;
          delivery_content?: string;
          delivery_status?: string;
          order_item_id?: string | null;
          inventory_id?: string | null;
          note?: string | null;
          carrier?: string;
          tracking_no?: string;
          shipping_note?: string | null;
          send_email?: boolean;
        }
      | null;

    if (body?.action === "ship_logistics") {
      const orderId = (await context.params).orderId;
      const carrier = String(body.carrier ?? "").trim().slice(0, 60);
      const trackingNo = String(body.tracking_no ?? "").trim().slice(0, 80);
      const shippingNote = String(body.shipping_note ?? "").trim().slice(0, 300);
      const shouldSendEmail = body.send_email !== false;

      if (!carrier) {
        return NextResponse.json({ error: "请选择或填写快递公司" }, { status: 400 });
      }
      if (!trackingNo) {
        return NextResponse.json({ error: "请填写快递单号" }, { status: 400 });
      }

      const serviceClient = getSupabaseServiceRoleClient();
      if (!serviceClient) {
        return NextResponse.json({ error: "服务端权限未配置" }, { status: 503 });
      }

      const { data: orderRow, error: orderLoadError } = await serviceClient
        .from("orders")
        .select("id,order_no,status,payment_status,delivery_type,customer_email,customer_name,customer_phone,shipping_address,admin_note,order_items(id,product_name,sku_title,quantity,delivery_type,delivery_status)")
        .eq("id", orderId)
        .maybeSingle();

      if (orderLoadError || !orderRow) {
        return NextResponse.json({ error: "订单不存在或读取失败" }, { status: 404 });
      }
      if (orderRow.payment_status !== "paid") {
        return NextResponse.json({ error: "未支付订单不可录入物流发货" }, { status: 409 });
      }
      if (["cancelled", "expired", "refunded"].includes(String(orderRow.status ?? ""))) {
        return NextResponse.json({ error: "已取消、已过期或已退款订单不可发货" }, { status: 409 });
      }

      const nowIso = new Date().toISOString();
      const prevAddr =
        orderRow.shipping_address && typeof orderRow.shipping_address === "object" && !Array.isArray(orderRow.shipping_address)
          ? (orderRow.shipping_address as Record<string, unknown>)
          : {};
      const nextShippingAddress = {
        ...prevAddr,
        recipient: String(prevAddr.recipient ?? orderRow.customer_name ?? "").trim() || undefined,
        phone: String(prevAddr.phone ?? orderRow.customer_phone ?? "").trim() || undefined,
        carrier,
        tracking_no: trackingNo,
        shipping_note: shippingNote || null,
        shipped_at: typeof prevAddr.shipped_at === "string" && prevAddr.shipped_at ? prevAddr.shipped_at : nowIso,
        updated_at: nowIso,
        updated_by: admin.user.email ?? admin.user.id,
      };

      const structuredAdminNote = `物流发货：${carrier} ${trackingNo}${shippingNote ? `（${shippingNote}）` : ""}`;
      const currentStatus = String(orderRow.status ?? "");

      if (["paid", "processing"].includes(currentStatus)) {
        const { error: statusErr } = await admin.supabase.rpc("admin_update_order_status", {
          p_order_id: orderId,
          p_to_status: "delivered",
          p_payment_status: null,
          p_admin_note: structuredAdminNote,
        });
        if (statusErr) {
          return NextResponse.json(
            { error: getOrderErrorMessage(statusErr, "更新发货状态失败") },
            { status: 400 }
          );
        }
      }

      const { error: orderPatchError } = await serviceClient
        .from("orders")
        .update({
          shipping_address: nextShippingAddress,
          admin_note: structuredAdminNote,
          fulfillment_status: "delivered",
          updated_at: nowIso,
        })
        .eq("id", orderId);

      if (orderPatchError) {
        return NextResponse.json(
          { error: getOrderErrorMessage(orderPatchError, "保存物流单号失败") },
          { status: 500 }
        );
      }

      const orderItems = Array.isArray(orderRow.order_items)
        ? (orderRow.order_items as Array<{ id: string; product_name?: string; sku_title?: string; quantity?: number; delivery_type?: string }>)
        : [];
      for (const item of orderItems) {
        if (String(item.delivery_type ?? orderRow.delivery_type ?? "").toLowerCase() === "shipping") {
          await serviceClient
            .from("order_items")
            .update({
              delivery_status: "delivered",
              delivered_quantity: Number(item.quantity ?? 1),
              delivery_completed_at: nowIso,
            })
            .eq("id", item.id);
        }
      }

      let emailSent = false;
      const recipientEmail = String(orderRow.customer_email ?? "").trim();
      if (shouldSendEmail && recipientEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
        const itemSummary = orderItems
          .map((item) => `${item.product_name || "实物商品"}${item.sku_title ? ` (${item.sku_title})` : ""} × ${item.quantity ?? 1}`)
          .join("、") || "实物商品";
        const recipientName = String(nextShippingAddress.recipient ?? "").trim();
        const recipientPhone = String(nextShippingAddress.phone ?? "").trim();
        const addressText = String(prevAddr.address ?? prevAddr.region ?? "").trim();

        const escapeHtml = (v: string) =>
          v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

        try {
          await sendEmail({
            to: recipientEmail,
            subject: `【Jianlian Shop 发货通知】您的订单 ${orderRow.order_no} 已发出（${carrier}）`,
            html: `
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #f0e4d7;border-radius:14px;background:#fffcf8;color:#1f2329;">
                <h2 style="margin:0 0 12px;font-size:18px;color:#c2571a;">📦 您的实物订单已安排物流发出</h2>
                <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#4e5969;">
                  您好！您在 <strong>Jianlian Shop</strong> 购买的商品已由仓库揽收寄出，您可通过以下快递单号随时追踪物流进度：
                </p>
                <div style="background:#ffffff;border:1px solid #f2e8dc;border-radius:10px;padding:14px 16px;font-size:13px;line-height:1.85;">
                  <div><strong>订单编号：</strong><code>${escapeHtml(String(orderRow.order_no))}</code></div>
                  <div><strong>购买商品：</strong>${escapeHtml(itemSummary)}</div>
                  <div><strong>快递公司：</strong>${escapeHtml(carrier)}</div>
                  <div><strong>快递单号：</strong><code style="font-size:15px;font-weight:700;color:#c2571a;">${escapeHtml(trackingNo)}</code></div>
                  ${recipientName ? `<div><strong>收件人：</strong>${escapeHtml(recipientName)}${recipientPhone ? `（${escapeHtml(recipientPhone)}）` : ""}</div>` : ""}
                  ${addressText ? `<div><strong>收货地址：</strong>${escapeHtml(addressText)}</div>` : ""}
                  ${shippingNote ? `<div><strong>发货备注：</strong>${escapeHtml(shippingNote)}</div>` : ""}
                </div>
                <p style="margin:14px 0 0;font-size:12px;color:#86909c;line-height:1.6;">
                  您也可以随时访问 <a href="https://www.jianlian.shop/account/orders" style="color:#c2571a;">Jianlian Shop 订单查询</a> 查看最新物流状态。如有疑问请联系网站在线客服。
                </p>
              </div>
            `,
            text: [
              `【Jianlian Shop 发货通知】您的订单 ${orderRow.order_no} 已发出`,
              `购买商品：${itemSummary}`,
              `快递公司：${carrier}`,
              `快递单号：${trackingNo}`,
              recipientName ? `收件人：${recipientName} ${recipientPhone}` : null,
              addressText ? `收货地址：${addressText}` : null,
              shippingNote ? `发货备注：${shippingNote}` : null,
            ].filter(Boolean).join("\n"),
            templateCode: "order_logistics_shipped",
            businessType: "order",
            businessId: orderId,
            idempotencyKey: `logistics-shipped:${orderId}:${trackingNo}`,
          });
          emailSent = true;
        } catch (mailErr) {
          console.warn("[Admin Orders] logistics shipping email failed", mailErr);
        }
      }

      const { data: refreshedOrder } = await serviceClient
        .from("orders")
        .select("*,order_items(*),order_status_logs(*),order_deliveries(id,order_id,order_item_id,delivery_type,delivery_status,delivered_at,created_at,updated_at)")
        .eq("id", orderId)
        .maybeSingle();

      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "ship_logistics_order",
        module: "delivery",
        targetType: "order",
        targetId: orderId,
        targetLabel: String(orderRow.order_no ?? orderId),
        result: "success",
        afterSummary: {
          carrier,
          tracking_no: trackingNo,
          has_shipping_note: Boolean(shippingNote),
          email_sent: emailSent,
        },
      });

      return NextResponse.json({
        ok: true,
        order: refreshedOrder ?? {
          ...orderRow,
          status: ["paid", "processing"].includes(currentStatus) ? "delivered" : currentStatus,
          fulfillment_status: "delivered",
          shipping_address: nextShippingAddress,
          admin_note: structuredAdminNote,
          updated_at: nowIso,
        },
        emailSent,
      });
    }

    if (body?.action === "expire_unpaid_order") {
      const reason = String(body.note ?? "").trim();
      if (!reason) {
        await writeAdminAuditLog({
          request,
          admin: auditAdmin,
          action: "expire_unpaid_order",
          module: "orders",
          targetType: "order",
          targetId: (await context.params).orderId,
          result: "failed",
          errorCode: "missing_reason",
          errorMessage: "关闭未支付订单必须填写原因",
        });
        return NextResponse.json({ error: "请填写关闭原因" }, { status: 400 });
      }

      const result = await expireUnpaidOrder((await context.params).orderId, `admin:${reason}`);
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "expire_unpaid_order",
        module: "orders",
        targetType: "order",
        targetId: (await context.params).orderId,
        result: result.ok ? "success" : "failed",
        errorCode: result.ok ? null : result.code,
        errorMessage: result.ok ? null : result.message,
        afterSummary: {
          code: result.code,
          released_normal: result.releasedNormal ?? 0,
          released_sku: result.releasedSku ?? 0,
          released_digital: result.releasedDigital ?? 0,
          request_id: result.requestId,
        },
      });
      return NextResponse.json({ result });
    }
    if (body?.action === "reconcile_daju_order") {
      const orderItemId = typeof body.order_item_id === "string" ? body.order_item_id.trim() : "";
      const providerOrderCode = typeof body.provider_order_code === "string" ? body.provider_order_code.trim() : "";
      if (!/^[a-f0-9-]{36}$/i.test(orderItemId) || !/^[a-zA-Z0-9_-]{1,160}$/.test(providerOrderCode)) {
        return NextResponse.json({ error: "供应商订单协调参数无效", code: "DAJU_RECONCILIATION_INPUT_INVALID" }, { status: 400 });
      }
      const serviceClient = getSupabaseServiceRoleClient();
      if (!serviceClient) {
        return NextResponse.json({ error: "服务端交付权限未配置", code: "SERVICE_ROLE_UNAVAILABLE" }, { status: 503 });
      }
      try {
        const result = await reconcileDajuExistingOrderWithSupabase({
          service: serviceClient,
          orderId: (await context.params).orderId,
          orderItemId,
          orderCode: providerOrderCode,
          triggerSource: "admin_reconcile_existing_daju_order",
        });
        await writeAdminAuditLog({
          request,
          admin: auditAdmin,
          action: "reconcile_daju_order",
          module: "delivery",
          targetType: "order",
          targetId: (await context.params).orderId,
          result: "success",
          afterSummary: { provider_order_code: result.orderCode, delivered_count: result.deliveredCount, request_id: result.requestId },
        });
        return NextResponse.json({
          ok: true,
          code: "DAJU_RECONCILIATION_COMPLETED",
          orderCode: result.orderCode,
          requestId: result.requestId,
          deliveredCount: result.deliveredCount,
        });
      } catch (error) {
        const code = error instanceof Error && /^DAJU_[A-Z0-9_]+$/.test(error.message)
          ? error.message
          : "DAJU_RECONCILIATION_FAILED";
        await writeAdminAuditLog({
          request,
          admin: auditAdmin,
          action: "reconcile_daju_order",
          module: "delivery",
          targetType: "order",
          targetId: (await context.params).orderId,
          result: "failed",
          errorCode: code,
          errorMessage: "供应商已有订单协调失败，未执行新采购",
        });
        return NextResponse.json({ error: "供应商已有订单协调失败，未执行新采购", code }, { status: 409 });
      }
    }
    if (body?.action === "retry_auto_delivery") {
      const serviceClient = getSupabaseServiceRoleClient();
      if (!serviceClient) {
        await writeAdminAuditLog({
          request,
          admin: auditAdmin,
          action: "retry_auto_delivery",
          module: "delivery",
          targetType: "order",
          targetId: (await context.params).orderId,
          result: "failed",
          errorCode: "service_role_unavailable",
          errorMessage: "服务端交付权限未配置",
        });
        return NextResponse.json({ error: "服务端交付权限未配置" }, { status: 503 });
      }
      try {
        const result = await deliverDigitalOrder(serviceClient, (await context.params).orderId, "admin_retry");
        const { error: paymentErrorCleanupError } = await serviceClient
          .from("payment_sessions")
          .update({ last_error: null })
          .eq("business_type", "order")
          .eq("business_id", (await context.params).orderId)
          .eq("status", "paid");
        if (paymentErrorCleanupError) {
          console.warn("[Admin Orders] paid payment delivery error cleanup skipped", {
            code: paymentErrorCleanupError.code ?? null,
          });
        }
        await writeAdminAuditLog({
          request,
          admin: auditAdmin,
          action: "retry_auto_delivery",
          module: "delivery",
          targetType: "order",
          targetId: (await context.params).orderId,
          result: "success",
          afterSummary: { delivered_count: result.delivered_count ?? 0 },
        });
        return NextResponse.json({ deliveredCount: result.delivered_count ?? 0, result });
      } catch (deliveryError) {
        const message = getDeliveryErrorMessage(deliveryError, "自动发货重试失败");
        await writeAdminAuditLog({
          request,
          admin: auditAdmin,
          action: "retry_auto_delivery",
          module: "delivery",
          targetType: "order",
          targetId: (await context.params).orderId,
          result: "failed",
          errorMessage: message,
        });
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    if (body?.action === "manual_inventory") {
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "manual_inventory_delivery",
        module: "inventory",
        targetType: "order",
        targetId: (await context.params).orderId,
        result: "failed",
        errorCode: "legacy_inventory_delivery_disabled",
        errorMessage: "旧版指定库存发货入口已停用，请使用安全的自动交付或逐项人工交付流程",
      });
      return NextResponse.json(
        { error: "旧版指定库存发货入口已停用，请使用安全的自动交付或逐项人工交付流程" },
        { status: 410 },
      );
    }

    if (body?.action === "mark_failed") {
      const { error } = await admin.supabase.rpc("admin_mark_delivery_failed", {
        p_order_id: (await context.params).orderId,
        p_note: body.note ?? null,
      });

      if (error) {
        const message = getOrderErrorMessage(error, "交付失败标记失败");
        await writeAdminAuditLog({
          request,
          admin: auditAdmin,
          action: "mark_delivery_failed",
          module: "delivery",
          targetType: "order",
          targetId: (await context.params).orderId,
          result: "failed",
          errorCode: typeof error.code === "string" ? error.code : null,
          errorMessage: message,
        });
        return NextResponse.json({ error: message }, { status: 400 });
      }

      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "mark_delivery_failed",
        module: "delivery",
        targetType: "order",
        targetId: (await context.params).orderId,
        result: "success",
        metadata: { has_note: Boolean(body.note) },
      });
      return NextResponse.json({ ok: true });
    }

    const deliveryContent = body?.delivery_content?.trim();
    if (!deliveryContent) {
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "append_manual_delivery",
        module: "delivery",
        targetType: "order",
        targetId: (await context.params).orderId,
        result: "failed",
        errorCode: "missing_delivery_content",
        errorMessage: "请填写交付信息",
      });
      return NextResponse.json({ error: "请填写交付信息" }, { status: 400 });
    }

    if (!body?.order_item_id) {
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "append_manual_delivery",
        module: "delivery",
        targetType: "order",
        targetId: (await context.params).orderId,
        result: "failed",
        errorCode: "missing_order_item",
        errorMessage: "请选择需要人工交付的订单商品",
      });
      return NextResponse.json({ error: "请选择需要人工交付的订单商品" }, { status: 400 });
    }

    const serviceClient = getSupabaseServiceRoleClient();
    if (!serviceClient) {
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "append_manual_delivery",
        module: "delivery",
        targetType: "order",
        targetId: (await context.params).orderId,
        result: "failed",
        errorCode: "service_role_unavailable",
        errorMessage: "服务端交付权限未配置",
      });
      return NextResponse.json({ error: "服务端交付权限未配置" }, { status: 503 });
    }

    const { data, error } = await serviceClient.rpc("admin_deliver_order_item_manual", {
      p_order_id: (await context.params).orderId,
      p_order_item_id: body.order_item_id,
      p_delivery_content: deliveryContent,
      p_delivery_note: body?.note ?? null,
    });

    if (error) {
      const message = getOrderErrorMessage(error, "交付信息保存失败");
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "append_manual_delivery",
        module: "delivery",
        targetType: "order",
        targetId: (await context.params).orderId,
        result: "failed",
        errorCode: typeof error.code === "string" ? error.code : null,
        errorMessage: message,
        metadata: {
          order_item_id: body?.order_item_id ?? null,
          delivery_type: body?.delivery_type ?? null,
          has_delivery_content: true,
        },
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "append_manual_delivery",
      module: "delivery",
      targetType: "order",
      targetId: (await context.params).orderId,
      result: "success",
      metadata: {
        order_item_id: body?.order_item_id ?? null,
        delivery_type: body?.delivery_type ?? null,
        delivery_status: body?.delivery_status ?? "delivered",
        has_delivery_content: true,
      },
    });
    return NextResponse.json({ delivery: data });
  } catch (error) {
    console.error("[Admin Orders] delivery update failed", error);
    const message = getOrderErrorMessage(error, "交付信息保存失败");
    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "update_delivery",
      module: "delivery",
      targetType: "order",
      targetId: (await context.params).orderId,
      result: "failed",
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}




