"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock3,
  CreditCard,
  Globe,
  HelpCircle,
  KeyRound,
  PhoneCall,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Signal,
  Smartphone,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react";

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

type CarrierProfile = {
  key: CarrierKey;
  carrierName: string;
  englishBadge: string;
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
  ussdCommand: string;
  officialUrl: string;
  officialChannelLabel: string;
  accountRequirement: string;
  theme: {
    heroGradient: string;
    heroGlowA: string;
    heroGlowB: string;
    accentBorder: string;
    badgeClass: string;
    accentSoftBg: string;
    accentText: string;
    tabActiveClass: string;
  };
  useCases: Array<{ tag: string; title: string; desc: string }>;
  webSteps: Array<{ step: string; title: string; detail: string }>;
  dialSteps: Array<{ step: string; title: string; detail: string }>;
  warnings: Array<{ title: string; detail: string }>;
  faqs: Array<{ q: string; a: string }>;
};

const CARRIER_PROFILES: Record<CarrierKey, CarrierProfile> = {
  "giffgaff-uk": {
    key: "giffgaff-uk",
    carrierName: "Giffgaff 英国",
    englishBadge: "Giffgaff UK Top-up Voucher",
    countryName: "英国",
    countryCode: "UK / GB",
    dialPrefix: "+44",
    currencyCode: "GBP",
    currencySymbol: "£",
    tagline: "官方 16 位充值卡密 · 0 月租保号续命神器 · 免绑海外银行卡秒到账",
    intro:
      "专为英国 Giffgaff 预付费实体卡 / eSIM 打造的正规官方 16 位充值 PIN 卡密。下单支付后 7×24h 自动发码，无需绑定 Visa/MasterCard 信用卡，即可在 Giffgaff 官网或 App 自助充值至话费余额（Credit）或直接兑换月度流量套餐（Plan / Goodybag）。",
    keepAliveTip:
      "保号核心提示：Giffgaff 卡片每 180 天需产生一次计费行为（发一条短信约 £0.30、接打电话或产生流量）或充值一次，充值 £10 余额即可轻松支撑多年国内漫游收验证码保号！",
    pinFormatLabel: "16 位纯数字官方充值卡密（Voucher Code）",
    pinSample: "4829 - 1034 - 9582 - 7361",
    ussdCommand: "拨打 43430 → 按 1 输入 16 位卡密",
    officialUrl: "giffgaff.com/top-up",
    officialChannelLabel: "Giffgaff 官网 / App（Redeem a voucher）或英国本地拨打 43430",
    accountRequirement: "仅限已激活的英国 Giffgaff（+44）账号与 SIM 卡，首次激活同样支持使用 £10 及以上卡密",
    theme: {
      heroGradient: "from-slate-950 via-emerald-950 to-teal-900",
      heroGlowA: "bg-emerald-400/25",
      heroGlowB: "bg-lime-400/20",
      accentBorder: "border-emerald-200/80",
      badgeClass: "border-emerald-300/35 bg-emerald-500/20 text-emerald-100",
      accentSoftBg: "bg-emerald-50/60",
      accentText: "text-emerald-700",
      tabActiveClass: "bg-emerald-600 text-white shadow-sm",
    },
    useCases: [
      { tag: "长期保号", title: "180 天超低成本保号续命", desc: "国内漫游免费接收全球短信，充入余额后每半年发一条短信即可长期维持英国 +44 号码不过期。" },
      { tag: "海外注册", title: "注册国际应用 & 银行验证", desc: "保持账户有余额可顺畅应对 WhatsApp、Telegram、Wise、ChatGPT 及海外电商的风控短信核验。" },
      { tag: "首次激活", title: "新卡免信用卡直接激活", desc: "收到全新的 Giffgaff 实体卡但没有外币卡时，可直接使用 £10 充值卡密完成官方在线激活。" },
      { tag: "赴英流量", title: "英国/欧盟旅游兑换月套餐", desc: "充值余额后可直接在 App 内勾选对应档位的 Plan（含英国通话及欧盟漫游流量包），随用随停。" },
    ],
    webSteps: [
      { step: "01", title: "登录 Giffgaff 官网或 App", detail: "打开浏览器访问 giffgaff.com/top-up 或打开 Giffgaff 官方 App，使用您的手机号或会员名登录。" },
      { step: "02", title: "进入 Voucher 卡密兑换入口", detail: "在充值页面点击「Redeem a voucher（使用充值卡）」，或新卡激活页选择「Activate with a voucher」。" },
      { step: "03", title: "输入 16 位充值 PIN 码", detail: "将本站订单详情页自动发放的 16 位数字卡密完整复制粘贴进输入框，仔细核对无空格后提交。" },
      { step: "04", title: "确认话费余额即时到账", detail: "提交后通常 10 秒内页面即显示充值成功，同时 Giffgaff 会下发入账短信并刷新账户 Credit 余额。" },
    ],
    dialSteps: [
      { step: "01", title: "确认手机已插入 Giffgaff SIM 卡", detail: "在英国当地网络信号覆盖下，使用需要充值的本机拨号键盘（国内漫游强烈建议直接使用上方官网方式）。" },
      { step: "02", title: "免费拨打官方充值专线 43430", detail: "在拨号界面输入 43430 并呼出，该号码在英国本地免费拨打。" },
      { step: "03", title: "根据语音提示按键选择充值", detail: "接通后按「1」进入话费余额充值（Top up credit），或按「2」将卡密直接兑换为月度套餐。" },
      { step: "04", title: "输入 16 位数字卡密并按 # 确认", detail: "依次输入收到的 16 位 PIN 码，语音播报确认金额后挂机即可收到入账通知短信。" },
    ],
    warnings: [
      { title: "仅限英国 Giffgaff 运营商使用", detail: "本卡密仅适用于英国 Giffgaff（+44）号码，无法用于 O2、Vodafone 或其他国家运营商。" },
      { title: "区分话费余额（Credit）与月租套餐（Plan）", detail: "在国内仅做收码保号请务必充值到「Credit 余额」，切勿误点「Buy a plan」，否则月套餐 30 天即到期清零。" },
      { title: "国内漫游优先使用官网网页充值", detail: "人在中国大陆漫游时拨打 43430 可能无法接通或产生漫游语音费，请直接登录 giffgaff.com/top-up 免费自助兑换。" },
      { title: "数字卡密一次性消耗不支持退换", detail: "卡密经系统向官方实时采购发放后即具备唯一性，发码后不支持无理由退换；建议发码后 24 小时内完成充值核验。" },
    ],
    faqs: [
      { q: "人在中国大陆，没有英国 IP 或信用卡可以充值吗？", a: "完全可以！使用本卡密登录 Giffgaff 官网或 App 兑换时，不需要绑定任何海外银行卡，国内网络环境即可顺利自助充值到账。" },
      { q: "新买的 Giffgaff 实体卡还没激活，可以用这张卡密激活吗？", a: "可以！Giffgaff 官方支持使用 £10 及以上面额的充值卡密进行首次开卡激活。激活页选择「Pay with a voucher」输入 16 位卡密即可。" },
      { q: "充值后余额有效期是多久？会过期吗？", a: "只要号码处于正常活跃状态（每 180 天至少有一次收费短信/通话/流量或充值记录），充入的 Credit 话费余额永久有效、不会清零。" },
      { q: "充值 £10 会不会自动开通月租套餐扣光余额？", a: "默认选择「Add credit」充入余额不会自动开通月套餐。请确认账户内未开启 Auto-renew（自动续费套餐），即可安心长期留存余额。" },
      { q: "下单支付后多久能拿到卡密？在哪里查看？", a: "全自动直连官方渠道采购，支付成功后通常 3–15 秒自动发码。您可在订单详情页直接复制，同时系统也会同步发送一份到您的联系邮箱。" },
      { q: "输入卡密提示无效或报错怎么办？", a: "请先确认未混入多余空格，且账号未处于停机销号（超过 180 天未保号被回收）状态。如仍异常，请截图报错界面并在 24 小时内联系在线客服核查。" },
    ],
  },
  "vodafone-uk": {
    key: "vodafone-uk",
    carrierName: "Vodafone 英国",
    englishBadge: "Vodafone UK Top-up PIN",
    countryName: "英国",
    countryCode: "UK / GB",
    dialPrefix: "+44",
    currencyCode: "GBP",
    currencySymbol: "£",
    tagline: "沃达丰英国官方充值 PIN · 支持 Pay As You Go 余额 & Big Value 套餐",
    intro:
      "适用于英国 Vodafone（+44）Pay As You Go 预付费实体卡与 eSIM 的官方直采充值卡密。免绑英国本土银行卡，支付后 7×24h 自动发码，支持通过 My Vodafone App、官网及官方拨号快速入账。",
    keepAliveTip:
      "适用提示：本商品专用于【英国区 Vodafone UK（+44）】预付费号码，不适用于西班牙 Vodafone（+34）或其他欧盟子网，下单前请确认您的号段归属地！",
    pinFormatLabel: "12 / 16 位官方充值 PIN 卡密（Top-up Voucher）",
    pinSample: "7391 - 4820 - 6153",
    ussdCommand: "本机免费拨打 2345 按提示输入 PIN",
    officialUrl: "vodafone.co.uk/top-up",
    officialChannelLabel: "My Vodafone App / 官网或拨打 2345",
    accountRequirement: "仅限英国区 Vodafone UK（+44）Pay As You Go 预付费用户（不支持合约月结账单）",
    theme: {
      heroGradient: "from-red-950 via-rose-900 to-slate-900",
      heroGlowA: "bg-red-500/30",
      heroGlowB: "bg-orange-400/20",
      accentBorder: "border-red-200/80",
      badgeClass: "border-red-300/35 bg-red-500/20 text-red-100",
      accentSoftBg: "bg-red-50/60",
      accentText: "text-red-700",
      tabActiveClass: "bg-red-600 text-white shadow-sm",
    },
    useCases: [
      { tag: "保号续费", title: "延长英国 Vodafone 号码有效期", desc: "定期补充预付费余额，防止长时间无消费导致号码休眠或被回收，稳保 +44 商务与注册号。" },
      { tag: "漫游收码", title: "海外收发短信与语音备用", desc: "账户保有余额即可应对漫游短信发送及必要语音接听，免去外币卡扣款失败的烦恼。" },
      { tag: "流量套餐", title: "续订 Big Value Bundle 套餐", desc: "充值到账后可直接在 My Vodafone App 内开启或续费流量与通话包，适合赴英商旅与留学。" },
      { tag: "灵活面额", title: "多档英镑面额随心选购", desc: "提供 £5 起多档官方英镑面额，小额保号或大额买包均可按需选择。" },
    ],
    webSteps: [
      { step: "01", title: "打开 My Vodafone App 或官网", detail: "登录英国 Vodafone 官网（vodafone.co.uk/top-up）或打开 My Vodafone App 并登录您的账号。" },
      { step: "02", title: "选择 Top up with a voucher", detail: "进入 Top-up 充值页面，选择使用「TopUp Voucher（充值卡密）」支付方式。" },
      { step: "03", title: "填写号码并输入卡密 PIN", detail: "核对接收充值的英国 +44 手机号码，粘贴本站发放的官方 PIN 卡密并确认提交。" },
      { step: "04", title: "等待官方短信确认到账", detail: "充值提交后余额将在数秒至 1 分钟内刷新，您也可在 App 首页直接查看最新英镑余额。" },
    ],
    dialSteps: [
      { step: "01", title: "在英国本地网络下打开拨号盘", detail: "使用已插入 Vodafone UK SIM 卡的手机（人在国内漫游建议使用官网/App 方式）。" },
      { step: "02", title: "拨打官方免费充值热线 2345", detail: "直接呼出 2345（海外漫游可尝试 +44 7836 191 919，注意可能产生国际话费）。" },
      { step: "03", title: "按语音指引进入卡密充值", detail: "接听语音菜单，选择「Top up using a voucher」选项。" },
      { step: "04", title: "输入官方 PIN 码并按 # 结束", detail: "按提示键入卡密数字并确认，语音播报成功后余额即刻生效。" },
    ],
    warnings: [
      { title: "严格区分英国 Vodafone 与西班牙 Vodafone", detail: "本站同时销售西班牙 Vodafone 实体卡（+34），本充值卡密【仅支持英国 Vodafone（+44）】，跨国无法兑换！" },
      { title: "仅支持 Pay As You Go 预付费账户", detail: "英国 Vodafone 合约月结（Pay Monthly）账户无法使用此 PIN 卡密抵扣账单。" },
      { title: "请确认号码未处于永久销号状态", detail: "若英国号超过 180 天无任何计费活动已被运营商回收，卡密将无法入账，请先确认号码正常。" },
      { title: "卡密属一次性商品发码不退", detail: "系统实时直采发码后不支持无理由退换，请在发码后 24 小时内完成兑换核验。" },
    ],
    faqs: [
      { q: "我的西班牙 Vodafone（+34）实体卡可以用这张充值卡吗？", a: "不可以！本商品是【英国 Vodafone UK（+44）】英镑充值卡密，不同国家沃达丰系统完全独立，请勿混用。" },
      { q: "英国 Vodafone 多久需要充一次或用一次保号？", a: "Vodafone UK 预付费卡通常要求每 180 天内至少有一次收费活动（发短信/通话/流量或充值）以维持号码有效。" },
      { q: "充值后会自动扣套餐吗？", a: "如果您的号码此前开通了自动续订的 Big Value Bundle，余额达标后系统可能会按规则自动续订；如只需纯余额保号，请在 App 中关闭套餐自动续费。" },
      { q: "支持国内网络直接兑换吗？", a: "支持通过 My Vodafone App 或英国官网自助兑换；如遇网页拦截，可切换英国线路代理后操作。" },
      { q: "下单后多久能收到卡密？", a: "系统 7×24h 全自动直采发码，支付成功后约 3–15 秒即可在订单页及联系邮箱查看完整 PIN 码。" },
      { q: "充值遇到问题怎么联系售后？", a: "请在发码后 24 小时内保留兑换报错截图，点击页面「联系在线客服」，我们将协助核验卡密状态。" },
    ],
  },
  "ee-uk": {
    key: "ee-uk",
    carrierName: "EE 英国",
    englishBadge: "EE UK Pay As You Go PIN",
    countryName: "英国",
    countryCode: "UK / GB",
    dialPrefix: "+44",
    currencyCode: "GBP",
    currencySymbol: "£",
    tagline: "英国覆盖率冠军 EE 官方充值卡密 · 支持短信直充与官网自助兑换",
    intro:
      "适用于英国最大 5G 移动运营商 EE（Everything Everywhere，+44）Pay As You Go 预付费号码的官方充值卡密。支持多档英镑面额，无需海外银行卡，秒级自动发码，轻松完成余额补充与套餐续订。",
    keepAliveTip:
      "快捷贴士：EE 支持通过官网、EE App、拨打 150 或直接发送短信「VO + 16位卡密」至 150 完成充值，操作极为便捷！",
    pinFormatLabel: "16 位官方 EE 充值 PIN 卡密（Top-up Voucher）",
    pinSample: "6194 - 2850 - 7319 - 4028",
    ussdCommand: "发送短信 VO <16位卡密> 至 150 或拨打 150",
    officialUrl: "ee.co.uk/topup",
    officialChannelLabel: "EE App / 官网 ee.co.uk/topup 或短信/拨打 150",
    accountRequirement: "仅限英国 EE（+44）Pay As You Go 预付费实体卡或 eSIM 账号",
    theme: {
      heroGradient: "from-teal-950 via-cyan-900 to-slate-900",
      heroGlowA: "bg-teal-400/30",
      heroGlowB: "bg-yellow-300/20",
      accentBorder: "border-teal-200/80",
      badgeClass: "border-teal-300/35 bg-teal-500/20 text-teal-100",
      accentSoftBg: "bg-teal-50/60",
      accentText: "text-teal-700",
      tabActiveClass: "bg-teal-600 text-white shadow-sm",
    },
    useCases: [
      { tag: "保号续命", title: "维持英国原生 EE 号码活跃", desc: "补充预付费英镑余额并触发账户活跃，避免 180 天无消耗休眠风险。" },
      { tag: "留学必备", title: "赴英留学首月话费与流量包", desc: "无需提前办理英国本土借记卡，落地即可充值并选购 EE 高速 5G Data Pack。" },
      { tag: "免卡支付", title: "绕开外币信用卡账单地址风控", desc: "EE 官网刷海外信用卡常触发 UK 账单地址校验失败，官方 PIN 卡密 100% 稳定入账。" },
      { tag: "小额灵活", title: "£5 起多档英镑面额任选", desc: "支持小额保号与大额月包续费，资金占用低、到账快。" },
    ],
    webSteps: [
      { step: "01", title: "打开 EE 官网充值页或 EE App", detail: "访问 ee.co.uk/topup 或登录手机上的官方 EE App，进入您的 Pay As You Go 账户。" },
      { step: "02", title: "选择 Voucher 充值卡密方式", detail: "点击「Top up with a voucher」，确认需要充值的英国 EE 手机号码。" },
      { step: "03", title: "粘贴 16 位官方 PIN 码", detail: "完整输入本站自动发放的 16 位卡密数字，核对无误后点击确认兑换。" },
      { step: "04", title: "查收官方入账短信与余额", detail: "兑换成功后余额即时到账，随后可在 App 内按需保留余额或购买月度流量 Pack。" },
    ],
    dialSteps: [
      { step: "01", title: "方式 A：短信快捷充值（英国本地）", detail: "使用本机编辑短信「VO」加空格再加 16 位卡密（如 VO 1234567890123456）发送至 150。" },
      { step: "02", title: "方式 B：拨打 150 语音充值", detail: "使用本机免费拨打 150，按语音提示选择「Top up with a voucher」。" },
      { step: "03", title: "输入 16 位 PIN 码确认", detail: "按提示完整键入卡密并确认提交。" },
      { step: "04", title: "查收到账回执", detail: "发送短信「AL」至 150 或登录 EE App 即可查询最新话费余额与套餐余量。" },
    ],
    warnings: [
      { title: "仅限英国 EE Pay As You Go 预付费卡", detail: "不支持 EE 合约月结账单（Pay Monthly）及非英国区运营商。" },
      { title: "国内漫游推荐官网/App 兑换", detail: "漫游状态下发送短信至 150 可能失效或产生国际短信费，请优先使用 EE App 或官网网页充值。" },
      { title: "留意账户 180 天活跃周期", detail: "EE 预付费号需每 180 天至少产生一次计费行为（发短信/通话/使用流量）方可保号。" },
      { title: "一次性 PIN 卡密发码不退换", detail: "发码后不支持无理由退换，请在 24 小时内完成核验，异常情况及时联系客服。" },
    ],
    faqs: [
      { q: "为什么在 EE 官网绑国内信用卡老是失败？", a: "EE 官网支付网关对非英国本土发行的银行卡及账单地址校验非常严格，使用官方 16 位 PIN 卡密充值可彻底跳过银行卡风控。" },
      { q: "充值卡密是直接变成余额还是套餐？", a: "充值后默认进入您的 EE Pay As You Go 话费余额（Credit），随后您可在 EE App 内自由决定留作保号余额或兑换 Data/Calls Pack。" },
      { q: "国内能收 EE 短信并登录 App 充值吗？", a: "EE 开通国际漫游后在国内可接收短信，登录 EE App 或官网即可完成卡密兑换。" },
      { q: "下单后多快发码？", a: "7×24h 自动对接官方渠道采购，支付完成后通常 3–15 秒即可在订单页看到卡密。" },
      { q: "可以一次购买多张卡密叠加充值吗？", a: "可以！多张卡密依次兑换即可累加至您的 EE 账户总余额中。" },
      { q: "兑换时提示错误怎么办？", a: "请核对卡密长度与号码归属，确保无前后空格；如遇异常请保留报错截图并在 24 小时内联系客服处理。" },
    ],
  },
  "three-uk": {
    key: "three-uk",
    carrierName: "Three (3) 英国",
    englishBadge: "Three UK Pay As You Go PIN",
    countryName: "英国",
    countryCode: "UK / GB",
    dialPrefix: "+44",
    currencyCode: "GBP",
    currencySymbol: "£",
    tagline: "英国 Three (3) 官方 16 位充值卡密 · 全球 Go Roam 漫游流量好搭档",
    intro:
      "专为英国 Three（3 UK，+44）Pay As You Go 预付费手机卡提供的官方 16 位充值卡密。免绑英国信用卡，支持通过 Three 官网、App 或拨打 444 自助兑换，可用于余额充值及 Data Pack 漫游流量套餐。",
    keepAliveTip:
      "出行亮点：Three UK 支持全球 70+ 国家/地区 Go Roam 漫游特性，充值余额后可随时在账户内按需启用 Data Pack，兼顾长期保号与跨境漫游！",
    pinFormatLabel: "16 位官方 Three UK 充值 PIN 卡密",
    pinSample: "5208 - 9173 - 4620 - 8351",
    ussdCommand: "英国本地拨打 444 按提示输入 16 位卡密",
    officialUrl: "three.co.uk/top-up",
    officialChannelLabel: "Three App / 官网 three.co.uk/top-up 或拨打 444",
    accountRequirement: "仅限英国区 Three UK（+44）Pay As You Go 预付费号码（不适用于香港 3HK）",
    theme: {
      heroGradient: "from-slate-950 via-indigo-950 to-purple-950",
      heroGlowA: "bg-indigo-500/30",
      heroGlowB: "bg-fuchsia-400/20",
      accentBorder: "border-indigo-200/80",
      badgeClass: "border-indigo-300/35 bg-indigo-500/20 text-indigo-100",
      accentSoftBg: "bg-indigo-50/60",
      accentText: "text-indigo-700",
      tabActiveClass: "bg-indigo-600 text-white shadow-sm",
    },
    useCases: [
      { tag: "保号续费", title: "维持英国 +44 号码长期有效", desc: "定期补充预付费余额并产生一次低额计费，保住 Three 英国原生号码与海外绑定服务。" },
      { tag: "跨境漫游", title: "选购 Three Go Roam 流量包", desc: "余额到账后可直接兑换 Three 英国与欧盟/全球漫游 Data Pack，出国差旅无忧。" },
      { tag: "免绑外卡", title: "告别外币卡风控拒付", desc: "官方卡密直接绕开 UK 银行卡 AVS 地址校验，国内支付宝/微信/USDT 即可完成购卡。" },
      { tag: "多档面额", title: "£10 起多档面额按需选", desc: "满足从日常轻度保号到整月大流量套餐的各类充值需求。" },
    ],
    webSteps: [
      { step: "01", title: "访问 Three UK 官网或 App", detail: "打开浏览器访问 three.co.uk/top-up 或启动 Three 官方 App，输入您的英国手机号。" },
      { step: "02", title: "选择使用 Voucher 卡密充值", detail: "在充值方式中勾选「Use a top-up voucher（使用充值卡密）」。" },
      { step: "03", title: "输入 16 位官方充值 PIN", detail: "粘贴本站订单页自动交付的 16 位卡密，确认手机号无误后提交。" },
      { step: "04", title: "余额实时入账并可兑换套餐", detail: "提交后英镑余额将迅速到账，可在 My3 面板查看余额或进一步购买 Data Pack。" },
    ],
    dialSteps: [
      { step: "01", title: "插入 Three UK 手机卡并确保有信号", detail: "在英国当地网络下使用本机拨号键盘（国内漫游请优先使用上方官网兑换）。" },
      { step: "02", title: "免费拨打官方充值号码 444", detail: "直接拨打 444 进入 Three Pay As You Go 语音自助服务系统。" },
      { step: "03", title: "选择 Voucher 充值选项", detail: "按语音菜单提示选择使用 16 位 Top-up Voucher 充值。" },
      { step: "04", title: "键入 16 位 PIN 码完成入账", detail: "输入完整数字后按确认键，挂机即可收到官方充值成功短信。" },
    ],
    warnings: [
      { title: "不适用于中国香港 3HK（+852）", detail: "本商品专用于【英国 Three UK（+44）】英镑区预付费卡，香港 3HK / DIY 储值卡请勿购买！" },
      { title: "仅支持 Pay As You Go 预付费卡", detail: "Three 英国后付费合约账单（Pay Monthly）不支持使用此卡密。" },
      { title: "关注号码保号期限", detail: "Three UK 预付费卡同样需要每 180 天内保持至少一次付费消费或充值，避免号码失效。" },
      { title: "卡密一次性消费发码不退", detail: "请确认号码归属英国 Three 后下单，发码后不支持无理由退换，建议 24 小时内完成充值。" },
    ],
    faqs: [
      { q: "我的香港 3HK / 万能卡可以用这张 Three 充值卡吗？", a: "不可以！这张是英国 Three UK（+44）英镑充值卡，和香港 3HK（+852）属于不同国家与币种体系，不能互通。" },
      { q: "充值后如何用余额买流量包？", a: "余额入账后，在 My3 官网或 Three App 点击「Buy a Data Pack」并选择使用账户 Credit 支付即可。" },
      { q: "在国内可以给 Three UK 充值吗？", a: "可以！直接通过 Three UK 官网的 Top-up with Voucher 页面输入手机号与 16 位卡密即可远程充值。" },
      { q: "卡密有使用期限吗？", a: "官方直采实时新码，但为保障您的权益及核验时效，强烈建议收到卡密后 24 小时内完成充值兑换。" },
      { q: "支付后多久发货？", a: "全自动直连官方供应商采购，付款后 3–15 秒自动发码至订单页面与您的联系邮箱。" },
      { q: "充值失败如何处理？", a: "请确认手机号为英国 Three 预付费号且未销号，保留报错截图并在 24 小时内联系在线客服协助排查。" },
    ],
  },
  "lebara-uk": {
    key: "lebara-uk",
    carrierName: "Lebara 英国",
    englishBadge: "Lebara Mobile UK PIN",
    countryName: "英国",
    countryCode: "UK / GB",
    dialPrefix: "+44",
    currencyCode: "GBP",
    currencySymbol: "£",
    tagline: "英国 Lebara 官方直采充值卡密 · Vodafone 基站信号 · 国际通话高性价比",
    intro:
      "适用于英国 Lebara Mobile（+44）预付费手机卡的官方充值 PIN 卡密。Lebara 依托英国 Vodafone 优质网络，主打高性价比国际长途及灵活 30 天无合约套餐，支持 USSD 快捷指令与官网自助入账。",
    keepAliveTip:
      "快捷贴士：英国本地拨打 *1345*PIN# 即可一键完成充值；人在国内漫游也可登录 lebara.co.uk 官网或 MyLebara App 输入卡密秒到账！",
    pinFormatLabel: "16 位官方 Lebara UK 充值卡密（Top-up Voucher）",
    pinSample: "8472 - 3910 - 5624 - 1893",
    ussdCommand: "拨号输入 *1345*16位卡密# 或拨打 5588",
    officialUrl: "lebara.co.uk/en/top-up",
    officialChannelLabel: "MyLebara App / 官网或拨号 *1345*PIN#",
    accountRequirement: "仅限英国区 Lebara UK（+44）预付费账户（不适用于法国/德国/荷兰等其他国家 Lebara）",
    theme: {
      heroGradient: "from-sky-950 via-blue-900 to-cyan-950",
      heroGlowA: "bg-sky-400/30",
      heroGlowB: "bg-cyan-300/20",
      accentBorder: "border-sky-200/80",
      badgeClass: "border-sky-300/35 bg-sky-500/20 text-sky-100",
      accentSoftBg: "bg-sky-50/60",
      accentText: "text-sky-700",
      tabActiveClass: "bg-sky-600 text-white shadow-sm",
    },
    useCases: [
      { tag: "保号续命", title: "低门槛维护英国 +44 号码", desc: "支持 £5 起小额英镑充值，轻松延长英国 Lebara 预付费卡活跃周期。" },
      { tag: "国际通话", title: "直拨中国及全球 40+ 国家", desc: "Lebara 以极低的国际通话资费闻名，充入余额或选购国际套餐非常适合留学生与华人联系国内。" },
      { tag: "英国流量", title: "免合约购买 30 天高流量包", desc: "充值到账后可直接在 MyLebara App 内选用无合约流量包，覆盖英国全境及欧盟漫游。" },
      { tag: "免外币卡", title: "告别外币卡支付难题", desc: "无需英国本土借记卡，下单秒发官方 PIN 码，随时随地自主充值。" },
    ],
    webSteps: [
      { step: "01", title: "登录 Lebara UK 官网或 App", detail: "访问 lebara.co.uk 或打开 MyLebara App，登录您的英国 Lebara 账号。" },
      { step: "02", title: "进入 Voucher Top-up 入口", detail: "点击菜单中的「Top Up」，选择「Redeem Voucher（卡密兑换）」选项。" },
      { step: "03", title: "输入 16 位官方卡密 PIN", detail: "复制粘贴本站自动发放的 16 位数字卡密并提交确认。" },
      { step: "04", title: "核对账户英镑余额到账", detail: "充值提交后即时入账，随后可在账户内查看余额或按需开通月度套餐。" },
    ],
    dialSteps: [
      { step: "01", title: "打开 Lebara UK 本机拨号键盘", detail: "确保手机已插入英国 Lebara SIM 卡并连接网络。" },
      { step: "02", title: "输入 USSD 快捷指令直充", detail: "在拨号盘输入 *1345*16位卡密# 并按下呼叫键（或免费拨打 5588 按语音提示操作）。" },
      { step: "03", title: "等待屏幕弹窗或入账短信", detail: "系统将在数秒内返回充值成功提示及最新英镑余额。" },
      { step: "04", title: "查询余额指令", detail: "随时拨打 *#1345# 即可免费查看当前 Lebara 话费余额。" },
    ],
    warnings: [
      { title: "仅限英国区 Lebara UK（+44）", detail: "Lebara 在德/法/荷/澳等多国均有业务，本卡密仅限【英国英镑区 Lebara UK】，其他国家卡无法兑换！" },
      { title: "确认 SIM 卡已激活且未过期", detail: "请确认您的号码仍在有效期内，长时间未消费导致回收的号码无法完成入账。" },
      { title: "国内漫游推荐官网/App 兑换", detail: "人在国内漫游如 USSD 无法下发，请直接登录 MyLebara App 或英国官网兑换。" },
      { title: "一次性数字商品售出不退", detail: "卡密经官方实时发码后不支持无理由退换，请在 24 小时内完成核验。" },
    ],
    faqs: [
      { q: "德国或荷兰的 Lebara 手机卡能用这张充值卡吗？", a: "不能！Lebara 各国卡密严格按国家隔离，本商品仅支持英国 Lebara UK（+44 / 英镑 GBP）。" },
      { q: "怎么查 Lebara 英国卡当前余额？", a: "在手机拨号盘输入 *#1345# 呼出，或登录 MyLebara App 即可实时查看余额与套餐有效期。" },
      { q: "充值 £5 后可以用来买套餐吗？", a: "可以！余额入账后可在 App 内选择与余额匹配的 30 天 SIM-only 套餐，也可留作余额保号。" },
      { q: "下单支付后多久能拿到卡密？", a: "系统 7×24h 全自动直采发码，支付成功后约 3–15 秒自动显示在订单详情页并同步发送至邮箱。" },
      { q: "支持多张卡密连续充值叠加余额吗？", a: "支持！依次输入每张卡密即可累加至账户余额。" },
      { q: "兑换提示错误怎么处理？", a: "请检查是否误输空格或选错了国家站点（需确认网址为 lebara.co.uk），如仍有问题请 24 小时内截图联系客服。" },
    ],
  },
  "lyca-uk": {
    key: "lyca-uk",
    carrierName: "Lyca Mobile 英国",
    englishBadge: "Lyca Mobile UK Top-up PIN",
    countryName: "英国",
    countryCode: "UK / GB",
    dialPrefix: "+44",
    currencyCode: "GBP",
    currencySymbol: "£",
    tagline: "英国 Lyca Mobile 官方充值 PIN · 支持 *131*PIN# 一键直充",
    intro:
      "适用于英国 Lyca Mobile（+44）预付费手机卡的官方直采充值卡密。支持 £5 起多档英镑面额，无需绑定英国本土银行卡，通过官网、App 或拨号指令 *131*PIN# 即可快速到账。",
    keepAliveTip:
      "国家隔离提醒：本商品为【英国区 Lyca Mobile UK（+44 / GBP）】专用；如果您使用的是美国 Lyca Mobile（+1 / USD），请选择本站「Lyca Mobile 美国话费充值卡」！",
    pinFormatLabel: "12–16 位官方 Lyca Mobile UK 充值卡密",
    pinSample: "3915 - 8042 - 6719",
    ussdCommand: "拨号输入 *131*PIN# 或拨打 321 按语音提示",
    officialUrl: "lycamobile.co.uk/en/quick-top-up",
    officialChannelLabel: "Lyca Mobile UK 官网 / App 或拨号 *131*PIN#",
    accountRequirement: "仅限英国区 Lyca Mobile UK（+44）预付费号码（不可用于美国区或其他国家 Lyca）",
    theme: {
      heroGradient: "from-blue-950 via-indigo-900 to-sky-900",
      heroGlowA: "bg-blue-400/30",
      heroGlowB: "bg-emerald-400/20",
      accentBorder: "border-blue-200/80",
      badgeClass: "border-blue-300/35 bg-blue-500/20 text-blue-100",
      accentSoftBg: "bg-blue-50/60",
      accentText: "text-blue-700",
      tabActiveClass: "bg-blue-600 text-white shadow-sm",
    },
    useCases: [
      { tag: "保号续费", title: "轻松维持英国 +44 预付费号码", desc: "支持 £5 起小额英镑充值，定期入账保号，稳定接收海外平台注册与登录短信。" },
      { tag: "留学商旅", title: "英国本地高速流量与国际通话", desc: "Lyca Mobile UK 依托 EE 网络且国际通话资费优惠，适合留学生及赴英商务出行。" },
      { tag: "一键直充", title: "USSD 指令 5 秒完成入账", desc: "英国本地只需拨打 *131*PIN# 即可完成充值，无需繁琐注册流程。" },
      { tag: "无卡充值", title: "免外币信用卡轻松自助续费", desc: "支持支付宝、微信、余额及 USDT 购买官方卡密，彻底解决跨币种支付障碍。" },
    ],
    webSteps: [
      { step: "01", title: "打开 Lyca Mobile UK 官网或 App", detail: "访问英国官网 lycamobile.co.uk（请确认域名为 .co.uk）或打开 My Lyca App。" },
      { step: "02", title: "选择 Voucher / Top-up 兑换入口", detail: "进入 Top-up 页面并选择使用「Voucher PIN（充值卡密）」方式充值。" },
      { step: "03", title: "输入手机号与官方 PIN 卡密", detail: "准确填写您的英国 +44 号码及本站发放的充值 PIN 码并提交。" },
      { step: "04", title: "确认英镑余额入账", detail: "提交后数秒即可到账，可拨打 *131# 或在 App 内查询最新余额。" },
    ],
    dialSteps: [
      { step: "01", title: "使用已插卡的手机打开拨号盘", detail: "在英国当地网络下使用 Lyca UK 本机操作（国内漫游推荐上方官网方式）。" },
      { step: "02", title: "输入快捷充值码 *131*PIN#", detail: "例如输入 *131*123456789012# 后点击拨出（也可免费拨打 321 按语音提示输入）。" },
      { step: "03", title: "查收系统弹窗与短信回执", detail: "指令执行后屏幕将提示充值成功并刷新您的账户英镑余额。" },
      { step: "04", title: "查询余额指令 *131#", detail: "日常拨打 *131# 即可快速查询余额。" },
    ],
    warnings: [
      { title: "严禁与美国 Lyca Mobile（+1）混用", detail: "英国 Lyca（.co.uk / 英镑）与美国 Lyca（.us / 美元）完全隔离，下单前务必核对号码区号为 +44！" },
      { title: "确认号码处于正常有效状态", detail: "如号码长期停用被运营商注销，卡密将无法兑换到账。" },
      { title: "国内漫游建议通过 App / 官网操作", detail: "漫游状态下 USSD 代码可能受限，直接登录英国官网或 App 兑换更稳定。" },
      { title: "卡密发码后不支持无理由退换", detail: "一次性官方 PIN 码发码后不可撤销，请于 24 小时内核验入账。" },
    ],
    faqs: [
      { q: "我的美国 Lyca（+1）卡买错成英国 Lyca 了怎么办？", a: "由于卡密属一次性官方直采数字商品，发码前请联系客服；下单前请务必核对号段：英国为 +44（GBP），美国为 +1（USD）。" },
      { q: "怎么查询 Lyca UK 当前余额？", a: "本机拨打 *131# 或登录 My Lyca UK App 即可实时查看余额与套餐余量。" },
      { q: "充值后可以直接购买 National / UK Plan 吗？", a: "可以！余额入账后可在 App 或官网选择使用账户 Credit 购买对应月度流量/通话包。" },
      { q: "下单后多快自动发码？", a: "全自动系统直采，支付成功后通常 3–15 秒自动交付 PIN 码并同步发送至您的联系邮箱。" },
      { q: "卡密有效期有多长？", a: "均为实时采购的新鲜官方卡密，建议在收码后 24 小时内尽快充值核验。" },
      { q: "兑换遇到报错如何售后？", a: "请截图报错页面及号码归属信息，24 小时内点击下方「联系在线客服」获取人工协助。" },
    ],
  },
  "tmobile-us": {
    key: "tmobile-us",
    carrierName: "T-Mobile 美国",
    englishBadge: "T-Mobile US Prepaid Refill PIN",
    countryName: "美国",
    countryCode: "US",
    dialPrefix: "+1",
    currencyCode: "USD",
    currencySymbol: "$",
    tagline: "美国 T-Mobile 官方 Prepaid 充值 PIN · 支持 PayGo / Connect 预付费续费",
    intro:
      "专为美国 T-Mobile Prepaid（+1）预付费手机卡打造的正规官方 Refill PIN 充值卡密。免绑美国信用卡、免去外币账单地址校验，支付后 7×24h 自动发码，轻松给 T-Mobile 预付费账户充值保号或自动抵扣月租！",
    keepAliveTip:
      "Ultra / PayGo 用户必看：本商品适用于【T-Mobile 原生 Prepaid 预付费账户】（含老版 PayGo、T-Mobile Connect 等）。如您使用的是 Ultra Mobile（紫卡 / 橙卡 $3 PayGo），请确认您的账号是在 T-Mobile Prepaid 官网还是 Ultra Mobile 官网缴费！",
    pinFormatLabel: "14 位官方 T-Mobile Prepaid Refill PIN 卡密",
    pinSample: "5842 - 9031 - 7462 - 19",
    ussdCommand: "拨号输入 *233*PIN#（即 *ADD*PIN#）",
    officialUrl: "prepaid.t-mobile.com",
    officialChannelLabel: "T-Mobile Prepaid 官网 / App 或拨号 *233*PIN#",
    accountRequirement: "仅限美国 T-Mobile Prepaid（预付费）账户，不支持 Postpaid 后付费合约账单",
    theme: {
      heroGradient: "from-pink-950 via-fuchsia-900 to-slate-950",
      heroGlowA: "bg-pink-500/35",
      heroGlowB: "bg-rose-400/20",
      accentBorder: "border-pink-200/80",
      badgeClass: "border-pink-300/35 bg-pink-500/25 text-pink-100",
      accentSoftBg: "bg-pink-50/60",
      accentText: "text-pink-700",
      tabActiveClass: "bg-pink-600 text-white shadow-sm",
    },
    useCases: [
      { tag: "保号续租", title: "预付费美国原生号按月续费", desc: "为 T-Mobile Prepaid / Connect 账户补充美元余额，月租到期自动从余额扣缴，防止停机。" },
      { tag: "免美卡支付", title: "彻底绕开美区信用卡风控", desc: "T-Mobile 官网经常拦截国内双币卡或非美区账单地址，使用官方 Refill PIN 稳定 100% 入账。" },
      { tag: "免税优势", title: "充入美元余额直观清晰", desc: "卡密按面额足额充值至 Prepaid 账户余额，透明无隐藏手续费。" },
      { tag: "赴美出行", title: "美国商旅与留学应急续费", desc: "人在国内或美国均可秒级买码续费，不断网、不掉线、不丢号。" },
    ],
    webSteps: [
      { step: "01", title: "登录 T-Mobile Prepaid 官网", detail: "使用浏览器访问 prepaid.t-mobile.com 并登录您的美国 T-Mobile 预付费账号（国内访问建议配合美区网络）。" },
      { step: "02", title: "点击 Refill / Redeem PIN 入口", detail: "在账户首页点击「Refill」按钮，在支付方式中选择「Refill Card / PIN」。" },
      { step: "03", title: "输入官方 Refill PIN 码", detail: "粘贴本站自动发放的官方 PIN 数字，核对号码与金额无误后点击 Submit 提交。" },
      { step: "04", title: "确认美元余额到账", detail: "通常数秒内账户 Balance 即会增加对应美元面额，月套餐到期时将自动从余额中扣费续期。" },
    ],
    dialSteps: [
      { step: "01", title: "在有信号设备上打开拨号盘", detail: "使用已插卡且接入 T-Mobile 网络（或 Wi-Fi Calling 已就绪）的手机。" },
      { step: "02", title: "拨打快捷充值指令 *233*PIN#", detail: "在拨号盘输入 *233*收到的PIN码#（字母对应 *ADD*PIN#）并呼出。" },
      { step: "03", title: "等待系统弹窗确认", detail: "屏幕会返回充值成功的确认信息及更新后的账户余额。" },
      { step: "04", title: "查询余额指令 #225#", detail: "日常拨打 #225#（#BAL#）即可随时查看当前美元余额与套餐到期日。" },
    ],
    warnings: [
      { title: "仅限 T-Mobile Prepaid 预付费账户", detail: "不支持 T-Mobile Postpaid 后付费合约账单，亦不支持 Metro by T-Mobile 或 Mint Mobile 等独立子品牌。" },
      { title: "请确认是否与 Ultra Mobile 区分", detail: "Ultra Mobile（如 $3 橙卡 PayGo）需在 Ultra Mobile 独立体系缴费，请先确认您登录的是 prepaid.t-mobile.com 官网！" },
      { title: "国内打开官网可能需要美区网络", detail: "T-Mobile 美国官网对非美区 IP 偶尔有限流或人机验证，如打不开网页请切换干净的美区线路后重试。" },
      { title: "数字卡密发码后不支持无理由退换", detail: "官方直采实时发码具有唯一性，请确认账户类型后下单，发码后 24 小时内完成充值核验。" },
    ],
    faqs: [
      { q: "我的 T-Mobile 套餐是月结账单（Postpaid），能用这个充值卡吗？", a: "不可以！本 Refill PIN 仅适用于 T-Mobile Prepaid（预付费）账户，Postpaid 后付费账单无法兑换。" },
      { q: "充值卡密入账后，月租会自动扣吗？", a: "是的！T-Mobile Prepaid 会在您的月租续费日优先扣除账户内的美元余额，余额足够即自动续订下一周期。" },
      { q: "人在中国大陆能给 T-Mobile 充值吗？", a: "可以！通过美区网络登录 prepaid.t-mobile.com 网页即可自助输入 Refill PIN 充值，或在开启 Wi-Fi Calling 后拨打 *233*PIN#。" },
      { q: "Ultra Mobile PayGo 紫卡/橙卡可以用 T-Mobile 卡密吗？", a: "一般不能直接通用。Ultra Mobile 为独立运营的 MVNO 虚拟运营商，仅限原生 T-Mobile Prepaid 账户使用本卡密。" },
      { q: "下单支付后多久能拿到 PIN 码？", a: "全自动直连官方渠道采购，支付成功后 3–15 秒自动发码至订单详情页与联系邮箱。" },
      { q: "遇到网页报错或无法兑换怎么办？", a: "请检查是否处于美国网络环境并核对账号确属 Prepaid 类型；如遇卡密本身问题请在 24 小时内截图联系客服。" },
    ],
  },
  "att-us": {
    key: "att-us",
    carrierName: "AT&T 美国",
    englishBadge: "AT&T US Prepaid Refill PIN",
    countryName: "美国",
    countryCode: "US",
    dialPrefix: "+1",
    currencyCode: "USD",
    currencySymbol: "$",
    tagline: "美国 AT&T Prepaid 官方充值 PIN · 支持 *888*PIN# 与 paygonline 自助入账",
    intro:
      "适用于美国三大运营商之一 AT&T Prepaid（原 GoPhone，+1）预付费手机卡的官方直采 Refill PIN 卡密。无需美国银行卡，自动秒发卡密，轻松完成账户续费、保号及月度流量套餐扣款。",
    keepAliveTip:
      "有效期提示：AT&T Prepaid 不同面额的余额有效期各异（通常 $10–$24 有效期 30 天，$25–$99 有效期 90 天，$100+ 有效期 365 天），可按保号周期合理挑选面额！",
    pinFormatLabel: "10–12 位官方 AT&T Prepaid Refill PIN",
    pinSample: "4910 - 8273 - 6541",
    ussdCommand: "拨号输入 *888*PIN# 或拨打 611",
    officialUrl: "paygonline.com",
    officialChannelLabel: "AT&T Prepaid 官网（paygonline.com）或拨号 *888*PIN#",
    accountRequirement: "仅限美国 AT&T Prepaid 预付费号码，不支持 AT&T Postpaid 后付费合约账户",
    theme: {
      heroGradient: "from-sky-950 via-blue-900 to-slate-900",
      heroGlowA: "bg-sky-400/35",
      heroGlowB: "bg-blue-400/20",
      accentBorder: "border-sky-200/80",
      badgeClass: "border-sky-300/35 bg-sky-500/25 text-sky-100",
      accentSoftBg: "bg-sky-50/60",
      accentText: "text-sky-700",
      tabActiveClass: "bg-sky-600 text-white shadow-sm",
    },
    useCases: [
      { tag: "保号续命", title: "延长 AT&T 美国原生号余额周期", desc: "按需选购 $10 / $25 / $50 / $100 等面额，合理匹配 30 天、90 天乃至 365 天余额有效期。" },
      { tag: "免外币卡", title: "跳过美区信用卡 AVS 地址限制", desc: "AT&T paygonline 官网对非美区发卡行拦截率极高，官方 PIN 卡密直接入账零风控。" },
      { tag: "月包续订", title: "预充月租余额自动扣费", desc: "提前将美元充值到账户余额中，月度套餐到期时自动扣除，避免断网停机。" },
      { tag: "多档可选", title: "覆盖全档位美元面额", desc: "支持多档官方美元面额，从轻度保号到整年预付费计划一站搞定。" },
    ],
    webSteps: [
      { step: "01", title: "登录 AT&T Prepaid 官网", detail: "浏览器访问 paygonline.com（建议使用美区网络），输入您的 10 位美国手机号与账户密码登录。" },
      { step: "02", title: "进入 Make a Payment 页面", detail: "点击「Make a Payment」或「Refill」，选择支付方式为「AT&T Prepaid Refill Card / PIN」。" },
      { step: "03", title: "输入官方 Refill PIN 码", detail: "粘贴本站自动发放的 PIN 数字，仔细核对后点击 Continue / Submit 提交。" },
      { step: "04", title: "查看美元余额与新有效期", detail: "入账后页面立即刷新账户 Balance 及新的到期日期，同时下发确认短信。" },
    ],
    dialSteps: [
      { step: "01", title: "使用 AT&T 本机打开拨号键盘", detail: "确保手机处于 AT&T 信号或 Wi-Fi Calling 连接状态。" },
      { step: "02", title: "输入快捷充值码 *888*PIN#", detail: "在拨号盘键入 *888*收到的PIN码# 后按拨打键提交（或拨打 611 按语音提示操作）。" },
      { step: "03", title: "查收官方入账回执", detail: "屏幕将弹出充值成功提示，账户余额与有效期同步更新。" },
      { step: "04", title: "快捷余额查询 *777#", detail: "随时拨打 *777# 即可免费查询 AT&T Prepaid 账户余额与到期日。" },
    ],
    warnings: [
      { title: "仅限 AT&T Prepaid 预付费卡", detail: "不支持 AT&T Postpaid 后付费账单，亦不支持 Cricket Wireless 等子品牌。" },
      { title: "留意不同面额的余额有效期规则", detail: "根据 AT&T 官方规则，$25 及以上面额通常享有 90 天有效期，$100 可享 365 天有效期，实际以官方入账提示为准。" },
      { title: "登录 paygonline.com 建议切美区 IP", detail: "AT&T 官网对海外直连 IP 经常返回 Access Denied，请使用稳定美国线路后再打开充值页。" },
      { title: "一次性 PIN 码发码不退换", detail: "支付发码后不支持无理由退换，请在 24 小时内完成充值核验。" },
    ],
    faqs: [
      { q: "为什么我在国内打不开 paygonline.com？", a: "AT&T 官网部署了严格的地理围栏，中国大陆直连经常显示 Access Denied。请切换干净的美国节点后再访问即可正常登录充值。" },
      { q: "充值卡密可以叠加延长有效期吗？", a: "可以！每次充值后，账户总余额的有效期会按照本次充值面额对应规则顺延（取更晚者）。" },
      { q: "Cricket Wireless 可以用 AT&T 充值卡密吗？", a: "不可以！尽管 Cricket 隶属 AT&T 旗下，但计费系统完全独立，本卡密仅限 AT&T Prepaid 使用。" },
      { q: "充值后如何查询余额和到期日？", a: "登录 paygonline.com 首页即可查看，或在美国本机拨打 *777# 免费查余额。" },
      { q: "下单后多快收到卡密？", a: "全自动直采，支付成功后 3–15 秒自动发码至订单详情页与联系邮箱。" },
      { q: "兑换失败怎么处理？", a: "请确认账号确属 AT&T Prepaid 且号码未过期注销，保留报错截图并在 24 小时内联系在线客服核查。" },
    ],
  },
  "verizon-us": {
    key: "verizon-us",
    carrierName: "Verizon 美国",
    englishBadge: "Verizon US Prepaid Refill PIN",
    countryName: "美国",
    countryCode: "US",
    dialPrefix: "+1",
    currencyCode: "USD",
    currencySymbol: "$",
    tagline: "美国全美信号标杆 Verizon 官方 Prepaid 充值 PIN · 秒级自动发码",
    intro:
      "适用于美国顶级运营商 Verizon Prepaid（+1）预付费手机卡的官方直采 Refill PIN 卡密。免绑美区信用卡，支付后自动交付官方 PIN 码，支持通过 My Verizon App、官网或拨打 #768 快速完成余额续费。",
    keepAliveTip:
      "账户核对提示：本卡密专用于【Verizon Prepaid 预付费】账户，不支持 Verizon Postpaid 合约月结账单及 Visible / Total Wireless 等子品牌！",
    pinFormatLabel: "12 位官方 Verizon Prepaid Refill PIN",
    pinSample: "9204 - 5183 - 7629",
    ussdCommand: "本机拨打 #768（#PMT）按提示输入 PIN",
    officialUrl: "verizon.com/prepaid",
    officialChannelLabel: "My Verizon App / 官网或拨打 #768",
    accountRequirement: "仅限美国 Verizon Prepaid（预付费）手机号账户",
    theme: {
      heroGradient: "from-zinc-950 via-red-950 to-neutral-900",
      heroGlowA: "bg-red-500/30",
      heroGlowB: "bg-zinc-400/20",
      accentBorder: "border-red-200/80",
      badgeClass: "border-red-300/35 bg-red-600/25 text-red-100",
      accentSoftBg: "bg-red-50/50",
      accentText: "text-red-700",
      tabActiveClass: "bg-red-600 text-white shadow-sm",
    },
    useCases: [
      { tag: "月租续费", title: "无缝续订 Verizon 预付费套餐", desc: "提前充入美元余额，套餐到期自动从账户余额扣除，保持 Verizon 旗舰网络持续在线。" },
      { tag: "免美卡付费", title: "绕开美国信用卡账单风控", desc: "无须持有美国本土发行信用卡，通过官方 Refill PIN 轻松完成美区话费充值。" },
      { tag: "商务保号", title: "稳定维护美国顶级实体运营商号", desc: "Verizon 原生实体号段在美区金融、电商与社交平台信用度极高，按期充值稳保号源。" },
      { tag: "远程代充", title: "身处海外也可为亲友续费", desc: "通过 Verizon 官网快速缴费入口输入手机号与 PIN 码，支持异地远程充值。" },
    ],
    webSteps: [
      { step: "01", title: "登录 My Verizon 官网或 App", detail: "访问 verizon.com/prepaid 或打开 My Verizon App，使用您的 Prepaid 账号登录（建议美区网络）。" },
      { step: "02", title: "进入 Make a Payment / Refill", detail: "在账户缴费面板选择「Use a Refill Card / PIN」作为支付方式。" },
      { step: "03", title: "输入官方 Refill PIN 码", detail: "完整输入本站自动交付的 PIN 数字，核对手机号及金额后提交。" },
      { step: "04", title: "查收余额更新通知", detail: "充值提交后数秒即可入账，余额会自动应用于当前或下一周期的 Prepaid 套餐扣费。" },
    ],
    dialSteps: [
      { step: "01", title: "使用 Verizon Prepaid 本机拨号", detail: "在 Verizon 网络覆盖下打开手机拨号界面。" },
      { step: "02", title: "拨打官方缴费短号 #768（#PMT）", detail: "呼出 #768 或拨打 888-294-6804 进入 Verizon Prepaid 自动语音系统。" },
      { step: "03", title: "选择使用 Refill Card 充值", detail: "按语音指引选择输入 Refill PIN 码。" },
      { step: "04", title: "键入完整 PIN 码完成入账", detail: "语音确认充值金额后即刻入账，随后可拨打 #225（#BAL）查询余额。" },
    ],
    warnings: [
      { title: "仅限 Verizon Prepaid 预付费账户", detail: "不支持 Verizon Postpaid 合约账单，亦不适用于 Visible、Total by Verizon、TracFone 等独立子品牌。" },
      { title: "访问官网请配合美国 IP 环境", detail: "国内直连访问 verizon.com 可能受限，建议切换稳定美区节点后再登录兑换。" },
      { title: "请确保账户未被永久停机回收", detail: "Verizon Prepaid 逾期超过 60 天未缴费可能导致号码回收，请尽早完成充值。" },
      { title: "一次性数字商品发码不退换", detail: "官方直采发码具有唯一性，售出后不支持无理由退换，请在 24 小时内完成充值核验。" },
    ],
    faqs: [
      { q: "Visible 手机卡可以用 Verizon 充值卡吗？", a: "不可以！Visible 虽然使用 Verizon 网络，但计费系统完全独立，本卡密仅适用于 Verizon 原生 Prepaid 账户。" },
      { q: "充值卡密入账后有效期多久？", a: "通常 $30 以上预付费充值余额可匹配月度套餐周期自动扣缴，具体有效期以 Verizon 官方入账短信为准。" },
      { q: "可以在不登录账号的情况下用 PIN 码充值吗？", a: "Verizon 官网提供 Quick Pay / Express Refill 通道，部分号码输入手机号与 Refill PIN 即可直接缴费。" },
      { q: "支付后多久发货？", a: "7×24h 自动对接官方采购，支付完成后 3–15 秒自动发码至订单详情页与联系邮箱。" },
      { q: "多张充值卡可以合并充进同一个号码吗？", a: "可以！依次兑换多张 Refill PIN 即可累计到您的 Verizon Prepaid 账户余额中。" },
      { q: "充值遇到报错怎么办？", a: "请核对账号确为 Verizon Prepaid 且输入无空格；如有异常请 24 小时内保留截图联系在线客服核查。" },
    ],
  },
  "lyca-us": {
    key: "lyca-us",
    carrierName: "Lyca Mobile 美国",
    englishBadge: "Lyca Mobile US Top-up PIN",
    countryName: "美国",
    countryCode: "US",
    dialPrefix: "+1",
    currencyCode: "USD",
    currencySymbol: "$",
    tagline: "美国 Lyca Mobile 官方充值 PIN · 支持 *611*PIN# 与官网秒速入账",
    intro:
      "专用于美国区 Lyca Mobile US（+1）预付费手机卡的官方直采充值 PIN 卡密。依托 T-Mobile 全美网络，支持拨号指令 *611*PIN# 及 lycamobile.us 官网快速充值，免绑美区银行卡，7×24h 自动秒发。",
    keepAliveTip:
      "国家隔离提醒：本商品为【美国区 Lyca Mobile US（+1 / USD）】专用；如果您使用的是英国 Lyca Mobile（+44 / GBP），请选择本站「Lyca Mobile 英国话费充值卡」！",
    pinFormatLabel: "12 位官方 Lyca Mobile US 充值 PIN",
    pinSample: "6028 - 4719 - 3580",
    ussdCommand: "拨号输入 *611*PIN# 或拨打 611",
    officialUrl: "lycamobile.us/en/quick-top-up",
    officialChannelLabel: "Lyca Mobile US 官网（lycamobile.us）或拨号 *611*PIN#",
    accountRequirement: "仅限美国区 Lyca Mobile US（+1）预付费号码（不可用于英国区或其他国家 Lyca）",
    theme: {
      heroGradient: "from-blue-950 via-blue-900 to-teal-950",
      heroGlowA: "bg-blue-400/35",
      heroGlowB: "bg-teal-400/20",
      accentBorder: "border-blue-200/80",
      badgeClass: "border-blue-300/35 bg-blue-500/25 text-blue-100",
      accentSoftBg: "bg-blue-50/60",
      accentText: "text-blue-700",
      tabActiveClass: "bg-blue-600 text-white shadow-sm",
    },
    useCases: [
      { tag: "保号续费", title: "维护美国 +1 实体手机号", desc: "按期补充美元余额并保持消费活跃，稳定接收美区金融、社媒与电商验证码。" },
      { tag: "留学优选", title: "美区国际长途与流量套餐", desc: "Lyca US 套餐大多包含无限拨打中国等 75+ 国家国际长途，充值后即可续订月度计划。" },
      { tag: "免外币卡", title: "零门槛跳过美卡支付校验", desc: "官方 PIN 卡密免绑美区借记卡/信用卡，国内即可随时轻松买码充值。" },
      { tag: "秒速入账", title: "官网与拨号双通道兑换", desc: "无论在美国本地还是国内漫游，均可通过官网自助秒速入账。" },
    ],
    webSteps: [
      { step: "01", title: "打开 Lyca Mobile US 官网或 App", detail: "访问美国官网 lycamobile.us（务必确认域名为 .us）或打开 My Lyca US App。" },
      { step: "02", title: "进入 Quick Top-up / Voucher 入口", detail: "在充值页选择「Voucher PIN」兑换模式，输入您的 10 位美国 +1 手机号码。" },
      { step: "03", title: "粘贴 12 位官方充值 PIN", detail: "完整输入本站自动发放的 PIN 码，核对手机号无误后点击提交。" },
      { step: "04", title: "核对美元余额入账", detail: "提交后数秒即可入账，可拨打 *611# 或登录账号查看余额并选购月套餐。" },
    ],
    dialSteps: [
      { step: "01", title: "打开 Lyca US 本机拨号键盘", detail: "在美国本地信号下使用插入 Lyca US SIM 卡的手机（国内漫游请直接使用官网方式）。" },
      { step: "02", title: "输入快捷码 *611*PIN# 呼出", detail: "在拨号盘输入 *611*收到的PIN码# 并按下呼叫键（或拨打 611 按语音指引充值）。" },
      { step: "03", title: "确认到账提示", detail: "系统将在数秒内通过弹窗与短信确认美元余额入账。" },
      { step: "04", title: "余额查询指令 *611#", detail: "日常拨打 *611# 即可随时查询当前余额与套餐状态。" },
    ],
    warnings: [
      { title: "严禁与英国 Lyca Mobile（+44）混用", detail: "美国 Lyca（+1 / USD）与英国 Lyca（+44 / GBP）系统完全独立，下单前请务必确认区号！" },
      { title: "确认号码未超期停用", detail: "Lyca US 预付费号如长期未消费或欠费超期可能被回收，请先确认号码正常。" },
      { title: "国内访问建议配合美区网络", detail: "国内直连访问 lycamobile.us 偶尔加载较慢，切换美区线路访问兑换更顺畅。" },
      { title: "卡密属一次性消耗品不退换", detail: "系统实时直采发码后不支持无理由退换，请在 24 小时内完成充值核验。" },
    ],
    faqs: [
      { q: "英国 Lyca Mobile（+44）能用这张美国卡密吗？", a: "不能！本商品仅适用于美国 Lyca Mobile US（+1 / 美元 USD）。英国号请在本站选择英国区 Lyca 充值卡。" },
      { q: "充值后如何开通包含国际通话的月套餐？", a: "美元余额到账后，登录 My Lyca US 账户选择所需套餐，支付方式勾选账户余额（Wallet / Balance）即可。" },
      { q: "怎么查当前余额？", a: "美国本机拨打 *611# 或登录 lycamobile.us 账户即可实时查看。" },
      { q: "付款后多久发货？", a: "7×24h 自动采购发码，支付完成后约 3–15 秒自动显示在订单详情页并同步发送至您的联系邮箱。" },
      { q: "多张充值卡可以累加吗？", a: "可以！多次输入不同 PIN 码即可累加至同一号码的美元余额中。" },
      { q: "充值提示无效怎么处理？", a: "请确认是在美国站点 lycamobile.us 兑换且无多余空格；如有异常请在 24 小时内截图联系客服核查。" },
    ],
  },
  "simple-mobile-us": {
    key: "simple-mobile-us",
    carrierName: "Simple Mobile 美国",
    englishBadge: "Simple Mobile US Service PIN",
    countryName: "美国",
    countryCode: "US",
    dialPrefix: "+1",
    currencyCode: "USD",
    currencySymbol: "$",
    tagline: "美国 Simple Mobile 官方 15 位服务 PIN · T-Mobile 高速网络免合约续费",
    intro:
      "适用于美国 Simple Mobile（+1）预付费手机卡的官方直采 Service PIN 充值卡密。依托全美优质移动网络，无合约束缚，免绑美国银行卡，支付后秒级自动发码，支持官网及短信 611611 一键续费！",
    keepAliveTip:
      "使用贴士：Simple Mobile 的充值卡密通常对应具体 30 天无合约月度服务计划（Service Plan PIN），兑换后即可即时续期或存入 Reserve（储备队列）待当前周期结束自动生效！",
    pinFormatLabel: "15 位官方 Simple Mobile Service PIN",
    pinSample: "74182 - 90364 - 51209",
    ussdCommand: "短信发送 ADD 至 611611 或拨打 1-877-878-7908",
    officialUrl: "simplemobile.com/refill",
    officialChannelLabel: "Simple Mobile 官网（simplemobile.com/refill）或短信 611611",
    accountRequirement: "仅限美国 Simple Mobile（+1）预付费手机号码使用",
    theme: {
      heroGradient: "from-emerald-950 via-green-900 to-slate-900",
      heroGlowA: "bg-emerald-400/30",
      heroGlowB: "bg-lime-400/20",
      accentBorder: "border-emerald-200/80",
      badgeClass: "border-emerald-300/35 bg-emerald-500/20 text-emerald-100",
      accentSoftBg: "bg-emerald-50/60",
      accentText: "text-emerald-700",
      tabActiveClass: "bg-emerald-600 text-white shadow-sm",
    },
    useCases: [
      { tag: "无缝续费", title: "30 天无合约套餐一键续期", desc: "兑换 PIN 后可立即启用或自动加入 Reserve 队列，到期无缝衔接不断网。" },
      { tag: "免外币卡", title: "绕开美区信用卡验证壁垒", desc: "无须美国发行的信用卡或借记卡，官方直采 PIN 码安全稳定入账。" },
      { tag: "赴美出行", title: "美国商旅与留学快速充值", desc: "高性价比无限通话短信与高速流量方案，7×24h 随买随充。" },
      { tag: "远程缴费", title: "官网输号即可远程代充", desc: "支持在 simplemobile.com/refill 输入亲友手机号与 PIN 码直接完成续费。" },
    ],
    webSteps: [
      { step: "01", title: "打开 Simple Mobile 官方充值页", detail: "浏览器访问 simplemobile.com/refill 或打开 My Simple Mobile App（建议美区网络）。" },
      { step: "02", title: "选择 Add a Service Plan / PIN", detail: "在页面中选择「Refill with a Service PIN」，输入需要充值的 10 位美国手机号码。" },
      { step: "03", title: "粘贴 15 位官方 Service PIN", detail: "将本站自动交付的 15 位 PIN 码完整填入输入框，选择「立即生效」或「加入 Reserve 队列」。" },
      { step: "04", title: "确认续费成功", detail: "提交后数秒即可收到确认提示，发送短信 BALANCE 至 611611 可随时查到期日。" },
    ],
    dialSteps: [
      { step: "01", title: "打开本机短信应用（美国本地）", detail: "使用已插入 Simple Mobile SIM 卡的手机（国内建议直接使用上方官网充值）。" },
      { step: "02", title: "发送短信 ADD 至 611611", detail: "编辑短信内容 ADD 发送给官方短号 611611，按自动回复提示回复您的 15 位 Service PIN。" },
      { step: "03", title: "或拨打官方热线语音充值", detail: "也可拨打 1-877-878-7908，按语音提示键入手机号与 15 位 PIN 码。" },
      { step: "04", title: "查询服务到期日", detail: "发送短信 BALANCE 至 611611 即可实时获取最新套餐余额与到期时间。" },
    ],
    warnings: [
      { title: "仅限美国 Simple Mobile（+1）使用", detail: "不可用于 TracFone、Total Wireless、Straight Talk 或原生 T-Mobile 账户。" },
      { title: "区分「立即覆盖」与「加入 Reserve」", detail: "若当前月套餐尚未到期，兑换时建议选择「Add to Reserve（加入储备队列）」，避免提前覆盖剩余天数！" },
      { title: "访问官网请配合美国 IP", detail: "Simple Mobile 官网对非美区 IP 常有 Cloudflare 拦截，请使用稳定美国网络打开充值页。" },
      { title: "数字卡密发码后不支持退换", detail: "官方实时直采发码后不支持无理由退换，请在 24 小时内完成核验充值。" },
    ],
    faqs: [
      { q: "我现在的套餐还有几天才到期，现在充会浪费吗？", a: "不会！在官网或 App 兑换 PIN 码时，请选择「Add to Reserve（加入储备队列）」，当前周期结束后系统会自动无缝启用新套餐。" },
      { q: "Simple Mobile 充值卡可以用在原生 T-Mobile 卡上吗？", a: "不可以！两者虽共享部分网络基础设施，但计费系统完全独立，本卡密仅限 Simple Mobile 账户。" },
      { q: "如何查询当前剩余流量和到期时间？", a: "使用本机发送短信「BALANCE」至 611611，或登录 My Simple Mobile App 即可查看。" },
      { q: "下单支付后多久自动发货？", a: "全自动直连官方渠道采购，支付完成后约 3–15 秒自动发码至订单详情页与联系邮箱。" },
      { q: "国内访问官网打不开怎么办？", a: "请切换稳定的美国线路代理并开启浏览器无痕模式，即可顺畅访问 simplemobile.com/refill。" },
      { q: "卡密提示报错如何售后？", a: "请截图报错页面并在 24 小时内点击下方「联系在线客服」，我们将第一时间协助排查。" },
    ],
  },
  "red-pocket-us": {
    key: "red-pocket-us",
    carrierName: "Red Pocket 美国",
    englishBadge: "Red Pocket Mobile US PIN",
    countryName: "美国",
    countryCode: "US",
    dialPrefix: "+1",
    currencyCode: "USD",
    currencySymbol: "$",
    tagline: "美国 Red Pocket 官方充值 PIN · 支持 GSMA / GSMT / CDMAV 全网续费",
    intro:
      "适用于美国知名全网通虚拟运营商 Red Pocket Mobile（+1）的官方直采充值 PIN 卡密。无论您的 Red Pocket 卡运行在 GSMA（AT&T）、GSMT（T-Mobile）还是 CDMAV（Verizon）网络下，均可免绑美卡直接登录官网自助续费！",
    keepAliveTip:
      "选档提醒：Red Pocket 充值卡密分为对应月度/年度计划面额，登录 redpocket.com/my-lines 即可在对应号码下选择「Pay with a PIN」完成续期！",
    pinFormatLabel: "16 位官方 Red Pocket Refill PIN 卡密",
    pinSample: "3850 - 6192 - 4738 - 2015",
    ussdCommand: "登录官网 redpocket.com/my-lines 输入 PIN",
    officialUrl: "redpocket.com/my-lines",
    officialChannelLabel: "Red Pocket 官网（redpocket.com/my-lines）或 Red Pocket App",
    accountRequirement: "仅限美国 Red Pocket Mobile（+1）预付费号码，兼容 GSMA / GSMT / CDMAV 三网",
    theme: {
      heroGradient: "from-red-950 via-red-900 to-amber-950",
      heroGlowA: "bg-red-500/35",
      heroGlowB: "bg-amber-400/20",
      accentBorder: "border-red-200/80",
      badgeClass: "border-red-300/35 bg-red-500/25 text-red-100",
      accentSoftBg: "bg-red-50/60",
      accentText: "text-red-700",
      tabActiveClass: "bg-red-600 text-white shadow-sm",
    },
    useCases: [
      { tag: "三网兼容", title: "支持 GSMA / GSMT / CDMAV 全网络", desc: "Red Pocket 旗下三大基础网络预付费线路均可使用官方 PIN 码完成套餐续期。" },
      { tag: "跨境保号", title: "经典低成本美区原生实体卡续费", desc: "适合长期持有 Red Pocket 美国号接收银行、PayPal、OpenAI 及各类美区验证码。" },
      { tag: "免外币卡", title: "无需美国信用卡即可续费", desc: "跳过官网国际信用卡风控拒付问题，支持支付宝、微信、余额与 USDT 秒购官方码。" },
      { tag: "官网直充", title: "全程网页操作国内可用", desc: "无需拨打美国语音电话，登录 Red Pocket 官网几步即可自助续期生效。" },
    ],
    webSteps: [
      { step: "01", title: "登录 Red Pocket 官网账号", detail: "打开浏览器访问 redpocket.com/my-lines 并登录您的 Red Pocket 会员账户。" },
      { step: "02", title: "选择需要续费的美国号码", detail: "在 My Lines 列表中点击对应手机号，进入该号码的「Summary / Refill」管理面板。" },
      { step: "03", title: "点击 Redeem a PIN / Refill Card", detail: "在续费选项中点击使用 PIN 码兑换，粘贴本站自动发放的官方 PIN 数字。" },
      { step: "04", title: "确认套餐续期或余额生效", detail: "点击提交后页面将刷新最新的服务到期日与套餐额度，操作即完成。" },
    ],
    dialSteps: [
      { step: "01", title: "官网快捷充值通道（免登录备选）", detail: "如不便登录账号，也可在官网首页找到「Refill」入口，按提示输入手机号与 PIN 码。" },
      { step: "02", title: "联系 Red Pocket 官方在线客服协助", detail: "如遇新卡首次激活或更换网络制式（如 GSMA 转 GSMT），可在官网聊天窗提供 PIN 码由官方客服协助应用。" },
      { step: "03", title: "检查短信与 Wi-Fi Calling 状态", detail: "续费成功后重启手机或开关飞行模式，即可迅速恢复短信收发与通话功能。" },
      { step: "04", title: "定期关注到期提醒邮件", detail: "建议在到期前 2–3 天完成新一期 PIN 续费，避免过期超窗导致号码释放。" },
    ],
    warnings: [
      { title: "请确认所选面额与当前套餐匹配", detail: "Red Pocket 部分面额 PIN 对应特定档位计划，兑换前请在 My Lines 核对当前线路档位，以免变更计划结构。" },
      { title: "仅限美国 Red Pocket Mobile 使用", detail: "不可用于 AT&T、T-Mobile、Verizon 原生账户或其他虚拟运营商。" },
      { title: "请留意到期宽限期防止丢号", detail: "Red Pocket 账户过期后通常仅有有限宽限期，请务必在号码被运营商回收前完成续费。" },
      { title: "一次性数字商品售出不退", detail: "系统实时直采发码后不支持无理由退换，请在 24 小时内完成充值核验。" },
    ],
    faqs: [
      { q: "我的 Red Pocket 是 GSMT（T-Mobile 网络）卡，可以用这张 PIN 吗？", a: "可以！Red Pocket 官方充值 PIN 同时支持旗下 GSMA（AT&T）、GSMT（T-Mobile）及 CDMAV（Verizon）三大网络线路。" },
      { q: "人在中国大陆可以直接在官网兑换吗？", a: "可以！登录 redpocket.com/my-lines 后进入号码详情页输入 PIN 码即可远程完成续费。" },
      { q: "旧套餐还没到期，现在用 PIN 会不会立刻覆盖？", a: "在官网兑换时系统会提示立即续期或延续当前周期，具体请按页面提示确认后提交。" },
      { q: "下单支付后多久能拿到 PIN 码？", a: "系统 7×24h 全自动直采发码，支付成功后约 3–15 秒自动显示在订单详情页并同步发送至您的联系邮箱。" },
      { q: "新买的 Red Pocket SIM 卡可以用这个 PIN 激活吗？", a: "可以！访问 redpocket.com/activate 按提示输入 SIM ICCID 及对应激活 PIN 即可完成开卡。" },
      { q: "兑换提示报错如何联系售后？", a: "请核对线路状态与输入字符无误，如仍异常请截图报错并在 24 小时内联系在线客服核查。" },
    ],
  },
  generic: {
    key: "generic",
    carrierName: "海外运营商话费充值",
    englishBadge: "International SIM Top-up PIN",
    countryName: "海外运营商",
    countryCode: "GLOBAL",
    dialPrefix: "+",
    currencyCode: "USD / GBP",
    currencySymbol: "",
    tagline: "官方正规直采充值卡密 · 7×24h 自动发码 · 免绑外币信用卡自助续费",
    intro:
      "精选海外主流移动运营商官方预付费话费充值 PIN 卡密。支付后 7×24h 自动发码，免去外币信用卡账单地址风控，轻松实现海外手机卡长期保号续命、国内漫游收验证码及流量套餐续订。",
    keepAliveTip:
      "通用提示：海外运营商充值卡密均按【国家 + 运营商】严格隔离，下单前请务必核对您的 SIM 卡所属国家、区号及运营商名称！",
    pinFormatLabel: "官方原装充值 PIN 卡密（Top-up Voucher）",
    pinSample: "XXXX - XXXX - XXXX - XXXX",
    ussdCommand: "按对应运营商官网 / App 或官方拨号指引兑换",
    officialUrl: "运营商官方 Top-up / Refill 页面",
    officialChannelLabel: "对应运营商官网、官方 App 或 USSD 充值指令",
    accountRequirement: "仅限商品标题所标明国家与运营商的 Prepaid 预付费号码",
    theme: {
      heroGradient: "from-slate-950 via-orange-950 to-amber-900",
      heroGlowA: "bg-orange-400/30",
      heroGlowB: "bg-amber-300/20",
      accentBorder: "border-orange-200/80",
      badgeClass: "border-orange-300/35 bg-orange-500/20 text-orange-100",
      accentSoftBg: "bg-orange-50/60",
      accentText: "text-orange-700",
      tabActiveClass: "bg-orange-600 text-white shadow-sm",
    },
    useCases: [
      { tag: "长期保号", title: "海外实体卡低成本保号续命", desc: "按期补充余额并保持活跃，避免长时间无消费导致海外号码休眠或被运营商回收。" },
      { tag: "漫游收码", title: "国内漫游稳定接收验证码", desc: "保持账户正常有效，随时接收海外银行、社交软件与 AI 平台的短信安全核验。" },
      { tag: "免外币卡", title: "跳过海外信用卡风控拒付", desc: "支持国内常见支付方式购买官方直采 PIN 码，无需持有当地银行卡即可自助充值。" },
      { tag: "多档面额", title: "多档面额自由匹配需求", desc: "覆盖小额保号与常规月度套餐续费档位，随买随充、秒级发码。" },
    ],
    webSteps: [
      { step: "01", title: "选择对应面额并完成支付", detail: "在右侧规格栏核对所需充值面额，填写联系邮箱后下单支付。" },
      { step: "02", title: "获取系统自动发放的 PIN 码", detail: "支付成功后约 3–15 秒即可在订单详情页与联系邮箱查看完整充值卡密。" },
      { step: "03", title: "打开对应运营商官网或 App", detail: "登录商品对应运营商的官方充值页面，选择「Voucher / Refill PIN」兑换入口。" },
      { step: "04", title: "输入 PIN 码确认到账", detail: "粘贴卡密并提交确认，完成后第一时间检查号码话费余额或套餐有效期。" },
    ],
    dialSteps: [
      { step: "01", title: "确认手机已插入对应 SIM 卡", detail: "在当地信号覆盖下使用本机拨号盘操作（国内漫游推荐直接使用官网/App）。" },
      { step: "02", title: "拨打官方语音或 USSD 充值指令", detail: "按该运营商官方指引拨打充值短号或输入 USSD 快捷指令。" },
      { step: "03", title: "键入完整充值 PIN 数字", detail: "仔细输入卡密数字并按提示确认提交。" },
      { step: "04", title: "查收官方入账回执短信", detail: "等待官方短信或余额查询确认充值到账。" },
    ],
    warnings: [
      { title: "严格核对国家与运营商", detail: "不同国家与运营商之间的充值卡密互不通用，下单前请确认商品标题与您的 SIM 卡一致。" },
      { title: "仅限 Prepaid 预付费卡使用", detail: "绝大多数官方充值 PIN 仅支持预付费账户，不支持后付费合约账单。" },
      { title: "确认号码未超期注销", detail: "如 SIM 卡因长期未保号已被运营商回收，卡密将无法入账。" },
      { title: "一次性数字商品发码不退换", detail: "卡密经系统实时发码后不支持无理由退换，请在 24 小时内完成充值核验。" },
    ],
    faqs: [
      { q: "下单支付后多久能拿到充值卡密？", a: "系统 7×24h 全自动直连官方渠道采购，支付成功后通常 3–15 秒自动发码至订单详情页与您的联系邮箱。" },
      { q: "人在中国大陆可以给海外手机卡充值吗？", a: "可以！收到 PIN 卡密后直接登录对应运营商的官网或官方 App 自助兑换即可，无需在海外当地。" },
      { q: "需要提供我的手机号密码给客服吗？", a: "完全不需要！本商品采用官方 PIN 卡密发货，全程由您自行在官方渠道兑换，保护隐私安全。" },
      { q: "不同国家的同名运营商卡密通用吗？", a: "不通用！例如英国 Vodafone 与西班牙 Vodafone、英国 Lyca 与美国 Lyca 系统完全独立，请务必按国家对应下单。" },
      { q: "充值卡密有有效期吗？", a: "均为下单时实时采购的新鲜官方卡密，但为保障核验与售后权益，建议收码后 24 小时内完成兑换。" },
      { q: "遇到兑换报错怎么办？", a: "请核对号码归属与输入格式，保留报错截图并在 24 小时内联系在线客服协助排查。" },
    ],
  },
};

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

  const highlights = [
    { icon: ShieldCheck, title: "官方正规直采", desc: "直连国际正规上游实时采码，源头可溯，杜绝黑卡与二手码风险。" },
    { icon: Zap, title: "7×24h 自动秒发", desc: "全自动发卡系统无缝对接，下单支付成功后通常 3–15 秒自动出码。" },
    { icon: CreditCard, title: "免绑海外银行卡", desc: "无需美卡/英卡及当地账单地址，支付宝、微信、余额与 USDT 均可买码。" },
    { icon: Globe, title: "国内漫游可自助充", desc: "身处中国大陆同样支持通过运营商官网/App 远程输入 PIN 码秒到账。" },
    { icon: Signal, title: "保号 / 套餐两相宜", desc: "支持延长预付费号码有效期，也可用于续订高速流量包与国际通话。" },
    { icon: KeyRound, title: "独立 PIN 免交密码", desc: "无需提供手机卡账号密码，全程由您自行在官方渠道兑换，安全私密。" },
  ];

  const specs: Array<[string, string]> = [
    ["商品名称", product.name],
    ["适用运营商", `${profile.carrierName}（仅限 Prepaid 预付费账户）`],
    ["适用国家 / 区号", `${profile.countryName} (${profile.countryCode}) · 国际区号 ${profile.dialPrefix}`],
    ["可选面额 / 规格", denominationText],
    ["交付卡密形式", profile.pinFormatLabel],
    ["官方兑换渠道", profile.officialChannelLabel],
    ["账户适配要求", profile.accountRequirement],
  ];

  return (
    <div className="mt-6 w-full space-y-5 sm:mt-8 sm:space-y-6">
      {/* 1. 运营商专属旗舰 Hero + 4 格核心参数 + 6 大核心亮点 */}
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
                官方直采 · 7×24h 自动秒发
              </span>
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90">
                SIM 卡服务 · 话费充值 PIN
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
            <p className="mt-2.5 max-w-3xl rounded-xl border border-white/15 bg-white/[0.07] px-3.5 py-2 text-xs leading-5 text-amber-100/95">
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
                <div className="mt-0.5 text-xs font-bold text-white sm:text-sm">
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
                <div className="mt-0.5 truncate text-xs font-bold text-white sm:text-sm" title={denominationText}>
                  {denominationText}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 6 大核心亮点卡片 */}
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className={`rounded-xl border ${theme.accentBorder} ${theme.accentSoftBg} p-4 transition-shadow hover:shadow-xs`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-2xs ring-1 ring-slate-200/70">
                    <Icon className={`h-4 w-4 ${theme.accentText}`} />
                  </span>
                  <div className="text-sm font-bold text-slate-900">{item.title}</div>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. 详细参数与交付格式预览 */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Radio className={`h-4.5 w-4.5 ${theme.accentText}`} />
            核心规格与发码交付预览
          </h3>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/40">
            {specs.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 px-3.5 py-2.5 text-xs sm:text-sm">
                <span className="font-semibold text-slate-500">{label}</span>
                <span className="break-words font-medium text-slate-900">{value}</span>
              </div>
            ))}
          </div>

          {/* 暗色卡密终端预览盒 */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4 text-white shadow-inner">
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  自动交付卡密样式示例
                </span>
                <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/75">
                  {profile.countryCode} · PIN
                </span>
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-black/40 p-3.5 font-mono">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Official Recharge PIN Code
                </div>
                <div className="mt-1.5 select-all text-base font-bold tracking-widest text-amber-300 sm:text-lg">
                  {profile.pinSample}
                </div>
                <div className="mt-2.5 border-t border-white/10 pt-2 text-[11px] text-slate-300">
                  快捷充值：{profile.ussdCommand}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
              <span>官方官网：{profile.officialUrl}</span>
              <span className="shrink-0 font-semibold text-emerald-300">付款后自动展示</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. 三重服务保障 */}
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: ShieldCheck,
            title: "官方正版卡密保障",
            desc: "全部卡密直采自官方正规分销渠道，100% 真实有效，杜绝风控封号隐患。",
          },
          {
            icon: Clock3,
            title: "24 小时核验售后",
            desc: "请于发码后 24 小时内完成充值兑换，如遇官方核验异常请保留报错截图联系客服。",
          },
          {
            icon: Wifi,
            title: "全程自助安全无忧",
            desc: "无需向任何人提供手机号密码或验证码，收到 PIN 码后自行在官方页面兑换即到账。",
          },
        ].map((g) => {
          const Icon = g.icon;
          return (
            <div
              key={g.title}
              className="rounded-2xl border border-orange-100/90 bg-gradient-to-b from-white to-orange-50/35 p-4 shadow-2xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100/80 text-[#c85e22]">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="text-sm font-bold text-slate-900">{g.title}</div>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">{g.desc}</p>
            </div>
          );
        })}
      </section>

      {/* 4. 4 大典型使用场景 */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <PhoneCall className={`h-4.5 w-4.5 ${theme.accentText}`} />
            常见充值用途与适用场景
          </h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
            保号 · 漫游 · 流量包 · 应急续费
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {profile.useCases.map((uc) => (
            <div
              key={uc.title}
              className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 transition hover:border-orange-200/80 hover:bg-orange-50/20"
            >
              <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${theme.accentSoftBg} ${theme.accentText}`}>
                {uc.tag}
              </span>
              <div className="mt-2 text-sm font-bold text-slate-900">{uc.title}</div>
              <p className="mt-1 text-xs leading-5 text-slate-600">{uc.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. 双通道 4 步交互式充值教程 */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <BookOpen className={`h-4.5 w-4.5 ${theme.accentText}`} />
            官方充值操作指南（4 步秒到账）
          </h3>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setTab("web")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === "web" ? theme.tabActiveClass : "text-slate-600 hover:text-slate-900"
              }`}
            >
              官网 / App 自助充值（国内漫游推荐）
            </button>
            <button
              type="button"
              onClick={() => setTab("dial")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === "dial" ? theme.tabActiveClass : "text-slate-600 hover:text-slate-900"
              }`}
            >
              拨号 / 短信直充（海外本地）
            </button>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {activeSteps.map((item) => (
            <div
              key={`${tab}-${item.step}`}
              className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4"
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-black ${theme.accentSoftBg} ${theme.accentText}`}
              >
                {item.step}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900">{item.title}</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. 避坑与重要须知 */}
      <section className="rounded-2xl border border-amber-200/90 bg-amber-50/50 p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-amber-950">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
          下单前必读 · 避坑与重要须知
        </h3>
        <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
          {profile.warnings.map((w) => (
            <div key={w.title} className="rounded-xl border border-amber-200/70 bg-white/90 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 sm:text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                {w.title}
              </div>
              <p className="mt-1.5 text-xs leading-5 text-slate-600">{w.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 7. 暗色客服咨询横幅 */}
      <section className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-5 text-white sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            不确定自己的海外卡属于哪家运营商或选哪档面额？
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-300 sm:text-sm">
            下单前可随时向客服发送 SIM 卡卡板照片或运营商名称，我们免费帮您确认适配档位与保号方案。
          </p>
        </div>
        <button
          type="button"
          onClick={() => openPublicSupport()}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-orange-50 hover:text-[#c85e22]"
        >
          联系在线客服
        </button>
      </section>

      {/* 8. 常见问题 FAQ */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <HelpCircle className={`h-4.5 w-4.5 ${theme.accentText}`} />
          {profile.carrierName}充值常见问题 FAQ
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {profile.faqs.map((faq) => (
            <div key={faq.q} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <div className="text-xs font-bold text-slate-900 sm:text-sm">Q：{faq.q}</div>
              <p className="mt-1.5 text-xs leading-5 text-slate-600">A：{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
