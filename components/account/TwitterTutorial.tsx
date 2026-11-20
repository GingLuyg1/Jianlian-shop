"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe2,
  HelpCircle,
  KeyRound,
  Laptop,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import TutorialImage from "@/components/account/TutorialImage";
import { openPublicSupport } from "@/lib/support/open-public-support";
import tutorial from "@/components/account/TutorialsGlass.module.css";

export type TwitterSection = "x-token" | "x-2fa" | "x-renew-token";

interface TwitterTutorialProps {
  activeSection?: TwitterSection;
  onSelectSection?: (section: TwitterSection) => void;
}

// 2FA 在线生成工具直达入口
const twoFaTools = [
  { name: "2FA TOTP 生成器", domain: "2fa.cn", url: "https://2fa.cn/" },
  { name: "2FA TOTP 生成器", domain: "2fa.web-ai.top", url: "https://2fa.web-ai.top/" },
  { name: "2FA TOTP 生成器", domain: "2fa.show", url: "https://2fa.show" },
  { name: "2FA TOTP 生成器", domain: "2fa.live", url: "https://2fa.live" },
];

export default function TwitterTutorial({
  activeSection = "x-token",
  onSelectSection,
}: TwitterTutorialProps) {
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
      {/* 顶部 Hero 区域 */}
      <section className={tutorial.guideHero}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-0.5 text-xs font-semibold text-white">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            X (Twitter) 官方全流程使用指引
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <CheckCircle2 className="h-3 w-3" />
            支持 Token 免密 · 2FA 双重认证 · 改密续期
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          X (Twitter) 账号使用与管理完整教程
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
          汇总 X (Twitter) 预制账号的 Token 免密登录、2FA 两步动态验证码登录、以及修改密码后提取最新 Token 的全流程实操技巧，避开风控异常，保障账号长期稳定可用。
        </p>
      </section>

      {/* 教程一：X Token 使用教程 (仅电脑) */}
      {activeSection === "x-token" && (
        <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-orange-100 pb-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                1
              </span>
              <h2 className="text-lg font-bold text-slate-900">X Token 使用教程（电脑端免密直登）</h2>
            </div>

            <div className="rounded-2xl border border-orange-200/80 bg-orange-50/40 p-4 sm:p-5">
              <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                <KeyRound className="h-4 w-4 text-primary" />
                <span>什么是 Token（auth_token）？</span>
              </div>
              <p className="mt-2 text-xs sm:text-sm text-slate-700 leading-relaxed">
                Token 是 Twitter 官方生成的加密授权会话凭证（本质上是保存在浏览器 Cookies 中的 <code>auth_token</code> 值，长度通常为 40 位的十六进制字符串）。
                使用 Token 登录<strong>无需输入账号和密码</strong>，直接将凭证注入浏览器即可一秒载入已登录会话，<strong>可完美避开设备变更、IP 风控导致的密码报错或手机接码验证</strong>。
              </p>
              <div className="mt-3 rounded-xl border border-orange-200 bg-white p-3 font-mono text-xs sm:text-sm text-slate-800 break-all select-all">
                发货格式示例：用户名----密码----auth_token (40位字符串)----2FA密钥----密保邮箱
              </div>
            </div>

            <div className="space-y-4">
              {/* 步骤 1 */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    1
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    在浏览器中打开 Twitter 页面，准备呼出 Token 插件
                  </h3>
                </div>
                <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  在电脑端 Chrome / Edge 浏览器中安装支持 Twitter Token 的登录扩展（或直接使用卡密配套的 Token 登录插件）。
                  <strong className="text-primary">【特别注意】</strong>：插件必须在 Twitter 官方网页环境下（如 <code>https://twitter.com</code> 或 <code>https://x.com</code>）点击打开才会生效！如果在其他空白网页或非推特页面点击插件，将无法注入会话。
                </p>
                <div className="mt-4">
                  <TutorialImage
                    src="/tutorials/twitter/x_token_step1_extension.png"
                    caption="图 1：在推特页面中打开扩展插件，粘贴卡密中的 Token 并点击 LOGIN"
                    width={800}
                    height={400}
                  />
                </div>
              </div>

              {/* 步骤 2 */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    2
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    输入 Token 并点击 LOGIN，自动进入主页
                  </h3>
                </div>
                <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  将卡密中的 40 位 <code>auth_token</code> 字符串粘贴至插件的输入框中，确认前后没有多余空格，点击下方的 <strong>LOGIN</strong> 按钮。
                  插件会自动将授权凭据写入当前浏览器的 Cookie 存储中并自动刷新页面。页面刷新后，即可直接进入 Twitter / X 的用户主页并正常浏览！
                </p>
                <div className="mt-4">
                  <TutorialImage
                    src="/tutorials/twitter/x_token_step2_success.png"
                    caption="图 2：Token 注入成功后自动刷新，顺利进入推特信息流与个人主页"
                    width={800}
                    height={348}
                  />
                </div>
              </div>
            </div>

            {/* 极客备用：F12 控制台一键免插件登录 */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <Terminal className="h-4 w-4 text-primary" />
                <span>进阶备用：无需安装任何插件的控制台登录代码</span>
              </div>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                如果您不想安装浏览器插件，可直接打开 <code>https://x.com</code>，按下键盘 <strong>F12</strong> 打开开发者工具，切换至 <strong>Console（控制台）</strong>，粘贴并回车执行下方代码即可一键登录：
              </p>
              <div className="mt-2.5 rounded-xl border border-slate-300 bg-slate-900 p-3 font-mono text-xs text-emerald-400 select-all break-all">
                javascript:void(function(){`{`}const t=prompt(&quot;请输入您的 Twitter auth_token：&quot;);if(t){`{`}document.cookie=&quot;auth_token=&quot;+t.trim()+&quot;;path=/;domain=.x.com;secure;max-age=31536000&quot;;location.href=&quot;https://x.com/home&quot;{`}`}{`}`})();
              </div>
            </div>

            {/* 防掉登重要警示 */}
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 text-xs text-amber-900 leading-relaxed flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <strong>【绝对不要主动点击 Log out 退出登录】</strong>：在推特网页端点击退出登录会立即向服务器注销该 <code>auth_token</code>，导致 Token 永久失效！如果需要切换或退出账号，<strong>直接清除浏览器对应 Cookie 或关闭无痕窗口即可</strong>。
              </div>
            </div>
          </section>
        </div>
      )}

      {/* 教程二：X 2fa 使用教程 (手机/电脑) */}
      {activeSection === "x-2fa" && (
        <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-orange-100 pb-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                2
              </span>
              <h2 className="text-lg font-bold text-slate-900">X 2FA 双重身份验证登录教程（手机/电脑通用）</h2>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              当您在手机端 App 或电脑端使用“账号/用户名 + 密码”方式登录 X (Twitter) 时，系统会弹出两步验证提示（“输入你的验证码”）。请按照下方 4 个步骤使用卡密中的 2FA 密钥获取 6 位动态验证码：
            </p>

            {/* 2FA 工具直达入口矩阵 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">2FA TOTP 动态验证码生成工具直达入口（点击即开）：</span>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">任选其一即可</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {twoFaTools.map((tool) => (
                  <div
                    key={tool.domain}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs hover:border-primary/40 transition-all"
                  >
                    <a
                      href={tool.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex min-w-0 flex-1 items-center gap-2"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                        <KeyRound className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 font-bold text-slate-800 text-xs group-hover:text-primary transition-colors">
                          <span>{tool.name}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">{tool.domain}</div>
                      </div>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopy(tool.url, tool.domain)}
                      className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                      title="复制链接"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 4 步登录步骤 */}
            <div className="space-y-4">
              {/* 步骤 1 */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    1
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    输入账号与密码，触发“输入你的验证码”界面
                  </h3>
                </div>
                <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  在 X / Twitter 登录界面填入账号和密码点击登录，页面提示“输入你的验证码（使用代码生成器应用生成一个代码并在下方输入）”。保持此页面不动。
                </p>
                <div className="mt-4">
                  <TutorialImage
                    src="/tutorials/twitter/x_2fa_step1_prompt.png"
                    caption="图 1：登录账号与密码后，系统弹出 2FA 双重身份验证提示框"
                    width={800}
                    height={374}
                  />
                </div>
              </div>

              {/* 步骤 2 */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    2
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    在 2FA 工具中输入密钥，实时获取 6 位数字验证码
                  </h3>
                </div>
                <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  打开上方推荐的 2FA 生成器页面（或手机 Google Authenticator 身份验证器），将卡密中的 <strong>2FA 密钥</strong> 粘贴进输入框，点击“获取验证码 / Click for authentication code”，下方即刻计算出最新的 6 位纯数字验证码，点击复制。
                </p>
                <div className="mt-4">
                  <TutorialImage
                    src="/tutorials/twitter/x_2fa_step2_generator.png"
                    caption="图 2：在 2FA 工具页面粘贴卡密中的 2FA 密钥，一键获取当前 6 位验证码并复制"
                    width={800}
                    height={374}
                  />
                </div>
              </div>

              {/* 步骤 3 */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    3
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    返回 X 登录页，粘贴 6 位验证码并点击下一步
                  </h3>
                </div>
                <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  切回推特页面，将刚复制的 6 位数字验证码粘贴到“输入代码”输入框中，确认无误后点击下方的 <strong>下一步</strong> 按钮。
                </p>
                <div className="mt-4">
                  <TutorialImage
                    src="/tutorials/twitter/x_2fa_step3_input.png"
                    caption="图 3：填入 6 位 TOTP 动态验证码，点击「下一步」完成身份验证"
                    width={800}
                    height={374}
                  />
                </div>
              </div>

              {/* 步骤 4 */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    4
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    验证通过，成功进入个人主页与使用中心
                  </h3>
                </div>
                <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  系统核验通过后直接进入个人 Profile 页面，账号处于正常活跃状态，可在手机 App 或电脑浏览器放心使用。
                </p>
                <div className="mt-4">
                  <TutorialImage
                    src="/tutorials/twitter/x_2fa_step4_success.png"
                    caption="图 4：双重验证顺利通过，成功登录进入 X (Twitter) 账户"
                    width={800}
                    height={432}
                  />
                </div>
              </div>
            </div>

            {/* 常见问题排错 FAQ */}
            <div className="rounded-xl border border-blue-200/80 bg-blue-50/50 p-4 text-xs text-blue-900 leading-relaxed space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold">
                <HelpCircle className="h-4 w-4 text-blue-600" />
                <span>2FA 常见问题排查：</span>
              </div>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>提示“代码错误或已失效”？</strong> TOTP 验证码基于国际标准时间算法（每 30 秒轮替一次）。请检查手机/电脑的系统时间是否准确（开启网络自动同步对时），或在倒计时剩余 15 秒以上时快速输入。</li>
                <li><strong>长期保管建议：</strong>可将该 2FA 密钥添加至手机端 <strong>Google Authenticator</strong> 或 <strong>1Password / Bitwarden</strong> 中，后续随时离线查看。</li>
              </ul>
            </div>
          </section>
        </div>
      )}

      {/* 教程三：X 修改密码后重新获取Token */}
      {activeSection === "x-renew-token" && (
        <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-orange-100 pb-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                3
              </span>
              <h2 className="text-lg font-bold text-slate-900">X 修改密码后重新获取 Token 教程</h2>
            </div>

            <div className="rounded-2xl border border-orange-200/80 bg-orange-50/40 p-4 sm:p-5">
              <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                <RefreshCw className="h-4 w-4 text-primary" />
                <span>为什么修改密码后旧的 Token 会失效？</span>
              </div>
              <p className="mt-2 text-xs sm:text-sm text-slate-700 leading-relaxed">
                Twitter 官方的安全机制规定：<strong>任何时候修改账号密码，系统都会自动撤销并作废之前的所有在线活跃会话与旧 Token</strong>。
                因此，如果您在使用过程中修改了推特密码，原卡密中的旧 Token 将无法再通过插件登录。您需要按照以下 2 步从当前已登录的浏览器中提取<strong>修改密码后的最新 Token</strong>并重新保存。
              </p>
            </div>

            <div className="space-y-4">
              {/* 步骤 1 */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    1
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    在已登录的页面按 F12 打开开发者工具，点击 Application
                  </h3>
                </div>
                <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  在电脑端 Chrome / Edge 浏览器中登录您的 Twitter 账号（修改密码后的正常登录状态下），按下键盘上的 <strong>F12</strong> 键（或在页面任意空白处右键点击选择「检查 / Inspect」）。
                  在打开的开发者工具顶部标签栏中，找到并点击 <strong>Application（应用程序）</strong>。如果顶部标签过多未直接显示，请点击末尾的双箭头 <code>&gt;&gt;</code> 展开菜单，选择 <strong>Application</strong>。
                </p>
                <div className="mt-4">
                  <TutorialImage
                    src="/tutorials/twitter/x_renew_token_step1_devtools.png"
                    caption="图 1：按 F12 打开开发者工具，在顶部菜单选择 Application（应用程序）"
                    width={800}
                    height={368}
                  />
                </div>
              </div>

              {/* 步骤 2 */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    2
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    展开 Cookies，找到 auth_token 并复制最新值
                  </h3>
                </div>
                <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  在开发者工具左侧面板中：
                  <br />
                  1. 展开 <strong>Storage（存储）</strong> 下方的 <strong>Cookies</strong>；
                  <br />
                  2. 点击选中 <code>https://twitter.com</code>（或 <code>https://x.com</code>）；
                  <br />
                  3. 在中间 Cookie 列表中找到名称为 <strong>auth_token</strong> 的项并单击选中；
                  <br />
                  4. 选中后，在下方控制台区域的 <code>Cookie Value</code>（或表格中的 Value 列）显示的那串 40 位字符就是您当前的<strong>最新 Token</strong>！右键复制该字符串并妥善保存即可。
                </p>
                <div className="mt-4">
                  <TutorialImage
                    src="/tutorials/twitter/x_renew_token_step2_cookie.png"
                    caption="图 2：依次选择 Cookies → twitter → 选中 auth_token，底部显示的即为最新有效 Token"
                    width={800}
                    height={368}
                  />
                </div>
              </div>
            </div>

            {/* 安全小贴士 */}
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-4 text-xs text-emerald-900 leading-relaxed flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <strong>【保存好最新 Token 即可永久便捷登录】</strong>：获取到新的 <code>auth_token</code> 后，您可以将其替换进原有的账号卡密文档中，后续只要不再次改密或主动点击 Log out，该 Token 将长期有效，随时可直接在插件中一秒秒登！
              </div>
            </div>
          </section>
        </div>
      )}


    </div>
  );
}
