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

interface AirMobileProductDetailsProps {
  product: {
    id?: string;
    slug?: string | null;
    name: string;
    price?: number | null;
    original_price?: number | null;
    [key: string]: any;
  };
}

export default function AirMobileProductDetails({ product }: AirMobileProductDetailsProps) {
  const highlights = [
    {
      icon: Globe,
      title: "美国原生 +1 纯净号段",
      desc: "美国三大主流运营商网络原生号段（非虚拟 VoIP 号码），纯正美国本土信誉，秒过各类海外风控与安全校验。",
      tag: "原生美卡",
    },
    {
      icon: CreditCard,
      title: "超低月租 · 极致性价比",
      desc: "相比传统美卡高昂月租，Air Mobile 专为长期低成本养号设计，月均持有成本极低，资费透明灵活。",
      tag: "低成本养号",
    },
    {
      icon: Wifi,
      title: "支持 Wi-Fi Calling 通话",
      desc: "支持通过 WLAN 通话（Wi-Fi Calling）在国内直接免费接听与拨打美国电话、收发短信，无需昂贵漫游费。",
      tag: "Wi-Fi 通话",
    },
    {
      icon: MessageSquare,
      title: "国内免费接收短信",
      desc: "在 Wi-Fi Calling 或正常信号覆盖下，接收海内外平台 SMS 验证码完全免费、稳定可靠、秒级送达。",
      tag: "收短信免费",
    },
    {
      icon: ShieldCheck,
      title: "全美银行与 AI 深度适配",
      desc: "专为出海电商与美区业务打造，深度兼容美区银行（Chase、BOA、Capital One）、PayPal 与各类大模型平台。",
      tag: "美银全支持",
    },
    {
      icon: Smartphone,
      title: "三合一免剪卡 · 全网通适配",
      desc: "标准大卡、Micro、Nano 任意卡槽通用，适配 iPhone 及支持 Wi-Fi Calling 的主流机型，无需任何剪卡工具。",
      tag: "全网通通用",
    },
  ];

  const platformCategories = [
    {
      title: "全美顶级银行与金融机构",
      badge: "权威信誉秒过",
      icon: CreditCard,
      color: "border-sky-200 bg-sky-50/50 text-sky-800",
      items: [
        { name: "美国商业银行", desc: "Chase 摩根大通 / BOA / 花旗银行" },
        { name: "高风控数字银行", desc: "Capital One 360 / 华美 Velo 账户" },
        { name: "美区电子钱包", desc: "PayPal 美区 / Venmo / Zelle 转账" },
        { name: "跨境资产账户", desc: "Wise 美元个人与商户账户安全绑定" },
      ],
    },
    {
      title: "AI 智能生产力矩阵",
      badge: "原生极速验证",
      icon: Bot,
      color: "border-cyan-200 bg-cyan-50/50 text-cyan-800",
      items: [
        { name: "ChatGPT / OpenAI", desc: "开通与绑定美区安全手机号" },
        { name: "Claude (Anthropic)", desc: "高风控手机验证轻松秒过" },
        { name: "Google Gemini", desc: "谷歌生态全家桶高级 AI 验证" },
        { name: "xAI Grok / Midjourney", desc: "支持主流 AI 与科技生态" },
      ],
    },
    {
      title: "全球主流社交与通讯",
      badge: "解 +86 限制",
      icon: MessageSquare,
      color: "border-blue-200 bg-blue-50/50 text-blue-800",
      items: [
        { name: "Telegram", desc: "彻底解除私聊陌生人受限" },
        { name: "WhatsApp", desc: "海外电商跨国沟通必备账号" },
        { name: "TikTok (美区版)", desc: "高权重出海账号与直播带货" },
        { name: "Twitter (X) / Instagram", desc: "国际社媒矩阵高权重注册" },
      ],
    },
    {
      title: "美区海淘与数字娱乐",
      badge: "原生数字资产",
      icon: Globe,
      color: "border-emerald-200 bg-emerald-50/50 text-emerald-800",
      items: [
        { name: "美区 Apple ID", desc: "安全密保绑定与无卡验证码接收" },
        { name: "Amazon 美区站", desc: "买家与卖家安全账户绑定" },
        { name: "Steam (美区)", desc: "美区商城与跨区验证" },
        { name: "Netflix / Spotify", desc: "美区会员长期绑定与风控验证" },
      ],
    },
  ];

  const faqs = [
    {
      q: "Air Mobile 在国内如何使用？需要开启 Wi-Fi Calling 吗？",
      a: "国内使用推荐开启 Wi-Fi Calling（WLAN 通话功能）。只要在 Wi-Fi 网络下开启该功能，手机状态栏显示 Wi-Fi 运营图标，即可享受与美国本土完全一致的免费接收短信和接打电话服务，无需承担额外漫游费。",
    },
    {
      q: "Air Mobile 相比普通美国电话卡有什么优势？",
      a: "Air Mobile 最大优势是极致性价比与原生纯净度。它具备美国正规移动运营商的原生号段信誉，能秒过美区各大银行和高风控平台，同时月均持有资费远低于传统美卡，非常适合个人或工作室长期低成本持有。",
    },
    {
      q: "如何进行后续充值与保号？",
      a: "Air Mobile 支持通过官方后台或快捷充值通道进行话费与套餐续期。建议每月保持账户有充足余额以维持号码活跃状态，长期安全持有。",
    },
    {
      q: "插卡后需要注意什么以防扣费？",
      a: "在未启用 Wi-Fi Calling 之前，请务必在手机设置中关闭该卡的数据漫游与蜂窝移动数据，避免产生意外的高额漫游扣费；启用 Wi-Fi Calling 后，在 Wi-Fi 环境下使用即可高枕无忧。",
    },
  ];

  return (
    <div className="mt-6 space-y-8 text-foreground">
      {/* 顶部专属 Hero 区域 - 清爽蔚蓝科技风 */}
      <div className="relative overflow-hidden rounded-3xl border border-sky-200/90 bg-gradient-to-br from-sky-600 via-cyan-600 to-blue-700 p-6 text-white shadow-lg sm:p-8">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-cyan-200" />
              美国原生 +1 纯净号码 · 支持 Wi-Fi Calling
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400/30 px-3 py-1 text-xs font-semibold text-cyan-100 backdrop-blur-md">
              <CreditCard className="h-3.5 w-3.5 text-cyan-200" />
              超低持有成本 · 美银/AI 深度适配
            </span>
          </div>

          <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
            Air Mobile 美国原生电话卡 · 极致性价比保号神卡
          </h2>
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-sky-50/90 sm:text-base">
            正规美国移动网络原生实体卡，非虚拟 VoIP 号段。支持 Wi-Fi Calling 国内免费收发短信与通话，秒过全美大行、PayPal 与主流 AI 平台验证，低成本长期持有美国号码的首选利器。
          </p>

          <div className="mt-6 flex flex-wrap gap-4 text-xs font-medium text-sky-100 sm:text-sm">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-cyan-300" />
              美国原生 +1 号段
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-cyan-300" />
              支持 Wi-Fi Calling
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-cyan-300" />
              低月租长期持有
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-cyan-300" />
              实体卡现货速发
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 right-20 h-48 w-48 rounded-full bg-sky-400/20 blur-2xl" />
      </div>

      {/* 六大核心卖点 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {highlights.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 transition-colors group-hover:bg-sky-600 group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                  {item.tag}
                </span>
              </div>
              <h3 className="mt-3.5 text-sm font-bold text-slate-900 sm:text-base">
                {item.title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {item.desc}
              </p>
            </div>
          );
        })}
      </div>

      {/* 平台兼容矩阵 */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-sky-600">
                出海生态全面覆盖
              </span>
            </div>
            <h3 className="mt-1 text-lg font-extrabold text-slate-900 sm:text-xl">
              全美银行、出海社媒与 AI 兼容矩阵
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              美国正规移动号段（高信用评级），真实物理 SIM 卡信誉度高，秒过各类严苛风控。
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
            <Radio className="h-3.5 w-3.5 animate-pulse text-sky-600" />
            实测全生态高通过率
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {platformCategories.map((cat) => {
            const CatIcon = cat.icon;
            return (
              <div
                key={cat.title}
                className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition-all hover:bg-slate-50"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CatIcon className="h-4 w-4 text-slate-700" />
                      <h4 className="text-sm font-bold text-slate-800">{cat.title}</h4>
                    </div>
                  </div>
                  <span
                    className={`mt-2 inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium ${cat.color}`}
                  >
                    {cat.badge}
                  </span>
                  <div className="mt-3.5 space-y-2.5">
                    {cat.items.map((it) => (
                      <div key={it.name} className="text-xs">
                        <div className="font-semibold text-slate-800">{it.name}</div>
                        <div className="text-[11px] text-muted-foreground">{it.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 新手防扣费与 Wi-Fi Calling 建议 */}
      <div className="rounded-2xl border-2 border-sky-300 bg-sky-50/70 p-5 shadow-xs">
        <div className="flex items-center gap-2 text-sm font-bold text-sky-950 sm:text-base">
          <ShieldAlert className="h-5 w-5 text-sky-600 shrink-0" />
          新手插卡必看：防扣费与使用建议（重要）
        </div>
        <div className="mt-3 space-y-2 text-xs leading-relaxed text-sky-900/90 sm:text-sm">
          <p>
            1. <strong>插卡前务必关闭【蜂窝移动数据】与【数据漫游】</strong>：境外漫游数据费率昂贵，手机插卡前务必关闭数据连接，仅依托 Wi-Fi 或保持纯信号待机，即可彻底杜绝扣费。
          </p>
          <p>
            2. <strong>优先激活并使用【Wi-Fi Calling】</strong>：在具备高速 Wi-Fi 的环境下开启 Wi-Fi 通话，状态栏显示 Wi-Fi 通话图标后，收发短信和接打电话均走美国本土资费，免漫游费畅通连接。
          </p>
        </div>
      </div>

      {/* 常见问题解答 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-sky-600" />
          <h3 className="text-base font-bold text-slate-900 sm:text-lg">常见问题解答</h3>
        </div>
        <div className="mt-4 space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <div className="text-xs font-bold text-slate-900 sm:text-sm">Q: {f.q}</div>
              <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                A: {f.a}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 客服咨询条 */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 p-5 sm:flex-row sm:p-6">
        <div>
          <h4 className="text-sm font-bold text-sky-950 sm:text-base">
            需要了解更多 Air Mobile 激活指导或 Wi-Fi Calling 设置？
          </h4>
          <p className="mt-1 text-xs text-sky-800/80">
            本站为您提供全流程咨询与技术支持，保障您的境外卡片长期安全稳定持有。
          </p>
        </div>
        <button
          type="button"
          onClick={() => openPublicSupport()}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-sky-700 active:scale-95 sm:text-sm"
        >
          咨询在线客服
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
