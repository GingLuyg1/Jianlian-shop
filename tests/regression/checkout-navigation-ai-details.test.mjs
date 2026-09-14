import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync("lib/products/checkout-navigation.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const testModule = { exports: {} };
new Function("exports", "module", compiled)(testModule.exports, testModule);
const { safeProductReturnTo, checkoutHref, resolveRechargeProductFamily, resolveCheckoutCategory } = testModule.exports;

test("checkout return preserves category, search and page and rejects open redirects", () => {
  for (const path of ["/products/ai-membership?category=chatgpt", "/products/ai-membership?category=chatgpt&search=plus&page=2"]) {
    const href = new URL(checkoutHref("id", path), "https://jianlian.shop");
    assert.equal(safeProductReturnTo(href.searchParams.get("returnTo")), path);
  }
  for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/products/\\evil", "/products/../../login", "/admin"]) assert.equal(safeProductReturnTo(bad), null);
});
test("new and legacy AI families use evidence rather than UUID whitelists", () => {
  for (const name of ["（卡付）ChatGPT Go 印度", "（卡付）ChatGPT Plus 菲律宾（同步官方售后）", "（卡付）Chat GPT PRO 20x 菲律宾", "chat-gpt PRO 5x"]) {
    assert.equal(resolveRechargeProductFamily({ name }), "chatgpt");
    assert.equal(resolveCheckoutCategory({ name }), "ai-membership");
  }
  for (const family of ["claude", "gemini", "grok"]) assert.equal(resolveRechargeProductFamily({ name: "商品", id: `ai-${family}-cdk` }), family);
  for (const category of ["gift-cards", "digital-accounts", "sms-code", "sim-cards"]) assert.equal(resolveRechargeProductFamily({ name: "ChatGPT", category }), "other");
  assert.equal(resolveCheckoutCategory({ name: "商品" }, "/products/gift-cards?category=apple"), "gift-cards");
});
test("existing AI templates and specialized non-AI templates remain, with neutral GPT copy", () => {
  const page = readFileSync("app/checkout/page.tsx", "utf8");
  for (const family of ["chatgpt", "claude", "gemini", "grok"]) assert.ok(page.includes(`family === "${family}"`));
  for (const component of ["GptRechargeDetails", "ClaudeRechargeDetails", "GeminiRechargeDetails", "GrokRechargeDetails", "AppleGiftCardDetails", "AppleIdDetails", "GiffgaffTopupDetails"]) assert.ok(page.includes(`<${component} product={product}`));
  assert.match(page, /safeProductReturnTo\(searchParams.get\("returnTo"\)\)/);
  assert.match(page, /router.push\(closeHref\)/);
  assert.doesNotMatch(page, /6661231\.xyz|ai1k\.xyz|aikkcc\.com\/#/);
  assert.match(page, /target="_blank"\s+rel="noopener noreferrer"/);
  const gpt = page.slice(page.indexOf("function GptRechargeDetails"), page.indexOf("function GrokRechargeDetails"));
  assert.match(gpt, /\{product.name\}/);
  assert.doesNotMatch(gpt, /Plus 月|永久有效|30 天|按天退/);
  for (const section of ["服务亮点", "商品说明与交付规则", "使用方法", "适用场景", "售后与注意事项", "FAQ"]) assert.ok(gpt.includes(section));
});

test("ChatGPT method comparison is native, responsive, truthful and family-scoped", () => {
  const page = readFileSync("app/checkout/page.tsx", "utf8");
  const component = readFileSync("components/products/ChatGptRechargeMethodComparison.tsx", "utf8");
  const gpt = page.slice(page.indexOf("function GptRechargeDetails"), page.indexOf("function GrokRechargeDetails"));
  assert.match(gpt, /<ChatGptRechargeMethodComparison \/>/);
  assert.equal((page.match(/<ChatGptRechargeMethodComparison \/>/g) ?? []).length, 1);
  for (const text of ["菲区卡充与 iOS 端充值的区别", "菲律宾区银行卡充值", "Apple App Store 充值", "设备使用说明", "具体以官方服务规则为准", "不表示当前商品同时包含两种方式"]) assert.ok(component.includes(text));
  assert.match(component, /grid-cols-1[^"]*md:grid-cols-2/);
  assert.match(component, /min-w-0/);
  assert.match(component, /overflow-hidden rounded-2xl border border-orange-200 bg-white/);
  for (const structure of ["InfoRow", "CompactList", "方式 {index + 1}", "border-t border-slate-100"]) assert.ok(component.includes(structure));
  assert.doesNotMatch(component, /成功率更高|最低价|百分之百|一定支持/);
  assert.doesNotMatch(page + component, /机器猫Ai|Doraemon AI|Your AI, Our Support|让 AI 更简单|更专业的 AI 账号服务平台/);
});
