import "server-only";

import { sendEmail } from "@/lib/email/provider";

const ALERT_RECIPIENT =
  process.env.SUPPLIER_BALANCE_ALERT_EMAIL ||
  ["Gac000189", "gmail.com"].join("@");
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes per supplier + reason key
const lastAlertSentAt = new Map<string, number>();

export type SupplierBalanceAlertInput = {
  supplierCode: "daju" | "kuajingzy" | string;
  supplierName: string;
  availableBalance?: string | number | null;
  requiredAmount?: string | number | null;
  currency?: string;
  orderId?: string | null;
  orderItemId?: string | null;
  productId?: string | null;
  reason?: string | null;
};

export function isSupplierInsufficientBalanceError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const classification =
    error && typeof error === "object" && "classification" in error
      ? String((error as { classification?: unknown }).classification ?? "")
      : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  const combined = `${code} ${classification} ${message}`.toUpperCase();
  return (
    combined.includes("BALANCE_INSUFFICIENT") ||
    combined.includes("INSUFFICIENT_BALANCE") ||
    combined.includes("NO_DEBIT_INSUFFICIENT_BALANCE")
  );
}

export async function notifySupplierInsufficientBalance(
  input: SupplierBalanceAlertInput
): Promise<void> {
  try {
    const key = `${input.supplierCode}:${input.orderId ? "order" : "low_balance"}`;
    const now = Date.now();
    const prev = lastAlertSentAt.get(key) ?? 0;
    if (now - prev < COOLDOWN_MS) {
      return;
    }
    lastAlertSentAt.set(key, now);

    const currency = input.currency || "CNY";
    const balanceDisplay =
      input.availableBalance !== undefined && input.availableBalance !== null
        ? `${input.availableBalance} ${currency}`
        : "余额不足（低于订单所需成本）";
    const requiredDisplay =
      input.requiredAmount !== undefined && input.requiredAmount !== null
        ? `${input.requiredAmount} ${currency}`
        : "以实际采购单金额为准";
    const timeDisplay = new Date(now).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
    });

    const subject = `【Jianlian Shop 余额预警】上游供应商「${input.supplierName}」账户余额不足`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #f0e4d7; border-radius: 14px; background: #fffcf8; color: #1f2329;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #c2571a;">⚠️ 上游供应商账户余额不足提醒</h2>
        <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #4e5969;">
          您好！系统检测到上游卡网供应商 <strong>${input.supplierName}（${input.supplierCode}）</strong> 当前账户可用余额不足，可能会影响客户付款后的自动采购发货，请及时前往上游充值。
        </p>
        <div style="background: #ffffff; border: 1px solid #f2e8dc; border-radius: 10px; padding: 14px 16px; font-size: 13px; line-height: 1.8;">
          <div><strong>供应商：</strong>${input.supplierName} (${input.supplierCode})</div>
          <div><strong>当前可用余额：</strong><span style="color: #d93026; font-weight: 600;">${balanceDisplay}</span></div>
          ${input.requiredAmount ? `<div><strong>本次所需成本：</strong>${requiredDisplay}</div>` : ""}
          ${input.orderId ? `<div><strong>关联客户订单 ID：</strong><code>${input.orderId}</code></div>` : ""}
          ${input.orderItemId ? `<div><strong>关联订单明细 ID：</strong><code>${input.orderItemId}</code></div>` : ""}
          ${input.productId ? `<div><strong>上游商品 ID：</strong><code>${input.productId}</code></div>` : ""}
          ${input.reason ? `<div><strong>触发原因：</strong><code>${input.reason}</code></div>` : ""}
          <div><strong>检测时间：</strong>${timeDisplay} (北京时间)</div>
        </div>
        <p style="margin: 16px 0 0; font-size: 12px; color: #86909c; line-height: 1.6;">
          提示：客户已支付的订单会安全保留在「已支付 / 待履约」状态，不会丢单。您完成上游账户充值后，可在运营后台「供应商管理 → 供应商采购订单」或「订单管理」中查看并处理。
        </p>
      </div>
    `;
    const text = [
      `【Jianlian Shop 余额预警】上游供应商「${input.supplierName}」账户余额不足`,
      `供应商：${input.supplierName} (${input.supplierCode})`,
      `当前可用余额：${balanceDisplay}`,
      input.requiredAmount ? `本次所需成本：${requiredDisplay}` : null,
      input.orderId ? `关联客户订单 ID：${input.orderId}` : null,
      input.reason ? `触发原因：${input.reason}` : null,
      `检测时间：${timeDisplay}`,
      `请及时为上游供应商账户充值，以免影响自动发货。`,
    ]
      .filter(Boolean)
      .join("\n");

    await sendEmail({
      to: ALERT_RECIPIENT,
      subject,
      html,
      text,
      templateCode: "admin_system_alert",
      businessType: "admin",
      businessId: input.orderId ?? null,
      idempotencyKey: `supplier-balance-alert:${input.supplierCode}:${Math.floor(now / COOLDOWN_MS)}`,
    });
  } catch (err) {
    console.error("[SupplierBalanceAlert] failed to send email alert", err);
  }
}
