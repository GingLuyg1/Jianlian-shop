"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Code2,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Github,
  HelpCircle,
  KeyRound,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { openPublicSupport } from "@/lib/support/open-public-support";

export default function GoogleQrSmsTutorial() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(label);
    toast.success(`已复制 ${label}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-8 select-none">
      {/* 1. 顶部 Hero Banner：项目介绍与一键极速下载 */}
      <section className="relative overflow-hidden rounded-3xl border border-blue-200/80 bg-gradient-to-br from-[#f0f6ff] via-white to-[#e8f1ff] p-6 text-slate-900 shadow-md sm:p-8">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 pb-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/90 px-3.5 py-1 text-xs font-bold text-blue-700 shadow-2xs">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              <span>Google 官方降级协议 · 极客开源扩展</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs text-slate-500">
              <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700 font-bold">
                Manifest V3
              </span>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700 font-bold">
                v1.1.0 Stable
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              Google 扫码降级为短信验证码神器
            </h1>
            <p className="max-w-2xl text-xs sm:text-sm font-medium leading-relaxed text-slate-600">
              解决 Google 桌面端强制要求跨设备手机扫码（MO-SMS / GMS 国际短信）卡死难题。
              通过 Chrome 扩展 <strong>Google QR SMS Helper</strong>，一键无损降级回传统的「输入手机号接收 6 位验证码」流程！
            </p>
          </div>

          {/* 双操作按钮：本站一键直接下载 + GitHub 开源仓库 */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href="/downloads/google-qr-sms-helper-v1.1.0.zip"
              download="google-qr-sms-helper-v1.1.0.zip"
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition-all hover:scale-[1.02] hover:bg-blue-700 active:scale-[0.98]"
            >
              <Download className="h-4 w-4" />
              <span>本站极速下载 (v1.1.0 ZIP)</span>
            </a>
            <a
              href="https://github.com/havenicec/google-qr-sms-helper"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white/90 px-5 py-3 text-sm font-black text-slate-800 shadow-xs transition-all hover:scale-[1.02] hover:bg-slate-50 active:scale-[0.98]"
            >
              <Github className="h-4 w-4 text-slate-900" />
              <span>GitHub 开源主页</span>
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            </a>
          </div>
        </div>
      </section>

      {/* 2. 为什么需要这个工具？痛点对比解析 */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col gap-1 border-b border-slate-100 pb-4">
          <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-blue-600">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            <span>PAIN_POINT_ANALYSIS // 谷歌扫码风控拦路虎</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900">
            为什么桌面端频繁弹出无法通过的二维码？
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 text-xs sm:text-sm">
          <div className="rounded-2xl border border-rose-200/80 bg-rose-50/60 p-5 space-y-2">
            <div className="flex items-center gap-2 font-bold text-rose-900">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] text-white">
                ✕
              </span>
              <span>传统卡点：强制跨设备扫码 (MO-SMS)</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Google 在 PC 浏览器验证时，越来越强制推送 <code className="bg-rose-100 px-1 py-0.5 rounded text-rose-800">/v3/signin/challenge/iap/qrcode</code> 页面。
              扫码后要求手机向海外网关发送一条带验证码的国际短信，或者要求硬件绑定的海外 GMS Android 手机，国内用户和普通接码卡几乎 100% 卡死。
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-5 space-y-2">
            <div className="flex items-center gap-2 font-bold text-emerald-900">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">
                ✓
              </span>
              <span>本工具方案：官方 Fallback 降级短信验证</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              插件自动读取页面二维码中的验证 Token，模拟非 Android 移动设备触发 Google 官方的降级状态码 <code className="bg-emerald-100 px-1 py-0.5 rounded text-emerald-800">[3, null, 4]</code>。
              页面立即转为传统的「输入手机号接收 6 位验证码」，支持全球任意能够收短信的真实号码！
            </p>
          </div>
        </div>
      </section>

      {/* 3. 保姆级四步实操流程 */}
      <section className="space-y-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900">
            四步实操图文指南（保姆级）
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">全程仅需 2 分钟，无需敲写复杂代码。</p>
        </div>

        {/* 步骤 1：安装插件 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-600 text-xs font-black text-white">
              1
            </span>
            <h3 className="text-base font-bold text-slate-900">
              下载并安装 Google QR SMS Helper 扩展
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            点击上方按钮下载 <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-800">google-qr-sms-helper-v1.1.0.zip</code> 并解压为文件夹。
          </p>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 text-xs sm:text-sm space-y-2 text-slate-700">
            <div className="font-bold text-slate-900">Chrome / Edge 安装操作：</div>
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>
                浏览器地址栏输入：
                <button
                  type="button"
                  onClick={() => handleCopy("chrome://extensions/", "扩展管理地址")}
                  className="mx-1 inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 font-mono text-xs font-semibold text-blue-600 border border-slate-200 hover:bg-blue-50"
                >
                  chrome://extensions/
                  <Copy className="h-3 w-3" />
                </button>
                （Edge 用户可输入 <code className="font-mono text-xs text-blue-600">edge://extensions/</code>）。
              </li>
              <li>在扩展管理页面右上角，勾选开启<strong>「开发者模式」</strong>（Developer mode）。</li>
              <li>点击左上角<strong>「加载已解压的扩展程序」</strong>（Load unpacked）。</li>
              <li>选择刚才解压出来的 <code className="font-mono text-xs text-slate-800">google-qr-sms-helper</code> 文件夹即可安装完成。</li>
            </ol>
          </div>
        </div>

        {/* 步骤 2：Cloud Shell 入口 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-600 text-xs font-black text-white">
              2
            </span>
            <h3 className="text-base font-bold text-slate-900">
              访问 Google Cloud Console 触发官方验证流
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            登录您的 Google 账号，访问官方控制台页面：
          </p>
          <div className="pt-0.5">
            <a
              href="https://console.cloud.google.com/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <span>访问 https://console.cloud.google.com/</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 text-xs sm:text-sm space-y-2 text-slate-700">
            <div className="font-bold text-slate-900">核心触发操作：</div>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                在页面右上角导航栏中，点击<strong>「激活 Cloud Shell」</strong>图标（形状为 <code className="bg-slate-200 px-1 py-0.5 rounded font-mono font-bold">[&gt;_]</code> 终端符号）。
                <i>（也可以直接点击插件悬浮框上的快捷按钮「1. 自动点击 Cloud Shell 终端图标」）。</i>
              </li>
              <li>
                页面若弹出<strong>「需要验证您的身份」</strong>弹窗，点击蓝色的<strong>「验证」</strong>（Verify）按钮。
              </li>
              <li>
                此时系统将生成一个纯净且无嵌套 OAuth 重定向污染的官方升级流凭据（Continuation Token）。
              </li>
            </ul>
          </div>
        </div>

        {/* 步骤 3：一键降级 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500 text-xs font-black text-white">
              3
            </span>
            <h3 className="text-base font-bold text-slate-900">
              在二维码扫码页面，点击「⚡ 一键降级到短信选择框」
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            如果 Google 页面跳转到了扫码验证界面（URL 包含 <code className="bg-amber-100 px-1.5 py-0.5 rounded text-amber-900 font-mono text-xs">challenge/iap/qrcode</code>）：
          </p>
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs sm:text-sm space-y-2 text-amber-900">
            <div className="flex items-center gap-2 font-bold">
              <Zap className="h-4 w-4 text-amber-600" />
              <span>点击屏幕右下角的悬浮按钮：</span>
            </div>
            <p className="pl-6 font-medium">
              点击插件注入的绿色/高亮悬浮按钮<strong>「⚡ 一键降级到短信选择框」</strong>。
              插件将瞬间完成二维码本地解码与跨设备 fallback 协议锁定，约 1~2 秒后页面将自动重定向！
            </p>
          </div>
        </div>

        {/* 步骤 4：接收验证码 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-600 text-xs font-black text-white">
              4
            </span>
            <h3 className="text-base font-bold text-slate-900">
              输入手机号，接收 6 位验证码完成解锁
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            页面重定向后，将直接呈现经典的短信/语音验证码选择页（<code className="bg-emerald-50 px-1.5 py-0.5 rounded text-emerald-800 font-mono text-xs">uplevelingstep/selection</code>）：
          </p>
          <ul className="list-disc pl-5 text-xs sm:text-sm text-slate-700 space-y-1.5">
            <li>在选项中勾选<strong>「短信 (Text message / SMS)」</strong>。</li>
            <li>输入您的手机号码（支持您购买的实体 SIM 卡或自己的国内/海外手机号）。</li>
            <li>点击「下一步」，手机收到 <code className="font-mono font-bold text-emerald-700">G-xxxxxx</code> 6 位验证码后回填提交，即可彻底完成 Google 账号的身份验证！</li>
          </ul>
        </div>
      </section>

      {/* 4. 技术原理解密（针对极客用户） */}
      <section className="rounded-3xl border border-slate-800 bg-[#0d131f] p-6 text-white shadow-lg sm:p-8 font-mono">
        <div className="mb-4 flex items-center justify-between border-b border-slate-700/60 pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-blue-400" />
            <h2 className="text-base font-bold text-white tracking-wide">
              HOW_IT_WORKS // 核心降级协议原理解密
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">NON-ANDROID FALLBACK</span>
        </div>

        <div className="space-y-3 text-xs text-slate-300 font-sans">
          <p className="leading-relaxed">
            1. <strong>Native BarcodeDetector 解码</strong>：插件利用现代浏览器原生 DOM API 秒级捕获并解码网页内生成的二维码 Canvas/Img，提取出真实的 <code className="bg-slate-800 px-1 text-blue-300 font-mono">devicephoneverification/begin</code> 验证请求。
          </p>
          <p className="leading-relaxed">
            2. <strong>协议降级锁定</strong>：向 Google 后台发送 RPC 请求，主动上报非 Android 终端环境，促使 Google 服务端返回官方 Fallback 状态 <code className="bg-slate-800 px-1 text-emerald-300 font-mono">[3, null, 4]</code>。
          </p>
          <p className="leading-relaxed">
            3. <strong>iPadOS 全链路伪装</strong>：利用 Chrome 的 <code className="bg-slate-800 px-1 text-cyan-300 font-mono">declarativeNetRequest</code> 在整个身份验证链路上伪装为 iPad Mini（iOS），规避 Android GMS 的硬件静默短信强校验。
          </p>
        </div>
      </section>

      {/* 5. 技术交流与免责分享声明 */}
      <section className="rounded-3xl border border-orange-200/80 bg-gradient-to-br from-amber-50/80 via-orange-50/50 to-white p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/90 px-3 py-1 text-xs font-bold text-orange-800 shadow-2xs">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>技术分享与交流须知</span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900">
              教程仅供实操分享与经验交流
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
              本教程及配套开源辅助工具仅供网络运维实操与协议研究分享，旨在解析 Google 跨设备身份验证 Fallback 机制，不构成任何商业承诺或一对一技术代办。因第三方平台风控规则动态演进，若遇特定节点风控或运营商号段限制，建议优化网络环境或更换纯净号段实操。
            </p>
          </div>
          <div className="shrink-0 rounded-2xl border border-orange-100 bg-white/80 p-4 text-center text-xs font-semibold text-slate-600 shadow-2xs">
            <div className="text-primary font-bold">开放知识库</div>
            <div className="mt-1 text-slate-500">经验分享 · 自由探讨</div>
          </div>
        </div>
      </section>
    </div>
  );
}
