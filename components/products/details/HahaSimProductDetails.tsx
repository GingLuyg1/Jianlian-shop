"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  DollarSign,
  FileText,
  Gift,
  HelpCircle,
  MessageSquare,
  PhoneCall,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Ticket,
  Truck,
  Wifi,
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
  const [activeBillTab, setActiveBillTab] = useState<"standard" | "comparison">("standard");

  return (
    <div className="mt-8 w-full space-y-8 select-none">
      {/* 1. 经典票据质感 Hero Ledger Card */}
      <section className="relative overflow-hidden rounded-3xl border border-amber-200/80 bg-[#fdfbf7] p-6 text-slate-900 shadow-md sm:p-8">
        {/* 背景轻微纸质纹理与装饰光晕 */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-400/15 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-orange-400/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          {/* 票据抬头与条形码样式 */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-dashed border-amber-300/80 pb-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-100/60 px-3.5 py-1 text-xs font-bold text-amber-900">
              <Ticket className="h-3.5 w-3.5 text-amber-700" />
              <span>HKBN // 0 MONTHLY FEE LEDGER</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs text-slate-500">
              <span className="tracking-widest">||| | |||| | ||| ||||</span>
              <span>NO.852-HAHA-ZERO</span>
            </div>
          </div>

          {/* 主标题与震撼 0 月租标语 */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-3 py-1 text-xs font-bold text-white shadow-xs">
              <Sparkles className="h-3.5 w-3.5" />
              <span>永久 0 月租 · 终身养号保号神卡</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Haha SIM · 香港宽频 0 月租实体电话卡
            </h1>
            <p className="max-w-2xl text-sm font-medium leading-relaxed text-slate-600">
              香港顶级电信运营商（HKBN / 3HK）正规官方出品。不插卡不扣费，在中国大陆免费接收短信与验证码。
              每年仅需充值 10 港币即可无限顺延 365 天有效期，所充余额全部归您自由购买流量！
            </p>
          </div>

          {/* 0 成本对账单简明凭证 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono">
            <div className="rounded-2xl border border-amber-200/90 bg-white/95 p-4 shadow-xs">
              <div className="text-[11px] font-semibold text-slate-400">固定月租</div>
              <div className="mt-1 text-xl font-black text-emerald-600">HK$ 0.00</div>
              <div className="mt-0.5 text-[10px] text-slate-500 font-sans">无任何隐形低消</div>
            </div>
            <div className="rounded-2xl border border-amber-200/90 bg-white/95 p-4 shadow-xs">
              <div className="text-[11px] font-semibold text-slate-400">大陆接收短信</div>
              <div className="mt-1 text-xl font-black text-emerald-600">HK$ 0.00</div>
              <div className="mt-0.5 text-[10px] text-slate-500 font-sans">接码完全免费</div>
            </div>
            <div className="rounded-2xl border border-amber-200/90 bg-white/95 p-4 shadow-xs">
              <div className="text-[11px] font-semibold text-slate-400">保号延期成本</div>
              <div className="mt-1 text-xl font-black text-amber-700">HK$ 10 / 年</div>
              <div className="mt-0.5 text-[10px] text-slate-500 font-sans">充值金全额自用</div>
            </div>
            <div className="rounded-2xl border border-amber-200/90 bg-white/95 p-4 shadow-xs">
              <div className="text-[11px] font-semibold text-slate-400">官方 APP 管理</div>
              <div className="mt-1 text-xl font-black text-slate-900">支持 支付宝</div>
              <div className="mt-0.5 text-[10px] text-slate-500 font-sans">在线充值极速到账</div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 撕边票据卡券特权集 (Perforated Voucher Cards) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900">专属三大卡券特权</h2>
            <p className="text-sm text-slate-500">实体卡出厂即附带官方三大核心权益。</p>
          </div>
          <span className="font-mono text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
            OFFICIAL VOUCHERS
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* 特权券 1 */}
          <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-amber-300 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-800">特权券 · 01</span>
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">永久免月租</span>
            </div>
            <h3 className="mt-3 text-lg font-black text-slate-900">永久 0 月租保号</h3>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
              无需每月扣减任何月租套餐，卡片闲置不扣款。每年充值 10 港币即顺延 1 年有效期，成本几乎为零。
            </p>
          </div>

          {/* 特权券 2 */}
          <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-amber-300 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-800">特权券 · 02</span>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">免换卡漫游</span>
            </div>
            <h3 className="mt-3 text-lg font-black text-slate-900">中港澳 5G 高速流量</h3>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
              前往香港、澳门或国内差旅，在官方 Haha Travel App 随时秒开流量日包，原生香港 IP 极速畅游。
            </p>
          </div>

          {/* 特权券 3 */}
          <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-amber-300 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-800">特权券 · 03</span>
              <span className="rounded bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800">全能解封</span>
            </div>
            <h3 className="mt-3 text-lg font-black text-slate-900">Telegram / 银行开户秒过</h3>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
              +852 原生号码，一键解除 TG 无法主动私聊 +86 的封禁，完美支持香港各大虚拟银行与海外社交绑定。
            </p>
          </div>
        </div>
      </section>

      {/* 3. 专属黄金通道：直达【Haha SIM 使用教程】黄金指引卡 */}
      <section className="relative overflow-hidden rounded-3xl border-2 border-amber-400/80 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.2),transparent_70%)] pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1 text-xs font-black backdrop-blur-md">
              <BookOpen className="h-3.5 w-3.5" />
              <span>官方精编新手实操指南</span>
            </div>
            <h3 className="text-2xl font-black text-white sm:text-3xl">
              Haha SIM 新手开卡与保号完整教程
            </h3>
            <p className="max-w-xl text-xs font-medium leading-relaxed text-amber-100 sm:text-sm">
              从实名认证（支持护照/港澳通行证）、充值延期、漫游设置到 App 查话费，全图文保姆级指引，新手小白也能 3 分钟轻松搞定！
            </p>
          </div>

          <Link
            href="/tutorials?topic=haha-sim"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-black text-amber-800 shadow-xl shadow-amber-950/20 transition-all hover:scale-[1.03] hover:bg-amber-50 active:scale-[0.98] shrink-0"
          >
            <span>直达官方使用教程</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* 4. 0 月租账单对账明细模拟器 */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col gap-1 border-b border-slate-100 pb-4">
          <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-amber-700">
            <FileText className="h-4 w-4" />
            <span>ANNUAL_COST_COMPARISON // 首年持有成本对账表</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            持有成本对比：比传统卡每年立省数百元
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-3 font-semibold">费用科目</th>
                <th className="py-3 font-semibold text-emerald-600">Haha SIM (本卡)</th>
                <th className="py-3 font-semibold text-slate-500">传统香港月租卡</th>
                <th className="py-3 font-semibold text-slate-500">第三方虚拟接码平台</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-sans">
              <tr>
                <td className="py-3 font-medium text-slate-900">每月固定月租</td>
                <td className="py-3 font-bold text-emerald-600">HK$ 0.00 / 月</td>
                <td className="py-3 text-slate-500">HK$ 38 ~ 98 / 月</td>
                <td className="py-3 text-slate-500">按次计费（单次 10~30 元）</td>
              </tr>
              <tr>
                <td className="py-3 font-medium text-slate-900">大陆接收验证码</td>
                <td className="py-3 font-bold text-emerald-600">完全免费 (0 元)</td>
                <td className="py-3 text-slate-500">扣除月租套餐</td>
                <td className="py-3 text-red-500">不可终身反复接收</td>
              </tr>
              <tr>
                <td className="py-3 font-medium text-slate-900">首年持有成本</td>
                <td className="py-3 font-bold text-emerald-600">约 HK$ 10 (余额归自己)</td>
                <td className="py-3 text-slate-500">约 HK$ 456+ 元</td>
                <td className="py-3 text-slate-500">累积高昂，且不可保号</td>
              </tr>
              <tr>
                <td className="py-3 font-medium text-slate-900">官方 APP 管理</td>
                <td className="py-3 font-bold text-emerald-600">Haha Travel (支持支付宝)</td>
                <td className="py-3 text-slate-500">需香港本地银行卡</td>
                <td className="py-3 text-red-500">无官方 App，随时跑路</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. 官方实体卡物流发货说明 */}
      <section className="rounded-3xl border border-amber-300/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-amber-800">
              <Truck className="h-4 w-4" />
              <span>LOGISTICS_SHIPPING // 实体三合一卡安全寄递</span>
            </div>
            <h3 className="text-2xl font-black text-slate-900">
              全新未拆封实体卡 · 顺丰特快顺畅直达
            </h3>
            <p className="max-w-xl text-xs font-medium leading-relaxed text-slate-600">
              本商品为全新官方密封实体三合一免剪卡（含 Standard / Micro / Nano 尺寸）。
              下单时请在右侧准确填写收货地址，我们将在 24 小时内发出并回传顺丰单号。
            </p>
          </div>
          <button
            type="button"
            onClick={openPublicSupport}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-amber-500/25 transition-all hover:scale-[1.02] hover:bg-amber-600 active:scale-[0.98]"
          >
            咨询 Haha SIM 客服
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
