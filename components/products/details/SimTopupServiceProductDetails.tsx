"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  Globe,
  HelpCircle,
  KeyRound,
  PhoneCall,
  ShieldAlert,
  ShieldCheck,
  Signal,
  Smartphone,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react";

import HoverMarqueeText from "@/components/ui/HoverMarqueeText";
import { openPublicSupport } from "@/lib/support/open-public-support";

export const SIM_SERVICE_CATEGORY_ID = "94319387-0291-4e58-b9fd-e25fbdfbfaf1";

export type SimTopupDetailProduct = {
  id: string;
  slug?: string | null;
  name: string;
  category_id?: string | null;
  categoryLabel?: string | null;
  short_description?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SimTopupDetailSku = {
  sku_title?: string | null;
  sku_code?: string | null;
  price?: number | string | null;
};

type CarrierKey =
  | "giffgaff-uk"
  | "vodafone-uk"
  | "ee-uk"
  | "three-uk"
  | "lebara-uk"
  | "lyca-uk"
  | "tmobile-us"
  | "att-us"
  | "verizon-us"
  | "lyca-us"
  | "simple-mobile-us"
  | "red-pocket-us"
  | "generic";

type CarrierTheme = {
  heroGradient: string;
  heroGlowA: string;
  heroGlowB: string;
  badgeClass: string;
  accentBorder: string;
  accentBgSoft: string;
  accentIconBg: string;
  accentText: string;
  guaranteeBorder: string;
  guaranteeBg: string;
  guaranteeTitle: string;
  codeText: string;
  buttonBg: string;
};

type CarrierProfile = {
  key: CarrierKey;
  carrierName: string;
  englishBadge: string;
  networkBadge: string;
  countryName: string;
  countryCode: string;
  dialPrefix: string;
  currencyCode: string;
  currencySymbol: string;
  tagline: string;
  intro: string;
  keepAliveTip: string;
  pinFormatLabel: string;
  pinSample: string;
  pinAnatomy: [string, string, string, string];
  ussdCommand: string;
  officialUrl: string;
  officialHref: string;
  officialChannelLabel: string;
  accountRequirement: string;
  theme: CarrierTheme;
  highlights: Array<{ tag: string; title: string; desc: string }>;
  useCases: Array<{
    title: string;
    badge: string;
    items: Array<{ name: string; desc: string }>;
  }>;
  webSteps: Array<{ step: string; title: string; desc: string }>;
  dialSteps: Array<{ step: string; title: string; desc: string }>;
  warnings: Array<{ title: string; desc: string }>;
  faqs: Array<{ q: string; a: string }>;
};

const THEMES = {
  emerald: {
    heroGradient: "from-slate-950 via-emerald-950 to-teal-900",
    heroGlowA: "bg-emerald-400/25",
    heroGlowB: "bg-lime-400/20",
    badgeClass: "border-emerald-300/35 bg-emerald-500/20 text-emerald-100",
    accentBorder: "border-emerald-200/85",
    accentBgSoft: "bg-emerald-50/55",
    accentIconBg: "bg-emerald-100 text-emerald-700",
    accentText: "text-emerald-700",
    guaranteeBorder: "border-emerald-200/90",
    guaranteeBg: "from-emerald-50/75 via-teal-50/35 to-white",
    guaranteeTitle: "text-emerald-900",
    codeText: "text-emerald-700",
    buttonBg: "bg-emerald-600 hover:bg-emerald-700",
  },
  crimson: {
    heroGradient: "from-red-950 via-rose-950 to-slate-950",
    heroGlowA: "bg-red-500/30",
    heroGlowB: "bg-orange-400/20",
    badgeClass: "border-red-300/35 bg-red-500/20 text-red-100",
    accentBorder: "border-red-200/85",
    accentBgSoft: "bg-red-50/50",
    accentIconBg: "bg-red-100 text-red-700",
    accentText: "text-red-700",
    guaranteeBorder: "border-red-200/90",
    guaranteeBg: "from-red-50/70 via-rose-50/35 to-white",
    guaranteeTitle: "text-red-900",
    codeText: "text-red-700",
    buttonBg: "bg-red-600 hover:bg-red-700",
  },
  teal: {
    heroGradient: "from-teal-950 via-cyan-950 to-slate-950",
    heroGlowA: "bg-teal-400/30",
    heroGlowB: "bg-amber-300/20",
    badgeClass: "border-teal-300/35 bg-teal-500/20 text-teal-100",
    accentBorder: "border-teal-200/85",
    accentBgSoft: "bg-teal-50/55",
    accentIconBg: "bg-teal-100 text-teal-700",
    accentText: "text-teal-700",
    guaranteeBorder: "border-teal-200/90",
    guaranteeBg: "from-teal-50/75 via-cyan-50/35 to-white",
    guaranteeTitle: "text-teal-900",
    codeText: "text-teal-700",
    buttonBg: "bg-teal-600 hover:bg-teal-700",
  },
  indigo: {
    heroGradient: "from-slate-950 via-indigo-950 to-purple-950",
    heroGlowA: "bg-indigo-500/30",
    heroGlowB: "bg-fuchsia-400/20",
    badgeClass: "border-indigo-300/35 bg-indigo-500/20 text-indigo-100",
    accentBorder: "border-indigo-200/85",
    accentBgSoft: "bg-indigo-50/55",
    accentIconBg: "bg-indigo-100 text-indigo-700",
    accentText: "text-indigo-700",
    guaranteeBorder: "border-indigo-200/90",
    guaranteeBg: "from-indigo-50/75 via-purple-50/35 to-white",
    guaranteeTitle: "text-indigo-900",
    codeText: "text-indigo-700",
    buttonBg: "bg-indigo-600 hover:bg-indigo-700",
  },
  sky: {
    heroGradient: "from-sky-950 via-blue-950 to-slate-950",
    heroGlowA: "bg-sky-400/30",
    heroGlowB: "bg-cyan-300/20",
    badgeClass: "border-sky-300/35 bg-sky-500/20 text-sky-100",
    accentBorder: "border-sky-200/85",
    accentBgSoft: "bg-sky-50/55",
    accentIconBg: "bg-sky-100 text-sky-700",
    accentText: "text-sky-700",
    guaranteeBorder: "border-sky-200/90",
    guaranteeBg: "from-sky-50/75 via-blue-50/35 to-white",
    guaranteeTitle: "text-sky-900",
    codeText: "text-sky-700",
    buttonBg: "bg-sky-600 hover:bg-sky-700",
  },
  magenta: {
    heroGradient: "from-pink-950 via-fuchsia-950 to-slate-950",
    heroGlowA: "bg-pink-500/35",
    heroGlowB: "bg-rose-400/20",
    badgeClass: "border-pink-300/35 bg-pink-500/25 text-pink-100",
    accentBorder: "border-pink-200/85",
    accentBgSoft: "bg-pink-50/55",
    accentIconBg: "bg-pink-100 text-pink-700",
    accentText: "text-pink-700",
    guaranteeBorder: "border-pink-200/90",
    guaranteeBg: "from-pink-50/75 via-fuchsia-50/35 to-white",
    guaranteeTitle: "text-pink-900",
    codeText: "text-pink-700",
    buttonBg: "bg-pink-600 hover:bg-pink-700",
  },
  orange: {
    heroGradient: "from-slate-950 via-orange-950 to-amber-950",
    heroGlowA: "bg-orange-400/30",
    heroGlowB: "bg-amber-300/20",
    badgeClass: "border-orange-300/35 bg-orange-500/20 text-orange-100",
    accentBorder: "border-orange-200/85",
    accentBgSoft: "bg-orange-50/55",
    accentIconBg: "bg-orange-100 text-orange-700",
    accentText: "text-orange-700",
    guaranteeBorder: "border-orange-200/90",
    guaranteeBg: "from-orange-50/75 via-amber-50/35 to-white",
    guaranteeTitle: "text-orange-900",
    codeText: "text-orange-700",
    buttonBg: "bg-orange-600 hover:bg-orange-700",
  },
} satisfies Record<string, CarrierTheme>;

const DEFAULT_HIGHLIGHTS = (carrier: string, dialPrefix: string): Array<{ tag: string; title: string; desc: string }> => [
  { tag: "官方直采", title: "正规官方一手卡密", desc: `直连国际持牌上游实时采购 ${carrier} 官方充值卡密，杜绝黑卡与二手回收码风险。` },
  { tag: "秒级发码", title: "7×24h 全自动秒发", desc: "支付成功后系统自动向官方渠道取码，通常 3–15 秒即可在订单页与邮箱查看完整 PIN。" },
  { tag: "免绑外卡", title: "跳过海外信用卡风控", desc: "无需持有英美本土借记卡或账单地址，支持支付宝、微信、余额与 USDT 轻松购买。" },
  { tag: "国内可充", title: "国内漫游自助秒入账", desc: "身处中国大陆也能通过运营商官网或官方 App 远程输入 PIN 码完成话费余额续费。" },
  { tag: "保号利器", title: `稳保 ${dialPrefix} 原生号码`, desc: "及时补充预付费余额并维持账户活跃周期，防止长期无消费导致号码休眠或被回收。" },
  { tag: "免交密码", title: "独立 PIN 全程私密", desc: "无需提供您的手机号密码或短信验证码，收到官方卡密后全程自主在官方页面核销。" },
];

const CARRIER_PROFILES: Record<CarrierKey, CarrierProfile> = {
  "giffgaff-uk": {
    key: "giffgaff-uk",
    carrierName: "Giffgaff 英国",
    englishBadge: "Giffgaff UK Voucher PIN",
    networkBadge: "🇬🇧 英国 O2 底层大网 · 保号神卡",
    countryName: "英国",
    countryCode: "UK / GB",
    dialPrefix: "+44",
    currencyCode: "GBP",
    currencySymbol: "£",
    tagline: "官方 16 位充值卡密 · 0 月租保号续命神器 · 支持新卡免信用卡激活",
    intro:
      "专为英国 Giffgaff（+44）预付费实体卡与 eSIM 提供的正规官方 16 位充值卡密。下单支付后 7×24h 自动发码，无需绑定 Visa/MasterCard 外币卡，即可在 Giffgaff 官网或 App 自助充入 Credit 话费余额或兑换月度流量套餐。",
    keepAliveTip:
      "保号核心提示：Giffgaff 卡片每 180 天需产生一次计费行为（如发 1 条短信约 £0.30）或充值一次，充值 £10 余额即可轻松支撑多年国内漫游免费收验证码！",
    pinFormatLabel: "16 位纯数字官方充值卡密（Voucher Code）",
    pinSample: "4829 - 1034 - 9582 - 7361",
    pinAnatomy: ["① 16位纯数字卡密", "② 实时直采一手新码", "③ 支持新卡 £10 激活", "④ 官网/43430 秒入账"],
    ussdCommand: "英国本地免费拨打 43430 → 按 1 输入 16 位卡密",
    officialUrl: "giffgaff.com/top-up",
    officialHref: "https://www.giffgaff.com/top-up",
    officialChannelLabel: "Giffgaff 官网 / App（Redeem a voucher）或英国本地拨打 43430",
    accountRequirement: "仅限英国 Giffgaff（+44）账号与 SIM 卡，新卡首次激活同样支持使用 £10 及以上卡密",
    theme: THEMES.emerald,
    highlights: [
      { tag: "新卡可激活", title: "支持新卡免外卡首次激活", desc: "手头有全新 Giffgaff 白卡/赠 £5 卡但没外币卡？直接用 £10 卡密即可在官网完成激活开卡。" },
      { tag: "秒级发码", title: "7×24h 自动直采出码", desc: "系统全自动对接官方渠道采购，支付完成后 3–15 秒自动发码至订单详情页与联系邮箱。" },
      { tag: "保号神器", title: "£10 余额轻松保号数年", desc: "充入 Credit 余额后不会自动到期清零，配合每 180 天一次低额计费即可长期稳定持有 +44 号。" },
      { tag: "国内可充", title: "国内直连官网即可兑换", desc: "身处中国大陆无需英国本地信号，打开 giffgaff.com/top-up 或 App 粘贴 16 位码即刻到账。" },
      { tag: "自由切包", title: "余额 / Goodybag 灵活选", desc: "既可留作纯余额 0 月租保号，也可随时在 App 用余额购买英国通话及欧盟漫游月流量包。" },
      { tag: "免交密码", title: "独立卡密安全零泄露", desc: "全程无需向任何人交出 Giffgaff 账号密码，自己复制 16 位 Voucher 码自助核销最放心。" },
    ],
    useCases: [
      {
        title: "长期保号与免费收码",
        badge: "核心高频用途",
        items: [
          { name: "180 天保号延期续命", desc: "充值到账即自动刷新账户活跃周期，防止超半年未消费导致英国号被运营商回收。" },
          { name: "全球平台注册与安全验证", desc: "保持账户保有余额，随时应对 ChatGPT、Telegram、Wise、WhatsApp 等风控核验。" },
        ],
      },
      {
        title: "新卡首次激活开卡",
        badge: "免海外信用卡",
        items: [
          { name: "白卡 / 赠 £5 卡官网开卡", desc: "激活页选择「Activate with a voucher」，输入 £10 卡密直接绕开外币信用卡绑定。" },
          { name: "赠 £5 特权照常叠加", desc: "使用官方 £10 充值卡密激活赠金卡，同样享有官方首充额外赠送 £5 话费福利。" },
        ],
      },
      {
        title: "赴英留学与欧洲漫游",
        badge: "随用随开套餐",
        items: [
          { name: "按需购买月度 Plan 流量包", desc: "到达英国前在 App 用余额选购 30 天无合约套餐，含本地无限通话短信与高速流量。" },
          { name: "支持欧盟 30+ 国漫游", desc: "Giffgaff 月套餐自带欧盟漫游流量配额，英欧自由行无缝切换不断网。" },
        ],
      },
      {
        title: "应急通讯与海外拨打",
        badge: "随时随地备用",
        items: [
          { name: "漫游发短信 / 接听验证语音", desc: "遇到必须主动发一条国际短信验证的银行或平台，有 Credit 余额随时一发即通。" },
          { name: "多张叠加无上限累积", desc: "需要大额充值或长期备足余额时，可连续兑换多张卡密叠加至同一号码。" },
        ],
      },
    ],
    webSteps: [
      { step: "01", title: "登录 Giffgaff 官网或 App", desc: "打开 giffgaff.com/top-up 或 Giffgaff 官方 App，登录您的英国账号（新卡访问 giffgaff.com/activate）。" },
      { step: "02", title: "选择 Redeem a voucher", desc: "在充值方式中点击「Redeem a voucher（使用 16 位充值卡密）」，切勿误点月套餐自动扣款。" },
      { step: "03", title: "粘贴 16 位官方 PIN 码", desc: "完整复制本站订单详情页发放的 16 位纯数字卡密，确认无前后空格后点击提交。" },
      { step: "04", title: "确认 Credit 余额秒到账", desc: "提交后通常 10 秒内即显示充值成功，Giffgaff 同步下发入账短信并刷新账户英镑余额。" },
    ],
    dialSteps: [
      { step: "01", title: "确认手机已插入 Giffgaff 卡", desc: "在英国当地网络信号下使用本机拨号键盘（国内漫游强烈建议直接使用左侧官网方式）。" },
      { step: "02", title: "免费拨打官方充值专线 43430", desc: "直接拨出 43430，英国本地拨打完全免费。" },
      { step: "03", title: "按键选择余额或套餐", desc: "语音接通后按「1」充入纯话费余额（Credit），或按「2」直接兑换月度流量套餐。" },
      { step: "04", title: "输入 16 位数字卡密按 # 确认", desc: "按提示键入 16 位卡密，听到金额确认播报后挂机即完成入账。" },
    ],
    warnings: [
      { title: "仅限英国 Giffgaff（+44）号码", detail: "", desc: "本卡密仅适用于英国 Giffgaff 预付费账号，无法用于 O2、Vodafone 或其他运营商。" },
      { title: "保号务必选择「Add credit 余额」", detail: "", desc: "国内收码保号请勿误选「Buy a plan 月套餐」，否则 30 天到期清零；充入 Credit 余额才可长期留存！" },
      { title: "国内漫游切勿拨打 43430", detail: "", desc: "中国大陆漫游环境下拨打 43430 可能失败或产生高额漫游语音费，直接网页 giffgaff.com/top-up 免费兑换最稳妥。" },
      { title: "一次性数字卡密发码不退换", detail: "", desc: "系统实时向官方渠道采购发码后即具备唯一性，不支持无理由退换；请于发码后 24 小时内完成充值核验。" },
    ].map(({ title, desc }) => ({ title, desc })),
    faqs: [
      { q: "人在中国大陆，没有英国 IP 或外币卡可以顺利充值吗？", a: "完全可以！收到 16 位 PIN 卡密后直接登录 Giffgaff 官网或官方 App 兑换，不需要绑定任何信用卡，国内网络即可秒到账。" },
      { q: "全新未激活的 Giffgaff 实体卡可以用这张卡密首次开卡吗？", a: "可以！官方支持使用 £10 及以上面额的充值卡密进行新卡激活。在官网激活页选择「Pay with a voucher」输入 16 位数字即可。" },
      { q: "充入的余额会过期吗？怎么避免自动扣月租？", a: "只要每 180 天保持至少一次计费活动（发 1 条短信约 £0.30 或充值），Credit 余额永久有效。兑换时请选「Add credit」并确认账户未开启 Auto-renew 即可。" },
      { q: "下单支付后多久能拿到卡密？在哪里查看？", a: "7×24h 全自动直连官方渠道发码，支付成功后通常 3–15 秒自动显示在「我的订单」详情页，同时发送一份到您的联系邮箱。" },
      { q: "可以一次买多张卡密叠加充进同一个号码吗？", a: "可以！依次在官网 Redeem a voucher 输入多张 16 位卡密即可累加至账户总余额。" },
      { q: "兑换时提示卡密无效或报错怎么办？", a: "请先确认输入时未混入多余空格，且手机号未因超 180 天未保号而被官方注销回收；如仍异常请截图报错并在 24 小时内联系在线客服核查。" },
    ],
  },
  "vodafone-uk": {
    key: "vodafone-uk",
    carrierName: "Vodafone 英国",
    englishBadge: "Vodafone UK Top-up PIN",
    networkBadge: "🇬🇧 英国沃达丰原生大网 · Pay As You Go",
    countryName: "英国",
    countryCode: "UK / GB",
    dialPrefix: "+44",
    currencyCode: "GBP",
    currencySymbol: "£",
    tagline: "沃达丰英国官方充值 PIN · 支持 Pay As You Go 余额 & Big Value 套餐",
    intro:
      "适用于英国 Vodafone（+44）Pay As You Go 预付费实体卡与 eSIM 的官方直采充值卡密。免绑英国银行卡，支付后 7×24h 自动发码，支持 My Vodafone App、官网及官方拨号快速入账。",
    keepAliveTip:
      "国家隔离必看：本商品专用于【英国 Vodafone UK（+44 / 英镑 GBP）】预付费号码，严禁用于西班牙 Vodafone（+34 / 欧元）或其他国家子网！",
    pinFormatLabel: "12 / 16 位官方充值 PIN 卡密（Top-up Voucher）",
    pinSample: "7391 - 4820 - 6153",
    pinAnatomy: ["① 官方充值 PIN 码", "② 仅限英国 +44 区", "③ 官网 / 2345 兑换", "④ 余额 & 套餐两用"],
    ussdCommand: "英国本地免费拨打 2345 按提示输入 PIN",
    officialUrl: "vodafone.co.uk/top-up",
    officialHref: "https://www.vodafone.co.uk/mobile/pay-as-you-go-plans/top-up",
    officialChannelLabel: "My Vodafone App / 官网或英国本地拨打 2345",
    accountRequirement: "仅限英国区 Vodafone UK（+44）Pay As You Go 预付费号码（不支持合约月结账单）",
    theme: THEMES.crimson,
    highlights: DEFAULT_HIGHLIGHTS("Vodafone UK", "+44"),
    useCases: [
      {
        title: "保号续费与漫游收码",
        badge: "维持号码活跃",
        items: [
          { name: "延长 180 天号码有效期", desc: "补充预付费英镑余额并产生计费活动，避免英国 +44 号码休眠被运营商回收。" },
          { name: "海外短信验证码稳定备用", desc: "保有账户余额即可随时发送漫游短信或应对高风控平台核验。" },
        ],
      },
      {
        title: "续订英国本地流量套餐",
        badge: "赴英留学商旅",
        items: [
          { name: "兑换 Big Value Bundle 套餐", desc: "余额到账后直接在 My Vodafone App 开启 30 天大流量与本地无限通话包。" },
          { name: "欧盟及热门目的地漫游", desc: "配合英国沃达丰漫游通行证，欧洲多国出行无缝上网。" },
        ],
      },
      {
        title: "免外币卡自助入账",
        badge: "零支付风控",
        items: [
          { name: "跳过英国账单地址校验", desc: "解决国内双币信用卡在英国官网频频拒付的痛点，官方 PIN 稳定入账。" },
          { name: "£5 起多档面额按需选", desc: "小额轻量保号或大额买包均可灵活匹配，资金占用低。" },
        ],
      },
      {
        title: "异地远程代充续费",
        badge: "7×24h 随买随充",
        items: [
          { name: "亲友英国手机号远程缴费", desc: "只需在官网输入待充值的 +44 号码与 PIN 码即可轻松帮家人/留学生续费。" },
          { name: "多张叠加无上限", desc: "支持多张卡密连续兑换累加至同一 Pay As You Go 账户余额。" },
        ],
      },
    ],
    webSteps: [
      { step: "01", title: "打开 My Vodafone App 或官网", desc: "访问英国官网 vodafone.co.uk/top-up 或登录 My Vodafone 官方 App。" },
      { step: "02", title: "选择 Top up with a voucher", desc: "在充值方式中勾选「TopUp Voucher（充值卡密）」，输入您的英国 +44 号码。" },
      { step: "03", title: "粘贴官方充值 PIN 码", desc: "复制本站自动发放的 PIN 数字，核对号码与位数无误后提交。" },
      { step: "04", title: "等待官方短信确认到账", desc: "余额将在数秒至 1 分钟内刷新，可在 App 首页即时查看最新英镑余额。" },
    ],
    dialSteps: [
      { step: "01", title: "在英国本地网络打开拨号盘", desc: "使用已插卡的 Vodafone UK 手机（国内漫游请优先使用左侧官网/App 方式）。" },
      { step: "02", title: "免费拨打官方热线 2345", desc: "直接呼出 2345 进入 Vodafone Pay As You Go 自助充值语音系统。" },
      { step: "03", title: "选择 Voucher 卡密充值", desc: "按语音指引选择使用 Top-up Voucher 充值选项。" },
      { step: "04", title: "输入完整 PIN 码按 # 确认", desc: "语音播报入账金额成功后挂机，随后查收官方余额更新短信。" },
    ],
    warnings: [
      { title: "严格区分英国 Vodafone（+44）与西班牙 Vodafone（+34）", desc: "本站同时销售西班牙 Vodafone 实体卡（+34），本充值卡密【仅支持英国 Vodafone UK（+44）】，跨国完全不通用！" },
      { title: "仅限 Pay As You Go 预付费账户", desc: "英国 Vodafone 合约月结账单（Pay Monthly）不支持使用此 PIN 卡密抵扣。" },
      { title: "核对号码未超期注销", desc: "若号码超过 180 天无计费活动已被运营商收回，卡密将无法兑换到账。" },
      { title: "一次性数字卡密发码不退换", desc: "系统实时直采发码后不支持无理由退换，请于 24 小时内完成兑换核验。" },
    ],
    faqs: [
      { q: "我的西班牙 Vodafone（+34）卡能用这张充值卡吗？", a: "绝对不可以！这是英国 Vodafone UK（+44 / GBP）专用卡密，与西班牙 Vodafone（+34 / EUR）分属不同国家系统，无法互通。" },
      { q: "充值后会自动扣月套餐吗？", a: "若您的号码此前开启了 Big Value Bundle 自动续费，余额达标后会自动扣缴；如只需纯余额保号，请先在 App 关闭自动续费。" },
      { q: "在国内可以远程给英国 Vodafone 充值吗？", a: "可以，通过 My Vodafone App 或英国官网自助兑换即可；若官网加载受限，切换英国节点后再操作。" },
      { q: "英国 Vodafone 多久需要充一次或用一次保号？", a: "官方通常要求每 180 天至少产生一次计费行为（发短信/通话/流量或充值）以维持号码有效。" },
      { q: "下单支付后多久自动发码？", a: "全自动直连官方渠道采购，支付完成后 3–15 秒自动发码至订单页与您的联系邮箱。" },
      { q: "兑换时提示报错怎么处理？", a: "请核对号码归属为英国 +44 预付费号且输入无空格，保留报错截图并在 24 小时内联系在线客服核查。" },
    ],
  },
  "ee-uk": {
    key: "ee-uk",
    carrierName: "EE 英国",
    englishBadge: "EE UK Pay As You Go PIN",
    networkBadge: "🇬🇧 英国第一覆盖 5G 网络 · 短信直充",
    countryName: "英国",
    countryCode: "UK / GB",
    dialPrefix: "+44",
    currencyCode: "GBP",
    currencySymbol: "£",
    tagline: "英国覆盖率冠军 EE 官方充值卡密 · 支持官网与短信 VO 直充",
    intro:
      "适用于英国最大 5G 运营商 EE（+44）Pay As You Go 预付费号码的官方 16 位充值卡密。支持 £5 起多档英镑面额，免绑英国银行卡，秒级自动发码，轻松完成账户余额补充与 Data Pack 流量续订。",
    keepAliveTip:
      "便捷提示：英国本地发送短信「VO + 空格 + 16位卡密」至 150 即可 5 秒直充；人在国内漫游登录 ee.co.uk/topup 或 EE App 同样秒入账！",
    pinFormatLabel: "16 位官方 EE 充值 PIN 卡密（Top-up Voucher）",
    pinSample: "6194 - 2850 - 7319 - 4028",
    pinAnatomy: ["① 16位官方PIN码", "② 仅限英国 EE (+44)", "③ 短信 VO 至 150", "④ 官网/App 秒到账"],
    ussdCommand: "发送短信 VO <16位卡密> 至 150 或拨打 150",
    officialUrl: "ee.co.uk/topup",
    officialHref: "https://ee.co.uk/help/mobile/top-up/top-up-my-pay-as-you-go-phone",
    officialChannelLabel: "EE App / 官网 ee.co.uk/topup 或短信/拨打 150",
    accountRequirement: "仅限英国 EE（+44）Pay As You Go 预付费实体卡或 eSIM 账号",
    theme: THEMES.teal,
    highlights: DEFAULT_HIGHLIGHTS("EE UK", "+44"),
    useCases: [
      {
        title: "维持英国原生 EE 号码活跃",
        badge: "保号续命",
        items: [
          { name: "180 天保号延期", desc: "定期小额补充英镑余额并产生计费活动，保护英国本土高权重 +44 实体号码。" },
          { name: "国内漫游稳定收码", desc: "保持 EE 预付费账户状态正常，应对海外银行与主流平台短信验证。" },
        ],
      },
      {
        title: "留学落地高速 5G 套餐",
        badge: "英国最强信号",
        items: [
          { name: "选购 30 天 Data / Calls Pack", desc: "余额到账后即可在 EE App 选购高速 5G 流量包，英国地铁与郊区信号覆盖领先。" },
          { name: "免英国借记卡直接续费", desc: "新生初到英国尚未办下当地银行卡时，用 PIN 卡密即可无缝续期话费。" },
        ],
      },
      {
        title: "绕开外币信用卡账单风控",
        badge: "100% 稳定入账",
        items: [
          { name: "告别官网刷外卡拒付", desc: "EE 官网对非英国发行的银行卡校验极严，官方 Voucher PIN 彻底跳过风控。" },
          { name: "£5 起多档面额任选", desc: "覆盖小额保号与常规大流量套餐全档位，透明清晰。" },
        ],
      },
      {
        title: "多通道极速自助核销",
        badge: "官网 / 短信双通道",
        items: [
          { name: "发一条短信即充即到", desc: "英国本地编辑「VO + 卡密」发送至 150，无需登录网页 5 秒入账。" },
          { name: "发送 AL 至 150 随时查余额", desc: "随时掌控余额与剩余流量，不怕突然停机断网。" },
        ],
      },
    ],
    webSteps: [
      { step: "01", title: "打开 EE 官网充值页或 App", desc: "访问 ee.co.uk/topup 或启动手机上的官方 EE App，登录您的 Pay As You Go 账号。" },
      { step: "02", title: "选择 Voucher 充值卡密", desc: "点击「Top up with a voucher」，核对需要充值的英国 +44 手机号码。" },
      { step: "03", title: "粘贴 16 位官方 PIN 码", desc: "完整输入本站自动发放的 16 位数字卡密，确认无误后点击提交。" },
      { step: "04", title: "查收官方入账短信与余额", desc: "余额秒级入账，随后可在 App 决定留存保号余额或兑换 Data Pack 套餐。" },
    ],
    dialSteps: [
      { step: "01", title: "短信直充（英国本地推荐）", desc: "本机编辑短信「VO 1234567890123456」（VO 加空格加 16 位卡密）发送至 150。" },
      { step: "02", title: "或免费拨打 150 语音充值", desc: "拨打 150 接通语音菜单后选择「Top up with a voucher」。" },
      { step: "03", title: "按语音指引输入 16 位卡密", desc: "依次输入 16 位数字卡密并按确认键提交。" },
      { step: "04", title: "发送 AL 至 150 核验余额", desc: "收到官方入账回执短信即完成，发短信 AL 到 150 可随时查询余额。" },
    ],
    warnings: [
      { title: "仅限英国 EE Pay As You Go 预付费卡", desc: "不支持 EE 合约月结账单（Pay Monthly）及非英国区其他运营商。" },
      { title: "国内漫游优先使用官网/App 兑换", desc: "漫游状态下发送短信至 150 可能失效或产生国际短信费，请直接登录 EE App 或官网网页充值。" },
      { title: "留意 180 天保号活跃要求", desc: "EE 预付费卡每 180 天需至少产生一次计费行为（发短信/通话/流量）方可维持号码有效。" },
      { title: "一次性 PIN 卡密发码不退换", desc: "发码后不支持无理由退换，建议于 24 小时内完成核验充值。" },
    ],
    faqs: [
      { q: "为什么在 EE 官网绑定国内 Visa/MasterCard 经常支付失败？", a: "EE 支付系统严格校验英国本地银行发卡行与账单邮编（AVS），使用官方 16 位充值卡密可直接跳过银行卡风控稳定入账。" },
      { q: "充值卡密是直接变成余额还是自动开通套餐？", a: "默认充入您的 EE Pay As You Go 话费余额（Credit），随后可在 EE App 自主选择留作保号余额或购买月度 Data Pack。" },
      { q: "国内漫游环境下可以登录 EE App 兑换吗？", a: "可以！已开通漫游的 EE 号码在国内可接收登录短信，登录 App 或官网即可完成充值。" },
      { q: "下单支付后多久能收到卡密？", a: "7×24h 全自动直采，支付成功后 3–15 秒即可在「我的订单」及联系邮箱查看完整 PIN。" },
      { q: "多张卡密可以连续充值叠加余额吗？", a: "可以，依次兑换多张卡密即可累加至账户总余额。" },
      { q: "兑换时报错怎么办？", a: "请检查号码归属与卡密位数，确保无多余空格；如仍有异常请 24 小时内保留截图联系在线客服。" },
    ],
  },
  "three-uk": {
    key: "three-uk",
    carrierName: "Three (3) 英国",
    englishBadge: "Three UK Pay As You Go PIN",
    networkBadge: "🇬🇧 英国 Three 原生大网 · Go Roam 漫游",
    countryName: "英国",
    countryCode: "UK / GB",
    dialPrefix: "+44",
    currencyCode: "GBP",
    currencySymbol: "£",
    tagline: "英国 Three (3) 官方 16 位充值卡密 · 全球 70+ 国 Go Roam 漫游好搭档",
    intro:
      "专为英国 Three（3 UK，+44）Pay As You Go 预付费手机卡提供的官方 16 位充值卡密。免绑英国信用卡，支持通过 Three 官网、App 或拨打 444 自助兑换，兼顾国内长期保号与海外 Go Roam 流量包续费。",
    keepAliveTip:
      "特别区分：本卡密仅适用于【英国 Three UK（+44 / 英镑 GBP）】，不适用于中国香港 3HK（+852 / 港币）储值卡！",
    pinFormatLabel: "16 位官方 Three UK 充值 PIN 卡密",
    pinSample: "5208 - 9173 - 4620 - 8351",
    pinAnatomy: ["① 16位官方PIN码", "② 仅限英国 3UK (+44)", "③ 官网 / 444 兑换", "④ 支持 Go Roam 套餐"],
    ussdCommand: "英国本地免费拨打 444 按提示输入 16 位卡密",
    officialUrl: "three.co.uk/top-up",
    officialHref: "https://www.three.co.uk/pay-as-you-go/top-up",
    officialChannelLabel: "Three App / 官网 three.co.uk/top-up 或拨打 444",
    accountRequirement: "仅限英国区 Three UK（+44）Pay As You Go 预付费号码（严禁用于香港 3HK）",
    theme: THEMES.indigo,
    highlights: DEFAULT_HIGHLIGHTS("Three UK", "+44"),
    useCases: [
      {
        title: "英国 +44 号码长期保号",
        badge: "低成本续命",
        items: [
          { name: "延续预付费号码活跃周期", desc: "定期补充英镑余额并保持 180 天内产生一次低额计费，稳保 Three 原生实体号。" },
          { name: "海外注册验证码随时接收", desc: "保持账户正常状态，满足社媒、金融与云服务的短信安全核验。" },
        ],
      },
      {
        title: "Go Roam 全球漫游流量",
        badge: "出国商旅首选",
        items: [
          { name: "兑换 Three Data Pack 流量包", desc: "余额入账后可在 My3 面板选购 30 天高流量 Data Pack，无合约随时开关。" },
          { name: "支持欧美澳等 70+ 国漫游", desc: "配合 Go Roam 漫游特性，跨国差旅与自由行无需频繁换卡。" },
        ],
      },
      {
        title: "免英国银行卡自助充值",
        badge: "跳过支付限制",
        items: [
          { name: "免除 UK 银行卡 AVS 校验", desc: "无需办理英国本地银行卡，国内支付宝/微信/USDT 即可买官方 PIN 码。" },
          { name: "£10 起多档英镑面额", desc: "涵盖基础保号与高配月包档位，透明实惠。" },
        ],
      },
      {
        title: "远程充值与多卡叠加",
        badge: "灵活便捷",
        items: [
          { name: "官网输入手机号即可代充", desc: "人在国内也可直接为亲友或留学用的 Three UK 手机号远程充值。" },
          { name: "支持多张卡密连续入账", desc: "多次兑换自动累加账户 Credit 余额，无限制。" },
        ],
      },
    ],
    webSteps: [
      { step: "01", title: "访问 Three UK 官网或 App", desc: "打开浏览器访问 three.co.uk/top-up 或打开官方 Three App，输入英国 +44 手机号。" },
      { step: "02", title: "勾选 Use a top-up voucher", desc: "在支付选项中选择「Use a top-up voucher（使用 16 位充值卡密）」。" },
      { step: "03", title: "粘贴 16 位官方充值 PIN", desc: "完整填入本站自动交付的 16 位卡密数字，核对号码无误后提交。" },
      { step: "04", title: "确认余额到账并按需买包", desc: "英镑余额秒级到账，可留存保号或前往 My3 面板选购 Data Pack。" },
    ],
    dialSteps: [
      { step: "01", title: "插入 Three UK SIM 卡", desc: "在英国当地网络下使用本机拨号盘（国内漫游请直接使用左侧官网兑换）。" },
      { step: "02", title: "免费拨打官方热线 444", desc: "直接呼出 444 进入 Three Pay As You Go 语音自助服务。" },
      { step: "03", title: "选择 Voucher 充值选项", desc: "按语音菜单提示进入 16 位 Top-up Voucher 兑换通道。" },
      { step: "04", title: "输入 16 位 PIN 码完成入账", desc: "输入完整数字确认后挂机，即刻收到官方入账短信。" },
    ],
    warnings: [
      { title: "严禁用于中国香港 3HK（+852）", desc: "本卡密仅适用于【英国 Three UK（+44 / GBP）】，与香港 3HK / DIY 万能卡分属不同体系，不能互通！" },
      { title: "仅支持 Pay As You Go 预付费账户", desc: "Three 英国后付费月结账单（Pay Monthly）不支持使用此卡密。" },
      { title: "注意 180 天活跃保号期限", desc: "请确保号码未超期注销，并保持每 180 天至少一次计费消费或充值。" },
      { title: "一次性数字商品发码不退换", desc: "官方直采发码具有唯一性，请确认归属英国 Three 后下单，24 小时内完成核验。" },
    ],
    faqs: [
      { q: "我的香港 3HK 万能卡可以用这张 Three 充值卡吗？", a: "不可以！本商品是英国 Three UK（+44 / 英镑）充值卡密，无法充值香港 3HK（+852 / 港币）号码。" },
      { q: "充值后如何用余额购买 Data Pack？", a: "余额入账后登录 My3 官网或 Three App，进入「Buy a Data Pack」选择使用账户 Credit 支付即可。" },
      { q: "身处国内可以给 Three UK 充值吗？", a: "可以！直接通过 three.co.uk 官网的 Top-up with Voucher 页面输入手机号与 16 位卡密即可远程入账。" },
      { q: "支付后多久发货？", a: "7×24h 自动直采发码，付款后 3–15 秒即可在订单页与联系邮箱获取 PIN 码。" },
      { q: "卡密有使用期限吗？", a: "均为下单时实时采购的新鲜官方卡密，但为保障核验与售后时效，建议 24 小时内完成充值。" },
      { q: "兑换提示报错怎么售后？", a: "请确认号码属英国 Three 预付费号且未销号，截图报错并在 24 小时内联系在线客服排查。" },
    ],
  },
  "lebara-uk": {
    key: "lebara-uk",
    carrierName: "Lebara 英国",
    englishBadge: "Lebara Mobile UK PIN",
    networkBadge: "🇬🇧 英国 Vodafone 基站 · 国际通话优选",
    countryName: "英国",
    countryCode: "UK / GB",
    dialPrefix: "+44",
    currencyCode: "GBP",
    currencySymbol: "£",
    tagline: "英国 Lebara 官方直采充值卡密 · 支持 *1345*PIN# 一键直充",
    intro:
      "适用于英国 Lebara Mobile（+44）预付费手机卡的官方 16 位充值 PIN 卡密。依托英国 Vodafone 优质信号，主打极低国际长途资费与灵活 30 天无合约套餐，支持官网、MyLebara App 及 *1345*PIN# 快捷直充。",
    keepAliveTip:
      "国家隔离提醒：Lebara 在英/德/法/荷等多国均有运营，本卡密仅限【英国英镑区 Lebara UK（+44 / lebara.co.uk）】使用！",
    pinFormatLabel: "16 位官方 Lebara UK 充值卡密（Top-up Voucher）",
    pinSample: "8472 - 3910 - 5624 - 1893",
    pinAnatomy: ["① 16位官方PIN码", "② 仅限英国 +44 区", "③ 拨号 *1345*PIN#", "④ 余额查 *#1345#"],
    ussdCommand: "本机拨号输入 *1345*16位卡密# 或拨打 5588",
    officialUrl: "lebara.co.uk/en/top-up",
    officialHref: "https://www.lebara.co.uk/en/top-up.html",
    officialChannelLabel: "MyLebara App / 官网或本机拨号 *1345*PIN#",
    accountRequirement: "仅限英国区 Lebara UK（+44）预付费账户（不适用于法国/德国/荷兰等其他国家 Lebara）",
    theme: THEMES.sky,
    highlights: DEFAULT_HIGHLIGHTS("Lebara UK", "+44"),
    useCases: [
      {
        title: "低门槛维护英国 +44 号码",
        badge: "保号续费",
        items: [
          { name: "£5 小额起步轻松保号", desc: "无需大额投入，定期小额充值即可稳稳维持英国原生手机号码活跃。" },
          { name: "接收海内外短信验证码", desc: "依托 Vodafone 稳定网络，确保海外账号绑定与验证短信稳定送达。" },
        ],
      },
      {
        title: "留学生国际长途通话",
        badge: "直拨国内超低价",
        items: [
          { name: "高性价比直拨中国与 40+ 国", desc: "Lebara 专为跨境族群设计，套餐多含免费国际分钟数，联系国内家人更省心。" },
          { name: "30 天无合约灵活套餐", desc: "余额到账后可在 MyLebara App 随时选购适合自己的流量+通话组合。" },
        ],
      },
      {
        title: "快捷 USSD 码 5 秒直充",
        badge: "极简操作",
        items: [
          { name: "拨号 *1345*PIN# 一键到账", desc: "英国本地无需打开网页，拨号盘输入快捷指令 5 秒完成余额入账。" },
          { name: "拨号 *#1345# 免费查余额", desc: "随时掌控账户英镑余量，不怕意外停机。" },
        ],
      },
      {
        title: "免外币卡全球远程续费",
        badge: "国内可用",
        items: [
          { name: "绕开英国本土借记卡要求", desc: "国内支付购买官方 PIN 码，解决跨境支付失败难题。" },
          { name: "官网 / App 随时远程核销", desc: "身处国内同样支持通过 lebara.co.uk 网页完成自助充值。" },
        ],
      },
    ],
    webSteps: [
      { step: "01", title: "登录 Lebara UK 官网或 App", desc: "访问英国官网 lebara.co.uk（确认域名为 .co.uk）或打开 MyLebara App 登录。" },
      { step: "02", title: "进入 Voucher Top-up 入口", desc: "在菜单点击「Top Up」，选择「Redeem Voucher（卡密兑换）」通道。" },
      { step: "03", title: "输入 16 位官方卡密 PIN", desc: "粘贴本站订单页自动发放的 16 位数字卡密，核对号码后提交确认。" },
      { step: "04", title: "核对账户英镑余额到账", desc: "提交后数秒即可入账，随后可在账户内留存余额或选购月度套餐。" },
    ],
    dialSteps: [
      { step: "01", title: "打开 Lebara UK 本机拨号盘", desc: "确保手机已插入英国 Lebara 卡并接入当地信号。" },
      { step: "02", title: "输入 USSD 指令 *1345*PIN#", desc: "输入 *1345*16位卡密# 后按呼叫键（或免费拨打 5588 按语音提示操作）。" },
      { step: "03", title: "查收系统弹窗与短信回执", desc: "数秒内屏幕弹出充值成功提示并刷新账户余额。" },
      { step: "04", title: "随时拨打 *#1345# 查余额", desc: "日常免费拨打 *#1345# 即可实时核对余额与有效期。" },
    ],
    warnings: [
      { title: "仅限英国区 Lebara UK（+44）", desc: "德国、法国、荷兰、澳洲等国 Lebara 系统各自独立，本卡密仅适用于英国英镑区 lebara.co.uk！" },
      { title: "确认号码未超期注销", desc: "请先确认您的英国号处于有效状态，长期停用已被运营商回收的号码无法入账。" },
      { title: "国内漫游推荐官网/App 兑换", desc: "人在国内如 USSD 指令无法发送，请直接登录 MyLebara App 或英国官网网页兑换。" },
      { title: "一次性数字卡密发码不退换", desc: "官方实时直采发码后不支持无理由退换，请于 24 小时内完成充值核验。" },
    ],
    faqs: [
      { q: "德国或荷兰的 Lebara 手机卡可以用这张卡密吗？", a: "不可以！Lebara 各国卡密严格按国家隔离，本商品仅适用于英国 Lebara UK（+44 / GBP）。" },
      { q: "怎么查英国 Lebara 当前剩余话费？", a: "在手机拨号盘输入 *#1345# 呼出，或登录 MyLebara App 即可查看实时余额。" },
      { q: "充值 £5 后可以直接买流量套餐吗？", a: "可以！余额入账后可在 App 内选购对应面额的 30 天 SIM-only 套餐，也可留作余额保号。" },
      { q: "下单支付后多久自动发码？", a: "7×24h 全自动直采发码，支付成功后约 3–15 秒即可在订单页与联系邮箱查看卡密。" },
      { q: "多张充值卡可以叠加充入同一个号码吗？", a: "支持，依次兑换即可累加至您的 Lebara 账户余额。" },
      { q: "兑换遇到报错怎么办？", a: "请确认访问的是英国站点 lebara.co.uk 且未夹杂空格；如仍异常请 24 小时内截图联系在线客服。" },
    ],
  },
  "lyca-uk": {
    key: "lyca-uk",
    carrierName: "Lyca Mobile 英国",
    englishBadge: "Lyca Mobile UK Top-up PIN",
    networkBadge: "🇬🇧 英国 EE 底层网络 · 拨号 *131*PIN#",
    countryName: "英国",
    countryCode: "UK / GB",
    dialPrefix: "+44",
    currencyCode: "GBP",
    currencySymbol: "£",
    tagline: "英国 Lyca Mobile 官方充值 PIN · 支持 *131*PIN# 一键直充",
    intro:
      "适用于英国 Lyca Mobile（+44）预付费手机卡的官方直采充值卡密。依托英国 EE 高速网络，支持 £5 起多档英镑面额，无需绑定英国银行卡，通过官网、App 或拨号指令 *131*PIN# 即可秒速入账。",
    keepAliveTip:
      "国家隔离提醒：本商品为【英国区 Lyca Mobile UK（+44 / GBP）】专用；如您使用的是美国 Lyca Mobile（+1 / USD），请选择本站「Lyca Mobile 美国话费充值卡」！",
    pinFormatLabel: "12–16 位官方 Lyca Mobile UK 充值卡密",
    pinSample: "3915 - 8042 - 6719",
    pinAnatomy: ["① 官方充值 PIN 码", "② 仅限英国 +44 区", "③ 拨号 *131*PIN#", "④ 余额查 *131#"],
    ussdCommand: "本机拨号输入 *131*PIN# 或拨打 321",
    officialUrl: "lycamobile.co.uk/en/quick-top-up",
    officialHref: "https://www.lycamobile.co.uk/en/quick-top-up/",
    officialChannelLabel: "Lyca Mobile UK 官网（lycamobile.co.uk）或拨号 *131*PIN#",
    accountRequirement: "仅限英国区 Lyca Mobile UK（+44）预付费号码（严禁与美国区 Lyca 混用）",
    theme: THEMES.sky,
    highlights: DEFAULT_HIGHLIGHTS("Lyca Mobile UK", "+44"),
    useCases: [
      {
        title: "低成本英国 +44 保号",
        badge: "小额灵活",
        items: [
          { name: "£5 起步延长号码周期", desc: "支持小额英镑补充余额，轻松维护英国预付费手机号不过期。" },
          { name: "跨境注册验证码稳定接收", desc: "保持账户活跃，应对海外金融、电商及主流社交软件核验。" },
        ],
      },
      {
        title: "赴英留学与国际长途",
        badge: "高性价比套餐",
        items: [
          { name: "依托 EE 英国高速网络", desc: "信号稳定，余额入账后可在 App 选购 UK Plan 与大流量套餐。" },
          { name: "国际通话资费亲民", desc: "直拨中国及多国资费优惠，非常适合在英留学生与商旅人士。" },
        ],
      },
      {
        title: "USSD 指令极速直充",
        badge: "5 秒到账",
        items: [
          { name: "拨号 *131*PIN# 立即核销", desc: "英国本地无需登录网页，一条指令即可瞬间入账。" },
          { name: "拨号 *131# 随时查余量", desc: "余额与套餐到期时间一目了然。" },
        ],
      },
      {
        title: "免外币卡随时自助充值",
        badge: "国内可用",
        items: [
          { name: "告别境外卡扣款失败", desc: "国内常见支付方式直接购码，零外币卡门槛。" },
          { name: "官网远程自助兑换", desc: "人在国内也可登录 lycamobile.co.uk 网页轻松完成充值。" },
        ],
      },
    ],
    webSteps: [
      { step: "01", title: "打开 Lyca Mobile UK 官网", desc: "访问英国官网 lycamobile.co.uk（确认域名为 .co.uk）或打开 My Lyca App。" },
      { step: "02", title: "选择 Voucher PIN 充值方式", desc: "进入 Quick Top-up 充值页，选择使用充值卡密（Voucher PIN）兑换。" },
      { step: "03", title: "输入英国号码与官方 PIN", desc: "准确填写您的英国 +44 手机号及本站发放的充值卡密并提交。" },
      { step: "04", title: "确认英镑余额实时入账", desc: "提交后数秒即可入账，可拨打 *131# 或登录 App 查看余额。" },
    ],
    dialSteps: [
      { step: "01", title: "使用已插卡本机打开拨号盘", desc: "在英国当地网络下使用 Lyca UK 本机操作（国内漫游推荐左侧官网）。" },
      { step: "02", title: "拨打快捷充值指令 *131*PIN#", desc: "输入 *131*收到的PIN码# 后呼出（也可免费拨打 321 按语音指引充值）。" },
      { step: "03", title: "查收弹窗与短信回执", desc: "指令执行后系统即返回充值成功提示与最新英镑余额。" },
      { step: "04", title: "查询余额指令 *131#", desc: "随时拨打 *131# 即可核对账户当前余额。" },
    ],
    warnings: [
      { title: "严禁与美国 Lyca Mobile（+1）混用", desc: "英国 Lyca（.co.uk / 英镑）与美国 Lyca（.us / 美元）完全隔离，下单前务必确认区号为 +44！" },
      { title: "确认号码处于正常有效状态", desc: "若号码因长期停用被运营商回收注销，卡密将无法兑换入账。" },
      { title: "国内漫游推荐官网/App 兑换", desc: "漫游状态下 USSD 代码可能受限，直接登录英国官网或 App 核销更稳定。" },
      { title: "一次性 PIN 码发码不退换", desc: "官方实时直采发码不可撤销，请于 24 小时内完成充值核验。" },
    ],
    faqs: [
      { q: "美国 Lyca Mobile（+1）能用这张英国卡密吗？", a: "不能！本商品仅限英国 Lyca Mobile UK（+44 / GBP），美国区请在本站选择「Lyca Mobile 美国话费充值卡」。" },
      { q: "怎么查询 Lyca UK 当前余额？", a: "英国本机拨打 *131# 或登录 My Lyca UK App 即可实时查看。" },
      { q: "充值后可以直接购买 UK 月度套餐吗？", a: "可以！余额入账后在 App 或官网选择使用账户 Credit 购买对应月度流量/通话包即可。" },
      { q: "下单支付后多久自动发码？", a: "7×24h 自动直采发码，支付成功后约 3–15 秒自动显示在订单页并同步发送至您的联系邮箱。" },
      { q: "多张充值卡密可以连续叠加吗？", a: "可以，依次输入兑换即可累计到同一号码的余额中。" },
      { q: "兑换报错怎么售后？", a: "请确认在英国站 lycamobile.co.uk 操作且无空格，如仍异常请 24 小时内截图联系在线客服。" },
    ],
  },
  "tmobile-us": {
    key: "tmobile-us",
    carrierName: "T-Mobile 美国",
    englishBadge: "T-Mobile US Prepaid Refill PIN",
    networkBadge: "🇺🇸 美国三大原生大网 · Prepaid 预付费",
    countryName: "美国",
    countryCode: "US",
    dialPrefix: "+1",
    currencyCode: "USD",
    currencySymbol: "$",
    tagline: "美国 T-Mobile 官方 Prepaid 充值 PIN · 支持 PayGo / Connect 续费",
    intro:
      "专为美国 T-Mobile Prepaid（+1）预付费手机卡提供的正规官方 Refill PIN 充值卡密。彻底绕开美区信用卡与账单地址风控，支付后 7×24h 自动发码，轻松给 T-Mobile 预付费账户续费保号或自动抵扣月租！",
    keepAliveTip:
      "账户类型必看：本商品适用于【T-Mobile 原生 Prepaid 预付费账户】（含 T-Mobile Connect / 老版 PayGo）。不适用于 Postpaid 后付费合约账单或 Ultra Mobile 独立体系！",
    pinFormatLabel: "14 位官方 T-Mobile Prepaid Refill PIN 卡密",
    pinSample: "5842 - 9031 - 7462 - 19",
    pinAnatomy: ["① 14位官方 Refill PIN", "② 仅限 Prepaid 预付费", "③ 拨号 *233*PIN#", "④ 到期自动抵扣月租"],
    ussdCommand: "拨号输入 *233*PIN#（即 *ADD*PIN#）",
    officialUrl: "prepaid.t-mobile.com",
    officialHref: "https://prepaid.t-mobile.com/direct-to-account",
    officialChannelLabel: "T-Mobile Prepaid 官网（prepaid.t-mobile.com）或拨号 *233*PIN#",
    accountRequirement: "仅限美国 T-Mobile Prepaid 预付费账户（不支持 Postpaid 后付费账单 / Metro / Mint）",
    theme: THEMES.magenta,
    highlights: DEFAULT_HIGHLIGHTS("T-Mobile US", "+1"),
    useCases: [
      {
        title: "美国原生预付费月租续费",
        badge: "自动余额扣缴",
        items: [
          { name: "T-Mobile Connect / PayGo 续费", desc: "提前充入美元余额，套餐到期日系统优先从账户余额自动扣款，防止停机。" },
          { name: "稳保 +1 美国实体大网号", desc: "美区银行、PayPal、OpenAI 对原生实体号信誉度最高，按期续费保号不断联。" },
        ],
      },
      {
        title: "彻底绕开美卡风控拦截",
        badge: "零信用卡门槛",
        items: [
          { name: "解决官网拒付国内双币卡", desc: "T-Mobile 官网经常拦截非美区发卡行及 AVS 账单地址，使用 Refill PIN 100% 稳定入账。" },
          { name: "足额美元入账清晰透明", desc: "按购买面额直充美元余额，无隐性订阅扣费。" },
        ],
      },
      {
        title: "Wi-Fi Calling 漫游收码",
        badge: "国内可用",
        items: [
          { name: "支持国内 Wi-Fi Calling 拨号", desc: "开启 Wi-Fi Calling 后在国内同样可拨打 *233*PIN# 快捷充值与 #225# 查余额。" },
          { name: "官网网页远程秒入账", desc: "配合美区网络打开 prepaid.t-mobile.com 即可随时在线核销 PIN 码。" },
        ],
      },
      {
        title: "赴美留学与商旅应急",
        badge: "7×24h 秒级交付",
        items: [
          { name: "半夜停机 1 分钟自救复机", desc: "全天候自动发码，随时随地自助买码入账恢复高速 5G 上网与通话。" },
          { name: "多档美元面额灵活组合", desc: "多张 Refill PIN 可连续兑换累加至同一账户余额。" },
        ],
      },
    ],
    webSteps: [
      { step: "01", title: "登录 T-Mobile Prepaid 官网", desc: "配合美区网络访问 prepaid.t-mobile.com，登录您的美国 T-Mobile 预付费账户。" },
      { step: "02", title: "进入 Refill / Redeem PIN", desc: "在账户首页点击「Refill」，支付方式选择「Refill Card / PIN」。" },
      { step: "03", title: "输入 14 位官方 Refill PIN", desc: "粘贴本站自动交付的 PIN 码，核对手机号与金额无误后点击 Submit。" },
      { step: "04", title: "确认美元余额秒级入账", desc: "数秒内账户 Balance 即会增加对应美元面额，月套餐到期自动从中扣除。" },
    ],
    dialSteps: [
      { step: "01", title: "打开 T-Mobile 本机拨号盘", desc: "确保手机接入美国 T-Mobile 信号或已开启 Wi-Fi Calling。" },
      { step: "02", title: "输入快捷码 *233*PIN# 呼出", desc: "在拨号盘输入 *233*收到的PIN码#（字母对应 *ADD*PIN#）并按呼叫键。" },
      { step: "03", title: "查收弹窗与入账短信", desc: "系统将返回充值成功确认信息及最新账户美元余额。" },
      { step: "04", title: "随时拨打 #225# 查余额", desc: "拨打 #225#（#BAL#）即可免费查询美元余额与月租到期时间。" },
    ],
    warnings: [
      { title: "仅限 T-Mobile Prepaid 预付费账户", desc: "不支持 T-Mobile Postpaid 后付费合约账单，亦不支持 Metro by T-Mobile 或 Mint Mobile 等独立子品牌。" },
      { title: "请注意区分 Ultra Mobile 体系", desc: "Ultra Mobile（如 $3 紫卡/橙卡 PayGo）为独立虚拟运营商，下单前请确认您的缴费官网是 prepaid.t-mobile.com！" },
      { title: "国内打开官网请配合美区 IP", desc: "T-Mobile 官网对非美国 IP 偶有限流或人机验证，切换干净美区网络后操作更流畅。" },
      { title: "一次性数字卡密发码不退换", desc: "官方实时直采发码不可撤回，请确认账户类型后下单，24 小时内完成充值核验。" },
    ],
    faqs: [
      { q: "我的 T-Mobile 是合约月结账单（Postpaid），能用这个卡密吗？", a: "不可以！本 Refill PIN 仅支持 T-Mobile Prepaid（预付费）账户，Postpaid 后付费账单无法核销。" },
      { q: "Ultra Mobile $3 橙卡/紫卡可以用 T-Mobile 充值卡密吗？", a: "一般不通用。Ultra Mobile 为独立计费的 MVNO 虚拟运营商，本卡密仅适用于原生 T-Mobile Prepaid 账户。" },
      { q: "充值卡密入账后，月租会自动从余额扣款吗？", a: "是的！月租到期日系统会自动优先扣除 Prepaid 账户内的美元余额完成续期。" },
      { q: "人在中国大陆如何给 T-Mobile 充值？", a: "配合美区网络登录 prepaid.t-mobile.com 网页输入 Refill PIN 即可，或在开启 Wi-Fi Calling 后拨打 *233*PIN#。" },
      { q: "下单支付后多久自动发码？", a: "7×24h 全自动直采，支付完成后 3–15 秒即可在订单详情页与联系邮箱查看 PIN。" },
      { q: "兑换遇到报错如何处理？", a: "请确认账户确为 Prepaid 且使用美区网络访问；如遇卡密本身问题请在 24 小时内截图联系在线客服。" },
    ],
  },
  "att-us": {
    key: "att-us",
    carrierName: "AT&T 美国",
    englishBadge: "AT&T US Prepaid Refill PIN",
    networkBadge: "🇺🇸 美国顶级原生运营商 · Prepaid 预付费",
    countryName: "美国",
    countryCode: "US",
    dialPrefix: "+1",
    currencyCode: "USD",
    currencySymbol: "$",
    tagline: "美国 AT&T Prepaid 官方充值 PIN · 支持 *888*PIN# 与 paygonline 自助入账",
    intro:
      "适用于美国 AT&T Prepaid（原 GoPhone，+1）预付费手机卡的官方直采 Refill PIN 卡密。无需美区信用卡，自动秒发卡密，轻松完成预付费余额续费、保号延期及月度流量套餐自动扣款。",
    keepAliveTip:
      "余额有效期贴士：AT&T Prepaid 余额有效期与充值面额挂钩（通常 $10–$24 为 30 天，$25–$99 为 90 天，$100+ 为 365 天），可按保号周期灵活挑选面额！",
    pinFormatLabel: "10–12 位官方 AT&T Prepaid Refill PIN",
    pinSample: "4910 - 8273 - 6541",
    pinAnatomy: ["① 官方 Refill PIN 码", "② 仅限 AT&T Prepaid", "③ 拨号 *888*PIN#", "④ 余额查 *777#"],
    ussdCommand: "本机拨号输入 *888*PIN# 或拨打 611",
    officialUrl: "paygonline.com",
    officialHref: "https://www.paygonline.com/",
    officialChannelLabel: "AT&T Prepaid 官网（paygonline.com）或拨号 *888*PIN#",
    accountRequirement: "仅限美国 AT&T Prepaid 预付费号码（不支持 Postpaid 后付费合约 / Cricket Wireless）",
    theme: THEMES.sky,
    highlights: DEFAULT_HIGHLIGHTS("AT&T Prepaid", "+1"),
    useCases: [
      {
        title: "按周期保号延长有效期",
        badge: "最长顺延 365 天",
        items: [
          { name: "大额单笔直延 90 / 365 天", desc: "根据官方规则，$25+ 延长 90 天、$100+ 延长 365 天，省去每月频繁充值的麻烦。" },
          { name: "高信誉美国原生实体号段", desc: "AT&T 原生号在美区银行、券商与金融 App 中风控通过率极佳。" },
        ],
      },
      {
        title: "跳过美区信用卡 AVS 封锁",
        badge: "零支付门槛",
        items: [
          { name: "解决 paygonline 拒付国内卡", desc: "AT&T 官网对非美区发卡行拦截率极高，官方 PIN 码直接入账零风控。" },
          { name: "多档官方美元面额覆盖", desc: "7 档主流面额任选，轻度保号与整年月包一站配齐。" },
        ],
      },
      {
        title: "预充余额自动续订月包",
        badge: "防停机断网",
        items: [
          { name: "到期自动优先扣余额", desc: "提前充入账户 Balance，月度流量/通话套餐到期自动续订不断网。" },
          { name: "叠加充值余额自动顺延", desc: "多次充值金额自动累计，有效期按较晚日期顺延。" },
        ],
      },
      {
        title: "官网 + 拨号双通道核销",
        badge: "便捷查余额",
        items: [
          { name: "本机拨号 *888*PIN# 秒充", desc: "美国本地或 Wi-Fi Calling 环境下拨号即入账，*777# 随时查余量。" },
          { name: "官网远程随时自助缴费", desc: "配合美区节点登录 paygonline.com 即可异地远程充值。" },
        ],
      },
    ],
    webSteps: [
      { step: "01", title: "配合美区 IP 登录 paygonline.com", desc: "切换干净的美国节点访问 paygonline.com，输入 10 位手机号与密码登录。" },
      { step: "02", title: "进入 Make a Payment 页面", desc: "点击「Make a Payment」或「Refill」，勾选「AT&T Prepaid Refill Card / PIN」。" },
      { step: "03", title: "粘贴官方 Refill PIN 码", desc: "输入本站订单页自动发放的 PIN 数字，核对无误后点击 Continue / Submit。" },
      { step: "04", title: "确认美元余额与新有效期", desc: "提交后数秒即刷新账户 Balance 及新的有效期截止日。" },
    ],
    dialSteps: [
      { step: "01", title: "打开 AT&T 本机拨号键盘", desc: "确保手机接入 AT&T 网络或 Wi-Fi Calling 状态。" },
      { step: "02", title: "拨打快捷充值码 *888*PIN#", desc: "键入 *888*收到的PIN码# 后按呼叫键（或拨打 611 按语音指引充值）。" },
      { step: "03", title: "查收官方入账回执", desc: "屏幕弹窗确认金额入账，账户有效期同步更新。" },
      { step: "04", title: "拨打 *777# 核验余额", desc: "随时拨打 *777# 即可免费查询当前余额与到期时间。" },
    ],
    warnings: [
      { title: "仅限 AT&T Prepaid 预付费卡", desc: "不支持 AT&T Postpaid 后付费账单，亦不支持 Cricket Wireless 等子品牌。" },
      { title: "登录 paygonline.com 务必使用美区 IP", desc: "AT&T 官网对非美区直连 IP 经常直接返回 Access Denied，请先切换稳定美国网络再访问。" },
      { title: "留意不同面额的余额有效期规则", desc: "小额面额（$10–$24）余额通常 30 天有效，$25+ 为 90 天，$100+ 为 365 天，具体以官方入账提示为准。" },
      { title: "一次性 PIN 码发码不退换", desc: "系统实时直采发码后不支持无理由退换，请在 24 小时内完成核验充值。" },
    ],
    faqs: [
      { q: "为什么我在国内直接打不开 paygonline.com（提示 Access Denied）？", a: "AT&T 官网启用了严格地理围栏，中国大陆直连会被拒绝访问。请切换干净稳定的美国线路代理并刷新页面即可正常登录。" },
      { q: "充值卡密可以累加并顺延有效期吗？", a: "可以！每次充值后账户余额累加，且有效期会按本次充值的面额档位对应天数向后顺延。" },
      { q: "Cricket Wireless 可以用 AT&T 充值卡密吗？", a: "不可以！两者计费系统完全独立，本卡密仅限原生 AT&T Prepaid 使用。" },
      { q: "怎么查询 AT&T Prepaid 余额和到期日？", a: "登录 paygonline.com 首页查看，或在美国本机拨打 *777# 免费查余额。" },
      { q: "下单支付后多久自动发码？", a: "7×24h 全自动直采，支付成功后 3–15 秒自动发码至订单详情页与联系邮箱。" },
      { q: "充值提示报错怎么售后？", a: "请确认账号确属 AT&T Prepaid 且号码未过期回收，保留截图并在 24 小时内联系在线客服核查。" },
    ],
  },
  "verizon-us": {
    key: "verizon-us",
    carrierName: "Verizon 美国",
    englishBadge: "Verizon US Prepaid Refill PIN",
    networkBadge: "🇺🇸 全美第一广域覆盖 · Verizon Prepaid",
    countryName: "美国",
    countryCode: "US",
    dialPrefix: "+1",
    currencyCode: "USD",
    currencySymbol: "$",
    tagline: "美国全美信号标杆 Verizon 官方 Prepaid 充值 PIN · 秒级自动发码",
    intro:
      "适用于美国顶级运营商 Verizon Prepaid（+1）预付费手机卡的官方直采 Refill PIN 卡密。免绑美区信用卡，支付后自动交付官方 PIN 码，支持 My Verizon App、官网及拨号 #768 快速续费。",
    keepAliveTip:
      "账户核对提示：本卡密仅适用于【Verizon 原生 Prepaid 预付费】账户，不适用于 Postpaid 后付费账单及 Visible / Total Wireless 等子品牌！",
    pinFormatLabel: "12 位官方 Verizon Prepaid Refill PIN",
    pinSample: "9204 - 5183 - 7629",
    pinAnatomy: ["① 12位官方 Refill PIN", "② 仅限 Verizon Prepaid", "③ 拨号 #768 (#PMT)", "④ 官网 Quick Pay 可充"],
    ussdCommand: "本机拨打 #768（#PMT）按语音提示输入 PIN",
    officialUrl: "verizon.com/prepaid",
    officialHref: "https://www.verizon.com/prepaid/",
    officialChannelLabel: "My Verizon App / 官网或本机拨打 #768",
    accountRequirement: "仅限美国 Verizon Prepaid 预付费号码（不支持 Postpaid / Visible / Total Wireless）",
    theme: THEMES.crimson,
    highlights: DEFAULT_HIGHLIGHTS("Verizon Prepaid", "+1"),
    useCases: [
      {
        title: "Verizon 预付费月租续期",
        badge: "旗舰网络不断线",
        items: [
          { name: "提前补足月租余额", desc: "充入美元余额后，套餐续期日自动扣费，保持全美广域 5G/LTE 持续在线。" },
          { name: "防止逾期 60 天丢号", desc: "及时缴费避免因欠费超窗导致 Verizon 珍贵原生号被回收。" },
        ],
      },
      {
        title: "绕开美国信用卡风控",
        badge: "免美卡付费",
        items: [
          { name: "无须持有美区本土发卡行", desc: "国内直接购买官方 Refill PIN，省去绑定外币信用卡的繁琐校验。" },
          { name: "多档高配美元面额", desc: "精准匹配 Verizon 主流 Prepaid 套餐档位，透明划算。" },
        ],
      },
      {
        title: "跨境商务高信誉保号",
        badge: "美区实体号标杆",
        items: [
          { name: "高权重金融与电商验证", desc: "Verizon 原生实体号段在美国银行、券商与企业验证中认可度极高。" },
          { name: "多张叠加无上限", desc: "可连续兑换多张 Refill PIN 累加至账户余额。" },
        ],
      },
      {
        title: "支持异地远程代充",
        badge: "Quick Pay 快捷缴费",
        items: [
          { name: "帮在美亲友快速缴费", desc: "通过官网 Express Refill / Quick Pay 通道输号填码即可远程续费。" },
          { name: "随时拨打 #225 查余额", desc: "账户余额与到期日清晰可控。" },
        ],
      },
    ],
    webSteps: [
      { step: "01", title: "配合美区 IP 登录 My Verizon", desc: "访问 verizon.com/prepaid 或打开 My Verizon App，登录您的 Prepaid 账户。" },
      { step: "02", title: "进入 Make a Payment / Refill", desc: "在账户缴费面板选择「Use a Refill Card / PIN」作为支付方式。" },
      { step: "03", title: "粘贴 12 位官方 Refill PIN", desc: "完整填入本站自动发放的 PIN 数字，核对手机号及面额后提交。" },
      { step: "04", title: "确认余额更新并自动抵扣月租", desc: "数秒内完成入账，余额将自动应用于当前或下一周期的 Prepaid 套餐。" },
    ],
    dialSteps: [
      { step: "01", title: "使用 Verizon Prepaid 本机拨号", desc: "在美国 Verizon 网络覆盖下打开手机拨号界面。" },
      { step: "02", title: "拨打官方缴费短号 #768（#PMT）", desc: "呼出 #768 或拨打 888-294-6804 进入自动语音缴费系统。" },
      { step: "03", title: "选择使用 Refill Card 充值", desc: "按语音指引进入 Refill PIN 输入流程。" },
      { step: "04", title: "键入完整 PIN 码完成入账", desc: "语音播报确认金额即刻入账，随后可拨打 #225（#BAL）查询余额。" },
    ],
    warnings: [
      { title: "仅限 Verizon Prepaid 预付费账户", desc: "不支持 Verizon Postpaid 合约账单，亦不适用于 Visible、Total by Verizon、TracFone 等子品牌。" },
      { title: "访问官网请配合稳定美国 IP", desc: "中国大陆直连访问 verizon.com 常受限，建议切换美区节点后再登录兑换。" },
      { title: "留意逾期 60 天回收规则", desc: "Verizon Prepaid 逾期超过 60 天未缴费可能导致号码永久释放，请提前完成充值。" },
      { title: "一次性数字商品发码不退换", desc: "官方直采发码具有唯一性，售出后不支持无理由退换，请在 24 小时内完成充值核验。" },
    ],
    faqs: [
      { q: "Visible 手机卡可以用 Verizon 充值卡吗？", a: "不可以！Visible 虽然共享 Verizon 基站，但计费体系完全独立，本卡密仅限 Verizon 原生 Prepaid 账户。" },
      { q: "可以在不登录密码的情况下帮朋友充值吗？", a: "Verizon 官网提供 Quick Pay / Express Refill 入口，支持输入手机号与 Refill PIN 直接缴费。" },
      { q: "充值卡密入账后余额能累加吗？", a: "可以！多张 Refill PIN 依次兑换后会自动累计到您的 Prepaid 账户余额中。" },
      { q: "下单支付后多久能拿到 PIN 码？", a: "7×24h 全自动直采，支付成功后 3–15 秒自动发码至订单详情页与联系邮箱。" },
      { q: "怎么查 Verizon Prepaid 账户余额？", a: "登录 My Verizon App，或在本机拨打 #225（#BAL）即可免费查询。" },
      { q: "兑换提示报错如何处理？", a: "请核对账号确为 Verizon Prepaid 且输入无空格，保留报错截图并在 24 小时内联系在线客服核查。" },
    ],
  },
  "lyca-us": {
    key: "lyca-us",
    carrierName: "Lyca Mobile 美国",
    englishBadge: "Lyca Mobile US Top-up PIN",
    networkBadge: "🇺🇸 美国 T-Mobile 基站 · 拨号 *611*PIN#",
    countryName: "美国",
    countryCode: "US",
    dialPrefix: "+1",
    currencyCode: "USD",
    currencySymbol: "$",
    tagline: "美国 Lyca Mobile 官方充值 PIN · 支持 *611*PIN# 与官网秒速入账",
    intro:
      "专用于美国区 Lyca Mobile US（+1）预付费手机卡的官方直采充值 PIN 卡密。依托 T-Mobile 全美网络，支持拨号指令 *611*PIN# 及 lycamobile.us 官网秒速入账，免绑美区银行卡，7×24h 自动发码。",
    keepAliveTip:
      "国家隔离提醒：本商品为【美国区 Lyca Mobile US（+1 / USD）】专用；如果您使用的是英国 Lyca Mobile（+44 / GBP），请选择本站「Lyca Mobile 英国话费充值卡」！",
    pinFormatLabel: "12 位官方 Lyca Mobile US 充值 PIN",
    pinSample: "6028 - 4719 - 3580",
    pinAnatomy: ["① 12位官方充值PIN", "② 仅限美国 +1 区", "③ 拨号 *611*PIN#", "④ 余额查 *611#"],
    ussdCommand: "本机拨号输入 *611*PIN# 或拨打 611",
    officialUrl: "lycamobile.us/en/quick-top-up",
    officialHref: "https://www.lycamobile.us/en/quick-top-up/",
    officialChannelLabel: "Lyca Mobile US 官网（lycamobile.us）或拨号 *611*PIN#",
    accountRequirement: "仅限美国区 Lyca Mobile US（+1）预付费号码（严禁用于英国区或其他国家 Lyca）",
    theme: THEMES.sky,
    highlights: DEFAULT_HIGHLIGHTS("Lyca Mobile US", "+1"),
    useCases: [
      {
        title: "维护美国 +1 实体手机号",
        badge: "跨境保号",
        items: [
          { name: "按期充值防止停用回收", desc: "定期补充美元余额保持账户活跃，稳保美国实体号码长期有效。" },
          { name: "接收美区平台短信验证", desc: "适配金融、电商、AI 与海外社交账号的短信核验需求。" },
        ],
      },
      {
        title: "留学国际长途与流量套餐",
        badge: "含 75+ 国国际通话",
        items: [
          { name: "免费无限直拨中国等国", desc: "Lyca US 多数月套餐包含免费国际长途，非常适合赴美留学与华人日常沟通。" },
          { name: "T-Mobile 全美高速网络", desc: "余额入账后可在官网/App 自由切换月度流量计划。" },
        ],
      },
      {
        title: "免绑美卡快捷入账",
        badge: "零支付门槛",
        items: [
          { name: "跳过美国信用卡风控", desc: "无需持有美国发卡行信用卡，官方 PIN 码 100% 稳定入账。" },
          { name: "官网 + *611*PIN# 双通道", desc: "无论在美国本地还是国内漫游都能快速核销。" },
        ],
      },
      {
        title: "多档美元灵活叠加",
        badge: "7×24h 自动发码",
        items: [
          { name: "5 档主流美元面额", desc: "覆盖常规保号与大流量月租计划，按需购买。" },
          { name: "支持多张叠加累计余额", desc: "多张 PIN 码连续兑换自动累加至账户钱包。" },
        ],
      },
    ],
    webSteps: [
      { step: "01", title: "打开 Lyca Mobile US 官网", desc: "访问美国官网 lycamobile.us（务必确认域名为 .us）或打开 My Lyca US App。" },
      { step: "02", title: "选择 Voucher PIN 充值方式", desc: "进入 Quick Top-up 充值页，勾选使用「Voucher PIN」兑换，填入 10 位美国号码。" },
      { step: "03", title: "粘贴 12 位官方充值 PIN", desc: "完整输入本站自动发放的 PIN 码，核对手机号无误后点击提交。" },
      { step: "04", title: "确认美元余额秒到账", desc: "提交后数秒即可入账，可拨打 *611# 或登录账号查看余额并购买月套餐。" },
    ],
    dialSteps: [
      { step: "01", title: "打开 Lyca US 本机拨号盘", desc: "在美国本地信号下使用插入 Lyca US SIM 卡的手机（国内漫游推荐左侧官网）。" },
      { step: "02", title: "拨打快捷指令 *611*PIN#", desc: "键入 *611*收到的PIN码# 后按呼叫键（或拨打 611 按语音提示充值）。" },
      { step: "03", title: "查收弹窗与入账短信", desc: "系统数秒内确认美元余额入账并更新钱包总额。" },
      { step: "04", title: "拨打 *611# 查余额", desc: "日常随时拨打 *611# 即可核对当前余额与套餐状态。" },
    ],
    warnings: [
      { title: "严禁与英国 Lyca Mobile（+44）混用", desc: "美国 Lyca（+1 / USD）与英国 Lyca（+44 / GBP）完全隔离，下单前务必确认号段为 +1！" },
      { title: "确认号码未超期停用", desc: "若号码长期欠费停用被运营商回收，卡密将无法兑换到账。" },
      { title: "国内访问建议配合美区网络", desc: "国内直连访问 lycamobile.us 偶尔较慢，切换美区线路操作更顺畅。" },
      { title: "一次性数字商品发码不退换", desc: "官方实时直采发码后不支持无理由退换，请在 24 小时内完成充值核验。" },
    ],
    faqs: [
      { q: "英国 Lyca Mobile（+44）可以用这张美国卡密吗？", a: "不可以！本商品仅限美国 Lyca Mobile US（+1 / USD），英国卡请在本站选择英国区 Lyca 充值卡。" },
      { q: "充值后怎么开通包含国际通话的月度套餐？", a: "美元余额到账后，登录 My Lyca US 官网或 App 选择所需 Plan，支付方式选账户余额（Wallet）即可。" },
      { q: "怎么查询当前账户余额？", a: "美国本机拨打 *611# 或登录 lycamobile.us 账号即可实时查询。" },
      { q: "下单支付后多久自动发码？", a: "7×24h 自动直采发码，支付成功后约 3–15 秒即可在订单详情页与联系邮箱查看。" },
      { q: "多张充值卡可以叠加吗？", a: "可以！依次输入不同 PIN 码即可累加至同一号码余额中。" },
      { q: "充值提示无效怎么办？", a: "请确认是在美国站 lycamobile.us 兑换且无空格；如有异常请 24 小时内截图联系在线客服。" },
    ],
  },
  "simple-mobile-us": {
    key: "simple-mobile-us",
    carrierName: "Simple Mobile 美国",
    englishBadge: "Simple Mobile US Service PIN",
    networkBadge: "🇺🇸 美国无合约月包 · 短信 611611 直充",
    countryName: "美国",
    countryCode: "US",
    dialPrefix: "+1",
    currencyCode: "USD",
    currencySymbol: "$",
    tagline: "美国 Simple Mobile 官方 15 位服务 PIN · 支持 Reserve 队列无缝续期",
    intro:
      "适用于美国 Simple Mobile（+1）预付费手机卡的官方直采 Service PIN 充值卡密。无合约束缚、免绑美国信用卡，支付后秒级自动发码，支持官网及短信 611611 一键续费，并可加入 Reserve 储备队列无缝衔接！",
    keepAliveTip:
      "防浪费必看：如果当前 30 天套餐尚未到期，兑换 PIN 码时请务必选择「Add to Reserve（加入储备队列）」，当前周期结束后会自动无缝续期，绝不覆盖剩余天数！",
    pinFormatLabel: "15 位官方 Simple Mobile Service PIN",
    pinSample: "74182 - 90364 - 51209",
    pinAnatomy: ["① 15位官方 Service PIN", "② 仅限 Simple Mobile", "③ 短信 ADD 至 611611", "④ 支持加入 Reserve 队列"],
    ussdCommand: "短信发送 ADD 至 611611 或拨打 1-877-878-7908",
    officialUrl: "simplemobile.com/refill",
    officialHref: "https://www.simplemobile.com/refill",
    officialChannelLabel: "Simple Mobile 官网（simplemobile.com/refill）或短信 611611",
    accountRequirement: "仅限美国 Simple Mobile（+1）预付费手机号码（不适用于 TracFone / 原生 T-Mobile）",
    theme: THEMES.emerald,
    highlights: DEFAULT_HIGHLIGHTS("Simple Mobile", "+1"),
    useCases: [
      {
        title: "30 天无合约套餐无缝续期",
        badge: "支持 Reserve 排队",
        items: [
          { name: "提前购码排队不浪费天数", desc: "选择 Add to Reserve 存入队列，上期结束零点自动无缝启用新周期。" },
          { name: "无限通话短信 + 高速流量", desc: "高性价比全美无合约方案，覆盖商旅与日常主力通信。" },
        ],
      },
      {
        title: "免绑美国银行卡轻松缴费",
        badge: "跳过官网风控",
        items: [
          { name: "绕开美区信用卡账单校验", desc: "无须美国发行的信用卡或借记卡，官方直采 15 位 Service PIN 稳定核销。" },
          { name: "明码标价无自动续扣陷阱", desc: "按需购码续期，不用担心绑卡后忘记取消被持续扣费。" },
        ],
      },
      {
        title: "短信 + 官网双通道续费",
        badge: "极速自救复机",
        items: [
          { name: "短信发 ADD 至 611611 直充", desc: "美国本地一条短信按回复填入 PIN 即可快速续费。" },
          { name: "短信发 BALANCE 至 611611", desc: "随时查最新套餐到期时间与剩余流量。" },
        ],
      },
      {
        title: "支持异地远程代充",
        badge: "7×24h 自动发码",
        items: [
          { name: "官网填号即可帮亲友缴费", desc: "无需登录对方密码，访问 refill 页面填手机号与 PIN 码即可远程续费。" },
          { name: "3–15 秒极速出码", desc: "全天候无人值守秒发，应急续费不等待。" },
        ],
      },
    ],
    webSteps: [
      { step: "01", title: "配合美区 IP 打开官网充值页", desc: "访问 simplemobile.com/refill 或打开 My Simple Mobile App。" },
      { step: "02", title: "选择 Refill with a Service PIN", desc: "点击使用 Service PIN 续费，准确填写待充值的 10 位美国手机号码。" },
      { step: "03", title: "填入 15 位 PIN 并选生效方式", desc: "粘贴本站发放的 15 位 PIN；如当期未到期，建议选「Add to Reserve（加入队列）」。" },
      { step: "04", title: "确认续期成功并查看到期日", desc: "提交后数秒即可收到确认提示，发送短信 BALANCE 至 611611 可核对到期日。" },
    ],
    dialSteps: [
      { step: "01", title: "打开本机短信应用（美国本地）", desc: "使用已插卡的 Simple Mobile 手机（国内用户请使用左侧官网方式）。" },
      { step: "02", title: "发送短信 ADD 至 611611", desc: "按系统自动回复提示，回复您的 15 位 Service PIN 即可完成充值。" },
      { step: "03", title: "或拨打官方热线语音充值", desc: "拨打 1-877-878-7908，按语音提示依次输入手机号与 15 位 PIN。" },
      { step: "04", title: "发短信 BALANCE 至 611611", desc: "实时查看最新服务截止日期与队列储备状态。" },
    ],
    warnings: [
      { title: "仅限美国 Simple Mobile（+1）使用", desc: "不可用于 TracFone、Total Wireless、Straight Talk 或原生 T-Mobile 账户。" },
      { title: "当期未到期务必选「Add to Reserve」", desc: "若当前套餐还剩多天，请选加入 Reserve 储备队列，避免选择立即覆盖导致剩余天数作废！" },
      { title: "访问官网请配合美国 IP 环境", desc: "Simple Mobile 官网对非美区 IP 常有 Cloudflare 拦截，请切稳定美区节点打开。" },
      { title: "一次性数字卡密发码不退换", desc: "官方实时直采发码后不支持无理由退换，请在 24 小时内完成核验充值。" },
    ],
    faqs: [
      { q: "现在的月套餐还剩 5 天才到期，提前用 PIN 充会浪费吗？", a: "不会！兑换时选择「Add to Reserve（加入储备队列）」，当前周期结束后系统会自动无缝衔接新 30 天周期。" },
      { q: "Simple Mobile 充值卡能用在原生 T-Mobile 卡上吗？", a: "不可以！两者计费系统完全独立，本卡密仅限 Simple Mobile 账户。" },
      { q: "如何查询当前剩余流量和到期时间？", a: "美国本机发送短信「BALANCE」至 611611，或登录 My Simple Mobile App 查看。" },
      { q: "下单支付后多久自动发货？", a: "7×24h 全自动直采，支付完成后 3–15 秒自动发码至订单详情页与联系邮箱。" },
      { q: "国内打开 simplemobile.com 提示被拦截怎么办？", a: "请切换干净的美区线路代理并尝试浏览器无痕窗口访问。" },
      { q: "兑换遇到报错如何售后？", a: "请截图报错页面并在 24 小时内点击下方「联系在线客服」，我们将第一时间协助核查。" },
    ],
  },
  "red-pocket-us": {
    key: "red-pocket-us",
    carrierName: "Red Pocket 美国",
    englishBadge: "Red Pocket Mobile US PIN",
    networkBadge: "🇺🇸 GSMA / GSMT / CDMAV 全三网兼容",
    countryName: "美国",
    countryCode: "US",
    dialPrefix: "+1",
    currencyCode: "USD",
    currencySymbol: "$",
    tagline: "美国 Red Pocket 官方充值 PIN · 支持 GSMA / GSMT / CDMAV 全网续费",
    intro:
      "适用于美国全网通虚拟运营商 Red Pocket Mobile（+1）的官方直采充值 PIN 卡密。无论您的号码运行在 GSMA（AT&T）、GSMT（T-Mobile）还是 CDMAV（Verizon）网络下，均可免绑美卡在官网自助续期！",
    keepAliveTip:
      "档位核对贴士：Red Pocket 充值卡密对应特定档位计划，登录 redpocket.com/my-lines 进入对应号码后选择「Pay with a PIN」即可完成续费！",
    pinFormatLabel: "16 位官方 Red Pocket Refill PIN 卡密",
    pinSample: "3850 - 6192 - 4738 - 2015",
    pinAnatomy: ["① 16位官方 Refill PIN", "② 兼容三网线路", "③ 官网 My Lines 核销", "④ 支持新卡激活续费"],
    ussdCommand: "登录官网 redpocket.com/my-lines 输入 PIN",
    officialUrl: "redpocket.com/my-lines",
    officialHref: "https://www.redpocket.com/my-lines",
    officialChannelLabel: "Red Pocket 官网（redpocket.com/my-lines）或 Red Pocket App",
    accountRequirement: "仅限美国 Red Pocket Mobile（+1）预付费线路，兼容 GSMA / GSMT / CDMAV",
    theme: THEMES.crimson,
    highlights: DEFAULT_HIGHLIGHTS("Red Pocket", "+1"),
    useCases: [
      {
        title: "美区三网线路全面兼容",
        badge: "GSMA / GSMT / CDMAV",
        items: [
          { name: "一套卡密通吃三大基站", desc: "无论您持有 Red Pocket 旗下 AT&T、T-Mobile 还是 Verizon 线路卡，均可顺利续费。" },
          { name: "新卡激活与老卡续费皆宜", desc: "支持在官网 activate 通道首次开卡，也支持 My Lines 日常续期。" },
        ],
      },
      {
        title: "经典跨境长期保号续费",
        badge: "高性价比美国号",
        items: [
          { name: "稳定留存 +1 实体手机号", desc: "常年作为跨境电商、美区金融与 AI 平台高信誉接码卡使用，按期续费不丢号。" },
          { name: "到期前提前续期更稳妥", desc: "建议在宽限期前 2–3 天完成续费，避免超窗释放号码。" },
        ],
      },
      {
        title: "免绑美卡跳过支付拦截",
        badge: "国内直购官方码",
        items: [
          { name: "绕开国际信用卡拒付风险", desc: "支付宝、微信、余额或 USDT 即可秒购官方 PIN 码。" },
          { name: "全程网页自助国内可用", desc: "无须拨打美国语音电话，浏览器登录官网 4 步搞定。" },
        ],
      },
      {
        title: "官方在线支持协同无忧",
        badge: "售后渠道完善",
        items: [
          { name: "官网聊天窗可协助核销", desc: "遇新卡开卡或特殊换网需求，可提供官方 PIN 由 Red Pocket 客服协助应用。" },
          { name: "7×24h 自动 3–15 秒发码", desc: "全天候自动采码交付，不耽误到期续费窗口。" },
        ],
      },
    ],
    webSteps: [
      { step: "01", title: "登录 Red Pocket 官网账号", desc: "访问 redpocket.com/my-lines 并使用您的 Red Pocket 会员邮箱登录。" },
      { step: "02", title: "点选需要续费的美国号码", desc: "在 My Lines 号码列表中点击对应手机号，进入「Summary / Refill」管理页。" },
      { step: "03", title: "点击 Redeem a PIN 核销", desc: "选择使用 PIN / Refill Card 续费，粘贴本站自动发放的 16 位官方 PIN。" },
      { step: "04", title: "确认套餐续期生效", desc: "提交后页面将实时刷新最新服务到期日与套餐额度，重启或开关飞行模式即刻生效。" },
    ],
    dialSteps: [
      { step: "01", title: "免登录快捷通道（备选）", desc: "如不便登录主账号，也可访问官网首页「Refill」入口输入手机号与 PIN 码缴费。" },
      { step: "02", title: "新卡开卡激活通道", desc: "全新 Red Pocket 卡可访问 redpocket.com/activate，填入 SIM ICCID 与激活 PIN。" },
      { step: "03", title: "官网在线客服协助", desc: "如遇跨档位变更或线路同步延迟，可联系 Red Pocket 官网客服提供 PIN 协助生效。" },
      { step: "04", title: "检查 Wi-Fi Calling 与短信", desc: "续费完成后开关一次飞行模式，确保信号与短信收发恢复正常。" },
    ],
    warnings: [
      { title: "请核对所选面额与当前线路档位匹配", desc: "Red Pocket 部分面额 PIN 对应特定计划档位，兑换前请在 My Lines 核对当前套餐避免变更结构。" },
      { title: "仅限美国 Red Pocket Mobile 使用", desc: "不可用于 AT&T、T-Mobile、Verizon 原生账户或其他虚拟运营商。" },
      { title: "留意到期宽限期防止丢号", desc: "号码过期后宽限期有限，请务必在官方回收前及时完成续费。" },
      { title: "一次性数字商品发码不退换", desc: "系统实时直采发码后不支持无理由退换，请在 24 小时内完成充值核验。" },
    ],
    faqs: [
      { q: "我的 Red Pocket 是 GSMT（T-Mobile 网络）卡，可以用这张 PIN 吗？", a: "可以！Red Pocket 官方充值 PIN 同时兼容旗下 GSMA（AT&T）、GSMT（T-Mobile）与 CDMAV（Verizon）三大网络。" },
      { q: "人在中国大陆可以直接在官网续费吗？", a: "可以！登录 redpocket.com/my-lines 进入对应号码输入 PIN 码即可远程完成续期。" },
      { q: "全新未激活的 Red Pocket 卡能用这个 PIN 激活吗？", a: "可以！访问 redpocket.com/activate 输入 SIM 卡 ICCID 与对应档位 PIN 码即可开卡。" },
      { q: "下单支付后多久自动发码？", a: "7×24h 自动直采，支付成功后约 3–15 秒自动显示在订单详情页并同步发送至您的联系邮箱。" },
      { q: "旧套餐未到期提前充会马上覆盖吗？", a: "在官网兑换时系统会提示立即生效或顺延当前周期，请按页面提示核对后提交。" },
      { q: "兑换提示报错怎么售后？", a: "请核对线路状态与输入无空格，如仍异常请 24 小时内截图联系在线客服核查。" },
    ],
  },
  generic: {
    key: "generic",
    carrierName: "海外运营商话费充值",
    englishBadge: "International SIM Top-up PIN",
    networkBadge: "🌍 海外官方预付费充值 · 自动发码",
    countryName: "海外运营商",
    countryCode: "GLOBAL",
    dialPrefix: "+",
    currencyCode: "USD / GBP",
    currencySymbol: "",
    tagline: "官方正规直采充值卡密 · 7×24h 自动秒发 · 免绑外币信用卡自助续费",
    intro:
      "精选海外主流移动运营商官方预付费话费充值 PIN 卡密。支付后 7×24h 自动发码，免去外币信用卡风控拦截，轻松实现海外手机卡长期保号续命、国内漫游收验证码及流量套餐续订。",
    keepAliveTip:
      "通用提示：海外运营商充值卡密均按【国家 + 运营商】严格隔离，下单前请务必核对您的 SIM 卡所属国家、区号及运营商名称！",
    pinFormatLabel: "官方原装充值 PIN 卡密（Top-up Voucher）",
    pinSample: "XXXX - XXXX - XXXX - XXXX",
    pinAnatomy: ["① 官方原装 PIN 码", "② 实时直采一手新码", "③ 7×24h 自动秒发", "④ 官网/拨号自助入账"],
    ussdCommand: "按对应运营商官网 / App 或官方拨号指引兑换",
    officialUrl: "运营商官方 Top-up / Refill 页面",
    officialHref: "/products/sim-cards",
    officialChannelLabel: "对应运营商官网、官方 App 或 USSD 充值指令",
    accountRequirement: "仅限商品标题所标明国家与运营商的 Prepaid 预付费号码",
    theme: THEMES.orange,
    highlights: DEFAULT_HIGHLIGHTS("海外主流运营商", "海外原生"),
    useCases: [
      {
        title: "海外实体卡长期保号",
        badge: "防休眠销号",
        items: [
          { name: "按期补充余额维持活跃", desc: "及时产生充值或计费活动，避免海外手机卡超期被运营商回收。" },
          { name: "稳定接收全球验证码", desc: "保持号码正常有效，随时接收银行、社媒与 AI 平台短信核验。" },
        ],
      },
      {
        title: "免外币卡轻松续费",
        badge: "零支付风控",
        items: [
          { name: "告别境外卡账单地址拒付", desc: "支持国内常见支付方式购买官方直采 PIN 码，稳定入账。" },
          { name: "多档官方面额灵活选", desc: "覆盖小额保号与月度大流量套餐续费需求。" },
        ],
      },
      {
        title: "出国商旅与留学续包",
        badge: "随用随充",
        items: [
          { name: "余额可自由兑换流量包", desc: "到账后可在运营商官方 App 内按需选购 30 天流量与通话包。" },
          { name: "7×24h 全天候秒级发码", desc: "随时应急续费不断网、不失联。" },
        ],
      },
      {
        title: "独立卡密安全私密",
        badge: "全程自助",
        items: [
          { name: "免提供手机号登录密码", desc: "收到卡密后完全由您自己在官方渠道核销，保护账号隐私。" },
          { name: "支持异地远程代充", desc: "通过运营商官网即可随时为亲友海外号码续费。" },
        ],
      },
    ],
    webSteps: [
      { step: "01", title: "选定面额并完成下单支付", desc: "在右侧规格栏确认所需充值面额，填写联系邮箱后提交支付。" },
      { step: "02", title: "获取自动发放的官方 PIN 码", desc: "支付成功后 3–15 秒即可在订单详情页与联系邮箱复制完整卡密。" },
      { step: "03", title: "打开对应运营商官网或 App", desc: "登录商品对应运营商的官方充值页面，进入「Voucher / Refill PIN」兑换入口。" },
      { step: "04", title: "粘贴 PIN 码确认余额到账", desc: "核对手机号并提交兑换，完成后第一时间检查话费余额或套餐到期日。" },
    ],
    dialSteps: [
      { step: "01", title: "确认手机已插入对应 SIM 卡", desc: "在当地信号覆盖下使用本机拨号盘操作（国内漫游建议直接使用左侧官网方式）。" },
      { step: "02", title: "拨打官方语音或 USSD 指令", desc: "按该运营商官方指引拨打充值短号或输入 USSD 快捷指令。" },
      { step: "03", title: "输入完整充值 PIN 数字", desc: "仔细键入卡密数字并按语音/屏幕提示确认提交。" },
      { step: "04", title: "查收官方入账回执短信", desc: "等待官方短信确认到账并查询最新账户余额。" },
    ],
    warnings: [
      { title: "严格核对国家与运营商", desc: "不同国家与运营商之间的充值卡密互不通用，下单前请务必确认商品标题与您的 SIM 卡完全一致。" },
      { title: "仅限 Prepaid 预付费卡使用", desc: "官方充值 PIN 通常仅支持预付费账户，不支持后付费合约账单。" },
      { title: "确认号码未超期注销", desc: "如 SIM 卡因长期未保号已被运营商回收，卡密将无法兑换入账。" },
      { title: "一次性数字商品发码不退换", desc: "卡密经系统实时发码后不支持无理由退换，请在 24 小时内完成充值核验。" },
    ],
    faqs: [
      { q: "下单支付后多久能拿到充值卡密？", a: "系统 7×24h 全自动直连官方渠道采购，支付成功后通常 3–15 秒自动发码至订单详情页与联系邮箱。" },
      { q: "人在中国大陆可以给海外手机卡充值吗？", a: "可以！收到 PIN 卡密后直接登录对应运营商官网或 App 自助兑换即可，无需身在海外。" },
      { q: "需要提供我的手机号密码给客服吗？", a: "完全不需要！本商品采用独立 PIN 卡密发货，全程由您自行在官方页面核销。" },
      { q: "不同国家的同名运营商卡密通用吗？", a: "不通用！例如英国 Vodafone 与西班牙 Vodafone、英国 Lyca 与美国 Lyca 系统完全独立，请务必按国家对应下单。" },
      { q: "卡密有有效期吗？", a: "均为实时采购的新鲜官方卡密，为保障核验与售后权益，建议收码后 24 小时内完成充值。" },
      { q: "遇到兑换报错怎么办？", a: "请核对号码归属与输入格式，保留报错截图并在 24 小时内联系在线客服协助排查。" },
    ],
  },
};

const HIGHLIGHT_ICONS = [ShieldCheck, Zap, CreditCard, Globe, Signal, KeyRound];
const USECASE_ICONS = [PhoneCall, Wifi, Smartphone, Signal];

export function resolveSimTopupCarrier(product: SimTopupDetailProduct): CarrierKey | null {
  const categoryId = String(product.category_id ?? product.metadata?.categoryId ?? "").trim();
  const categorySlug = String(product.metadata?.categorySlug ?? "").trim().toLowerCase();
  const slug = String(product.slug ?? "").trim().toLowerCase();
  const name = String(product.name ?? "").trim().toLowerCase();
  const label = String(product.categoryLabel ?? "").trim().toLowerCase();
  const combined = `${slug} ${name} ${label}`;

  const isSimTopup =
    categoryId === SIM_SERVICE_CATEGORY_ID ||
    categorySlug === "balance" ||
    /sim\s*卡服务|话费充值卡|pin\s*卡密|topup-pin|-pin-(united-kingdom|usa)/.test(combined) ||
    (name.includes("充值") && /(giffgaff|vodafone|ee|three|lebara|lyca|t-mobile|at&t|atandt|verizon|simple mobile|red pocket)/i.test(combined));

  if (!isSimTopup) return null;

  if (/giff\s*-?\s*gaff/.test(combined)) return "giffgaff-uk";
  if (/vodafone/.test(combined)) return "vodafone-uk";
  if (/(bitrefill-ee-|\bee\b|ee\s*英国)/.test(combined)) return "ee-uk";
  if (/(bitrefill-3-pin|\bthree\b|three\s*\(3\))/.test(combined)) return "three-uk";
  if (/lebara/.test(combined)) return "lebara-uk";
  if (/lyca/.test(combined)) {
    return /(usa|美国|\bus\b)/.test(combined) ? "lyca-us" : "lyca-uk";
  }
  if (/t-?mobile/.test(combined)) return "tmobile-us";
  if (/(at&t|atandt|\batt\b)/.test(combined)) return "att-us";
  if (/verizon/.test(combined)) return "verizon-us";
  if (/simple\s*-?\s*mobile/.test(combined)) return "simple-mobile-us";
  if (/red\s*-?\s*pocket/.test(combined)) return "red-pocket-us";
  return "generic";
}

export function isSimTopupServiceProduct(product: SimTopupDetailProduct): boolean {
  return resolveSimTopupCarrier(product) !== null;
}

function extractDenominationSummary(product: SimTopupDetailProduct, skus: SimTopupDetailSku[] | undefined, currencyCode: string) {
  const labels = (skus ?? [])
    .map((sku) => String(sku.sku_title ?? sku.sku_code ?? "").trim())
    .filter(Boolean);
  if (labels.length === 1) return labels[0];
  if (labels.length >= 2) {
    return `${labels[0]} – ${labels[labels.length - 1]}（共 ${labels.length} 档）`;
  }
  const desc = `${product.short_description ?? ""} ${product.description ?? ""}`;
  const match = desc.match(/面额\s*([0-9.,]+\s*[-–~]\s*[0-9.,]+\s*[A-Z]{3})/i);
  if (match?.[1]) return match[1].trim();
  return `多档 ${currencyCode} 面额可选`;
}

export default function SimTopupServiceProductDetails({
  product,
  skus,
}: {
  product: SimTopupDetailProduct;
  skus?: SimTopupDetailSku[];
}) {
  const [tab, setTab] = useState<"web" | "dial">("web");
  const carrierKey = resolveSimTopupCarrier(product) ?? "generic";
  const profile = CARRIER_PROFILES[carrierKey];
  const { theme } = profile;
  const denominationText = extractDenominationSummary(product, skus, profile.currencyCode);
  const activeSteps = tab === "web" ? profile.webSteps : profile.dialSteps;

  const specs: Array<[string, string]> = [
    ["商品名称", product.name],
    ["适用运营商", `${profile.carrierName}（仅限 Prepaid 预付费账户）`],
    ["适用国家 / 区号", `${profile.countryName} (${profile.countryCode}) · 国际区号 ${profile.dialPrefix}`],
    ["可选面额 / 规格", denominationText],
    ["交付卡密形式", profile.pinFormatLabel],
    ["官方兑换渠道", profile.officialChannelLabel],
    ["账户适配要求", profile.accountRequirement],
  ];

  const isExternalUrl = profile.officialHref.startsWith("http");

  return (
    <div className="mt-6 w-full space-y-5 sm:mt-8 sm:space-y-6">
      {/* 1. 运营商专属旗舰 Hero + 4 格核心参数条 + 6 大带徽章亮点卡片 */}
      <section className={`overflow-hidden rounded-2xl border ${theme.accentBorder} bg-white shadow-sm`}>
        <div className={`relative overflow-hidden bg-gradient-to-br ${theme.heroGradient} px-5 py-6 text-white sm:px-7 sm:py-8`}>
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full ${theme.heroGlowA} blur-3xl`}
          />
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -bottom-20 left-10 h-44 w-44 rounded-full ${theme.heroGlowB} blur-3xl`}
          />

          <div className="relative z-10">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur-sm ${theme.badgeClass}`}
              >
                <Smartphone className="h-3.5 w-3.5" />
                {profile.englishBadge} · {profile.dialPrefix}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                官方直采 · 7×24h 自动发码
              </span>
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90">
                {profile.networkBadge}
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl">
              {product.name}
            </h2>
            <p className="mt-2 text-sm font-semibold text-white/90 sm:text-base">
              {profile.tagline}
            </p>
            <p className="mt-3 max-w-3xl text-xs leading-6 text-white/80 sm:text-sm sm:leading-6">
              {profile.intro}
            </p>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-white/75">
              {profile.keepAliveTip}
            </p>

            {/* 4 格玻璃核心参数条 */}
            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2.5 backdrop-blur-sm">
                <div className="text-[11px] text-white/65">适用地区 / 运营商</div>
                <div className="mt-0.5 text-xs font-bold text-white sm:text-sm">
                  {profile.carrierName} ({profile.dialPrefix})
                </div>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2.5 backdrop-blur-sm">
                <div className="text-[11px] text-white/65">官方充值币种</div>
                <div className="mt-0.5 font-mono text-xs font-bold text-amber-200 sm:text-sm">
                  {profile.currencyCode} {profile.currencySymbol ? `(${profile.currencySymbol})` : ""}
                </div>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2.5 backdrop-blur-sm">
                <div className="text-[11px] text-white/65">发货模式</div>
                <div className="mt-0.5 text-xs font-bold text-emerald-300 sm:text-sm">
                  支付后秒级发码
                </div>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2.5 backdrop-blur-sm">
                <div className="text-[11px] text-white/65">可选面额 / 规格</div>
                <HoverMarqueeText
                  text={denominationText}
                  autoScroll
                  className="mt-0.5 text-xs font-bold text-white sm:text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 六大核心亮点卡片网格（与旗舰礼品卡视觉完全一致） */}
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          {profile.highlights.map((item, idx) => {
            const Icon = HIGHLIGHT_ICONS[idx % HIGHLIGHT_ICONS.length];
            return (
              <div
                key={item.title}
                className={`flex flex-col justify-between rounded-xl border ${theme.accentBorder} ${theme.accentBgSoft} p-4 transition-colors hover:bg-white`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${theme.accentIconBg}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className={`rounded-full border ${theme.accentBorder} bg-white px-2 py-0.5 text-[10px] font-semibold ${theme.accentText}`}>
                      {item.tag}
                    </span>
                  </div>
                  <div className="mt-2.5 text-sm font-bold text-slate-950">{item.title}</div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. 商品详细规格与交付标准 */}
      <section className="rounded-2xl border border-slate-200/85 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`h-5 w-5 ${theme.accentText}`} />
          <h3 className="text-base font-bold text-slate-900">商品详细规格与交付标准</h3>
        </div>
        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 text-xs sm:text-sm">
          {specs.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 p-3.5 sm:flex-row sm:items-center sm:gap-4">
              <span className="w-32 shrink-0 font-semibold text-slate-500">{label}</span>
              <span className="font-medium leading-6 text-slate-800">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 官方卡密交付标准与发货格式预览（参考 GPT Plus 成品号 / 礼品卡旗舰格式框） */}
      <section className={`rounded-2xl border ${theme.guaranteeBorder} bg-gradient-to-br ${theme.guaranteeBg} p-5 shadow-sm sm:p-6`}>
        <div className="flex items-center gap-2">
          <KeyRound className={`h-5 w-5 ${theme.accentText}`} />
          <h3 className="text-base font-bold text-slate-900">{profile.carrierName} 官方 PIN 卡密标准发货格式</h3>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm">
          支付完成后系统自动直采官方新码并展示在「我的订单」详情页及您的联系邮箱，一键复制即可充值：
        </p>

        <div className={`mt-3 overflow-x-auto rounded-xl border ${theme.accentBorder} bg-white/95 p-4 font-mono text-xs text-slate-800 shadow-inner`}>
          <div className="text-slate-400">
            {`// ${profile.carrierName} 官方直采充值卡密 · ${profile.ussdCommand}`}
          </div>
          <div className={`mt-1.5 text-sm font-bold tracking-wider sm:text-base ${theme.codeText}`}>
            {profile.pinSample}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5 font-sans text-[11px] font-medium text-slate-600 sm:grid-cols-4">
            {profile.pinAnatomy.map((part) => (
              <div key={part}>{part}</div>
            ))}
          </div>
        </div>

        <div className={`mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium ${theme.guaranteeTitle}`}>
          {["官方正规直采一手新码", "无需提供账号密码与短信", "7×24h 支付后秒级自动出码"].map((promise) => (
            <span key={promise} className="inline-flex items-center gap-1.5">
              <CheckCircle2 className={`h-3.5 w-3.5 ${theme.accentText}`} />
              {promise}
            </span>
          ))}
        </div>
      </section>

      {/* 4. 三大官方保障承诺（参考 GPT Plus 成品号 / 礼品卡天蓝三栏保障卡） */}
      <section className="rounded-2xl border border-sky-200/90 bg-gradient-to-br from-sky-50 via-blue-50/40 to-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-sky-600" />
          <h3 className="text-base font-bold text-slate-900">正版直采与无忧售后保障承诺</h3>
        </div>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          本站全系海外话费充值卡均接入国际正规持牌分销渠道，跟随每日实时汇率与成本透明定价，为您提供省心稳定的充值体验：
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              title: "官方正版卡密保障",
              desc: "直采一手官方充值 PIN 码，100% 真实可核销，彻底杜绝黑卡盗刷导致号码被封风险。",
            },
            {
              title: "24 小时核验售后支持",
              desc: "请于发码后 24 小时内完成充值兑换，如遇官方核验异常请保留报错截图联系客服极速协助。",
            },
            {
              title: "全程免密自助安全无忧",
              desc: "全程无需向任何第三方透露手机号密码，收到 PIN 码后自行登录运营商官网即可安全入账。",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-sky-100 bg-white/95 p-4 shadow-2xs">
              <div className="text-xs font-bold text-sky-900 sm:text-sm">{item.title}</div>
              <div className="mt-1.5 text-xs leading-5 text-slate-600">{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. 充值后怎么用？2×2 嵌套式四大热门充值场景矩阵 */}
      <section className="rounded-2xl border border-slate-200/85 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
            <Sparkles className={`h-5 w-5 ${theme.accentText}`} />
            充值后怎么用？{profile.carrierName} 四大热门实用场景
          </h3>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            充入您的 {profile.carrierName}（{profile.dialPrefix}）预付费号码后，以下日常保号、漫游与套餐需求均可轻松覆盖。
          </p>
        </div>

        <div className="mt-4 grid gap-3.5 md:grid-cols-2">
          {profile.useCases.map((cat, idx) => {
            const Icon = USECASE_ICONS[idx % USECASE_ICONS.length];
            return (
              <div key={cat.title} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Icon className={`h-4 w-4 ${theme.accentText}`} />
                    <span>{cat.title}</span>
                  </div>
                  <span className={`rounded-full border ${theme.accentBorder} bg-white px-2.5 py-0.5 text-[10px] font-semibold ${theme.accentText}`}>
                    {cat.badge}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {cat.items.map((sub) => (
                    <div key={sub.name} className="rounded-lg border border-slate-200/60 bg-white px-3.5 py-2.5">
                      <div className="text-xs font-semibold text-slate-900">{sub.name}</div>
                      <div className="mt-0.5 text-[11px] leading-4 text-slate-500">{sub.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 6. 4 步极简自助充值指南（双通道切换 + 官方充值站直达按钮） */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-2xs ${theme.buttonBg}`}>
              <Zap className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-950">4 步极简自助充值指南（使用方法）</h3>
              <p className="text-xs text-slate-500">支付后在「我的订单」复制官方 PIN 码，30 秒完成入账</p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-xs">
            <button
              type="button"
              onClick={() => setTab("web")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-all ${
                tab === "web" ? "bg-white text-slate-950 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              官网 / App 自助（国内推荐）
            </button>
            <button
              type="button"
              onClick={() => setTab("dial")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-all ${
                tab === "dial" ? "bg-white text-slate-950 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              拨号 / 短信直充（海外本地）
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {activeSteps.map((st) => (
            <div
              key={`${tab}-${st.step}`}
              className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/75 p-4"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 font-mono text-xs font-bold text-white shadow-2xs">
                {st.step}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-950 sm:text-sm">{st.title}</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{st.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs sm:text-sm">
          <span className="font-medium text-slate-700">
            官方自助充值通道直达（核销前请确认号段为 {profile.dialPrefix} {profile.carrierName}）：
          </span>
          {isExternalUrl ? (
            <a
              href={profile.officialHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition ${theme.buttonBg}`}
            >
              <span>前往 {profile.officialUrl}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <Link
              href={profile.officialHref}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition ${theme.buttonBg}`}
            >
              <span>查看国际 SIM 卡专区</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </section>

      {/* 7. 下单前必读：防踩坑与运营商隔离注意事项（玫瑰红警报风 + 选购实体卡联动条） */}
      <section className="rounded-2xl border border-rose-200/90 bg-rose-50/55 p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-rose-600" />
          <h3 className="text-base font-bold text-rose-950">下单前必读：运营商隔离与防踩坑注意事项</h3>
        </div>
        <p className="mt-1 text-xs font-medium text-rose-700 sm:text-sm">
          海外话费充值卡 99% 的核销失败源于「国家/运营商选错」或「后付费合约号误购预付费卡密」，下单前请逐条确认：
        </p>

        <div className="mt-4 space-y-2.5">
          {profile.warnings.map((w) => (
            <div key={w.title} className="rounded-xl border border-rose-200/75 bg-white/95 p-3.5 text-xs leading-6 sm:text-sm">
              <strong className="text-rose-800">{w.title}：</strong>
              <span className="text-slate-700">{w.desc}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/90 bg-amber-50/75 px-4 py-3 text-xs sm:text-sm">
          <span className="flex items-center gap-2 font-medium text-amber-950">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <strong>还没有海外实体 SIM 卡？</strong> 本站同步现货供应英国 Giffgaff、新西兰 One NZ、美国/日本/香港/欧洲原生保号卡。
            </span>
          </span>
          <Link
            href="/products/sim-cards"
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-amber-800 hover:text-amber-950 hover:underline"
          >
            <span>选购国际 SIM 卡</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* 8. 深色高级客服引导横幅（与 ChatGPT / 礼品卡旗舰横幅统一） */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-900 p-5 text-white shadow-md sm:p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/20 blur-3xl"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/20 text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white sm:text-lg">
                不确定海外卡所属运营商，或需要保号档位推荐？
              </h4>
              <p className="mt-1 text-xs text-slate-300 sm:text-sm">
                下单前可随时向客服发送 SIM 卡卡板照片或运营商名称，我们免费帮您核对所属国家、预付费类型及最省钱保号方案。
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openPublicSupport()}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90 sm:text-sm"
            >
              联系在线客服
            </button>
          </div>
        </div>
      </div>

      {/* 9. 可折叠常见疑问与售后速查 (FAQ) */}
      <section className="rounded-2xl border border-slate-200/85 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <HelpCircle className={`h-5 w-5 ${theme.accentText}`} />
          <h3 className="text-base font-bold text-slate-900">{profile.carrierName} 常见疑问与售后速查 (FAQ)</h3>
        </div>
        <div className="mt-4 space-y-3">
          {profile.faqs.map((faq, idx) => (
            <details
              key={faq.q}
              open={idx < 2}
              className="group rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 transition open:bg-white open:shadow-2xs"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold text-slate-900 sm:text-sm">
                <span className="flex items-center gap-2">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${theme.buttonBg}`}>
                    Q
                  </span>
                  <span>{faq.q}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400 transition-transform group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-2.5 pl-7 text-xs leading-6 text-slate-600 sm:text-sm sm:leading-6">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
