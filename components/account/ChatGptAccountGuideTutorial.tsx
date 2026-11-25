"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  HelpCircle,
  KeyRound,
  LifeBuoy,
  Lock,
  LogOut,
  RefreshCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import tutorial from "@/components/account/TutorialsGlass.module.css";
import TutorialImage from "@/components/account/TutorialImage";
import { openPublicSupport } from "@/lib/support/open-public-support";

export type ChatGptTutorialSection = "login" | "security" | "rebind" | "anti-ban" | "unban";

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
    { id: "unban", label: "账号解封申诉教程", icon: LifeBuoy },
  ];

  return (
    <div className="space-y-6">
      {/* 仅在独立挂载（非教程目录页）时显示章节切换导航 */}
      {!onSelectSection ? (
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
      ) : null}

      {/* 章节内容区 */}
      {currentSection === "login" && <LoginSection />}
      {currentSection === "security" && <SecuritySection />}
      {currentSection === "rebind" && <RebindSection />}
      {currentSection === "anti-ban" && <AntiBanSection onSelectSection={handleSelect} />}
      {currentSection === "unban" && <UnbanSection />}

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
            user_example@gmail.com ---- Passwd1234 ---- JBSWY3DPEHPK3PXPEXAMPLESECRET2FA ---- EmailPasswd
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
function AntiBanSection({ onSelectSection }: { onSelectSection?: (section: ChatGptTutorialSection) => void }) {
  const rules = [
    {
      title: "规则一：节点纯净度是生命线",
      desc: "绝不要使用公共免费节点或高并发共享数据中心节点（Data Center IP）。OpenAI 对 Cloudflare 和数据中心 ASN 有严密的信誉评分体系，推荐使用高质量独享海外住宅 IP（ISP 原生家宽）或者信誉良好的专属节点。固定在同一国家或地区，严禁短时间内在不同国家频繁切换跨洲漂移！",
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

      {/* 账号解封申诉引导卡片 */}
      <div className="rounded-2xl border border-red-200/90 bg-gradient-to-br from-red-50/90 via-red-50/50 to-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
        <div>
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            账号不幸收到警告或被停用？
          </h4>
          <p className="mt-1 text-xs text-slate-600">
            不要慌张！只要未严重违反底层红线，大部分属于环境风控误伤，可通过官方渠道提交申诉申请解封。
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSelectSection?.("unban")}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-red-500 active:scale-95"
        >
          <span>查看官方解封申诉教程</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
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

// ── 通用复制按钮组件 ──────────────────────────────────────────
function CopyButton({ text, label = "复制英文模板" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-primary shadow-2xs transition hover:bg-orange-50 active:scale-95"
    >
      {copied ? (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          <span className="text-emerald-700 font-medium">已复制到剪贴板</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5 text-primary" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

// ── 章节五：ChatGPT 账号官方解封申诉全流程指南 ────────────────────────
function UnbanSection() {
  const warningAppealTemplate = `Hello OpenAI Support,

I received a warning on [收到警告的日期，例如: November 15, 2026] about "[警告中提到的原因，例如: Network Abuse]" on my ChatGPT account. The reference number is [邮件中的参考编号，如未提供可删除本句].

I am not sure which conversation or activity caused this warning. Could you please review my account and let me know what caused it, or provide more details if possible? I would like to understand the issue and strictly follow your usage policies.

Thank you for your help.`;

  const reasonAppealTemplate = `My account was unable to be used on [活动开始日期，例如: November 15, 2026], displaying "[错误信息，例如: Authentication error, your account has been deleted or deactivated]".

I believe this action was made in error and respectfully request it be reversed for the following reasons:
1. Compliance with Policies: My account has always been used strictly for legitimate purposes (such as personal learning, programming, and writing assistance) and has never engaged in any prohibited activities.
2. Lack of Specific Evidence: The notification did not specify which exact interaction or activity triggered the flag, nor was any supporting evidence provided.
3. Potential False Positive: If a system check was triggered by dynamic IP changes or network environment fluctuations, it was entirely unintentional and not a deliberate violation.

Please kindly conduct a manual review of my account and restore access. Thank you.`;

  const backgroundAppealTemplate = `Account Email: [被封账号邮箱]
Case Reference: [邮件中的 Case ID 如 C-xxxxxxxx，若无则填写 "None / Did not receive notification email"]
Timeline:
- [活动开始日期]: Unable to log in, received deactivation error prompt.
- [活动结束日期]: The account remains inaccessible to date.

Account Details:
- Intended Use: Personal research, study, and daily productivity.
- Subscription: [Plus / Free / Team，按实填写]
- Recent Usage: Normal conversational queries without any automated, bulk, or high-concurrency requests.

Diagnostic Information:
[原样粘贴登录报错页面下方的诊断代码 / Ray ID / Error Code；若无则填写 "No diagnostic code displayed"]

Request: Please verify whether this deactivation was caused by an automated false positive and assist in reactivating the account.`;

  const appealFormSteps = [
    {
      num: "①",
      title: "您想做什么？",
      action: "勾选第 1 项：对警告或账号停用提出申诉（Appealing an account warning or closure）",
      desc: "告知官方本次提交为账号复核申请，系统会自动转交 Trust & Safety 安全复核团队。",
    },
    {
      num: "②",
      title: "帐户电子邮件",
      action: "填写被封 ChatGPT 账号的注册邮箱",
      desc: "必须是接收 OpenAI 官方通知或绑定 ChatGPT 的原邮箱，以便客服快速定位账号。",
    },
    {
      num: "③",
      title: "受影响的 OpenAI 产品",
      action: "下拉列表中选择「ChatGPT」",
      desc: "明确是 ChatGPT 网页端/客户端服务受影响，避免工单被错分至 API 平台组。",
    },
    {
      num: "④",
      title: "您为什么申诉？",
      action: "选择「我的使用并未违反 OpenAI 的《使用政策》、《广告政策》或《使用条款》」",
      desc: "选第 1 项合法合规声明，强调自身为正常合规使用。",
    },
    {
      num: "⑤",
      title: "活动开始日期",
      action: "填写首次无法登录或出问题的具体日期（年/月/日）",
      desc: "例如：2026/11/15，用于定位风控日志产生的时间段。",
    },
    {
      num: "⑥",
      title: "活动结束日期",
      action: "至今仍处于停用状态：填写「今天」的日期",
      desc: "表明账号故障仍在持续中，需要官方介入恢复。",
    },
    {
      num: "⑦",
      title: "为什么应撤销警告或停用？",
      action: "填写撤销理由（请直接复制下方提供的【英文模板 1】）",
      desc: "陈述合规事实：日常合法用途、未收到具体证据、可能为网络 IP 误伤，请求人工复核。",
    },
    {
      num: "⑧",
      title: "更多补充背景信息",
      action: "填写账号环境与报错诊断代码（请直接复制下方提供的【英文模板 2】）",
      desc: "附上邮箱、案件号、时间线，并将登录报错界面底部的诊断代码原样粘贴进去。",
    },
  ];

  return (
    <div className="space-y-6">
      {/* 顶部导言卡片 */}
      <section className="relative overflow-hidden rounded-2xl border border-red-200/90 bg-gradient-to-br from-red-500/10 via-red-500/5 to-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <LifeBuoy className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                ChatGPT 账号官方解封申诉全流程指南
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                只要未触犯核心严重红线，OpenAI 误伤与风控波及均有极高概率申诉成功恢复！
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-800">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              常规误判 · 建议申诉
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 font-medium text-red-800">
              <AlertTriangle className="h-3 w-3 text-red-600" />
              严重底线违规 · 不可逆
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs leading-6 text-slate-600 sm:text-sm sm:leading-7">
          近期 OpenAI 针对账号的风控与清退频率明显提高。在着手尝试找回前，必须先厘清封禁的底层原因——触碰严重政策底线的情况属于“不可逆封禁”；而因节点波动、机房代理受牵连、绑卡扣费风控等常规误伤，官方均提供了正式的合规复核通道。
        </p>
      </section>

      {/* 一、 先看红线：判断你的账号能否解封 */}
      <section aria-labelledby="unban-rules" className="space-y-4">
        <h3 id="unban-rules" className="text-base font-bold text-slate-900 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[11px] font-bold">1</span>
          先看红线：判断你的账号是否可以解封
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 不可逆封禁 */}
          <div className="rounded-2xl border border-red-200/90 bg-red-50/40 p-4 sm:p-5 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>不可逆封禁（建议直接放弃，避免浪费时间）</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                如果封禁原因涉及官方核心底线，申诉通道会被系统自动拒绝或人工直接驳回：
              </p>
              <ul className="mt-2.5 space-y-1.5 text-xs text-slate-700 leading-5">
                <li className="flex items-start gap-1.5">
                  <span className="text-red-500 font-bold">•</span>
                  <span><strong>严重触犯《使用政策》：</strong>色情或成人违规、未成年人安全/剥削（CSAM 绝对零容忍）、自残暴力倾向、危险武器、欺诈钓鱼或大规模黑产垃圾信息。</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-red-500 font-bold">•</span>
                  <span><strong>触犯《服务条款》商业与技术红线：</strong>逆向工程、攻击官方接口、规避访问限制、高风险多人共享转售非企业版账号、滥用 API Key 进行破坏性请求。</span>
                </li>
              </ul>
            </div>
            <div className="mt-3 rounded-xl border border-red-200/80 bg-white/80 p-2.5 text-[11px] text-red-700">
              提示：后台记录若明确命中上述行为，账号恢复概率几乎为零，请直接止损。
            </div>
          </div>

          {/* 建议积极申诉 */}
          <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/40 p-4 sm:p-5 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>建议积极申诉（误伤与常规风控，大概率可解）</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                如果你属于以下“无辜躺枪”或风控波及类型，大概率只是触发了自动化防御规则：
              </p>
              <ul className="mt-2.5 space-y-1.5 text-xs text-slate-700 leading-5">
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span><strong>正常合规对话：</strong>什么都没违规，在正常学术、编程、日常对话中突然提示无法登录。</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span><strong>IP 或网络环境频繁漂移：</strong>网络环境不稳定或共享数据中心 IP 被连带风控限制。</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span><strong>支付风控误杀：</strong>新绑定海外卡或 Plus 订阅续费扣费时遭遇风控误杀。</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span><strong>号段受牵连：</strong>低价区订阅、注册环境异常但账号本体并无主观违规操作。</span>
                </li>
              </ul>
            </div>
            <div className="mt-3 rounded-xl border border-emerald-200/80 bg-white/80 p-2.5 text-[11px] text-emerald-800">
              提示：只要未违反底线原则，OpenAI 大概率都会解封，请按下方流程申诉！
            </div>
          </div>
        </div>
      </section>

      {/* 二、 情况 1：频繁 IP 更换或断连导致的警告邮件 (Policy Warning) */}
      <section aria-labelledby="unban-case1" className="space-y-4">
        <h3 id="unban-case1" className="text-base font-bold text-slate-900 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[11px] font-bold">2</span>
          情况 1：频繁 IP 更换或断连导致的警告邮件（Policy Warning）
        </h3>

        <div className="rounded-2xl border border-amber-200/80 bg-white p-4 sm:p-5 shadow-xs">
          <p className="text-xs leading-6 text-slate-600 sm:text-sm">
            这是因为频繁更换 IP 或网络节点经常断连漂移导致的预警。一般情况下官方会向注册邮箱发送警告邮件（常提示“网络虐待”或可疑活动）。在邮件中通常会直接提供「提出申诉」按钮，通过该按钮申诉通常 24 小时内即可撤销警告！
          </p>

          {/* 警告邮件与成功撤销对比图 */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-3">
              <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span>图 1：收到 OpenAI 警告通知邮件（含申诉按钮）</span>
              </div>
              <TutorialImage
                src="/tutorials/chatgpt/chatgpt_warning_email.jpg"
                width={579}
                height={900}
                caption="图 1：OpenAI 政策警告邮件，内含「提出申诉」按钮"
                previewClassName="mx-auto h-[320px] sm:h-[360px] w-auto max-w-full rounded-lg object-contain shadow-xs"
              />
            </div>
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-3">
              <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>图 2：申诉成功，官方确认误判并撤销警告</span>
              </div>
              <TutorialImage
                src="/tutorials/chatgpt/chatgpt_unban_success_email.png"
                width={533}
                height={680}
                caption="图 2：申诉成功，官方致歉并撤销警告通知"
                previewClassName="mx-auto h-[320px] sm:h-[360px] w-auto max-w-full rounded-lg object-contain shadow-xs"
              />
            </div>
          </div>

          {/* 申诉信模板 */}
          <div className="mt-4 rounded-xl border border-orange-200/80 bg-orange-50/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-primary" />
                警告申诉英文信模板（点击邮件内「提出申诉」按钮后填写）
              </span>
              <CopyButton text={warningAppealTemplate} label="复制警告申诉模板" />
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-orange-200/60 bg-white p-3 font-mono text-xs leading-relaxed text-slate-800">
              {warningAppealTemplate}
            </pre>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              * 填表提示：将模板中【】括起来的内容换成你收到的实际通知信息（如收到警告的日期、违规类别）；若邮件未给出参考编号（Reference Number），直接删除对应句子即可。一般约 1 个工作日便可得到官方答复并撤销警告！
            </p>
          </div>
        </div>
      </section>

      {/* 三、 情况 2：账号已被停用 / 删除（官方表单正式申诉） */}
      <section aria-labelledby="unban-case2" className="space-y-4">
        <h3 id="unban-case2" className="text-base font-bold text-slate-900 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[11px] font-bold">3</span>
          情况 2：登录报错已被删除或停用（官方表单正式申诉）
        </h3>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
          <p className="text-xs leading-6 text-slate-600 sm:text-sm">
            当登录 ChatGPT 遇到「身份验证错误：你的账户已被删除或停用」时，通常是因为低价区订阅、共享支付卡/设备、中转代理或批量号段连带风控所致。只要未违反严重红线，均可通过 OpenAI 官方申诉表单提交工单进行复核。
          </p>

          {/* 登录报错界面配图 */}
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-3">
            <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span>图 3：ChatGPT 登录身份验证错误报错界面</span>
            </div>
            <TutorialImage
              src="/tutorials/chatgpt/chatgpt_deactivated_error.png"
              width={680}
              height={448}
              caption="图 3：登录提示账户已被删除或停用报错界面"
              previewClassName="mx-auto h-[220px] sm:h-[260px] w-auto max-w-full rounded-lg object-contain shadow-xs"
            />
          </div>

          {/* 官方申诉表单直达通道 */}
          <div className="rounded-xl border border-sky-200/90 bg-gradient-to-r from-sky-50 to-blue-50/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-sky-600" />
                OpenAI 官方申诉表单入口
              </h4>
              <p className="mt-0.5 text-xs text-slate-600">
                官方申诉表单链接：<code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-sky-700 border border-sky-200">https://openai.com/form/appeal/</code>
              </p>
            </div>
            <a
              href="https://openai.com/form/appeal/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-sky-500 active:scale-95"
            >
              <span>打开官方申诉表单</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* 官方表单 8 步规范填写图解与步骤 */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              官方申诉表单 8 步填写图解（按标注编号 ①~⑧ 顺序）
            </h4>

            {/* 表单标注指引图 */}
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-3">
              <TutorialImage
                src="/tutorials/chatgpt/chatgpt_appeal_form_guide.png"
                width={680}
                height={360}
                caption="图 4：OpenAI 官方申诉表单填写与编号标注指引"
                previewClassName="mx-auto h-[260px] sm:h-[320px] w-auto max-w-full rounded-lg object-contain shadow-xs"
              />
            </div>

            {/* 8 步卡片清单 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {appealFormSteps.map((step) => (
                <div
                  key={step.num}
                  className="rounded-xl border border-orange-100 bg-orange-50/30 p-3 flex items-start gap-2.5 text-xs leading-5"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold">
                    {step.num}
                  </span>
                  <div>
                    <div className="font-bold text-slate-900">{step.title}</div>
                    <div className="font-semibold text-primary mt-0.5">{step.action}</div>
                    <div className="text-slate-500 mt-0.5 text-[11px]">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 模板 1：为什么应撤销警告或停用 (第 ⑦ 项) */}
          <div className="rounded-xl border border-orange-200/80 bg-orange-50/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-primary" />
                表单第 ⑦ 项：「为什么应撤销警告或停用」英文理由模板
              </span>
              <CopyButton text={reasonAppealTemplate} label="复制第 ⑦ 项理由模板" />
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-orange-200/60 bg-white p-3 font-mono text-xs leading-relaxed text-slate-800">
              {reasonAppealTemplate}
            </pre>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              * 填表提示：将 <code>[活动开始日期]</code>（如 November 15, 2026）和 <code>[错误信息]</code> 替换为您实际遇到的报错提示原话。
            </p>
          </div>

          {/* 模板 2：更多补充背景信息 (第 ⑧ 项) */}
          <div className="rounded-xl border border-orange-200/80 bg-orange-50/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-primary" />
                表单第 ⑧ 项：「更多补充背景信息」英文环境模板
              </span>
              <CopyButton text={backgroundAppealTemplate} label="复制第 ⑧ 项补充模板" />
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-orange-200/60 bg-white p-3 font-mono text-xs leading-relaxed text-slate-800">
              {backgroundAppealTemplate}
            </pre>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              * 填表提示：务必将登录报错界面最下方的<strong>「诊断代码（Ray ID / Diagnostic code）」</strong>原样复制粘贴到模板中，这是 OpenAI 客服在后台精准检索日志最核心的关键依据！
            </p>
          </div>
        </div>
      </section>

      {/* 四、 申诉后预期与心态管理 */}
      <section aria-labelledby="unban-expectations" className="space-y-4">
        <h3 id="unban-expectations" className="text-base font-bold text-slate-900 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[11px] font-bold">4</span>
          申诉后预期与心态管理
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              官方处理周期与提交禁忌
            </h4>
            <p className="mt-2 text-xs leading-6 text-slate-600 sm:text-sm">
              官方人工与自动化复核通常需要 <strong>24 到 72 小时</strong>；若遇到大规模封禁潮，处理可能延长至 <strong>5~7 个工作日</strong>。
            </p>
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs leading-5 text-amber-900">
              <strong>重要禁忌：</strong>申诉提交后请耐心等待，<strong>切勿在短时间内重复发送多个相同工单</strong>，否则会被风控系统自动打上垃圾请求标记，严重拉低人工复核优先级。
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              申诉成功率与应对策略
            </h4>
            <p className="mt-2 text-xs leading-6 text-slate-600 sm:text-sm">
              即便是常规误伤，初次申诉也有一定概率收到系统模板回复。如果初次申诉被驳回，建议更换说明角度（更详尽地补充网络环境和真实使用场景）再次复核一次。
            </p>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <strong>备用建议：</strong>若两次申诉均未通过，说明账号后台关联标记过深，建议果断止损，重新配置全新独立节点与指纹环境注册新账号。
            </div>
          </div>
        </div>
      </section>

      {/* 五、 账号长久存活的日常避坑法则 */}
      <section aria-labelledby="unban-tips" className="space-y-4">
        <h3 id="unban-tips" className="text-base font-bold text-slate-900 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[11px] font-bold">5</span>
          日常长久存活防封避坑法则
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              title: "固定纯净独享节点",
              desc: "尽量使用稳定纯净的独享或住宅节点，避免在对话中频繁切换不同国家地区，切勿多人共用高风险的公共共享 IP。",
            },
            {
              title: "敏感词与违规场景主动避让",
              desc: "无论是学术研究还是日常测试，在提问中主动避让高风险敏感词汇，尽量采用中性、学术化、描述性的客观语言。",
            },
            {
              title: "隔离付款与账单地址",
              desc: "订阅 Plus 或绑定支付方式时，账单地址与 IP 归属地尽量保持一致，避免使用已被大面积滥用的虚拟卡号段。",
            },
            {
              title: "核心对话数据定期本地导出",
              desc: "养成定期在 Settings -> Data controls -> Export data 导出对话记录的好习惯，核心资产定期在本地保留备份。",
            },
          ].map((item, idx) => (
            <div key={idx} className="rounded-xl border border-orange-100 bg-orange-50/20 p-4">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-primary">
                  0{idx + 1}
                </span>
                <span>{item.title}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
