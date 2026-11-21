"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
  Globe,
  HelpCircle,
  Landmark,
  MessageSquare,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";
import { openPublicSupport } from "@/lib/support/open-public-support";

interface VodafoneSimProductDetailsProps {
  product: {
    id?: string;
    slug?: string | null;
    name: string;
    price?: number | null;
    original_price?: number | null;
    [key: string]: any;
  };
}

export default function VodafoneSimProductDetails({ product }: VodafoneSimProductDetailsProps) {
  const fintechMatrix = [
    { name: "Wise (TransferWise)", type: "国际多币种账户", status: "完美支持", desc: "大额跨国资金流转与绑定接收动态 SMS 验证码" },
    { name: "N26 德国数字银行", type: "欧洲纯正 IBAN", status: "最高权重", desc: "官方认可物理实体号码，秒过风控与护照开户核验" },
    { name: "Revolut 国际钱包", type: "英国/欧盟金融", status: "秒过验证", desc: "开通多国本地虚拟卡与加密资产账户必备" },
    { name: "Santander 桑坦德银行", type: "西班牙本土大行", status: "原生适配", desc: "西班牙及拉美顶级银行线下/网银开户首选" },
    { name: "BBVA 西班牙对外银行", type: "本土主流银行", status: "官方认可", desc: "实体运营商号码极速绑定，支持指纹与动态短信" },
    { name: "Stripe 欧洲商户账户", type: "跨境出海收款", status: "实卡信誉", desc: "跨境独立站与海外公司资金结算最高安全级别" },
  ];

  const highlights = [
    {
      title: "欧洲老牌通信巨头 · 沃达丰原厂",
      desc: "全球知名跨国电信品牌直属网络，实体 SIM 物理卡，具备极高国际反欺诈与金融风控信誉度。",
      tag: "顶级信誉",
    },
    {
      title: "欧洲离岸金融与银行开户神器",
      desc: "针对 N26、Wise、Revolut 等高风控欧洲金融机构专门优化，彻底告别虚拟 VoIP 被拒烦恼。",
      tag: "离岸金融",
    },
    {
      title: "国内待机免费接收短信",
      desc: "在大陆漫游自动注册移动/联通基站，长期稳定接收各类外币账户动账提醒与两步验证码。",
      tag: "免费收码",
    },
    {
      title: "支持长期保号持有",
      desc: "只需每 5~6 个月发生一次轻微扣费或充值，即可长年保住该西班牙 +34 珍贵欧洲实体号码。",
      tag: "长期保号",
    },
  ];

  const faqs = [
    {
      q: "为什么欧洲银行开户强烈推荐 Vodafone 沃达丰？",
      a: "欧洲金融风控极其严苛，欧洲银行业协会广泛采用运营商数据库排查虚拟号段（如 Google Voice 或无实名网络卡）。Vodafone 沃达丰作为欧洲最主流的三大跨国运营商之一，其号段在所有欧洲银行和风控数据库中均被标记为最高权重的实体移动卡（Mobile Physical SIM），通过率遥遥领先。",
    },
    {
      q: "实名认证流程需要哪些资料？",
      a: "西班牙实名法规要求提供有效护照首页照片。我们收到订单后将协助您提交至西班牙官方渠道快速实名备案，安全合规，实名完成后直邮发货到您手中。",
    },
    {
      q: "在国内待机如何避免产生意外扣费？",
      a: "卡片插入手机后，请在设置中关闭「蜂窝移动数据」或「数据漫游」，仅保留待机信号。这样卡片只用于接收免费短信，账户余额不会被意外消耗。",
    },
  ];

  return (
    <div className="mt-8 space-y-8">
      {/* 1. 沃达丰烈焰红 Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-950 via-zinc-900 to-rose-950 p-6 text-white shadow-xl sm:p-8">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-200">
              <Sparkles className="h-3.5 w-3.5 text-red-400" />
              Vodafone 沃达丰 · 跨国电信巨头
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/20 px-3 py-1 text-xs font-medium text-rose-200">
              <Landmark className="h-3.5 w-3.5" />
              欧洲金融与数字银行开户王牌
            </span>
          </div>

          <h2 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
            西班牙 Vodafone 手机卡 · 欧洲顶级金融信誉
          </h2>

          <p className="text-sm leading-relaxed text-red-100/90 sm:text-base">
            专为离岸金融、海外资产配置与欧洲数字银行打造。高权重物理实体号段，秒过 Wise / N26 / Revolut 严苛风控核验。
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-red-200/90">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>欧洲顶级银行 100% 认可</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>国内待机免费接收短信</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>官方合规实名安全无忧</span>
            </div>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-red-600/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 right-20 h-48 w-48 rounded-full bg-rose-500/10 blur-2xl" />
      </div>

      {/* 2. 差异化独家模块: 欧洲离岸金融与银行开户过验矩阵 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-red-600" />
              <h3 className="text-lg font-bold text-slate-900">欧洲顶尖金融机构与国际银行过验表现</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">实体纯正号段，彻底杜绝虚拟号风控拒单与开户受阻</p>
          </div>
          <span className="inline-flex w-fit items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            顶级金融合规信誉
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fintechMatrix.map((item, idx) => (
            <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">{item.name}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  {item.status}
                </span>
              </div>
              <div className="mt-1 text-[11px] font-medium text-red-700">{item.type}</div>
              <p className="mt-2 text-xs text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 3. 核心优势特性 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {highlights.map((h, idx) => (
          <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="inline-block rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
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
          <h3 className="text-lg font-bold text-slate-900">Vodafone 沃达丰常见问题解答</h3>
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
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 via-rose-50 to-orange-50 p-6 sm:flex-row">
        <div>
          <h4 className="text-base font-bold text-slate-900">需要了解更多欧洲银行搭配开户技巧？</h4>
          <p className="mt-1 text-xs text-slate-600">本站提供全流程实名认证指导与欧洲实体卡使用咨询，保障您的离岸账户安全。</p>
        </div>
        <button
          type="button"
          onClick={() => openPublicSupport()}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 transition-colors"
        >
          <MessageSquare className="h-4 w-4" />
          联系在线技术客服
        </button>
      </div>
    </div>
  );
}
