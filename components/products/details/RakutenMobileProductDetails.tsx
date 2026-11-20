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

interface RakutenMobileProductDetailsProps {
  product: {
    id?: string;
    slug?: string | null;
    name: string;
    price?: number | null;
    original_price?: number | null;
    [key: string]: any;
  };
}

export default function RakutenMobileProductDetails({ product }: RakutenMobileProductDetailsProps) {
  const highlights = [
    {
      icon: Globe,
      title: "日本原生 +81 手机号",
      desc: "日本主流运营商乐天移动（Rakuten）原生号段（非 VoIP），纯正日本信用，秒过日服严苛风控。",
      tag: "原生日卡",
    },
    {
      icon: Sparkles,
      title: "煤炉/抽票/日淘王牌",
      desc: "完美支持煤炉 Mercari、Line、eplus 演唱会抽票、Yahoo Japan、日本亚马逊与日服手游认证。",
      tag: "日淘出海神卡",
    },
    {
      icon: MessageSquare,
      title: "国内免费接收短信",
      desc: "国内自动漫游接入中国移动或中国联通网络，接收来自日本本土及全球各大平台的验证码完全免费。",
      tag: "收短信免费",
    },
    {
      icon: ShieldCheck,
      title: "无需大陆实名",
      desc: "海外实体预付费 SIM 卡，保护个人隐私安全，无需提供大陆身份证件，到手即可插卡使用。",
      tag: "免实名认证",
    },
    {
      icon: CreditCard,
      title: "0 月租模式",
      desc: "默认按量计费，平时在大陆不打电话、不发短信即完全 0 月租，无日常强制扣费隐患。",
      tag: "100% 零月租",
    },
    {
      icon: Smartphone,
      title: "三合一免剪卡 · 全网通适配",
      desc: "标准大卡、Micro、Nano 任意卡槽通用，适配 iPhone 及全网通安卓手机，无需剪卡工具。",
      tag: "全网通通用",
    },
  ];

  const platformCategories = [
    {
      title: "日本二手电商与海淘",
      badge: "秒过煤炉风控",
      icon: Globe,
      color: "border-emerald-200 bg-emerald-50/50 text-emerald-800",
      items: [
        { name: "Mercari (煤炉)", desc: "日本二手交易买卖家账号认证" },
        { name: "Yahoo! 雅虎日拍", desc: "雅虎拍卖与日本本土账户安全绑定" },
        { name: "Amazon 日本站", desc: "日亚买家卖家高权重账号认证" },
        { name: "Rakuten 乐天市场", desc: "日本乐天生态本土账户绑定" },
      ],
    },
    {
      title: "日本演唱会票务与二次元",
      badge: "日本抽票必备",
      icon: Sparkles,
      color: "border-purple-200 bg-purple-50/50 text-purple-800",
      items: [
        { name: "eplus (イープラス)", desc: "日本主流演唱会与展会抽票认证" },
        { name: "Ticket Pia / Lawson", desc: "罗森票务与 Pia 官方抽签认证" },
        { name: "日服手游与动漫", desc: "FGO / 碧蓝档案 / 赛马娘等账号认证" },
        { name: "DMM / DLsite", desc: "日本本土数字二次元商城认证" },
      ],
    },
    {
      title: "全球主流社交通讯",
      badge: "高信誉防封号",
      icon: MessageSquare,
      color: "border-blue-200 bg-blue-50/50 text-blue-800",
      items: [
        { name: "Line (日本版)", desc: "日本国民级通讯社交软件原生注册" },
        { name: "Telegram", desc: "解除中国号无法主动私聊陌生人限制" },
        { name: "Twitter (X) / Instagram", desc: "国际社媒高权重注册与防封" },
        { name: "TikTok (日区版)", desc: "日本本土短视频达人号与小店" },
      ],
    },
    {
      title: "AI 智能生产力矩阵",
      badge: "秒过手机验证",
      icon: Bot,
      color: "border-amber-200 bg-amber-50/50 text-amber-800",
      items: [
        { name: "ChatGPT / OpenAI", desc: "账号注册与 Plus 绑卡验证" },
        { name: "Claude (Anthropic)", desc: "高风控日本原生实体号秒过" },
        { name: "Google Gemini", desc: "谷歌生态高级 AI 验证" },
        { name: "海外 Apple ID", desc: "日区苹果账户安全绑定收码" },
      ],
    },
  ];

  const specs = [
    ["商品规格", "Rakuten Mobile 日本乐天原生实体三合一 SIM 卡"],
    ["交付方式", "国内现货妥善包装防静电防折弯，包邮送达（如需顺丰加急请联系客服）"],
    ["漫游网络", "国内自动漫游接入中国移动或中国联通 4G / 5G 高速网络"],
    ["号码格式", "日本本土原生手机号码段（+81 开头，高信誉原生移动号）"],
    ["售后说明", "物理 SIM 卡一经拆封插卡激活后不支持无理由退换，发货前均经严格质检验真"],
  ];

  const steps = [
    {
      step: "01",
      title: "下单送达",
      desc: "提交订单并填写准确收件信息，国内现货妥善包装送达，保护芯片安全。",
    },
    {
      step: "02",
      title: "确认关闭数据漫游",
      desc: "【关键防扣费】插卡前先在手机蜂窝网络设置中确认【关闭数据漫游】，避免后台流量偷跑扣除话费。",
    },
    {
      step: "03",
      title: "插卡自动选网",
      desc: "将 Nano SIM 卡插入全网通手机卡槽，稍等数秒即可接入中国移动或中国联通 4G/5G 漫游信号。",
    },
    {
      step: "04",
      title: "直接接收短信",
      desc: "即插即用！在大陆接收来自各类日本平台及全球应用的短信验证码完全免费。",
    },
    {
      step: "05",
      title: "长效维护保号",
      desc: "建议在手机日历设置提醒，按需在官方入口充值维护，确保号码长期有效。",
    },
  ];

  const faqs = [
    {
      q: "乐天卡在国内接收短信收费吗？",
      a: "完全免费！插卡后自动漫游连接中国移动或中国联通 4G/5G 网络，平时仅用于接收短信验证码不产生任何费用。注意日常保持【关闭数据漫游】即可。",
    },
    {
      q: "能用于注册日本煤炉 Mercari 或 eplus 抽票吗？",
      a: "完全可以！由于是日本四大运营商之一 Rakuten 官方原生号段，非 VoIP 虚拟号，煤炉和各类日本票务系统对该号段认可度极高，秒过各类短信验证。",
    },
  ];

  return (
    <div className="mt-8 w-full space-y-6 text-slate-800">
      {/* 顶部 Hero 巨幕 */}
      <section className="overflow-hidden rounded-2xl border border-orange-200/80 bg-white shadow-sm">
        <div className="relative bg-gradient-to-br from-slate-900 via-pink-950 to-orange-950 p-6 text-white sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-pink-500/10 blur-3xl" />

          <div className="relative flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-pink-400/30 bg-pink-500/20 px-3 py-1 text-xs font-semibold text-pink-300">
              🇯🇵 日本原生实体 SIM 卡
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-orange-200">
              0 月租模式 · 国内免费接收短信
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
              煤炉 Mercari / 日本抽票 / 日淘神卡
            </span>
          </div>

          <h2 className="relative mt-4 text-2xl font-black tracking-tight sm:text-3xl text-white">
            {product.name} 日本原生实体电话卡 · 乐天移动 Rakuten
          </h2>

          <p className="relative mt-2 text-sm font-semibold text-orange-200/95 sm:text-base">
            日本四大运营商乐天网络 · 真实物理 SIM 卡 · 纯净 +81 号段 · 秒过煤炉/抽票风控
          </p>

          <p className="relative mt-3 max-w-3xl text-xs leading-6 text-slate-300 sm:text-sm sm:leading-7">
            日本本土主流运营商乐天移动（Rakuten Mobile）原生实体手机卡（+81 国际号码段），无需大陆实名认证，国内自动接入中国移动或中国联通优质 4G/5G 漫游网络。免费接收来自煤炉 Mercari、eplus 抽票、Line、Yahoo Japan、日本亚马逊、ChatGPT 等各类平台验证码，二次元与日淘出海必备！
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
              日本二次元、煤炉海淘与 AI 兼容矩阵
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              日本原生移动运营商号段（非 VoIP），真实物理 SIM 卡信誉度极高，秒过各类严苛风控。
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
              新手插卡必看：三大防扣费避坑指南（插卡前务必阅读！）
            </div>
            <div className="space-y-2.5 text-xs leading-5 text-slate-700 sm:text-sm sm:leading-6">
              <div className="rounded-xl border border-red-200/60 bg-white/80 p-3.5">
                <p>
                  <strong className="text-red-700">1. 插卡前务必【关闭移动数据漫游】：</strong>
                  国际数据漫游费用昂贵。平时接收短信完全不需要开漫游数据！在手机蜂窝网络设置中务必保持【关闭数据漫游】，避免后台 App 偷跑流量触发额外扣费。
                </p>
              </div>
              <div className="rounded-xl border border-red-200/60 bg-white/80 p-3.5">
                <p>
                  <strong className="text-red-700">2. iPhone 提示激活 iMessage / FaceTime 务必点击【取消】：</strong>
                  苹果手机插卡后，iOS 系统偶尔会弹出“可能会发送用于激活 iMessage / FaceTime 的短信，是否允许？”提示。此时<strong>务必果断点击【取消】</strong>！点击取消完全不影响正常接收验证码；若误点“好”，手机会自动发送一条国际短信扣除话费。
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
            需要了解更多关于 Rakuten Mobile 乐天卡的使用细节？
          </div>
          <p className="text-xs text-slate-600 sm:text-sm">
            本站为您提供一对一咨询与技术支持，保障您的境外卡片长期安全稳定持有。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openPublicSupport}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-700 sm:text-sm"
          >
            <span>联系在线客服咨询</span>
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
