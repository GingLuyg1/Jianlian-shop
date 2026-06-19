#!/usr/bin/env node

/**
 * One-time catalog migration for Jianlian Shop.
 *
 * Usage:
 *   $env:NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
 *   $env:NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
 *   $env:SUPABASE_ADMIN_EMAIL="gac000189@gmail.com"
 *   $env:SUPABASE_ADMIN_PASSWORD="your-password"
 *   npm run catalog:migrate
 *
 * The script signs in with the admin account and uses the publishable anon key.
 * It does not use service_role and does not run automatically in the app.
 */

const fs = require("node:fs");
const path = require("node:path");
const typescript = require("typescript");
const { createClient } = require("@supabase/supabase-js");

require.extensions[".ts"] = function loadTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const projectRoot = path.resolve(__dirname, "..");
const { products } = require(path.join(projectRoot, "lib", "mock-data.ts"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const adminEmail = process.env.SUPABASE_ADMIN_EMAIL;
const adminPassword = process.env.SUPABASE_ADMIN_PASSWORD;

if (!supabaseUrl || !supabaseAnonKey || !adminEmail || !adminPassword) {
  console.error(
    "Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_ADMIN_EMAIL, SUPABASE_ADMIN_PASSWORD"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function root(slug, name, icon, sortOrder, description) {
  return {
    slug,
    name,
    icon,
    description,
    level: 1,
    parentSlug: null,
    sort_order: sortOrder,
    is_active: true,
  };
}

function child(slug, name, parentSlug, icon, sortOrder, description) {
  return {
    slug,
    name,
    icon,
    description,
    level: 2,
    parentSlug,
    sort_order: sortOrder,
    is_active: true,
  };
}

const categorySeeds = [
  root("sim-cards", "国际电话卡", "CreditCard", 10, "海外实体卡与通信服务"),
  root("gift-cards", "礼品卡 / 充值卡", "Gift", 20, "Apple 礼品卡与平台充值卡"),
  root("digital-accounts", "数字账号", "KeyRound", 30, "Apple ID、Steam、邮箱与社媒账号"),
  root("ai-membership", "AI 会员充值", "Sparkles", 40, "ChatGPT、Claude、Gemini、Grok 会员充值"),
  root("sms-code", "接码服务", "MessageCircle", 50, "注册验证与平台接码"),
  root("account-recharge", "账号充值", "Wallet", 60, "平台余额与账号增值服务"),
  root("promotion", "推广赚钱", "Share2", 70, "推广链接与佣金记录"),

  child("uk", "英国", "sim-cards", "Phone", 10, "英国实体电话卡"),
  child("us", "美国", "sim-cards", "Phone", 20, "美国实体电话卡"),
  child("jp", "日本", "sim-cards", "Phone", 30, "日本电话卡"),
  child("kr", "韩国", "sim-cards", "Phone", 40, "韩国电话卡"),

  child("apple-gift-card", "Apple 礼品卡", "gift-cards", "Gift", 10, "App Store & iTunes 礼品卡"),
  child("giffgaff", "GiffGaff", "gift-cards", "Phone", 20, "GiffGaff 充值卡密"),

  child("apple-id", "Apple ID", "digital-accounts", "KeyRound", 10, "Apple ID 账号"),
  child("steam", "Steam", "digital-accounts", "KeyRound", 20, "Steam 账号"),
  child("gmail", "Gmail 邮箱", "digital-accounts", "KeyRound", 30, "Gmail 邮箱账号"),
  child("outlook", "Outlook 邮箱", "digital-accounts", "KeyRound", 40, "Outlook 邮箱账号"),
  child("telegram", "Telegram", "digital-accounts", "KeyRound", 50, "Telegram 账号"),
  child("whatsapp", "Whats App", "digital-accounts", "KeyRound", 60, "WhatsApp 账号"),
  child("tiktok", "Tiktok", "digital-accounts", "KeyRound", 70, "Tiktok 账号"),
  child("x", "X", "digital-accounts", "KeyRound", 80, "X 账号"),
  child("instagram", "instagram", "digital-accounts", "KeyRound", 90, "Instagram 账号"),
  child("facebook", "Facebook", "digital-accounts", "KeyRound", 100, "Facebook 账号"),
  child("youtube", "YouTube", "digital-accounts", "KeyRound", 110, "YouTube 账号"),
  child("twitch", "Twitch", "digital-accounts", "KeyRound", 120, "Twitch 账号"),

  child("chatgpt", "Chat Gpt", "ai-membership", "Bot", 10, "ChatGPT Plus CDK"),
  child("claude", "Claude", "ai-membership", "Bot", 20, "Claude Pro / Max CDK"),
  child("gemini", "Gemini", "ai-membership", "Bot", 30, "Google One / Gemini 权益"),
  child("grok", "Grok", "ai-membership", "Bot", 40, "Grok Super CDK"),
  child("midjourney", "Midjourney", "ai-membership", "Bot", 50, "Midjourney 会员"),

  child("sms-us", "美国", "sms-code", "MessageCircle", 10, "美国接码"),
  child("sms-uk", "英国", "sms-code", "MessageCircle", 20, "英国接码"),
  child("sms-ca", "加拿大", "sms-code", "MessageCircle", 30, "加拿大接码"),
  child("sms-au", "澳大利亚", "sms-code", "MessageCircle", 40, "澳大利亚接码"),
  child("sms-jp", "日本", "sms-code", "MessageCircle", 50, "日本接码"),
  child("sms-sg", "新加坡", "sms-code", "MessageCircle", 60, "新加坡接码"),
  child("sms-hk", "香港", "sms-code", "MessageCircle", 70, "香港接码"),

  child("account-balance", "余额充值", "account-recharge", "Wallet", 10, "账户余额充值"),
];

function getProductCategorySlug(product) {
  const id = product.id;
  if (product.category === "sim-cards") {
    if (id.includes("-us-")) return "us";
    if (id === "sim-004") return "jp";
    return "uk";
  }
  if (product.category === "gift-cards") {
    if (id.includes("giffgaff")) return "giffgaff";
    return "apple-gift-card";
  }
  if (product.category === "digital-accounts") {
    if (id.startsWith("dig-steam")) return "steam";
    if (id.startsWith("dig-apple")) return "apple-id";
    return "apple-id";
  }
  if (product.category === "ai-membership") {
    if (id.includes("claude")) return "claude";
    if (id.includes("gemini")) return "gemini";
    if (id.includes("grok")) return "grok";
    if (id.includes("midjourney")) return "midjourney";
    return "chatgpt";
  }
  if (product.category === "sms-code") {
    const code = id.replace("sms-code-", "");
    return `sms-${code}`;
  }
  if (product.category === "account-recharge") return "account-balance";
  return null;
}

function getImageUrl(product) {
  const id = product.id;
  if (id.includes("giffgaff")) return "/assets/giffgaff-icon.svg";
  if (product.category === "gift-cards") return "/assets/apple-gift-card-icon.jpg";
  if (id.startsWith("dig-steam")) return "/assets/digital-steam.jpg";
  if (id.startsWith("dig-apple")) return "/assets/apple-id-icon.jpg";
  if (id.includes("claude")) return "/assets/ai-claude-icon.jpg";
  if (id.includes("gemini")) return "/assets/ai-gemini-icon.jpg";
  if (id.includes("grok")) return "/assets/ai-grok-icon.jpg";
  if (product.category === "ai-membership") return "/assets/ai-chatgpt-icon.jpg";
  return "/assets/jianlian-brand-logo.png";
}

function getStock(product) {
  if (typeof product.stock === "number") return product.stock;
  const text = String(product.stockLabel ?? "");
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function getDeliveryType(product) {
  if (product.deliveryMethod === "physical") return "shipping";
  if (product.deliveryMethod === "digital") return "automatic";
  return "manual";
}

async function upsertCategory(seed, idBySlug) {
  const payload = {
    name: seed.name,
    slug: seed.slug,
    level: seed.level,
    parent_id: seed.parentSlug ? idBySlug.get(seed.parentSlug) : null,
    icon: seed.icon,
    description: seed.description,
    sort_order: seed.sort_order,
    is_active: seed.is_active,
  };

  const { data, error } = await supabase
    .from("categories")
    .upsert(payload, { onConflict: "slug" })
    .select("id,slug")
    .single();

  if (error) throw new Error(`Category ${seed.slug}: ${error?.message ?? "upsert failed"}`);
  idBySlug.set(data.slug, data.id);
}

async function upsertProduct(product, categoryId, index) {
  const payload = {
    category_id: categoryId,
    name: product.name,
    slug: product.id,
    short_description: product.description ?? null,
    description: null,
    image_url: getImageUrl(product),
    price: Number(product.price ?? 0),
    original_price: product.originalPrice ?? null,
    stock: getStock(product),
    delivery_type: getDeliveryType(product),
    status: product.listingStatus === "active" ? "active" : "inactive",
    sort_order: index + 1,
    metadata: {
      legacy_id: product.id,
      legacy_category: product.category,
      category_label: product.categoryLabel,
    },
  };

  const { error } = await supabase
    .from("products")
    .upsert(payload, { onConflict: "slug" });

  if (error) throw new Error(`Product ${product.id}: ${error?.message ?? "upsert failed"}`);
}

async function main() {
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (signInError) throw new Error(signInError?.message ?? "Admin sign in failed");

  const idBySlug = new Map();

  for (const seed of categorySeeds.filter((item) => item.level === 1)) {
    await upsertCategory(seed, idBySlug);
  }

  for (const seed of categorySeeds.filter((item) => item.level > 1)) {
    await upsertCategory(seed, idBySlug);
  }

  let migratedProducts = 0;
  for (const [index, product] of products.entries()) {
    const categorySlug = getProductCategorySlug(product);
    const categoryId = categorySlug ? idBySlug.get(categorySlug) : null;
    if (!categoryId) {
      console.warn(`Skip product ${product.id}: missing category ${categorySlug ?? "unknown"}`);
      continue;
    }
    await upsertProduct(product, categoryId, index);
    migratedProducts += 1;
  }

  console.log(`Migrated categories: ${categorySeeds.length}`);
  console.log(`Migrated products: ${migratedProducts}`);
}

main().catch((error) => {
  console.error(error?.message ?? error ?? "Catalog migration failed");
  process.exit(1);
});
