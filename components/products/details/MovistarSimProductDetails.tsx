"use client";

import Link from "next/link";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Clock3,
  CreditCard,
  Globe,
  HelpCircle,
  MessageSquare,
  Radio,
  ShieldCheck,
  Signal,
  Smartphone,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react";
import { openPublicSupport } from "@/lib/support/open-public-support";

interface MovistarSimProductDetailsProps {
  product: {
    id?: string;
    slug?: string | null;
    name: string;
    price?: number | null;
    original_price?: number | null;
    [key: string]: any;
  };
}

export default function MovistarSimProductDetails({ product }: MovistarSimProductDetailsProps) {
  const networkMetrics = [
    { label: "运营商归属", value: "Telefónica 西班牙电信", sub: "百年国家级电信集团", color: "text-blue-700" },
    { label: "西班牙本土覆盖率", value: "99%+ 全境覆盖", sub: "基站数量居全国第一", color: "text-emerald-700" },
    { label: "网络制式支持", value: "5G Ultra / 4G LTE", sub: "全频段物理 SIM 卡", color: "text-indigo-700" },
    { label: "国内漫游待机", value: "免费接收 SMS", sub: "注册移动/联通基站", color: "text-cyan-700" },
  ];

  const highlights = [
    {
      title: "西班牙第一大运营商 · Telefónica 原厂直属",
      desc: "西班牙历史最悠久、网络规模最庞大的国家级电信巨头，实体物理 SIM 卡，享有最纯正的官方通信信誉。",
      tag: "国宝级通信",
    },
    {
      title: "西班牙全国第一的基站覆盖深度",
      desc: "无论是在马德里、巴塞罗那等核心都市，还是在海岛、偏远城镇与高速公路，Movistar 信号覆盖率均稳居行业榜首。",
      tag: "信号之王",
    },
    {
      title: "西语区与拉美跨国广泛认可",
      desc: "Telefónica 在整个西语系国家及拉美地区（阿根廷、智利、秘鲁等）拥有庞大网络生态，西语出海业务必备。",
      tag: "西语出海",
    },
    {
      title: "官方合规实名 · 终身长效持有",
      desc: "严格按照西班牙皇家法令完成实名登记备案，安全合规，支持长期低成本保号待机。",
      tag: "合规稳定",
    },
  ];

  const faqs = [
    {
      q: "Movistar 相比 Orange 和 Vodafone 有何独特优势？",
      a: "Movistar 是西班牙电信（Telefónica）旗下的绝对旗舰品牌，地位类似于中国的中国电信或中国移动，是西班牙本土基站数量最多、网络覆盖最全的运营商。如果您重视官方原生血统、极致的基站覆盖品质以及西语国家的通用认可度，Movistar 是最权威的旗舰之选。",
    },
    {
      q: "在国内可以长期保留该号码吗？",
      a: "完全可以。只要按照规定定期产生一次有效扣费或轻微充值（每 6 个月内），卡片有效期就会自动顺延，非常适合在国内用于长期接收海外应用验证码与银行通知。",
    },
    {
      q: "实名认证怎么办理？",
      a: "收到实体卡后，只需提供有效的护照首页照片，我们将在西班牙电信官方系统为您录入并完成实名登记，安全、快捷、合规。",
    },
  ];

  return (
    <div className="mt-8 space-y-8">
      {/* 1. 皇家深蓝 Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl sm:p-8">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/40 bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-200">
              <Sparkles className="h-3.5 w-3.5 text-blue-400" />
              Telefónica 西班牙电信官方旗舰品牌
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/20 px-3 py-1 text-xs font-medium text-indigo-200">
              <Signal className="h-3.5 w-3.5" />
              西班牙本土信号覆盖率第一
            </span>
          </div>

          <h2 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
            西班牙 Movistar 手机卡 · 官方原厂旗舰品质
          </h2>

          <p className="text-sm leading-relaxed text-blue-100/90 sm:text-base">
            百年国家电信品牌，原厂纯正 +34 物理实体号。西班牙第一网络覆盖，国内免费漫游接收短信，出海欧洲稳健之选。
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-blue-200/90">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>全境 99%+ 基站覆盖率</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>国内免费接收验证码</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>西语出海业务顶级信誉</span>
            </div>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 right-20 h-48 w-48 rounded-full bg-indigo-500/15 blur-2xl" />
      </div>

      {/* 2. 差异化独家模块: 官方旗舰网络规格 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <Signal className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-bold text-slate-900">西班牙国家级网络规格参数</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">原厂顶级蜂窝网络覆盖，通信信誉与硬件标准无可挑剔</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {networkMetrics.map((m, idx) => (
            <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <span className="text-xs font-medium text-slate-500">{m.label}</span>
              <div className={`mt-2 text-base font-bold ${m.color}`}>{m.value}</div>
              <p className="mt-1 text-[11px] text-slate-400">{m.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 3. 核心优势特性 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {highlights.map((h, idx) => (
          <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
              {h.tag}
            </span>
            <h4 className="mt-2 text-sm font-bold text-slate-900">{h.title}</h4>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{h.desc}</p>
          </div>
        ))}
      </div>

      {/* 4. 常见问答 FAQ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-slate-700" />
          <h3 className="text-lg font-bold text-slate-900">Movistar 常见问题解答</h3>
        </div>

        <div className="divide-y divide-slate-100">
          {faqs.map((f, i) => (
            <div key={i} className="py-4 first:pt-0 last:pb-0">
              <h4 className="text-sm font-semibold text-slate-900">{f.q}</h4>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{f.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 5. 底部客服卡片 */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 via-slate-50 to-indigo-50 p-6 sm:flex-row">
        <div>
          <h4 className="text-base font-bold text-slate-900">需要 Movistar 官方实名或欧洲出行咨询？</h4>
          <p className="mt-1 text-xs text-slate-600">本站提供全流程专业咨询与技术协助，保障您的海外通讯万无一失。</p>
        </div>
        <button
          type="button"
          onClick={() => openPublicSupport()}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <MessageSquare className="h-4 w-4" />
          联系在线技术客服
        </button>
      </div>
    </div>
  );
}
