"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Globe2,
  Headphones,
  KeyRound,
  LogIn,
  MailCheck,
  MousePointerClick,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { openPublicSupport } from "@/lib/support/open-public-support";

interface GoogleAppealTutorialProps {
  onSwitchToRegion?: () => void;
  onSwitchToQrSms?: () => void;
}

const appealSteps = [
  {
    step: "1",
    title: "登录被停用的账号",
    desc: "用被停用的账号登录 Google，页面会提示「账号已停用」。",
    icon: LogIn,
  },
  {
    step: "2",
    title: "点「开始申诉」",
    desc: "点击页面上的「开始申诉」（英文界面显示为 Start appeal）。",
    icon: MousePointerClick,
  },
  {
    step: "3",
    title: "验证身份",
    desc: "按提示填写身份验证器动态验证码，或辅助邮箱收到的验证码。",
    icon: KeyRound,
  },
  {
    step: "4",
    title: "粘贴申诉模板",
    desc: "在申诉理由输入框中粘贴下方英文模板，并按实际情况微调。",
    icon: FileText,
  },
  {
    step: "5",
    title: "提交并等邮件",
    desc: "填一个可收信的联系邮箱，只提交一次，留意收件箱与垃圾邮件。",
    icon: MailCheck,
    highlight: true,
  },
];

const submitPrecautions = [
  "模板中「身在中国的美国用户（As a United States user located in China）」等描述，请根据自己的真实使用情况微调，内容真实、简短更容易通过审核。",
  "申诉理由请使用英文填写，直接复制下方英文模板修改后粘贴即可。",
  "只提交一次，切勿在短时间内反复重复提交，否则容易被系统直接忽略或加重风控。",
  "审核结果会发送到你填写的联系邮箱，等待期间请同时检查收件箱与垃圾邮件文件夹。",
  "申诉不保证一定通过。如果首次被拒，不要立刻连续重新提交，建议间隔一段时间补充更清晰的使用说明后再尝试。",
];

const recoveryTips = [
  {
    title: "保持节点长期稳定",
    desc: "尽量固定使用支持地区的稳定纯净网络节点，避免频繁跨国家或跨地区切换 IP 地址。",
  },
  {
    title: "循序渐进修改安全设置",
    desc: "账号恢复后先保持正常日常使用，辅助邮箱、密码、两步验证等安全设置按顺序分步慢慢修改，切忌刚解封就集中修改全部敏感资料。",
  },
  {
    title: "遇到登录风控优先温和验证",
    desc: "如果后续登录弹出桌面端强制扫码验证（MO-SMS）或地区异常提示，请勿反复暴力重试，可按站内对应教程规范处理。",
  },
];

function buildEnglishTemplate(accountEmail: string) {
  const email = accountEmail.trim() || "xxxx@gmail.com";
  return `Greetings,

I am writing to inform you that my account is registered under the email address ${email}. As a United States user located in China, I find it necessary to employ a VPN proxy in order to access Google products. Regrettably, due to the instability and frequent toggling of the VPN, my account has been flagged and subsequently suspended. This account holds significant importance for me, and I sincerely hope that you could provide assistance in resolving this matter. Your help in this regard would be greatly appreciated.

Thank you very much.`;
}

