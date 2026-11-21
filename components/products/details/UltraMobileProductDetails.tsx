"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  DollarSign,
  Globe,
  HelpCircle,
  MessageSquare,
  PhoneCall,
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
  const [activeTab, setActiveTab] = useState<"finance" | "ai" | "social" | "ecommerce">("finance");

  const tabContent = {
    finance: {
      title: "美区银行、证券与跨境金融矩阵",
      badge: "秒过美银风控",
      desc: "正规美国三大运营商之一 T-Mobile 原生号段，绝非 VoIP 虚拟号，秒过全美各大银行审核。",
      platforms: [
        { name: "Bank of America (美银)", tag: "高风控秒过", desc: "美国本土开户、Zelle 绑卡与日常收验证码" },
        { name: "Chase / Citi / Wells Fargo", tag: "全美通用", desc: "美国顶级主流商业银行短信验证无障碍" },
        { name: "Capital One / 华美 Velo", tag: "海淘常备", desc: "高性价比线上账户与信用卡申请验证" },
        { name: "美区 PayPal / Stripe / Wise", tag: "商户必备", desc: "跨境电商独立站资金流转与商户验证" },
      ],
    },
    ai: {
      title: "全球顶流 AI 智能生产力矩阵",
      badge: "最高权重验证",
      desc: "支持最新 OpenAI、Claude、Gemini 高风控注册与手机号码绑定。",
      platforms: [
        { name: "ChatGPT / OpenAI", tag: "支持 Plus", desc: "全模型订阅与账号手机双重认证" },
        { name: "Claude (Anthropic)", tag: "严苛风控秒过", desc: "解决普通接码平台被拒绝或封号问题" },
        { name: "Google Gemini", tag: "谷歌生态", desc: "Google 账号及高级 AI 会员验证" },
        { name: "xAI Grok / Midjourney", tag: "极客首选", desc: "支持海外最新生成式大模型全生态" },
      ],
    },
    social: {
      title: "海外主流社交与即时通讯",
      badge: "解 +86 限制",
      desc: "采用美国原生手机号注册，大幅降低封号概率，私信无限制。",
      platforms: [
        { name: "Telegram", tag: "解除私聊限制", desc: "+1 号码自动解除 +86 无法私聊陌生人限制" },
        { name: "WhatsApp", tag: "出海商务", desc: "外贸及海外客户日常沟通必备工具" },
        { name: "TikTok (美区版)", tag: "出海达人", desc: "美区短视频、带货橱窗与达人账号运营" },
        { name: "Twitter (X) / Instagram", tag: "社媒防封", desc: "高权重社媒账号注册与两步动态验证" },
      ],
    },
    ecommerce: {
      title: "海淘商铺与全球数字娱乐",
      badge: "畅享海外服务",
      desc: "畅通无阻绑定各大海外购物商城与流媒体平台。",
      platforms: [
        { name: "海外 Apple ID", tag: "免绑外卡", desc: "美区 Apple ID 安全绑定，接收二次验证码" },
        { name: "Amazon (美国站)", tag: "买卖家必备", desc: "亚马逊买家账户及卖家中心安全验证" },
        { name: "eBay / Mercari 美区", tag: "海淘拍卖", desc: "美区拍卖与二手交易买卖账号绑定" },
        { name: "Netflix / Spotify", tag: "流媒体会员", desc: "正规美区影音会员账户认证与通知接收" },
      ],
    },
  };

  const specs = [
    ["商品规格", "Ultra Mobile PayGo 官方原生实体三合一 SIM 卡（T-Mobile 旗下网络）"],
    ["套餐月租", "每月仅需 $3 美元（包含 100 分钟通话 + 100 条短信额度，用完按需充值）"],
    ["WiFi Calling", "国内开通 WiFi Calling 后通话短信直接走家庭宽带，完全免除国际漫游费"],
    ["交付方式", "妥善防静电防折弯保护包装，默认包邮直达（如需顺丰加急请联系客服）"],
    ["号码格式", "美国本土原生手机号码段（+1 xxx xxx xxxx，正规真实运营商属性）"],
  ];

  return (
    <div className="mt-8 w-full space-y-6">
      {/* 现代高奢 Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-purple-300/30 bg-gradient-to-br from-[#1a0f2e] via-[#24123a] to-slate-900 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-purple-600/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-pink-600/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/40 bg-purple-500/20 px-3 py-1 text-xs font-bold text-purple-200 backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-pink-300" />
              <span>全美三大运营商 T-Mobile 官方原生网络</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>免美国 SSN 本地认证 · 保护隐私</span>
            </span>
          </div>

          <div>
            <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              Ultra Mobile PayGo 实体卡 · 美区金融与出海王牌
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-purple-100/80 sm:text-sm">
              专为美区银行、顶级券商、PayPal、Stripe 及出海 AI 打造的真实物理卡！纯净 +1 原生号段，支持 WiFi Calling 黑科技走宽带免漫游费，每月仅 $3 极低成本持有。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-200">
            <span className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 border border-white/10">
              <Truck className="h-3.5 w-3.5 text-pink-400" />
              <span>默认包邮发货（加急顺丰可联系客服）</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 border border-white/10">
              <DollarSign className="h-3.5 w-3.5 text-amber-300" />
              <span>经典 $3/月 PayGo 套餐 · 余额长效留存</span>
            </span>
          </div>
        </div>
      </section>

      {/* Bento Grid 大卡视觉流（苹果杂志风错落布局） */}
      <section className="grid gap-4 lg:grid-cols-12">
        {/* 左侧跨行大卡：原生 +1 实体运营商号段 */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-purple-200/80 bg-gradient-to-b from-purple-50/60 via-white to-white p-6 shadow-sm lg:col-span-7">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-800">
                美国原生物理 SIM 卡
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <Radio className="h-3.5 w-3.5 animate-pulse" />
                正规真实运营商号段
              </span>
            </div>

            <h3 className="text-lg font-black text-slate-900 sm:text-xl">
              彻底告别 VoIP 虚拟号秒封 · 稳立美区顶级风控
            </h3>
            <p className="text-xs leading-relaxed text-slate-600 sm:text-sm">
              全美银行（Chase、Bank of America、Capital One）以及海外大模型对 Google Voice、TextNow 等虚拟号执行秒级拦截。Ultra Mobile 为 T-Mobile 官方物理号段，具备最高等级信用权重。
            </p>

            {/* 拟真手机状态组件 */}
            <div className="mt-4 rounded-2xl border border-purple-100 bg-slate-900 p-4 text-white shadow-inner">
              <div className="flex items-center justify-between border-b border-white/10 pb-2 text-[11px] text-slate-400">
                <span>SIM 状态指示</span>
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Wifi className="h-3 w-3" />
                  <span>Ultra Wi-Fi Calling 在线</span>
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">运营商归属</div>
                  <div className="text-sm font-bold text-white">T-Mobile USA (+1)</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">国内漫游资费</div>
                  <div className="text-sm font-bold text-emerald-400">0 漫游费（走宽带）</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧两块 Bento 横卡 */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          {/* 右上横卡：经典 PayGo $3/月资费 */}
          <div className="rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50/50 via-white to-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                资费极简透明
              </span>
              <span className="text-base font-extrabold text-amber-700">$3 / 月</span>
            </div>
            <h4 className="mt-2 text-sm font-bold text-slate-900">经典 PayGo $3 / 月神级套餐</h4>
            <div className="mt-3 space-y-2 text-xs">
              <div>
                <div className="flex justify-between text-slate-600">
                  <span>每月通话额度</span>
                  <span className="font-bold text-slate-900">100 分钟</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-amber-100">
                  <div className="h-1.5 w-full rounded-full bg-amber-500" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-slate-600">
                  <span>每月短信额度</span>
                  <span className="font-bold text-slate-900">100 条短信</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-amber-100">
                  <div className="h-1.5 w-full rounded-full bg-amber-500" />
                </div>
              </div>
            </div>
          </div>

          {/* 右下横卡：家庭宽带 WiFi Calling 黑科技 */}
          <div className="rounded-3xl border border-sky-200/80 bg-gradient-to-br from-sky-50/50 via-white to-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sky-800">
              <Wifi className="h-4 w-4" />
              <span className="text-xs font-bold">WiFi Calling 黑科技</span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-slate-900">国内连 WiFi 即可免国际漫游费</h4>
            <p className="mt-1.5 text-xs leading-5 text-slate-600">
              在手机设置中开通 WiFi Calling 后，通话与短信直接通过家庭宽带传输，如同身在美国本土，完全不产生任何高昂漫游扣费。
            </p>
          </div>
        </div>
      </section>

      {/* 交互式场景切换器（Interactive Pill Tabs · 告别生硬的 4 列小方块堆叠） */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
              <Zap className="h-5 w-5 text-purple-600" />
              全场景海外应用与出海生态兼容矩阵
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              点击下方分类标签，查看对应平台的实测风控建议与适用详情
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
            <Radio className="h-3.5 w-3.5 animate-pulse text-purple-600" />
            实测全生态高通过率
          </span>
        </div>

        {/* 交互切换标签栏 */}
        <div className="mt-5 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
          {[
            { id: "finance", label: "美区银行与金融", icon: CreditCard },
            { id: "ai", label: "顶流 AI 生产力", icon: Bot },
            { id: "social", label: "全球主流社交通讯", icon: MessageSquare },
            { id: "ecommerce", label: "海淘与出海电商", icon: Globe },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition sm:text-sm ${
                  active
                    ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* 动态内容展示面板 */}
        <div className="mt-4 rounded-2xl bg-purple-50/30 p-5 border border-purple-100/60">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-100/60 pb-3">
            <div className="font-bold text-slate-900 text-sm sm:text-base">
              {tabContent[activeTab].title}
            </div>
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-800">
              {tabContent[activeTab].badge}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-600 sm:text-sm">{tabContent[activeTab].desc}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tabContent[activeTab].platforms.map((p) => (
              <div key={p.name} className="rounded-xl border border-white bg-white/90 p-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">{p.name}</span>
                  <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 shrink-0">
                    {p.tag}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 两栏式交付说明与新手插卡避坑法则 */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* 左栏：商品交付规格 */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
            <ShieldCheck className="h-5 w-5 text-purple-600" />
            商品交付规格与核心参数
          </h3>
          <div className="mt-4 space-y-2.5">
            {specs.map(([label, text]) => (
              <div
                key={String(label)}
                className="flex flex-col rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-2 text-xs"
              >
                <span className="shrink-0 font-bold text-slate-900 sm:w-24">{label}：</span>
                <span className="text-slate-600">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 右栏：新手插卡必看安全法则 */}
        <div className="flex flex-col justify-between rounded-3xl border border-red-200 bg-red-50/70 p-5 shadow-sm sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-base font-bold text-red-900">
              <ShieldAlert className="h-5 w-5 text-red-600" />
              新手插卡必看：两大防扣费重要警示
            </div>
            <div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-700">
              <div className="rounded-xl border border-red-200/70 bg-white/90 p-3.5">
                <strong className="text-red-700">1. 插卡前务必保持【关闭数据漫游】：</strong>
                国内接收验证码完全不需要开流量！在手机蜂窝网络设置中务必关闭数据漫游，防止后台 App 偷跑国际漫游流量产生扣费。
              </div>
              <div className="rounded-xl border border-red-200/70 bg-white/90 p-3.5">
                <strong className="text-red-700">2. 优先配置开通【WiFi Calling】：</strong>
                在支持的手机上开启 Wi-Fi 通话功能后，状态栏显示「Ultra Wi-Fi」时，通话和短信直接免费走宽带，每月 100 分钟通话和 100 条短信免费使用！
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-red-200/60 text-[11px] text-red-800">
            提示：收到卡后附带详细开通指引，有任何疑问可随时联系在线客服全流程协助。
          </div>
        </div>
      </section>

      {/* 底部客服咨询条（文案规范，不给店主揽美银开户代办的包袱） */}
      <div className="flex flex-col gap-4 rounded-2xl border border-purple-200/90 bg-gradient-to-r from-purple-50 via-pink-50 to-purple-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1">
          <div className="text-sm font-bold text-slate-950 sm:text-base">
            需要了解更多 Ultra Mobile 激活指导、WiFi Calling 设置或跨境验证技巧？
          </div>
          <p className="text-xs text-slate-600 sm:text-sm">
            本站为您提供全流程卡片激活指导与售后支持，保障您的境外卡片长期安全稳定持有。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openPublicSupport}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-purple-700 sm:text-sm"
          >
            <span>联系在线客服确认</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
