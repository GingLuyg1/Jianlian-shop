"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  Globe,
  HelpCircle,
  MapPin,
  MessageSquare,
  Plane,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react";
import { openPublicSupport } from "@/lib/support/open-public-support";

interface OrangeSimProductDetailsProps {
  product: {
    id?: string;
    slug?: string | null;
    name: string;
    price?: number | null;
    original_price?: number | null;
    [key: string]: any;
  };
}

export default function OrangeSimProductDetails({ product }: OrangeSimProductDetailsProps) {
  const euCountries = [
    "西班牙", "法国", "德国", "意大利", "葡萄牙",
    "荷兰", "比利时", "瑞士", "奥地利", "希腊",
    "瑞典", "挪威", "丹麦", "芬兰", "爱尔兰",
    "捷克", "波兰", "匈牙利", "克罗地亚", "欧盟及欧洲主流 30+ 地区"
  ];

  const features = [
    {
      title: "欧盟 27+ 国免漫游大流量",
      desc: "遵循欧盟「Roam Like at Home」无漫游法规，一张卡游遍欧洲大陆，跨国无需更换任何 SIM 卡。",
      tag: "跨国畅行",
    },
    {
      title: "Orange 原厂 5G/4G 高速网络",
      desc: "欧洲最大电信巨头之一 Orange 直属物理号段，非二手转售 MVNO，信号穿透力强，网络极速稳定。",
      tag: "原厂品质",
    },
    {
      title: "国内免月租漫游待机",
      desc: "卡片在大陆支持注册中国移动或联通基站漫游待机，免费接收各类海内外验证短信，无隐藏扣费。",
      tag: "接码神器",
    },
    {
      title: "欧洲出海与自由行首选",
      desc: "支持热点共享，自驾导航、商务差旅、欧洲留学落地插卡即用，告别昂贵随身 Wi-Fi 租赁。",
      tag: "自驾留学",
    },
  ];

  const faqs = [
    {
      q: "Orange 电话卡在西班牙以外的欧洲国家如何使用？",
      a: "卡片遵循欧盟漫游统一法规，在法国、德国、意大利、瑞士、奥地利等欧洲 30 多个国家自动漫游接入当地顶级运营商网络（如法国 Orange、德国 Telekom 等），直接消耗套餐内的漫游数据额度，无任何额外跨国漫游加收费。",
    },
    {
      q: "实名认证怎么办理？",
      a: "西班牙法律要求电话卡必须实名登记。收到实体卡后，您只需提供护照首页信息，我们将协助您完成官方合规实名登记，审核通过后插卡即可直接使用。",
    },
    {
      q: "在国内可以长期保留号码吗？",
      a: "可以。在西班牙及欧盟以外地区待机时，只要保持账户有活跃记录（每 5~6 个月充值或发生一次微量短信消费），即可一直稳定保留该西班牙 +34 欧洲原生号码。",
    },
  ];

  return (
    <div className="mt-8 space-y-8">
      {/* 1. 活力橙 Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-950 via-zinc-900 to-amber-950 p-6 text-white shadow-xl sm:p-8">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/40 bg-orange-500/20 px-3 py-1 text-xs font-semibold text-orange-200">
              <Sparkles className="h-3.5 w-3.5 text-orange-400" />
              欧洲电信巨头 · Orange 官方原厂
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-200">
              <Plane className="h-3.5 w-3.5" />
              欧盟 27 国免费无漫游数据卡
            </span>
          </div>

          <h2 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
            西班牙 Orange 原生手机卡 · 畅游欧洲大流量
          </h2>

          <p className="text-sm leading-relaxed text-orange-100/90 sm:text-base">
            欧洲自驾、商务出海与留学生黄金配置。欧盟多国通用高速 5G 流量包，国内免费接收短信，高权重 +34 原生实体号。
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-orange-200/90">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>欧盟跨国无缝漫游</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>国内免费接收验证码</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>支持热点共享与导航</span>
            </div>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-orange-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 right-20 h-48 w-48 rounded-full bg-amber-500/10 blur-2xl" />
      </div>

      {/* 2. 差异化独家模块: 欧盟 27+ 国免漫游地图清单 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-orange-600" />
            <h3 className="text-lg font-bold text-slate-900">一张卡畅行欧洲主流 30+ 目的地</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">遵循欧盟漫游条例，跨国自驾无需换卡，流量自动切换无缝衔接</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {euCountries.map((c, i) => (
            <span
              key={i}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                i === euCountries.length - 1
                  ? "bg-orange-100 font-bold text-orange-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* 3. 核心优势特性 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {features.map((f, idx) => (
          <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="inline-block rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
              {f.tag}
            </span>
            <h4 className="mt-2 text-sm font-bold text-slate-900">{f.title}</h4>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* 4. 常见问答 FAQ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-slate-700" />
          <h3 className="text-lg font-bold text-slate-900">Orange 常见问题解答</h3>
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
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 p-6 sm:flex-row">
        <div>
          <h4 className="text-base font-bold text-slate-900">需要 Orange 西班牙实名认证或出境配置指导？</h4>
          <p className="mt-1 text-xs text-slate-600">本站提供全流程实名协助与资费答疑，保障您的欧洲之行网络通畅。</p>
        </div>
        <button
          type="button"
          onClick={() => openPublicSupport()}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-700 transition-colors"
        >
          <MessageSquare className="h-4 w-4" />
          联系在线技术客服
        </button>
      </div>
    </div>
  );
}
