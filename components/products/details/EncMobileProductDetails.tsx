"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Globe2,
  Lock,
  Radio,
  Server,
  ShieldCheck,
  Smartphone,
  Terminal,
  Truck,
  Wifi,
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

// 5G 频段与极客基站技术数据
const BANDS = [
  {
    band: "n41",
    freq: "2.5 GHz",
    type: "Ultra Capacity 5G",
    speed: "最高 800+ Mbps",
    desc: "T-Mobile 超级 5G 黄金频段，高带宽低延迟，极客下载与 AI 大模型高并发首选。",
    status: "ACTIVE",
  },
  {
    band: "n71",
    freq: "600 MHz",
    type: "Extended Range 5G",
    speed: "全美超广覆盖",
    desc: "全美底层超强穿透低频段，室内、地下室及偏远地区信号依然满格。",
    status: "ACTIVE",
  },
  {
    band: "Band 2/4/66",
    freq: "1.9/1.7/2.1 GHz",
    type: "LTE-Advanced 聚合",
    speed: "最高 300 Mbps",
    desc: "全美三大运营商核心 4G/LTE 载波聚合频段，全机型 100% 完美兼容。",
    status: "STANDBY",
  },
  {
    band: "Band 12",
    freq: "700 MHz",
    type: "VoLTE 核心底层",
    speed: "极强穿透",
    desc: "负责高清语音通话与短信实时接收，全天候保障验证码秒级送达。",
    status: "ACTIVE",
  },
];

// AI 与金融穿透评级
const PENETRATION_MATRIX = [
  {
    category: "AI 生产力集群",
    targets: [
      { name: "OpenAI / ChatGPT Plus", level: "A+ 极高", note: "原生 US 实体号码，免接码池黑名单" },
      { name: "Claude 3.5 Sonnet (Anthropic)", level: "A+ 极高", note: "秒破严苛风控，完美支持 API 与网页注册" },
      { name: "Google Gemini Advanced", level: "A 极高", note: "原生绑定 Google Workspace 与企业邮箱" },
      { name: "xAI Grok / Midjourney", level: "A 极高", note: "极客社区两步验证与 Discord 高权重绑定" },
    ],
  },
  {
    category: "跨境金融与商户矩阵",
    targets: [
      { name: "Bank of America (美银)", level: "A+ 原生", note: "美国本土实体号段，适配 Zelle 绑定与网银审核" },
      { name: "Chase / Citi / Wells Fargo", level: "A+ 原生", note: "三大行短信验证码 100% 畅通送达" },
      { name: "美区 Stripe / PayPal / Wise", level: "A 顶级", note: "跨境电商独立站资金结算与商户二步认证" },
      { name: "Capital One / 华美 Velo", level: "A 顶级", note: "海外信用卡申请与实体卡开卡激活" },
    ],
  },
];

