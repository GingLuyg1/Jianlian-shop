"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  CreditCard,
  Globe,
  HelpCircle,
  MessageSquare,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Truck,
  Wifi,
  Zap,
} from "lucide-react";
import { openPublicSupport } from "@/lib/support/open-public-support";

interface UltraMobileProductDetailsProps {
  product: {
    id?: string;
    slug?: string | null;
    name: string;
    price?: number | null;
    original_price?: number | null;
    [key: string]: any;
  };
}

export default function UltraMobileProductDetails({ product }: UltraMobileProductDetailsProps) {
  const highlights = [
    {
      icon: Globe,
      title: "美国原生 +1 手机号",
      desc: "T-Mobile 原生移动号段（非虚拟 VoIP 号），最高信誉评级，秒过全美各大银行与高风控平台拦截。",
      tag: "原生美卡",
    },
    {
      icon: CreditCard,
      title: "经典 PayGo $3/月套餐",
      desc: "每月仅需 3 美元基础月租，内含 100 分钟通话 + 100 条免费短信，超出部分按量扣费，透明实惠。",
      tag: "含100分+100条",
    },
    {
      icon: Wifi,
      title: "支持 Wi-Fi Calling",
      desc: "国内开启 Wi-Fi 通话直连美国基站，无需高昂国际漫游费，享受美国本地费率直接接打电话与收发短信。",
      tag: "国内免漫游费",
    },
    {
      icon: ShieldCheck,
      title: "无需实名认证",
      desc: "海外实体预付费 SIM 卡，保护个人隐私安全，无需提供大陆身份证件，到手即可插卡使用。",
      tag: "免实名认证",
    },
    {
      icon: Sparkles,
      title: "美银/券商/AI 全支持",
      desc: "完美支持 Chase、BOA、Capital One、PayPal 美区、Venmo、Zelle、Apple ID 美区与 ChatGPT Plus 绑卡。",
      tag: "美银必备神卡",
    },
    {
      icon: Smartphone,
      title: "三合一免剪卡 · 全网通适配",
      desc: "标准大卡、Micro、Nano 任意卡槽通用，适配 iPhone 及全网通安卓手机，无需任何剪卡工具。",
      tag: "全网通通用",
    },
  ];

  const platformCategories = [
    {
      title: "全美顶级银行与金融机构",
      badge: "秒过美银风控",
      icon: CreditCard,
      color: "border-emerald-200 bg-emerald-50/50 text-emerald-800",
      items: [
        { name: "美国传统银行", desc: "Chase 摩根大通 / BOA / 花旗 Citi" },
        { name: "高性价比美银", desc: "Capital One 360 / 华美 Velo 账户" },
        { name: "美区电子钱包", desc: "PayPal 美区 / Venmo / Zelle 转账" },
        { name: "跨境资产账户", desc: "Wise 美元个人与商业账户验证" },
      ],
    },
    {
      title: "AI 智能生产力矩阵",
      badge: "秒过手机验证",
      icon: Bot,
      color: "border-amber-200 bg-amber-50/50 text-amber-800",
      items: [
        { name: "ChatGPT / OpenAI", desc: "美区账号注册与 Plus 绑卡验证" },
        { name: "Claude (Anthropic)", desc: "高风控美国原生实体号秒过" },
        { name: "Google Gemini / Voice", desc: "谷歌生态高级 AI 与 GV 换绑" },
        { name: "xAI Grok / Midjourney", desc: "全系海外 AI 平台无阻畅通" },
      ],
    },
    {
      title: "全球主流社交通讯",
      badge: "高信誉防封号",
      icon: MessageSquare,
      color: "border-blue-200 bg-blue-50/50 text-blue-800",
      items: [
        { name: "Telegram", desc: "解除中国号无法主动私聊陌生人限制" },
        { name: "WhatsApp", desc: "海外商务洽谈与跨国贸易必备" },
        { name: "TikTok (美区版)", desc: "美国本土达人号与带货小店" },
        { name: "Twitter (X) / Instagram", desc: "国际社媒高权重注册与防封" },
      ],
    },
    {
      title: "跨国电商与数字娱乐",
      badge: "美区原生体验",
      icon: Globe,
      color: "border-purple-200 bg-purple-50/50 text-purple-800",
      items: [
        { name: "美区 Apple ID", desc: "安全绑定美国手机号与两步验证" },
        { name: "Amazon 美区与 eBay", desc: "美国本土电商买卖家风控验证" },
        { name: "Steam (美区)", desc: "美区账户跨区换绑与特惠购买" },
        { name: "Netflix / Spotify", desc: "美区流媒体会员开通与认证" },
      ],
    },
  ];

  const specs = [
    ["商品规格", "Ultra Mobile PayGo 官方原生实体三合一 SIM 卡（T-Mobile 旗下网络）"],
    ["交付方式", "国内现货默认包邮直达（妥善防静电防折弯保护包装；如需顺丰加急请联系客服）"],
    ["基础月租", "每月 3 美元（含 100 分钟通话 + 100 条免费短信，建议账户充值一定余额自动扣月租）"],
    ["漫游网络", "国内漫游接入中国移动/联通信号；在 Wi-Fi Calling 下直连美国基站免漫游费"],
    ["号码格式", "美国本土原生手机号码段（+1 xxx xxx xxxx，最高信誉物理卡号段）"],
    ["售后说明", "物理 SIM 卡一经拆封插卡激活后不支持无理由退换，发货前均经严格质检验真"],
  ];

  const steps = [
    {
      step: "01",
      title: "下单包邮送达",
      desc: "提交订单并填写准确收件信息，国内现货默认包邮送达，妥善封装保护芯片安全。",
    },
    {
      step: "02",
      title: "官网激活或代激活",
      desc: "访问官网（ultramobile.com/activate）输入卡套 11 位激活码，选择激活新号码并充值余额。",
    },
    {
      step: "03",
      title: "开启 Wi-Fi Calling",
      desc: "【关键技巧】在手机设置中开启「Wi-Fi 通话」，填写美国地址（911 紧急地址），直连美国网络免漫游费！",
    },
    {
      step: "04",
      title: "插卡联网使用",
      desc: "确认关闭移动数据漫游后插入 SIM 卡，等待手机状态栏显示「Ultra Wi-Fi」或中国移动/联通漫游信号。",
    },
    {
      step: "05",
      title: "每月自动续订",
      desc: "在官方账户绑定 Visa/Mastercard 外币卡开启 Auto-Renew，或定期充值余额自动扣除每月 3 美元月租。",
    },
  ];

  const faqs = [
    {
      q: "什么是 Wi-Fi Calling？在国内怎么用最划算？",
      a: "Wi-Fi Calling（Wi-Fi 通话）是美国运营商的一项绝佳功能。只要手机支持该功能（iPhone 6 及以上或主流全网通安卓机），在手机设置中打开「Wi-Fi 通话」并设置一个美国免税州紧急地址。连上 Wi-Fi 后，手机信号图标会显示为「Ultra Wi-Fi」，此时收发短信和接打电话直接消耗套餐内自带的 100 分钟和 100 条短信，完全不产生任何国际漫游费！",
    },
    {
      q: "为什么 Ultra Mobile 被称为海淘与跨境银行神卡？",
      a: "因为它是美国三大运营商之一 T-Mobile 官方原生态号段，非 Google Voice 或 TextNow 等虚拟 VoIP 号码。美国各大银行（如 Chase、Bank of America、Capital One）以及顶级券商对虚拟号有极严格的风控拦截，而 Ultra Mobile 实体卡秒过验证，是开立与维护美银账户的黄金搭档。",
    },
    {
      q: "怎么充值话费和缴纳每月 3 美元月租？",
      a: "您可以直接在 Ultra Mobile 官方网站（ultramobile.com）或 App 登录您的账户，使用国内双币/全币种信用卡（Visa / Mastercard）在线充值，也可以设置自动续订（Auto-Renew）。每次扣款 $3 美元维持套餐。",
    },
  ];

  return (
    <div className="mt-8 w-full space-y-6 text-slate-800">
      {/* 顶部 Hero 巨幕 */}
      <section className="overflow-hidden rounded-2xl border border-orange-200/80 bg-white shadow-sm">
        <div className="relative bg-gradient-to-br from-slate-900 via-indigo-950 to-orange-950 p-6 text-white sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

          <div className="relative flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300">
              🇺🇸 美国原生实体 SIM 卡
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-orange-200">
              经典 PayGo $3/月 · 含100分+100条短信
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
              免实名 · 支持 Wi-Fi Calling 国内免漫游费
            </span>
          </div>

          <h2 className="relative mt-4 text-2xl font-black tracking-tight sm:text-3xl text-white">
            {product.name} PayGo 电话卡 · T-Mobile 原生高速网络
          </h2>

          <p className="relative mt-2 text-sm font-semibold text-orange-200/95 sm:text-base">
            美国三大运营商 T-Mobile 官方原生网络 · 真实物理 SIM 卡 · 纯净 +1 号段 · 全美银行/AI 王牌神卡
          </p>

          <p className="relative mt-3 max-w-3xl text-xs leading-6 text-slate-300 sm:text-sm sm:leading-7">
            跨境出海与海淘界公认的顶级神卡！原生美国 +1 移动号码段，非虚拟 VoIP 号码，最高信誉等级。完美过全美各大银行（Chase、BOA、Capital One）、美区 PayPal、Apple ID、OpenAI / ChatGPT Plus 等高风控验证。支持 Wi-Fi Calling，国内 Wi-Fi 下直接享受美国本土资费通话与接码。
          </p>

          <div className="relative mt-5 flex flex-wrap items-center gap-3 pt-2 text-xs text-orange-100/90">
            <div className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 backdrop-blur-sm">
              <Truck className="h-4 w-4 text-orange-300" />
              <span>国内现货 · 默认包邮发货（加急顺丰可联系客服）</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 backdrop-blur-sm">
              <Smartphone className="h-4 w-4 text-emerald-300" />
              <span>标准/Micro/Nano 三合一免剪卡 · 全网通通用</span>
            </div>
          </div>
        </div>

        {/* 核心六大卖点网格 */}
        <div className="grid gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-6 bg-orange-50/20">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="relative flex flex-col justify-between rounded-xl border border-orange-100/80 bg-white p-4 shadow-sm transition hover:border-orange-300 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-orange-100/70 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                      {item.tag}
                    </span>
                  </div>
                  <div className="mt-3 text-sm font-bold text-slate-900">{item.title}</div>
                  <p className="mt-1.5 text-xs leading-5 text-slate-600">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 支持海内外平台矩阵（一行标题 + 下一行标签） */}
      <section className="rounded-2xl border border-orange-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
              <Sparkles className="h-5 w-5 text-orange-600" />
              全美银行、出海社媒与 AI 兼容矩阵
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              T-Mobile 原生移动号段（最高信誉评级），真实物理 SIM 卡信誉度极高，秒过全美各类严苛认证。
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
            <Radio className="h-3.5 w-3.5 animate-pulse text-orange-600" />
            实测 100% 畅通接收
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {platformCategories.map((cat) => {
            const CatIcon = cat.icon;
            return (
              <div
                key={cat.title}
                className="flex flex-col rounded-xl border border-orange-100 bg-gradient-to-b from-orange-50/30 to-white p-4"
              >
                <div className="border-b border-orange-100/60 pb-3">
                  <div className="flex items-center gap-2">
                    <CatIcon className="h-4 w-4 shrink-0 text-orange-600" />
                    <span className="whitespace-nowrap text-xs font-bold text-slate-900 sm:text-sm">{cat.title}</span>
                  </div>
                  <div className="mt-2">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${cat.color}`}>
                      {cat.badge}
                    </span>
                  </div>
                </div>
                <div className="mt-3 space-y-2.5">
                  {cat.items.map((item) => (
                    <div key={item.name} className="text-xs">
                      <div className="font-semibold text-slate-800">{item.name}</div>
                      <div className="text-[11px] text-slate-500">{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 新手插卡必看：三大防扣费重要警示 */}
      <section className="rounded-2xl border border-red-200 bg-red-50/75 p-5 text-slate-800 shadow-sm sm:p-6">
        <div className="flex items-start gap-3.5">
          <ShieldAlert className="mt-1 h-6 w-6 shrink-0 text-red-600" />
          <div className="space-y-3">
            <div className="text-base font-bold text-red-900 sm:text-lg">
              新手插卡必看：防扣费与使用建议（插卡前务必阅读！）
            </div>
            <div className="space-y-2.5 text-xs leading-5 text-slate-700 sm:text-sm sm:leading-6">
              <div className="rounded-xl border border-red-200/60 bg-white/80 p-3.5">
                <p>
                  <strong className="text-red-700">1. 插卡前务必【关闭移动数据漫游】：</strong>
                  国际数据漫游费用昂贵。平时接收各类短信验证码完全不需要开漫游数据！在手机蜂窝网络设置中务必保持【关闭数据漫游】，防止后台 App（如微信、邮箱或系统同步）偷跑流量触发额外扣费。
                </p>
              </div>
              <div className="rounded-xl border border-red-200/60 bg-white/80 p-3.5">
                <p>
                  <strong className="text-red-700">2. 优先配置并使用【Wi-Fi Calling】：</strong>
                  强烈建议手机连上 Wi-Fi 后开启 Wi-Fi 通话。状态栏显示「Ultra Wi-Fi」时，接打电话和收发短信直接消耗套餐自带的 100 分钟和 100 条短信额度，零漫游费！
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 商品规格说明 */}
      <section className="rounded-2xl border border-orange-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <ShieldCheck className="h-5 w-5 text-orange-600" />
          商品规格与交付说明
        </h3>
        <div className="mt-4 space-y-2.5">
          {specs.map(([label, text]) => (
            <div
              key={String(label)}
              className="flex flex-col rounded-xl border border-orange-100 bg-orange-50/30 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-2"
            >
              <span className="shrink-0 text-xs font-bold text-slate-900 sm:text-sm sm:w-28">{label}：</span>
              <span className="text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">{text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 快速上手五步走 */}
      <section className="rounded-2xl border border-orange-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <Zap className="h-5 w-5 text-orange-600" />
          从收到卡到开通使用：简明五步流程
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((st) => (
            <div
              key={st.step}
              className="relative flex flex-col justify-between rounded-xl border border-orange-100 bg-gradient-to-b from-orange-50/40 to-white p-4"
            >
              <div>
                <span className="font-mono text-2xl font-black text-orange-400">{st.step}</span>
                <div className="mt-2 text-xs font-bold text-slate-900 sm:text-sm">{st.title}</div>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">{st.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 在线客服咨询横幅 */}
      <div className="flex flex-col gap-4 rounded-2xl border border-orange-200/90 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1">
          <div className="text-sm font-bold text-slate-950 sm:text-base">
            需要了解更多 Ultra Mobile 激活指导或美银开户搭配技巧？
          </div>
          <p className="text-xs text-slate-600 sm:text-sm">
            本站为您提供全流程咨询与技术支持，保障您的境外卡片长期安全稳定持有。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openPublicSupport}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-700 sm:text-sm"
          >
            <span>联系在线客服确认</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 常见问题 FAQ 折叠卡片 */}
      <section className="rounded-2xl border border-orange-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <HelpCircle className="h-5 w-5 text-orange-600" />
          常见问答与疑难解答
        </h3>
        <div className="mt-4 space-y-3">
          {faqs.map((faq, i) => (
            <details
              key={i}
              className="group rounded-xl border border-orange-100 bg-orange-50/20 p-4 transition open:bg-orange-50/40"
            >
              <summary className="flex cursor-pointer items-center justify-between font-semibold text-slate-900 text-xs sm:text-sm">
                <span className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                    Q
                  </span>
                  <span>{faq.q}</span>
                </span>
                <span className="text-slate-400 transition-transform group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 pl-7 text-xs leading-6 text-slate-600 sm:text-sm sm:leading-6">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
