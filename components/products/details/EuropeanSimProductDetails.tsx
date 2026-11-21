"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Compass,
  Globe2,
  Luggage,
  MapPin,
  Navigation,
  PhoneCall,
  Plane,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Ticket,
  Train,
  Truck,
  Wifi,
  Zap,
} from "lucide-react";
import { openPublicSupport } from "@/lib/support/open-public-support";

interface EuropeanSimProductDetailsProps {
  product: {
    id?: string;
    slug?: string | null;
    name: string;
    price?: number | null;
    original_price?: number | null;
    [key: string]: any;
  };
}

interface CountryInfo {
  name: string;
  flag: string;
  region: "west" | "south" | "central" | "north";
  carriers: string;
}

const COUNTRIES: CountryInfo[] = [
  { name: "法国", flag: "🇫🇷", region: "west", carriers: "Orange / SFR 5G" },
  { name: "德国", flag: "🇩🇪", region: "central", carriers: "Deutsche Telekom / Vodafone" },
  { name: "意大利", flag: "🇮🇹", region: "south", carriers: "TIM / Vodafone Italia" },
  { name: "西班牙", flag: "🇪🇸", region: "south", carriers: "Vodafone ES / Movistar" },
  { name: "英国", flag: "🇬🇧", region: "west", carriers: "Vodafone UK / O2" },
  { name: "瑞士", flag: "🇨🇭", region: "central", carriers: "Swisscom / Sunrise" },
  { name: "荷兰", flag: "🇳🇱", region: "west", carriers: "KPN / Vodafone NL" },
  { name: "比利时", flag: "🇧🇪", region: "west", carriers: "Proximus / Orange BE" },
  { name: "奥地利", flag: "🇦🇹", region: "central", carriers: "A1 Telekom / Magenta" },
  { name: "葡萄牙", flag: "🇵🇹", region: "south", carriers: "MEO / Vodafone PT" },
  { name: "希腊", flag: "🇬🇷", region: "south", carriers: "Cosmote / Vodafone GR" },
  { name: "捷克", flag: "🇨🇿", region: "central", carriers: "T-Mobile CZ / O2" },
  { name: "匈牙利", flag: "🇭🇺", region: "central", carriers: "Magyar Telekom / Yettel" },
  { name: "瑞典", flag: "🇸🇪", region: "north", carriers: "Telia / Tele2 5G" },
  { name: "挪威", flag: "🇳🇴", region: "north", carriers: "Telenor / Telia Norge" },
  { name: "丹麦", flag: "🇩🇰", region: "north", carriers: "TDC / 3 Denmark" },
  { name: "芬兰", flag: "🇫🇮", region: "north", carriers: "Elisa / DNA 5G" },
  { name: "爱尔兰", flag: "🇮🇪", region: "west", carriers: "Vodafone IE / Eir" },
  { name: "冰岛", flag: "🇮🇸", region: "north", carriers: "Siminn / Vodafone IS" },
  { name: "波兰", flag: "🇵🇱", region: "central", carriers: "Orange Polska / Play" },
];

