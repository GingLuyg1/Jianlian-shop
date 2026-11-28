export type GiftCardBrandKey =
  | "playstation"
  | "xbox"
  | "nintendo"
  | "amazon"
  | "airbnb"
  | "minecraft"
  | "blizzard"
  | "twitch"
  | "google_play"
  | "steam"
  | "netflix";

export interface GiftCardDetailProduct {
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

export interface GiftCardDetailSku {
  sku_title?: string | null;
  sku_code?: string | null;
  price?: number | null;
}

export interface GiftCardUseCaseCategory {
  title: string;
  badge: string;
  items: Array<{ name: string; desc: string }>;
}

export interface GiftCardStep {
  step: string;
  title: string;
  desc: string;
}

export interface GiftCardBrandTheme {
  heroGradient: string;
  heroGlowA: string;
  heroGlowB: string;
  badgeClass: string;
  accentText: string;
  accentBgSoft: string;
  accentBorder: string;
  accentIconBg: string;
  buttonBg: string;
  codeText: string;
  guaranteeBorder: string;
  guaranteeBg: string;
  guaranteeTitle: string;
}

export interface GiftCardBrandProfile {
  key: GiftCardBrandKey;
  brandName: string;
  shortName: string;
  englishBadge: string;
  tagline: string;
  introSummary: (regionLabel: string, countryName: string, currencyCode: string) => string;
  theme: GiftCardBrandTheme;
  codeFormat: {
    title: string;
    subtitle: string;
    sampleCode: string;
    sampleComment: string;
    anatomy: [string, string, string, string];
    promises: [string, string, string];
  };
  officialRedeemUrl: string;
  officialRedeemLabel: string;
  guarantees: Array<{ title: string; desc: string }>;
  highlights: (regionLabel: string, countryName: string) => Array<{
    title: string;
    tag: string;
    desc: string;
  }>;
  useCases: GiftCardUseCaseCategory[];
  deviceTabs: {
    primaryLabel: string;
    secondaryLabel: string;
    primarySteps: (regionLabel: string, countryName: string, currencyCode: string) => GiftCardStep[];
    secondarySteps: (regionLabel: string, countryName: string, currencyCode: string) => GiftCardStep[];
  };
  warnings: (regionLabel: string, countryName: string, currencyCode: string) => Array<{
    title: string;
    desc: string;
  }>;
  crossSell?: {
    title: string;
    subtitle: string;
    href: string;
    buttonLabel: string;
  };
  faqs: (regionLabel: string, countryName: string, currencyCode: string) => Array<{
    q: string;
    a: string;
  }>;
  specs: (
    productName: string,
    regionLabel: string,
    countryName: string,
    countryCode: string,
    currencyCode: string,
    denominationText: string,
  ) => Array<[string, string]>;
}

const CATEGORY_ID_TO_BRAND: Record<string, GiftCardBrandKey> = {
  "c99751ab-677e-4f53-8277-5b2f807c35bf": "playstation",
  "1f4a27c2-40fa-4090-8b4d-b5a9ec1d2ccf": "xbox",
  "f0a87d10-889e-4116-aa45-eb2474925b54": "nintendo",
  "76e2c369-05f9-4abb-a29e-3051bed4e0d1": "amazon",
  "235a5c4e-1ea3-47c8-bb07-b1875228b17e": "airbnb",
  "f6e3e7ee-ea6d-4b4d-836b-700c929ac237": "minecraft",
  "dbbcdce7-0101-4310-a860-757c546ce5d9": "blizzard",
  "824c1839-a308-4e3b-8772-fa9f1d9c4f63": "twitch",
  "39ff244a-f2d8-42fe-9a97-2e23f5c4dbf4": "google_play",
  "9efd0f37-28e5-4ba3-8c4e-31c890f51283": "steam",
  "bf057f3c-45ef-4c3a-9c71-1f3cfe313d14": "netflix",
};

const CATEGORY_SLUG_TO_BRAND: Record<string, GiftCardBrandKey> = {
  "playstation-gift-card": "playstation",
  "xbox-gift-card": "xbox",
  "nintendo-gift-card": "nintendo",
  "amazon-gift-card": "amazon",
  "airbnb-gift-card": "airbnb",
  "minecraft-gift-card": "minecraft",
  "blizzard-gift-card": "blizzard",
  "twitch-gift-card": "twitch",
  "google-play-gift-card": "google_play",
  "steam-gift-card": "steam",
  "netflix-gift-card": "netflix",
};

export function resolveGiftCardBrand(
  product: GiftCardDetailProduct | null | undefined,
): GiftCardBrandKey | null {
  if (!product) return null;
  const catId = String(product.category_id ?? product.metadata?.categoryId ?? "").trim();
  if (catId && CATEGORY_ID_TO_BRAND[catId]) return CATEGORY_ID_TO_BRAND[catId];

  const catSlug = String(product.metadata?.categorySlug ?? product.metadata?.category_slug ?? "").toLowerCase();
  if (catSlug && CATEGORY_SLUG_TO_BRAND[catSlug]) return CATEGORY_SLUG_TO_BRAND[catSlug];

  const metaBrand = String(product.metadata?.brand_family ?? "").toLowerCase();
  if (metaBrand && metaBrand in BRAND_PROFILES) return metaBrand as GiftCardBrandKey;

  const id = String(product.id ?? "").toLowerCase();
  const slug = String(product.slug ?? "").toLowerCase();
  const spid = String(product.metadata?.supplier_product_id ?? "").toLowerCase();
  const name = String(product.name ?? "");
  const nameLower = name.toLowerCase();
  const joined = `${id} ${slug} ${spid}`;

  // Avoid catching digital accounts (e.g. Steam account or Twitch account under digital-accounts)
  const isAccountProduct =
    product.category === "digital-accounts" ||
    id.startsWith("dig-") ||
    slug.startsWith("dig-") ||
    (/账号|成品号|白号|老号/.test(name) && !/礼品卡|充值卡|点卡|激活码|会员卡|游戏时间卡|gift\s*card/i.test(name));
  if (isAccountProduct) return null;

  if (/playstation|sony-playstation|\bpsn\b/.test(joined) || /playstation|psn/i.test(nameLower)) return "playstation";
  if (/\bxbox\b|xboxlive|xboxhu|xboxsk/.test(joined) || /\bxbox\b|game\s*pass/i.test(nameLower)) return "xbox";
  if (/nintendo/.test(joined) || /nintendo|任天堂|eshop/i.test(nameLower)) return "nintendo";
  if (/amazon/.test(joined) || /amazon|亚马逊/i.test(nameLower)) return "amazon";
  if (/airbnb/.test(joined) || /airbnb|爱彼迎/i.test(nameLower)) return "airbnb";
  if (/minecraft/.test(joined) || /minecraft|我的世界|minecoin/i.test(nameLower)) return "minecraft";
  if (/blizzard|battle_net|battlenet/.test(joined) || /blizzard|battle\.net|暴雪|战网/i.test(nameLower)) return "blizzard";
  if (/bitrefill-twitch|\btwitch-/.test(joined) || (nameLower.includes("twitch") && /礼品卡|充值卡|gift/i.test(name))) return "twitch";
  if (/google-play/.test(joined) || /google\s*play/i.test(nameLower)) return "google_play";
  if (/bitrefill-steam|\bsteam-/.test(joined) || (nameLower.includes("steam") && /礼品卡|充值卡|钱包|gift/i.test(name))) return "steam";
  if (/netflix/.test(joined) || /netflix|奈飞/i.test(nameLower)) return "netflix";

  return null;
}

export interface GiftCardRegionInfo {
  code: string;
  countryName: string;
  regionLabel: string;
  currencyCode: string;
  tierBadge: string;
  regionalTip: string;
}

const COUNTRY_META: Record<string, { zh: string; short: string; currency: string; tier?: "low" | "asia" | "major" | "global" }> = {
  US: { zh: "美国", short: "美区", currency: "USD", tier: "major" },
  HK: { zh: "中国香港", short: "港区", currency: "HKD", tier: "asia" },
  JP: { zh: "日本", short: "日区", currency: "JPY", tier: "asia" },
  TR: { zh: "土耳其", short: "土耳其区", currency: "TRY", tier: "low" },
  GB: { zh: "英国", short: "英区", currency: "GBP", tier: "major" },
  SG: { zh: "新加坡", short: "新加坡区", currency: "SGD", tier: "asia" },
  DE: { zh: "德国", short: "德国区", currency: "EUR", tier: "major" },
  FR: { zh: "法国", short: "法国区", currency: "EUR", tier: "major" },
  CA: { zh: "加拿大", short: "加拿大区", currency: "CAD", tier: "major" },
  AU: { zh: "澳大利亚", short: "澳洲区", currency: "AUD", tier: "major" },
  NZ: { zh: "新西兰", short: "新西兰区", currency: "NZD", tier: "major" },
  ES: { zh: "西班牙", short: "西班牙区", currency: "EUR", tier: "major" },
  IT: { zh: "意大利", short: "意大利区", currency: "EUR", tier: "major" },
  NL: { zh: "荷兰", short: "荷兰区", currency: "EUR", tier: "major" },
  PL: { zh: "波兰", short: "波兰区", currency: "PLN", tier: "low" },
  BR: { zh: "巴西", short: "巴西区", currency: "BRL", tier: "low" },
  MX: { zh: "墨西哥", short: "墨西哥区", currency: "MXN", tier: "low" },
  AR: { zh: "阿根廷", short: "阿根廷区", currency: "ARS", tier: "low" },
  CO: { zh: "哥伦比亚", short: "哥伦比亚区", currency: "COP", tier: "low" },
  IN: { zh: "印度", short: "印度区", currency: "INR", tier: "low" },
  ID: { zh: "印度尼西亚", short: "印尼区", currency: "IDR", tier: "low" },
  ZA: { zh: "南非", short: "南非区", currency: "ZAR", tier: "low" },
  AE: { zh: "阿联酋", short: "阿联酋区", currency: "AED" },
  SA: { zh: "沙特阿拉伯", short: "沙特区", currency: "SAR" },
  KW: { zh: "科威特", short: "科威特区", currency: "USD" },
  QA: { zh: "卡塔尔", short: "卡塔尔区", currency: "USD" },
  LB: { zh: "黎巴嫩", short: "黎巴嫩区", currency: "USD" },
  BH: { zh: "巴林", short: "巴林区", currency: "USD" },
  EG: { zh: "埃及", short: "埃及区", currency: "EGP", tier: "low" },
  TH: { zh: "泰国", short: "泰国区", currency: "THB", tier: "asia" },
  MY: { zh: "马来西亚", short: "马来西亚区", currency: "MYR", tier: "asia" },
  VN: { zh: "越南", short: "越南区", currency: "VND", tier: "low" },
  TW: { zh: "中国台湾", short: "台区", currency: "TWD", tier: "asia" },
  KR: { zh: "韩国", short: "韩区", currency: "KRW", tier: "asia" },
  CH: { zh: "瑞士", short: "瑞士区", currency: "CHF", tier: "major" },
  AT: { zh: "奥地利", short: "奥地利区", currency: "EUR" },
  BE: { zh: "比利时", short: "比利时区", currency: "EUR" },
  IE: { zh: "爱尔兰", short: "爱尔兰区", currency: "EUR" },
  PT: { zh: "葡萄牙", short: "葡萄牙区", currency: "EUR" },
  DK: { zh: "丹麦", short: "丹麦区", currency: "DKK" },
  NO: { zh: "挪威", short: "挪威区", currency: "NOK" },
  SE: { zh: "瑞典", short: "瑞典区", currency: "SEK" },
  FI: { zh: "芬兰", short: "芬兰区", currency: "EUR" },
  CZ: { zh: "捷克", short: "捷克区", currency: "CZK" },
  SK: { zh: "斯洛伐克", short: "斯洛伐克区", currency: "EUR" },
  HU: { zh: "匈牙利", short: "匈牙利区", currency: "HUF" },
  RO: { zh: "罗马尼亚", short: "罗马尼亚区", currency: "RON" },
  HR: { zh: "克罗地亚", short: "克罗地亚区", currency: "EUR" },
  LU: { zh: "卢森堡", short: "卢森堡区", currency: "EUR" },
  CL: { zh: "智利", short: "智利区", currency: "CLP", tier: "low" },
  PE: { zh: "秘鲁", short: "秘鲁区", currency: "PEN", tier: "low" },
  UY: { zh: "乌拉圭", short: "乌拉圭区", currency: "UYU" },
  EU: { zh: "欧洲", short: "欧服 / 欧洲区", currency: "EUR", tier: "major" },
  XI: { zh: "国际通用", short: "国际版", currency: "USD", tier: "global" },
};

export function resolveGiftCardRegion(product: GiftCardDetailProduct): GiftCardRegionInfo {
  const metaCode = String(product.metadata?.country_code ?? "").trim().toUpperCase();
  const regionStr = String(product.metadata?.country_region ?? "");
  const shortDesc = String(product.short_description ?? product.description ?? "");
  const codeMatch =
    (metaCode && COUNTRY_META[metaCode] ? metaCode : null) ||
    regionStr.match(/\(([A-Z]{2})\)/)?.[1] ||
    shortDesc.match(/\(([A-Z]{2})\)/)?.[1] ||
    null;

  let code = codeMatch || "";
  if (!code) {
    const joined = `${product.name} ${product.slug ?? ""} ${product.id ?? ""}`.toLowerCase();
    for (const [k, info] of Object.entries(COUNTRY_META)) {
      if (joined.includes(info.zh) || joined.includes(info.short)) {
        code = k;
        break;
      }
    }
  }
  if (!code) code = "US";

  const info = COUNTRY_META[code] ?? { zh: code, short: `${code}区`, currency: "USD" };
  const faceCurrency =
    String(product.metadata?.face_currency ?? "").trim().toUpperCase() ||
    shortDesc.match(/\b(USD|EUR|GBP|JPY|HKD|TRY|BRL|MXN|CAD|AUD|NZD|SGD|INR|PLN|CHF|SAR|AED|ZAR|EGP|ARS|COP|THB|MYR|TWD|KRW|IDR|VND|NOK|SEK|DKK|CZK|HUF|RON|CLP|PEN|UYU)\b/)?.[1] ||
    info.currency;

  const tierBadge =
    info.tier === "global"
      ? "🌍 国际通用版"
      : info.tier === "low"
        ? "🔥 高性价比低价区"
        : info.tier === "asia"
          ? "⚡ 华人热门主力区"
          : info.tier === "major"
            ? "⭐ 全球热门大区"
            : "🌐 官方原区直采";

  const regionalTip =
    info.tier === "global"
      ? "本商品为国际版官方激活码/点卡，支持主流海外微软/国际服账号自助兑换，免海外双币信用卡。"
      : info.tier === "low"
        ? `${info.zh}区常年具备明显汇率与定价优势，是开通会员、购买数字版大作或日常充值的省钱热门区；兑换前请确认您的账号国家/地区与本卡一致。`
        : info.tier === "asia"
          ? `${info.zh}区拥有完善的中文支持与热门内容库，兑换流畅稳定，深受国内玩家与海外华人用户欢迎。`
          : `本商品由海外正规持牌上游直采，专供${info.zh} (${code}) 区域账号使用，充值入账后按官方规则永久有效。`;

  return {
    code,
    countryName: info.zh,
    regionLabel: info.short,
    currencyCode: faceCurrency,
    tierBadge,
    regionalTip,
  };
}

export function extractGiftCardDenominationText(
  product: GiftCardDetailProduct,
  skus?: GiftCardDetailSku[],
  currencyCode?: string,
): string {
  const validSkus = (skus ?? []).filter((s) => s.sku_title && String(s.sku_title).trim());
  if (validSkus.length === 1) return String(validSkus[0].sku_title).trim();
  if (validSkus.length > 1) {
    const first = String(validSkus[0].sku_title).trim();
    const last = String(validSkus[validSkus.length - 1].sku_title).trim();
    if (first !== last) return `${first} ~ ${last}（共 ${validSkus.length} 档）`;
    return `${first}（共 ${validSkus.length} 档）`;
  }
  const text = `${product.short_description ?? ""} ${product.description ?? ""}`;
  const m = text.match(/面额\s*([0-9.]+\s*-\s*[0-9.]+\s*[A-Z]{3})/);
  if (m) return m[1];
  const m2 = text.match(/(\d+\s*个官方档位\s*\([A-Z]{3}\))/);
  if (m2) return m2[1];
  return currencyCode ? `按右侧所选 ${currencyCode} 规格档位为准` : "按右侧规格选择为准";
}

export const BRAND_PROFILES: Record<GiftCardBrandKey, GiftCardBrandProfile> = {
  playstation: {
    key: "playstation",
    brandName: "PlayStation Store (PSN)",
    shortName: "PSN 礼品卡",
    englishBadge: "PlayStation Official PIN",
    tagline: "官方一手直采 12 位 PSN 兑换码 · 畅买 PS5/PS4 大作与 PS Plus 会员",
    introSummary: (r, c, cur) =>
      `适用于 ${c}区 (${cur}) PlayStation Network 账号钱包充值。免绑海外信用卡、零黑卡封号风险，支持购买 PlayStation Store 数字版游戏、DLC 扩展包及开通/续费 PS Plus 档位会员。`,
    theme: {
      heroGradient: "from-[#00225E] via-[#003791] to-[#0B1D3F]",
      heroGlowA: "bg-blue-400/25",
      heroGlowB: "bg-cyan-400/15",
      badgeClass: "border-blue-300/35 bg-blue-400/15 text-blue-100",
      accentText: "text-[#00439C]",
      accentBgSoft: "bg-blue-50/50",
      accentBorder: "border-blue-200/85",
      accentIconBg: "bg-blue-100 text-[#00439C]",
      buttonBg: "bg-[#00439C] hover:bg-[#00347A]",
      codeText: "text-[#00439C]",
      guaranteeBorder: "border-blue-200/90",
      guaranteeBg: "from-blue-50 via-sky-50/40 to-white",
      guaranteeTitle: "text-blue-900",
    },
    codeFormat: {
      title: "PSN 官方 12 位卡密交付格式说明",
      subtitle: "支付成功后系统自动向持牌渠道直采并派发 12 位数字字母组合兑换码（可在「我的订单」一键复制）：",
      sampleCode: "ABCD-EFGH-JKLM",
      sampleComment: "// PlayStation Store 12 位标准兑换码（示例格式）",
      anatomy: ["① 12 位官方激活码", "② 对应国家/币种锁区", "③ 充入 PSN 电子钱包", "④ 余额永久有效不过期"],
      promises: ["一手官方直采拒绝黑卡", "免海外卡规避 PS 商店拒付", "支持 PS5 / PS4 / 网页端 / PS App"],
    },
    officialRedeemUrl: "https://store.playstation.com/",
    officialRedeemLabel: "前往 PlayStation Store 官网兑换",
    guarantees: [
      { title: "零黑卡防 BAN 机保障", desc: "全部卡密来自正规海外授权卡密上游，杜绝盗刷黑卡导致的 PSN 账号永久封禁风险。" },
      { title: "7×24h 全自动秒级发码", desc: "支付宝 / 微信 / USDT / 站内余额付款后，系统自动采购并回传卡密至「我的订单」。" },
      { title: "无效码优先核查兜底", desc: "若首次兑换遇到官方提示代码异常，请保留含账号地区和错误提示的完整截图联系客服核验。" },
    ],
    highlights: (r, c) => [
      { title: "免绑海外信用卡", tag: "告别拒付", desc: `无需申请${c}当地银行卡或 PayPal，直接用人民币/余额为您的${r} PSN 钱包充入官方余额。` },
      { title: "PS Plus 会员通用", tag: "一二三档", desc: "钱包入账后可直接开通或续费 PS Plus Essential / Extra / Deluxe 会员，解锁海量二档游戏库。" },
      { title: "多档面额自由叠加", tag: "灵活凑单", desc: "可单买小额补差价，也可多张礼品卡连续充入同一 PSN 钱包，自动累计余额。" },
      { title: "全平台无缝同步", tag: "PS5 / PS4", desc: "在网页端、PS App 或主机端任一入口兑换成功后，余额即刻同步至同账号下的所有设备。" },
      { title: "数字版大作随心购", tag: "预购 & 折扣", desc: "不错过索尼黑五、夏日特卖与新游预购，钱包余额付款秒出库直接下载。" },
      { title: "余额永不过期", tag: "长期保值", desc: "兑换码充入 PlayStation 钱包后长期保留，无需担心到期清零。" },
    ],
    useCases: [
      {
        title: "PS Plus 会员订阅（一/二/三档）",
        badge: "联机 + 会免库",
        items: [
          { name: "PS Plus Essential 一档", desc: "解锁线上多人联机、云存档与每月精选免费游戏" },
          { name: "PS Plus Extra / Deluxe 二三档", desc: "畅玩数百款 3A 大作游戏目录、试玩版与经典游戏库" },
        ],
      },
      {
        title: "PS5 / PS4 独占与热门 3A 大作",
        badge: "特卖折扣必囤",
        items: [
          { name: "索尼第一方与热门新游", desc: "战神、最后生还者、黑神话悟空、蜘蛛侠、艾尔登法环等" },
          { name: "季票 & DLC 扩展内容", desc: "游戏本体扩展包、豪华升级包随时余额秒买" },
        ],
      },
      {
        title: "热门网游内购与虚拟货币",
        badge: "零汇率折损",
        items: [
          { name: "FC Points / NBA 2K VC / COD 点数", desc: "体育与射击年货游戏商城内购直接扣钱包余额" },
          { name: "原神 / 崩铁 / Apex 联机氪金", desc: "主机端绑定账号直接使用对应区 PSN 钱包结算" },
        ],
      },
      {
        title: "跨区低价淘游与语言区优选",
        badge: "玩家省钱秘籍",
        items: [
          { name: "港服 / 日服主力区", desc: "中文版覆盖率高、日系大作首发快、国内下载体验稳" },
          { name: "土区 / 美区 / 阿根廷等热门区", desc: "享受地区差异定价与特惠活动，搭配对应区账号更划算" },
        ],
      },
    ],
    deviceTabs: {
      primaryLabel: "PS5 / PS4 主机端",
      secondaryLabel: "网页端 / PS App",
      primarySteps: (r, c, cur) => [
        { step: "01", title: `核对 PSN 为${r}`, desc: `在主机上登录国家/地区设置为【${c}】的 PlayStation 账号，确保商店货币为 ${cur}。` },
        { step: "02", title: "进入 PlayStation Store", desc: "在主机主界面打开 PlayStation Store，滚动至顶部/左侧菜单选择「兑换代码（Redeem Codes）」。" },
        { step: "03", title: "输入 12 位兑换码", desc: "准确输入从本站「我的订单」获取的 12 位官方卡密（不区分大小写，无需输入连字符）。" },
        { step: "04", title: "确认入账即刻消费", desc: `核对页面显示的 ${cur} 面额无误后点击「兑换」，资金即刻充入 PSN 钱包。` },
      ],
      secondarySteps: (r, c, cur) => [
        { step: "01", title: "登录官网或 PS App", desc: `打开 store.playstation.com 或手机 PlayStation App，登录您的【${c}】账号。` },
        { step: "02", title: "打开「兑换代码」入口", desc: "点击页面右上角头像，在下拉菜单中选择「兑换代码（Redeem Code）」。" },
        { step: "03", title: "粘贴 12 位卡密", desc: "直接粘贴订单内复制的 12 位兑换码并点击「继续」。" },
        { step: "04", title: `钱包 ${cur} 余额秒到账`, desc: "确认金额并点击兑换，余额实时同步至您的 PS5 / PS4 主机。" },
      ],
    },
    warnings: (r, c, cur) => [
      { title: "1. 严格锁区（不支持跨服兑换）", desc: `本商品为【${c} / ${cur}】专用 PSN 礼品卡，仅限注册地区为${c}的 PlayStation 账号使用。港服、美服、日服、土服彼此完全隔离，跨区购买无法兑换且不支持退换。` },
      { title: "2. 请注意 PSN 钱包上限", desc: "索尼官方对各地区 PSN 钱包余额设有单账号存储上限（如美区常见上限为 $250 等），大额连充前请先查看当前钱包剩余空间。" },
      { title: "3. 一次性数字卡密切勿泄露", desc: "卡密发出后请尽快兑换到本人账号，切勿截图发给他人或在不明代充群粘贴，避免被盗用。" },
    ],
    faqs: (r, c, cur) => [
      { q: `我的港服/国行账号可以兑换这张${r} PSN 礼品卡吗？`, a: `不可以。PSN 礼品卡严格绑定账号注册时选定的国家/地区，本卡仅限【${c} (${cur})】账号兑换。如果您的账号属于其他区，请返回 PlayStation 分类选择对应国家的商品。` },
      { q: "充进钱包的余额可以直接开 PS Plus 会员吗？", a: "可以！只要钱包余额大于等于所选 PS Plus 套餐价格，结账时直接选择使用钱包余额支付即可。部分地区开通自动续费时可能需要账号里已有绑定支付方式或按季/年购入。" },
      { q: "为什么网页兑换时偶尔提示「发生错误」？", a: "通常是浏览器网络环境波动或频繁重试触发索尼短暂频控。建议改用 PS5/PS4 主机端或手机 PS App 兑换，或切换纯净网络并等待 15 分钟后再试。" },
      { q: "买多张卡密可以叠加到同一个账号吗？", a: "完全支持！只要不超过该地区 PSN 钱包总额上限，您可以分多次购入并逐张兑换累计余额。" },
      { q: "付款后多久能拿到兑换码？", a: "本站全自动对接正规海外直采渠道，付款成功后通常数秒至几十秒内即可自动发放卡密，可在支付成功页和「我的订单」随时查看。" },
      { q: "遇到提示「代码无效」或「已被使用」怎么售后？", a: "请第一时间截取包含「您的 PSN 账号地区显示 + 输入错误提示」的完整屏幕截图，并附上订单号点击下方在线客服，我们将立即核查上游发码凭证为您处理。" },
    ],
    specs: (name, r, c, code, cur, denom) => [
      ["商品名称", name],
      ["适用账号地区", `${c} (${code}) — 仅限${r} PlayStation Network 账号`],
      ["可选规格 / 面额", denom],
      ["交付格式", "12 位 PlayStation 官方数字兑换码（PIN），支付后系统自动发放"],
      ["支持设备", "PlayStation 5 / PlayStation 4 / 网页端 Store / PlayStation App"],
      ["售后保障", "官方一手正版直采；一次性卡密发出后不支持无理由退换，异常码凭证核实兜底"],
    ],
  },

  xbox: {
    key: "xbox",
    brandName: "Xbox / Game Pass",
    shortName: "Xbox 礼品卡",
    englishBadge: "Xbox & Microsoft Official 25-Digit PIN",
    tagline: "微软官方 25 位兑换码 · 畅享 Xbox Game Pass 与微软商店千款大作",
    introSummary: (r, c, cur) =>
      `适用于 ${c}区 (${cur}) 微软 / Xbox 账号余额充值或对应区域 Xbox Game Pass 会员兑换。支持 Xbox Series X|S、Xbox One 及 Windows PC 微软商店双端消费，安全直采不封号。`,
    theme: {
      heroGradient: "from-[#0A4D16] via-[#107C10] to-[#082E10]",
      heroGlowA: "bg-emerald-400/25",
      heroGlowB: "bg-lime-400/15",
      badgeClass: "border-emerald-300/35 bg-emerald-400/15 text-emerald-100",
      accentText: "text-[#107C10]",
      accentBgSoft: "bg-emerald-50/50",
      accentBorder: "border-emerald-200/85",
      accentIconBg: "bg-emerald-100 text-[#107C10]",
      buttonBg: "bg-[#107C10] hover:bg-[#0D660D]",
      codeText: "text-[#107C10]",
      guaranteeBorder: "border-emerald-200/90",
      guaranteeBg: "from-emerald-50 via-green-50/40 to-white",
      guaranteeTitle: "text-emerald-900",
    },
    codeFormat: {
      title: "Xbox / Microsoft 25 位官方卡密交付格式",
      subtitle: "付款完成后系统全自动直采微软官方 25 位 5×5 字符兑换码（支持网页端一键粘贴兑换）：",
      sampleCode: "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX",
      sampleComment: "// Microsoft / Xbox 25 位标准官方兑换码（示例格式）",
      anatomy: ["① 25 位微软官方代码", "② 自动对应区域与档位", "③ PC 与 Xbox 主机双端通用", "④ 余额永不过期 / 会员即刻生效"],
      promises: ["微软正规通道杜绝黑卡封号", "免绑外币信用卡轻松消费", "7×24h 支付后秒级自动发码"],
    },
    officialRedeemUrl: "https://redeem.microsoft.com/",
    officialRedeemLabel: "前往微软官方 redeem.microsoft.com 兑换",
    guarantees: [
      { title: "官方正版渠道直采", desc: "全部卡密源自正规海外持牌渠道，绝非黑卡/盗刷代购，保护您的微软主号长期安全。" },
      { title: "主机 + PC 跨端畅玩", desc: "充入微软余额或开通 XGP 会员后，Xbox Series X|S 与 Windows 11/10 Xbox App 同步可用。" },
      { title: "售后核查极速响应", desc: "若兑换遇到报错，请保留完整报错页面截图与订单号联系在线客服，第一时间核实处理。" },
    ],
    highlights: (r, c) => [
      { title: "支持 XGP 会员体系", tag: "海量游戏库", desc: "支持购买/续费 Xbox Game Pass（含 Ultimate / Premium / Essential / Core 等对应档位）或余额抵扣。" },
      { title: "免绑海外银行卡", tag: "无风控拒付", desc: `无需准备${c}本地信用卡，支付宝 / 微信 / USDT / 余额直接购买，即刻拿到 25 位官方码。` },
      { title: "Xbox & PC 双端通用", tag: "Play Anywhere", desc: "微软生态余额与 XGP 终极会员可同时用于主机端与 PC 端微软商店购买游戏及扩展内容。" },
      { title: "热门低价区覆盖全", tag: "土区 / 巴西 / 印度", desc: "同步覆盖美/港/日主流大区及土耳其、巴西、印度、墨西哥、哥伦比亚等高性价比热门区。" },
      { title: "官方一键网页兑换", tag: "30 秒完成", desc: "无需繁琐操作，打开 redeem.microsoft.com 粘贴 25 位兑换码即可立即生效。" },
      { title: "7×24h 自动发码", tag: "即买即玩", desc: "全天无休自动直采发货，深夜想开黑买游戏或续费 XGP 也能秒到账。" },
    ],
    useCases: [
      {
        title: "Xbox Game Pass 会员畅玩",
        badge: "首发即入库",
        items: [
          { name: "XGP Ultimate / Premium / Essential", desc: "畅玩数百款主机与 PC 精品大作、EA Play 及联机权限" },
          { name: "微软第一方大作首发直玩", desc: "使命召唤、极限竞速、光环、星空、夺宝奇兵等首发畅玩" },
        ],
      },
      {
        title: "Microsoft Store 买断大作 & DLC",
        badge: "史低特卖必备",
        items: [
          { name: "Xbox Series X|S / One 数字游戏", desc: "GTA、荒野大镖客、赛博朋克 2077、艾尔登法环等随时入库" },
          { name: "游戏通行证与扩展包", desc: "各类赛季通行证、皮肤礼包和 DLC 直接扣微软余额" },
        ],
      },
      {
        title: "Windows PC 应用与游戏内购",
        badge: "PC 玩家适用",
        items: [
          { name: "PC 端 Xbox App 游戏", desc: "余额充入微软账号后可直接购买 PC 版正版游戏与 Minecraft 点数" },
          { name: "微软商店正版软件", desc: "支持对应区域 Microsoft Store 内的付费应用与工具" },
        ],
      },
      {
        title: "热门高性价比区域优势",
        badge: "玩家精选",
        items: [
          { name: "美区 / 港区 / 日区", desc: "兑换门槛低、网络适配友好、长期稳定续费首选" },
          { name: "土耳其 / 巴西 / 印度 / 墨西哥区", desc: "低价区性价比突出，兑换时请务必匹配对应区域账号与网络环境" },
        ],
      },
    ],
    deviceTabs: {
      primaryLabel: "网页端兑换（推荐）",
      secondaryLabel: "Xbox 主机 / PC App",
      primarySteps: (r, c, cur) => [
        { step: "01", title: "确认微软账号区域", desc: `在 account.microsoft.com 确认您的账号国家/地区已设置为【${c}】（低价区建议配合同区纯净网络）。` },
        { step: "02", title: "打开微软官方兑换页", desc: "浏览器访问 redeem.microsoft.com 并登录需要充值或开通会员的 Microsoft 账号。" },
        { step: "03", title: "粘贴 25 位官方卡密", desc: "将本站「我的订单」内复制的 25 位兑换码粘贴进输入框并点击「下一步」。" },
        { step: "04", title: `核对 ${cur} 权益并确认`, desc: "核对页面显示的金额或 XGP 会员时长无误后点击「确认」，余额/会员立即到账。" },
      ],
      secondarySteps: (r, c, cur) => [
        { step: "01", title: "打开 Store 商店", desc: `在 Xbox 主机按西瓜键打开「Store」，或在 Windows 打开「Xbox App」并登录【${c}】账号。` },
        { step: "02", title: "进入「兑换（Redeem）」", desc: "在左侧导航栏或右上角头像菜单中点击「兑换代码」。" },
        { step: "03", title: "输入 25 位激活码", desc: "依次输入 25 位卡密，系统会自动识别对应面额或 Game Pass 套餐。" },
        { step: "04", title: `完成 ${cur} 充值生效`, desc: "确认后账户余额或会员期限立即更新，马上可下载游戏。" },
      ],
    },
    warnings: (r, c, cur) => [
      { title: "1. 严格匹配区域（特别是低价区网络要求）", desc: `本卡密仅限【${c} (${cur})】区域使用。微软对土耳其、巴西、阿根廷、印度等低价区实行严格地域校验，兑换此类区域代码时请确保账号地区与当前网络 IP 均与目标区一致。` },
      { title: "2. 区分「余额礼品卡」与「Game Pass 会员卡」", desc: "下单前请看清商品名称与右侧 SKU 档位：标注 Game Pass 的为会员时长卡，标注面额的为微软商店余额卡；若当前已有其他未到期 XGP 套餐，叠加规则以微软官方换算为准。" },
      { title: "3. 一次性官方 PIN 码售出不退", desc: "25 位兑换码一经系统发出无法回收，请勿泄露给他人，购买前请再次核对账号与所需地区。" },
    ],
    faqs: (r, c, cur) => [
      { q: "兑换时提示「此代码是在其他地区购买的 / Check the instructions」怎么办？", a: `这是微软检测到您当前账号区域或网络 IP 与【${c}】不一致。请先在微软账户个人资料将国家/地区改为【${c}】，并切换至对应地区的干净网络后打开浏览器无痕窗口访问 redeem.microsoft.com 重新兑换。` },
      { q: "余额礼品卡可以在 Windows 电脑上用吗？", a: "可以！Xbox 礼品卡充入的是您的 Microsoft 微软账户对应区域余额，在 Xbox 主机和 Windows 微软商店 / Xbox App 上完全通用。" },
      { q: "Xbox Game Pass Essential / Premium / Ultimate 有什么区别？", a: "Essential（原 Core）侧重主机联机与精选库；Premium/Standard 提供更丰富的主机游戏库；Ultimate 终极版则一站包含主机 + PC 全游戏库、首发大作、EA Play 与云游戏。" },
      { q: "兑换会员卡时微软要求绑定备用支付方式怎么办？", a: "部分区域订阅类代码兑换时，微软可能会询问是否开启定期账单（Recurring Billing），一般可在页面选择取消/跳过自动续费，或按微软页面提示完善对应区账单地址。" },
      { q: "余额充进去会过期吗？", a: "正规 Xbox 礼品卡兑换入微软账户后余额永久有效，不会过期；而标注月数的 Game Pass 会员卡兑换后则从当天起按对应月数计时。" },
      { q: "卡密遇到异常如何联系售后？", a: "请完整截取 redeem.microsoft.com 的错误提示（包含具体报错英文/中文代码），携带订单号联系在线客服，我们会迅速对接上游流水核验处理。" },
    ],
    specs: (name, r, c, code, cur, denom) => [
      ["商品名称", name],
      ["适用账号地区", `${c} (${code}) — 仅限${r} Microsoft / Xbox 账号`],
      ["可选规格 / 面额", denom],
      ["交付格式", "25 位 Microsoft / Xbox 官方数字兑换码（PIN），支付后自动发码"],
      ["支持平台", "Xbox Series X|S / Xbox One / Windows PC / redeem.microsoft.com"],
      ["售后保障", "正规直采零黑卡风险；一次性卡密发出后不支持无理由退换，异常码可核查兜底"],
    ],
  },

  nintendo: {
    key: "nintendo",
    brandName: "Nintendo eShop",
    shortName: "任天堂 eShop 卡",
    englishBadge: "Nintendo eShop 16-Digit Official PIN",
    tagline: "任天堂官方 16 位点卡 · Switch 买游戏、任亏券与 Switch Online 会员必备",
    introSummary: (r, c, cur) =>
      `适用于 ${c}区 (${cur}) Nintendo Account eShop 余额充值或 Switch Online 联机会员激活。杜绝黑卡 BAN 机隐患，轻松购入任亏券、第一方独占大作与 DLC，支持 Switch 全系列主机及网页端兑换。`,
    theme: {
      heroGradient: "from-[#99000B] via-[#D80010] to-[#5B0008]",
      heroGlowA: "bg-red-400/25",
      heroGlowB: "bg-rose-400/15",
      badgeClass: "border-red-300/35 bg-red-400/15 text-red-100",
      accentText: "text-[#D80010]",
      accentBgSoft: "bg-red-50/45",
      accentBorder: "border-red-200/85",
      accentIconBg: "bg-red-100 text-[#D80010]",
      buttonBg: "bg-[#D80010] hover:bg-[#B8000E]",
      codeText: "text-[#C80010]",
      guaranteeBorder: "border-red-200/90",
      guaranteeBg: "from-red-50 via-rose-50/35 to-white",
      guaranteeTitle: "text-red-900",
    },
    codeFormat: {
      title: "任天堂官方 16 位 eShop 兑换码交付格式",
      subtitle: "下单付款后系统实时直采并派发 16 位任天堂官方下载/充值序列号（通常以 B/C/E 开头）：",
      sampleCode: "B0XX-XXXX-XXXX-XXXX",
      sampleComment: "// Nintendo eShop 16 位官方兑换码（示例格式）",
      anatomy: ["① 16 位官方序列号", "② 零黑卡不 BAN 主机", "③ 自动匹配同区 eShop", "④ 余额入账无过期时间"],
      promises: ["坚决拒绝低价黑卡保护主机", "免外币卡/PayPal 直接买游戏", "支持 Switch / Switch 2 / 网页端"],
    },
    officialRedeemUrl: "https://ec.nintendo.com/redeem/",
    officialRedeemLabel: "前往任天堂官方网页 ec.nintendo.com/redeem",
    guarantees: [
      { title: "拒绝黑卡 · 守护主机安全", desc: "任天堂对黑卡盗刷打击极严（直接 BAN 号甚至 BAN 机）。本站 100% 正规持牌渠道直采，安心充主号。" },
      { title: "即买即得 · 7×24h 自动发码", desc: "支付成功后几秒至几十秒自动出码，新游发售零点抢先预载不用等人工。" },
      { title: "无忧售后 · 流水可追溯", desc: "若遇无法兑换情况，保留 Switch 报错代码截图与订单号联系客服，核实上游流水后妥善处理。" },
    ],
    highlights: (r, c) => [
      { title: "100% 正规白卡", tag: "拒绝 BAN 机", desc: "每一张 eShop 点卡均由正规海外渠道实时直采，远离淘宝低价黑卡带来的封号/封机隐患。" },
      { title: "任亏券 & 大作必备", tag: "买一换二更省", desc: "港服/日服/美服余额可直接购买任天堂游戏兑换券（任亏券），换两款第一方大作立省数百元。" },
      { title: "支持 Switch Online 会员", tag: "联机 & 云存档", desc: "可用余额开通或直接选购 Switch Online 会员卡，畅玩动森、喷射战士、马车联机与云备份。" },
      { title: "免绑海外信用卡", tag: "无拒付限制", desc: `无需申请${c}本地信用卡或解决 PayPal 锁区问题，输入 16 位代码余额即刻到账。` },
      { title: "主机 & 网页双端兑换", tag: "操作超简单", desc: "支持在 Switch 主机 eShop 或电脑/手机访问 ec.nintendo.com/redeem 快速粘贴兑换。" },
      { title: "覆盖 23 国热门服", tag: "港/日/美/巴齐全", desc: "一键切换港服、日服、美服、巴西低价区与欧服，满足不同服淘史低游戏需求。" },
    ],
    useCases: [
      {
        title: "任天堂第一方大作 & 任亏券",
        badge: "Switch 必玩",
        items: [
          { name: "塞尔达 / 马里奥 / 宝可梦 / 动森", desc: "数字版首发零点开玩，省去插拔卡带烦恼" },
          { name: "任天堂游戏兑换券（任亏券）", desc: "配合 Switch Online 会员，用余额买券兑换两款第一方神作超划算" },
        ],
      },
      {
        title: "Nintendo Switch Online 会员",
        badge: "联机刚需",
        items: [
          { name: "个人 / 家庭联机会员", desc: "畅玩斯普拉遁、马里奥赛车、大乱斗全球联机与云存档保护" },
          { name: "扩充包（含 N64 / GBA 经典库）", desc: "解锁怀旧经典游戏库与多款第一方 DLC 免费畅玩" },
        ],
      },
      {
        title: "eShop 史低特卖 & 独立精品",
        badge: "淘游党最爱",
        items: [
          { name: "巴西 / 墨西哥 / 波兰低价服", desc: "独立游戏与第三方大作常年史低价，搭配同区点卡省上加省" },
          { name: "港服 / 日服中文独占", desc: "中文版覆盖率最高，日系 RPG、乙女与二次元大作同步首发" },
        ],
      },
      {
        title: "DLC 扩充票与游戏内购",
        badge: "无缝直买",
        items: [
          { name: "宝可梦 / 异度神剑 / 火焰纹章 DLC", desc: "直接在对应游戏所属区 eShop 用余额购入扩充票" },
          { name: "堡垒之夜 / Apex / 独立小品", desc: "eShop 余额零门槛结账，无需反复输卡号" },
        ],
      },
    ],
    deviceTabs: {
      primaryLabel: "Switch 主机兑换",
      secondaryLabel: "手机 / 电脑网页兑换",
      primarySteps: (r, c, cur) => [
        { step: "01", title: `确认账号地区为【${c}】`, desc: `先在 accounts.nintendo.com 确认您的 Nintendo Account 国家/地区为【${c}】（注意：有余额时无法直接换区）。` },
        { step: "02", title: "进入主机 Nintendo eShop", desc: "在 Switch 主界面点击橙色购物袋图标进入 eShop，选择对应账号登录。" },
        { step: "03", title: "点击「输入序号（Enter Code）」", desc: "在左侧菜单最下方选择「输入序号 / Redeem Code」，输入本站发放的 16 位官方卡密。" },
        { step: "04", title: `确认 ${cur} 余额/会员入账`, desc: "核对金额或会员信息并点击确认，余额即刻到账，马上可以选购心仪大作。" },
      ],
      secondarySteps: (r, c, cur) => [
        { step: "01", title: "访问官方网页兑换站", desc: `手机或电脑打开 ec.nintendo.com/redeem 并登录地区为【${c}】的任天堂账号。` },
        { step: "02", title: "粘贴 16 位官方卡密", desc: "直接复制本站订单里的 16 位兑换码粘贴进输入框，免去手柄逐字输入的麻烦。" },
        { step: "03", title: "点击下一步核验", desc: `系统将展示对应的 ${cur} 充值金额或 Switch Online 会员时长。` },
        { step: "04", title: "秒同步至 Switch 主机", desc: "点击确认后即刻入账，打开 Switch eShop 即可看到更新后的余额。" },
      ],
    },
    warnings: (r, c, cur) => [
      { title: "1. 严格区分区服 & 换区清零提醒", desc: `本卡密仅限账号国家设置为【${c} (${cur})】的 Nintendo Account 使用。特别提醒：当账户内留有未花完的余额时，任天堂不允许随意切换国家/地区（或切换可能提示需清空余额），建议按需选购合适面额。` },
      { title: "2. 国行腾讯版 Switch 不适用", desc: "腾讯国行未解锁主机无法连接海外 Nintendo eShop，本商品仅适用于日版、港版、美版、欧版等海外版 Switch 主机及海外任天堂账号。" },
      { title: "3. 区分「余额点卡」与「Switch Online 会员卡」", desc: "下单前请确认商品标题：标有 Switch Online 的为联机会员兑换码，标有 eShop 面额的为商店余额卡。" },
    ],
    faqs: (r, c, cur) => [
      { q: "我的账号目前是美服，可以改区到港服/日服再兑换吗？", a: `前提是您的账号当前余额必须为 0 且没有开启自动续费订阅。若余额为 0，可先去 accounts.nintendo.com 将国家/地区改为【${c}】，再使用本【${r}】点卡充值。` },
      { q: "会买到黑卡导致我的 Switch 被 BAN 机吗？", a: "绝对不会。本站接入正规海外持牌数字卡密上游自动采购，每笔交易均有完整正规采购流水，彻底杜绝黑卡风险。" },
      { q: "为什么买任亏券的时候还是无法结账？", a: "购买「任天堂游戏兑换券（任亏券）」需要账号本身处于 Nintendo Switch Online 付费会员有效期内（7 天免费试用不含在内），请先开通正式会员再用余额买券。" },
      { q: "美服买游戏怎么避开消费税？", a: "如果使用美服 eShop 账号，在结账要求填写邮编（ZIP Code）时，填写美国免税州邮编（如俄勒冈 97201、特拉华 19801、新罕布什尔 03101）即可享受 0 消费税。" },
      { q: "充值卡有使用期限吗？", a: "建议收到卡密后第一时间兑换入账；一旦充入 Nintendo eShop 账户余额后，余额长期有效不过期。" },
      { q: "兑换提示错误代码（如 2813-xxxx）怎么办？", a: "多数情况是账号地区与点卡地区不符（如用日服号兑港服卡）。请先核对 accounts.nintendo.com 地区设置；若地区完全一致仍报错，请拍照保留完整报错代码联系客服核查。" },
    ],
    specs: (name, r, c, code, cur, denom) => [
      ["商品名称", name],
      ["适用账号地区", `${c} (${code}) — 仅限${r} Nintendo Account 账号`],
      ["可选规格 / 面额", denom],
      ["交付格式", "16 位任天堂官方 eShop 兑换码（PIN），付款后自动秒发"],
      ["支持主机", "海外版 Nintendo Switch / Switch OLED / Switch Lite / Switch 2（国行不适用）"],
      ["售后保障", "100% 正规白卡杜绝 BAN 机；一次性卡密发出后不支持无理由退换，异常可核实兜底"],
    ],
  },

  amazon: {
    key: "amazon",
    brandName: "Amazon 亚马逊",
    shortName: "亚马逊礼品卡",
    englishBadge: "Amazon Official Claim Code",
    tagline: "亚马逊官方礼品卡 Claim Code · 跨境海淘购物、Kindle 电子书与 Prime 会员首选",
    introSummary: (r, c, cur) =>
      `适用于 ${c}站 (${cur}) 亚马逊官网余额充值（或对应区域 Prime 会员）。免绑海外双币卡、无砍单拒付烦恼，充入 Gift Card Balance 后下单直抵货款与运费，支持全站自营及第三方商品。`,
    theme: {
      heroGradient: "from-[#131921] via-[#232F3E] to-[#1A202C]",
      heroGlowA: "bg-amber-400/25",
      heroGlowB: "bg-orange-500/20",
      badgeClass: "border-amber-300/35 bg-amber-400/15 text-amber-100",
      accentText: "text-amber-700",
      accentBgSoft: "bg-amber-50/50",
      accentBorder: "border-amber-200/85",
      accentIconBg: "bg-amber-100 text-amber-700",
      buttonBg: "bg-[#E47911] hover:bg-[#C9680B]",
      codeText: "text-amber-800",
      guaranteeBorder: "border-amber-200/90",
      guaranteeBg: "from-amber-50 via-orange-50/40 to-white",
      guaranteeTitle: "text-amber-950",
    },
    codeFormat: {
      title: "Amazon 官方 Claim Code 交付格式说明",
      subtitle: "支付成功后系统自动向正规渠道直采亚马逊官方 14 位礼品卡兑换码（Claim Code）：",
      sampleCode: "XXXX-XXXXXX-XXXX",
      sampleComment: "// Amazon Gift Card Claim Code 标准兑换格式（示例）",
      anatomy: ["① 14 位官方 Claim Code", "② 严格对应站点域名", "③ 充入 Gift Card Balance", "④ 余额长期有效自动抵扣"],
      promises: ["正规实体/数字授权渠道货源", "大幅降低新卡海淘风控砍单率", "下单秒发可随时查询复制"],
    },
    officialRedeemUrl: "https://www.amazon.co.jp/gc/redeem",
    officialRedeemLabel: "参考亚马逊礼品卡兑换入口（按所购站点域名访问）",
    guarantees: [
      { title: "纯净白卡货源防封号", desc: "亚马逊对来路不明的廉价黑卡/礼品卡极其敏感。本站全部采用正规渠道直采，保障买家账户信誉。" },
      { title: "免海外信用卡海淘", desc: "无需准备多币种外卡、无需担心银行风控拒付或外汇入账延迟，直接抵扣站点本币消费。" },
      { title: "自动发码 + 凭证核查", desc: "付款后自动出码，若遇站点兑换报错请第一时间保留完整截图联系客服核查。" },
    ],
    highlights: (r, c) => [
      { title: "日亚 / 德亚 / 新亚等 10 站", tag: "海淘热门站点", desc: `本卡专用于${c}亚马逊官方站点，满足日淘动漫手办数码、欧淘母婴厨具、海外直邮等多元消费。` },
      { title: "实物 + 数字商品通用", tag: "全站抵扣", desc: "余额可用于亚马逊自营与第三方实物海淘、Kindle 电子书、数字游戏代码及数字影音消费。" },
      { title: "多张叠加灵活结算", tag: "按需凑单", desc: "支持多张礼品卡连续充入账户余额，结账时自动抵扣商品价、国际运费及预估税费。" },
      { title: "远离黑卡冻结风险", tag: "正规直采", desc: "杜绝来源不明的低价代充/黑卡，守护您的亚马逊账号和历史订单安全。" },
      { title: "有效期超长省心", tag: "长期保值", desc: "亚马逊多数站点礼品卡余额有效期长达 10 年甚至永久有效（以对应站点官方条款为准）。" },
      { title: "7×24h 自动发码", tag: "抢购秒下单", desc: "遇到 Prime Day、黑五限时秒杀无需等人工发卡，支付完成秒提 Claim Code。" },
    ],
    useCases: [
      {
        title: "日亚 / 德亚 / 澳亚海淘好物",
        badge: "跨境购物主力",
        items: [
          { name: "数码 3C / 动漫周边 / 美妆药妆", desc: "日本站 amazon.co.jp 买手办、CD、日系护肤与电子产品超方便" },
          { name: "欧洲精品厨具 / 保健品 / 服饰", desc: "德国、西班牙、新加坡、澳洲站点官方直邮或转运无忧" },
        ],
      },
      {
        title: "Kindle 电子书 & 数字内容",
        badge: "秒买秒看",
        items: [
          { name: "外文原版书 / 日文漫画轻小说", desc: "日亚等站点 Kindle 商店余额直扣，免绑外卡轻松购书" },
          { name: "数字软件 / 电子版内容", desc: "站点内支持余额结算的数字出版物与正版软件" },
        ],
      },
      {
        title: "留学生 & 海外华人日常采购",
        badge: "生活日用",
        items: [
          { name: "留学教材 / 宿舍日用 / 家电", desc: "在德国、澳洲、日本、新加坡等地留学的日常网购刚需" },
          { name: "亲友送礼 / 节日心意卡", desc: "直接将礼品卡发给当地亲友，自由选购心仪商品" },
        ],
      },
      {
        title: "大促秒杀 & 余额提前蓄水",
        badge: "抢购不掉链",
        items: [
          { name: "Prime Day / 黑五 / 年末大促", desc: "提前充入 Gift Card Balance，抢购结账快人一步" },
          { name: "Amazon Prime 会员", desc: "印度等站点亦提供官方 Prime 会员订阅卡，享免邮与 Prime Video" },
        ],
      },
    ],
    deviceTabs: {
      primaryLabel: "网页端兑换",
      secondaryLabel: "Amazon App 兑换",
      primarySteps: (r, c, cur) => [
        { step: "01", title: `访问【${c}】亚马逊官网`, desc: `请务必打开对应国家的亚马逊独立域名（如日本站 amazon.co.jp、德国站 amazon.de、新加坡站 amazon.sg 等）。` },
        { step: "02", title: "进入 Gift Cards 兑换页", desc: "登录后点击顶部「Account & Lists」→「Gift cards」→「Redeem a Gift Card」。" },
        { step: "03", title: "粘贴官方 Claim Code", desc: "复制本站「我的订单」发放的兑换码，粘贴进输入框后点击「Apply to your balance」。" },
        { step: "04", title: `${cur} 余额入账即可下单`, desc: "页面提示余额已到账后，购物结账时勾选「Use your Gift Card Balance」自动抵扣。" },
      ],
      secondarySteps: (r, c, cur) => [
        { step: "01", title: `切换 App 国家至【${c}】`, desc: "打开 Amazon Shopping App，在底部菜单或设置里确认当前国家/地区与币种为对应站点。" },
        { step: "02", title: "进入账户 → 管理礼品卡余额", desc: "点击「Your Account」→「Manage gift card balance」→「Redeem another gift card」。" },
        { step: "03", title: "输入官方 Claim Code", desc: "粘贴卡密点击「Apply to your balance」，系统实时入账。" },
        { step: "04", title: `使用 ${cur} 余额结账`, desc: "选购商品结算时将自动优先使用您的礼品卡余额。" },
      ],
    },
    warnings: (r, c, cur) => [
      { title: "1. 严格区分亚马逊各国家独立站点！", desc: `亚马逊不同国家网站账号/余额彼此完全独立。本卡仅限【${c}站 (${cur})】使用，无法在美亚 amazon.com 或其他国家站点兑换，请务必核对商品标题中的站点域名！` },
      { title: "2. 新注册亚马逊账号请勿一次性大额充值", desc: "亚马逊风控系统对刚注册的新号立刻充入大额礼品卡并下单高价值电子产品极其敏感。建议养号并绑定真实收货信息后，先小额试单再逐步增加消费金额。" },
      { title: "3. 严禁用于购买其他礼品卡", desc: "根据亚马逊官方规则，Gift Card Balance 余额通常不能用来再次购买亚马逊或第三方品牌礼品卡。" },
    ],
    faqs: (r, c, cur) => [
      { q: `这张${r}亚马逊礼品卡可以在美亚 amazon.com 用吗？`, a: `不可以！亚马逊各国家站点余额不互通。本商品仅限【${c} (${cur})】对应站点使用（例如日亚仅限 amazon.co.jp，德亚仅限 amazon.de）。` },
      { q: "为什么买亚马逊卡特别强调不要贪图 6 折/7 折低价卡？", a: "市面上明显低于面值汇率太多的亚马逊卡几乎都是盗刷信用卡购买的黑卡，充入账号后极易被亚马逊直接锁号并清零余额。本站采用正规持牌通道原价直采，保障账号安全。" },
      { q: "新注册的日亚/德亚账号充值安全吗？", a: "请先用稳定纯净的网络注册并完善账单/收货地址，建议首单先小额充值试买普通日用品，切勿刚注册几分钟就连续充入数张大额礼品卡。" },
      { q: "余额用不完会过期吗？", a: "日本站、德国站等主流站点礼品卡余额通常具有长达 10 年或永久有效期（具体以对应站点官方条款为准），本次未花完的余额会自动留在账户下次抵扣。" },
      { q: "礼品卡余额可以抵扣国际运费和进口税吗？", a: "可以！在支持直邮中国的商品结账时，Gift Card Balance 会自动连同商品价格、运费及预估税费一并抵扣。" },
      { q: "如果兑换码提示无法使用怎么处理？", a: "请第一时间确认您访问的是否为对应国家站点域名，并保留包含站点 URL 与报错提示的完整截图联系在线客服核查。" },
    ],
    specs: (name, r, c, code, cur, denom) => [
      ["商品名称", name],
      ["适用亚马逊站点", `${c} (${code}) 专属站点 — 仅限该国独立域名兑换`],
      ["可选规格 / 面额", denom],
      ["交付格式", "Amazon 官方数字 Claim Code（PIN），付款后自动发放"],
      ["适用商品", "对应站点实物海淘、Kindle 电子书、数字内容及运费税费抵扣"],
      ["售后保障", "正规白卡渠道防封号；一次性兑换码发出后不支持无理由退换"],
    ],
  },

  airbnb: {
    key: "airbnb",
    brandName: "Airbnb 爱彼迎",
    shortName: "Airbnb 礼品卡",
    englishBadge: "Airbnb Official Travel Gift Card",
    tagline: "爱彼迎全球民宿 & 体验官方礼品卡 · 余额永不过期 · 支持多张叠加预订",
    introSummary: (r, c, cur) =>
      `适用于 ${c}区 (${cur}) Airbnb 账户余额充值。出境自由行、海外留学过渡住宿与商旅出差神器，无需担心国内双币卡境外验证失败，充入账户后永不过期且支持多张叠加支付房费。`,
    theme: {
      heroGradient: "from-[#9F1239] via-[#E11D48] to-[#881337]",
      heroGlowA: "bg-rose-400/25",
      heroGlowB: "bg-pink-400/20",
      badgeClass: "border-rose-300/35 bg-rose-400/15 text-rose-100",
      accentText: "text-[#E11D48]",
      accentBgSoft: "bg-rose-50/45",
      accentBorder: "border-rose-200/85",
      accentIconBg: "bg-rose-100 text-[#E11D48]",
      buttonBg: "bg-[#E11D48] hover:bg-[#BE123C]",
      codeText: "text-[#BE123C]",
      guaranteeBorder: "border-rose-200/90",
      guaranteeBg: "from-rose-50 via-pink-50/35 to-white",
      guaranteeTitle: "text-rose-900",
    },
    codeFormat: {
      title: "Airbnb 官方礼品卡 PIN 码交付格式说明",
      subtitle: "支付完成后系统自动直采并交付爱彼迎官方电子礼品卡代码（可在网页或 App 一键充值）：",
      sampleCode: "AIRB-XXXX-XXXX-XXXX",
      sampleComment: "// Airbnb Digital Gift Card PIN（示例格式，以实际官方发码为准）",
      anatomy: ["① 官方电子礼品卡 PIN", "② 绑定对应结算地区", "③ 余额永不过期可跨次用", "④ 支持预订全球任意民宿"],
      promises: ["官方持牌渠道拒绝盗刷卡", "订房免外卡 3DS 拒付烦恼", "支持支付宝/微信/USDT 结算"],
    },
    officialRedeemUrl: "https://www.airbnb.com/gift",
    officialRedeemLabel: "前往 Airbnb 官方 airbnb.com/gift 兑换",
    guarantees: [
      { title: "官方正版 · 住得安心", desc: "拒绝黑卡代订导致临入住被取消订单！正规渠道直采官方卡密，用您本人账号直接订房。" },
      { title: "余额永不过期 · 可多张叠加", desc: "爱彼迎官方礼品卡一经兑换入账永不过期，长途大额住宿可分多次购买累加余额支付。" },
      { title: "全球房源通用预订", desc: "充入对应币种账户余额后，可预订全球 220+ 国家和地区的精品民宿、别墅与当地体验。" },
    ],
    highlights: (r, c) => [
      { title: "覆蓋 22 国主流出行币种", tag: "美/英/加/澳/欧", desc: `本卡专用于${c}区域 Airbnb 账户，支持多档大额面值，出境游/留学订房省心便捷。` },
      { title: "余额永不过期", tag: "长期有效", desc: "兑换进您的 Airbnb 账户后不设过期日，本次旅行用不完下次出游继续自动抵扣。" },
      { title: "支持多张叠加订长租", tag: "无压力大额付", desc: "预订多晚高端民宿或留学首月过渡房时，可连续充入多张礼品卡凑齐房费。" },
      { title: "本人账号直订更安全", tag: "拒绝代订风险", desc: "告别第三方代订导致的房东核验纠纷与临时砍单，所有行程与保障归您本人账号所有。" },
      { title: "民宿 + 当地体验全适用", tag: "一卡玩转", desc: "不仅能抵扣全球房源住宿与清洁服务费，还可直接支付 Airbnb Experiences 特色体验。" },
      { title: "7×24h 自动发码", tag: "临时订房救急", desc: "人在海外临时续住或改行程，随时下单秒提 PIN 码入账，无需等待人工回复。" },
    ],
    useCases: [
      {
        title: "出境自由行 & 特色民宿预订",
        badge: "全球房源可用",
        items: [
          { name: "日韩欧美精品民宿 / 度假别墅", desc: "充入对应区账户余额后，可预订全球各地任意 Airbnb 房源" },
          { name: "家庭亲子 / 好友拼团大房型", desc: "多张礼品卡叠加支付大额房费，分摊更轻松" },
        ],
      },
      {
        title: "留学生初到过渡 & 短期旅居",
        badge: "留学刚需",
        items: [
          { name: "开学前 1~4 周过渡短租", desc: "刚落地海外还没有当地银行卡？礼品卡余额直接订好落脚处" },
          { name: "数字游民旅居 / 跨国出差", desc: "按需充值控制预算，订单账单清晰方便报销" },
        ],
      },
      {
        title: "Airbnb Experiences 特色体验",
        badge: "地道玩法",
        items: [
          { name: "当地向导城市漫步 / 美食课", desc: "余额同样支持预订各地达人主办的特色体验活动" },
          { name: "小众户外探险与摄影跟拍", desc: "一站式余额抵扣，无需重复绑定境外信用卡" },
        ],
      },
      {
        title: "高格调旅行礼赠",
        badge: "送礼体面",
        items: [
          { name: "蜜月 / 毕业 / 节日旅行基金", desc: "把官方电子兑换码送给海外亲友或即将出行的朋友，自由挑选目的地" },
          { name: "余额永不过期不浪费", desc: "随时规划出行，不强制限定入住日期" },
        ],
      },
    ],
    deviceTabs: {
      primaryLabel: "网页端兑换",
      secondaryLabel: "Airbnb App 兑换",
      primarySteps: (r, c, cur) => [
        { step: "01", title: "确认账号所在国家/地区", desc: `请确认您的 Airbnb 账号所在国家/付款方式地区与【${c} (${cur})】匹配（Airbnb 礼品卡按居住地/币种发行）。` },
        { step: "02", title: "打开 airbnb.com/gift", desc: "登录您的 Airbnb 账号后，进入官方礼品卡页面点击「兑换礼品卡（Redeem a gift card）」。" },
        { step: "03", title: "粘贴官方 PIN 代码", desc: "输入本站「我的订单」交付的礼品卡 PIN 码并点击「兑换」。" },
        { step: "04", title: `${cur} 余额永久入账`, desc: "兑换成功后余额保存在「付款与收款 → 礼品卡余额」，下次订房结账时自动抵扣。" },
      ],
      secondarySteps: (r, c, cur) => [
        { step: "01", title: "打开 Airbnb 手机 App", desc: `登录您的【${c}】Airbnb 账号，点击右下角「个人资料（Profile）」。` },
        { step: "02", title: "进入「付款和收款」", desc: "选择「付款和收款（Payments & payouts）」→「礼金券和礼品卡（Credits & coupons）」。" },
        { step: "03", title: "点击「添加礼品卡」", desc: "输入订单内的 PIN 码完成核验并添加至账户。" },
        { step: "04", title: `订房自动抵扣 ${cur} 房费`, desc: "预订任何房源或体验时，系统会自动优先从礼品卡余额中扣款。" },
      ],
    },
    warnings: (r, c, cur) => [
      { title: "1. 严格匹配账户发行地区（重要！）", desc: `根据 Airbnb 官方规则，礼品卡通常要求兑换人的账号居住地/支付方式地区位于【${c} (${cur})】。如果您持有的是中国大陆身份证认证的国区账号，可能无法兑换海外区 Airbnb 礼品卡，请务必确认您的账号支持【${c}】礼品卡后再下单！` },
      { title: "2. 不可用于超 28 晚长租或修改历史订单", desc: "Airbnb 官方规定：礼品卡余额适用于大多数 28 晚以下的常规住宿与体验预订，通常不能直接用于 28 晚及以上的月租订单或补缴历史已确认订单的差价。" },
      { title: "3. 一次性数字卡密不可退换", desc: "礼品卡一经发出无法撤销，购买前请再次核对账号地区与所需面额。" },
    ],
    faqs: (r, c, cur) => [
      { q: "我的 Airbnb 账号能用这张海外礼品卡吗？", a: `Airbnb 礼品卡受发行国家/地区限制，本卡专供【${c} (${cur})】地区账户使用（通常需要对应国家支付方式或居住地配置）。如果不确定，建议先买最小面额测试或咨询客服。` },
      { q: `充入 ${cur} 礼品卡余额后，可以预订其他国家的民宿吗？`, a: "可以！地区限制仅针对「账户归属地兑换礼品卡」这一步；一旦成功入账，余额可以预订全球各地（如日本、泰国、欧洲、美国等）的 Airbnb 房源，系统会自动按汇率折算。" },
      { q: "Airbnb 礼品卡有有效期吗？", a: "官方 Airbnb 礼品卡兑换入账后永不过期，未用完的余额会一直保留在您的账户里。" },
      { q: "订房时余额不够总房费怎么办？", a: "支持混合支付！结账时系统会先扣除全部礼品卡余额，剩余差额部分再用其他方式补齐，或者您也可以多买一张礼品卡补足余额。" },
      { q: "如果取消预订，用礼品卡付的钱会退回哪里？", a: "按照对应房源的退订政策，可退还金额将原路退回至您的 Airbnb 礼品卡余额，不会丢失。" },
      { q: "兑换时提示地区不符合或卡密异常怎么办？", a: "若提示地区不符合属于账号区域限制；若同区账号提示代码无效，请保留完整报错页面截图与订单号联系在线客服核查。" },
    ],
    specs: (name, r, c, code, cur, denom) => [
      ["商品名称", name],
      ["适用发行地区", `${c} (${code}) — 需对应${r} Airbnb 账户兑换`],
      ["可选规格 / 面额", denom],
      ["交付格式", "Airbnb 官方电子礼品卡 PIN 码，支付后自动发放"],
      ["余额有效期", "兑换入账后永不过期，支持多张叠加与全球房源预订"],
      ["售后保障", "正规直采本人账号直订；一次性卡密发出后不支持无理由退换"],
    ],
  },

  minecraft: {
    key: "minecraft",
    brandName: "Minecraft 我的世界",
    shortName: "Minecraft 国际版",
    englishBadge: "Minecraft Official 25-Digit Code",
    tagline: "Mojang / 微软官方正版激活码 & Minecoins 国际版点数卡 · 畅玩全球正版服务器",
    introSummary: (r, c, cur) =>
      `覆盖 Minecraft Java & Bedrock 国际版正版游戏激活码及 Minecoins 商城点数卡（${c} / ${cur}）。绑定您本人微软账号永久拥有正版资格，畅玩 Hypixel 等国际大服与官方市场海量模组皮肤！`,
    theme: {
      heroGradient: "from-[#1B4332] via-[#2D6A4F] to-[#1A2E22]",
      heroGlowA: "bg-emerald-400/25",
      heroGlowB: "bg-green-400/20",
      badgeClass: "border-emerald-300/35 bg-emerald-400/15 text-emerald-100",
      accentText: "text-[#2D6A4F]",
      accentBgSoft: "bg-emerald-50/45",
      accentBorder: "border-emerald-200/85",
      accentIconBg: "bg-emerald-100 text-[#2D6A4F]",
      buttonBg: "bg-[#2D6A4F] hover:bg-[#1B4332]",
      codeText: "text-[#1B4332]",
      guaranteeBorder: "border-emerald-200/90",
      guaranteeBg: "from-emerald-50 via-green-50/40 to-white",
      guaranteeTitle: "text-emerald-950",
    },
    codeFormat: {
      title: "Minecraft 官方 25 位激活码交付格式",
      subtitle: "付款后系统实时直采并派发微软 / Mojang 官方 25 位正版激活码（支持官网直接兑换）：",
      sampleCode: "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX",
      sampleComment: "// Minecraft / Microsoft 官方 25 位正版兑换码（示例格式）",
      anatomy: ["① 25 位官方正版代码", "② 绑定本人微软账号", "③ 永久入库非租号/黑号", "④ 畅连全球正版大服"],
      promises: ["本人微软主号直接激活永久有效", "远离租号/共享号随时改密风险", "7×24h 支付后自动秒发"],
    },
    officialRedeemUrl: "https://www.minecraft.net/en-us/redeem",
    officialRedeemLabel: "前往 Minecraft 官网 minecraft.net/redeem 兑换",
    guarantees: [
      { title: "本人账号永久正版入库", desc: "区别于廉价黑号或共享成品号，使用官方激活码直接激活到您自己的 Microsoft 账号，永不找回。" },
      { title: "官方正版渠道直采", desc: "正规持牌上游自动采购，支持正常改名、换皮肤、登录官方启动器与第三方主流启动器（PCL2 / HMCL）。" },
      { title: "极速秒发 + 售后核查", desc: "支付完成后秒级发货；若遇区域或兑换疑问可随时联系在线客服协助排查。" },
    ],
    highlights: (r, c) => [
      { title: "正版永久所有权", tag: "非共享黑号", desc: "官方 25 位激活码直接绑定到您的个人微软账号，随时改 ID、换皮肤、重装系统云端永久保留。" },
      { title: "畅玩 Hypixel 等国际大服", tag: "正版验证通过", desc: "拥有官方正版通行证后，无障碍进入 Hypixel、2b2t、Wynncraft 等全球顶级正版联机服务器。" },
      { title: "完美兼容主流启动器", tag: "PCL2 / HMCL", desc: "除官方 Minecraft Launcher 外，完整支持 PCL2、HMCL、MultiMC、Prism 等玩家必备启动器微软正版登录。" },
      { title: "提供 Minecoins 国际点数", tag: "市场模组皮肤", desc: "基岩版玩家亦可选购 Minecoins 点数卡，在官方 Marketplace 购入精选材质包、联动地图与皮肤。" },
      { title: "免绑海外信用卡", tag: "支付宝/微信直付", desc: "告别官网外币卡扣款失败，人民币一键结算秒提正版代码。" },
      { title: "7×24h 自动发货", tag: "随时开服", desc: "周末假期和朋友临时约联机，下单即刻拿到激活码马上进服开挖。" },
    ],
    useCases: [
      {
        title: "Minecraft Java 国际版",
        badge: "PC 模组 & 大服首选",
        items: [
          { name: "海量免费 Mod 整合包", desc: "支持 Forge / Fabric / NeoForge 成千上万款工业、魔法、光影整合包" },
          { name: "全球正版联机服务器", desc: "Hypixel 起床战争、空岛生存、SMP 好友正版验证服畅通无阻" },
        ],
      },
      {
        title: "Java & Bedrock 双版本合集",
        badge: "跨平台联机",
        items: [
          { name: "一次激活双端畅玩", desc: "PC 端同时拥有 Java 版与基岩版，支持与手机/主机好友跨平台联机" },
          { name: "官方启动器一站管理", desc: "登录 Microsoft 账号即可自动同步更新最新版本" },
        ],
      },
      {
        title: "Minecoins 国际版点数",
        badge: "基岩版商城货币",
        items: [
          { name: "官方 Marketplace 正版联动", desc: "购入星战、海绵宝宝、侏罗纪等官方授权地图与精良皮肤包" },
          { name: "Realms 领域服 & 动作表情", desc: "丰富角色外观装扮，手机/PC/主机基岩版跨设备同步点数" },
        ],
      },
      {
        title: "学生与好友送礼佳品",
        badge: "永不过时神作",
        items: [
          { name: "直接发送 25 位激活码", desc: "无需索要对方密码，收到激活码充进自己的微软账号即可激活" },
          { name: "远离黑号被封尴尬", desc: "正规激活码杜绝淘宝低价黑号玩几天就失效的糟心体验" },
        ],
      },
    ],
    deviceTabs: {
      primaryLabel: "Minecraft 官网兑换（推荐）",
      secondaryLabel: "微软官方兑换页",
      primarySteps: (_r, c) => [
        { step: "01", title: "准备个人微软账号", desc: `先登录 account.microsoft.com 确认您的个人微软账号地区与商品版本（${c}）匹配。` },
        { step: "02", title: "打开 minecraft.net/redeem", desc: "访问 Minecraft 官方兑换页，登录您的 Microsoft 账号并选择对应的「Java / Bedrock / Minecoins」兑换框。" },
        { step: "03", title: "粘贴 25 位正版码", desc: "复制本站「我的订单」交付的 25 位激活码粘贴进去并点击「Redeem」。" },
        { step: "04", title: "启动游戏畅玩正版", desc: "兑换成功后打开官方启动器（或 PCL2 / HMCL）登录该微软账号，设置游戏名即可开始游玩！" },
      ],
      secondarySteps: (_r, c) => [
        { step: "01", title: "访问 redeem.microsoft.com", desc: `使用浏览器登录您准备绑定正版资格的 Microsoft 账号（核对地区：${c}）。` },
        { step: "02", title: "输入 25 位代码", desc: "直接粘贴订单内的 25 位兑换码，系统会自动识别 Minecraft 游戏版本或 Minecoins 数量。" },
        { step: "03", title: "确认兑换入库", desc: "点击确认后即永久绑定至当前微软账号。" },
        { step: "04", title: "安装启动器登录", desc: "在 Microsoft Store 下载 Minecraft Launcher 登录即可下载游玩。" },
      ],
    },
    warnings: (r, c) => [
      { title: "1. 务必区分「游戏激活码」与「Minecoins 点数卡」", desc: "下单前请仔细查看商品标题：标注 Java / Java & Bedrock 的是正版游戏本体激活码；标注 Minecoins 的是游戏内商城消费点数（需先拥有基岩版游戏本体才能在游戏内花掉）。" },
      { title: "2. 请确认版本地区要求", desc: `标注「国际版 (XI)」的通常适用于大多数海外区域微软账号；标注具体国家（如【${c}】）的请务必先将微软账号国家/地区调整为对应区域再兑换，避免提示跨区限制。` },
      { title: "3. 网易国服不通用", desc: "本商品为 Mojang / Microsoft 官方正版国际服产品，不能用于网易代理的中国版我的世界。" },
    ],
    faqs: (_r, c) => [
      { q: "激活码激活后，可以登录 PCL2、HMCL 等第三方启动器吗？", a: "完全可以！激活码会将正版资格直接写入您的 Microsoft 微软账号，之后无论是官方启动器还是 PCL2 / HMCL，选择「微软登录」即可畅玩。" },
      { q: "和网上二三十块的低价成品号有什么区别？", a: "低价号多为盗号或共享黑号，随时可能被原号主找回或被封禁；本站发售的官方 25 位激活码直接绑定到您自己的微软账号上，100% 永久独享、安全无忧。" },
      { q: "Minecoins 点数卡可以当成游戏本体用来激活游戏吗？", a: "不可以！Minecoins 仅用于 Minecraft 基岩版内置商城（Marketplace）购买皮肤、材质包、地图与模组，若您还没有正版游戏本体，请先选购「Minecraft Java 国际版激活码」。" },
      { q: "购买后提示地区不匹配怎么办？", a: `请登录 account.microsoft.com 将个人资料中的国家/地区修改为商品对应的区域（${c}，国际版常见建议美区），并刷新网络后在浏览器无痕模式重试兑换。` },
      { q: "可以改游戏昵称和换皮肤吗？", a: "可以！正版激活后可随时在 minecraft.net 个人主页免费修改游戏 ID（每 30 天可改一次）并自由上传自定义皮肤。" },
      { q: "收到卡密无法兑换怎么申请售后？", a: "请保留完整的官网兑换报错截图（含报错信息及账号区域设置）和订单号，联系下方在线客服核验上游流水。" },
    ],
    specs: (name, r, c, code, cur, denom) => [
      ["商品名称", name],
      ["适用区域 / 版本", `${c} (${code}) · 官方正版国际服（不支持网易中国版）`],
      ["可选规格 / 面额", denom],
      ["交付格式", "25 位 Microsoft / Mojang 官方正版兑换码，支付后自动秒发"],
      ["支持平台", "Windows / macOS / Linux（Java 版）及全平台基岩版（视所选 SKU）"],
      ["售后保障", "本人微软账号永久绑定；一次性数字代码发出后不支持无理由退换"],
    ],
  },

  blizzard: {
    key: "blizzard",
    brandName: "Blizzard 暴雪战网 Battle.net",
    shortName: "暴雪战网点卡",
    englishBadge: "Battle.net Official Balance PIN",
    tagline: "暴雪战网国际服官方余额卡 & 魔兽时间卡 · 魔兽世界 / 暗黑4 / 炉石 / 守望先锋通充",
    introSummary: (r, c, cur) =>
      `适用于 ${c} (${cur}) 暴雪战网国际服 Battle.net 账户余额充值（或对应区域魔兽世界 60 天游戏时间）。免外币卡直充战网点，畅买《魔兽世界》月卡资料片、《暗黑破坏神4》《炉石传说》《守望先锋2》礼包！`,
    theme: {
      heroGradient: "from-[#061326] via-[#0B294D] to-[#0A192F]",
      heroGlowA: "bg-sky-400/25",
      heroGlowB: "bg-cyan-400/20",
      badgeClass: "border-sky-300/35 bg-sky-400/15 text-sky-100",
      accentText: "text-sky-700",
      accentBgSoft: "bg-sky-50/50",
      accentBorder: "border-sky-200/85",
      accentIconBg: "bg-sky-100 text-sky-700",
      buttonBg: "bg-sky-600 hover:bg-sky-700",
      codeText: "text-sky-800",
      guaranteeBorder: "border-sky-200/90",
      guaranteeBg: "from-sky-50 via-blue-50/35 to-white",
      guaranteeTitle: "text-sky-900",
    },
    codeFormat: {
      title: "Battle.net 暴雪战网官方兑换码交付格式",
      subtitle: "付款后系统自动直采暴雪国际服官方平衡卡/时间卡兑换码（支持网页端与战网客户端一键兑换）：",
      sampleCode: "XXXX-XXXX-XXXXXX-XXXX-XXXX",
      sampleComment: "// Blizzard Battle.net Balance / Game Time Code（示例格式）",
      anatomy: ["① 战网官方数字代码", "② 严格匹配战网币种区", "③ 充入战网余额即刻到账", "④ 暴雪全家桶跨游戏通用"],
      promises: ["正规海外渠道杜绝黑卡封号", "国际服免绑外卡轻松充值", "7×24h 支付后全自动秒发"],
    },
    officialRedeemUrl: "https://account.battle.net/overview",
    officialRedeemLabel: "前往暴雪战网官网 account.battle.net 兑换",
    guarantees: [
      { title: "官方直采零封号风险", desc: "全部卡密源自海外正规持牌渠道，远离黑卡代充导致的战网封号或负余额锁定。" },
      { title: "暴雪全家桶全系通用", desc: "战网余额充入后，可在魔兽世界、暗黑破坏神 4、炉石传说、守望先锋 2 等游戏商城自由消费。" },
      { title: "自动发码 + 核验保障", desc: "无需排队等待人工代充，不索要战网账号密码，自己亲手充入更安全。" },
    ],
    highlights: (r, c) => [
      { title: "美服 / 欧服主流大区", tag: "国际服刚需", desc: `专供【${c}】国际服战网账号使用，直充官方余额，不经过第三方代登账号。` },
      { title: "魔兽月卡 & 资料片直买", tag: "艾泽拉斯必备", desc: "余额可直接购入《魔兽世界》正式服/怀旧服游戏时间、资料片典藏包、时光徽章与坐骑服务。" },
      { title: "暗黑 4 / 炉石 / OW2 全通", tag: "一卡全玩", desc: "支持购买《暗黑破坏神 4》本体/DLC/白金币、《炉石传说》预购合集及《守望先锋 2》战令金币。" },
      { title: "零密码泄露风险", tag: "自助充值", desc: "全程无需把您的战网账号密码交给任何人，拿到卡密自己在暴雪官网粘贴兑换即可。" },
      { title: "免海外双币卡", tag: "结算便捷", desc: "无需海外银行卡或外区 PayPal，支付宝 / 微信 / USDT / 站内余额一键秒买。" },
      { title: "7×24h 全自动秒发", tag: "开荒不掉队", desc: "新赛季新版本上线即买即充，不用等人工客服上线。" },
    ],
    useCases: [
      {
        title: "魔兽世界 World of Warcraft",
        badge: "正式服 & 怀旧服",
        items: [
          { name: "60 天游戏时间 / 资料片升级", desc: "余额直接购买游戏时间、地心之战等新资料片与角色转服服务" },
          { name: "战网商城坐骑 / 时光徽章", desc: "官方余额结算秒到账，告别国际服支付风控" },
        ],
      },
      {
        title: "暗黑破坏神 4 & 暗黑 2 重制版",
        badge: "刷宝党必备",
        items: [
          { name: "游戏本体 / 憎恨之躯等资料片", desc: "直接用战网余额购买完整版与赛季通行证" },
          { name: "白金币 Platinum 商城外观", desc: "选购限定幻化护甲与坐骑外观" },
        ],
      },
      {
        title: "炉石传说 Hearthstone",
        badge: "新版本预购",
        items: [
          { name: "扩展包超级合集 / 符文石", desc: "新版本预购卡包、酒馆战棋礼遇与皮肤合集直接抵扣" },
          { name: "免跨区外卡烦恼", desc: "美服/欧服炉石老玩家稳定充值的最稳方案" },
        ],
      },
      {
        title: "守望先锋 2 & 动视暴雪精选",
        badge: "战网全家桶",
        items: [
          { name: "守望先锋金币 / 高级战令", desc: "购买赛季神话皮肤与联动外观组合包" },
          { name: "使命召唤 / 星际争霸 / 魔兽争霸", desc: "暴雪战网商城内支持余额结算的全部数字产品" },
        ],
      },
    ],
    deviceTabs: {
      primaryLabel: "网页端兑换（推荐）",
      secondaryLabel: "Battle.net 客户端",
      primarySteps: (r, c, cur) => [
        { step: "01", title: `核对战网账号结算币种为 ${cur}`, desc: `登录 account.battle.net，在账号详情确认您的注册国家/结算货币与【${c} (${cur})】一致。` },
        { step: "02", title: "找到「兑换代码（Redeem a Code）」", desc: "在账号概览页（Account Overview）顶部即可看到「兑换代码」输入框。" },
        { step: "03", title: "粘贴官方卡密", desc: "复制本站「我的订单」内自动发放的兑换码，粘贴进输入框并点击「兑换代码」。" },
        { step: "04", title: `${cur} 余额/时间秒入账`, desc: "确认兑换信息后余额或游戏时间即刻生效，立即进入战网消费！" },
      ],
      secondarySteps: (r, c, cur) => [
        { step: "01", title: "打开 Battle.net 桌面客户端", desc: `登录您的【${c}】国际服战网账号。` },
        { step: "02", title: "进入「商店」→「兑换代码」", desc: "点击顶部「商店（Shop）」标签，在右上角选择「服务 → 兑换代码（Redeem a Code）」。" },
        { step: "03", title: "输入官方兑换码", desc: "粘贴订单内获取的卡密并确认提交。" },
        { step: "04", title: `查收 ${cur} 战网点数`, desc: "右上角战网余额实时刷新，即可在客户端内直接购买游戏或道具。" },
      ],
    },
    warnings: (r, c, cur) => [
      { title: "1. 严格区分美服 (USD) / 欧服 (EUR) / 亚服与国服！", desc: `暴雪战网礼品卡严格按账号注册地区与钱包币种隔离。本商品为【${c} / ${cur}】专用卡密，不能充入网易中国国服战网、台湾亚服（TWD）或其他不同币种的战网账号！` },
      { title: "2. 战网余额上限提醒", desc: "暴雪官方对未绑定安全令与已绑定安全令的战网钱包余额设有不同上限，大额充值前请确保当前余额未达上限。" },
      { title: "3. 区分「余额卡」与「魔兽 60 天时间卡」", desc: "选购时请核对标题与 SKU 名称：Battle.net 余额卡为通用点数，World of Warcraft 60 天时间卡则专用于充值魔兽世界游戏时间。" },
    ],
    faqs: (r, c, cur) => [
      { q: "我的国服战网账号或者台服（亚服）账号能用吗？", a: `不能！暴雪战网国服、台服(TWD)、美服(USD)、欧服(EUR) 钱包币种完全独立。本卡仅限结算币种为【${cur}】的【${c}】战网账号使用。` },
      { q: "美服余额可以买《魔兽世界》月卡吗？", a: "可以！充入战网余额后，在暴雪商城搜索「Game Time（60 Days）」即可直接用战网余额购买非自动续费的 60 天游戏时间，无需绑定信用卡。" },
      { q: "充完余额多久能到账？安全吗？", a: "兑换成功后通常实时到账（暴雪极少数情况下有 1-3 小时风控审核期）。本站 100% 正规渠道白卡直采，不索要账号密码，安全稳定。" },
      { q: "为什么战网商店里有些自动订阅看不到余额支付选项？", a: "暴雪的「循环自动续费订阅（Subscription）」通常要求绑卡，如果您想纯用战网余额付款，请选择一次性购买的「60 Days Game Time（游戏时间）」或游戏内商城道具。" },
      { q: "卡密有有效期吗？", a: "建议购买后尽快兑换入账；一旦入账成为您的 Battle.net Balance 余额，长期有效。" },
      { q: "兑换提示币种不匹配或错误怎么办？", a: "请先在 account.battle.net 核对账号注册国家与币种；若完全匹配仍报错，请完整截图联系在线客服核验处理。" },
    ],
    specs: (name, r, c, code, cur, denom) => [
      ["商品名称", name],
      ["适用战网大区", `${c} (${code}) — 仅限结算币种为 ${cur} 的国际服战网账号`],
      ["可选规格 / 面额", denom],
      ["交付格式", "Blizzard Battle.net 官方数字兑换码（PIN），支付后自动发码"],
      ["适用游戏", "魔兽世界 / 暗黑破坏神 4 / 炉石传说 / 守望先锋 2 等战网全系游戏"],
      ["售后保障", "正规直采拒绝黑卡；一次性数字卡密发出后不支持无理由退换"],
    ],
  },

  twitch: {
    key: "twitch",
    brandName: "Twitch 直播平台",
    shortName: "Twitch 礼品卡",
    englishBadge: "Twitch Official Gift Card PIN",
    tagline: "Twitch 官方礼品卡 · 订阅喜爱主播 (Subs)、赠送会员、购买 Bits 欢呼与 Twitch Turbo 去广告",
    introSummary: (r, c, cur) =>
      `适用于 ${c}区 (${cur}) Twitch 账户余额充值。免绑海外信用卡即可畅享主播频道订阅、送礼订阅（Gift Subs）、购买 Bits 互动打赏及开通 Twitch Turbo 全站免广告特权，还能搭配领取各类游戏掉宝与订阅福利！`,
    theme: {
      heroGradient: "from-[#3B0764] via-[#6D28D9] to-[#2E1065]",
      heroGlowA: "bg-purple-400/25",
      heroGlowB: "bg-fuchsia-400/20",
      badgeClass: "border-purple-300/35 bg-purple-400/15 text-purple-100",
      accentText: "text-[#7C3AED]",
      accentBgSoft: "bg-purple-50/50",
      accentBorder: "border-purple-200/85",
      accentIconBg: "bg-purple-100 text-[#7C3AED]",
      buttonBg: "bg-[#7C3AED] hover:bg-[#6D28D9]",
      codeText: "text-[#6D28D9]",
      guaranteeBorder: "border-purple-200/90",
      guaranteeBg: "from-purple-50 via-violet-50/35 to-white",
      guaranteeTitle: "text-purple-950",
    },
    codeFormat: {
      title: "Twitch 官方礼品卡代码交付格式说明",
      subtitle: "付款完成后系统自动直采 Twitch 官方电子礼品卡兑换码，网页端 10 秒完成入账：",
      sampleCode: "TWCH-XXXX-XXXX-XXXX",
      sampleComment: "// Twitch Official Gift Card Code（示例格式，以实际交付为准）",
      anatomy: ["① Twitch 官方礼品卡码", "② 对应国家币种余额", "③ 网页直兑免外卡绑卡", "④ 订阅/Bits/Turbo 通用"],
      promises: ["海外正规持牌渠道官方直采", "无 30% 移动端苹果内购溢价", "7×24h 支付后自动秒级发码"],
    },
    officialRedeemUrl: "https://www.twitch.tv/redeem",
    officialRedeemLabel: "前往 Twitch 官方 twitch.tv/redeem 兑换",
    guarantees: [
      { title: "网页直充省去 App 溢价", desc: "在 iOS/Android App 内买订阅或 Bits 往往更贵，使用 Twitch 官方礼品卡在网页端消费立省渠道抽成！" },
      { title: "免海外双币卡零拒付", desc: "无需海外信用卡或 PayPal，直接用支付宝 / 微信 / USDT 购买对应区礼品卡秒充余额。" },
      { title: "官方正版 + 售后可查", desc: "一手正规渠道直采不封号；若遇卡密异常保留完整报错截图联系客服第一时间核查。" },
    ],
    highlights: (r, c) => [
      { title: "覆盖 12 大主流区", tag: "美/英/欧/加/澳", desc: `本卡专用于【${c}】区域 Twitch 账户消费，支持多档灵活面额随用随充。` },
      { title: "主播订阅 & 送礼订阅", tag: "Subs & Gift Subs", desc: "余额可直接开通 Tier 1/2/3 主播订阅，解锁专属表情包、徽章、无广告看台及游戏订阅掉宝。" },
      { title: "Bits 欢呼打赏通用", tag: "弹幕互动", desc: "直接用礼品卡余额购买 Bits 欢呼币，在直播间发送酷炫特效弹幕支持你喜欢的主播。" },
      { title: "开通 Twitch Turbo", tag: "全站去广告", desc: "支持抵扣 Twitch Turbo 会员，实现全站绝大多数直播间免看片头插播广告。" },
      { title: "余额长期有效", tag: "随时抵扣", desc: "兑换进 Twitch 钱包余额后，后续在网页端消费时自动优先从礼品卡余额中扣除。" },
      { title: "7×24h 自动发码", tag: "不错过掉宝", desc: "遇到热门游戏活动「订阅送限定皮肤/道具」时，秒买秒充立刻拿下限定奖励。" },
    ],
    useCases: [
      {
        title: "频道订阅 & 订阅掉宝活动",
        badge: "玩家高频刚需",
        items: [
          { name: "主播 Tier 1 / 2 / 3 订阅", desc: "解锁主播专属聊天表情、身份徽章与回放观看权限" },
          { name: "游戏官方「赠送订阅」掉宝", desc: "经常有瓦罗兰特、魔兽、命运2、Rust 等送订阅领限定外观活动" },
        ],
      },
      {
        title: "Bits 欢呼互动打赏",
        badge: "比手机端更省",
        items: [
          { name: "网页端购买 Bits 更划算", desc: "绕开苹果/谷歌应用商店抽成，用余额买 Bits 到手更多" },
          { name: "点亮聊天室炫酷徽章", desc: "与海外电竞选手、Vtuber、游戏主播零距离互动" },
        ],
      },
      {
        title: "Twitch Turbo 全站特权",
        badge: "重度观众最爱",
        items: [
          { name: "全站无广告流畅看播", desc: "彻底告别每换一个直播间就看 30 秒广告的烦恼" },
          { name: "专属聊天色彩与表情套装", desc: "支持延长直播录像（VOD）保留时长至 60 天" },
        ],
      },
      {
        title: "送给海外好友/水友的礼物",
        badge: "即买即送",
        items: [
          { name: "直播间抽奖 / 社群福利", desc: "购买官方卡密直接发放，方便社群运营与好友互赠" },
          { name: "多档面额按需挑", desc: "小额试用与大额支持档位一应俱全" },
        ],
      },
    ],
    deviceTabs: {
      primaryLabel: "电脑 / 手机网页端兑换",
      secondaryLabel: "使用余额消费指引",
      primarySteps: (r, c, cur) => [
        { step: "01", title: `核对账户区域为【${c}】`, desc: `请确认您使用的 Twitch 账户所在区域及网络环境与【${c} (${cur})】一致。` },
        { step: "02", title: "访问 twitch.tv/redeem", desc: "浏览器打开官方兑换页并登录您的 Twitch 账号。" },
        { step: "03", title: "粘贴礼品卡兑换码", desc: "复制本站「我的订单」交付的官方卡密，粘贴进兑换框并点击「兑换（Redeem）」。" },
        { step: "04", title: `${cur} 钱包余额即刻入账`, desc: "兑换成功后金额存入您的 Twitch Gift Card Balance，可在钱包页面查看。" },
      ],
      secondarySteps: (_r, _c, cur) => [
        { step: "01", title: "进入目标主播直播间", desc: "打开电脑浏览器（推荐网页端省渠道费），访问您想订阅或送礼的主播频道。" },
        { step: "02", title: "点击「订阅」或「购买 Bits」", desc: "选择需要的订阅档位、赠送份数或 Bits 数量。" },
        { step: "03", title: `自动优先扣除 ${cur} 余额`, desc: "结账时系统会自动优先使用您的 Twitch Gift Card Balance 余额付款。" },
        { step: "04", title: "权益实时点亮", desc: "付款完成后徽章、表情或活动掉宝进度即刻生效！" },
      ],
    },
    warnings: (r, c, cur) => [
      { title: "1. 严格区分发行国家/币种", desc: `Twitch 礼品卡仅限在对应国家/地区和对应币种环境下兑换与使用。本卡为【${c} (${cur})】专用卡密，兑换时建议网络环境与所在地区一致，跨区使用可能报错。` },
      { title: "2. 请在网页端兑换与消费", desc: "Twitch 礼品卡余额仅支持通过网页端（twitch.tv）兑换和消费，无法在 iOS App Store 或 Google Play 内购弹窗中直接使用。" },
      { title: "3. 一次性官方卡密不可退换", desc: "数字卡密发出后无法二次销售，收到后请尽快充入本人账户切勿泄露。" },
    ],
    crossSell: {
      title: "还没有海外 Twitch 成品账号？",
      subtitle: "本站「数字 / 社媒账号」专区同步提供多平台成品号与社媒账号，一站配齐。",
      href: "/products/digital-accounts",
      buttonLabel: "去逛数字账号专区",
    },
    faqs: (r, c, cur) => [
      { q: `这张${r} Twitch 礼品卡可以跨区使用吗？`, a: `不可以。Twitch 官方对礼品卡实施国家/币种校验，本卡专供【${c} (${cur})】地区兑换使用，请确保账户区域与网络出口匹配。` },
      { q: "为什么我在 iPhone Twitch App 里看不到刚刚充进去的余额？", a: "因为苹果/谷歌限制应用内第三方钱包支付，Twitch 礼品卡余额需要在电脑或手机浏览器打开 twitch.tv 网页端使用，网页端订完后 App 里一样同步享有订阅与表情权益！" },
      { q: "用礼品卡余额赠送订阅，能触发游戏掉宝（Drops）活动吗？", a: "可以！只要游戏官方活动说明支持常规/赠送订阅触发，用礼品卡余额在网页端完成订阅与银行卡付款效果完全一致。" },
      { q: "礼品卡余额可以买 Twitch Turbo 去广告会员吗？", a: "可以，支持在网页端使用礼品卡余额抵扣 Twitch Turbo 月度订阅。" },
      { q: "付款后多久能收到卡密？", a: "系统 7×24h 全自动直采发码，付款后数秒至几十秒内即可在「我的订单」复制使用。" },
      { q: "如果遇到兑换提示地区不符或无效码怎么办？", a: "请先切换对应国家网络并在浏览器无痕模式重试；若确认同区仍提示无效，请截取完整报错页面联系在线客服核查。" },
    ],
    specs: (name, r, c, code, cur, denom) => [
      ["商品名称", name],
      ["适用国家 / 币种", `${c} (${code}) — 仅限${r} (${cur}) Twitch 网页端兑换`],
      ["可选规格 / 面额", denom],
      ["交付格式", "Twitch 官方电子礼品卡兑换码（PIN），付款后自动秒发"],
      ["适用消费", "主播订阅 (Subs) / 赠送订阅 / Bits 欢呼币 / Twitch Turbo 会员"],
      ["售后保障", "正规海外渠道直采；一次性卡密发出后不支持无理由退换"],
    ],
  },

  google_play: {
    key: "google_play",
    brandName: "Google Play 谷歌商店",
    shortName: "Google Play 礼品卡",
    englishBadge: "Google Play Official PIN",
    tagline: "谷歌商店官方礼品卡 · 安卓海外应用内购、手游氪金、YouTube 与 AI 会员充值",
    introSummary: (r, c, cur) =>
      `适用于 ${c}区 (${cur}) Google Play 账号余额充值。免绑海外信用卡，畅买 Google Play 正版 App、海外手游月卡礼包、Google One 云存储、YouTube Premium 及支持谷歌内购的 AI 工具。`,
    theme: {
      heroGradient: "from-[#0B3B2E] via-[#0F766E] to-[#0E293B]",
      heroGlowA: "bg-teal-400/25",
      heroGlowB: "bg-emerald-400/20",
      badgeClass: "border-teal-300/35 bg-teal-400/15 text-teal-100",
      accentText: "text-teal-700",
      accentBgSoft: "bg-teal-50/50",
      accentBorder: "border-teal-200/85",
      accentIconBg: "bg-teal-100 text-teal-700",
      buttonBg: "bg-teal-600 hover:bg-teal-700",
      codeText: "text-teal-800",
      guaranteeBorder: "border-teal-200/90",
      guaranteeBg: "from-teal-50 via-emerald-50/35 to-white",
      guaranteeTitle: "text-teal-950",
    },
    codeFormat: {
      title: "Google Play 官方礼品卡 PIN 交付格式",
      subtitle: "支付成功后系统全自动直采谷歌官方 16~20 位兑换码（请在同区纯净环境下兑换）：",
      sampleCode: "XXXX-XXXX-XXXX-XXXX",
      sampleComment: "// Google Play Gift Card Official Code（示例格式）",
      anatomy: ["① 谷歌官方正版 PIN", "② 严格锁区 + 锁 IP 环境", "③ 充入 Play 账户余额", "④ 余额永久有效不过期"],
      promises: ["海外持牌渠道一手白卡直采", "全自动 7×24h 支付秒发", "附站内 Google 锁区防踩坑教程"],
    },
    officialRedeemUrl: "https://play.google.com/redeem",
    officialRedeemLabel: "前往 Google Play 官方 play.google.com/redeem",
    guarantees: [
      { title: "官方直采杜绝黑卡", desc: "全部代码来自正规海外授权卡密上游，避免黑卡导致谷歌支付资料被永久封停。" },
      { title: "7×24h 自动发码", desc: "支持支付宝 / 微信 / USDT / 站内余额结算，支付后自动发货至「我的订单」。" },
      { title: "附完整谷歌防锁区指引", desc: "针对谷歌严格的跨区风控，详情页与站内教程中心均提供清晰避坑提示。" },
    ],
    highlights: (r, c) => [
      { title: "覆盖 22 国热门区", tag: "日/韩/台/土/英/欧", desc: `本卡专供【${c}】谷歌商店账号使用，满足各区手游课金、应用订阅与影音会员需求。` },
      { title: "海外手游课金主力", tag: "免绑外卡", desc: "支持日服/韩服/台服/欧美服各类热门二次元手游、SLG 与动作游戏应用内直充。" },
      { title: "订阅 AI & 影音服务", tag: "Google 内购", desc: "支持 Google One、YouTube Premium、ChatGPT / Gemini 等支持 Play 账单扣款的服务。" },
      { title: "余额永不过期", tag: "长期有效", desc: "成功充入 Google Play 账户余额后永不过期，随时抵扣应用购置与续费。" },
      { title: "多档面额随心选", tag: "小额试水更稳", desc: "建议首次充值的新账号先购入最小面额测试账号风控与节点纯净度，确认丝滑再加大额。" },
      { title: "7×24h 自动发货", tag: "极速取码", desc: "无需人工代充无需交出谷歌账号密码，全程自助更安全。" },
    ],
    useCases: [
      {
        title: "外服热门手游内购氪金",
        badge: "安卓玩家必备",
        items: [
          { name: "日服 / 韩服 / 国际服二游大作", desc: "蔚蓝档案、赛马娘、FGO、崩铁、胜利女神等谷歌商店内购直付" },
          { name: "月卡 / 战令 / 限定抽卡礼包", desc: "账号余额充足时一键付款，告别海外卡拒付" },
        ],
      },
      {
        title: "AI 工具 & 效率软件订阅",
        badge: "应用内直扣",
        items: [
          { name: "Google One / Gemini / ChatGPT", desc: "安卓端通过 Google Play 订阅扣余额更省心" },
          { name: "正版付费工具与应用", desc: "买断各类安卓精品生产力、影音播放与系统增强 App" },
        ],
      },
      {
        title: "流媒体 & 电子书内容",
        badge: "娱乐全覆盖",
        items: [
          { name: "YouTube Premium / 频道会员", desc: "免广告看视频、后台播放与 YouTube Music" },
          { name: "Google Play 图书与影视", desc: "正版电子书、漫画及高清电影租借购入" },
        ],
      },
      {
        title: "低价区高性价比优选",
        badge: "省钱攻略",
        items: [
          { name: "土耳其 / 巴西 / 印尼 / 印度等区", desc: "部分订阅与内购费率优势显著，需严格配合对应区干净 IP 与付款资料" },
          { name: "日本 / 台湾 / 韩国主力服", desc: "手游与中文/日系内容最丰富的安卓生态区" },
        ],
      },
    ],
    deviceTabs: {
      primaryLabel: "安卓手机 Play 商店",
      secondaryLabel: "网页端兑换",
      primarySteps: (r, c, cur) => [
        { step: "01", title: `核对谷歌付款资料与 IP 均为【${c}】`, desc: `打开 pay.google.com 确认您的付款资料国家为【${c}】，且当前手机节点为【${c}】纯净住宅/稳定 IP（非常重要！）。` },
        { step: "02", title: "打开 Google Play 商店", desc: "点击右上角个人头像 →「付款和订阅（Payments & subscriptions）」→「兑换代码（Redeem code）」。" },
        { step: "03", title: "粘贴官方兑换码", desc: "复制本站「我的订单」内自动发放的卡密粘贴进去并点击「兑换」。" },
        { step: "04", title: `确认 ${cur} 余额入账`, desc: "页面确认金额后余额立即到账，即可用于应用购置与游戏内购。" },
      ],
      secondarySteps: (r, c, cur) => [
        { step: "01", title: "开启同区纯净网络", desc: `先确保电脑浏览器网络出口位于【${c}】，避免使用多人共享机场节点。` },
        { step: "02", title: "访问 play.google.com/redeem", desc: `登录地区为【${c}】的 Google 账号。` },
        { step: "03", title: "输入卡密点击兑换", desc: "粘贴订单内获取的 Google Play 官方兑换码。" },
        { step: "04", title: `同步至同账号安卓设备`, desc: `兑换成功的 ${cur} 余额会自动同步到您的安卓手机 Play 商店。` },
      ],
    },
    warnings: (r, c, cur) => [
      { title: "1. 谷歌锁区风控极严：必须「账号地区 + 付款资料 + 干净同区 IP」三一致！", desc: `Google Play 近年实行全球最严厉的锁区机制：如果您人在非【${c}】地区、或使用低质量共享代理 IP 兑换/消费，谷歌极可能提示「需要更多信息才能兑换 / 您只能在 ${c} 使用此余额」。强烈建议先买最小面额测试您的网络与账号环境！` },
      { title: "2. 跨区或风控拦截非卡密质量问题", desc: "若因账号存在多个国家付款资料、IP 纯净度不足、或刚改区未满冷却期导致谷歌拒绝兑换或限制消费，卡密本身有效且无法回收，不属质量问题不支持退款。" },
      { title: "3. 一次性数字卡密请妥善保管", desc: "系统自动发码后请立即核验并勿泄露给第三方。" },
    ],
    crossSell: {
      title: "需要 Google 账号改区、付款资料设置与防锁区教程？",
      subtitle: "点击查阅站内 Google 使用教程中心，或选购优质海外 Gmail 账号。",
      href: "/tutorials?topic=google-region",
      buttonLabel: "查看 Google 教程",
    },
    faqs: (r, c, cur) => [
      { q: "兑换时提示「我们需要更多信息才能兑换您的礼品卡 / We need more info」怎么办？", a: "这是谷歌风控系统拦截了当前账号或网络环境（常见于共享节点 IP、新号无消费记录或账号绑定过多地区付款资料）。建议按页面提示或更换纯净同区住宅 IP，切勿盲目重复高频提交。" },
      { q: "兑换成功了，但游戏内购时提示「只能在对应国家使用」怎么办？", a: `这是谷歌在消费环节同样校验您的网络 IP 与设备定位。消费时请同样保持【${c}】纯净节点，关闭手机定位授权给 Play 服务，并确保 pay.google.com 中仅保留【${c}】一个付款资料。` },
      { q: "新手第一次买 Google Play 礼品卡有什么建议？", a: "强烈建议先购买本商品最小面额（如 5/10 元等低面额档位）实测能否丝滑兑换和消费，验证您的账号与网络完全没问题后再买大额！" },
      { q: `我的美区/日区账号可以混用这张${r}卡吗？`, a: `不可以。本卡严格限定【${c} (${cur})】Google Play 账号，跨区无法兑换。` },
      { q: "余额充进去会过期吗？", a: "不会过期，Google Play 礼品卡余额一旦成功入账长期有效。" },
      { q: "卡密如果提示「已被兑换 / 代码无效」如何售后？", a: "请第一时间完整截取 Google Play 报错画面（含时间与报错文字）并联系在线客服，我们会立即核对上游出码流水。" },
    ],
    specs: (name, r, c, code, cur, denom) => [
      ["商品名称", name],
      ["适用谷歌区域", `${c} (${code}) — 需账号地区、付款资料、网络 IP 均为${c}`],
      ["可选规格 / 面额", denom],
      ["交付格式", "Google Play 官方数字兑换码（PIN），付款后自动发码"],
      ["风控提醒", "谷歌锁区严格，首次使用强烈建议先购最小面额测试账号与网络环境"],
      ["售后保障", "正规直采白卡；因跨区/IP 风控导致拦截不支持退换，无效码可核查兜底"],
    ],
  },

  steam: {
    key: "steam",
    brandName: "Steam 钱包充值卡",
    shortName: "Steam 充值卡",
    englishBadge: "Steam Wallet Official 15-Digit PIN",
    tagline: "Steam 官方 15 位钱包充值码 · 全球 21 国热门区 · 零红信风险安全买大作",
    introSummary: (r, c, cur) =>
      `适用于结算货币为 ${cur} 的 ${c}区 Steam 账号钱包充值。官方正规持牌直采，彻底远离低价黑卡/饰品倒余额导致的 Steam 红信封号风险，畅买夏促冬促史低 3A 大作、CS2 皮肤与游戏内购！`,
    theme: {
      heroGradient: "from-[#0F172A] via-[#1B2838] to-[#1E3A5F]",
      heroGlowA: "bg-sky-400/20",
      heroGlowB: "bg-indigo-400/20",
      badgeClass: "border-sky-300/35 bg-sky-400/15 text-sky-100",
      accentText: "text-[#1B4B72]",
      accentBgSoft: "bg-slate-50/75",
      accentBorder: "border-slate-200/90",
      accentIconBg: "bg-sky-100 text-[#1B4B72]",
      buttonBg: "bg-[#1B2838] hover:bg-[#121D29]",
      codeText: "text-[#1B4B72]",
      guaranteeBorder: "border-sky-200/90",
      guaranteeBg: "from-slate-50 via-sky-50/40 to-white",
      guaranteeTitle: "text-slate-900",
    },
    codeFormat: {
      title: "Steam 官方 15 位钱包充值码交付格式",
      subtitle: "支付完成后系统自动向正规渠道直采 15 位官方 Steam Wallet Code（支持客户端与网页一键粘贴）：",
      sampleCode: "XXXXX-XXXXX-XXXXX",
      sampleComment: "// Steam Wallet Official 15-Digit Code（示例格式）",
      anatomy: ["① 15 位官方钱包代码", "② 零红信白卡货源", "③ 立即解锁 5 美元社区限制", "④ 余额永久有效不过期"],
      promises: ["正规渠道绝无红信/黄信风险", "无需交出账号密码自助充值", "支持全区主流热门币种"],
    },
    officialRedeemUrl: "https://store.steampowered.com/account/redeemwalletcode",
    officialRedeemLabel: "前往 Steam 官方网页兑换钱包充值码",
    guarantees: [
      { title: "拒绝黑卡 · 零红信保障", desc: "市面上挂刀/低价黑卡随时可能触发 Valve 红信封禁交易与社区权限。本站正规渠道白卡直采，大号安心充。" },
      { title: "5 美元新号一键解除限制", desc: "外区新号首次充值满等值 $5 USD 即可立即解除加好友、发评测与社区市场受限状态。" },
      { title: "7×24h 自动发码秒入账", desc: "夏促、秋促、冬促、黑五史低大促随时下单秒出码，不错过任何限时特惠。" },
    ],
    highlights: (r, c) => [
      { title: "覆盖 21 个 Steam 热门区", tag: "美/港/欧/印/越/阿等", desc: `本卡专供【${c}】商店币种的 Steam 账号，满足外区账号稳定充值与日常买游戏刚需。` },
      { title: "零红信正规白卡", tag: "大号安全首选", desc: "正规持牌渠道直采官方卡密，避免盗刷黑卡带来的账号红信与库存冻结风险。" },
      { title: "支持解锁外区新号限制", tag: "加好友 & 市场", desc: "新注册的外区账号充入等值 5 美元及以上官方充值卡，可快速解除受限账户状态。" },
      { title: "买游戏 & 社区市场全通用", tag: "CS2 / Dota2", desc: "钱包资金可直接购买全站数字游戏、DLC、CS2/Dota2 武器箱钥匙与社区市场饰品。" },
      { title: "余额永不过期", tag: "大促提前囤", desc: "充入 Steam 钱包后长期有效，提前备好余额坐等夏促/冬促一键清愿望单。" },
      { title: "7×24h 自动秒发", tag: "极速畅玩", desc: "无需排队等人工发货，支付宝 / 微信 / USDT 支付后立即取码兑换。" },
    ],
    useCases: [
      {
        title: "热门 3A 大作与外区独占锁区游戏",
        badge: "告别国区锁区",
        items: [
          { name: "国区未上架 / 锁区精品大作", desc: "美区、港区、欧区、日区轻松入库全球无阉割完整版游戏" },
          { name: "夏促 / 冬促 / 黑五史低清愿望单", desc: "官方余额结账秒入库，支持按 Steam 官方政策 2 小时内无忧退款至钱包" },
        ],
      },
      {
        title: "CS2 / Dota2 / Apex 社区市场与内购",
        badge: "饰品 & 战令",
        items: [
          { name: "CS2 优先状态 / 钥匙 / 贴纸胶囊", desc: "官方钱包直充，安全稳定不触发异常交易审查" },
          { name: "Dota 2 本子 / 游戏内商城", desc: "Apex 金币、PUBG G-Coin、战争雷霆等游戏内余额直付" },
        ],
      },
      {
        title: "Steam 新号解除 $5 受限状态",
        badge: "解锁社交权限",
        items: [
          { name: "开放添加好友 & 组队邀请", desc: "充入等值 5 美元以上即可恢复完整社区社交功能" },
          { name: "开放创意工坊 & 社区市场", desc: "自由交易卡牌、皮肤并升级个人 Steam 账号等级" },
        ],
      },
      {
        title: "软件工具与 Steam Deck 游戏库",
        badge: "多场景适用",
        items: [
          { name: "Wallpaper Engine / Lossless Scaling", desc: "Steam 商店正版桌面神软与效率工具直接余额购入" },
          { name: "Steam Deck 掌机随时买随时玩", desc: "掌机端与 PC 端钱包余额实时同步" },
        ],
      },
    ],
    deviceTabs: {
      primaryLabel: "Steam 网页端（推荐）",
      secondaryLabel: "Steam PC 客户端",
      primarySteps: (r, c, cur) => [
        { step: "01", title: `核对 Steam 钱包币种为 ${cur}`, desc: `打开 Steam 账户明细，确认您当前的商店国家/钱包货币为【${c} / ${cur}】（Valve 已禁止大多数跨币种充值卡兑换）。` },
        { step: "02", title: "打开官方充值码兑换页", desc: "访问 store.steampowered.com/account/redeemwalletcode 并登录您的 Steam 账号。" },
        { step: "03", title: "粘贴 15 位官方卡密", desc: "复制本站「我的订单」交付的 15 位 Steam 钱包代码粘贴进去并点击「继续」。" },
        { step: "04", title: `${cur} 余额即刻到账`, desc: "核对金额无误后余额秒入账，马上可以清空愿望单！" },
      ],
      secondarySteps: (r, c, cur) => [
        { step: "01", title: "打开 Steam 桌面客户端", desc: `登录您的【${c} (${cur})】Steam 账号。` },
        { step: "02", title: "点击「游戏」→「兑换 Steam 钱包充值码」", desc: "在客户端顶部菜单栏选择「游戏（Games）」→「兑换 Steam 钱包充值码（Redeem a Steam Wallet Code）」。" },
        { step: "03", title: "输入 15 位充值码", desc: "粘贴卡密点击「继续」完成校验。" },
        { step: "04", title: `右上角 ${cur} 余额即时更新`, desc: "入账后即可直接在商店与市场消费。" },
      ],
    },
    warnings: (r, c, cur) => [
      { title: "1. Steam 严格执行「同币种兑换规则」（不可跨币种！）", desc: `Valve 官方已规定：数字钱包充值码必须与账号当前钱包货币完全一致！本商品为【${cur} (${c})】专用码，国区人民币 (CNY) 或其他不同币种账号将提示「无法在您的国家/地区激活」，下单前请务必核对账号右上角钱包货币！` },
      { title: "2. 不可仅凭礼品卡强行跨区转区", desc: "Steam 更改商店国家/地区需要对应国家的本地支付方式，单纯输入其他币种的充值码通常无法自动转区，请勿买错币种尝试转区。" },
      { title: "3. 一次性官方卡密不可退换", desc: "15 位充值码发出后无法二次核销或回收，请务必核对币种后再付款。" },
    ],
    crossSell: {
      title: "需要现成的外区 Steam 成品账号？",
      subtitle: "本站「数字 / 社媒账号 → Steam」专区提供多区成品账号，搭配对应币种钱包卡直接开玩。",
      href: "/products/digital-accounts?category=steam",
      buttonLabel: "去选购 Steam 账号",
    },
    faqs: (r, c, cur) => [
      { q: `我的 Steam 国区账号（CNY）能用这张 ${cur} 充值卡吗？`, a: `不可以！Valve 已经关闭绝大多数跨币种充值卡自动换汇功能。本卡仅限钱包货币为【${cur}】的【${c}】账号充值（若为全新从未消费过的空白号，需确认注册地区及首次激活规则）。` },
      { q: "充值卡会不会导致我的 Steam 账号吃红信？", a: "不会！红信通常源于黑卡盗刷或违规跨区低价倒卖。本站卡密全部通过海外持牌正规数字卡密通道直采，安全正规。" },
      { q: "充完以后能在社区市场直接买 CS2 皮肤吗？", a: "如果您的账号本身已经开启 Steam 手机令牌满 15 天且不是新解除限制的受限号，官方充值卡入账后余额可立即在社区市场消费，无冷却等待期。" },
      { q: "兑换时提示「此 Steam 钱包充值码无法在您所在国家/地区激活」怎么办？", a: `说明您的 Steam 账号当前商店币种不是【${cur}】（或账号区域与该卡不符）。请检查右上角账号明细中的「国家/地区」设置。` },
      { q: "充值码有过期时间吗？", a: "正规 Steam 钱包充值码兑换入账后余额永久有效，不会清零。" },
      { q: "如果同币种账号提示「代码无效」怎么售后？", a: "请截取包含「Steam 账号明细币种显示 + 兑换报错提示」的完整截图，附上订单号联系在线客服核查上游记录。" },
    ],
    specs: (name, r, c, code, cur, denom) => [
      ["商品名称", name],
      ["适用商店币种", `${c} (${code}) — 仅限钱包货币为 ${cur} 的 Steam 账号`],
      ["可选规格 / 面额", denom],
      ["交付格式", "15 位 Steam Wallet 官方数字充值码（PIN），付款后自动秒发"],
      ["适用消费", "Steam 游戏本体 / DLC / 游戏内购 / 社区市场 / 解除 $5 限制"],
      ["售后保障", "官方白卡零红信风险；一次性数字卡密发出后不支持无理由退换"],
    ],
  },

  netflix: {
    key: "netflix",
    brandName: "Netflix 奈飞礼品卡",
    shortName: "Netflix 礼品卡",
    englishBadge: "Netflix Official Subscription PIN",
    tagline: "Netflix 官方礼品卡充值码 · 免绑海外信用卡 · 独享 4K 杜比视界原画观影",
    introSummary: (r, c, cur) =>
      `适用于 ${c}区 (${cur}) Netflix 账号免外卡续费与开号。告别共享拼车号被踢、同户验证拦截与记录串号困扰，自己掌控主账号，充入礼品卡余额按月自动扣费，丝滑畅看 4K HDR 全球原创新剧！`,
    theme: {
      heroGradient: "from-[#450A0A] via-[#991B1B] to-[#18181B]",
      heroGlowA: "bg-red-500/25",
      heroGlowB: "bg-rose-500/20",
      badgeClass: "border-red-300/35 bg-red-500/20 text-red-100",
      accentText: "text-[#DC2626]",
      accentBgSoft: "bg-red-50/45",
      accentBorder: "border-red-200/85",
      accentIconBg: "bg-red-100 text-[#DC2626]",
      buttonBg: "bg-[#E50914] hover:bg-[#B91C1C]",
      codeText: "text-[#B91C1C]",
      guaranteeBorder: "border-red-200/90",
      guaranteeBg: "from-red-50 via-rose-50/35 to-white",
      guaranteeTitle: "text-red-950",
    },
    codeFormat: {
      title: "Netflix 官方 11 位礼品卡 PIN 交付格式",
      subtitle: "支付成功后系统全自动直采并交付奈飞官方礼品卡兑换码（支持网页端直接续费或新号开户）：",
      sampleCode: "XXXX-XXXX-XXX",
      sampleComment: "// Netflix Official Gift Card PIN（示例格式，以实际交付为准）",
      anatomy: ["① 奈飞官方礼品卡 PIN", "② 严格匹配账户币种区", "③ 免绑外卡自动抵扣月费", "④ 余额用完自动停扣不透支"],
      promises: ["彻底告别拼车同户验证烦恼", "零海外信用卡扣款风控", "7×24h 支付后全自动秒发"],
    },
    officialRedeemUrl: "https://www.netflix.com/redeem",
    officialRedeemLabel: "前往 Netflix 官方 netflix.com/redeem 兑换",
    guarantees: [
      { title: "官方直采 · 稳定续费不掉会员", desc: "正规持牌渠道官方卡密，充入您自己的 Netflix 账号，无需担心合租车主跑路或翻车。" },
      { title: "免海外信用卡 · 绝不自动乱扣费", desc: "使用礼品卡余额按月抵扣，余额用尽后仅自动暂停续费，无需绑定个人信用卡，零乱扣费隐患。" },
      { title: "全自动发码 · 售后核查兜底", desc: "付款秒发 PIN 码，若遇无效码请保留完整截图联系在线客服核查。" },
    ],
    highlights: (r, c) => [
      { title: "独享主号告别同户限制", tag: "自己当车主", desc: "Netflix 现已严打跨设备拼车，用礼品卡为本人账号充值，彻底告别「您不在同户家庭」弹窗。" },
      { title: "支持 4K 杜比视界 Premium", tag: "顶级视听", desc: "余额入账后可自由在账户设置里选择标准版或 4K 超高清 Premium 套餐，随心切换。" },
      { title: "支持老号续费 & 新号激活", tag: "一卡两用", desc: `支持为已有【${c}】账号无缝续费，也支持在对应区环境下用礼品卡作为唯一支付方式注册新号。` },
      { title: "免绑海外双币信用卡", tag: "无拒付烦恼", desc: "绕开奈飞对虚拟卡和国内双币卡的频繁拒付，输入 PIN 码即可轻松观看。" },
      { title: "余额可按天精确折算", tag: "不浪费一分钱", desc: "即使余额不足整月，Netflix 也会自动按比例换算可观看天数，并用完提前邮件提醒。" },
      { title: "覆盖 13 国热门区域", tag: "多区可选", desc: "覆盖美、英、澳、欧、巴西、墨西哥、波兰、南非等 13 国官方礼品卡，满足各区老号续费。" },
    ],
    useCases: [
      {
        title: "4K 超高清剧集 & 电影大片",
        badge: "无删减原画",
        items: [
          { name: "怪奇物语 / 鱿鱼游戏 / 三体 / 纸牌屋", desc: "官方自制顶级剧集全球同步首发，支持简繁中文字幕" },
          { name: "4K HDR + Dolby Atmos 空间音频", desc: "电视、Apple TV、Mac、iPhone 全端拉满顶级画质" },
        ],
      },
      {
        title: "摆脱拼车翻车 & 独立观影记录",
        badge: "独享更舒心",
        items: [
          { name: "专属推荐算法 & 独立片单", desc: "再也不用忍受拼车陌生人改密码、删观影进度或抢占屏幕名额" },
          { name: "随时改套餐 / 随时暂停", desc: "追完剧不充卡即自动停扣，想看新剧再来充一张即可恢复" },
        ],
      },
      {
        title: "已有海外老号续费刚需",
        badge: "无缝衔接",
        items: [
          { name: "巴西 / 墨西哥 / 欧洲 / 美英老号", desc: "手头已有对应区 Netflix 账号？充入同币种礼品卡直接延长期限" },
          { name: "支持多张叠加一次充半年/一年", desc: "连续兑换多张礼品卡自动累加账户余额，省去每月操作" },
        ],
      },
      {
        title: "海外追番 & 纪录片学习",
        badge: "语言学习利器",
        items: [
          { name: "日漫新番 & 双语字幕学习", desc: "配合浏览器双语插件看剧学英语/日语，画质清晰稳定" },
          { name: "高分自然/科技/历史纪录片", desc: "海量 4K 纪录片全家人共享观影乐趣" },
        ],
      },
    ],
    deviceTabs: {
      primaryLabel: "已有账号续费",
      secondaryLabel: "全新账号用卡开通",
      primarySteps: (r, c, cur) => [
        { step: "01", title: `确认账号账单币种为 ${cur}`, desc: `登录 Netflix 账户页查看「会员资格与账单」，确认您的账户结算货币与【${c} (${cur})】一致。` },
        { step: "02", title: "访问 netflix.com/redeem", desc: "在浏览器打开官方兑换入口（或在账户设置点击「兑换礼品卡或促销代码」）。" },
        { step: "03", title: "输入官方礼品卡 PIN 码", desc: "粘贴本站「我的订单」内自动发放的卡密并点击「兑换」。" },
        { step: "04", title: `${cur} 余额入账自动顺延`, desc: "兑换成功后余额立即记入账户，下个账单日自动优先扣减余额！" },
      ],
      secondarySteps: (r, c, cur) => [
        { step: "01", title: `切换至【${c}】干净网络`, desc: `注册新号时请先开启【${c}】稳定原生流媒体解锁节点，访问 netflix.com/redeem。` },
        { step: "02", title: "直接输入卡密开启注册", desc: "在兑换页粘贴卡密后按提示输入您的新邮箱并设置登录密码。" },
        { step: "03", title: "选择观影套餐档位", desc: "根据需求选择 Standard 或 4K Premium 套餐，确认用礼品卡余额支付。" },
        { step: "04", title: "完成开号即刻追剧", desc: `提示绑定手机时按指引完成即可开始畅享 ${cur} 区 Netflix 全站内容。` },
      ],
    },
    warnings: (r, c, cur) => [
      { title: "1. 严格匹配账户币种（重要！）", desc: `Netflix 礼品卡只能充入「账单货币与礼品卡货币完全一致」的账号。本卡专供【${c} / ${cur}】账号使用；若您的账号通过 Apple/Google 第三方代扣订阅，需先取消第三方代扣待周期结束后再用礼品卡续费。` },
      { title: "2. 观影需自备支持解锁 Netflix 的海外网络", desc: "本商品为官方充值卡密，不包含网络代理工具；新号注册及跨区观影请配合稳定的海外流媒体解锁节点，部分区域新号可能受 30 天地区锁观看限制。" },
      { title: "3. 一次性官方 PIN 码售出不退", desc: "礼品卡一经发出无法回收，下单前请务必确认您的 Netflix 账号币种与本卡一致。" },
    ],
    faqs: (r, c, cur) => [
      { q: `我的 Netflix 账号目前是其他国家的币种，能用这张 ${cur} 卡吗？`, a: `不可以！Netflix 要求礼品卡币种必须与账号账单币种一致。如果您的账号当前不是【${cur}】，请返回 Netflix 分类选择与您账号一致的国家，或待当前会员完全过期后在对应区重新激活。` },
      { q: "我的账号是通过 Apple 内购或运营商套餐扣费的，怎么用礼品卡？", a: "通过 Apple / 运营商代扣的账号无法直接叠加官方礼品卡。需先关闭第三方自动续费，等当前周期彻底到期变成未订阅状态后，再访问 netflix.com/redeem 用礼品卡恢复会员。" },
      { q: "余额充进去不够整月怎么办？", a: "不用担心！Netflix 会自动按天精确折算您的余额可观看天数，例如够看 18 天就会完整给您 18 天会员，不会吞掉零头。" },
      { q: "兑换时提示「此代码无法在您的国家/地区使用」怎么办？", a: `请检查两处：① 您当前浏览器网络 IP 是否位于【${c}】；② 您的账号历史账单币种是否为【${cur}】。两者匹配后刷新页面重试即可。` },
      { q: "能把多张礼品卡一起充进同一个账号吗？", a: "可以！支持连续兑换多张同币种礼品卡，金额自动累加，下期扣款依次顺延。" },
      { q: "卡密如果提示「代码无效」或「已被兑换」如何处理？", a: "请第一时间完整截取 Netflix 兑换页的报错提示与订单号联系在线客服，我们会立即核查上游发货记录。" },
    ],
    specs: (name, r, c, code, cur, denom) => [
      ["商品名称", name],
      ["适用账单区域", `${c} (${code}) — 仅限账单货币为 ${cur} 的 Netflix 账号`],
      ["可选规格 / 面额", denom],
      ["交付格式", "Netflix 官方礼品卡 PIN 码，支付后 7×24h 自动发码"],
      ["支持画质", "支持 Standard / 4K 超高清 Premium 套餐抵扣（具体套餐在官网任选）"],
      ["售后保障", "官方正规白卡；一次性数字卡密发出后不支持无理由退换"],
    ],
  },
};