export default function GoogleAppealTutorial({
  onSwitchToRegion,
  onSwitchToQrSms,
}: GoogleAppealTutorialProps) {
  const [accountEmail, setAccountEmail] = useState("");
  const [copied, setCopied] = useState(false);

  const resolvedEmail = accountEmail.trim() || "xxxx@gmail.com";
  const englishTemplate = buildEnglishTemplate(accountEmail);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(englishTemplate);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = englishTemplate;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-6">
      {/* 顶部说明 */}
      <section className="rounded-2xl border border-orange-200/80 bg-gradient-to-r from-orange-50/85 via-amber-50/45 to-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="text-base font-bold text-slate-900">
              Google 账号登录提示「账号已停用」怎么申诉？
            </h2>
            <p className="text-xs sm:text-sm leading-relaxed text-slate-600">
              谷歌账号登录时提示<strong>「账号已停用」</strong>，最常见原因之一是代理节点（VPN）不稳定或频繁切换国家/地区，导致被 Google 安全系统判定为异常活动。遇到此情况可按以下 5 步提交官方申诉，并直接使用下方的<strong>英文申诉模板（支持一键复制）</strong>。
            </p>
          </div>
        </div>
      </section>

      {/* 一、在哪里提交申诉（5 步流程图） */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5 border-b border-orange-100 pb-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            一
          </span>
          <h2 className="text-lg font-bold text-slate-900">在哪里提交申诉（谷歌账号申诉 5 步）</h2>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/70 to-white p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-900">谷歌账号申诉 5 步流程</span>
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
              操作流程示意
            </span>
          </div>

          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {appealSteps.map(({ step, title, desc, icon: Icon, highlight }) => (
              <li
                key={step}
                className={
                  highlight
                    ? "flex flex-col rounded-2xl border-2 border-amber-400/90 bg-gradient-to-b from-amber-50/80 to-white p-4 shadow-xs"
                    : "flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs"
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white shadow-2xs">
                    {step}
                  </span>
                  <Icon
                    className={`h-4 w-4 ${highlight ? "text-amber-600" : "text-slate-400"}`}
                    aria-hidden="true"
                  />
                </div>
                <h3 className="mt-3 text-xs sm:text-sm font-bold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{desc}</p>
              </li>
            ))}
          </ol>

          <div className="flex items-center gap-2.5 rounded-xl border border-rose-200/90 bg-rose-50/75 px-4 py-2.5 text-xs sm:text-sm font-semibold text-rose-700">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>重要提醒：模板里的 xxxx@gmail.com 记得换成你被停用的真实账号！</span>
          </div>
        </div>
      </section>

      {/* 二、英文申诉模板 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5 border-b border-orange-100 pb-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            二
          </span>
          <h2 className="text-lg font-bold text-slate-900">英文申诉模板（可直接复制）</h2>
        </div>

        <div className="rounded-2xl border border-orange-200/80 bg-white p-5 sm:p-6 space-y-4 shadow-xs">
          {/* 快捷填入账号自动替换 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between rounded-xl border border-orange-100 bg-orange-50/45 p-4">
            <div className="flex-1 space-y-1.5">
              <label
                htmlFor="google-appeal-email-input"
                className="block text-xs font-bold text-slate-800"
              >
                输入被停用的 Google 邮箱（可选，输入后自动替换模板中的 xxxx@gmail.com）
              </label>
              <input
                id="google-appeal-email-input"
                type="email"
                value={accountEmail}
                onChange={(event) => setAccountEmail(event.target.value)}
                placeholder="例如：yourname@gmail.com"
                className="h-10 w-full rounded-xl border border-orange-200 bg-white px-3.5 text-xs sm:text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#df7334] to-[#c85f22] px-4 text-xs sm:text-sm font-bold text-white shadow-xs transition-all hover:from-[#d26728] hover:to-[#b85319] active:scale-[0.98]"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>已复制英文模板</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>一键复制英文模板</span>
                </>
              )}
            </button>
          </div>

          {/* 英文正文 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">英文申诉原文（复制到申诉输入框）</span>
              {resolvedEmail === "xxxx@gmail.com" ? (
                <span className="text-[11px] font-semibold text-rose-600">
                  请记得将 xxxx@gmail.com 替换为你的账号
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-emerald-600">
                  已自动填入：{resolvedEmail}
                </span>
              )}
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-950 p-4 sm:p-5 font-mono text-xs sm:text-[13px] leading-relaxed text-slate-100 select-all">
              {englishTemplate}
            </pre>
          </div>

          {/* 中文释义 */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 text-xs sm:text-sm leading-relaxed text-slate-600">
            <span className="font-bold text-slate-800">中文意思：</span>
            您好，我的账号是 <code className="rounded bg-white px-1.5 py-0.5 text-primary border border-orange-100">{resolvedEmail}</code>。我是身在中国的美国用户，需要使用 VPN 代理才能访问 Google 产品。由于 VPN 不稳定、频繁切换，我的账号被标记并停用了。这个账号对我非常重要，诚恳希望您能帮我解决这个问题，非常感谢您的帮助。
          </div>
        </div>
      </section>

      {/* 三、提交时注意 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5 border-b border-orange-100 pb-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            三
          </span>
          <h2 className="text-lg font-bold text-slate-900">提交时注意事项</h2>
        </div>

        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/55 p-5 sm:p-6">
          <ul className="space-y-2.5 text-xs sm:text-sm leading-relaxed text-slate-700">
            {submitPrecautions.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 四、恢复以后怎么避免再次被停用 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5 border-b border-orange-100 pb-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            四
          </span>
          <h2 className="text-lg font-bold text-slate-900">恢复以后怎么避免再次被停用</h2>
        </div>

        <div className="grid gap-3.5 md:grid-cols-3">
          {recoveryTips.map(({ title, desc }) => (
            <article
              key={title}
              className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs space-y-2"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                <h3 className="text-sm font-bold text-slate-900">{title}</h3>
              </div>
              <p className="text-xs sm:text-[13px] leading-relaxed text-slate-600">{desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 底部相关教程与客服 */}
      <section className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {onSwitchToQrSms ? (
              <button
                type="button"
                onClick={onSwitchToQrSms}
                className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:border-primary/40 hover:text-primary transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>Google 扫码降级为短信教程</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {onSwitchToRegion ? (
              <button
                type="button"
                onClick={onSwitchToRegion}
                className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:border-primary/40 hover:text-primary transition-colors"
              >
                <Globe2 className="h-3.5 w-3.5 text-primary" />
                <span>Google 修改国家/地区教程</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => openPublicSupport()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-orange-200 px-3.5 py-2 text-xs font-bold text-primary hover:bg-orange-50 transition-colors"
          >
            <Headphones className="h-3.5 w-3.5" />
            <span>联系在线客服协助</span>
          </button>
        </div>
      </section>
    </div>
  );
}
