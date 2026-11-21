"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
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
  TrendingDown,
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
  const supportedPills = [
    { name: "ChatGPT / OpenAI", cat: "AI 顶流", color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
    { name: "Claude (Anthropic)", cat: "高风控秒过", color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
    { name: "Google Gemini", cat: "谷歌生态", color: "bg-teal-50 text-teal-800 border-teal-200" },
    { name: "xAI Grok / Midjourney", cat: "AI 绘画模型", color: "bg-teal-50 text-teal-800 border-teal-200" },
    { name: "Telegram (电报)", cat: "解+86私聊限制", color: "bg-sky-50 text-sky-800 border-sky-200" },
    { name: "WhatsApp", cat: "海外客户商务", color: "bg-sky-50 text-sky-800 border-sky-200" },
    { name: "TikTok (海外抖音)", cat: "新西兰/出海达人", color: "bg-cyan-50 text-cyan-800 border-cyan-200" },
    { name: "Twitter (X) / Instagram", cat: "社媒防封", color: "bg-cyan-50 text-cyan-800 border-cyan-200" },
    { name: "Wise (TransferWise)", cat: "多币种账户", color: "bg-amber-50 text-amber-900 border-amber-200" },
    { name: "PayPal (国际区)", cat: "海外商户资金", color: "bg-amber-50 text-amber-900 border-amber-200" },
    { name: "海外 Apple ID", cat: "免绑外卡接收", color: "bg-purple-50 text-purple-800 border-purple-200" },
    { name: "Steam (外区) / Netflix", cat: "数字娱乐", color: "bg-purple-50 text-purple-800 border-purple-200" },
  ];

  const timelineSteps = [
    {
      num: "01",
      title: "收到实体卡（妥善安全包装）",
      desc: "拆封后取出适配手机的 Nano SIM 芯片（大卡/Micro/Nano 三合一免剪通用）。",
    },
    {
      num: "02",
      title: "【极度重要】插卡前关闭数据漫游",
      desc: "在手机蜂窝网络设置中务必保持【关闭数据漫游】，防止后台 App 偷跑昂贵国际流量。",
    },
    {
      num: "03",
      title: "插入手机 · 自动搜网接入 5G",
      desc: "插入手机卡槽 1，开机等待 1~2 分钟即可自动接入中国移动或中国联通漫游网络。",
    },
    {
      num: "04",
      title: "一键免费查询本机号码",
      desc: "新建短信发送内容「mytype」至号码「521」，系统将在数秒内免费短信回复您的本机 +64 手机号。",
    },
  ];

  return (
    <div className="mt-8 w-full space-y-6">
      {/* 极光翡翠翠绿 · 资产仪表盘 Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-emerald-400/40 bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-teal-300/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-emerald-200" />
              <span>新西兰顶级运营商 One NZ（原 Vodafone NZ）</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/50 bg-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-100">
              <Calendar className="h-3.5 w-3.5 text-emerald-200" />
              <span>已激活 · 到手免充值</span>
            </span>
          </div>

          <div>
            <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              新西兰 One NZ 原生实体卡 · 自带 2~4 年超长有效期
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-emerald-100/90 sm:text-sm">
              彻底告别繁琐激活与外币信用卡门槛！官方已由专业团队合规代激活完毕，卡内自带 2~4 年超长免续期有效期。0 月租、国内漫游中国移动/联通网络，免费接收全球平台短信验证码。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-emerald-50">
            <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 border border-white/15">
              <Truck className="h-3.5 w-3.5 text-emerald-300" />
              <span>默认包邮发货（加急顺丰可联系客服）</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 border border-white/15">
              <Clock3 className="h-3.5 w-3.5 text-emerald-300" />
              <span>到期前可联系客服轻松续期 · 余额留存有效</span>
            </span>
          </div>
        </div>
      </section>

      {/* 资产看板：超长免保号时钟与持有成本测算 */}
      <section className="grid gap-4 sm:grid-cols-3">
        {/* 指标卡 1：超长有效期 */}
        <div className="rounded-3xl border border-emerald-200/90 bg-gradient-to-b from-emerald-50/60 via-white to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800">免保号周期</span>
            <Calendar className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">2 ~ 4 年</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            官方预存超长有效期，数年内无需频繁充值保号，到期可无缝续期。
          </p>
        </div>

        {/* 指标卡 2：日常月租 */}
        <div className="rounded-3xl border border-teal-200/90 bg-gradient-to-b from-teal-50/60 via-white to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-teal-800">持有成本</span>
            <TrendingDown className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">0 月租</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            不打电话不发短信即完全 0 月租，国内接收全球各类平台短信 100% 免费。
          </p>
        </div>

        {/* 指标卡 3：号段信誉 */}
        <div className="rounded-3xl border border-cyan-200/90 bg-gradient-to-b from-cyan-50/60 via-white to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-800">号段属性</span>
            <Globe className="h-4 w-4 text-cyan-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">+64 真实号段</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            原生大洋洲移动网络号码段（非虚拟号），风控通过率极高。
          </p>
        </div>
      </section>

      {/* 现代灵动徽章墙（轻量胶囊标签墙 · 替代生硬 4 列堆叠） */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
              <Zap className="h-5 w-5 text-emerald-600" />
              全球顶流应用与服务兼容矩阵
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              实体物理 SIM 卡原生大洋洲信誉背书，秒过海内外主流平台验证
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-600" />
            实测 100% 畅通通过
          </span>
        </div>

        {/* 灵动胶囊徽章墙 */}
        <div className="mt-5 flex flex-wrap gap-2.5">
          {supportedPills.map((pill) => (
            <div
              key={pill.name}
              className={`flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-xs shadow-xs transition hover:scale-[1.02] ${pill.color}`}
            >
              <span className="font-bold">{pill.name}</span>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                {pill.cat}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 垂直时间线使用流程（Vertical Timeline · 告别小方块排布） */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-7">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <Clock className="h-5 w-5 text-emerald-600" />
          从收到卡到使用：简明四步向导
        </h3>

        <div className="relative mt-6 space-y-6 pl-6 before:absolute before:bottom-2 before:left-2 before:top-2 before:w-0.5 before:bg-emerald-200">
          {timelineSteps.map((st) => (
            <div key={st.num} className="relative">
              <div className="absolute -left-[30px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-emerald-500 bg-white shadow-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-emerald-600">STEP {st.num}</span>
                  <span className="text-sm font-bold text-slate-900">{st.title}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">{st.desc}</p>
              </div>
            </div>
          ))}
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
