"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Calendar,
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

interface OneNzProductDetailsProps {
  product: {
    id?: string;
    slug?: string | null;
    name: string;
    price?: number | null;
    original_price?: number | null;
    [key: string]: any;
  };
}

export default function OneNzProductDetails({ product }: OneNzProductDetailsProps) {
  const highlights = [
    {
      icon: CheckCircle2,
      title: "已激活 · 到手免充值",
      desc: "已由团队合规完成官方激活，收到直接插卡即用，彻底告别外币卡门槛与复杂激活流程。",
      tag: "到手即用",
    },
    {
      icon: Calendar,
      title: "自带 2~4 年超长有效期",
      desc: "卡内自带超长免续期有效期，数年内无需频繁保号操作，省心稳定，到期后可无缝续期。",
      tag: "超长免保号",
    },
    {
      icon: CreditCard,
      title: "0 月租 · 零持有成本",
      desc: "平时放在国内不打电话、不发短信即完全 0 月租，无任何隐藏扣费或低消限制。",
      tag: "100% 零月租",
    },
    {
      icon: MessageSquare,
      title: "国内免费接收短信",
      desc: "国内自动漫游接入中国移动或中国联通 4G/5G 网络，接收全球各大平台验证码完全免费。",
      tag: "收短信免费",
    },
    {
      icon: Globe,
      title: "新西兰原生 +64 优质号段",
      desc: "南半球电信巨头 One NZ（原 Vodafone NZ）本土运营商号码，非虚拟 VoIP，风控通过率极高。",
      tag: "大洋洲原生卡",
    },
    {
      icon: ShieldCheck,
      title: "无需大陆身份实名",
      desc: "海外实体预付费 SIM 卡，保护个人隐私安全，专为跨境出海、海淘与 AI 玩家打造。",
      tag: "私密安全",
    },
  ];

  const platformCategories = [
    {
      title: "AI 顶流大模型矩阵",
      badge: "秒过手机验证",
      icon: Bot,
      color: "bg-emerald-100 text-emerald-800",
      items: [
        { name: "ChatGPT / OpenAI", desc: "注册与 Plus 绑卡接码验证" },
        { name: "Claude (Anthropic)", desc: "高风控严苛手机验证秒过" },
        { name: "Google Gemini", desc: "谷歌生态高级 AI 验证绑定" },
        { name: "xAI Grok / Midjourney", desc: "海外主流生产力全支持" },
      ],
    },
    {
      title: "海外主流社交通讯",
      badge: "解 +86 限制",
      icon: MessageSquare,
      color: "bg-teal-100 text-teal-800",
      items: [
        { name: "Telegram", desc: "解除中国号码无法私聊陌生人限制" },
        { name: "WhatsApp", desc: "海外商务与外贸客户直接沟通" },
        { name: "TikTok (海外抖音)", desc: "新西兰/跨境出海达人号注册" },
        { name: "Twitter (X) / Instagram", desc: "国际社媒高权重注册与防封" },
      ],
    },
    {
      title: "全球跨境金融与海淘",
      badge: "大洋洲原生信用",
      icon: CreditCard,
      color: "bg-amber-100 text-amber-800",
      items: [
        { name: "Wise (TransferWise)", desc: "多币种资金账户安全验证" },
        { name: "PayPal (国际区)", desc: "新西兰/澳洲/国际个人商户号" },
        { name: "Stripe", desc: "跨境独立站资金收款与合规验证" },
        { name: "海外 Apple ID", desc: "免绑外卡安全绑定收验证码" },
      ],
    },
    {
      title: "国际流媒体与数字娱乐",
      badge: "畅享海外原生",
      icon: Globe,
      color: "bg-cyan-100 text-cyan-800",
      items: [
        { name: "Steam (外区)", desc: "新西兰/土区/阿区换区改绑" },
        { name: "Netflix / Spotify", desc: "全球影音会员专属认证" },
        { name: "Amazon (海外站)", desc: "海淘买卖家安全账户绑定" },
        { name: "Discord", desc: "Web3/极客社区手机号认证" },
      ],
    },
  ];

  const specs = [
    ["商品规格", "One NZ（原 Vodafone NZ）新西兰预付费实体三合一 SIM 卡（大卡/Micro/Nano 全部免剪兼容）"],
    ["激活状态", "【已代激活】到手免充值直接插卡使用，免外币卡充值门槛"],
    ["有效期说明", "自带 2~4 年超长免保号有效期（到期后仍可充值纽币继续顺延）"],
    ["交付方式", "妥善防静电防折弯保护包装，默认包邮直达（如需顺丰加急请联系客服）"],
    ["漫游网络", "国内自动漫游接入中国移动或中国联通 4G / 5G 高速网络"],
    ["号码格式", "新西兰本土手机号码段（+64 21 xxx xxxx）"],
  ];

  const steps = [
    {
      step: "01",
      title: "收到实体卡",
      desc: "妥善包装保护芯片安全送达，拆封后取出适配手机的 Nano SIM 芯片。",
    },
    {
      step: "02",
      title: "关闭数据漫游",
      desc: "【关键一步】插卡前务必在手机蜂窝网络中【关闭数据漫游】，避免后台偷跑流量。",
    },
    {
      step: "03",
      title: "插入手机卡槽",
      desc: "直接插入全网通手机卡槽 1，开机等待 1-2 分钟接入中国移动或联通信号。",
    },
    {
      step: "04",
      title: "免费查本机号码",
      desc: "编写短信「mytype」免费发送到「521」，系统将在数秒内短信回复您的新西兰号码。",
    },
    {
      step: "05",
      title: "畅享全球验证",
      desc: "自带 2~4 年超长免续期有效期，直接接收 ChatGPT、Telegram、Wise 等全球验证码！",
    },
  ];

  const faqs = [
    {
      q: "为什么说这张 One NZ 卡是到手免充值？",
      a: "普通新西兰白卡需要自备新西兰本土银行卡或境外双币信用卡在官网充值 10 纽币才能激活。本品已由专业团队合规完成官方激活，并带有 2~4 年超长免续期有效期，您拿到手直接插卡即可免费收短信，无需自备任何外币卡，真正零使用门槛。",
    },
    {
      q: "自带的 2~4 年有效期到期后怎么续期？",
      a: "有效期结束前，您只需登录 One NZ 官网或官方 App 充值 10 纽币（约 40 元人民币），即可再次延长 360 天有效期；您也可以随时联系本站在线客服为您代充值，秒充秒延期，余额一直留存有效。",
    },
    {
      q: "在国内接收短信真的完全免费吗？",
      a: "是的！只要您在手机设置中保持【关闭移动数据漫游】，卡片国内漫游接收全球任何国家发来的短信验证码均是 100% 免费的，不会扣除一分钱余额。",
    },
    {
      q: "iPhone 插卡提示激活 iMessage / FaceTime 怎么处理？",
      a: "当 iPhone 弹出该提示时，请果断点击【取消】！取消完全不影响正常接收验证码。误点“好”会导致 iPhone 自动发送一条国际短信触发扣费。",
    },
  ];

  return (
    <div className="mt-8 w-full space-y-6">
      {/* 极光纯净版 Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-emerald-200/90 bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 p-6 text-white shadow-md sm:p-8">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-400/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-teal-300/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-emerald-200" />
              <span>新西兰顶级运营商 One NZ（原 Vodafone NZ）</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-500/25 px-3 py-1 text-xs font-bold text-emerald-100">
              <Calendar className="h-3.5 w-3.5 text-emerald-300" />
              <span>已激活 · 自带 2~4 年超长有效期</span>
            </span>
          </div>

          <div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              新西兰 One NZ 原生实体卡 · 到手免充值神卡
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-emerald-100/90 sm:text-sm">
              告别繁琐激活与外币信用卡门槛！官方已代激活完成，卡内自带 2~4 年免续期超长有效期。0 月租、国内免费接收短信，大洋洲原生 +64 纯净号段，秒过全球各大严苛平台风控。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-50">
              <Truck className="h-3.5 w-3.5 text-emerald-300" />
              <span>默认包邮发货（加急顺丰可联系客服）</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-50">
              <Clock3 className="h-3.5 w-3.5 text-emerald-300" />
              <span>到期轻松续期 · 余额留存有效</span>
            </span>
          </div>
        </div>
      </section>

      {/* 六大核心王牌特性 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
            <Zap className="h-5 w-5 text-emerald-600" />
            为什么选择新西兰 One NZ 原生实体卡？
          </h3>
          <span className="text-xs text-muted-foreground">纯净大洋洲号段</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="relative flex flex-col justify-between rounded-2xl border border-emerald-100 bg-gradient-to-b from-emerald-50/40 via-white to-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100/70 text-emerald-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-emerald-100/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                      {item.tag}
                    </span>
                  </div>
                  <div className="mt-3.5 text-sm font-bold text-slate-900 sm:text-base">{item.title}</div>
                  <p className="mt-1.5 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 全场景海外应用与出海兼容矩阵（第一行标题单行不折行、第二行放标签） */}
      <section className="rounded-2xl border border-emerald-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
              <Sparkles className="h-5 w-5 text-emerald-600" />
              全场景海外应用与出海营销兼容矩阵
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              原生新西兰移动运营商真实号段（非 VoIP），真实物理 SIM 卡信誉度极高，秒过各类严苛风控。
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-600" />
            实测 100% 畅通接收
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {platformCategories.map((cat) => {
            const CatIcon = cat.icon;
            return (
              <div
                key={cat.title}
                className="flex flex-col rounded-xl border border-emerald-100/80 bg-gradient-to-b from-emerald-50/25 to-white p-4"
              >
                <div className="border-b border-emerald-100/70 pb-3">
                  <div className="flex items-center gap-2">
                    <CatIcon className="h-4 w-4 shrink-0 text-emerald-600" />
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

      {/* 新手插卡必看：两大防扣费重要警示 */}
      <section className="rounded-2xl border border-red-200 bg-red-50/80 p-5 text-slate-800 shadow-sm sm:p-6">
        <div className="flex items-start gap-3.5">
          <ShieldAlert className="mt-1 h-6 w-6 shrink-0 text-red-600" />
          <div className="space-y-3">
            <div className="text-base font-bold text-red-900 sm:text-lg">
              新手插卡必看：两大防扣费避坑指南（插卡前务必阅读！）
            </div>
            <div className="space-y-2.5 text-xs leading-5 text-slate-700 sm:text-sm sm:leading-6">
              <div className="rounded-xl border border-red-200/60 bg-white/85 p-3.5">
                <p>
                  <strong className="text-red-700">1. 插卡前务必【关闭移动数据漫游】：</strong>
                  国际数据漫游流量费较为昂贵。平时在国内接收验证码完全不需要开漫游数据！在手机蜂窝网络设置中务必保持【关闭数据漫游】，防止手机后台 App 偷跑流量产生扣费。
                </p>
              </div>
              <div className="rounded-xl border border-red-200/60 bg-white/85 p-3.5">
                <p>
                  <strong className="text-red-700">2. iPhone 提示激活 iMessage / FaceTime 务必点击【取消】：</strong>
                  苹果手机插卡后，iOS 系统偶尔会弹出“可能会发送用于激活 iMessage / FaceTime 的短信，是否允许？”提示。此时<strong>务必点击【取消】</strong>！点击取消完全不影响正常接收验证码；误点“好”会触发手机自动发送一条国际短信产生扣费。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 商品规格说明 */}
      <section className="rounded-2xl border border-emerald-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          商品规格与交付说明
        </h3>
        <div className="mt-4 space-y-2.5">
          {specs.map(([label, text]) => (
            <div
              key={String(label)}
              className="flex flex-col rounded-xl border border-emerald-100 bg-emerald-50/20 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-2"
            >
              <span className="shrink-0 text-xs font-bold text-slate-900 sm:text-sm sm:w-28">{label}：</span>
              <span className="text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">{text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 从收卡到使用五步简明流程 */}
      <section className="rounded-2xl border border-emerald-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <Zap className="h-5 w-5 text-emerald-600" />
          从收到卡到长期保号：简明五步流程
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((st) => (
            <div
              key={st.step}
              className="relative flex flex-col justify-between rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50/30 to-white p-4"
            >
              <div>
                <span className="text-xl font-extrabold text-emerald-600">{st.step}</span>
                <div className="mt-2 text-sm font-bold text-slate-900">{st.title}</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{st.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 常见问题解答 */}
      <section className="rounded-2xl border border-emerald-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <HelpCircle className="h-5 w-5 text-emerald-600" />
          常见问答与疑难解答
        </h3>
        <div className="mt-4 space-y-3">
          {faqs.map((faq) => (
            <details
              key={faq.q}
              className="group rounded-xl border border-emerald-100 bg-emerald-50/20 p-4 transition open:bg-emerald-50/40"
            >
              <summary className="flex cursor-pointer items-center justify-between font-semibold text-slate-900 text-xs sm:text-sm">
                <span>{faq.q}</span>
                <span className="ml-2 text-emerald-600 transition group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-2 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 底部客服咨询条 */}
      <div className="flex flex-col gap-4 rounded-2xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1">
          <div className="text-sm font-bold text-slate-950 sm:text-base">
            需要了解更多 One NZ 续期保号或跨境平台验证技巧？
          </div>
          <p className="text-xs text-slate-600 sm:text-sm">
            本站为您提供全流程卡片使用指引与售后支持，保障您的境外卡片长期安全稳定持有。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openPublicSupport}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 sm:text-sm"
          >
            <span>联系在线客服确认</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
