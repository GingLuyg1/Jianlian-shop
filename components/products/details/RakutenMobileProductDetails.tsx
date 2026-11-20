"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  CreditCard,
  Film,
  Globe,
  HelpCircle,
  MessageSquare,
  Play,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Truck,
  Video,
  Zap,
} from "lucide-react";
import { openPublicSupport } from "@/lib/support/open-public-support";

interface RakutenMobileProductDetailsProps {
  product: {
    id?: string;
    slug?: string | null;
    name: string;
    price?: number | null;
    original_price?: number | null;
    [key: string]: any;
  };
}

export default function RakutenMobileProductDetails({ product }: RakutenMobileProductDetailsProps) {
  const highlights = [
    {
      icon: Globe,
      title: "日本原生 +81 本土号段",
      desc: "日本主流大型运营商乐天移动（Rakuten）原生号段（非 VoIP），纯正日本运营商信誉，秒过日服严苛风控。",
      tag: "日本原生号",
    },
    {
      icon: Sparkles,
      title: "煤炉/抽票/日淘出海神卡",
      desc: "完美支持日本煤炉 Mercari、Line、eplus 演唱会抽票、Yahoo 雅虎日拍、日本亚马逊与日服手游认证。",
      tag: "日淘出海首选",
    },
    {
      icon: MessageSquare,
      title: "国内免费接收短信",
      desc: "国内自动漫游接入中国移动或中国联通网络，接收来自日本本土及全球各大平台的验证码完全免费。",
      tag: "收短信免费",
    },
    {
      icon: ShieldCheck,
      title: "无需大陆身份实名",
      desc: "海外实体预付费 SIM 卡，保护个人隐私安全，无需提供大陆身份证件，到手插卡即用。",
      tag: "免实名认证",
    },
    {
      icon: Smartphone,
      title: "三合一免剪卡槽",
      desc: "标准大卡、Micro、Nano 任意卡槽通用，适配 iPhone、iPad 及全网通安卓手机，支持外版机型。",
      tag: "全机型通用",
    },
    {
      icon: Truck,
      title: "默认包邮（加急可联系）",
      desc: "妥善封装防静电防折弯保护芯片安全，默认包邮送达，如需顺丰加急请联系客服。",
      tag: "妥善安全包装",
    },
  ];

  const platformCategories = [
    {
      title: "日区电商海淘与抽票",
      badge: "秒过日区严苛风控",
      icon: Sparkles,
      color: "bg-rose-100 text-rose-800",
      items: [
        { name: "Mercari (煤炉)", desc: "日本最大二手交易平台实名认证" },
        { name: "Yahoo! 雅虎日拍", desc: "日本雅虎拍卖与商城账号绑定" },
        { name: "eplus / Ticket Pia", desc: "日本各类演唱会/漫展抽票认证" },
        { name: "Amazon 日本站", desc: "日亚海淘买卖家安全账户绑定" },
      ],
    },
    {
      title: "日系社交与即时通讯",
      badge: "解 +86 限制",
      icon: MessageSquare,
      color: "bg-red-100 text-red-800",
      items: [
        { name: "LINE (日本本土版)", desc: "日本全民级社交通讯无缝绑定" },
        { name: "TikTok 日本版", desc: "日本区短视频与出海达人号运营" },
        { name: "Twitter (X) / Instagram", desc: "日区高权重二次元与社媒号" },
        { name: "Telegram", desc: "海外商务通讯与极客社区认证" },
      ],
    },
    {
      title: "日区应用与影音游戏",
      badge: "日服原生环境",
      icon: Globe,
      color: "bg-amber-100 text-amber-800",
      items: [
        { name: "日区 Apple ID", desc: "畅享日区 App Store 独占资源" },
        { name: "DMM / FANZA", desc: "日本综合数字娱乐平台认证" },
        { name: "日服手游全系列", desc: "赛马娘/FGO/碧蓝航线日服绑定" },
        { name: "Netflix / Spotify 日区", desc: "日本本土片库与独占音乐认证" },
      ],
    },
    {
      title: "AI 顶流大模型矩阵",
      badge: "秒过手机验证",
      icon: Bot,
      color: "bg-emerald-100 text-emerald-800",
      items: [
        { name: "ChatGPT / OpenAI", desc: "注册与 Plus 绑卡接码验证" },
        { name: "Claude (Anthropic)", desc: "高风控严苛手机验证秒过" },
        { name: "Google Gemini", desc: "谷歌生态高级 AI 验证绑定" },
        { name: "xAI Grok / Midjourney", desc: "海外大模型全方位支持" },
      ],
    },
  ];

  const specs = [
    ["商品规格", "日本乐天移动（Rakuten Mobile）原生实体三合一 SIM 卡（支持标准卡/Micro/Nano）"],
    ["交付方式", "妥善包装防静电防折弯，默认包邮送达（如需顺丰加急请联系客服）"],
    ["漫游网络", "国内自动漫游接入中国移动或中国联通 4G/5G 网络"],
    ["号码格式", "日本本土手机号码段（+81 70 / 80 / 90 xxx xxxx）"],
    ["主要用途", "日淘海淘、煤炉 Mercari、Line、演唱会抽票、海外 AI 模型注册及各平台短信验证"],
    ["售后保障", "正品日本运营商原装芯片，发货前均经严格质检，售后问题由在线客服全流程协助"],
  ];

  const faqs = [
    {
      q: "为什么日区平台（如煤炉、Line、演唱会抽票）必须用日本实体卡？",
      a: "日本各大电商、社交与抽票网站对手机号码有严格的运营商号段识别库（HLR Lookup），虚拟号（VoIP）或境外漫游号码会被系统秒拒或直接封号。乐天移动原生实体 SIM 卡具备正规日本移动网络属性，信誉等级极高，能够稳定秒过风控。",
    },
    {
      q: "在国内怎么接收短信？需要自己充值吗？",
      a: "收到卡后插入全网通手机，手机开机后会自动接入中国移动或联通信号。在国内接收短信是完全免费的，不需要额外充值任何国际漫游费用。",
    },
    {
      q: "iPhone 插卡提示激活 iMessage / FaceTime 怎么处理？",
      a: "当 iPhone 弹出该提示时，请果断点击【取消】！点击取消完全不影响正常接收验证码。误点“好”会导致手机自动发送一条国际短信触发扣费。",
    },
  ];

  return (
    <div className="mt-8 w-full space-y-6">
      {/* 日系极客曜黑红 Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-rose-300/40 bg-gradient-to-br from-red-600 via-rose-700 to-slate-950 p-6 text-white shadow-md sm:p-8">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-rose-400/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-red-400/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-rose-200" />
              <span>日本大型电信巨头 · Rakuten Mobile 乐天移动</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/40 bg-rose-500/25 px-3 py-1 text-xs font-bold text-rose-100">
              <Globe className="h-3.5 w-3.5 text-rose-300" />
              <span>日本本土原生 +81 号段</span>
            </span>
          </div>

          <div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              日本乐天移动 Rakuten Mobile 原生实体卡
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-rose-100/90 sm:text-sm">
              专为日本煤炉 (Mercari)、Line、演唱会抽票、日区 Apple ID 及日淘出海打造！正规日本移动运营商纯净号段，非虚拟号，国内漫游稳定免费接收验证码。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-rose-50">
              <Truck className="h-3.5 w-3.5 text-rose-300" />
              <span>默认包邮发货（加急顺丰可联系客服）</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-rose-50">
              <CheckCircle2 className="h-3.5 w-3.5 text-rose-300" />
              <span>国内自动漫游中国移动/联通</span>
            </span>
          </div>
        </div>
      </section>

      {/* 专属内嵌：乐天移动安装配置视频教学模块 */}
      <section className="overflow-hidden rounded-3xl border border-rose-200/90 bg-gradient-to-b from-slate-900 to-slate-950 text-white shadow-lg">
        <div className="border-b border-white/10 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-600 text-white shadow-sm">
                <Video className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white sm:text-base">
                  日本乐天 Rakuten Mobile 安装与配置实操视频
                </h3>
                <p className="text-[11px] text-slate-400">
                  超详细保姆级视频指引：包含插卡顺序、网络接入与 APN 描述文件配置全流程
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/20 px-3 py-1 text-xs font-medium text-rose-300">
              <Play className="h-3 w-3 fill-rose-300" />
              官方高清教程
            </span>
          </div>
        </div>

        {/* 视频播放器 */}
        <div className="p-4 sm:p-6">
          <div className="relative mx-auto aspect-video max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-black shadow-inner">
            <video
              controls
              playsInline
              preload="metadata"
              src="https://video.yqqy.de/rm.mp4"
              className="h-full w-full object-contain"
            >
              您的浏览器暂不支持内置视频播放，请升级浏览器后观看。
            </video>
          </div>

          {/* 视频操作要点分步速查 */}
          <div className="mt-5 grid gap-3 sm:grid-cols-3 text-xs text-slate-300">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
              <span className="font-bold text-rose-400">第一步 · 插卡关漫游</span>
              <p className="mt-1 leading-5 text-slate-400">
                将 Nano SIM 放入全网通手机卡槽 1，开机前务必保持蜂窝设置中【关闭数据漫游】。
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
              <span className="font-bold text-rose-400">第二步 · 网络自动搜网</span>
              <p className="mt-1 leading-5 text-slate-400">
                稍候 1~2 分钟，手机将自动接入中国移动或中国联通漫游网络，显示满格信号。
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
              <span className="font-bold text-rose-400">第三步 · 畅享日区验证</span>
              <p className="mt-1 leading-5 text-slate-400">
                在煤炉、Line、Apple ID 或抽票 App 中输入您的 +81 手机号，秒速接收短信验证码。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 六大核心王牌特性 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
            <Zap className="h-5 w-5 text-rose-600" />
            为什么选择日本乐天移动原生实体卡？
          </h3>
          <span className="text-xs text-muted-foreground">纯正日本号段</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="relative flex flex-col justify-between rounded-2xl border border-rose-100 bg-gradient-to-b from-rose-50/30 via-white to-white p-5 shadow-sm transition hover:border-rose-300 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100/70 text-rose-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-rose-100/60 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800">
                      {item.tag}
                    </span>
                  </div>
                  <div className="mt-3.5 text-sm font-bold text-slate-900 sm:text-base">{item.title}</div>
                  <p className="mt-1.5 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 全场景海外应用与日淘出海兼容矩阵（第一行标题单行不折行、第二行放标签） */}
      <section className="rounded-2xl border border-rose-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
              <Sparkles className="h-5 w-5 text-rose-600" />
              日区海淘抽票、社媒与全场景应用兼容矩阵
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              原生日本运营商真实号段（非虚拟 VoIP），真实物理 SIM 卡信誉度极高，秒过各类严苛风控。
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
            <Radio className="h-3.5 w-3.5 animate-pulse text-rose-600" />
            实测 100% 畅通接收
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {platformCategories.map((cat) => {
            const CatIcon = cat.icon;
            return (
              <div
                key={cat.title}
                className="flex flex-col rounded-xl border border-rose-100/80 bg-gradient-to-b from-rose-50/20 to-white p-4"
              >
                <div className="border-b border-rose-100/70 pb-3">
                  <div className="flex items-center gap-2">
                    <CatIcon className="h-4 w-4 shrink-0 text-rose-600" />
                    <span className="whitespace-nowrap text-xs font-bold text-slate-900 sm:text-sm">{cat.title}</span>
                  </div>
                  <div className="mt-2">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${cat.color}`}>
                      {cat.badge}
                    </span>
                  </div>
                </div>
                <div className="mt-3 space-y-2.5">
                  {cat.items.map((item) => (
                    <div key={item.name} className="text-xs">
                      <div className="font-semibold text-slate-800">{item.name}</div>
                      <div className="text-[11px] text-slate-500">{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 新手插卡必看：两大防扣费重要警示 */}
      <section className="rounded-2xl border border-red-200 bg-red-50/80 p-5 text-slate-800 shadow-sm sm:p-6">
        <div className="flex items-start gap-3.5">
          <ShieldAlert className="mt-1 h-6 w-6 shrink-0 text-red-600" />
          <div className="space-y-3">
            <div className="text-base font-bold text-red-900 sm:text-lg">
              新手插卡必看：两大防扣费避坑指南（插卡前务必阅读！）
            </div>
            <div className="space-y-2.5 text-xs leading-5 text-slate-700 sm:text-sm sm:leading-6">
              <div className="rounded-xl border border-red-200/60 bg-white/85 p-3.5">
                <p>
                  <strong className="text-red-700">1. 插卡前务必【关闭移动数据漫游】：</strong>
                  国际数据漫游费用昂贵。平时在国内接收验证码完全不需要开漫游数据！在手机蜂窝网络设置中务必保持【关闭数据漫游】，防止手机后台 App 偷跑流量产生扣费。
                </p>
              </div>
              <div className="rounded-xl border border-red-200/60 bg-white/85 p-3.5">
                <p>
                  <strong className="text-red-700">2. iPhone 提示激活 iMessage / FaceTime 务必点击【取消】：</strong>
                  苹果手机插卡后，iOS 系统偶尔会弹出“可能会发送用于激活 iMessage / FaceTime 的短信，是否允许？”提示。此时<strong>务必点击【取消】</strong>！点击取消完全不影响正常接收验证码；误点“好”会触发手机自动发送一条国际短信产生扣费。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 商品规格说明 */}
      <section className="rounded-2xl border border-rose-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <ShieldCheck className="h-5 w-5 text-rose-600" />
          商品规格与交付说明
        </h3>
        <div className="mt-4 space-y-2.5">
          {specs.map(([label, text]) => (
            <div
              key={String(label)}
              className="flex flex-col rounded-xl border border-rose-100 bg-rose-50/20 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-2"
            >
              <span className="shrink-0 text-xs font-bold text-slate-900 sm:text-sm sm:w-28">{label}：</span>
              <span className="text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">{text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 常见问题解答 */}
      <section className="rounded-2xl border border-rose-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <HelpCircle className="h-5 w-5 text-rose-600" />
          常见问答与疑难解答
        </h3>
        <div className="mt-4 space-y-3">
          {faqs.map((faq) => (
            <details
              key={faq.q}
              className="group rounded-xl border border-rose-100 bg-rose-50/20 p-4 transition open:bg-rose-50/40"
            >
              <summary className="flex cursor-pointer items-center justify-between font-semibold text-slate-900 text-xs sm:text-sm">
                <span>{faq.q}</span>
                <span className="ml-2 text-rose-600 transition group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-2 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 底部客服咨询条 */}
      <div className="flex flex-col gap-4 rounded-2xl border border-rose-200/90 bg-gradient-to-r from-rose-50 via-amber-50 to-rose-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1">
          <div className="text-sm font-bold text-slate-950 sm:text-base">
            需要了解更多日本乐天移动使用细节或日淘风控技巧？
          </div>
          <p className="text-xs text-slate-600 sm:text-sm">
            本站为您提供全流程卡片使用指引与售后支持，保障您的境外卡片长期安全稳定持有。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openPublicSupport}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 sm:text-sm"
          >
            <span>联系在线客服确认</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
