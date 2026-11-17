import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  Globe,
  Headphones,
  Laptop,
  MessageCircle,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { openPublicSupport } from "@/lib/support/open-public-support";
import tutorial from "@/components/account/TutorialsGlass.module.css";

const keyRules = [
  {
    icon: Globe,
    title: "固定稳定节点 · 切忌乱跳国家",
    desc: "使用固定国家/地区的优质商用节点（推荐美区、日区、新加坡等），严禁频繁跨国换 IP，切忌使用万人免费公开梯子节点。",
  },
  {
    icon: Laptop,
    title: "浏览器环境隔离 · 推荐无痕模式",
    desc: "建议使用 Chrome / Edge 专属独立 Profile 或无痕窗口运行，登录前清空旧 Cookie，切勿与被封禁过的旧账号混用同一浏览器环境。",
  },
  {
    icon: Sparkles,
    title: "温和养号过渡 · 真实人类交互",
    desc: "刚拿到成品号的前 3-5 天，保持正常人类对话节奏，不要频繁批量调用、发送敏感违规内容或使用自动化脚本极速刷提问。",
  },
  {
    icon: ShieldCheck,
    title: "资料安全修改 · 稳健首登核验",
    desc: "收到账号后第一时间在纯净环境下完成首登核对 Plus 权益；确认稳定运行后，再视需要进行修改密码或绑定辅助邮箱。",
  },
] as const;

const clientSteps = [
  {
    step: "1",
    title: "官方客户端下载",
    desc: "推荐访问 OpenAI 官方下载页面获取桌面客户端或手机 App，切勿下载任何来历不明的第三方破解包。",
    link: "https://chatgpt.com/zh-Hans-CN/download/",
    linkText: "前往官方下载页面（支持 Win / Mac / iOS / Android）",
  },
  {
    step: "2",
    title: "海外手机号验证（接码说明）",
    desc: "部分桌面客户端（原 Codex）或特定登录场景可能触发国外手机号短信验证。OpenAI 风控严格拦截虚拟号（VoIP）。没有可用国外手机号时，可直接选购本站海外原生实体 SIM 卡，国内免费接码秒过风控。",
    link: "/products/sim-cards",
    linkText: "选购本站海外原生实体 SIM 卡（One NZ / Giffgaff）",
    isInternal: true,
  },
] as const;

