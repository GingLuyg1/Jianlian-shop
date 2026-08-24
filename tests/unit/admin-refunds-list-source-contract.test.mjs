import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const route = readFileSync(join(process.cwd(), "app/api/admin/refunds/route.ts"), "utf8");

test("admin refund list embeds only the valid order relation", () => {
  const mainSelect = route.match(/\.from\("refund_requests"\)\s*\.select\("\*,orders\([^\n]+/)?.[0] ?? "";

  assert.match(mainSelect, /orders\(order_no,total_amount,currency,status,payment_status,payment_method,delivery_type,created_at\)/);
  assert.doesNotMatch(mainSelect, /profiles\(/);
});

test("admin refund list loads current-page profiles by user id", () => {
  assert.match(route, /const userIds = Array\.from\(new Set\(rows\.map\(\(row\) => String\(row\.user_id/);
  assert.match(route, /\.from\("profiles"\)\s*\.select\("id,email,display_name"\)\s*\.in\("id", userIds\)/);
  assert.match(route, /profilesById\.get\(String\(row\.user_id \?\? ""\)\) \?\? null/);
});

test("refund normalization tolerates a missing public profile", () => {
  assert.match(route, /function normalizeAdminRefund\(row: Row, profile: Row \| null\)/);
  assert.match(route, /userEmail: String\(profile\?\.email \?\? ""\)/);
  assert.match(route, /userLabel: maskEmail\(profile\?\.email\)/);
  assert.doesNotMatch(route, /row\.profiles/);
});

test("refund search resolves related ids without cross-relation or filters", () => {
  assert.match(route, /\.from\("refund_requests"\)\.select\("id"\)\.ilike\("refund_no", pattern\)/);
  assert.match(route, /\.from\("orders"\)\.select\("id"\)\.ilike\("order_no", pattern\)/);
  assert.match(route, /\.from\("profiles"\)\.select\("id"\)\.ilike\("email", pattern\)/);
  assert.match(route, /if \(matchingRefundIds\) query = query\.in\("id", matchingRefundIds\)/);
  assert.doesNotMatch(route, /orders\.order_no\.ilike/);
  assert.doesNotMatch(route, /profiles\.email\.ilike/);
});

test("refund search returns an empty page when no ids match", () => {
  assert.match(route, /if \(matchingRefundIds && matchingRefundIds\.length === 0\) \{\s*return json\(\{ refunds: \[\], total: 0, page, pageSize \}\);/);
});

test("refund search fails explicitly before an id filter can grow too large", () => {
  assert.match(route, /const SEARCH_MATCH_LIMIT = 50;/);
  assert.match(route, /\.limit\(SEARCH_MATCH_LIMIT \+ 1\)/);
  assert.match(route, /if \(\(rows\?\.length \?\? 0\) > SEARCH_MATCH_LIMIT\) throw new RefundSearchTooBroadError\(\)/);
  assert.match(route, /if \(matchingRefundIds\.length > SEARCH_MATCH_LIMIT\) throw new RefundSearchTooBroadError\(\)/);
  assert.match(route, /搜索结果过多，请输入更完整的退款单号、订单号或用户邮箱。/);
  assert.match(route, /error instanceof RefundSearchTooBroadError[\s\S]*?status: 400/);
  assert.doesNotMatch(route, /SEARCH_MATCH_LIMIT = 1_000/);
});

test("refund helper and profile query errors use the safe 503 read response", () => {
  assert.match(route, /if \(error\) return refundReadError\(error\);/);
  assert.match(route, /catch \(error\)[\s\S]*?return refundReadError\(error\);/);
  assert.match(route, /normalized === raw[\s\S]*?"退款售后列表读取失败，请稍后重试。"/);
  assert.match(route, /return json\(\{ error: message \}, \{ status: 503 \}\)/);
  assert.doesNotMatch(route, /status: 500/);
});
