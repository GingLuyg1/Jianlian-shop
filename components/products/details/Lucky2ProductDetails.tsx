"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Calendar,
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
  const highlights = [
    {
      icon: Calendar,
      title: "自带 2~3 年超长有效期",
      desc: "相比普通电话卡需频繁每半年充值，Lucky2 到手即享 2~3 年超长有效期，省心省力长效保号神卡。",
      tag: "超长有效期",
    },
    {
      icon: Globe,
      title: "香港原生 +852 手机号",
      desc: "香港本土原生移动号段（非 VoIP 虚拟号），真实实体物理 SIM 卡，秒过海外各类严格风控。",
      tag: "原生港卡",
    },
    {
      icon: CreditCard,
      title: "官方 0 月租 · 零持有成本",
      desc: "无日常强制月租，平时放在国内不打电话、不发短信即完全 0 月租，无任何隐藏扣费风险。",
      tag: "官方 0 月租",
    },
    {
      icon: MessageSquare,
      title: "国内免费接收短信",
      desc: "国内自动漫游接入中国移动或中国联通 4G/5G 优质信号，接收海内外平台 SMS 短信验证码完全免费。",
      tag: "收短信免费",
    },
    {
      icon: Zap,
      title: "香港 CSL 优质网络覆盖",
      desc: "依托香港电讯（HKT）旗下主流运营商 CSL 基站网络，漫游信号强劲稳定，接码顺畅秒级送达。",
      tag: "CSL 网络",
    },
    {
      icon: Smartphone,
      title: "三合一免剪卡 · 全网通适配",
      desc: "标准大卡、Micro、Nano 任意卡槽通用，适配 iPhone 及全网通安卓机型，即插即用无需剪卡。",
      tag: "全网通通用",
    },
  ];

  const platformCategories = [
    {
      title: "AI 智能生产力矩阵",
      badge: "秒过手机验证",
      icon: Bot,
      color: "border-rose-200 bg-rose-50/50 text-rose-800",
      items: [
        { name: "ChatGPT / OpenAI", desc: "注册与 Plus 绑卡验证" },
        { name: "Claude (Anthropic)", desc: "高风控手机验证秒过" },
        { name: "Google Gemini", desc: "谷歌生态高级 AI 验证" },
        { name: "xAI Grok / Midjourney", desc: "海外大模型全支持" },
      ],
    },
    {
      title: "全球主流社交与通讯",
      badge: "解 +86 限制",
      icon: MessageSquare,
      color: "border-blue-200 bg-blue-50/50 text-blue-800",
      items: [
        { name: "Telegram", desc: "解除中国号不能私聊陌生人限制" },
        { name: "WhatsApp", desc: "海外贸易与跨国通讯必备" },
        { name: "TikTok (海外抖音)", desc: "跨境出海带货与达人号" },
        { name: "Twitter (X) / Instagram", desc: "国际社媒高权重注册" },
      ],
    },
    {
      title: "跨境金融与港区券商",
      badge: "香港原生信用",
      icon: CreditCard,
      color: "border-amber-200 bg-amber-50/50 text-amber-800",
      items: [
        { name: "PayPal (国际区)", desc: "香港/美区/欧洲个人商户" },
        { name: "港美股证券开户", desc: "富途牛牛/长桥等香港券商" },
        { name: "Wise (TransferWise)", desc: "国际多币种资金账户安全验证" },
        { name: "Stripe / 港区 Apple ID", desc: "免绑外卡安全绑定收验证码" },
      ],
    },
    {
      title: "全球影音与海淘商铺",
      badge: "畅享海外服务",
      icon: Globe,
      color: "border-emerald-200 bg-emerald-50/50 text-emerald-800",
      items: [
        { name: "Steam (外区)", desc: "港区/阿区/美区换区验证" },
        { name: "Netflix / Spotify", desc: "全球影音流媒体会员认证" },
        { name: "Amazon 香港/全球站", desc: "海淘买卖家安全账户绑定" },
        { name: "eBay / Discord", desc: "跨区社区与商城验证" },
      ],
    },
  ];

  const steps = [
    {
      step: "01",
      title: "下单购买与发货",
      desc: "提交订单并填写收件人信息，现货顺丰/普通快递包邮发货，附带卡套与详细实操说明书。",
    },
    {
      step: "02",
      title: "收到卡片插入手机",
      desc: "收到实体三合一 SIM 卡后直接装入手机 SIM 卡槽（注意请勿开启数据漫游流量防扣费）。",
    },
    {
      step: "03",
      title: "搜网与短信漫游激活",
      desc: "手机将自动漫游接入中国移动或中国联通信号，收到官方激活与号码确认短信即可开始使用。",
    },
    {
      step: "04",
      title: "日常 0 月租接码使用",
      desc: "平时放在手机中接收验证码完全免费，2~3 年超长有效期内无需频繁充值，省心长期持有。",
    },
    {
      step: "05",
      title: "到期前充值续命",
      desc: "在有效期到期前，通过官方渠道或微信/支付宝充值小额话费，即可再续期 1~2 年有效期。",
    },
  ];

  const faqs = [
    {
      q: "Lucky2 SIM 卡在国内使用有月租吗？接收短信收费吗？",
      a: "完全 0 月租！平时放在手机里，只要不主动拨打电话、不发送短信、不开启数据漫游流量，就没有任何月租扣费。在国内接收海内外各类平台的 SMS 短信验证码完全免费。",
    },
    {
      q: "Lucky2 的有效期是多久？后续如何保号？",
      a: "Lucky2 最大优势在于其自带超长有效期（到手即享 2~3 年有效期），相比普通半年一充的卡片极其省心。在到期前只需充值小额话费，即可再次顺延 1~2 年有效期，属于极具性价比的长效保号卡。",
    },
    {
      q: "在国内使用需要实名认证吗？",
      a: "根据香港电讯条例，若在香港本地使用需要完成实名登记；若仅在香港境外（如大陆地区）进行漫游接收短信，通常插卡即用。如需长期使用或开通更多增值功能，也可按卡套指引在官方网页便捷上传护照或港澳通行证完成合规认证。",
    },
    {
      q: "插卡后需要关闭移动数据流量吗？",
      a: "强烈建议关闭！境外卡在大陆漫游时，上网流量费率较高。请务必在手机设置中关闭该 SIM 卡的【移动数据】和【数据漫游】，仅保留正常的信号待机，即可确保 0 月租纯粹免费接收短信。",
    },
  ];

  return (
    <div className="mt-6 space-y-8 text-foreground">
      {/* 顶部专属 Hero 区域 - 祥瑞红金科技风 */}
      <div className="relative overflow-hidden rounded-3xl border border-red-200/90 bg-gradient-to-br from-red-600 via-rose-600 to-amber-600 p-6 text-white shadow-lg sm:p-8">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              香港原生号码 · 超长 2~3 年有效期
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/30 px-3 py-1 text-xs font-semibold text-amber-100 backdrop-blur-md">
              <Calendar className="h-3.5 w-3.5 text-amber-300" />
              免频繁充值 · 官方 0 月租
            </span>
          </div>

          <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
            Lucky2 香港原生电话卡 · 超长效保号神卡
          </h2>
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-red-50/90 sm:text-base">
            依托香港 CSL 优质网络，真实物理 SIM 卡原生 +852 号段。自带 2~3 年超长有效期，国内漫游免费接收海内外短信验证码，无日常月租，省心省钱的长期境外号码持有优选方案。
          </p>

          <div className="mt-6 flex flex-wrap gap-4 text-xs font-medium text-red-100 sm:text-sm">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-amber-300" />
              香港原生 +852
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-amber-300" />
              超长 2~3 年有效期
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-amber-300" />
              国内免费收短信
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-amber-300" />
              实体卡现货速发
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 right-20 h-48 w-48 rounded-full bg-red-400/20 blur-2xl" />
      </div>

      {/* 六大核心卖点 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {highlights.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-red-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 transition-colors group-hover:bg-red-600 group-hover:text-white">
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
              <Sparkles className="h-4 w-4 text-red-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-red-600">
                生态兼容全面覆盖
              </span>
            </div>
            <h3 className="mt-1 text-lg font-extrabold text-slate-900 sm:text-xl">
              全场景海外应用与平台兼容矩阵
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              原生香港移动运营商号段（非 VoIP），真实物理 SIM 卡信誉度极高，秒过各类严苛风控。
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
            <Radio className="h-3.5 w-3.5 animate-pulse text-red-600" />
            实测高权重畅通
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

      {/* 新手防扣费警示卡 */}
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-5 shadow-xs">
        <div className="flex items-center gap-2 text-sm font-bold text-amber-900 sm:text-base">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
          新手插卡必看：防扣费与使用建议（重要）
        </div>
        <div className="mt-3 space-y-2 text-xs leading-relaxed text-amber-900/90 sm:text-sm">
          <p>
            1. <strong>插卡前务必关闭【移动数据】与【数据漫游】</strong>：境外卡漫游上网资费较高，请在插卡前务必在手机设置中将该卡的数据流量完全关闭，仅保留纯信号待机接收短信，即可完全 0 费用。
          </p>
          <p>
            2. <strong>国内接收短信完全免费</strong>：用于国内漫游接收 Telegram、WhatsApp、Google、海外银行等各类平台的 SMS 短信验证码完全不扣费。
          </p>
          <p>
            3. <strong>超长有效期省心持有</strong>：自带 2~3 年有效期待机期，无需像普通卡每半年充值。到期前按需充值即可续期。
          </p>
        </div>
      </div>

      {/* 商品规格与交付说明 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h3 className="text-base font-bold text-slate-900 sm:text-lg">商品规格与交付说明</h3>
        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 sm:text-sm">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
            <span className="text-muted-foreground">卡片介质</span>
            <span className="font-semibold text-slate-800">标准/Micro/Nano 三合一实体 SIM 卡</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
            <span className="text-muted-foreground">运营商归属</span>
            <span className="font-semibold text-slate-800">香港 CSL 优质网络 MVNO</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
            <span className="text-muted-foreground">初始有效期</span>
            <span className="font-semibold text-slate-800">到手即享 2~3 年超长有效期</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
            <span className="text-muted-foreground">发货方式</span>
            <span className="font-semibold text-slate-800">国内现货速发 · 快递包邮</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
            <span className="text-muted-foreground">国内月租</span>
            <span className="font-semibold text-slate-800">0 月租（平时接码完全免费）</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
            <span className="text-muted-foreground">适用设备</span>
            <span className="font-semibold text-slate-800">iPhone 全系列及全网通安卓手机</span>
          </div>
        </div>
      </div>

      {/* 五步极速上手 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h3 className="text-base font-bold text-slate-900 sm:text-lg">极速上手五步流程</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {steps.map((st) => (
            <div key={st.step} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
              <span className="text-xs font-black text-red-600">{st.step}</span>
              <div className="mt-1.5 text-xs font-bold text-slate-900">{st.title}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{st.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 常见问题解答 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-red-600" />
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
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-amber-50 p-5 sm:flex-row sm:p-6">
        <div>
          <h4 className="text-sm font-bold text-red-950 sm:text-base">
            需要了解更多香港手机卡保号选型或实名指导？
          </h4>
          <p className="mt-1 text-xs text-red-800/80">
            本站为您提供全流程咨询与售后技术支持，保障您的境外号码长期安全稳定可用。
          </p>
        </div>
        <button
          type="button"
          onClick={() => openPublicSupport()}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-red-700 active:scale-95 sm:text-sm"
        >
          咨询在线客服
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
