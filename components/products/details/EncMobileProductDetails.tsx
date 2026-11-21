"use client";

import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock3,
  CreditCard,
  Globe,
  Headphones,
  HelpCircle,
  MessageSquare,
  Plane,
  Radio,
  Repeat,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { openPublicSupport } from "@/lib/support/open-public-support";

interface EncMobileProductDetailsProps {
  product: {
    id?: string;
    slug?: string | null;
    name: string;
    price?: number | null;
    original_price?: number | null;
    [key: string]: any;
  };
}

export default function EncMobileProductDetails({ product }: EncMobileProductDetailsProps) {
  const dualModes = [
    {
      stage: "阶段一 · 赴美前",
      title: "国内极简接码保号舱",
      desc: "在中国大陆长期低成本待机，免费接收各类海外银行、社交媒体、AI 平台的短信验证码，提前搞定海外账户搭建。",
      features: ["国内免费接收短信", "超低月费长期持有", "不产生额外漫游隐形费用"],
      tag: "国内待机",
      tagColor: "bg-blue-100 text-blue-800",
    },
    {
      stage: "阶段二 · 赴美后",
      title: "一键升级全美主力 5G 套餐",
      desc: "落地美国或夏威夷、波多黎各后，随时在官网将套餐升级为高速 5G 无限流量，包含全美及无限直拨中国大陆国际通话。",
      features: ["T-Mobile 原生高速 5G", "无限中美双向长途", "落地插卡即用免排队办卡"],
      tag: "在美主力",
      tagColor: "bg-amber-100 text-amber-800",
    },
  ];

  const highlights = [
    {
      icon: Headphones,
      title: "7×24 小时中文官方客服",
      desc: "专为华人量身定制，提供 7×24 中文电话客服、微信官方客服与在线工单，彻底免除英文沟通障碍。",
    },
    {
      icon: Wallet,
      title: "微信与支付宝便捷充值",
      desc: "告别传统境外卡必须绑定美国信用卡扣款的繁琐痛点，支持直接使用国内微信或支付宝扫码结算账单。",
    },
    {
      icon: Radio,
      title: "T-Mobile 原生顶级基站网络",
      desc: "底层直接接入全美覆盖最广的 T-Mobile 原生高速蜂窝网络，实体 SIM 物理号段，信誉权重顶级。",
    },
    {
      icon: Briefcase,
      title: "出海商务与留学生首选",
      desc: "适合跨境商务、海外留学、外贸出海人员，无论是长期国内养号还是跨洋差旅均可自由切换应对自如。",
    },
  ];

  const faqs = [
    {
      q: "ENC Mobile 适合什么样的用户？",
      a: "ENC Mobile 特别适合准备赴美留学、商务差旅、移民探亲，或者在国内需要长期稳定持有高信誉度美国原生实体卡的用户。它的核心优势是支持中美双栖自由升级、全中文客服支持，以及支持微信/支付宝充值。",
    },
    {
      q: "在国内待机收短信需要开通什么功能吗？",
      a: "卡片已默认开通国际漫游服务。收卡后根据指引在手机设置中开启「数据漫游」即可搜索到中国移动或中国联通的漫游信号，待机接收短信完全免费。",
    },
    {
      q: "到达美国后如何切换为大流量套餐？",
      a: "您可以直接登录 ENC Mobile 官网中文个人中心，随时选择升级为包含海量 5G 流量和无限通话的月度套餐，几分钟内即可生效，到达美国后直接畅享极速网络。",
    },
  ];

  return (
    <div className="mt-8 space-y-8">
      {/* 1. 曜石黑金高端商务 Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-950 via-zinc-900 to-amber-950 p-6 text-white shadow-xl sm:p-8">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              华人出海专属美卡
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-medium text-slate-300">
              <Headphones className="h-3.5 w-3.5 text-amber-300" />
              7×24 中文真人客服
            </span>
          </div>

          <h2 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
            ENC Mobile 美国原生手机卡 · 中美双栖出海利器
          </h2>

          <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
            国内低成本接码待机，赴美无缝升级 5G 高速大流量。支持微信/支付宝直接缴费，全中文售后支持，出海零门槛。
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-amber-200/90">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-amber-400" />
              <span>微信/支付宝直接充值</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-amber-400" />
              <span>国内免费接收验证码</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-amber-400" />
              <span>T-Mobile 原生高速物理网络</span>
            </div>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 right-24 h-48 w-48 rounded-full bg-orange-500/10 blur-2xl" />
      </div>

      {/* 2. 差异化独家模块: 中美双栖自由切换舱 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <Repeat className="h-5 w-5 text-amber-600" />
            <h3 className="text-lg font-bold text-slate-900">中美双栖自由切换方案</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">一张卡搞定出海全流程：从国内提前养号到在美主力通讯无缝衔接</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {dualModes.map((mode, idx) => (
            <div key={idx} className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-5 transition-all hover:border-amber-400">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{mode.stage}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${mode.tagColor}`}>
                    {mode.tag}
                  </span>
                </div>
                <h4 className="mt-2 text-base font-bold text-slate-900">{mode.title}</h4>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{mode.desc}</p>
                <div className="mt-4 space-y-1.5 border-t border-slate-200/80 pt-3">
                  {mode.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-700">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. 核心优势特性 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-600" />
            <h3 className="text-lg font-bold text-slate-900">ENC Mobile 核心专享优势</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">全方位兼顾便捷度与原生通信品质</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {highlights.map((h, idx) => {
            const Icon = h.icon;
            return (
              <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">{h.title}</h4>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{h.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. 常见问答 FAQ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-slate-700" />
          <h3 className="text-lg font-bold text-slate-900">ENC Mobile 常见问题解答</h3>
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

      {/* 5. 底部客服咨询卡片 */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 p-6 sm:flex-row">
        <div>
          <h4 className="text-base font-bold text-slate-900">需要了解更多 ENC Mobile 套餐细则或激活指导？</h4>
          <p className="mt-1 text-xs text-slate-600">本站提供全流程中文咨询与技术支持，保障您的境外卡片长期安全稳定持有。</p>
        </div>
        <button
          type="button"
          onClick={() => openPublicSupport()}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-amber-400 shadow-sm hover:bg-slate-800 transition-colors"
        >
          <MessageSquare className="h-4 w-4" />
          联系在线技术客服
        </button>
      </div>
    </div>
  );
}
