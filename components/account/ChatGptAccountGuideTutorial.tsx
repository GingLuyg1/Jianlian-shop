"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Download,
  ExternalLink,
  KeyRound,
  Lock,
  LogOut,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import tutorial from "@/components/account/TutorialsGlass.module.css";
import { openPublicSupport } from "@/lib/support/open-public-support";

export type ChatGptTutorialSection = "login" | "security" | "rebind" | "anti-ban";

interface ChatGptTutorialProps {
  activeSection?: ChatGptTutorialSection;
  onSelectSection?: (section: ChatGptTutorialSection) => void;
}

export default function ChatGptAccountGuideTutorial({
  activeSection,
  onSelectSection,
}: ChatGptTutorialProps) {
  const [internalSection, setInternalSection] = useState<ChatGptTutorialSection>("login");
  const currentSection = activeSection ?? internalSection;

  const handleSelect = (sec: ChatGptTutorialSection) => {
    if (onSelectSection) onSelectSection(sec);
    else setInternalSection(sec);
  };

  const sections: { id: ChatGptTutorialSection; label: string; icon: any }[] = [
    { id: "login", label: "登录与 2FA 验证", icon: KeyRound },
    { id: "security", label: "改密与安全设置", icon: Lock },
    { id: "rebind", label: "设备与 2FA 换绑", icon: LogOut },
    { id: "anti-ban", label: "防封与保号指南", icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6">
      {/* 顶部章节切换导航 */}
      <div className="sticky top-0 z-10 -mx-1 flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-sm backdrop-blur-md">
        {sections.map((item) => {
          const Icon = item.icon;
          const isActive = currentSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                isActive
                  ? "bg-slate-900 text-white shadow"
                  : "bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-emerald-400" : "text-slate-400"}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* 章节内容区 */}
      {currentSection === "login" && <LoginSection />}
      {currentSection === "security" && <SecuritySection />}
      {currentSection === "rebind" && <RebindSection />}
      {currentSection === "anti-ban" && <AntiBanSection />}

      {/* 底部客服与支持 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900">遇到账号登录、改密或验证异常？</h4>
            <p className="mt-0.5 text-xs text-slate-500">
              本站提供 24 小时首发质保服务，如需协助或卡密咨询，请随时联系在线客服。
            </p>
          </div>
          <button
            type="button"
            onClick={openPublicSupport}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
          >
            <span>联系在线客服</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>
    </div>
  );
}

// ── 章节一：登录与 2FA 验证 ─────────────────────────────────
function LoginSection() {
  const loginSteps: Array<{
    num: string;
    title: string;
    desc: React.ReactNode;
    image: string;
    note: string;
  }> = [
    {
      num: "1",
      title: "进入官网并输入账号邮箱",
      desc: (
        <>
          在纯净海外网络环境下打开{" "}
          <a
            href="https://chatgpt.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-primary underline underline-offset-2 hover:opacity-85"
          >
            ChatGPT 官网
          </a>
          ，点击「Log in」登录按钮，在输入框填入订单交付格式中的【邮箱地址】，点击「Continue」继续。
        </>
      ),
      image: "/assets/tutorials/chatgpt/gpt-login-email.png",
      note: "提示：切勿点击 Google / Apple 授权快捷登录，请直接在下方文本框输入交付的独立邮箱。",
    },
    {
      num: "2",
      title: "输入初始登录密码",
      desc: "在「Enter your password」页面，将卡密中的【密码】完整复制粘贴至密码框中，确认无前后多余空格后点击「Continue」。",
      image: "/assets/tutorials/chatgpt/gpt-login-password.png",
      note: "复制密码时注意核对大小写及特殊字符，建议先粘贴到记事本确认。",
    },
    {
      num: "3",
      title: "在线获取 2FA 动态验证码",
      desc: (
        <>
          复制交付格式中的【2FA 密钥】，打开在线双重身份验证器（如{" "}
          <a
            href="https://2fa.live"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-primary underline underline-offset-2 hover:opacity-85"
          >
            2fa.live
          </a>{" "}
          或{" "}
          <a
            href="https://2fa.run"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-primary underline underline-offset-2 hover:opacity-85"
          >
            2fa.run
          </a>{" "}
          等网页版验证器，也可使用 Google Authenticator App），将 2FA 密钥粘贴到输入框中。
        </>
      ),
      image: "/assets/tutorials/chatgpt/gpt-2fa-input-key.jpg",
      note: "2FA 密钥通常为 32-64 位的纯英文字母与数字组合，一人一密钥。",
    },
    {
      num: "4",
      title: "点击获取并复制 6 位实时验证码",
      desc: "在 2FA 验证器中点击「Get Codes」按钮，系统会立即计算并显示 6 位时效动态数字（通常 30 秒有效），点击复制该 6 位验证码。",
      image: "/assets/tutorials/chatgpt/gpt-2fa-get-code.jpg",
      note: "动态码倒计时小于 5 秒时建议等待下一个 30 秒周期的新码，避免提交时刚好过期失效。",
    },
    {
      num: "5",
      title: "回填 6 位动态验证码完成登录",
      desc: "回到 ChatGPT 登录页面，在「Check your authenticator app」下方的 One-time code 输入框中填入刚刚复制的 6 位数字验证码，点击「Continue」。",
      image: "/assets/tutorials/chatgpt/gpt-2fa-verify-code.png",
      note: "如果提示 Code invalid，重新在 2FA 工具中复制最新生成的 6 位码再次尝试即可。",
    },
    {
      num: "6",
      title: "成功进入 ChatGPT 对话主界面",
      desc: "通过验证后即可进入主页面。点击左下角可查看账号名称与 Plus 尊享权益状态，可畅享 GPT-4o、o1 等全模型交互。",
      image: "/assets/tutorials/chatgpt/gpt-main-overview.png",
      note: "首次登录成功后，建议保持当前设备与浏览器窗口，按照第二章节教程修改密码提升账户独占安全性。",
    },
  ];

  return (
    <div className="space-y-6">
      {/* 交付格式卡片 */}
      <section className="rounded-2xl border border-orange-200/90 bg-gradient-to-br from-orange-50 via-amber-50/40 to-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-primary">
          <KeyRound className="h-5 w-5" />
          <h3 className="text-base font-bold text-slate-900">看懂 ChatGPT 成品号交付格式</h3>
        </div>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          购买成功后，订单详情或卡密提取信息通常包含 4 段关键内容（以四个横杠 ---- 或竖线 | 分隔）：
        </p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-orange-200 bg-white/90 p-3 font-mono text-xs text-slate-800 shadow-inner">
          <div className="text-slate-400">// 标准交付格式示例</div>
          <div className="mt-1 font-semibold text-primary">
            user_example@gmail.com ---- Passwd1234 ---- 3H5HRIM7SZHRFSJ22YMHO ---- EmailPasswd
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500 sm:grid-cols-4">
            <div>① 账号/登录邮箱</div>
            <div>② 登录初始密码</div>
            <div>③ 2FA 动态密钥</div>
            <div>④ 辅助邮箱初始密码</div>
          </div>
        </div>
      </section>

      {/* 步骤列表 */}
      <div className="space-y-6">
        {loginSteps.map((step) => (
          <section
            key={step.num}
            className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white shadow-sm">
                {step.num}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 sm:text-base">{step.title}</h4>
                <p className="mt-1 text-xs leading-6 text-slate-600 sm:text-sm">{step.desc}</p>
              </div>
            </div>

            {/* 配图 */}
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-2 sm:p-3">
              <img
                src={step.image}
                alt={step.title}
                className="mx-auto max-h-[380px] w-auto max-w-full rounded-lg object-contain shadow-sm"
                loading="lazy"
              />
            </div>

            <div className="mt-3 rounded-lg border border-amber-200/60 bg-amber-50/70 p-2.5 text-xs text-amber-800">
              <strong>关键提示：</strong> {step.note}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ── 章节二：修改密码与安全设置 ─────────────────────────────────
function SecuritySection() {
  const securitySteps = [
    {
      num: "1",
      title: "进入个人设置中心",
      desc: "在 ChatGPT 左下角点击用户名称/头像，在弹出的系统菜单中点击「Settings」（设置）选项。",
      image: "/assets/tutorials/chatgpt/gpt-settings-entry.png",
    },
    {
      num: "2",
      title: "选择账户安全与登录",
      desc: "在设置面板左侧导航栏中找到「账户安全与登录」（Security），然后在右侧主区域点击「密码 / Password」一栏进入改密页面。",
      image: "/assets/tutorials/chatgpt/gpt-security-password-entry.jpg",
    },
    {
      num: "3",
      title: "验证当前密码本人身份",
      desc: "系统会弹出安全核验页面「请先验证是你本人」，在输入框中输入交付给您的【当前初始密码】，点击「继续」。",
      image: "/assets/tutorials/chatgpt/gpt-verify-current-pwd.jpg",
    },
    {
      num: "4",
      title: "设置并确认您的新密码",
      desc: "在「更改密码」页面，输入您自定义的新密码，并在第二行重新输入确认新密码，点击「继续」。",
      image: "/assets/tutorials/chatgpt/gpt-set-new-pwd.jpg",
    },
    {
      num: "5",
      title: "安全二次确认（2FA 验证）",
      desc: "密码提交后，OpenAI 会要求进行身份验证器二次核验。使用 2FA 工具获取最新 6 位动态码填入，改密即正式生效完成！",
      image: "/assets/tutorials/chatgpt/gpt-pwd-2fa-confirm.jpg",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-sky-200/90 bg-gradient-to-br from-sky-50 via-white to-sky-50/30 p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sky-700">
          <Lock className="h-5 w-5" />
          <h3 className="text-base font-bold text-slate-900">为什么要第一时间修改密码？</h3>
        </div>
        <p className="mt-1 text-xs leading-6 text-slate-600 sm:text-sm">
          购买成品号后，修改密码可确保该账号由您唯一独占掌控。请务必牢记修改后的新密码，建议使用密码管理器（如 1Password / Bitwarden）妥善保存。
        </p>
      </section>

      <div className="space-y-6">
        {securitySteps.map((step) => (
          <section
            key={step.num}
            className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-xs font-bold text-white shadow-sm">
                {step.num}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 sm:text-base">{step.title}</h4>
                <p className="mt-1 text-xs leading-6 text-slate-600 sm:text-sm">{step.desc}</p>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-2 sm:p-3">
              <img
                src={step.image}
                alt={step.title}
                className="mx-auto max-h-[380px] w-auto max-w-full rounded-lg object-contain shadow-sm"
                loading="lazy"
              />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ── 章节三：踢出陌生设备与 2FA 换绑 ──────────────────────────────
function RebindSection() {
  const steps = [
    {
      num: "1",
      title: "退出所有已登录会话（剔除陌生设备）",
      desc: "在「账户安全与登录」页面的最下方找到「活跃会话」，点击进入会话列表，点击「全部退出登录 / Log out of all devices」。此操作可立即强制下线除当前浏览器以外的所有未知历史登录会话，彻底清除任何潜在残留风险。",
      images: [
        "/assets/tutorials/chatgpt/gpt-logout-devices-1.png",
        "/assets/tutorials/chatgpt/gpt-logout-devices-2.png",
      ],
    },
    {
      num: "2",
      title: "关闭旧的 2FA 身份验证器",
      desc: "在「多因素身份验证 (MFA)」区域，找到「Authenticator app」，将右侧开关切换至关闭状态，并在确认弹窗中点击「移除 / Remove」。",
      images: [
        "/assets/tutorials/chatgpt/gpt-mfa-toggle-off.jpg",
        "/assets/tutorials/chatgpt/gpt-mfa-remove-confirm.jpg",
      ],
    },
    {
      num: "3",
      title: "绑定属于您自己的手机 2FA 验证器",
      desc: "移除旧验证器后，再次点击开启 Authenticator app。系统会展示专属二维码和新密钥，打开手机上的 Google Authenticator 或微软验证器扫码绑定，输入最新 6 位动态码确认完成换绑。",
      images: [
        "/assets/tutorials/chatgpt/gpt-2fa-rebind-1.png",
        "/assets/tutorials/chatgpt/gpt-2fa-rebind-2.png",
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/30 p-5 shadow-sm">
        <div className="flex items-center gap-2 text-emerald-800">
          <LogOut className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-bold text-slate-900">会话清理与 2FA 专属化</h3>
        </div>
        <p className="mt-1 text-xs leading-6 text-slate-600 sm:text-sm">
          完成剔除设备和换绑 2FA 后，该账号的动态验证码将直接生成在您自己的手机 App 上，无需再依赖网页版 2FA 在线生成器，安全性达到官方最高标准。
        </p>
      </section>

      <div className="space-y-6">
        {steps.map((step) => (
          <section
            key={step.num}
            className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-xs font-bold text-white shadow-sm">
                {step.num}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 sm:text-base">{step.title}</h4>
                <p className="mt-1 text-xs leading-6 text-slate-600 sm:text-sm">{step.desc}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {step.images.map((img, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-2">
                  <img
                    src={img}
                    alt={`${step.title} 配图 ${i + 1}`}
                    className="mx-auto max-h-[300px] w-auto max-w-full rounded-lg object-contain shadow-sm"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ── 章节四：防封与保号实战指南 ─────────────────────────────────
function AntiBanSection() {
  const rules = [
    {
      title: "规则一：节点纯净度是生命线",
      desc: "绝不要使用公共免费节点或低端万人骑机房机场（数据中心 IP / Data Center IP）。OpenAI 对 Cloudflare 和机房 ASN 有严密的信誉评分体系，推荐使用高质量独享海外住宅 IP（ISP 原生家宽）或者信誉良好的小众节点。固定在同一国家或地区，严禁短时间内在不同国家频繁切换跨洲漂移！",
    },
    {
      title: "规则二：指纹浏览器独立环境隔离",
      desc: "严禁在同一普通浏览器窗口下同时登录多个 ChatGPT 账号！浏览器指纹（Canvas、AudioContext、WebGL、字体库及 Cookie）会产生交集风控关联，一旦其中一个账号被审查，同一指纹下的所有账号均会被批量标记封禁。推荐使用指纹浏览器（如 AdsPower、Hubstudio）或 Chrome 新建独立 Profile 配置专属代理环境独立登录。",
    },
    {
      title: "规则三：新号前 24 小时养号静置期",
      desc: "新购账号首次登录后，建议先进行常规慢速提问（正常对话交互 2-3 轮），切忌刚拿到账号便立即配置高频 API 并发调用、大规模爬虫或连续生成违规敏感内容。给账号一个自然融入的时间段，建立高信誉度使用画像。",
    },
    {
      title: "规则四：遇手机二次接码验证，使用本站真实实体 SIM 卡",
      desc: "OpenAI 会不定期抽检账号环境，要求验证海外手机号。切勿使用网络上免费的公共虚拟短信接收平台（接码池已被严重拉黑污染，输入即触发封号）。本站提供英国 giffgaff、新西兰 One NZ 等真实海外物理运营商 SIM 卡，国内直接免月租免费收短信，安全度极高。",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-amber-900">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
          <h3 className="text-base font-bold text-slate-900">OpenAI 官方风控机制与封号根源</h3>
        </div>
        <p className="mt-1 text-xs leading-6 text-slate-600 sm:text-sm">
          账号被封（Access Denied / Account Deactivated）99% 均源于<strong>「恶劣代理 IP 污染」</strong>与<strong>「多账号浏览器指纹混用」</strong>。遵循以下 4 项原则可保障账号稳定长久存活：
        </p>
      </section>

      <div className="space-y-4">
        {rules.map((rule, idx) => (
          <div
            key={idx}
            className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:p-5"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">
              {idx + 1}
            </span>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-slate-900">{rule.title}</h4>
              <p className="mt-1 text-xs leading-6 text-slate-600 sm:text-sm">{rule.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 快捷通道 */}
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 p-5 text-white shadow-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-amber-400" />
              <h4 className="text-sm font-bold sm:text-base">需要海外手机号接码验证？</h4>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              本站提供英国 Giffgaff、新西兰 One NZ 实体 SIM 卡，国内 0 月租免费接收验证码短信。
            </p>
          </div>
          <Link
            href="/products/sim-cards"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-semibold text-slate-950 shadow transition hover:bg-amber-400"
          >
            <span>选购国际 SIM 卡接码</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
