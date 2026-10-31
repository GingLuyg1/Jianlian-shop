import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detail = readFileSync(new URL("../../app/products/[id]/page.tsx", import.meta.url), "utf8");
const recharge = readFileSync(new URL("../../components/account/AccountRechargeContent.tsx", import.meta.url), "utf8");
const channels = readFileSync(new URL("../../lib/catalog/public-recharge-channels.ts", import.meta.url), "utf8");
const records = readFileSync(new URL("../../lib/account/record-preload.ts", import.meta.url), "utf8");

test("Apple ID V7 branch is absent and the original detail layout remains", () => {
  assert.doesNotMatch(detail, /AppleIdDetailContent|APPLE_ID_V7_PRODUCT_ID|isAppleIdV7Product/);
  assert.match(detail, /data-testid="product-detail-left"/);
  assert.match(detail, /data-testid="product-detail-purchase-card"/);
});

test("recharge uses a responsive two-column layout with live channel and record sources", () => {
  assert.ok(recharge.includes("md:grid-cols-[minmax(0,1fr)_minmax(0,calc((100%_-_1rem)/3.1_-_38px))]"));
  assert.match(recharge, /充值须知/);
  assert.match(recharge, /CHANNEL_PRESENTATION\.map\(\(item\) =>/);
  assert.match(recharge, /loadPublicRechargeChannels/);
  assert.match(channels, /fetch\("\/api\/recharges\/channels"/);
  assert.match(recharge, /accountRecordPreload\.load/);
  assert.match(records, /kind === "recharges" \? "\/api\/recharges" : "\/api\/account\/balance-transactions"/);
  assert.match(records, /fetcher\(`\$\{path\}\?page=\$\{page\}&pageSize=10`/);
  assert.match(recharge, /<RechargeRecords/);
  assert.doesNotMatch(recharge, /人工充值/);
});

test("recharge request, limit dialog and existing record actions stay wired", () => {
  for (const marker of [
    'fetch("/api/recharges", {',
    'method: "POST"',
    'client_request_id: clientRequestIdRef.current',
    'setAmountLimitDialogOpen(true)',
    'compareRechargeDecimals(requestedCnyAmount, "2000")',
    '继续支付',
    '提交 TxHash 并核验',
    '提交支付凭证',
    '上一页',
    '下一页',
  ]) {
    assert.ok(recharge.includes(marker), `${marker} must remain available`);
  }
});

test("selected refinements keep V3.5 spacing and restore only the sliding record tab", () => {
  assert.match(recharge, /h-\[84px\]/);
  assert.match(recharge, /h-\[46px\] w-\[46px\]/);
  assert.equal((recharge.match(/pl-\[13px\] pr-2\.5/g) ?? []).length, 2);
  assert.match(recharge, /<RechargeRecordTabs value=\{historyTab\}/);
  assert.match(recharge, /md:mt-auto/);
  assert.match(recharge, /channelGridStyles\.hero/);
  assert.doesNotMatch(recharge, /channelGridStyles\.recordContent|channelGridStyles\.rechargeCard/);
});