export default function ChatGptAccountGuideTutorial() {
  return (
    <article className="space-y-6">
      {/* Hero */}
      <section className={tutorial.guideHero}>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200/80 bg-orange-100/70 px-3 py-0.5 text-xs font-semibold text-primary">
            <Bot className="h-3.5 w-3.5" />
            ChatGPT 账户指南
          </span>
          <span className="text-xs text-muted-foreground">长效稳定 · 防封保号 · 客户端指引</span>
        </div>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
          ChatGPT 成品号保号与长效防封指南
        </h1>
        <p className="mt-2 text-xs leading-6 text-slate-600 sm:text-sm sm:leading-7">
          成品账号在交付后，账号的安全寿命主要取决于后续的**网络环境纯净度**与**日常使用习惯**。
          请认真阅读以下核心保号守则，避免因节点污染或环境异常触发 OpenAI 风控连坐。
        </p>
      </section>

      {/* Core Rules */}
      <section aria-labelledby="gpt-core-rules" className="space-y-4">
        <h2 id="gpt-core-rules" className="text-base font-bold text-slate-950 sm:text-lg">
          四大核心保号铁律（防封根基）
        </h2>
        <div className="grid gap-3.5 sm:grid-cols-2">
          {keyRules.map((rule) => {
            const Icon = rule.icon;
            return (
              <div
                key={rule.title}
                className="rounded-2xl border border-orange-200/80 bg-white p-4 shadow-xs transition hover:shadow-sm sm:p-5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 sm:text-base">{rule.title}</h3>
                </div>
                <p className="mt-2.5 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">
                  {rule.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Risk Notice */}
      <section className="rounded-2xl border border-red-200 bg-red-50/70 p-4 text-slate-800 sm:p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="space-y-1.5 text-xs leading-5 sm:text-sm sm:leading-6">
            <div className="font-bold text-red-800 text-sm sm:text-base">
              高危避坑：触发 OpenAI 批量封号的三大雷区
            </div>
            <p>
              <strong>1. 严禁使用万人公共免费代理：</strong>万人骑节点的 IP 往往早已在 OpenAI 黑名单库中，不仅会出现 403 / Access Denied，同 IP 下其他违规账号被封更会连坐牵连所有登录者。
            </p>
            <p>
              <strong>2. 严禁 1 分钟内跨洲切换 IP：</strong>例如刚刚在香港/新加坡节点操作，下一秒突然秒切到美西节点，会被风控系统判定为账号被盗或异常并发，极易触发二次验证或封禁。
            </p>
            <p>
              <strong>3. 严禁高频批量脚本爬取或违规敏感输出：</strong>避免使用未经官方授权的第三方自动化爬虫脚本极速刷接口，不输入违规政策敏感内容。
            </p>
          </div>
        </div>
      </section>

      {/* Client Download & Phone Verification */}
      <section aria-labelledby="gpt-client-section" className="space-y-4">
        <div className="rounded-2xl border border-orange-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <Laptop className="h-5 w-5 text-primary" />
            <h2 id="gpt-client-section" className="text-base font-bold text-slate-950 sm:text-lg">
              ChatGPT（原 Codex）客户端下载与登录辅助
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            使用官方客户端可获得更流畅的体验与快捷键支持，登录若触发手机号验证可按以下指引处理。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {clientSteps.map((item) => (
            <div
              key={item.title}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                    {item.step}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 sm:text-base">{item.title}</h3>
                </div>
                <p className="mt-3 text-xs leading-6 text-slate-600 sm:text-sm">{item.desc}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100">
                {item.isInternal ? (
                  <Link
                    href={item.link}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-50 px-4 py-2.5 text-xs font-semibold text-primary transition hover:bg-orange-100 sm:text-sm"
                  >
                    <Smartphone className="h-4 w-4" />
                    <span>{item.linkText}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 sm:text-sm"
                  >
                    <Download className="h-4 w-4" />
                    <span>{item.linkText}</span>
                    <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Common FAQ */}
      <section aria-labelledby="gpt-faq" className="space-y-4">
        <h2 id="gpt-faq" className="text-base font-bold text-slate-950 sm:text-lg">
          常见问题排错
        </h2>
        <div className={`${tutorial.guideFaq} space-y-3`}>
          <details>
            <summary>
              <span className={tutorial.questionBadge}>Q</span>
              访问官网提示 "Access Denied" 或 403 错误？
            </summary>
            <p>
              <span className={tutorial.answerBadge}>A</span>
              <span>
                这表示您当前网络节点的 IP 地址已被 OpenAI 风控系统屏蔽。请切换一个干净低延迟的商用原生节点，开启浏览器无痕隐身窗口，并重新访问 chatgpt.com 即可。
              </span>
            </p>
          </details>

          <details>
            <summary>
              <span className={tutorial.questionBadge}>Q</span>
              登录时要求输入海外手机号接收短信验证码（接码）？
            </summary>
            <p>
              <span className={tutorial.answerBadge}>A</span>
              <span>
                OpenAI 会对部分异常节点环境的登录触发二次短信验证。请注意：虚拟接码号（VoIP）容易导致二次封号。推荐使用本站提供的海外原生实体 SIM 电话卡（如 One NZ 新西兰卡、Giffgaff 英国卡等），在国内免费接收验证码短信即可 100% 稳定解封。
              </span>
            </p>
          </details>

          <details>
            <summary>
              <span className={tutorial.questionBadge}>Q</span>
              购买成品号后，是否需要立即修改密码或绑定自己的邮箱？
            </summary>
            <p>
              <span className={tutorial.answerBadge}>A</span>
              <span>
                建议在稳定的固定节点环境下完成首登并使用 2-3 天，确认账号已在新设备/IP 上形成稳定设备指纹后，再前往个人中心设置修改密码或绑定辅助邮箱。刚到手立即大改资料容易被判定为盗号风控。
              </span>
            </p>
          </details>
        </div>
      </section>

      {/* Support Banner */}
      <div className="flex flex-col gap-3 rounded-2xl border border-orange-200/80 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-bold text-slate-900">遇到账号使用疑问或需要海外 SIM 卡接码协助？</div>
          <p className="mt-0.5 text-xs text-muted-foreground">客服工作时间在线为您提供账号首登指引与技术解答。</p>
        </div>
        <button
          type="button"
          onClick={openPublicSupport}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90"
        >
          <Headphones className="h-4 w-4" />
          <span>联系在线客服</span>
        </button>
      </div>
    </article>
  );
}
