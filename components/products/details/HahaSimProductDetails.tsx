"use client";

import Link from "next/link";
import {
  ArrowRight,
  BatteryCharging,
  Calendar,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  Flame,
  Globe,
  HelpCircle,
  MessageSquare,
  Plane,
  QrCode,
  Radio,
  Repeat,
  ShieldCheck,
  Smartphone,
  Sparkles,
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
  const timelineSteps = [
    {
      title: "到手激活开卡",
      badge: "DAY 1",
      desc: "在 Haha Travel APP 完成实名登记并插卡，卡片正式激活，自带初始 365 天超长有效期。",
    },
    {
      title: "国内 0 月租待机",
      badge: "DAY 1 ~ 360",
      desc: "无任何月租与待机最低消费，国内漫游接收短信全部免费，随时随地接收海外应用验证码。",
    },
    {
      title: "每年 HK$10 续命",
      badge: "DAY 360+",
      desc: "在到期日前，在 APP 内任意订购一次 HK$10 最低流量包或账户充值，有效期立即再延长 365 天！",
    },
    {
      title: "实现终身低成本持有",
      badge: "长久有效",
      desc: "循环每年仅需 10 港币（折合约 9 元人民币），即可长期保住珍贵的香港物理原生号码。",
    },
  ];

  const travelPackages = [
    { region: "中国大陆 & 澳门", tariff: "低至 HK$10 / 日", desc: "多天共享数据，出差往返或备用高速流量", hot: true },
    { region: "日本 / 韩国 / 台湾", tariff: "低至 HK$15 / 日", desc: "出境旅行插卡即用，原生高速 4G/5G 本地网", hot: true },
    { region: "新马泰 / 东南亚", tariff: "低至 HK$12 / 日", desc: "覆盖主流海岛与旅游国家，即买即生效", hot: false },
    { region: "欧洲 / 英国 / 北美", tariff: "低至 HK$25 / 日", desc: "欧美主流国家漫游支持，商务跨国无忧", hot: false },
  ];

  const appGuides = [
    {
      step: "01",
      title: "下载 Haha Travel APP",
      desc: "苹果 App Store 或各大安卓应用商店搜索「Haha Travel」官方应用并安装。",
    },
    {
      step: "02",
      title: "扫描卡身二维码实名绑定",
      desc: "打开 APP 扫描实体卡条形码，按香港政府要求使用港澳通行证或中国护照完成在线实名。",
    },
    {
      step: "03",
      title: "随时查余额与买流量",
      desc: "APP 内可直观查看剩余天数、当前余额，并支持直接使用信用卡或支付宝/微信充值。",
    },
  ];

  const faqs = [
    {
      q: "Haha SIM 为什么要每年充值 10 港币？",
      a: "Haha SIM 是香港丰泽（Fortress）联合 3 旗下推出的漫游神卡，本身无月租、无待机费。香港电讯规则要求号码每年需至少有一次活跃消费记录才能继续保留号码。您只需每年在 APP 里花 10 港币买一个一日包或充值 10 港币，就能自动顺延 365 天有效期，是目前全网公认成本最低的保号卡之一。",
    },
    {
      q: "在国内可以接收哪些软件的验证码？",
      a: "Haha SIM 是香港原生实体卡，非虚拟号段，信誉度极高。实测秒过 Telegram、WhatsApp、TikTok、X (Twitter)、Instagram、OpenAI/ChatGPT、Claude 以及各大香港券商银行。",
    },
    {
      q: "不需要流量的时候会偷跑扣费吗？",
      a: "绝对不会。Haha SIM 的数据流量是「先购买套餐包才产生流量」的机制，如果没有在 APP 中购买流量包，即使开启数据也不会扣除余额，国内接收短信完全免费，放进备用机待机极度安心。",
    },
  ];

  return (
    <div className="mt-8 space-y-8">
      {/* 1. 赛博黄黑丰泽风格 Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-zinc-950 via-slate-900 to-amber-950 p-6 text-white shadow-xl sm:p-8">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-3 py-1 text-xs font-semibold text-yellow-300">
              <Sparkles className="h-3.5 w-3.5 text-yellow-400" />
              香港丰泽 Fortress 官方出品
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">
              <Repeat className="h-3.5 w-3.5" />
              每年仅需 HK$10 续命 365 天
            </span>
          </div>

          <h2 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
            Haha SIM 香港原生卡 · 终身 0 月租接码旅游神卡
          </h2>

          <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
            零月租、零维护门槛。国内漫游免费接收海内外验证码；支持全球 70+ 国家高速漫游上网，出差旅游直接化身漫游卡！
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-yellow-200/90">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-yellow-400" />
              <span>国内漫游免月租</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-yellow-400" />
              <span>接收短信完全免费</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-yellow-400" />
              <span>Haha Travel 专属 APP 管理</span>
            </div>
          </div>
        </div>

        {/* Decorative background visual */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full bg-yellow-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 right-20 h-48 w-48 rounded-full bg-amber-500/10 blur-2xl" />
      </div>

      {/* 2. 差异化独家模块: 每年 HK$10 续命时间轴 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <BatteryCharging className="h-5 w-5 text-yellow-600" />
            <h3 className="text-lg font-bold text-slate-900">终身 0 月租 · 每年 HK$10 续命运转机制</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">超低持有开销，每年仅需花费约 9 元人民币即可让号码永久可用</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {timelineSteps.map((step, idx) => (
            <div key={idx} className="relative rounded-xl border border-yellow-100 bg-gradient-to-b from-yellow-50/50 to-white p-4">
              <span className="inline-block rounded-md bg-yellow-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                {step.badge}
              </span>
              <h4 className="mt-2 text-sm font-bold text-slate-900">{step.title}</h4>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 3. 全球 70+ 国漫游数据加购包 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Plane className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-bold text-slate-900">全球 70+ 国家漫游流量（即买即用）</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">不仅是接码保号卡，更是出国自由行、商务出差的随身 Wi-Fi 替代品</p>
          </div>
          <span className="inline-flex w-fit items-center rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            覆盖全球主流目的地
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {travelPackages.map((pkg, i) => (
            <div key={i} className="flex flex-col justify-between rounded-xl border border-slate-200 p-4 transition-all hover:border-yellow-400 hover:shadow-sm">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">{pkg.region}</span>
                  {pkg.hot && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                      热门
                    </span>
                  )}
                </div>
                <div className="mt-2 text-base font-bold text-yellow-600">{pkg.tariff}</div>
                <p className="mt-1.5 text-xs text-slate-500">{pkg.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Haha Travel 官方 APP 全流程指引 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-emerald-600" />
            <h3 className="text-lg font-bold text-slate-900">Haha Travel 官方应用实操步骤</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">全部业务在线办理，清晰透明，无繁琐人工手续</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {appGuides.map((g, idx) => (
            <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/70 p-5">
              <span className="text-2xl font-black text-amber-500/30">{g.step}</span>
              <h4 className="mt-2 text-sm font-bold text-slate-900">{g.title}</h4>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{g.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 5. 常见问答 FAQ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-slate-700" />
          <h3 className="text-lg font-bold text-slate-900">Haha SIM 常见问题解答</h3>
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

      {/* 6. 底部客服支持卡片 */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-yellow-200 bg-gradient-to-r from-yellow-50 via-amber-50 to-orange-50 p-6 sm:flex-row">
        <div>
          <h4 className="text-base font-bold text-slate-900">需要 Haha SIM 实名协助或到手指导？</h4>
          <p className="mt-1 text-xs text-slate-600">本站提供全流程一对一技术协助，保障您顺利完成开卡与充值顺延。</p>
        </div>
        <button
          type="button"
          onClick={() => openPublicSupport()}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-yellow-400 shadow-sm hover:bg-slate-800 transition-colors"
        >
          <MessageSquare className="h-4 w-4" />
          联系在线技术客服
        </button>
      </div>
    </div>
  );
}
