"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  CreditCard,
  Gamepad2,
  Gift,
  Globe,
  HelpCircle,
  KeyRound,
  Laptop,
  Music,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";

import { openPublicSupport } from "@/lib/support/open-public-support";

export interface AppleGiftCardDetailProduct {
  id?: string;
  slug?: string | null;
  name: string;
  category?: string | null;
  category_id?: string | null;
  price?: number | null;
  short_description?: string | null;
  description?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AppleGiftCardDetailSku {
  sku_title?: string | null;
  sku_code?: string | null;
  price?: number | null;
}

const APPLE_GIFT_CARD_CATEGORY_ID = "e5224c52-2d94-4b34-9284-7451156a4ba7";

export function isAppleGiftCardProduct(product: AppleGiftCardDetailProduct | null | undefined): boolean {
  if (!product) return false;
  const id = String(product.id ?? "").toLowerCase();
  const slug = String(product.slug ?? "").toLowerCase();
  const name = String(product.name ?? "");
  const nameLower = name.toLowerCase();
  const catId = String(product.category_id ?? product.metadata?.categoryId ?? "");
  const catSlug = String(product.metadata?.categorySlug ?? "").toLowerCase();

  if (id.startsWith("gift-apple-") || slug.startsWith("gift-apple-")) return true;
  if (catId === APPLE_GIFT_CARD_CATEGORY_ID || catSlug === "apple-gift-card") return true;
  if (/^bitrefill-(?:itunes|apple|app-store)/i.test(slug)) return true;
  if (
    /礼品卡|gift\s*card/i.test(name) &&
    (nameLower.includes("apple") || nameLower.includes("itunes") || nameLower.includes("app store") || name.includes("苹果")) &&
    !/apple\s*id|苹果id|账号/i.test(name)
  ) {
    return true;
  }
  return false;
}

type RegionTier = "low_price" | "japan" | "mainstream" | "middle_east" | "china";

interface RegionProfile {
  code: string;
  regionLabel: string;
  countryName: string;
  currencyCode: string;
  currencySymbol: string;
  tier: RegionTier;
  tagline: string;
  tierBadge: string;
  regionalTip: string;
}

const REGION_PROFILES: Record<string, RegionProfile> = {
  TR: {
    code: "TR",
    regionLabel: "土耳其区",
    countryName: "土耳其",
    currencyCode: "TRY",
    currencySymbol: "₺",
    tier: "low_price",
    tagline: "热门高性价比低价区 · iCloud+ / 影音会员 / AI 内购省钱首选",
    tierBadge: "🔥 热门低价订阅区",
    regionalTip: "土耳其区常年是 iCloud+、Apple Music、YouTube、ChatGPT 等 iOS 内购极具性价比的地区；兑换前请确认 Apple ID 已完整填写土耳其免税州/市账单地址。",
  },
  IN: {
    code: "IN",
    regionLabel: "印度区",
    countryName: "印度",
    currencyCode: "INR",
    currencySymbol: "₹",
    tier: "low_price",
    tagline: "超低价订阅热门区 · 流媒体、云空间与正版 App 划算之选",
    tierBadge: "🔥 热门低价订阅区",
    regionalTip: "印度区 App Store 订阅费率极具优势，适合 iCloud+、Apple Music、YouTube Premium 及多款效率软件订阅。",
  },
  ID: {
    code: "ID",
    regionLabel: "印度尼西亚区",
    countryName: "印度尼西亚",
    currencyCode: "IDR",
    currencySymbol: "Rp",
    tier: "low_price",
    tagline: "东南亚高性价比低价区 · 稳定续费订阅与手游充值",
    tierBadge: "🔥 东南亚热门低价区",
    regionalTip: "印尼区面额覆盖 15 万至 200 万印尼盾，适合东南亚区 Apple ID 稳定订阅流媒体、云空间与手游内购。",
  },
  BR: {
    code: "BR",
    regionLabel: "巴西区",
    countryName: "巴西",
    currencyCode: "BRL",
    currencySymbol: "R$",
    tier: "low_price",
    tagline: "拉美热门低价区 · 多面额官方直采秒发",
    tierBadge: "高性价比订阅区",
    regionalTip: "巴西区支持 20 - 200 BRL 阶梯面额，适用于巴西区 Apple ID 购买应用、游戏与订阅服务。",
  },
  MX: {
    code: "MX",
    regionLabel: "墨西哥区",
    countryName: "墨西哥",
    currencyCode: "MXN",
    currencySymbol: "MX$",
    tier: "low_price",
    tagline: "北美低价订阅区 · 适配墨西哥区 Apple ID 全生态消费",
    tierBadge: "美洲高性价比区",
    regionalTip: "适用于墨西哥区 Apple ID 充值余额，支持 App Store 应用购置、iCloud+ 及流媒体内购。",
  },
  JP: {
    code: "JP",
    regionLabel: "日本区",
    countryName: "日本",
    currencyCode: "JPY",
    currencySymbol: "¥",
    tier: "japan",
    tagline: "日服手游氪金 & 日区限定 App 必备 · 官方直采即时发码",
    tierBadge: "🎮 日服游戏 / 二次元首选",
    regionalTip: "日区账号可畅享大量日服独占手游（FGO、赛马娘、碧蓝档案、日服原神等）、日区限定应用及高音质日本 Apple Music 曲库。",
  },
  GB: {
    code: "GB",
    regionLabel: "英国区",
    countryName: "英国",
    currencyCode: "GBP",
    currencySymbol: "£",
    tier: "mainstream",
    tagline: "英区留学 & 海外主力账号必备 · 2 - 500 英镑全档位直采",
    tierBadge: "🇬🇧 欧美主流高稳定区",
    regionalTip: "英国区 App Store 应用生态极全，极少出现风控波动，适合在英留学生与追求高稳定性的海外主力 Apple ID。",
  },
  AU: {
    code: "AU",
    regionLabel: "澳大利亚区",
    countryName: "澳大利亚",
    currencyCode: "AUD",
    currencySymbol: "A$",
    tier: "mainstream",
    tagline: "澳区留学与日常消费直充 · 10 - 2000 澳元全档覆盖",
    tierBadge: "🇦🇺 留学主流区",
    regionalTip: "适用于澳大利亚区 Apple ID，支持澳区本地软件、AI 会员订阅、iCloud+ 与手游充值。",
  },
  CA: {
    code: "CA",
    regionLabel: "加拿大区",
    countryName: "加拿大",
    currencyCode: "CAD",
    currencySymbol: "C$",
    tier: "mainstream",
    tagline: "北美高稳定英语区 · 5 - 500 加元官方正版直采",
    tierBadge: "🇨🇦 北美高稳定区",
    regionalTip: "加拿大区应用库与美区高度同步且账号风控温和，适合购买 Shadowrocket、AI 工具订阅与北美正版应用。",
  },
  US: {
    code: "US",
    regionLabel: "美国区",
    countryName: "美国",
    currencyCode: "USD",
    currencySymbol: "$",
    tier: "mainstream",
    tagline: "全球应用最全主力区 · AI 会员与付费工具一站充齐",
    tierBadge: "🇺🇸 全球主力区",
    regionalTip: "美区 Apple ID 建议使用免税州（如俄勒冈、特拉华、阿拉斯加、蒙大拿、新罕布什尔）账单地址，内购结算免州税。",
  },
  DE: {
    code: "DE",
    regionLabel: "德国区",
    countryName: "德国",
    currencyCode: "EUR",
    currencySymbol: "€",
    tier: "mainstream",
    tagline: "欧洲核心欧元区 · 德区 Apple ID 官方直采发码",
    tierBadge: "🇪🇺 欧洲主力区",
    regionalTip: "欧元区礼品卡按国家严格隔离，本商品仅限德国区 Apple ID 兑换使用，请勿跨国家用于法国/西班牙等其他欧元区账号。",
  },
  FR: {
    code: "FR",
    regionLabel: "法国区",
    countryName: "法国",
    currencyCode: "EUR",
    currencySymbol: "€",
    tier: "mainstream",
    tagline: "法国区官方直采卡密 · 支付后系统自动发码",
    tierBadge: "🇪🇺 欧洲主力区",
    regionalTip: "欧元区礼品卡按国家隔离，本商品仅限法国区 Apple ID 兑换，请勿用于其他欧元区国家账号。",
  },
  ES: {
    code: "ES",
    regionLabel: "西班牙区",
    countryName: "西班牙",
    currencyCode: "EUR",
    currencySymbol: "€",
    tier: "mainstream",
    tagline: "西班牙区官方直采卡密 · 5 - 250 欧元多档可选",
    tierBadge: "🇪🇺 欧洲主流区",
    regionalTip: "仅限西班牙区 Apple ID 兑换，同为欧元区但与其他欧盟国家不互通，下单前请先核对账号国家。",
  },
  NL: {
    code: "NL",
    regionLabel: "荷兰区",
    countryName: "荷兰",
    currencyCode: "EUR",
    currencySymbol: "€",
    tier: "mainstream",
    tagline: "荷兰区官方正版直采 · 2 欧元小额起充",
    tierBadge: "🇪🇺 欧洲主流区",
    regionalTip: "支持 2 - 250 EUR 灵活面额，仅限荷兰区 Apple ID 兑换使用。",
  },
  IT: {
    code: "IT",
    regionLabel: "意大利区",
    countryName: "意大利",
    currencyCode: "EUR",
    currencySymbol: "€",
    tier: "mainstream",
    tagline: "意大利区官方正版直采 · 2 欧元小额起充",
    tierBadge: "🇪🇺 欧洲主流区",
    regionalTip: "支持 2 - 250 EUR 多档面额，仅限意大利区 Apple ID 兑换使用。",
  },
  PL: {
    code: "PL",
    regionLabel: "波兰区",
    countryName: "波兰",
    currencyCode: "PLN",
    currencySymbol: "zł",
    tier: "low_price",
    tagline: "欧洲高性价比低价区 · 兹罗提官方直采卡密",
    tierBadge: "🇪🇺 欧洲低价区",
    regionalTip: "波兰区多项订阅与游戏定价较西欧更具优势，仅限波兰区 Apple ID 兑换。",
  },
  AE: {
    code: "AE",
    regionLabel: "阿联酋区",
    countryName: "阿联酋",
    currencyCode: "AED",
    currencySymbol: "AED ",
    tier: "middle_east",
    tagline: "中东核心区官方直采 · 50 - 5000 迪拉姆全档覆盖",
    tierBadge: "中东热门区",
    regionalTip: "适用于阿联酋（UAE）区 Apple ID，支持中东区 App Store、iCloud+ 与热门游戏充值。",
  },
  SA: {
    code: "SA",
    regionLabel: "沙特阿拉伯区",
    countryName: "沙特阿拉伯",
    currencyCode: "SAR",
    currencySymbol: "SAR ",
    tier: "middle_east",
    tagline: "沙特区官方直采卡密 · 50 - 5000 里亚尔多档直充",
    tierBadge: "中东热门区",
    regionalTip: "适用于沙特阿拉伯区 Apple ID，支付后系统自动直采发放官方兑换码。",
  },
  NZ: {
    code: "NZ",
    regionLabel: "新西兰区",
    countryName: "新西兰",
    currencyCode: "NZD",
    currencySymbol: "NZ$",
    tier: "mainstream",
    tagline: "大洋洲英语区官方直采 · 5 纽币起充",
    tierBadge: "🇳🇿 留学主流区",
    regionalTip: "适用于新西兰区 Apple ID 余额充值与 App Store 订阅消费。",
  },
  CH: {
    code: "CH",
    regionLabel: "瑞士区",
    countryName: "瑞士",
    currencyCode: "CHF",
    currencySymbol: "CHF ",
    tier: "mainstream",
    tagline: "瑞士区官方正版直采 · 5 - 240 瑞郎灵活面额",
    tierBadge: "🇨🇭 欧洲精选区",
    regionalTip: "适用于瑞士区 Apple ID 余额充值，请确认账号地区设置为瑞士（Switzerland）。",
  },
  AT: {
    code: "AT",
    regionLabel: "奥地利区",
    countryName: "奥地利",
    currencyCode: "EUR",
    currencySymbol: "€",
    tier: "mainstream",
    tagline: "奥地利区官方正版直采 · 4 欧元小额起充",
    tierBadge: "🇪🇺 欧洲精选区",
    regionalTip: "仅限奥地利区 Apple ID 兑换使用（与德国区不互通）。",
  },
  BE: {
    code: "BE",
    regionLabel: "比利时区",
    countryName: "比利时",
    currencyCode: "EUR",
    currencySymbol: "€",
    tier: "mainstream",
    tagline: "比利时区官方正版直采 · 2 欧元小额起充",
    tierBadge: "🇪🇺 欧洲精选区",
    regionalTip: "支持 2 - 240 EUR 丰富档位，仅限比利时区 Apple ID 兑换。",
  },
  IE: {
    code: "IE",
    regionLabel: "爱尔兰区",
    countryName: "爱尔兰",
    currencyCode: "EUR",
    currencySymbol: "€",
    tier: "mainstream",
    tagline: "爱尔兰英语欧元区 · 官方直采即时发码",
    tierBadge: "🇮🇪 欧洲英语区",
    regionalTip: "仅限爱尔兰区 Apple ID 兑换使用，适合在爱留学生与爱尔兰区账号消费。",
  },
  PT: {
    code: "PT",
    regionLabel: "葡萄牙区",
    countryName: "葡萄牙",
    currencyCode: "EUR",
    currencySymbol: "€",
    tier: "mainstream",
    tagline: "葡萄牙区官方直采卡密 · 5 - 250 欧元可选",
    tierBadge: "🇪🇺 欧洲精选区",
    regionalTip: "仅限葡萄牙区 Apple ID 兑换，请勿用于其他欧元区国家账号。",
  },
  DK: {
    code: "DK",
    regionLabel: "丹麦区",
    countryName: "丹麦",
    currencyCode: "DKK",
    currencySymbol: "kr ",
    tier: "mainstream",
    tagline: "北欧丹麦区官方直采 · 20 丹麦克朗起充",
    tierBadge: "北欧精选区",
    regionalTip: "仅限丹麦区 Apple ID 兑换使用。",
  },
  NO: {
    code: "NO",
    regionLabel: "挪威区",
    countryName: "挪威",
    currencyCode: "NOK",
    currencySymbol: "kr ",
    tier: "mainstream",
    tagline: "北欧挪威区官方直采 · 20 挪威克朗起充",
    tierBadge: "北欧精选区",
    regionalTip: "仅限挪威区 Apple ID 兑换使用。",
  },
  SE: {
    code: "SE",
    regionLabel: "瑞典区",
    countryName: "瑞典",
    currencyCode: "SEK",
    currencySymbol: "kr ",
    tier: "mainstream",
    tagline: "北欧瑞典区官方直采 · 50 瑞典克朗起充",
    tierBadge: "北欧精选区",
    regionalTip: "仅限瑞典区 Apple ID 兑换使用。",
  },
  FI: {
    code: "FI",
    regionLabel: "芬兰区",
    countryName: "芬兰",
    currencyCode: "EUR",
    currencySymbol: "€",
    tier: "mainstream",
    tagline: "北欧芬兰区官方直采 · 10 - 250 欧元可选",
    tierBadge: "北欧精选区",
    regionalTip: "仅限芬兰区 Apple ID 兑换使用。",
  },
  CN: {
    code: "CN",
    regionLabel: "中国大陆区",
    countryName: "中国大陆",
    currencyCode: "CNY",
    currencySymbol: "¥",
    tier: "china",
    tagline: "国区 App Store 官方直采充值卡 · 20 - 1000 元可选",
    tierBadge: "中国大陆区",
    regionalTip: "仅限中国大陆区 Apple ID 兑换使用。",
  },
};

function resolveRegionProfile(product: AppleGiftCardDetailProduct): RegionProfile {
  const metaRegion = String(product.metadata?.country_region ?? "");
  const codeFromMeta = metaRegion.match(/\(([A-Z]{2})\)/)?.[1];
  if (codeFromMeta && REGION_PROFILES[codeFromMeta]) {
    return REGION_PROFILES[codeFromMeta];
  }

  const slug = String(product.slug ?? product.id ?? "").toLowerCase();
  const name = String(product.name ?? "");

  const slugChecks: Array<[RegExp, string]> = [
    [/turkey|gift-apple-tr/, "TR"],
    [/india|inr-india/, "IN"],
    [/brazil/, "BR"],
    [/mexico/, "MX"],
    [/japan/, "JP"],
    [/united-kingdom|\buk\b/, "GB"],
    [/australia/, "AU"],
    [/canada/, "CA"],
    [/indonesia/, "ID"],
    [/germany/, "DE"],
    [/france/, "FR"],
    [/spain/, "ES"],
    [/netherlands/, "NL"],
    [/italy/, "IT"],
    [/arab-emirates|\buae\b/, "AE"],
    [/card-sa\b|saudi/, "SA"],
    [/new-zealand/, "NZ"],
    [/switzerland/, "CH"],
    [/poland/, "PL"],
    [/austria/, "AT"],
    [/belgium/, "BE"],
    [/ireland/, "IE"],
    [/portugal/, "PT"],
    [/denmark/, "DK"],
    [/norway/, "NO"],
    [/sweden/, "SE"],
    [/finland/, "FI"],
    [/itunes-cn\b|china/, "CN"],
    [/gift-apple-us|apple-usa/, "US"],
  ];

  for (const [pattern, code] of slugChecks) {
    if (pattern.test(slug)) return REGION_PROFILES[code];
  }

  for (const profile of Object.values(REGION_PROFILES)) {
    if (name.includes(profile.countryName)) return profile;
  }

  return REGION_PROFILES.US;
}

function extractDenominationRange(product: AppleGiftCardDetailProduct, skus?: AppleGiftCardDetailSku[]): string {
  if (skus && skus.length > 0) {
    const labels = skus.map((s) => (s.sku_title || "").trim()).filter(Boolean);
    if (labels.length === 1) return labels[0];
    if (labels.length > 1) return `${labels[0]} ~ ${labels[labels.length - 1]}（共 ${labels.length} 档可选）`;
  }
  const sourceText = `${product.short_description ?? ""} ${product.description ?? ""}`;
  const match = sourceText.match(/面额(?:范围)?[：:\s]*([0-9.,]+\s*[-~至]\s*[0-9.,]+\s*[A-Z]{3})/);
  if (match?.[1]) return match[1];
  return "请以右侧规格列表所选面额为准";
}

export default function AppleGiftCardProductDetails({
  product,
  skus,
}: {
  product: AppleGiftCardDetailProduct;
  skus?: AppleGiftCardDetailSku[];
}) {
  const [deviceTab, setDeviceTab] = useState<"ios" | "mac">("ios");
  const region = resolveRegionProfile(product);
  const denominationText = extractDenominationRange(product, skus);

  const highlights = [
    {
      icon: ShieldCheck,
      title: "官方正版直采",
      tag: "零黑卡风险",
      desc: "接入海外持牌正规数字卡密上游直采，拒绝来路不明的低价黑卡，保障您的 Apple ID 长期资产安全。",
    },
    {
      icon: Zap,
      title: "7×24h 自动秒发",
      tag: "支付即取码",
      desc: "付款成功后系统实时自动采购并派发 16 位官方兑换码（PIN），在「我的订单」页面即可一键复制。",
    },
    {
      icon: CreditCard,
      title: "免绑海外信用卡",
      tag: "无拒付烦恼",
      desc: `支持支付宝 / 微信 / USDT / 站内余额结算，无需申请${region.countryName}当地银行卡即可轻松为账户充值。`,
    },
    {
      icon: Gift,
      title: "多档面额灵活选",
      tag: "按需充值",
      desc: "小额试用与大额年度订阅档位齐全，账户余额自动按优先顺序抵扣 App Store 消费与自动续费。",
    },
    {
      icon: Clock3,
      title: "余额永不过期",
      tag: "长期有效",
      desc: "礼品卡兑换进入 Apple 账户余额后长期有效不过期，随时用于后续软件购置、游戏氪金或会员扣费。",
    },
    {
      icon: Globe,
      title: `专享${region.regionLabel}生态`,
      tag: `${region.code} 原生区`,
      desc: region.tier === "low_price"
        ? `畅享${region.countryName}低价区汇率红利，开通各类流媒体、云存储与 AI 会员更具性价比。`
        : region.tier === "japan"
          ? "直连日本 App Store 完整应用库、日服限定手游与海量高音质日区独占内容。"
          : `完整覆盖${region.countryName}官方 App Store 应用、游戏、音乐及云服务内购场景。`,
    },
  ];

  const useCases = [
    {
      title: "AI 会员 iOS 内购订阅",
      badge: "告别外卡风控",
      icon: Bot,
      tone: "border-emerald-200 bg-emerald-50/55 text-emerald-800",
      items: [
        { name: "ChatGPT Plus / Go", desc: "iOS 端余额直扣续费，比网页绑外卡更稳" },
        { name: "Claude Pro / SuperGrok", desc: "无需海外双币卡，余额秒开高级 AI" },
        { name: "Perplexity / Poe / Notion AI", desc: "支持 Apple 订阅的海外 AI 工具全通用" },
      ],
    },
    {
      title: "正版效率与代理工具",
      badge: "一次买断永久用",
      icon: Sparkles,
      tone: "border-blue-200 bg-blue-50/55 text-blue-800",
      items: [
        { name: "Shadowrocket / Loon / Stash", desc: "口碑必备网络代理客户端正版购入" },
        { name: "Quantumult X / Surge", desc: "进阶规则工具与高阶插件余额付款" },
        { name: "Goodnotes / Procreate / Infuse", desc: "学习笔记、绘画与影音神软官方正版" },
      ],
    },
    {
      title: "影音流媒体 & 云空间",
      badge: "稳定自动续费",
      icon: Music,
      tone: "border-purple-200 bg-purple-50/55 text-purple-800",
      items: [
        { name: "iCloud+ 50GB / 200GB / 2TB", desc: "扩容照片与设备云备份，余额自动扣款" },
        { name: "Apple Music / Apple One", desc: "无损空间音频与苹果全家桶会员" },
        { name: "YouTube / Spotify / Netflix", desc: "支持通过 Apple 内购扣费的流媒体服务" },
      ],
    },
    {
      title: "海外游戏充值与氪金",
      badge: "支持应用内购",
      icon: Gamepad2,
      tone: "border-amber-200 bg-amber-50/55 text-amber-800",
      items: [
        { name: "热门外服手游内购", desc: "直接通过 App Store 余额购买月卡/礼包" },
        { name: "App Store 付费买断大作", desc: "如 Minecraft、泰拉瑞亚、帕斯卡契约等" },
        { name: "Apple Arcade 游戏订阅", desc: "畅玩数百款无广告精品独占游戏" },
      ],
    },
  ];

  const iosSteps = [
    {
      step: "01",
      title: `确认账号为${region.regionLabel}`,
      desc: `打开 iPhone / iPad「App Store」，点击右上角头像，核对您的 Apple ID 国家/地区为【${region.countryName}】。`,
    },
    {
      step: "02",
      title: "下单并复制官方卡密",
      desc: "在右侧选择所需面额并完成支付，系统自动发码后在「我的订单」内点击一键复制 16 位兑换码。",
    },
    {
      step: "03",
      title: "打开「兑换礼品卡或代码」",
      desc: "在 App Store 个人主页点击「兑换礼品卡或代码（Redeem Gift Card or Code）」，选择「手动输入代码」。",
    },
    {
      step: "04",
      title: "粘贴确认 · 余额秒到账",
      desc: `粘贴 16 位兑换码并点击右上角「兑换」，页面立即显示 ${region.currencyCode} 账户余额到账，可直接消费。`,
    },
  ];

  const macSteps = [
    {
      step: "01",
      title: `登录${region.regionLabel} Apple ID`,
      desc: `打开 Mac 电脑上的「App Store」，点击左下角登录并确认当前账户所属地区为【${region.countryName}】。`,
    },
    {
      step: "02",
      title: "复制订单内的 16 位卡密",
      desc: "支付完成后在站内「支付成功页」或「我的订单」复制系统自动发放的官方兑换码（通常以 X 开头）。",
    },
    {
      step: "03",
      title: "点击「兑换礼品卡」",
      desc: "点击 Mac App Store 左下角个人姓名进入账户页，点击右上角「兑换礼品卡（Redeem Gift Card）」。",
    },
    {
      step: "04",
      title: "完成兑换并同步全设备",
      desc: "粘贴代码并点击确认，余额实时入账并同步至同 Apple ID 下的 iPhone、iPad 与 Mac 全设备。",
    },
  ];

  const activeSteps = deviceTab === "ios" ? iosSteps : macSteps;

  const specs: Array<[string, string]> = [
    ["适用地区", `${region.countryName} (${region.code}) — 仅限${region.regionLabel} Apple ID 兑换使用`],
    ["结算面额", `${denominationText}（币种：${region.currencyCode}）`],
    ["交付方式", "支付完成后系统 7×24h 自动直采发码，站内「我的订单」随时可查可复制"],
    ["适用服务", "App Store 付费应用、应用内购买、游戏充值、iCloud+、Apple Music、Apple TV+、Apple Books 等"],
    ["卡密特性", "一次性官方数字兑换码（PIN），兑换入账后余额永久有效；未兑换前请妥善保管切勿泄露"],
    ["售后说明", "因卡密属一次性数字商品，一经发出不支持无理由退换；如遇无效码请保留完整报错截图联系客服核查"],
  ];

  const faqs = [
    {
      q: `中国区或其他国家的 Apple ID 可以兑换这张${region.regionLabel}礼品卡吗？`,
      a: `不可以。Apple 礼品卡严格实行国家/地区隔离，本商品仅限账户地区为【${region.countryName} (${region.code})】的 Apple ID 兑换。如果兑换到其他地区账号，App Store 会提示“此代码只能在其他国家/地区的店面中使用”。`,
    },
    {
      q: "付款之后多久能收到卡密？去哪里查看？",
      a: "支付成功后系统会自动触发上游官方直采，通常几秒至几十秒内即可自动发放卡密。支付成功页会直接展示卡密，您也可以随时点击站内「我的订单」查看历史卡密并一键复制。",
    },
    {
      q: "充进去的余额可以用来订阅 ChatGPT Plus / Claude / iCloud+ 吗？",
      a: "可以。只要对应 App 支持通过 Apple 应用内购（In-App Purchase）订阅，账户余额充足时系统会自动优先扣除 Apple 账户余额，无需绑定海外信用卡。建议账户预留略高于首月订阅价的余额以防扣税差异。",
    },
    {
      q: "兑换或消费时提示「无法完成您的购买 / 请联系 Apple 支持」怎么办？",
      a: "这通常是新注册 Apple ID 的苹果风控提示（并非卡密无效）。常见原因包括：新号刚注册立刻大额充值、账号未完善账单地址/付款方式信息、或频繁切换节点 IP。建议先用稳定同区网络养号并补全账单地址，或联系苹果官方在线客服刷新风控状态。",
    },
    {
      q: `我还没有${region.regionLabel} Apple ID，可以在本站一起买吗？`,
      a: "可以！本站「数字 / 社媒账号 → Apple ID」专区常备多个国家和地区的全新/老号独享 Apple ID（带密保可改密），买完账号再搭配同区礼品卡即可一站式上手。",
    },
    {
      q: "发出的兑换码无法兑换怎么申请售后？",
      a: "请第一时间保留：① App Store 兑换时的完整报错截图（需能看到账号地区与报错提示）；② 订单号与收到卡密的时间。点击下方「联系客服咨询」提交给我们，我们将在核验上游发货流水后第一时间为您处理。",
    },
  ];

  return (
    <div className="mt-6 w-full space-y-5 sm:mt-8">
      {/* 1. 旗舰黑金 + 暖铜光感头图区 */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-stone-900 px-5 py-6 text-white sm:px-7 sm:py-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-orange-500/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-20 left-10 h-44 w-44 rounded-full bg-amber-400/15 blur-3xl"
          />

          <div className="relative z-10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-orange-100 backdrop-blur-sm">
                <Gift className="h-3.5 w-3.5 text-orange-300" />
                Apple Official PIN · {region.regionLabel} ({region.code})
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                官方直采 · 自动秒发
              </span>
              <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-200">
                {region.tierBadge}
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl">
              {product.name}
            </h2>
            <p className="mt-2 text-sm font-medium text-orange-200/95 sm:text-base">
              {region.tagline}
            </p>
            <p className="mt-3 max-w-3xl text-xs leading-6 text-slate-300 sm:text-sm sm:leading-6">
              {region.regionalTip}
            </p>

            {/* 核心参数 4 格信息条 */}
            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 backdrop-blur-sm">
                <div className="text-[11px] text-slate-400">适用国家 / 地区</div>
                <div className="mt-0.5 text-xs font-bold text-white sm:text-sm">
                  {region.countryName} ({region.code})
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 backdrop-blur-sm">
                <div className="text-[11px] text-slate-400">官方币种</div>
                <div className="mt-0.5 font-mono text-xs font-bold text-orange-200 sm:text-sm">
                  {region.currencyCode} ({region.currencySymbol.trim()})
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 backdrop-blur-sm">
                <div className="text-[11px] text-slate-400">交付方式</div>
                <div className="mt-0.5 text-xs font-bold text-emerald-300 sm:text-sm">
                  7×24h 自动发码
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 backdrop-blur-sm">
                <div className="text-[11px] text-slate-400">余额有效期</div>
                <div className="mt-0.5 text-xs font-bold text-white sm:text-sm">
                  入账永久有效
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. 六大核心优势 */}
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="flex flex-col justify-between rounded-xl border border-orange-100/90 bg-gradient-to-b from-orange-50/35 to-white p-4 transition-colors hover:border-orange-200"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100/80 text-orange-700">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700 border border-orange-200/70">
                      {item.tag}
                    </span>
                  </div>
                  <div className="mt-3 text-sm font-bold text-slate-950">{item.title}</div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. 四大高频消费场景矩阵 */}
      <section className="rounded-2xl border border-orange-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
            <Sparkles className="h-5 w-5 text-orange-600" />
            充值后可以买什么？四大高频使用场景
          </h3>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            兑换至您的 {region.regionLabel} Apple 账户余额后，全苹果生态服务均可直接抵扣消费。
          </p>
        </div>

        <div className="mt-4 grid gap-3.5 md:grid-cols-2">
          {useCases.map((cat) => {
            const Icon = cat.icon;
            return (
              <div key={cat.title} className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                    <Icon className="h-4 w-4 text-orange-600" />
                    <span>{cat.title}</span>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cat.tone}`}>
                    {cat.badge}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {cat.items.map((sub) => (
                    <div
                      key={sub.name}
                      className="rounded-lg border border-slate-200/60 bg-white px-3 py-2"
                    >
                      <div className="text-xs font-semibold text-slate-900">{sub.name}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{sub.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. 下单前必看：三大防踩坑警示 + Apple ID 配套入口 */}
      <section className="rounded-2xl border border-rose-200/90 bg-rose-50/65 p-5 text-slate-800 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="text-base font-bold text-rose-950 sm:text-lg">
              下单前必读：跨区防踩坑与风控注意事项
            </div>
            <div className="space-y-2.5 text-xs leading-5 text-slate-700 sm:text-sm sm:leading-6">
              <div className="rounded-xl border border-rose-200/70 bg-white/90 p-3.5">
                <strong className="text-rose-700">1. 严格区分国家地区（不支持跨区兑换）：</strong>
                本商品为 <strong>{region.regionLabel}（{region.code} / {region.currencyCode}）</strong>专用卡密，
                仅可兑换到地区设置为【{region.countryName}】的 Apple ID 中。国区、美区或其他欧盟国家账号均无法兑换，跨区误买不支持退换。
              </div>
              <div className="rounded-xl border border-rose-200/70 bg-white/90 p-3.5">
                <strong className="text-rose-700">2. 新号请勿一次性大额充值：</strong>
                若您使用的是刚注册不久的新 Apple ID，建议先补全账单地址、下载 1~2 款免费应用正常使用后再小额充值试水，切勿频繁更换地区或使用不稳定节点反复操作，以免触发苹果账户安全风控。
              </div>
              <div className="rounded-xl border border-rose-200/70 bg-white/90 p-3.5">
                <strong className="text-rose-700">3. 一次性数字卡密 · 切勿外泄：</strong>
                官方兑换码一经系统发出无法收回或二次销售，收到后请尽快充入您本人账号并妥善保管，切勿将卡密截图发送给任何第三方陌生人。
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-200/90 bg-white px-4 py-3 text-xs sm:text-sm">
              <span className="flex items-center gap-2 font-medium text-slate-700">
                <AlertTriangle className="h-4 w-4 shrink-0 text-orange-500" />
                还没有 {region.regionLabel} Apple ID？站内提供多国全新/老号独享账号
              </span>
              <Link
                href="/products/digital-accounts"
                className="inline-flex items-center gap-1 font-semibold text-orange-600 hover:text-orange-700 hover:underline"
              >
                去选购同区 Apple ID
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 5. 极简四步兑换教程（iPhone / Mac 切换） */}
      <section className="rounded-2xl border border-orange-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
              <KeyRound className="h-5 w-5 text-orange-600" />
              30 秒极速兑换指南（四步完成入账）
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              收到 16 位官方兑换码后，按下方步骤在您的 Apple 设备上即可自助完成兑换。
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-xs">
            <button
              type="button"
              onClick={() => setDeviceTab("ios")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-all ${
                deviceTab === "ios"
                  ? "bg-white text-slate-950 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              iPhone / iPad
            </button>
            <button
              type="button"
              onClick={() => setDeviceTab("mac")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-all ${
                deviceTab === "mac"
                  ? "bg-white text-slate-950 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Laptop className="h-3.5 w-3.5" />
              Mac 电脑
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {activeSteps.map((st) => (
            <div
              key={st.step}
              className="flex flex-col justify-between rounded-xl border border-orange-100 bg-gradient-to-b from-orange-50/40 to-white p-4"
            >
              <div>
                <span className="font-mono text-2xl font-black text-orange-400">{st.step}</span>
                <div className="mt-2 text-xs font-bold text-slate-950 sm:text-sm">{st.title}</div>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">{st.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. 商品参数与售后说明 */}
      <section className="rounded-2xl border border-orange-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <CheckCircle2 className="h-5 w-5 text-orange-600" />
          商品规格与服务保障
        </h3>
        <div className="mt-4 space-y-2.5">
          {specs.map(([label, text]) => (
            <div
              key={label}
              className="flex flex-col rounded-xl border border-orange-100/90 bg-orange-50/25 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-2"
            >
              <span className="shrink-0 text-xs font-bold text-slate-900 sm:w-24 sm:text-sm">{label}：</span>
              <span className="text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">{text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 7. 常见问题折叠 FAQ */}
      <section className="rounded-2xl border border-orange-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <HelpCircle className="h-5 w-5 text-orange-600" />
          买家常见问答（FAQ）
        </h3>
        <div className="mt-4 space-y-2.5">
          {faqs.map((faq, i) => (
            <details
              key={i}
              className="group rounded-xl border border-orange-100 bg-orange-50/20 p-4 transition open:bg-orange-50/45"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-slate-900 sm:text-sm">
                <span className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                    Q
                  </span>
                  <span>{faq.q}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400 transition-transform group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 pl-7 text-xs leading-6 text-slate-600 sm:text-sm sm:leading-6">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 8. 底部客服与更多国家入口横幅 */}
      <div className="flex flex-col gap-4 rounded-2xl border border-orange-200/90 bg-gradient-to-r from-orange-50 via-amber-50/80 to-orange-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1">
          <div className="text-sm font-bold text-slate-950 sm:text-base">
            不确定该买哪个国家或面额？或需要批量采购？
          </div>
          <p className="text-xs text-slate-600 sm:text-sm">
            本站已覆盖全球 27 个海外区苹果礼品卡及 Google Play / Steam / Netflix 充值卡，遇到任何疑问随时联系在线客服。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openPublicSupport}
            className="inline-flex items-center justify-center rounded-xl border border-orange-200 bg-white px-4 py-2 text-xs font-semibold text-orange-800 shadow-xs transition hover:bg-orange-50 sm:text-sm"
          >
            联系在线客服
          </button>
          <Link
            href="/products/gift-cards"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-orange-700 sm:text-sm"
          >
            <span>浏览全部国家礼品卡</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
