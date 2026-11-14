import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("order detail reads client route params without React 19-only use", () => {
  const page = readFileSync("app/account/orders/[orderNo]/page.tsx", "utf8");
  assert.match(page, /useParams<\\{ orderNo: string \\}>\\(\\)/);
  assert.match(page, /decodeURIComponent\\(params\\.orderNo\\)/);
  assert.doesNotMatch(page, /\\buse\\(props\\.params\\)/);
  assert.match(page, /fetch\\(\\`\\/api\\/orders\\/\\$\\{encodeURIComponent\\(orderNo\\)\\}\\`/);
  assert.match(page, /<SecureOrderDelivery/);
});
