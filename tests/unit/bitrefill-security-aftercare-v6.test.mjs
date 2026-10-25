import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { loadSecurityTs, nextJson } from "../support/bitrefill-security-v6-fixture.mjs";

test("V6 actual customer refund POST is unconditionally closed without body, authentication, database or financial calls", async () => {
  let calls = 0;
  const trap = () => { calls++; throw Error("UNEXPECTED_DATABASE_ACCESS"); };
  const route = await loadSecurityTs("app/api/refunds/route.ts", {
    "next/server": nextJson,
    "@/lib/refunds/refund-utils": { normalizeRefundError: () => "SYNTHETIC_ERROR" },
    "@/lib/supabase/server": { getSupabaseServerClient: trap, hasSupabaseServerConfig: trap },
  });
  for (const body of [undefined, "bad JSON", JSON.stringify({ orderNo: "MOCK", requestedAmount: 10 })]) {
    const response = await route.POST(new Request("http://127.0.0.1/api/refunds", { method: "POST", body }));
    assert.equal(response.status, 410); assert.equal(response.headers.get("allow"), "GET");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).code, "CUSTOMER_REFUND_REQUEST_DISABLED");
  }
  assert.equal(calls, 0);
});

test("V6 actual history GET remains owner-scoped and read-only", async () => {
  const filters = [];
  const q = { select: () => q, eq: (key, value) => { filters.push([key, value]); return q; }, order: () => q,
    range: async () => ({ data: [{ id: "mock-refund", refund_no: "MOCK-HISTORY", user_id: "mock-user", requested_amount: 5,
      status: "succeeded", orders: { order_no: "MOCK-ORDER" } }], error: null, count: 1 }) };
  const route = await loadSecurityTs("app/api/refunds/route.ts", {
    "next/server": nextJson,
    "@/lib/refunds/refund-utils": { normalizeRefundError: () => "SYNTHETIC_ERROR" },
    "@/lib/supabase/server": { hasSupabaseServerConfig: () => true,
      getSupabaseServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "mock-user" } }, error: null }) },
        from: (table) => { assert.equal(table, "refund_requests"); return q; } }) },
  });
  const response = await route.GET(new Request("http://127.0.0.1/api/refunds?pageSize=50"));
  assert.equal(response.status, 200); assert.equal((await response.json()).refunds[0].refundNo, "MOCK-HISTORY");
  assert.deepEqual(filters, [["user_id", "mock-user"]]);
});

test("V6 actual customer panel has support and history, but no refund form or submission control", async () => {
  const panel = await loadSecurityTs("components/refunds/OrderRefundPanel.tsx", {
    react: React, "react/jsx-runtime": jsx,
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/lib/refunds/refund-utils": { REFUND_STATUS_LABELS: {}, formatMoney: (v) => String(v) },
    "@/lib/support/open-public-support": { openPublicSupport: () => {} },
  });
  for (const paymentStatus of ["paid", "unpaid", "refunded"]) {
    const html = renderToStaticMarkup(React.createElement(panel.OrderRefundPanel, { orderNo: "MOCK", totalAmount: 10, status: "completed", paymentStatus }));
    assert.match(html, /联系人工客服/); assert.match(html, /href="\/account\/refunds"/);
    assert.doesNotMatch(html, /申请退款|提交退款|<form|<input|<textarea/);
  }
});

test("V6 public detail queries no longer require the private JSON column", async () => {
  const source = await readFile(new URL("../../app/api/catalog/products/[identifier]/route.ts", import.meta.url), "utf8");
  for (const field of ["PRODUCT_SELECT", "SKU_SELECT"]) {
    const value = source.match(new RegExp(`const ${field} =\\s*"([^"]+)"`))?.[1];
    assert.ok(value); assert.ok(!value.split(",").includes("metadata"));
  }
});

test("V6 forward patch is atomic, clears table and column grants, and does not replace manual refund or binding logic", async () => {
  const source = await readFile(new URL("../../scripts/security/bitrefill-security-aftercare-v6.sql", import.meta.url), "utf8");
  assert.match(source, /begin;/); assert.match(source, /commit;/);
  assert.match(source, /revoke select on table/); assert.match(source, /revoke select \(%s\)/);
  assert.match(source, /from public, anon, authenticated/); assert.match(source, /V6_METADATA_COLUMN_PRIVILEGES_UNSAFE/);
  assert.match(source, /V6_PUBLIC_METADATA_VIEW_REQUIRES_REVIEW/);
  assert.doesNotMatch(source, /create (or replace )?function|update public\.|delete from|drop table|alter table/i);
  const history = await readFile(new URL("../../app/account/refunds/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(history, /提交退款申请|符合条件的订单可以/);
});
