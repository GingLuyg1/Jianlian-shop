"use client";

import type { ReactNode } from "react";
import { AlertTriangle, ExternalLink, Globe, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react";

import TutorialImage from "./TutorialImage";
import tutorial from "./TutorialsGlass.module.css";

function AppleLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-semibold text-sky-800 underline decoration-sky-300 underline-offset-4 hover:text-sky-950 hover:decoration-sky-600"
    >
      <span>{children}</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </a>
  );
}

function SectionHeading({ number, id, children }: { number: string; id: string; children: ReactNode }) {
  return (
    <h2 id={id} tabIndex={-1} className="flex scroll-mt-36 items-center gap-3 text-lg font-semibold text-slate-900">
      <span className={`${tutorial.appleBadge} h-9 w-9`}>{number}</span>
      <span>{children}</span>
    </h2>
  );
}

function StepCard({
  number,
  title,
  children,
  image,
}: {
  number: number;
  title: string;
  children: ReactNode;
  image?: ReactNode;
}) {
  return (
    <li className="min-w-0 rounded-xl border border-slate-200/90 bg-slate-50/70 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className={`${tutorial.appleBadge} h-7 w-7 shrink-0`}>{number}</span>
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold text-slate-900">{title}</h4>
          <div className="mt-2 space-y-2 text-sm leading-7 text-slate-600">{children}</div>
        </div>
      </div>
      {image ? <div className="mt-4">{image}</div> : null}
    </li>
  );
}

