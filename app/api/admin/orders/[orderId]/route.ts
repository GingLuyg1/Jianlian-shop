import { NextResponse } from "next/server";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import { PROMOTION_COMMISSION_RATE } from "@/lib/promotion";
import { getPromotionSettings } from "@/lib/settings/server";
import {
  ORDER_STATUS_VALUES,
  PAYMENT_STATUS_VALUES,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/orders/order-status";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    orderId: string;
  };
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const admin = await getServerAdminContext();
    if (!admin.ok) {
      return NextResponse.json({ error: admin.message }, { status: admin.status });
    }

    const body = (await request.json().catch(() => null)) as
      | {
          status?: OrderStatus;
          payment_status?: PaymentStatus;
          admin_note?: string;
        }
      | null;

    const toStatus = body?.status;
    if (!toStatus || !ORDER_STATUS_VALUES.includes(toStatus)) {
      return NextResponse.json({ error: "无效订单状态" }, { status: 400 });
    }

    const paymentStatus = body?.payment_status;
    if (paymentStatus && !PAYMENT_STATUS_VALUES.includes(paymentStatus)) {
      return NextResponse.json({ error: "无效支付状态" }, { status: 400 });
    }

    const { data, error } = await admin.supabase.rpc("admin_update_order_status", {
      p_order_id: context.params.orderId,
      p_to_status: toStatus,
      p_payment_status: paymentStatus ?? null,
      p_admin_note: body?.admin_note ?? null,
    });

    if (error) {
      return NextResponse.json(
        { error: getOrderErrorMessage(error, "订单状态更新失败") },
        { status: 400 }
      );
    }

    const promotionSettings = await getPromotionSettings(admin.supabase).catch(() => ({
      enabled: true,
      commissionRate: PROMOTION_COMMISSION_RATE,
      minWithdrawAmount: 100,
    }));

    if (promotionSettings.enabled) {
      const { error: commissionError } = await admin.supabase.rpc(
        "sync_referral_commission_for_order",
        {
          p_order_id: context.params.orderId,
          p_commission_rate: promotionSettings.commissionRate,
        }
      );

      if (commissionError) {
        console.warn("[Admin Orders] referral commission sync skipped", commissionError);
      }
    }

    return NextResponse.json({ order: data });
  } catch (error) {
    console.error("[Admin Orders] update failed", error);
    return NextResponse.json(
      { error: getOrderErrorMessage(error, "订单状态更新失败") },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await getServerAdminContext();
    if (!admin.ok) {
      return NextResponse.json({ error: admin.message }, { status: admin.status });
    }

    const body = (await request.json().catch(() => null)) as
      | {
          action?: "retry_auto_delivery" | "manual_inventory" | "manual_content" | "mark_failed";
          delivery_type?: string;
          delivery_content?: string;
          delivery_status?: string;
          order_item_id?: string | null;
          inventory_id?: string | null;
          note?: string | null;
        }
      | null;

    if (body?.action === "retry_auto_delivery") {
      const { data, error } = await admin.supabase.rpc("admin_retry_auto_delivery", {
        p_order_id: context.params.orderId,
      });

      if (error) {
        return NextResponse.json(
          { error: getOrderErrorMessage(error, "自动发货重试失败") },
          { status: 400 }
        );
      }

      return NextResponse.json({ deliveredCount: data ?? 0 });
    }

    if (body?.action === "manual_inventory") {
      if (!body.inventory_id || !body.order_item_id) {
        return NextResponse.json({ error: "请选择库存和订单商品" }, { status: 400 });
      }

      const { data, error } = await admin.supabase.rpc("admin_deliver_inventory_item", {
        p_order_id: context.params.orderId,
        p_order_item_id: body.order_item_id,
        p_inventory_id: body.inventory_id,
        p_note: body.note ?? null,
      });

      if (error) {
        return NextResponse.json(
          { error: getOrderErrorMessage(error, "手动选择库存发货失败") },
          { status: 400 }
        );
      }

      return NextResponse.json({ delivery: data });
    }

    if (body?.action === "mark_failed") {
      const { error } = await admin.supabase.rpc("admin_mark_delivery_failed", {
        p_order_id: context.params.orderId,
        p_note: body.note ?? null,
      });

      if (error) {
        return NextResponse.json(
          { error: getOrderErrorMessage(error, "交付失败标记失败") },
          { status: 400 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    const deliveryContent = body?.delivery_content?.trim();
    if (!deliveryContent) {
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
      return NextResponse.json(
        { error: getOrderErrorMessage(error, "交付信息保存失败") },
        { status: 400 }
      );
    }

    return NextResponse.json({ delivery: data });
  } catch (error) {
    console.error("[Admin Orders] delivery update failed", error);
    return NextResponse.json(
      { error: getOrderErrorMessage(error, "交付信息保存失败") },
      { status: 500 }
    );
  }
}
