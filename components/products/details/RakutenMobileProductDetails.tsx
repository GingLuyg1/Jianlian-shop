"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Flame,
  Globe,
  HelpCircle,
  Lock,
  MessageSquare,
  Play,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Truck,
  Video,
  XCircle,
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
  const comparisonItems = [
    {
      target: "Mercari (日本煤炉)",
      problem: "严格审查运营商 HLR 数据库，虚拟号/漫游号秒封",
      solution: "乐天正规日本移动网络原生号段，秒过短信验证与实名风控",
      status: "原生高信誉秒过",
    },
    {
      target: "LINE 日本本土版",
      problem: "限制仅限日本本土手机号绑定，非本土号码无法启用全功能",
      solution: "本土 +81 原生实体卡直接注册，稳定不掉线",
      status: "原生适配",
    },
    {
      target: "eplus / 演唱会抽票",
      problem: "必须日本手机短信双向验证或专用通话校验",
      solution: "正规日本三大运营商级别信誉，海淘抽票必备神器",
      status: "抽票必备",
    },
    {
      target: "日区 Apple ID / 日服手游",
      problem: "转区及二步验证频繁风控，海外虚拟号容易受限",
      solution: "绑定日本原生手机号，彻底解除日区 App 锁区限制",
      status: "畅行无阻",
    },
  ];

  const apnParameters = [
    { key: "APN (接入点名称)", val: "rakuten.jp" },
    { key: "用户名 / 密码", val: "留空（无需填写）" },
    { key: "APN 类型", val: "default,supl" },
    { key: "APN 协议", val: "IPv4 / IPv6" },
  ];

  return (
    <div className="mt-8 w-full space-y-6">
      {/* 科技极客黑曜红主卡：日系双栏信息流 */}
      <section className="relative overflow-hidden rounded-3xl border border-rose-500/30 bg-gradient-to-br from-slate-950 via-[#180a0e] to-slate-900 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-rose-600/15 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-red-600/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3 lg:max-w-xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/20 px-3 py-1 text-xs font-bold text-rose-300">
                <Globe className="h-3.5 w-3.5" />
                <span>+81 日本本土正规运营商纯净号段</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>无需大陆实名 · 保护隐私</span>
              </span>
            </div>

            <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              日本乐天移动 Rakuten Mobile 原生实体 SIM 卡
            </h2>
            <p className="text-xs leading-relaxed text-slate-300 sm:text-sm">
              告别虚拟号被秒封的困扰！采用日本大型电信运营商乐天移动（Rakuten）原生实体芯片，专为日本二手煤炉 (Mercari)、LINE、演唱会抽票、Yahoo 日拍及日区 Apple ID 打造，国内自动漫游中国移动/联通网络，免费畅收短信验证码。
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 border border-white/10">
                <Truck className="h-3.5 w-3.5 text-rose-400" />
                <span>默认包邮发货（加急顺丰可联系客服）</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 border border-white/10">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>三合一免剪卡槽 · 全网通手机通用</span>
              </span>
            </div>
          </div>

          {/* 右侧：官方高清实操演示视频直通入口（用户要求不直接内嵌大播放器，改用高交互引导卡） */}
          <div className="flex shrink-0 flex-col justify-between rounded-2xl border border-rose-500/30 bg-rose-950/40 p-5 backdrop-blur-md lg:w-72">
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-300">
                  <Flame className="h-4 w-4 text-rose-400" />
                  官方保姆级指导
                </span>
                <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
                  时长 3:06
                </span>
              </div>
              <h3 className="mt-2 text-sm font-bold text-white">乐天卡安装与网络配置实操视频</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                包含插卡细节、APN 设置与搜网避坑要点，一分钟快速上手。
              </p>
            </div>

            <Link
              href="/tutorials?topic=rakuten-mobile"
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg transition hover:from-rose-500 hover:to-red-500"
            >
              <Play className="h-3.5 w-3.5 fill-white" />
              <span>进入教程观看实操视频</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* 核心风控对比看板：为什么必须用乐天原生实体卡？ */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
              <Zap className="h-5 w-5 text-rose-600" />
              为什么日区高风控平台必须使用日本原生实体卡？
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              日本严苛网络审查机制对比：虚拟接码平台 vs 乐天原生实体 SIM 卡
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
            <Radio className="h-3.5 w-3.5 animate-pulse text-rose-600" />
            实测高风控高通过率
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {comparisonItems.map((item) => (
            <div
              key={item.target}
              className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition hover:border-rose-200 hover:bg-rose-50/20"
            >
              <div>
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
                  <span className="text-sm font-bold text-slate-900">{item.target}</span>
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                    {item.status}
                  </span>
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-start gap-1.5 text-slate-500">
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                    <span>普通接码：{item.problem}</span>
                  </div>
                  <div className="flex items-start gap-1.5 font-medium text-slate-800">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>乐天实体：{item.solution}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 终端风格 APN 与极简搜网指南 */}
      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-5 text-white shadow-md sm:p-7">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Terminal className="h-5 w-5 text-rose-400" />
          <h3 className="text-base font-bold text-white">APN 参数速查 & 网络配置指引</h3>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* APN 参数 */}
          <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs font-mono">
            <div className="mb-2 text-xs font-sans font-semibold text-rose-300">
              [ 备用手动 APN 参数（如未自动识别时配置） ]
            </div>
            {apnParameters.map((p) => (
              <div key={p.key} className="flex items-center justify-between border-b border-white/5 py-1">
                <span className="text-slate-400">{p.key}：</span>
                <span className="font-bold text-white">{p.val}</span>
              </div>
            ))}
          </div>

          {/* 新手插卡避坑提醒 */}
          <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-xs leading-relaxed text-slate-200">
            <div className="flex items-center gap-2 font-bold text-red-400">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-400" />
              <span>插卡必看两大安全法则：</span>
            </div>
            <div className="mt-2 space-y-2 text-slate-300">
              <p>
                <strong className="text-white">1. 插卡前关闭数据漫游：</strong>
                国内接收验证码完全免费且不需要开漫游流量，请在手机蜂窝设置中保持【关闭数据漫游】，杜绝后台偷跑扣费。
              </p>
              <p>
                <strong className="text-white">2. iPhone 提示激活 iMessage 点击【取消】：</strong>
                如遇弹窗询问是否发送激活短信，果断点击取消即可正常使用，误点“好”会触发扣费。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 底部客服技术支持横幅 */}
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