export default function AppleIdVerifyFailedTutorial({
  onSwitchToUsage,
}: {
  onSwitchToUsage?: () => void;
}) {
  return (
    <div className={`${tutorial.appleArticle} space-y-6`}>
      {/* 01. 报错现象与止损原则 */}
      <section aria-labelledby="apple-verify-overview" className={`${tutorial.appleCard} p-5 sm:p-6`}>
        <SectionHeading number="01" id="apple-verify-overview">
          现象说明与首要止损原则
        </SectionHeading>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          近期部分用户在 iPhone / iPad 的 App Store（或「设置 → 媒体与购买项目」）登录外区 Apple ID 时，可能会弹出
          <strong className="font-semibold text-slate-900">「验证失败 · 发生未知错误」</strong>
          提示，导致无法完成正常登录。
        </p>

        <div className="mt-4 rounded-xl border border-rose-200/90 bg-rose-50/75 p-4 text-sm leading-7 text-rose-950">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <div>
              <strong className="font-semibold">重要提醒：遇到报错请立刻停止连续重试！</strong>
              <p className="mt-1 text-rose-900/90">
                在出现「验证失败」后如果短时间内反复输入密码尝试登录，极易触发苹果安全风控并升级为
                <strong>「Apple 账户已锁定（Reset Password）」</strong>。建议第一时间停手，直接按下方步骤先到官网完成验证排查。
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <TutorialImage
            src="/assets/tutorials/apple-id/apple-verify-error-overview.png"
            caption="常见报错对比：左为 App Store 登录「验证失败 · 发生未知错误」，右为连续重试触发的「Apple 账户已锁定」"
            width={1200}
            height={820}
          />
        </div>
      </section>

      {/* 02. 常见触发原因 */}
      <section aria-labelledby="apple-verify-causes" className={`${tutorial.appleCard} p-5 sm:p-6`}>
        <SectionHeading number="02" id="apple-verify-causes">
          常见触发原因排查
        </SectionHeading>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          结合近期实际反馈，这类「未知错误」通常与密码本身无关，主要集中在以下三类安全校验与环境因素：
        </p>
        <div className="mt-4 grid gap-3.5 sm:grid-cols-3">
          <article className="rounded-xl border border-orange-100 bg-orange-50/45 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldAlert className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>1. 未开启双重认证（最常见）</span>
            </div>
            <p className="mt-2 text-xs leading-6 text-slate-600">
              问题高发于尚未开启双重认证（2FA）的密保型 Apple ID。苹果收紧账户安全校验策略时，App Store 端可能直接拒绝此类登录会话，需在官网补全受信任手机号验证。
            </p>
          </article>

          <article className="rounded-xl border border-sky-100 bg-sky-50/45 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Globe className="h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
              <span>2. 多设备共用同一网络 IP</span>
            </div>
            <p className="mt-2 text-xs leading-6 text-slate-600">
              如果多台苹果设备处于同一共享代理节点或公共 Wi-Fi 下频繁切换登录账号，容易被风控识别为异常环境。建议切换至本机 4G/5G 蜂窝网络，或更换独立纯净 IP 后再操作。
            </p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-slate-50/75 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Smartphone className="h-4 w-4 shrink-0 text-slate-700" aria-hidden="true" />
              <span>3. 设备或账号临时受限</span>
            </div>
            <p className="mt-2 text-xs leading-6 text-slate-600">
              部分设备在短期内登录过多账号，或原账号本身被苹果临时限制访问，也会出现类似弹窗。先登录苹果官网确认账号状态是否正常，是最准确的区分方式。
            </p>
          </article>
        </div>
      </section>

      {/* 03. 核心解决方法：前往 Apple 官网开启双重认证 */}
      <section aria-labelledby="apple-verify-solution" className={`${tutorial.appleCard} p-5 sm:p-6`}>
        <SectionHeading number="03" id="apple-verify-solution">
          推荐解决方法：官网绑定手机号开启双重认证
        </SectionHeading>
        <div className="mt-4 rounded-xl border border-sky-200/80 bg-sky-50/70 p-4 text-sm leading-7 text-slate-700">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
            <div>
              <strong>核心思路（三步走）：</strong>
              前往 <AppleLink href="https://account.apple.com/">Apple 账户官网</AppleLink> 登录账号 → 按提示绑定受信任手机号并开启双重认证 → 完成验证后返回 iPhone <strong>「设置 → 媒体与购买项目」</strong> 重新登录 App Store。
            </div>
          </div>
        </div>

        <ol className="mt-5 grid gap-4 lg:grid-cols-2">
          <StepCard
            number={1}
            title="打开 Apple 账户官网登录并点击「继续」"
            image={
              <TutorialImage
                src="/assets/tutorials/apple-id/apple-2fa-step1-continue.png"
                caption="步骤 1 · 登录 account.apple.com 进入「Apple 账户安全」引导后点击蓝色「继续」"
                width={838}
                height={518}
              />
            }
          >
            <p>
              使用手机或电脑浏览器打开 <AppleLink href="https://account.apple.com/">https://account.apple.com/</AppleLink>，输入您的 Apple ID 邮箱与密码登录（如弹出密保核验，按订单卡密对应填写即可）。
            </p>
            <p>
              进入「Apple 账户安全」双重认证开启引导页后，直接点击蓝色 <strong>「继续」</strong> 按钮。
            </p>
          </StepCard>

          <StepCard
            number={2}
            title="填写任意可正常接收短信的手机号"
            image={
              <TutorialImage
                src="/assets/tutorials/apple-id/apple-2fa-step2-phone.png"
                caption="步骤 2 · 选择对应国家/地区区号（如 +86 中国大陆），输入手机号并保持「短信」验证"
                width={838}
                height={483}
              />
            }
          >
            <p>
              在「添加受信任电话号码」界面，先核对国家或地区区号（无需海外号）。
            </p>
            <p>
              在电话号码框中填入自己长期可用、能正常收到验证码的手机号，下方验证方法默认保持勾选 <strong>「短信」</strong>。
            </p>
          </StepCard>

          <StepCard
            number={3}
            title="核对号码无误后点击「继续」发送验证码"
            image={
              <TutorialImage
                src="/assets/tutorials/apple-id/apple-2fa-step3-submit.png"
                caption="步骤 3 · 确认电话号码右侧出现绿色对勾后，点击右下角「继续」触发短信下发"
                width={838}
                height={498}
              />
            }
          >
            <p>
              输入完整手机号且输入框右侧出现绿色校验对勾后，点击右下角蓝色 <strong>「继续」</strong> 按钮，苹果系统会立即向该号码发送一条 6 位数字验证码短信。
            </p>
          </StepCard>

          <StepCard
            number={4}
            title="填入 6 位短信验证码并完成启用"
            image={
              <TutorialImage
                src="/assets/tutorials/apple-id/apple-2fa-step4-code.png"
                caption="步骤 4 · 在 6 格验证码输入框填入收到的苹果短信验证码，点击「继续」完成双重认证"
                width={838}
                height={463}
              />
            }
          >
            <p>
              查收来自 Apple 的验证短信，将 6 位数字验证码按顺序填入页面输入框中，随后点击蓝色 <strong>「继续」</strong> 完成受信任手机号绑定与双重认证启用。
            </p>
            <p>
              官网提示设置完成后，回到 iPhone 的 <strong>「设置 → 你的姓名 → 媒体与购买项目」</strong> 重新登录 App Store 即可。
            </p>
          </StepCard>
        </ol>
      </section>

      {/* 04. 注意事项与延伸指引 */}
      <section aria-labelledby="apple-verify-notes" className={`${tutorial.appleCard} p-5 sm:p-6`}>
        <SectionHeading number="04" id="apple-verify-notes">
          注意事项与延伸排查
        </SectionHeading>
        <ul className="mt-3 list-disc space-y-2.5 pl-5 text-sm leading-7 text-slate-600">
          <li>
            <strong className="text-slate-900">适用范围说明：</strong>
            大量实测反馈表明，为未开启双重认证的账号在官网补全受信任手机号后，App Store 可恢复正常登录；但由于不同账号与设备风控状态存在差异，此方法无法保证 100% 适用于所有账号，最终结果以 Apple 页面提示为准。
          </li>
          <li>
            <strong className="text-slate-900">切勿在「设置顶部 iCloud」直接登录下载号：</strong>
            完成双重认证后，仍建议通过 <strong>「媒体与购买项目」</strong> 单独登录 App Store，保留自己设备原有的 iCloud 主账号，避免同步隐私数据或触发锁机风险。
          </li>
          <li>
            <strong className="text-slate-900">如果已经提示「Apple 账户已锁定」：</strong>
            请先前往 <AppleLink href="https://iforgot.apple.com/">Apple 官方密码与解锁页面</AppleLink> 按密保或受信任手机号完成解锁重置；如需核对交付格式或登录位置，
            {onSwitchToUsage ? (
              <button
                type="button"
                onClick={onSwitchToUsage}
                className="ml-1 font-semibold text-primary underline underline-offset-4 hover:text-orange-700"
              >
                点击返回「Apple ID 使用与改密指南」
              </button>
            ) : (
              <span>可切换至左侧「Apple ID 使用与改密指南」查看完整步骤。</span>
            )}
          </li>
        </ul>
      </section>
    </div>
  );
}
