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
  Zap,
} from "lucide-react";
import { openPublicSupport } from "@/lib/support/open-public-support";

interface HahaSimProductDetailsProps {
  product: {
    id?: string;
    slug?: string | null;
    name: string;
    price?: number | null;
    original_price?: number | null;
    [key: string]: any;
  };
}

export default function HahaSimProductDetails({ product }: HahaSimProductDetailsProps) {
  const highlights = [
    {
      icon: CreditCard,
      title: "0 月租 · 零持有成本",
      desc: "无日常强制月租，平时放在国内不打电话、不发短信即完全 0 月租，无任何扣费隐患。",
      tag: "100% 零月租",
    },
    {
      icon: MessageSquare,
      title: "国内免费接收短信",
      desc: "国内自动漫游接入中国移动或中国联通 4G/5G 信号，接收全球各大平台 SMS 验证码完全免费。",
      tag: "收短信免费",
    },
    {
      icon: Globe,
      title: "香港原生 +852 手机号",
      desc: "香港和记 3HK 与丰泽联合出品，真实三大运营商移动号码段（非虚拟 VoIP），秒过各大平台风控。",
      tag: "原生香港卡",
    },
    {
      icon: ShieldCheck,
      title: "国内收短信免实名",
      desc: "在中国大陆漫游仅用于接收验证码无需实名认证，即插即用，充分保障出海业务与个人隐私。",
      tag: "大陆免实名",
    },
    {
      icon: Clock3,
      title: "每年 10 港币永久保号",
      desc: "新卡自带 365 天有效期（整整一年）；后续每年充值 10 HKD（约 9 元）即可顺延一年，余额永久保留不过期。",
      tag: "年成本仅9元",
    },
    {
      icon: Smartphone,
      title: "三合一免剪卡 · 插卡即用",
      desc: "标准大卡、Micro、Nano 任意卡槽通用，适配 iPhone 及全网通安卓手机，无需剪卡器。",
      tag: "全网通通用",
    },
  ];

  const platformCategories = [
    {
      title: "港美股券商与境外银行",
      badge: "秒开境外账户",
      icon: CreditCard,
      color: "border-emerald-200 bg-emerald-50/50 text-emerald-800",
      items: [
        { name: "香港虚拟银行", desc: "众安 ZA Bank / 理慧 livi 账户验证" },
        { name: "港美股知名券商", desc: "富途牛牛 / 老虎证券 / 长桥证券" },
        { name: "香港传统银行", desc: "汇丰 One / 中银香港账户绑定" },
        { name: "Wise / PayPal 国际", desc: "国际多币种资金安全验证" },
      ],
    },
    {
      title: "全球主流社交通讯",
      badge: "解 +86 双向限制",
      icon: MessageSquare,
      color: "border-blue-200 bg-blue-50/50 text-blue-800",
      items: [
        { name: "Telegram", desc: "秒解中国号无法私聊陌生人限制" },
        { name: "WhatsApp", desc: "海外商务与跨国通讯高权重注册" },
        { name: "TikTok (海外抖音)", desc: "跨境出海达人号与带货店铺" },
        { name: "Twitter (X) / Instagram", desc: "国际社媒矩阵高权重号" },
      ],
    },
    {
      title: "AI 智能生产力矩阵",
      badge: "秒过手机验证",
      icon: Bot,
      color: "border-amber-200 bg-amber-50/50 text-amber-800",
      items: [
        { name: "ChatGPT / OpenAI", desc: "账号注册与 Plus 绑卡验证" },
        { name: "Claude (Anthropic)", desc: "高风控手机验证秒过" },
        { name: "Google Gemini", desc: "谷歌生态高级 AI 验证" },
        { name: "xAI Grok / Midjourney", desc: "海外大模型全支持" },
      ],
    },
    {
      title: "跨境电商与数字娱乐",
      badge: "畅享海外服务",
      icon: Globe,
      color: "border-purple-200 bg-purple-50/50 text-purple-800",
      items: [
        { name: "海外 Apple ID", desc: "免绑外卡安全绑定收验证码" },
        { name: "Steam (外区)", desc: "港区/土区/美区换区验证" },
        { name: "Netflix / Spotify", desc: "全球影音流媒体会员认证" },
        { name: "Amazon / eBay", desc: "跨区商城买卖家账户绑定" },
      ],
    },
  ];

  const specs = [
    ["商品名称", "中国香港 Haha SIM 实体三合一电话卡（丰泽 Fortress & 和记 3HK 联合出品）"],
    ["交付方式", "妥善防静电防折弯保护包装，默认包邮直达（如需顺丰加急请联系在线客服）"],
    ["漫游网络", "国内自动漫游接入中国移动或中国联通 4G / 5G 高速网络"],
    ["号码格式", "香港本土原生手机号码段（+852 开头，高信誉原生实体移动号）"],
    ["保号规则", "新卡开卡自带 365 天有效期；后续每年仅需充值 10 港币（约 9 元）顺延 365 天，余额留存不过期"],
    ["售后说明", "物理 SIM 卡一经拆封插卡激活后不支持无理由退换，发货前均经严格质检验真"],
  ];

  const steps = [
    {
      step: "01",
      title: "下单包邮送达",
      desc: "提交订单并填写准确收件信息，妥善封装防静电防折弯保护芯片安全，默认包邮送达。",
    },
    {
      step: "02",
      title: "确认关闭数据漫游",
      desc: "【关键防扣费】插卡前先在手机设置中确认【关闭数据漫游】，避免后台流量偷跑扣除话费。",
    },
    {
      step: "03",
      title: "插卡自动选网",
      desc: "将 Nano SIM 卡插入全网通手机卡槽，稍等数秒即可接入中国移动或中国联通 4G/5G 漫游信号。",
    },
    {
      step: "04",
      title: "直接接收短信",
      desc: "即插即用！在大陆接收各类海外平台验证码免实名认证，直接畅快接码。",
    },
    {
      step: "05",
      title: "每年长效保号",
      desc: "新卡自带整整 365 天有效期，到期前在手机下载 Haha TRAVEL App 充值 10 港币即可再续一年！",
    },
  ];

  const faqs = [
    {
      q: "Haha 卡在大陆使用需要实名认证吗？",
      a: "如果您只在中国大陆漫游接收短信验证码，是完全不需要实名认证的，插卡即用！只有在香港本地使用电话/流量，或在大陆开启主动发短信/打电话漫游时，香港电讯法例才要求通过 App 上传护照完成实名登记。",
    },
    {
      q: "Haha 卡在国内能收到哪些平台的验证码？",
      a: "支持几乎所有海外及香港本土平台！包括 Telegram、WhatsApp、TikTok、ChatGPT、Claude、海外 Apple ID、Google、Facebook、PayPal、以及众安银行、富途牛牛、汇丰等港美股券商与银行账户验证码。",
    },
    {
      q: "每年如何保号？最低费用是多少？",
      a: "Haha 卡开卡自带 365 天有效期（整整一年）。在这一年快结束前，只需在手机应用商店下载「Haha TRAVEL」App，绑定您的卡号，使用支付宝或信用卡充值最低 10 港币（约 9 元人民币），有效期就会自动从当天再延长 365 天！充值的 10 港币留在卡内余额中，永不清零。",
    },
    {
      q: "插卡后收不到短信怎么办？",
      a: "请首先确认手机已关闭数据漫游，并成功连上「中国移动」或「中国联通」信号。如果连不上信号，可以在手机设置中将网络选择从「自动」改为「手动」，手动指定连接中国移动或中国联通。若海外平台收不到码，请更换纯净的海外节点重试。",
    },
  ];

  return (
    <div className="mt-8 w-full space-y-6 text-slate-800">
      {/* 顶部 Hero 巨幕 */}
      <section className="overflow-hidden rounded-2xl border border-orange-200/80 bg-white shadow-sm">
        <div className="relative bg-gradient-to-br from-slate-900 via-sky-950 to-orange-950 p-6 text-white sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />

          <div className="relative flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-300">
              🇭🇰 中国香港原生实体 SIM 卡
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-orange-200">
              0 月租 · 国内免费接收短信
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
              大陆免实名 · 年保号仅 10 港币
            </span>
          </div>

          <h2 className="relative mt-4 text-2xl font-black tracking-tight sm:text-3xl text-white">
            {product.name} SIM 卡 · 香港丰泽 & 和记 3HK 联合出品
          </h2>

          <p className="relative mt-2 text-sm font-semibold text-orange-200/95 sm:text-base">
            香港 3HK 优质网络 · 真实实体 SIM 卡 · 纯净原生 +852 号段 · 港美股/出海/AI 神卡
          </p>

          <p className="relative mt-3 max-w-3xl text-xs leading-6 text-slate-300 sm:text-sm sm:leading-7">
            香港大型零售连锁丰泽（Fortress）联合香港三大运营商之一和记电讯（3HK）推出的实体预付费卡。在国内漫游自动接入中国移动或中国联通优质 4G/5G 网络，免费接收海内外验证码。新卡开卡自带 365 天有效期，后续每年仅需充值 10 港币（约 9 元人民币）即可延长整整一年，充值余额永久有效不清零！
          </p>

          <div className="relative mt-5 flex flex-wrap items-center gap-3 pt-2 text-xs text-orange-100/90">
            <div className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 backdrop-blur-sm">
              <Truck className="h-4 w-4 text-orange-300" />
              <span>默认包邮发货（加急顺丰可联系客服）</span>
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
              全场景海外应用与港美股兼容矩阵
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              原生香港移动运营商号段（非 VoIP），真实物理 SIM 卡信誉度极高，秒过各类严苛风控。
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
              新手插卡必看：两大防扣费避坑指南（插卡前务必阅读！）
            </div>
            <div className="space-y-2.5 text-xs leading-5 text-slate-700 sm:text-sm sm:leading-6">
              <div className="rounded-xl border border-red-200/60 bg-white/80 p-3.5">
                <p>
                  <strong className="text-red-700">1. 插卡前务必【关闭移动数据漫游】：</strong>
                  国际数据漫游资费较贵。平时在大陆接收验证码完全不需要开漫游数据！在手机蜂窝网络设置中务必保持【关闭数据漫游】，防止后台 App（如微信、邮箱或系统同步）偷跑流量触发扣费。
                </p>
              </div>
              <div className="rounded-xl border border-red-200/60 bg-white/80 p-3.5">
                <p>
                  <strong className="text-red-700">2. iPhone 提示激活 iMessage / FaceTime 务必点击【取消】：</strong>
                  苹果手机插卡后，iOS 系统偶尔会弹出“可能会发送用于激活 iMessage / FaceTime 的短信，是否允许？”提示。此时<strong>务必果断点击【取消】</strong>！点击取消完全不影响任何正常接收验证码；若误点“好”，手机会自动发送一条国际短信扣除话费。
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
          从收到卡到长期保号：简明五步流程
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

      {/* 直达全套图文教程横幅 */}
      <div className="flex flex-col gap-4 rounded-2xl border border-orange-200/90 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1">
          <div className="text-sm font-bold text-slate-950 sm:text-base">
            需要更详尽的 Haha 卡插卡选网、App 充值与保号图文指南？
          </div>
          <p className="text-xs text-slate-600 sm:text-sm">
            本站为您整理了全套高清步骤图与常见排错技巧，支持一步一步对照操作。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openPublicSupport}
            className="inline-flex items-center justify-center rounded-xl border border-orange-200 bg-white px-4 py-2 text-xs font-semibold text-orange-800 shadow-sm transition hover:bg-orange-50 sm:text-sm"
          >
            联系客服咨询
          </button>
          <Link
            href="/tutorials?topic=haha-sim"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-700 sm:text-sm"
          >
            <span>查看完整图文教程</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
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
