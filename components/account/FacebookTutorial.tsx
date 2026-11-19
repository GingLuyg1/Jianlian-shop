"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Globe2,
  Headphones,
  HelpCircle,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import TutorialImage from "@/components/account/TutorialImage";
import { openPublicSupport } from "@/lib/support/open-public-support";
import tutorial from "@/components/account/TutorialsGlass.module.css";

// 2FA 在线生成工具入口清单（直接提供超链接与多通道入口）
const twoFaTools = [
  {
    name: "2FA TOTP 生成器",
    domain: "2fa.cn",
    url: "https://2fa.cn/",
  },
  {
    name: "2FA TOTP 生成器",
    domain: "2fa.web-ai.top",
    url: "https://2fa.web-ai.top/",
  },
  {
    name: "2FA TOTP 生成器",
    domain: "2fa.show",
    url: "https://2fa.show",
  },
  {
    name: "2FA TOTP 生成器",
    domain: "2fa.live",
    url: "https://2fa.live",
  },
];

export default function FacebookTutorial() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(label);
      toast.success(`${label}已复制到剪贴板`);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch {
      toast.error("复制失败，请手动长按或选中复制");
    }
  };

  return (
    <div className="space-y-8">
      {/* 顶部标题与简介 */}
      <section className={tutorial.guideHero}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100/90 px-3 py-0.5 text-xs font-semibold text-blue-800">
            <Globe2 className="h-3.5 w-3.5" />
            Facebook (FB) 官方安全登录
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <CheckCircle2 className="h-3 w-3" />
            2FA 双重身份验证已实测
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Facebook 账号与 2FA 双重认证登录教程
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
          本教程详细拆解已开启 2FA（双重身份验证）的 Facebook 账号卡密格式、两步验证码生成与安全登录全流程。按标准步骤操作，可顺利避开“在另一台设备上检查通知”等设备拦截，确保 100% 成功登录。
        </p>
      </section>

      {/* 第一部分：发货卡密格式深度解析 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-orange-100 pb-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            1
          </span>
          <h2 className="text-lg font-bold text-slate-900">发货卡密格式与字段解析（必看）</h2>
        </div>

        <div className="rounded-2xl border border-orange-200/80 bg-orange-50/40 p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
            购买 Facebook 账号后，您收到的卡密通常以英文字符 <strong>竖线 <code>|</code></strong> 作为分割符号。请严格区分各字段，切勿将竖线复制进账号或密码中：
          </p>
          <div className="mt-3 rounded-xl border border-orange-200 bg-white p-3 font-mono text-xs sm:text-sm text-slate-800 break-all select-all">
            1000xxxxxxxxx|密码|2FA密钥|mail@example.com|c_user~xxxx;xs~xxxx...|Token 存活
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center gap-2 text-primary font-bold text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-xs">①</span>
              账号 (UID)
            </div>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              通常为一串纯数字（如 <code>61581247528965</code> 或 <code>1000xxxxxxxxx</code>），登录时直接填入账号输入框。
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center gap-2 text-primary font-bold text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-xs">②</span>
              登录密码
            </div>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              卡密中的第二个字段，复制时注意前后不要误带空格或分隔竖线。
            </p>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-2xs">
            <div className="flex items-center gap-2 text-blue-700 font-bold text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-xs">③</span>
              2FA 密钥 (两步密钥)
            </div>
            <p className="mt-2 text-xs text-blue-900 leading-relaxed">
              第三个字段，通常为一段大写英文字母与数字组合（如 <code>XXV2W57WJA3A...</code>），用于在下方 2FA 工具中实时生成 6 位验证码。
            </p>
          </div>
        </div>
      </section>

      {/* 第二部分：2FA TOTP 动态验证码生成工具矩阵（多入口卡片） */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-orange-100 pb-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            2
          </span>
          <h2 className="text-lg font-bold text-slate-900">2FA TOTP 动态验证码生成工具矩阵（多入口卡片）</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {twoFaTools.map((tool) => (
            <div
              key={tool.domain}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs transition-all hover:border-primary/40 hover:shadow-sm"
            >
              <a
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-w-0 flex-1 items-center gap-2.5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <KeyRound className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800 transition-colors group-hover:text-primary">
                    <span>{tool.name}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
                  </div>
                  <div className="font-mono text-xs text-slate-400 group-hover:text-primary/70">
                    {tool.domain}
                  </div>
                </div>
              </a>

              <button
                type="button"
                onClick={() => handleCopy(tool.url, tool.domain)}
                className="shrink-0 rounded-xl border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
                title="复制链接"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 第三部分：Facebook 2FA 登录实操步骤图解 */}
      <section className="space-y-6">
        <div className="flex items-center gap-2 border-b border-orange-100 pb-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            3
          </span>
          <h2 className="text-lg font-bold text-slate-900">FB 账号通过 2FA 安全登录 6 步指引</h2>
        </div>

        {/* 步骤 1 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              1
            </span>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">打开 Facebook 官网，输入账号与密码</h3>
          </div>
          <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
            打开 Facebook 登录页面（<code>facebook.com</code>）。在账号输入框中粘贴卡密中的 <strong>UID 纯数字账号</strong>，在密码输入框填入对应的密码，点击蓝色的 <strong>「Log In / 登录」</strong> 按钮。
          </p>
          <div className="mt-3.5">
            <TutorialImage
              src="/tutorials/facebook/fb_login_input.png"
              caption="步骤 1：输入 Facebook UID 与密码登录"
              width={750}
              height={420}
            />
          </div>
        </div>

        {/* 步骤 2 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              2
            </span>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">遇到“在另一台设备上检查通知”，点击「尝试其他方法」</h3>
          </div>
          <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
            由于是在新设备登录，系统会默认提示“我们已向您的设备发送了通知，请查看通知并同意登录后继续操作”。<strong>原设备已离线，无法收到任何通知</strong>。请直接点击下方的白色按钮：<strong>「尝试其他方法」</strong>。
          </p>
          <div className="mt-3.5">
            <TutorialImage
              src="/tutorials/facebook/fb_other_method.jpg"
              caption="步骤 2：切勿等待原设备批准，果断点击「尝试其他方法」"
              width={750}
              height={440}
            />
          </div>
        </div>

        {/* 步骤 3 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              3
            </span>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">选择验证方式，勾选「身份验证应用程序」</h3>
          </div>
          <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
            页面弹出“选择一种方式来确认您的身份”。请勾选第二项：<strong>「身份验证应用程序（从您的身份验证应用程序获取代码）」</strong>，然后点击底部蓝色的 <strong>「继续」</strong> 按钮。
          </p>
          <div className="mt-3.5">
            <TutorialImage
              src="/tutorials/facebook/fb_select_authenticator.jpg"
              caption="步骤 3：单选勾选「身份验证应用程序」，点击继续"
              width={750}
              height={460}
            />
          </div>
        </div>

        {/* 步骤 4 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              4
            </span>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">使用 2FA 工具，生成 6 位纯数字验证码</h3>
          </div>
          <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
            打开上述推荐的任意 2FA 工具（如 <code>2fa.cn</code>、<code>2fa.show</code> 或 <code>2fa.web-ai.top</code>）。将卡密中的 <strong>2FA 密钥</strong> 填入输入框，点击「提交」，系统即刻生成 6 位红色纯数字验证码（如 <code>942890</code>）。单击数字即可复制。
          </p>
          <div className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5 border border-amber-200/80">
            <strong>倒计时提醒</strong>：验证码剩余有效时间通常为 30 秒。若剩余时间低于 5 秒，建议等待生成下一轮新验证码再填入，防止网络延迟导致验证失败。
          </div>
          <div className="mt-3.5">
            <TutorialImage
              src="/tutorials/facebook/fb_2fa_generator.jpg"
              caption="步骤 4：在 2FA 生成器中输入两步密钥，实时获取 6 位动态验证码"
              width={750}
              height={460}
            />
          </div>
        </div>

        {/* 步骤 5 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              5
            </span>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">返回 Facebook，填入 6 位验证码提交</h3>
          </div>
          <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
            回到 Facebook 的“转到您的身份验证应用程序”页面，在代码输入框中粘贴刚才生成的 6 位验证码，点击蓝色的 <strong>「继续」</strong> 按钮。
          </p>
          <div className="mt-3.5">
            <TutorialImage
              src="/tutorials/facebook/fb_enter_code.jpg"
              caption="步骤 5：在代码框中填入 6 位数字验证码，点击继续"
              width={750}
              height={460}
            />
          </div>
        </div>

        {/* 步骤 6 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
              6
            </span>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">顺利进入 Facebook 首页，登录成功</h3>
          </div>
          <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
            验证通过后，页面直接跳转至 Facebook 首页。浏览器弹出“Remember Password（记住密码）”提示时，点击 <strong>「OK」</strong> 保存，便于下次自动登录。
          </p>
          <div className="mt-3.5">
            <TutorialImage
              src="/tutorials/facebook/fb_login_success.png"
              caption="步骤 6：成功登录 Facebook 首页，进入正常使用界面"
              width={750}
              height={420}
            />
          </div>
        </div>
      </section>

      {/* 第四部分：安全养号与防封禁避坑指南 */}
      <section className="rounded-2xl border border-amber-200/90 bg-amber-50/50 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-700" />
          <h2 className="text-base font-bold text-amber-900">Facebook 新号安全养号与防封禁避坑指南</h2>
        </div>

        <ul className="space-y-2.5 text-xs sm:text-sm text-amber-900/90 leading-relaxed">
          <li className="flex items-start gap-2">
            <span className="font-bold text-amber-700 shrink-0">① 固定网络与纯净 IP：</span>
            <span>切勿频繁切换代理节点国家或城市，推荐使用稳定的住宅原生 IP。频繁异地漂移最容易触发 FB 安全风控。</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold text-amber-700 shrink-0">② 前 48 小时静置冷启动：</span>
            <span>首次在新设备登录后，请勿立即修改绑定的邮箱、密码、头像，切勿立刻大规模加好友、发营销贴或加群，建议先正常浏览 3-5 分钟模拟真实用户。</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold text-amber-700 shrink-0">③ 妥善留存 2FA 密钥：</span>
            <span>卡密中的 2FA 密钥是您日后在新设备上再次登录该账号时的核心通行证，请务必保存在安全笔记或导入本地 Authenticator App 中。</span>
          </li>
        </ul>
      </section>

      {/* 第五部分：常见问题与排错 (FAQ) */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-orange-100 pb-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-slate-900">常见问题与排错 (FAQ)</h2>
        </div>

        <div className="grid gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <span className="text-primary font-bold">Q:</span> 提示“验证码错误或已失效”怎么办？
            </h3>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed pl-5 border-l-2 border-primary/30">
              2FA 验证码以 30 秒为一个计算周期。请检查您填入时是否刚好超过倒计时，建议在生成工具中等待新一轮 6 位数字出来后再复制填入；同时确保您当前电脑或手机的<strong>系统时间已开启“自动同步网络时间”</strong>（时间偏差超过 30 秒会导致计算出的验证码不匹配）。
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <span className="text-primary font-bold">Q:</span> 提示“账号或密码错误”？
            </h3>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed pl-5 border-l-2 border-primary/30">
              请仔细核对卡密文本。UID 账号为纯数字串，密码为第二个字段，检查复制时是否不小心多带了空格或竖线 <code>|</code> 分隔符。
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <span className="text-primary font-bold">Q:</span> 登录后提示要求验证手机号？
            </h3>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed pl-5 border-l-2 border-primary/30">
              这通常是因为当前网络节点被 Facebook 标记为高风险或万人骑机房 IP。请更换为干净的住宅原生 IP，清理浏览器 Cookie 或开启无痕模式重新登录。
            </p>
          </div>
        </div>
      </section>

      {/* 底部客服咨询入口 */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-orange-200/80 bg-gradient-to-r from-orange-50/60 to-white p-5">
        <div>
          <h3 className="text-sm font-bold text-slate-900">遇到 Facebook 账号或 2FA 登录疑难问题？</h3>
          <p className="mt-0.5 text-xs text-slate-500">联系在线客服，我们将协助您进行账号核验与登录排错指导。</p>
        </div>
        <button
          type="button"
          onClick={openPublicSupport}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-transform active:scale-95 hover:bg-primary/90"
        >
          <Headphones className="h-4 w-4" />
          <span>联系在线客服</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </section>
    </div>
  );
}
