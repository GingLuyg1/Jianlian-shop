import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const EXPECTED_CHATGPT_TUTORIAL_IMAGES = [
  "gpt-2fa-get-code.jpg",
  "gpt-2fa-input-key.jpg",
  "gpt-2fa-rebind-1.png",
  "gpt-2fa-rebind-2.png",
  "gpt-2fa-verify-code.png",
  "gpt-login-email.png",
  "gpt-login-password.png",
  "gpt-logout-devices-1.png",
  "gpt-logout-devices-2.png",
  "gpt-main-overview.png",
  "gpt-mfa-remove-confirm.jpg",
  "gpt-mfa-toggle-off.jpg",
  "gpt-pwd-2fa-confirm.jpg",
  "gpt-security-password-entry.jpg",
  "gpt-set-new-pwd.jpg",
  "gpt-settings-entry.png",
  "gpt-verify-current-pwd.jpg",
];

test("checkout preserves shipping_address API contract while spanning full row for SIM address", () => {
  const checkout = file("app/checkout/page.tsx");

  // Must preserve exact order creation API contract and validation
  assert.match(
    checkout,
    /if \(isShippingProduct && \(!customerName\.trim\(\) \|\| !customerPhone\.trim\(\) \|\| !shippingRegion\.trim\(\) \|\| !shippingAddress\.trim\(\)\)\)/
  );
  assert.match(
    checkout,
    /shipping_address: isShippingProduct\s*\?\s*\{\s*region: shippingRegion,\s*address: shippingAddress,\s*\}\s*:\s*null/
  );

  // Full-row SIM address input without separate province/city input box, no 24-char truncation, no duplicate note
  assert.doesNotMatch(checkout, /placeholder="例如：广东省 深圳市 南山区"/);
  assert.doesNotMatch(checkout, /slice\(0,\s*24\)/);
  assert.match(checkout, /shippingRegion\.trim\(\) === shippingAddress\.trim\(\)/);
  assert.match(checkout, /<div className="sm:col-span-2">\s*<label className="mb-1\.5 block text-xs font-medium">\s*<span className="text-red-500">\*<\/span>详细地址/);
  assert.match(checkout, /placeholder="请输入省市区街道门牌等详细收货地址"/);
});

test("ChatGPT Plus/Pro recharge details include 4-step flow, usage scope check, and FAQ", () => {
  const checkout = file("app/checkout/page.tsx");
  const gpt = checkout.slice(
    checkout.indexOf("function GptRechargeDetails"),
    checkout.indexOf("function GrokRechargeDetails")
  );

  assert.match(gpt, /4 步极简自助充值兑换流程/);
  assert.match(gpt, /https:\/\/cdk-card\.dajuai\.us\//);
  assert.match(gpt, /https:\/\/chatgpt\.com\/api\/auth\/session/);
  assert.match(gpt, /仅限免费版账号/);
  assert.match(gpt, /不可覆盖已有订阅/);
  for (const q of ["Q1：怎么完成充值？", "Q2：有账单可以查吗？", "Q3：质保多久？掉订阅怎么处理？", "Q4：充值未到账怎么办？"]) {
    assert.ok(gpt.includes(q), `Missing FAQ question: ${q}`);
  }
});

test("all 17 redacted ChatGPT tutorial images exist and tutorial component contains no raw credential prefixes", () => {
  const tutorial = file("components/account/ChatGptAccountGuideTutorial.tsx");

  assert.doesNotMatch(tutorial, /3H5HRIM7SZHRFSJ22YMHO/);
  assert.doesNotMatch(tutorial, /urbevcq6782060/i);
  assert.doesNotMatch(tutorial, /maxi-tetra94/i);

  for (const imgName of EXPECTED_CHATGPT_TUTORIAL_IMAGES) {
    const relPath = `/assets/tutorials/chatgpt/${imgName}`;
    const diskPath = join(process.cwd(), "public", "assets", "tutorials", "chatgpt", imgName);
    assert.ok(existsSync(diskPath), `Missing image asset on disk: ${diskPath}`);
    const stats = statSync(diskPath);
    assert.ok(stats.size > 1024, `Image asset unexpectedly small: ${imgName}`);
    assert.ok(tutorial.includes(relPath), `Tutorial component missing reference to ${relPath}`);
  }
});

test("MobileTopBarAuth is mounted in mobile top brand bar and duplicate mobile auth/balance blocks are hidden", () => {
  const mobileAuth = file("components/layout/MobileTopBarAuth.tsx");
  const publicLayout = file("components/layout/PublicLayout.tsx");
  const topInfoBar = file("components/layout/PublicTopInfoBar.tsx");

  assert.match(mobileAuth, /export default function MobileTopBarAuth/);
  assert.match(publicLayout, /import MobileTopBarAuth from "\.\/MobileTopBarAuth"/);
  assert.match(publicLayout, /<MobileTopBarAuth \/>/);
  assert.equal((topInfoBar.match(/isMobile && "!hidden"/g) ?? []).length, 2);
});

test("admin categories product dialog integrates existing AdminProductSkuManager without adding new API routes", () => {
  const categoriesPage = file("app/admin/categories/page.tsx");

  assert.match(
    categoriesPage,
    /import AdminProductSkuManager, \{ type ProductSkuManagerHandle \} from "@\/components\/admin\/products\/AdminProductSkuManager"/
  );
  assert.match(categoriesPage, /<AdminProductSkuManager/);
  assert.match(categoriesPage, /商品规格与 SKU 管理/);
  for (const fieldLabel of ['label="详细说明"', 'label="排序"', 'label="metadata.note"']) {
    assert.ok(categoriesPage.includes(fieldLabel), `Missing preserved field ${fieldLabel}`);
  }
});
