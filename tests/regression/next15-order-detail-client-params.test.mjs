import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("order detail reads client route params without React 19-only use", () => {
  const page = readFileSync("app/account/orders/[orderNo]/page.tsx", "utf8");
  assert.ok(page.includes("const params = useParams<{ orderNo: string }>();"));
  assert.ok(page.includes("decodeURIComponent(params.orderNo)"));
  assert.ok(!page.includes("use(props.params)"));
  assert.ok(page.includes("fetch(`/api/orders/${encodeURIComponent(orderNo)}`"));
  assert.ok(page.includes("<SecureOrderDelivery"));
});
