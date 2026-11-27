import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/provider";
import { generateOrderQueryToken, hashOrderQueryToken } from "@/lib/orders/order-query-service";

const SITE_BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.jianlian.shop").replace(/\/+$/, "");
const TOKEN_TTL_DAYS = 30;
const GUEST_EMAIL_DOMAIN = "@guest.jianlian.shop";

export type DeliveryEmailItem = {
  productName: string;
  skuTitle?: string | null;
  quantity: number;
  lineTotal: number;
};

export type DeliveryEmailPreviewEntry = {
  productName?: string | null;
  maskedContent: string;
  deliveryNote?: string | null;
};

export type OrderDeliveryEmailPayload = {
  orderNo: string;
  totalAmount: number;
  currency: string;
  deliveredAtText: string;
  items: DeliveryEmailItem[];
  deliveryPreviews: DeliveryEmailPreviewEntry[];
  queryUrl: string;
  queryToken: string;
  isPreviewSample?: boolean;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(value: number, currency: string) {
  const prefix = currency === "CNY" ? "¥" : `${currency} `;
  return `${prefix}${Number(value || 0).toFixed(2)}`;
}

export function maskDeliverySnippet(raw: string | null | undefined): string {
  const cleaned = String(raw ?? "").trim();
  if (!cleaned) return "已准备就绪，请点击下方安全短链查收";
  const firstLine = cleaned.split(/\r?\n/)[0]?.trim() || cleaned;
  if (firstLine.length <= 8) return `${firstLine.slice(0, 2)}****`;
  return `${firstLine.slice(0, 4)} •••• ${firstLine.slice(-4)}`;
}

export function buildOrderDeliveryEmailContent(input: OrderDeliveryEmailPayload) {
  const badgeText = input.isPreviewSample ? "预览样例 · 订单已交付" : "订单已发货 · 交付完成";
  const subjectPrefix = input.isPreviewSample ? "【发卡邮件效果预览】" : "【简联 Jianlian】";
  const subject = `${subjectPrefix}您的订单 ${input.orderNo} 已发货，点击安全短链查收卡密`;

  const itemsHtml = input.items
    .map((item) => {
      const skuHtml = item.skuTitle
        ? `<div style="margin-top:3px;font-size:12px;color:#64748b;">规格：${escapeHtml(item.skuTitle)}</div>`
        : "";
      return `
        <tr>
          <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
            <div style="font-size:14px;font-weight:600;color:#0f172a;line-height:1.45;">${escapeHtml(item.productName)}</div>
            ${skuHtml}
          </td>
          <td style="padding:12px 10px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px;color:#475569;white-space:nowrap;">× ${item.quantity}</td>
          <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;font-weight:600;color:#0f172a;white-space:nowrap;">${escapeHtml(formatMoney(item.lineTotal, input.currency))}</td>
        </tr>`;
    })
    .join("");

  const previewHtml = input.deliveryPreviews
    .map((entry, idx) => {
      const noteHtml = entry.deliveryNote
        ? `<div style="margin-top:6px;font-size:12px;color:#64748b;">使用说明：${escapeHtml(entry.deliveryNote)}</div>`
        : "";
      return `
        <div style="margin-top:${idx === 0 ? "0" : "10px"};padding:12px 14px;border-radius:10px;background:#ffffff;border:1px solid #e2e8f0;">
          <div style="font-size:11px;font-weight:600;color:#64748b;letter-spacing:0.4px;text-transform:uppercase;">
            交付凭证 #${idx + 1}${entry.productName ? ` · ${escapeHtml(entry.productName)}` : ""}
          </div>
          <div style="margin-top:6px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:14px;font-weight:600;color:#0f172a;letter-spacing:0.6px;">
            ${escapeHtml(entry.maskedContent)}
          </div>
          ${noteHtml}
        </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei','Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f6f7fb;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:20px;border:1px solid #e6ebf2;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.06);">
          <!-- Header -->
          <tr>
            <td style="padding:28px 28px 22px;background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 60%,#2563eb 100%);color:#ffffff;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size:19px;font-weight:700;letter-spacing:-0.3px;">简联 Jianlian Shop</div>
                    <div style="margin-top:4px;font-size:12px;color:rgba(255,255,255,0.78);">全球数字礼品卡 · 自动极速交付中心</div>
                  </td>
                  <td align="right" style="vertical-align:top;">
                    <span style="display:inline-block;padding:5px 12px;border-radius:999px;background:rgba(16,185,129,0.22);border:1px solid rgba(110,231,183,0.45);color:#d1fae5;font-size:12px;font-weight:600;white-space:nowrap;">
                      ✓ ${escapeHtml(badgeText)}
                    </span>
                  </td>
                </tr>
              </table>
              <div style="margin-top:20px;font-size:21px;font-weight:700;line-height:1.35;">您的商品已发货，可随时一键查收卡密</div>
              <div style="margin-top:6px;font-size:13px;color:rgba(255,255,255,0.84);line-height:1.6;">
                即使已关闭下单页面或使用游客购买，通过下方专属安全短链即可直接查看并一键复制完整卡密。
              </div>
            </td>
          </tr>

          <!-- Order Summary Meta -->
          <tr>
            <td style="padding:24px 28px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;">
                <tr>
                  <td style="padding:14px 16px;width:55%;border-right:1px solid #e2e8f0;">
                    <div style="font-size:11px;color:#64748b;">订单编号</div>
                    <div style="margin-top:4px;font-family:'SFMono-Regular',Consolas,monospace;font-size:14px;font-weight:700;color:#0f172a;word-break:break-all;">${escapeHtml(input.orderNo)}</div>
                  </td>
                  <td style="padding:14px 16px;width:45%;">
                    <div style="font-size:11px;color:#64748b;">实付金额 · 交付时间</div>
                    <div style="margin-top:4px;font-size:15px;font-weight:700;color:#ea580c;">${escapeHtml(formatMoney(input.totalAmount, input.currency))}</div>
                    <div style="margin-top:2px;font-size:11px;color:#64748b;">${escapeHtml(input.deliveredAtText)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Card: Secure Short Link -->
          <tr>
            <td style="padding:16px 28px;">
              <div style="padding:20px;border-radius:16px;background:linear-gradient(180deg,#eff6ff 0%,#f8fbff 100%);border:1px solid #bfdbfe;">
                <div style="font-size:14px;font-weight:700;color:#1e3a8a;">🔐 安全卡密与查单直达通道</div>
                <div style="margin-top:6px;font-size:12.5px;color:#475569;line-height:1.6;">
                  为防止邮件转发导致卡密泄露，正文仅展示脱敏摘要。点击下方专属加密短链即可在官网秒开完整卡密（有效期内免登录，支持一键复制）。
                </div>

                ${previewHtml ? `<div style="margin-top:14px;">${previewHtml}</div>` : ""}

                <div style="margin-top:18px;text-align:center;">
                  <a href="${escapeHtml(input.queryUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 28px;border-radius:12px;background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;box-shadow:0 6px 16px rgba(37,99,235,0.28);">
                    立即查看并复制完整卡密 →
                  </a>
                </div>

                <div style="margin-top:14px;padding-top:12px;border-top:1px dashed #bfdbfe;font-size:11.5px;color:#64748b;line-height:1.6;word-break:break-all;">
                  <div><strong>备用直达链接：</strong><a href="${escapeHtml(input.queryUrl)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(input.queryUrl)}</a></div>
                  <div style="margin-top:4px;"><strong>查单凭证（30 天有效）：</strong><code style="padding:2px 6px;border-radius:6px;background:#e0ecff;color:#1e40af;font-family:monospace;">${escapeHtml(input.queryToken)}</code></div>
                </div>
              </div>
            </td>
          </tr>

          <!-- Order Items Table -->
          <tr>
            <td style="padding:6px 28px 20px;">
              <div style="margin-bottom:10px;font-size:13px;font-weight:700;color:#334155;">订单商品明细</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;border-collapse:separate;">
                <thead>
                  <tr style="background:#f8fafc;">
                    <th style="padding:9px 14px;text-align:left;font-size:11.5px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">商品 / 规格</th>
                    <th style="padding:9px 10px;text-align:center;font-size:11.5px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">数量</th>
                    <th style="padding:9px 14px;text-align:right;font-size:11.5px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">小计</th>
                  </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
              </table>
            </td>
          </tr>

          <!-- Security Notice & Footer -->
          <tr>
            <td style="padding:18px 28px 26px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <div style="font-size:12px;color:#475569;line-height:1.7;">
                <strong style="color:#0f172a;">安全与售后提示：</strong><br>
                1. 请妥善保管本邮件中的安全短链与查单凭证，切勿泄露给他人，数字卡密一经兑换无法退换。<br>
                2. 如需永久保存历史订单，可使用同一邮箱注册/登录 <a href="${escapeHtml(SITE_BASE_URL)}/account/orders" style="color:#2563eb;text-decoration:none;">简联用户中心</a>。<br>
                3. 如有激活或售后疑问，请携带订单号 <strong>${escapeHtml(input.orderNo)}</strong> 联系官网在线客服。
              </div>
              <div style="margin-top:16px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
                本邮件由系统自动发送，请勿直接回复 · © ${new Date().getFullYear()} Jianlian Shop 简联商城
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    subject,
    "",
    `订单编号：${input.orderNo}`,
    `实付金额：${formatMoney(input.totalAmount, input.currency)}`,
    `交付时间：${input.deliveredAtText}`,
    "",
    "商品明细：",
    ...input.items.map(
      (i) => `- ${i.productName}${i.skuTitle ? ` (${i.skuTitle})` : ""} x${i.quantity} ${formatMoney(i.lineTotal, input.currency)}`
    ),
    "",
    `一键查看完整卡密（30 天有效）：${input.queryUrl}`,
    `安全查单凭证：${input.queryToken}`,
    "",
    "提示：请勿向他人泄露短链或卡密；如有疑问请携带订单号联系官网在线客服。",
  ].join("\n");

  return { subject, html, text };
}

export async function issueOrderQueryShortLink(
  service: SupabaseClient,
  orderId: string,
  orderNo: string
): Promise<{ token: string; url: string }> {
  const token = generateOrderQueryToken();
  const tokenHash = hashOrderQueryToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await service
    .from("orders")
    .update({
      order_query_token_hash: tokenHash,
      order_query_token_expires_at: expiresAt,
      order_query_token_revoked_at: null,
    })
    .eq("id", orderId);

  const url = `${SITE_BASE_URL}/order-query?orderNo=${encodeURIComponent(orderNo)}#token=${encodeURIComponent(token)}`;
  return { token, url };
}

function isUsableEmail(email: string | null | undefined): email is string {
  if (!email) return false;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || trimmed.endsWith(GUEST_EMAIL_DOMAIN)) return false;
  return /^[^\s@%\\]+@[^\s@%\\]+\.[^\s@%\\]+$/.test(trimmed);
}

export async function sendOrderDeliveryEmail(
  service: SupabaseClient,
  orderId: string
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const { data: order, error: orderErr } = await service
      .from("orders")
      .select(
        "id,order_no,user_id,total_amount,currency,customer_email,payment_status,status,order_items(id,product_name,sku_title,quantity,line_total),order_deliveries(id,order_item_id,delivery_status,delivery_content,delivery_note,delivered_at)"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) return { sent: false, reason: "order_not_found" };
    if (order.payment_status !== "paid") return { sent: false, reason: "order_not_paid" };

    const deliveries = (Array.isArray(order.order_deliveries) ? order.order_deliveries : []) as Array<{
      id?: string;
      order_item_id?: string | null;
      delivery_status?: string | null;
      delivery_content?: string | null;
      delivery_note?: string | null;
      delivered_at?: string | null;
    }>;
    const deliveredRows = deliveries.filter((d) => d.delivery_status === "delivered");
    if (!deliveredRows.length) return { sent: false, reason: "no_delivered_rows" };

    let recipient: string | null = isUsableEmail(order.customer_email)
      ? String(order.customer_email).trim().toLowerCase()
      : null;

    if (!recipient && order.user_id) {
      const { data: authUser } = await service.auth.admin.getUserById(String(order.user_id)).catch(() => ({ data: null }));
      const authEmail = authUser?.user?.email;
      if (isUsableEmail(authEmail)) recipient = authEmail.trim().toLowerCase();
    }

    if (!recipient) return { sent: false, reason: "no_valid_recipient_email" };

    const items = (Array.isArray(order.order_items) ? order.order_items : []) as Array<{
      id?: string;
      product_name?: string | null;
      sku_title?: string | null;
      quantity?: number | null;
      line_total?: number | null;
    }>;
    const itemNameById = new Map<string, string>();
    for (const item of items) {
      if (item.id) itemNameById.set(String(item.id), String(item.product_name ?? "数字商品"));
    }

    const { token, url } = await issueOrderQueryShortLink(service, String(order.id), String(order.order_no));
    const deliveredAtText = new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
    });

    const content = buildOrderDeliveryEmailContent({
      orderNo: String(order.order_no),
      totalAmount: Number(order.total_amount ?? 0),
      currency: String(order.currency ?? "CNY"),
      deliveredAtText: `${deliveredAtText} (北京时间)`,
      items: items.map((item) => ({
        productName: String(item.product_name ?? "数字商品"),
        skuTitle: item.sku_title ? String(item.sku_title) : null,
        quantity: Number(item.quantity ?? 1),
        lineTotal: Number(item.line_total ?? 0),
      })),
      deliveryPreviews: deliveredRows.slice(0, 6).map((d) => ({
        productName: d.order_item_id ? itemNameById.get(String(d.order_item_id)) ?? null : null,
        maskedContent: maskDeliverySnippet(d.delivery_content),
        deliveryNote: d.delivery_note ? String(d.delivery_note) : null,
      })),
      queryUrl: url,
      queryToken: token,
    });

    const res = await sendEmail({
      to: recipient,
      subject: content.subject,
      html: content.html,
      text: content.text,
      templateCode: "order_delivered",
      businessType: "order",
      businessId: String(order.id),
      idempotencyKey: `order-delivered:${order.id}:${deliveredRows.length}`,
    });

    return { sent: res.status === "sent", reason: res.errorCode ?? undefined };
  } catch (err) {
    console.error("[OrderDeliveryEmail] send failed", err instanceof Error ? err.message : String(err));
    return { sent: false, reason: "unexpected_error" };
  }
}
