"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  Cpu,
  CreditCard,
  DollarSign,
  Globe,
  HelpCircle,
  MessageSquare,
  Plane,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
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
  const paygoFeatures = [
    {
      title: "极致低月租",
      value: "$3.5 / 月",
      desc: "约合人民币 ¥25/月，全美资费门槛最低的原生保号方案之一",
      highlight: true,
      color: "border-sky-200 bg-sky-50 text-sky-800",
    },
    {
      title: "国内接收短信",
      value: "免费包含",
      desc: "在 Wi-Fi Calling 环境下待机接收各类验证码，不扣除额外账户费用",
      highlight: false,
      color: "border-emerald-200 bg-emerald-50 text-emerald-800",
    },
    {
      title: "号码归属地",
      value: "美国原生 +1",
      desc: "非 VoIP 虚拟号（Google Voice 等），最高银行与跨境电商信誉权重",
      highlight: false,
      color: "border-blue-200 bg-blue-50 text-blue-800",
    },
    {
      title: "合约绑定限制",
      value: "0 合约 随用随充",
      desc: "无后付费强制捆绑协议，充值即可使用，随时根据需要调整方案",
      highlight: false,
      color: "border-slate-200 bg-slate-50 text-slate-800",
    },
  ];

  const bankAiMatrix = [
    { name: "Chase 摩根大通", type: "美银大行", status: "完美过验", note: "开户与大额交易二次 SMS 验证畅通" },
    { name: "Bank of America (BOA)", type: "美银大行", status: "完美过验", note: "网银风控手机验证即时送达" },
    { name: "Capital One 360", type: "优质美卡", status: "完美过验", note: "秒过各类高难度预筛与安全核验" },
    { name: "美区 PayPal (个人/商户)", type: "跨境支付", status: "原生支持", note: "绑定国际钱包无任何虚拟号拦截" },
    { name: "OpenAI / ChatGPT Plus", type: "AI 大模型", status: "秒过验证", note: "支持绑卡消费与账号安全验证" },
    { name: "Claude / Anthropic", type: "AI 大模型", status: "秒过验证", note: "高风控手机验证秒级畅通接收" },
  ];

  const wifiCallingTips = [
    {
      step: "01",
      title: "手机开启【Wi-Fi 通话 (Wi-Fi Calling)】",
      desc: "在 iPhone 或支持的安卓手机设置中，找到「蜂窝网络」并打开「Wi-Fi 通话」开关。",
    },
    {
      step: "02",
      title: "关闭【数据漫游】防流量偷跑",
      desc: "若不需要在大陆直接使用漫游移动流量，请务必关闭卡片的蜂窝数据漫游，避免产生高额漫游流量账单。",
    },
    {
      step: "03",
      title: "屏幕状态栏显示验证",
      desc: "成功连上 Wi-Fi Calling 后，手机左上角或控制中心网络名会显示专属 Wi-Fi 标识，此时接打电话收短信均等同于在美国本土。",
    },
  ];

  const faqs = [
    {
      q: "Air Mobile 相比 Ultra Mobile PayGo 有什么区别？",
      a: "两者的核心目标都是为国内用户提供低成本美国原生号码。Ultra Mobile PayGo 为 $3/月，而 Air Mobile 的方案为 $3.5/月左右，二者均为纯正美国实体物理号，享有同等的全美顶级银行与海外平台信誉度，是长期稳定持有美国号码的极佳选择。",
    },
    {
      q: "如果手机不支持 Wi-Fi Calling 还能用吗？",
      a: "如果手机不支持 Wi-Fi Calling，卡片将直接通过中国移动/联通的地面漫游基站待机。需要注意的是，在地面漫游基站下，部分运营商对接收短信可能会按漫游短信收费，因此强烈推荐使用支持 Wi-Fi Calling 的苹果或主流海外版安卓手机。",
    },
    {
      q: "充值方便吗？支持国内支付方式吗？",
      a: "支持通过官网绑卡充值，也可直接联系本站客服代充值话费，随时随地保持账户余额充足。",
    },
  ];

  return (
    <div className="mt-8 space-y-8">
      {/* 1. 蔚蓝极客 Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl sm:p-8">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-200">
              <Sparkles className="h-3.5 w-3.5 text-sky-400" />
              美国原生 +1 纯净实体号段
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/20 px-3 py-1 text-xs font-medium text-indigo-200">
              <DollarSign className="h-3.5 w-3.5" />
              $3.5/月 极致轻量保号
            </span>
          </div>

          <h2 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
            Air Mobile 美国原生电话卡 · 低月租长期保号
          </h2>

          <p className="text-sm leading-relaxed text-sky-100/90 sm:text-base">
            专为出海开发者、跨境电商与数字游民设计的轻量级美卡方案。支持 Wi-Fi Calling 国内待机，全美顶级银行与主流 AI 大模型高通过率保障。
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-sky-200/90">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>非虚拟 VoIP 真实物理 SIM</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>国内免费接收各类验证码</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Wi-Fi Calling 本土通话待机</span>
            </div>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 right-20 h-48 w-48 rounded-full bg-indigo-500/15 blur-2xl" />
      </div>

      {/* 2. 差异化独家模块: $3.5/月低月租极简保号罗盘 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-sky-600" />
            <h3 className="text-lg font-bold text-slate-900">$3.5/月 极简 PayGo 资费架构</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">超低持有开销，把每个月的保号成本压缩到极致</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {paygoFeatures.map((feat, i) => (
            <div key={i} className={`flex flex-col justify-between rounded-xl border p-4 transition-all hover:shadow-sm ${feat.color}`}>
              <div>
                <span className="text-xs font-semibold">{feat.title}</span>
                <div className="mt-2 text-xl font-black">{feat.value}</div>
                <p className="mt-1.5 text-xs leading-relaxed opacity-85">{feat.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. 美区顶级银行与 AI 实测通过全景图 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h3 className="text-lg font-bold text-slate-900">美区各大银行与核心平台实测过验表现</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">实体纯净号段，拒绝虚拟号风控惩罚</p>
          </div>
          <span className="inline-flex w-fit items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            实测 100% 畅通通过
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bankAiMatrix.map((item, idx) => (
            <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">{item.name}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  {item.status}
                </span>
              </div>
              <div className="mt-1 text-[11px] font-medium text-sky-700">{item.type}</div>
              <p className="mt-2 text-xs text-slate-500">{item.note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 4. 国内 Wi-Fi Calling 避坑防偷跑扣费指引 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-indigo-600" />
            <h3 className="text-lg font-bold text-slate-900">国内 Wi-Fi Calling 科学使用与防扣费指南</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">按照三步流程规范设置，让您的美卡在国内始终享受本土零漫游费待遇</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {wifiCallingTips.map((tip, idx) => (
            <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/70 p-5">
              <span className="text-2xl font-black text-sky-600/30">{tip.step}</span>
              <h4 className="mt-2 text-sm font-bold text-slate-900">{tip.title}</h4>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{tip.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 5. 常见问答 FAQ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-slate-700" />
          <h3 className="text-lg font-bold text-slate-900">Air Mobile 常见问题解答</h3>
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

      {/* 6. 底部技术客服卡片 */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-slate-50 to-indigo-50 p-6 sm:flex-row">
        <div>
          <h4 className="text-base font-bold text-slate-900">需要 Air Mobile 激活协助或 Wi-Fi Calling 调试？</h4>
          <p className="mt-1 text-xs text-slate-600">本站提供详尽的图文与视频技术支持，确保您的美卡国内顺畅通达。</p>
        </div>
        <button
          type="button"
          onClick={() => openPublicSupport()}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition-colors"
        >
          <MessageSquare className="h-4 w-4" />
          联系在线技术客服
        </button>
      </div>
    </div>
  );
}