export default function EuropeanSimProductDetails({ product }: EuropeanSimProductDetailsProps) {
  const [selectedRegion, setSelectedRegion] = useState<"all" | "west" | "south" | "central" | "north">("all");

  const filteredCountries = selectedRegion === "all"
    ? COUNTRIES
    : COUNTRIES.filter((c) => c.region === selectedRegion);

  return (
    <div className="mt-8 w-full space-y-8 select-none">
      {/* 1. 皇家欧蓝头等舱登机通票式 Hero Card (Euro Travel Boarding Pass) */}
      <section className="relative overflow-hidden rounded-3xl border border-blue-400/30 bg-[#0c1838] p-6 text-white shadow-2xl sm:p-8">
        {/* 背景星轨与微光 */}
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-6">
          {/* 通票抬头与登机编号 */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-blue-400/20 pb-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/60 bg-amber-500/10 px-3.5 py-1 text-xs font-bold text-amber-300">
              <Plane className="h-3.5 w-3.5" />
              <span>EUROPEAN PASS // 欧洲联盟 30+ 国通用通票</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs text-blue-200">
              <span className="tracking-widest">GATE: 5G-HIGH-SPEED</span>
              <span className="rounded bg-blue-900/80 px-2 py-0.5 text-blue-300 border border-blue-700/60">
                EU ROAMING FREE
              </span>
            </div>
          </div>

          {/* 通票标题与核心定位 */}
          <div className="space-y-3">
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              欧洲通用 SIM · 申根 30+ 联盟国免漫游全景通票
            </h1>
            <p className="max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
              覆盖英国、法国、德国、瑞士、意大利、西班牙等欧洲全境主流申根与非申根国家。
              跨境无感自动切网，无需在各国机场反复购买当地卡。出海商旅、自由行与留学生欧洲一卡全通！
            </p>
          </div>

          {/* 通票核心属性舱 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono">
            <div className="rounded-2xl border border-blue-400/20 bg-blue-950/60 p-3.5 backdrop-blur-md">
              <div className="text-[11px] text-blue-300">COVERAGE AREA</div>
              <div className="mt-1 text-base font-bold text-amber-300">欧洲 30+ 国</div>
              <div className="mt-0.5 text-[10px] text-blue-200 font-sans">申根区无缝漫游</div>
            </div>
            <div className="rounded-2xl border border-blue-400/20 bg-blue-950/60 p-3.5 backdrop-blur-md">
              <div className="text-[11px] text-blue-300">HOTSPOT SHARING</div>
              <div className="mt-1 text-base font-bold text-emerald-400">支持 手机热点</div>
              <div className="mt-0.5 text-[10px] text-blue-200 font-sans">多设备全速共享</div>
            </div>
            <div className="rounded-2xl border border-blue-400/20 bg-blue-950/60 p-3.5 backdrop-blur-md">
              <div className="text-[11px] text-blue-300">ACTIVATION MODE</div>
              <div className="mt-1 text-base font-bold text-white">落地插卡即用</div>
              <div className="mt-0.5 text-[10px] text-blue-200 font-sans">开机自动注册当地网</div>
            </div>
            <div className="rounded-2xl border border-blue-400/20 bg-blue-950/60 p-3.5 backdrop-blur-md">
              <div className="text-[11px] text-blue-300">CALL & TEXT</div>
              <div className="mt-1 text-base font-bold text-cyan-300">含欧洲本地通话</div>
              <div className="mt-0.5 text-[10px] text-blue-200 font-sans">订餐/约车/酒店畅联</div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 30+ 联盟国免漫游全景国家墙 (All-Europe Country Wall) */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-blue-700">
            <Globe2 className="h-4 w-4" />
            <span>ALL_EUROPE_HUB // 30+ 联盟国全景互联国家墙</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            跨越国境无需换卡 · 自动注册当地最大运营商
          </h2>
          <p className="text-sm text-slate-500">
            点击区域可快速筛选，下辖国家落地自动接入当地顶级通信骨干网络。
          </p>
        </div>

        {/* 区域切换筛选器 */}
        <div className="mb-6 flex flex-wrap gap-2">
          {[
            { id: "all", label: "全部 30+ 联盟国" },
            { id: "west", label: "西欧枢纽 (英法荷比爱)" },
            { id: "central", label: "中欧核心 (德瑞奥捷匈)" },
            { id: "south", label: "南欧阳光 (意西葡希)" },
            { id: "north", label: "北欧极光 (瑞挪丹芬冰)" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedRegion(tab.id as any)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                selectedRegion === tab.id
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 国家卡片网格 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {filteredCountries.map((country) => (
            <div
              key={country.name}
              className="flex flex-col gap-1 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3.5 transition-all hover:border-blue-400 hover:bg-blue-50/40"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{country.flag}</span>
                <span className="text-sm font-black text-slate-900">{country.name}</span>
              </div>
              <span className="text-[11px] font-medium text-slate-500 mt-1">
                网络: <span className="text-blue-700 font-semibold">{country.carriers}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 出入境双模指南 (Pre-Departure & Arrival Guide) */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col gap-1 border-b border-slate-100 pb-4">
          <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-blue-700">
            <Compass className="h-4 w-4" />
            <span>ACTIVATION_GUIDE // 出入境双模使用指引</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            两步轻松上手：出境前妥善收卡，落地开机即通
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* 步骤 1 */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">
                1
              </span>
              <h3 className="text-base font-black text-slate-900">出境前（国内准备）</h3>
            </div>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <span>收到我们顺丰寄出的实体卡后，请妥善放置在随身护照夹或行李中。</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <span>在国内不要插卡开机，避免提前消耗套餐天数。</span>
              </li>
            </ul>
          </div>

          {/* 步骤 2 */}
          <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-600 text-xs font-black text-white">
                2
              </span>
              <h3 className="text-base font-black text-slate-900">飞机落地欧洲（开机激活）</h3>
            </div>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>航班降落后关机换入本 SIM 卡，开机并开启【数据漫游】开关。</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>等待 1~2 分钟，手机将自动注册至当地最优 5G 蜂窝网络，开始全速畅游！</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 4. 实体卡发货与欧洲商旅客服保障 */}
      <section className="rounded-3xl border border-blue-400/40 bg-gradient-to-br from-blue-950 via-[#0d1b3e] to-slate-900 p-6 text-white sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 font-mono text-xs text-blue-300">
              <Truck className="h-4 w-4" />
              <span>LOGISTICS_FULFILLMENT // 全球商旅实体卡极速寄递</span>
            </div>
            <h3 className="text-2xl font-black text-white">
              现货顺丰直发 · 送欧洲取卡针与卡套
            </h3>
            <p className="max-w-xl text-xs font-medium leading-relaxed text-blue-100">
              本商品为官方正品未拆封实体 SIM 卡，出厂自带免剪三合一规格。
              下单时请在右侧准确填写收件人与详细收货地址，我们会在 24 小时内发出顺丰快递。
            </p>
          </div>
          <button
            type="button"
            onClick={openPublicSupport}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-400 px-6 py-3.5 text-sm font-black text-slate-950 shadow-lg shadow-amber-400/25 transition-all hover:scale-[1.02] hover:bg-amber-300 active:scale-[0.98]"
          >
            咨询欧洲漫游客服
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
