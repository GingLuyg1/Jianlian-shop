import { NextResponse } from "next/server";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
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

    const { error: commissionError } = await admin.supabase.rpc(
      "sync_referral_commission_for_order",
      {
        p_order_id: context.params.orderId,
        p_commission_rate: 0.03,
      }
    );

    if (commissionError) {
      console.warn("[Admin Orders] referral commission sync skipped", commissionError);
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
          delivery_type?: string;
          delivery_content?: string;
          delivery_status?: string;
          order_item_id?: string | null;
        }
      | null;

    const deliveryContent = body?.delivery_content?.trim();
    if (!deliveryContent) {
      return NextResponse.json({ error: "请填写交付信息" }, { status: 400 });
    }

    const { data, error } = await admin.supabase.rpc("admin_upsert_order_delivery", {
      p_order_id: context.params.orderId,
      p_order_item_id: body?.order_item_id ?? null,
      p_delivery_type: body?.delivery_type ?? null,
      p_delivery_content: deliveryContent,
      p_delivery_status: body?.delivery_status ?? "delivered",
      p_delivered_at: new Date().toISOString(),
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
