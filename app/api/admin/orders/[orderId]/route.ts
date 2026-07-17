import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { deliverDigitalOrder, getDeliveryErrorMessage } from "@/lib/delivery/delivery-service";
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

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    orderId: string;
  };
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


export async function PATCH(request: Request, context: RouteContext) {
  let auditAdmin: AuditAdmin | undefined;

  try {
    const admin = await getServerAdminContext();
    if (!admin.ok) {
      await writeAdminAuditLog({
        request,
        action: "update_order_status",
        module: "orders",
        targetType: "order",
        targetId: context.params.orderId,
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
        }
      | null;

    const requestedStatus = String(body?.status ?? "").trim();
    const requestedPaymentStatus = String(body?.payment_status ?? "").trim();
    if (PAYMENT_FLOW_ONLY_ORDER_STATUSES.has(requestedStatus) || requestedPaymentStatus === "paid") {
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "update_order_status",
        module: "orders",
        targetType: "order",
        targetId: context.params.orderId,
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
        targetId: context.params.orderId,
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
        targetId: context.params.orderId,
        result: "failed",
        errorCode: "invalid_payment_status",
        errorMessage: "无效支付状态",
        metadata: { requestedPaymentStatus: paymentStatus },
      });
      return NextResponse.json({ error: "无效支付状态" }, { status: 400 });
    }

    const { data, error } = await admin.supabase.rpc("admin_update_order_status", {
      p_order_id: context.params.orderId,
      p_to_status: toStatus,
      p_payment_status: paymentStatus ?? null,
      p_admin_note: body?.admin_note ?? null,
    });

    if (error) {
      const message = getOrderErrorMessage(error, "订单状态更新失败");
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "update_order_status",
        module: "orders",
        targetType: "order",
        targetId: context.params.orderId,
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
        p_order_id: context.params.orderId,
        p_commission_rate: promotionSettings.commissionRate,
      });

      if (commissionError) {
        console.warn("[Admin Orders] referral commission sync skipped", commissionError);
      }
    }

    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "update_order_status",
      module: "orders",
      targetType: "order",
      targetId: context.params.orderId,
      targetLabel: getOrderLabel(data),
      result: "success",
      afterSummary: {
        status: toStatus,
        payment_status: paymentStatus ?? null,
        has_admin_note: Boolean(body?.admin_note),
      },
    });

    return NextResponse.json({ order: data });
  } catch (error) {
    console.error("[Admin Orders] update failed", error);
    const message = getOrderErrorMessage(error, "订单状态更新失败");
    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "update_order_status",
      module: "orders",
      targetType: "order",
      targetId: context.params.orderId,
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
        targetId: context.params.orderId,
        result: "denied",
        errorMessage: admin.message,
      });
      return NextResponse.json({ error: admin.message }, { status: admin.status });
    }
    auditAdmin = { id: admin.user.id, email: admin.user.email };

    const body = (await request.json().catch(() => null)) as
      | {
          action?: "retry_auto_delivery" | "manual_inventory" | "manual_content" | "mark_failed" | "expire_unpaid_order";
          delivery_type?: string;
          delivery_content?: string;
          delivery_status?: string;
          order_item_id?: string | null;
          inventory_id?: string | null;
          note?: string | null;
        }
      | null;

    if (body?.action === "expire_unpaid_order") {
      const reason = String(body.note ?? "").trim();
      if (!reason) {
        await writeAdminAuditLog({
          request,
          admin: auditAdmin,
          action: "expire_unpaid_order",
          module: "orders",
          targetType: "order",
          targetId: context.params.orderId,
          result: "failed",
          errorCode: "missing_reason",
          errorMessage: "关闭未支付订单必须填写原因",
        });
        return NextResponse.json({ error: "请填写关闭原因" }, { status: 400 });
      }

      const result = await expireUnpaidOrder(context.params.orderId, `admin:${reason}`);
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "expire_unpaid_order",
        module: "orders",
        targetType: "order",
        targetId: context.params.orderId,
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
    if (body?.action === "retry_auto_delivery") {
      try {
        const result = await deliverDigitalOrder(admin.supabase, context.params.orderId, "admin_retry");
        await writeAdminAuditLog({
          request,
          admin: auditAdmin,
          action: "retry_auto_delivery",
          module: "delivery",
          targetType: "order",
          targetId: context.params.orderId,
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
          targetId: context.params.orderId,
          result: "failed",
          errorMessage: message,
        });
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    if (body?.action === "manual_inventory") {
      if (!body.inventory_id || !body.order_item_id) {
        await writeAdminAuditLog({
          request,
          admin: auditAdmin,
          action: "manual_inventory_delivery",
          module: "inventory",
          targetType: "order",
          targetId: context.params.orderId,
          result: "failed",
          errorCode: "missing_inventory_or_item",
          errorMessage: "请选择库存和订单商品",
        });
        return NextResponse.json({ error: "请选择库存和订单商品" }, { status: 400 });
      }

      const { data, error } = await admin.supabase.rpc("admin_deliver_inventory_item", {
        p_order_id: context.params.orderId,
        p_order_item_id: body.order_item_id,
        p_inventory_id: body.inventory_id,
        p_note: body.note ?? null,
      });

      if (error) {
        const message = getOrderErrorMessage(error, "手动选择库存发货失败");
        await writeAdminAuditLog({
          request,
          admin: auditAdmin,
          action: "manual_inventory_delivery",
          module: "inventory",
          targetType: "order",
          targetId: context.params.orderId,
          result: "failed",
          errorCode: typeof error.code === "string" ? error.code : null,
          errorMessage: message,
          metadata: { order_item_id: body.order_item_id, inventory_id: body.inventory_id },
        });
        return NextResponse.json({ error: message }, { status: 400 });
      }

      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "manual_inventory_delivery",
        module: "inventory",
        targetType: "order",
        targetId: context.params.orderId,
        result: "success",
        metadata: { order_item_id: body.order_item_id, inventory_id: body.inventory_id },
      });
      return NextResponse.json({ delivery: data });
    }

    if (body?.action === "mark_failed") {
      const { error } = await admin.supabase.rpc("admin_mark_delivery_failed", {
        p_order_id: context.params.orderId,
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
          targetId: context.params.orderId,
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
        targetId: context.params.orderId,
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
        targetId: context.params.orderId,
        result: "failed",
        errorCode: "missing_delivery_content",
        errorMessage: "请填写交付信息",
      });
      return NextResponse.json({ error: "请填写交付信息" }, { status: 400 });
    }

    const { data, error } = await admin.supabase.rpc("admin_append_manual_delivery", {
      p_order_id: context.params.orderId,
      p_order_item_id: body?.order_item_id ?? null,
      p_delivery_type: body?.delivery_type ?? null,
      p_delivery_content: deliveryContent,
      p_delivery_status: body?.delivery_status ?? "delivered",
      p_note: body?.note ?? null,
    });

    if (error) {
      const message = getOrderErrorMessage(error, "交付信息保存失败");
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "append_manual_delivery",
        module: "delivery",
        targetType: "order",
        targetId: context.params.orderId,
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
      targetId: context.params.orderId,
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
      targetId: context.params.orderId,
      result: "failed",
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}




