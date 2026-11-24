"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Film,
  Globe,
  HelpCircle,
  Play,
  Radio,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Video,
  Zap,
} from "lucide-react";

export default function RakutenMobileTutorial() {
  const steps = [
    {
      num: "01",
      title: "【极度重要】插卡前关闭数据漫游",
      desc: "在手机蜂窝网络设置中，务必确认【关闭数据漫游】。平时在国内接收验证码完全不需要开流量，关闭可彻底防止后台 App 偷跑国际流量产生扣费。",
    },
    {
      num: "02",
      title: "装入 Nano SIM 手机卡槽",
      desc: "取下 Nano 最小规格芯片放入卡槽 1（建议使用无锁全网通机型，双卡手机建议优先卡槽 1）。",
    },
    {
      num: "03",
      title: "开机自动搜网与信号注册",
      desc: "开机后等待 1~3 分钟，手机将自动漫游接入中国移动或中国联通 4G/5G 网络，状态栏出现正常信号。",
    },
    {
      num: "04",
      title: "畅享日区各类应用与验证码接收",
      desc: "在煤炉 Mercari、Line、演唱会抽票、日区 Apple ID 等平台填写您的 +81 手机号码，秒速接收短信验证码。",
    },
  ];

  const apnSettings = [
    ["APN (接入点名称)", "rakuten.jp"],
    ["用户名 (User)", "无需填写（留空）"],
    ["密码 (Password)", "无需填写（留空）"],
    ["APN 类型", "default,supl"],
    ["APN 协议", "IPv4/IPv6"],
  ];

  return (
    <div className="space-y-6">
      {/* 顶部标题横幅 */}
      <section className="relative overflow-hidden rounded-3xl border border-rose-300/40 bg-gradient-to-br from-red-600 via-rose-700 to-slate-950 p-6 text-white shadow-md sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-md">
            <Globe className="h-3.5 w-3.5 text-rose-200" />
            <span>日本本土原生 +81 本土号段</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/40 bg-rose-500/25 px-3 py-1 text-xs font-bold text-rose-100">
            <Sparkles className="h-3.5 w-3.5 text-rose-300" />
            <span>日淘海淘 · 煤炉 Mercari · 抽票神卡</span>
          </span>
        </div>

        <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
          日本乐天移动 Rakuten Mobile 安装配置教程
        </h1>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-rose-100/90 sm:text-sm">
          本文汇总日本乐天移动原生实体 SIM 卡从收到卡片、插卡防扣费、搜网激活到 iOS / Android APN 配置的全套图文实操指引。
        </p>
      </section>

      {/* 原生图文：iOS 与 Android 实操网络配置指南 */}
      <section className="overflow-hidden rounded-3xl border border-rose-200/90 bg-gradient-to-b from-slate-900 to-slate-950 text-white shadow-lg">
        <div className="border-b border-white/10 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-600 text-white shadow-sm">
                <Smartphone className="h-4.5 w-4.5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white sm:text-base">
                  乐天移动 iOS / Android 双端插卡与搜网实操要点
                </h2>
                <p className="text-[11px] text-slate-400">
                  包含：插卡准备、国内漫游选网、短信接收验证与信号排错步骤
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/20 px-3 py-1 text-xs font-medium text-rose-300">
              <CheckCircle2 className="h-3 w-3" />
              图文标准规范
            </span>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-bold text-rose-300">Step A · iOS (iPhone) 设置</div>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              插入 SIM 卡后若弹出「激活 iMessage 与 FaceTime」提示，请点击<strong>【取消】</strong>。随后进入「设置 → 蜂窝网络」，确认<strong>关闭数据漫游</strong>，等待状态栏自动接入中国移动或中国联通信号。
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-bold text-rose-300">Step B · Android (安卓) 设置</div>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              建议将 SIM 卡装入<strong>卡槽 1</strong>。进入「设置 → 移动网络」，确认<strong>关闭数据漫游</strong>。如遇未自动出信号，可关闭「自动选择网络」，手动选择「中国移动」或「中国联通」。
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-bold text-rose-300">Step C · 接收日区平台验证码</div>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              驻网成功后即可免费接收短信。在 Mercari 煤炉、Line、日区 Apple ID 或票务平台填写您的 <code className="rounded bg-white/10 px-1 font-mono text-rose-200">+81</code>（或 <code className="rounded bg-white/10 px-1 font-mono text-rose-200">070/080/090</code>）号码即可秒收验证码。
            </p>
          </div>
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

      {/* 四步简明操作指引 */}
      <section className="rounded-2xl border border-rose-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <Zap className="h-5 w-5 text-rose-600" />
          插卡与搜网四步流程
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {steps.map((st) => (
            <div
              key={st.num}
              className="rounded-xl border border-rose-100 bg-rose-50/20 p-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold text-rose-600">{st.num}</span>
                <span className="text-sm font-bold text-slate-900">{st.title}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">{st.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* APN 配置说明（备用） */}
      <section className="rounded-2xl border border-rose-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <Smartphone className="h-5 w-5 text-rose-600" />
          备用：APN (接入点) 设置参数
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          大多数手机插入后会自动完成配置。如遇部分机型未自动识别，可手动在手机蜂窝网络设置中填入以下 APN 参数：
        </p>
        <div className="mt-4 space-y-2">
          {apnSettings.map(([k, v]) => (
            <div
              key={k}
              className="flex flex-col rounded-xl border border-rose-100 bg-rose-50/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-xs font-bold text-slate-800 sm:text-sm">{k}</span>
              <code className="text-xs font-mono font-bold text-rose-700 sm:text-sm">{v}</code>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