export default function EncMobileProductDetails({ product }: EncMobileProductDetailsProps) {
  const [selectedBand, setSelectedBand] = useState(0);

  return (
    <div className="mt-8 w-full space-y-8 select-none">
      {/* 1. 赛博 5G 极客终端 Hero Console */}
      <section className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-[#090d16] p-6 text-white shadow-[0_20px_60px_-15px_rgba(0,255,157,0.15)] sm:p-8">
        {/* 背景扫描网格与微光 */}
        <div className="absolute inset-0 bg-[radial-gradient(#00FF9D_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-6">
          {/* 控制台顶部状态条 */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-500/20 pb-4">
            <div className="inline-flex items-center gap-2 font-mono text-xs text-emerald-400">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>TERMINAL: ENC_5G_SYS_ONLINE</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
              <span className="rounded bg-emerald-950/80 px-2 py-0.5 text-emerald-300 border border-emerald-700/40">
                5G SA/NSA DUAL
              </span>
              <span className="rounded bg-slate-800/80 px-2 py-0.5 text-slate-300 border border-slate-700">
                T-MOBILE BACKBONE
              </span>
            </div>
          </div>

          {/* 终端主标题与核心卖点 */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 font-mono text-xs font-semibold text-emerald-300">
              <Cpu className="h-3.5 w-3.5" />
              <span>NATIVE US 5G TRIPLE-CUT HARDWARE</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              Enc Mobile · 美国原生 5G 极客通讯终端
            </h1>
            <p className="max-w-2xl text-sm font-medium leading-relaxed text-slate-300">
              搭载正规美国三大运营商之首 T-Mobile 原生 5G 独立组网协议，纯血美国本土移动号段。
              专为极客架构师、出海开发者及跨境金融量身打造，彻底封堵风控拦截与虚拟号降权。
            </p>
          </div>

          {/* 极客测速仿真仪表盘 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono">
            <div className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 p-3.5 backdrop-blur-md">
              <div className="text-[11px] text-slate-400">NETWORK PROTOCOL</div>
              <div className="mt-1 text-base font-bold text-emerald-400">5G SA/NSA 双模</div>
              <div className="mt-0.5 text-[10px] text-slate-500">独立低延迟骨干网</div>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 p-3.5 backdrop-blur-md">
              <div className="text-[11px] text-slate-400">CARRIER IDENTITY</div>
              <div className="mt-1 text-base font-bold text-white">美国本土原生卡</div>
              <div className="mt-0.5 text-[10px] text-slate-500">Non-VoIP 纯实体属性</div>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 p-3.5 backdrop-blur-md">
              <div className="text-[11px] text-slate-400">DOWNLINK BANDWIDTH</div>
              <div className="mt-1 text-base font-bold text-cyan-400">800+ Mbps</div>
              <div className="mt-0.5 text-[10px] text-slate-500">极速大模型并发加载</div>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 p-3.5 backdrop-blur-md">
              <div className="text-[11px] text-slate-400">ZERO ROAMING FEE</div>
              <div className="mt-1 text-base font-bold text-emerald-400">WiFi Calling</div>
              <div className="mt-0.5 text-[10px] text-slate-500">国内宽带直连免漫游</div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 5G 实时基站信号与频段拓扑控制台 */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-emerald-600">
            <Radio className="h-4 w-4" />
            <span>BASE_STATION_TOPOLOGY // 5G 基站多频段矩阵</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            全美三大运营商核心频段 · 硬件级原生漫游
          </h2>
          <p className="text-sm text-slate-500">
            国内完美漫游中国移动 / 中国联通基站网络，海外直连 T-Mobile 5G 极速蜂窝。
          </p>
        </div>

        {/* 频段切换 Tab */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BANDS.map((item, idx) => (
            <button
              key={item.band}
              type="button"
              onClick={() => setSelectedBand(idx)}
              className={`flex flex-col items-start rounded-2xl p-4 text-left transition-all font-mono ${
                selectedBand === idx
                  ? "border-2 border-emerald-500 bg-emerald-50/80 shadow-xs"
                  : "border border-slate-200 bg-slate-50/60 hover:bg-slate-100"
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-black text-slate-900">{item.band}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  selectedBand === idx ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600"
                }`}>
                  {item.status}
                </span>
              </div>
              <div className="mt-2 text-xs font-medium text-slate-500">{item.freq}</div>
              <div className="mt-0.5 text-[11px] font-bold text-emerald-600">{item.type}</div>
            </button>
          ))}
        </div>

        {/* 当前选中频段详情板 */}
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/70 via-slate-50 to-white p-5 font-mono">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 pb-3">
            <div className="text-xs font-bold text-slate-700">
              ACTIVE_PROFILE: <span className="text-emerald-600 font-black">{BANDS[selectedBand].band}</span> ({BANDS[selectedBand].freq})
            </div>
            <div className="text-xs font-semibold text-emerald-600">
              峰值速率: {BANDS[selectedBand].speed}
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-600 font-sans">
            {BANDS[selectedBand].desc}
          </p>
        </div>
      </section>

      {/* 3. 极客硬件与网络协议参数矩阵 (Terminal Specs Matrix) */}
      <section className="rounded-3xl border border-slate-800 bg-[#0d131f] p-6 text-white shadow-lg sm:p-8 font-mono">
        <div className="mb-6 flex items-center justify-between border-b border-slate-700/60 pb-4">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">
              HARDWARE & PROTOCOL SPECS // 终端硬件与协议规范
            </h2>
          </div>
          <div className="text-[11px] text-slate-400 hidden sm:block">
            REV_2026.04 // PASS
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 text-xs">
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
            <span className="text-slate-400">[SIM_CHIP_FORM]</span>
            <span className="font-bold text-emerald-400">原生三合一免剪卡 (Nano/Micro/Standard)</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
            <span className="text-slate-400">[CARRIER_ID]</span>
            <span className="font-bold text-white">T-Mobile USA (310-260) 原生号段</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
            <span className="text-slate-400">[WIFI_CALLING]</span>
            <span className="font-bold text-emerald-400">原生内建支持 (走宽带0漫游通话短信)</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
            <span className="text-slate-400">[APN_GATEWAY]</span>
            <span className="font-bold text-white">fast.t-mobile.com (自动下发)</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
            <span className="text-slate-400">[ENCRYPTION]</span>
            <span className="font-bold text-cyan-400">原生硬件级 A5/3 芯片标准加密</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
            <span className="text-slate-400">[VOIP_ATTRIBUTE]</span>
            <span className="font-bold text-emerald-400">FALSE (100% 真实移动蜂窝卡)</span>
          </div>
        </div>
      </section>

      {/* 4. AI 与跨境金融高穿透雷达 */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-emerald-600">
            <ShieldCheck className="h-4 w-4" />
            <span>PENETRATION_RADAR // 顶流生态穿透雷达</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            广泛适配 OpenAI、Claude 与全美主流银行风控
          </h2>
          <p className="text-sm text-slate-500">
            绝非随时可能失效的接码平台，真实物理实体卡，支持终身绑定与两步安全验证。
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {PENETRATION_MATRIX.map((group) => (
            <div
              key={group.category}
              className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5"
            >
              <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-2.5">
                <span className="font-bold text-slate-900">{group.category}</span>
                <span className="font-mono text-xs font-semibold text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded">
                  PASSED 100%
                </span>
              </div>
              <div className="space-y-3">
                {group.targets.map((tgt) => (
                  <div
                    key={tgt.name}
                    className="flex flex-col gap-1 rounded-xl bg-white p-3 shadow-2xs border border-slate-100"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">{tgt.name}</span>
                      <span className="font-mono text-[11px] font-bold text-emerald-600">
                        {tgt.level}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">{tgt.note}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. 实体物流发货与极客包装保障 */}
      <section className="rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950 via-slate-900 to-black p-6 text-white sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 font-mono text-xs text-emerald-400">
              <Truck className="h-4 w-4" />
              <span>HARDWARE_DISPATCH // 实体硬件极速交付</span>
            </div>
            <h3 className="text-2xl font-black text-white">
              默认包邮发货（加急顺丰可联系客服）
            </h3>
            <p className="max-w-xl text-xs font-medium leading-relaxed text-slate-300">
              本商品为正品全新实体卡，采用加厚防折硬盒与专业防静电袋封装。
              下单后系统自动分配快递物流单号，请在右侧准确填写收货地址、姓名与联系电话。
            </p>
          </div>
          <button
            type="button"
            onClick={openPublicSupport}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/25 transition-all hover:scale-[1.02] hover:bg-emerald-400 active:scale-[0.98]"
          >
            联系专属在线客服
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
