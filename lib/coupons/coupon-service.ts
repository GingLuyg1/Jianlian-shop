import "server-only";

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type CouponRow = {
  id: string;
  code: string;
  name: string;
  batch_label: string | null;
  discount_type: "fixed";
  discount_amount: number;
  min_order_amount: number;
  max_uses: number;
  used_count: number;
  status: "active" | "disabled" | "exhausted";
  starts_at: string | null;
  expires_at: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CouponValidationResult =
  | {
      ok: true;
      coupon: {
        id: string;
        code: string;
        name: string;
        discountAmount: number;
        minOrderAmount: number;
        appliedDiscount: number;
        finalAmount: number;
      };
    }
  | {
      ok: false;
      code: string;
      error: string;
      status: number;
    };

export function normalizeCouponCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidCouponCodeFormat(code: string): boolean {
  return /^[A-Z0-9_-]{4,40}$/.test(code);
}

export function generateRandomCouponCode(prefix = "JL"): string {
  const cleanPrefix = prefix
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10) || "JL";
  const bytes = randomBytes(10);
  let partA = "";
  let partB = "";
  for (let i = 0; i < 5; i++) {
    partA += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    partB += CODE_ALPHABET[bytes[i + 5] % CODE_ALPHABET.length];
  }
  return `${cleanPrefix}-${partA}-${partB}`;
}

export function generateUniqueCouponCodes(count: number, prefix = "JL"): string[] {
  const safeCount = Math.min(500, Math.max(1, Math.trunc(count)));
  const set = new Set<string>();
  let guard = 0;
  while (set.size < safeCount && guard < safeCount * 10) {
    guard += 1;
    set.add(generateRandomCouponCode(prefix));
  }
  return Array.from(set);
}

export function isCouponSchemaMissing(error: unknown): boolean {
  const msg = String((error as { message?: unknown; code?: unknown } | null)?.message ?? "");
  const code = String((error as { code?: unknown } | null)?.code ?? "");
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    code === "PGRST202" ||
    code === "42883" ||
    /coupons|coupon_redemptions|apply_coupon_to_order|schema cache/i.test(msg)
  );
}

export function computeCouponDiscount(orderAmount: number, discountAmount: number): { appliedDiscount: number; finalAmount: number } {
  const originalCents = Math.round(orderAmount * 100);
  const discountCents = Math.round(discountAmount * 100);
  if (originalCents <= 1) {
    return { appliedDiscount: 0, finalAmount: originalCents / 100 };
  }
  const appliedCents = Math.min(discountCents, Math.max(originalCents - 1, 0));
  const finalCents = Math.max(1, originalCents - appliedCents);
  return {
    appliedDiscount: appliedCents / 100,
    finalAmount: finalCents / 100,
  };
}

export async function validateCouponForOrderAmount(
  service: SupabaseClient,
  rawCode: unknown,
  orderAmount: number
): Promise<CouponValidationResult> {
  const code = normalizeCouponCode(rawCode);
  if (!code) {
    return { ok: false, code: "COUPON_CODE_EMPTY", error: "请输入优惠券码", status: 400 };
  }
  if (!isValidCouponCodeFormat(code)) {
    return { ok: false, code: "COUPON_INVALID_FORMAT", error: "优惠券码格式无效", status: 400 };
  }
  if (!Number.isFinite(orderAmount) || orderAmount <= 0) {
    return { ok: false, code: "ORDER_AMOUNT_INVALID", error: "订单金额无效", status: 400 };
  }

  const { data, error } = await service
    .from("coupons")
    .select("id,code,name,discount_amount,min_order_amount,max_uses,used_count,status,starts_at,expires_at")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    if (isCouponSchemaMissing(error)) {
      return { ok: false, code: "COUPON_SYSTEM_NOT_READY", error: "优惠券功能尚未完成数据库初始化", status: 503 };
    }
    return { ok: false, code: "COUPON_READ_FAILED", error: "优惠券校验失败，请稍后重试", status: 500 };
  }

  if (!data) {
    return { ok: false, code: "COUPON_NOT_FOUND", error: "该优惠券已被使用", status: 404 };
  }

  const row = data as Record<string, unknown>;
  const status = String(row.status ?? "");
  const usedCount = Number(row.used_count ?? 0);
  const maxUses = Number(row.max_uses ?? 1);
  const discountAmount = Number(row.discount_amount ?? 0);
  const minOrderAmount = Number(row.min_order_amount ?? 0);
  const nowMs = Date.now();

  if (status === "disabled") {
    return { ok: false, code: "COUPON_DISABLED", error: "该优惠券已被使用", status: 400 };
  }
  if (status === "exhausted" || usedCount >= maxUses) {
    return { ok: false, code: "COUPON_EXHAUSTED", error: "该优惠券已被使用", status: 400 };
  }
  if (typeof row.starts_at === "string" && row.starts_at && Date.parse(row.starts_at) > nowMs) {
    return { ok: false, code: "COUPON_NOT_STARTED", error: "该优惠券尚未到生效时间", status: 400 };
  }
  if (typeof row.expires_at === "string" && row.expires_at && Date.parse(row.expires_at) < nowMs) {
    return { ok: false, code: "COUPON_EXPIRED", error: "该优惠券已过期", status: 400 };
  }
  if (orderAmount + 1e-9 < minOrderAmount) {
    return {
      ok: false,
      code: "COUPON_MIN_AMOUNT_NOT_MET",
      error: `订单金额需满 ¥${minOrderAmount.toFixed(2)} 才可使用该优惠券`,
      status: 400,
    };
  }
  if (orderAmount <= 0.01) {
    return { ok: false, code: "ORDER_AMOUNT_TOO_SMALL", error: "当前订单金额过低，无法使用优惠券", status: 400 };
  }

  const { appliedDiscount, finalAmount } = computeCouponDiscount(orderAmount, discountAmount);
  if (appliedDiscount <= 0) {
    return { ok: false, code: "COUPON_NO_DISCOUNT", error: "当前订单金额无法应用该优惠券", status: 400 };
  }

  return {
    ok: true,
    coupon: {
      id: String(row.id),
      code: String(row.code),
      name: String(row.name ?? "优惠券"),
      discountAmount,
      minOrderAmount,
      appliedDiscount,
      finalAmount,
    },
  };
}
