import assert from "node:assert/strict";
import * as nodeCrypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { loadTs } from "../helpers/payment-session-guard-harness.mjs";

const couponService = loadTs("lib/coupons/coupon-service.ts", {
  "server-only": {},
  crypto: nodeCrypto,
});

test("coupon code normalization, format validation and high-entropy generation", () => {
  assert.equal(couponService.normalizeCouponCode("  jl10-abcde-12345  "), "JL10-ABCDE-12345");
  assert.equal(couponService.isValidCouponCodeFormat("JL10-ABCDE-12345"), true);
  assert.equal(couponService.isValidCouponCodeFormat("bad code!"), false);
  assert.equal(couponService.isValidCouponCodeFormat("ab"), false);

  const codes = couponService.generateUniqueCouponCodes(100, "JL1");
  assert.equal(codes.length, 100);
  assert.equal(new Set(codes).size, 100);
  for (const code of codes) {
    assert.match(code, /^JL1-[A-Z0-9]{5}-[A-Z0-9]{5}$/);
  }
});

test("coupon discount floors final payable amount at ¥0.01 and never goes negative", () => {
  assert.deepEqual(couponService.computeCouponDiscount(124, 10), {
    appliedDiscount: 10,
    finalAmount: 114,
  });
  assert.deepEqual(couponService.computeCouponDiscount(5.08, 10), {
    appliedDiscount: 5.07,
    finalAmount: 0.01,
  });
  assert.deepEqual(couponService.computeCouponDiscount(1, 1), {
    appliedDiscount: 0.99,
    finalAmount: 0.01,
  });
  assert.deepEqual(couponService.computeCouponDiscount(0.01, 1), {
    appliedDiscount: 0,
    finalAmount: 0.01,
  });
});

test("coupon migration enforces strict RLS, FOR UPDATE locks, and service_role-only execution", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261125030000_coupons_system.sql"),
    "utf8"
  );
  assert.match(sql, /alter table public\.coupons enable row level security/i);
  assert.match(sql, /revoke all on table public\.coupons from public, anon, authenticated/i);
  assert.match(sql, /create or replace function public\.apply_coupon_to_order/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /revoke all on function public\.apply_coupon_to_order\(uuid, uuid, text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.apply_coupon_to_order\(uuid, uuid, text\) to service_role/i);
});
