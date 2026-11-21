"use client";

import Link from "next/link";
import {
  ArrowRight,
  Award,
  Calendar,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  Flame,
  Globe,
  HelpCircle,
  MessageSquare,
  QrCode,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingDown,
  Wifi,
  Zap,
} from "lucide-react";
import { openPublicSupport } from "@/lib/support/open-public-support";

interface Lucky2ProductDetailsProps {
  product: {
    id?: string;
    slug?: string | null;
    name: string;
    price?: number | null;
    original_price?: number | null;
    [key: string]: any;
  };
}

export default function Lucky2ProductDetails({ product }: Lucky2ProductDetailsProps) {
  const comparisonItems = [
    {
      category: "持有与保号成本",
      traditional: "每 90~180 天需强制充值，年均持有成本 ¥120~¥200+",
      lucky2: "到手自带 2~3 年超长有效期，年均持有成本低至约 ¥15",
      highlight: true,
    },
    {
      category: "忘充断号风险",
      traditional: "半年忘记充值一次直接销号，绑定的大量重要海外账号连带丢失",
      lucky2: "自带超长待机时间，到期前仅需轻微充值即继续顺延，极致省心",
      highlight: true,
    },
    {
      category: "国内接收短信",
      traditional: "部分卡片需要开启国际漫游或扣取高昂月租才允许接收短信",
      lucky2: "国内漫游接收 SMS 验证码完全免费（0 月租 0 待机扣费）",
      highlight: false,
    },
    {
      category: "网络运营商归属",
      traditional: "部分为虚拟 MVNO 二手分销，信誉受限易被平台风控拦截",
      lucky2: "香港主流电信巨头 CSL 原生网络号段，信誉高，过验极佳",
      highlight: false,
    },
  ];

  const tariffs = [
    {
      title: "内地接收短信",
      rate: "完全免费 (¥0/条)",
      desc: "在中国大陆漫游时，接收任何海内外平台的短信验证码均不收取任何费用",
      badge: "核心卖点",
      color: "border-rose-200 bg-rose-50 text-rose-700",
    },
    {
      title: "超长持有周期",
      rate: "2~3 年超长待机",
      desc: "随卡自带极长有效期，无需设置日历提醒定期充值续命，长期接码神器",
      badge: "免维护",
      color: "border-amber-200 bg-amber-50 text-amber-700",
    },
    {
      title: "中港漫游数据",
      rate: "支持按需购买",
      desc: "支持在香港或内地按天订购漫游上网包，插卡即连 4G/5G 高速网络",
      badge: "灵活按需",
      color: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    {
      title: "账户便捷查询",
      rate: "随时免密查询",
      desc: "手机拨打 *105# 或通过官方网页快速核验卡号、余额及最新过期时间",
      badge: "快捷指令",
      color: "border-blue-200 bg-blue-50 text-blue-700",
    },
  ];

  const kycSteps = [
    {
      step: "01",
      title: "扫描卡套实名二维码",
      desc: "收到实体卡后，使用手机微信或浏览器扫描卡套背面专属实名验证二维码。",
    },
    {
      step: "02",
      title: "上传证件快速核验",
      desc: "根据香港特区政府电话卡实名制要求，使用港澳通行证或中国护照在线拍摄即时审核。",
    },
    {
      step: "03",
      title: "插卡接入即开即用",
      desc: "审核通常数分钟内通过，将三合一 SIM 卡插入手机，开启数据漫游即可正常收码待机。",
    },
  ];

  const appScenarios = [
    { name: "Telegram / 纸飞机", status: "秒过", desc: "彻底解除 +86 账号无法私聊陌生人限制" },
    { name: "WhatsApp / 国际微信", status: "支持", desc: "跨境商务出海通讯与客户维护必备" },
    { name: "TikTok / 国际抖音", status: "免拔卡", desc: "国际版短视频注册与达人号运营" },
    { name: "Twitter (X) / Instagram", status: "极速", desc: "绑定国际顶级社交平台高权重实卡账号" },
    { name: "ChatGPT / OpenAI / Claude", status: "畅通", desc: "高风控海外 AI 大模型短信验证秒过" },
    { name: "香港虚拟银行 / 券商", status: "认证", desc: "众安 ZA Bank、理慧 livi 等港区金融机构" },
  ];

  const faqs = [
    {
      q: "为什么说 Lucky2 是性价比最高的保号神卡？",
      a: "常规境外电话卡（如英国、美国卡）通常需要每隔 3 到 6 个月充值或发送付费短信才能防止过期，一年维护成本往往超过 100 元，且一旦忘记就会永久被销号。Lucky2 到手自带长达 2~3 年的有效期，在此期间国内接收短信完全免费，相当于每年仅需十几元即可安心保号。",
    },
    {
      q: "实名认证需要去香港本地办理吗？",
      a: "完全不需要！Lucky2 支持全程在线实名认证。持有中国居民身份证配港澳通行证，或直接使用中国护照，只需用手机摄像头拍照上传即可由系统自动审核完成，全程仅需 2~3 分钟。",
    },
    {
      q: "卡片插在手机里需要一直开着漫游吗？",
      a: "是的，在中国大陆使用时，手机系统设置里需要开启「数据漫游」，以便手机搜索并注册到中国移动或中国联通的合作漫游基站。请放心，如果不订购上网套餐且关闭移动蜂窝网络，仅待机接收短信不会产生任何漫游上网扣费。",
    },
    {
      q: "后续有效期快到了该如何续期？",
      a: "在有效期届满前，您可以直接在官方渠道或本商城购买 Lucky2 充值增值券，充值后系统将自动顺延有效期，让您的宝贵号码长期安全持有。",
    },
  ];

  return (
    <div className="mt-8 space-y-8">
      {/* 1. 独家视觉 Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-950 via-rose-900 to-amber-950 p-6 text-white shadow-xl sm:p-8">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200">
              <Sparkles className="h-3.5 w-3.5" />
              香港 CSL 官方原生网络
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/20 px-3 py-1 text-xs font-medium text-rose-200">
              <Calendar className="h-3.5 w-3.5" />
              自带 2~3 年超长有效期
            </span>
          </div>

          <h2 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
            香港 Lucky2 SIM 卡 · 长效保号与接码利器
          </h2>

          <p className="text-sm leading-relaxed text-rose-100/90 sm:text-base">
            专为长期稳定持有香港号码打造：到手即享超长免充值有效期，国内漫游接收短信完全免费。
            告别传统电话卡频繁充值续命与忘充销号烦恼！
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-amber-200/90">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>国内免费接收短信</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>在线快速实名认证</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>三合一免剪卡全机型适配</span>
            </div>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 right-24 h-48 w-48 rounded-full bg-rose-500/20 blur-2xl" />
      </div>

      {/* 2. 差异化独家模块: 保号成本对比天梯 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-rose-600" />
              <h3 className="text-lg font-bold text-slate-900">为什么选择 Lucky2？—— 保号成本直观对比</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">对比传统境外卡繁琐的定期充值与高昂持有开销</p>
          </div>
          <span className="inline-flex w-fit items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            省钱省心 90%+
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-4 md:divide-x md:divide-y-0">
            {comparisonItems.map((item, idx) => (
              <div
                key={idx}
                className={`flex flex-col justify-between p-4 ${
                  item.highlight ? "bg-amber-50/40" : "bg-white"
                }`}
              >
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {item.category}
                  </span>
                  <div className="mt-3 space-y-2.5 text-xs leading-relaxed">
                    <div className="rounded-lg bg-slate-100 p-2 text-slate-500">
                      <span className="font-semibold text-slate-700">常规卡：</span>
                      {item.traditional}
                    </div>
                    <div className="rounded-lg bg-rose-50 p-2 text-rose-800">
                      <span className="font-bold text-rose-700">Lucky2：</span>
                      {item.lucky2}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. 香港 CSL 原生资费清单 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-amber-600" />
            <h3 className="text-lg font-bold text-slate-900">香港 CSL 原生网络核心资费看板</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">资费透明公道，无任何隐藏月租或强制捆绑消费</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tariffs.map((t, i) => (
            <div key={i} className="flex flex-col justify-between rounded-xl border border-slate-200 p-4 transition-all hover:border-amber-300 hover:shadow-sm">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">{t.title}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${t.color}`}>
                    {t.badge}
                  </span>
                </div>
                <div className="mt-2 text-base font-bold text-slate-900">{t.rate}</div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. 内地合规实名认证 3 步指南 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-bold text-slate-900">内地居民在线实名激活流程（极速开通）</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">香港特区电讯条例合规指引，免跑香港本地，手机扫码即可认证</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {kycSteps.map((s, idx) => (
            <div key={idx} className="relative rounded-xl border border-slate-100 bg-slate-50/60 p-5">
              <span className="text-2xl font-black text-rose-600/30">{s.step}</span>
              <h4 className="mt-2 text-sm font-bold text-slate-900">{s.title}</h4>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 5. 常见业务场景兼容清单 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-emerald-600" />
            <h3 className="text-lg font-bold text-slate-900">全球海外主流平台实测兼容矩阵</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">实体 SIM 物理号段，高信任度，秒过各类平台风控核验</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {appScenarios.map((app, i) => (
            <div key={i} className="flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 text-center">
              <div>
                <span className="inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  {app.status}
                </span>
                <div className="mt-2 text-xs font-bold text-slate-800">{app.name}</div>
              </div>
              <p className="mt-1 text-[11px] leading-tight text-slate-500">{app.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 6. 常见问答 FAQ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-slate-700" />
          <h3 className="text-lg font-bold text-slate-900">Lucky2 常见问题解答</h3>
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

      {/* 7. 底部官方指引与客服咨询卡片 */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 p-6 sm:flex-row">
        <div>
          <h4 className="text-base font-bold text-slate-900">需要更多香港卡片实名指导或套餐配置咨询？</h4>
          <p className="mt-1 text-xs text-slate-600">本站提供全流程一对一技术协助，保障您的港卡长效稳定安全持有。</p>
        </div>
        <button
          type="button"
          onClick={() => openPublicSupport()}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 transition-colors"
        >
          <MessageSquare className="h-4 w-4" />
          联系在线技术客服
        </button>
      </div>
    </div>
  );
}
