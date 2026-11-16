import { ArrowUpRight, CheckCircle2, Clock3, Globe, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react";
import tutorial from "@/components/account/TutorialsGlass.module.css";

const official = {
  website: "https://one.nz",
  topup: "https://one.nz/prepaid-top-up/",
  rates: "https://one.nz/roaming/pay-monthly-roaming-rates/",
};

const keyFeatures = [
  { title: "0 月租 · 零持有成本", desc: "平时不打电话、不发短信即完全 0 月租，不用不花钱" },
  { title: "国内免费接收短信", desc: "国内接入移动/联通 5G 漫游，接收海内外平台验证码短信完全免费" },
  { title: "无需实名认证", desc: "海外原生预付费 SIM 卡，即插即用，保障个人隐私安全" },
  { title: "每年 10 NZD 轻松保号", desc: "每次充值 10 纽币自动延长 360 天有效期，一年仅需约 40 余元" },
] as const;

const steps = [
  {
    number: "01",
    title: "插卡与选网准备",
    detail:
      "将 One NZ 实体三合一 SIM 卡插入无运营商网络锁的全网通手机卡槽（双卡手机建议插在卡槽 1）。等待手机自动接入中国移动或中国联通漫游网络（状态栏显示 4G 或 5G）。",
    warning: "如果等待 1-2 分钟仍无信号，可在手机网络设置中关闭「自动选择」，手动搜索并勾选「中国移动」或「中国联通」，然后开关一次飞行模式。",
  },
  {
    number: "02",
    title: "【极度重要】关闭数据漫游防偷跑",
    detail:
      "插卡后务必第一时间进入手机「设置 → 蜂窝网络/移动网络 → One NZ 蜂窝号码」，确保【数据漫游】开关处于【关闭】状态！",
    warning:
      "防扣费重点：国际数据漫游费用昂贵，若误开数据漫游，后台应用偷跑哪怕几 KB 流量，都会触发单日漫游流量扣费！仅在接收短信时，切勿开启漫游数据。",
  },
  {
    number: "03",
    title: "【iPhone 专属】取消 iMessage / FaceTime 激活",
    detail:
      "iPhone 用户插卡后，iOS 系统通常会弹出弹窗提示：「运营商可能会针对用于激活 iMessage 与 FaceTime 的 SMS 短信收费。是否激活？」，请务必果断点击【取消】！",
    warning:
      "防扣费重点：若点击“好/激活”，iPhone 将在后台自动向境外 Apple 服务器发送验证国际短信，产生约 0.3~0.5 NZD 的扣费账单。直接点取消完全不影响正常接收验证码短信。",
  },
  {
    number: "04",
    title: "获取本机号码（免费发短信）",
    detail:
      "确保有移动/联通信号后，打开手机短信功能，新建短信发送内容「mytype」（全部小写，无空格）至号码「521」。",
    warning:
      "One NZ 系统会在几秒内免费下发短信回复，短信中包含您的新西兰本机手机号码（格式如 +64 21 xxx xxxx）及当前预付费套餐名称。",
  },
  {
    number: "05",
    title: "充值与 360 天长期保号",
    detail:
      "One NZ 预付费卡初始激活后拥有 12 个月（360 天）有效期。后续每年只需在官网充值 10 NZD（纽币），账户有效期即自动从充值日起往后延长 12 个月（360 天）！",
    warning:
      "可在 One NZ 官网（one.nz/prepaid-top-up）使用带外币支持的 Visa / Mastercard 信用卡在线直接 Top-Up 充值，充值金额会保留在余额中用于未来消费。",
  },
] as const;

const supportedPlatforms = [
  "OpenAI / ChatGPT (免风控注册)",
  "Claude / Anthropic",
  "TikTok 国际版 / 短视频运营",
  "Telegram 电报账号注册与换绑",
  "WhatsApp / WhatsApp Business",
  "Google / Gmail 账号安全绑定",
  "X (Twitter) 境外社交平台",
  "Wise / PayPal / Stripe 跨境金融",
];

export default function OneNzTutorial() {
  return (
    <article className="min-w-0 space-y-7 text-sm leading-7 text-slate-600" aria-label="One NZ 电话卡激活与保号教程">
      <section className={tutorial.guideHero}>
        <span className="inline-flex items-center gap-2 font-semibold text-[#9f5327]">
          <Smartphone className="h-4 w-4" aria-hidden="true" />
          新西兰 One NZ（原 Vodafone NZ）预付费 SIM 卡
        </span>
        <h2 className="mt-3 text-xl font-semibold text-slate-900">
          0 月租 · 免费收短信 · 5G 漫游与防扣费保号指南
        </h2>
        <p className="mt-2 max-w-3xl">
          新西兰三大主流电信运营商之一，原生高信誉海外手机号，免实名认证，国内漫游直连中国移动/中国联通 5G，海内外优质服务注册神器。
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
          <a
            href={official.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-[#9f5327] underline underline-offset-4"
          >
            One NZ 官方网站
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <a
            href={official.topup}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-[#9f5327] underline underline-offset-4"
          >
            官网在线充值 (Top Up)
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </section>

      {/* Core Features */}
      <section aria-labelledby="onenz-features">
        <h2 id="onenz-features" className="text-lg font-semibold text-slate-900">
          核心特性与资费说明
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {keyFeatures.map((item) => (
            <div key={item.title} className={tutorial.guideStep}>
              <h3 className="font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-xs text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Critical Warnings Notice */}
      <section className="rounded-2xl border border-red-200 bg-red-50/60 p-4 text-slate-800">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="space-y-1.5 text-xs leading-5">
            <div className="font-bold text-red-800 text-sm">新手插卡必看：两大防扣费雷区！</div>
            <p>
              <strong>1. 严禁开启「数据漫游」：</strong>国际数据漫游费用昂贵，哪怕后台自动推送几 KB 流量都可能扣费。国内使用仅收短信，务必在手机设置中关闭数据漫游！
            </p>
            <p>
              <strong>2. iPhone 提示激活 iMessage / FaceTime 务必选【取消】：</strong>若点击确认，苹果会自动向国际服务器发送验证短信产生费用，点击取消不影响任何短信接收。
            </p>
          </div>
        </div>
      </section>

      {/* Step by step */}
      <section aria-labelledby="onenz-steps">
        <h2 id="onenz-steps" className="text-lg font-semibold text-slate-900">
          激活与使用步骤
        </h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-1 md:grid-cols-2">
          {steps.map((step) => (
            <li key={step.number} className={tutorial.guideStep}>
              <div className="flex items-center gap-3">
                <span className={tutorial.guideNumber}>{step.number}</span>
                <h3 className="font-semibold text-slate-900">{step.title}</h3>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-700">{step.detail}</p>
              <div className="mt-2.5 rounded-xl border border-orange-200/80 bg-orange-50/50 p-2.5 text-[11px] leading-5 text-[#8c4820]">
                {step.warning}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Supported Platforms */}
      <section aria-labelledby="onenz-platforms">
        <h2 id="onenz-platforms" className="text-lg font-semibold text-slate-900">
          境外服务平台注册与实测
        </h2>
        <div className="mt-3 rounded-2xl border border-orange-200/70 bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground mb-3">
            One NZ 属于新西兰原生三大运营商真实移动号码段（非 VoIP 虚拟小号），在海内外各大平台的风控系统中有极高权重：
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {supportedPlatforms.map((name) => (
              <div key={name} className="flex items-center gap-1.5 rounded-lg bg-orange-50/60 px-2.5 py-1.5 text-xs font-medium text-slate-800">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span className="truncate">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="onenz-troubleshooting">
        <h2 id="onenz-troubleshooting" className="text-lg font-semibold text-slate-900">
          常见问题与排错指南
        </h2>
        <div className={`${tutorial.guideFaq} mt-4 space-y-3`}>
          <details>
            <summary>
              <span className={tutorial.questionBadge}>Q</span>
              插卡后手机显示「无服务」或无法搜索到网络？
            </summary>
            <p>
              <span className={tutorial.answerBadge}>A</span>
              <span>
                1. 请确认您的手机为支持全网通的无运营商锁设备；2. 进入「设置 → 蜂窝网络 → 网络选择」，关闭“自动”，手动选择「中国移动」或「中国联通」；3. 打开飞行模式等待 10 秒后关闭，或重启手机使 SIM 卡重新注册网络基站。
              </span>
            </p>
          </details>

          <details>
            <summary>
              <span className={tutorial.questionBadge}>Q</span>
              发送短信「mytype」至 521 没有任何回复？
            </summary>
            <p>
              <span className={tutorial.answerBadge}>A</span>
              <span>
                1. 请确保已成功连上中国移动或中国联通的信号（状态栏有信号格）；2. 请检查短信内容是否全部小写「mytype」，不要带空格；3. 接收号码直接填写「521」（不要加国家区号）；4. 如双卡手机，确保选择用 One NZ 所在卡槽发送。
              </span>
            </p>
          </details>

          <details>
            <summary>
              <span className={tutorial.questionBadge}>Q</span>
              国内可以充值保号吗？具体支持哪些充值方式？
            </summary>
            <p>
              <span className={tutorial.answerBadge}>A</span>
              <span>
                可以，进入 One NZ 官网充值页面（one.nz/prepaid-top-up），输入手机号码，选择每次充值 10 NZD，使用具有外币支付功能的 Visa / MasterCard 信用卡充值即可。充值成功后系统自动从充值当天起延期 360 天，余额留存在卡中。也可以联系本站客服代充保号。
              </span>
            </p>
          </details>

          <details>
            <summary>
              <span className={tutorial.questionBadge}>Q</span>
              在国内接收短信真的完全免费吗？
            </summary>
            <p>
              <span className={tutorial.answerBadge}>A</span>
              <span>
                是的，只要关闭数据漫游、不主动发送国际短信、不接听/拨打电话，在中国大陆通过漫游接收任何国内外验证码及通知短信均完全免费，不扣除卡内任何余额。
              </span>
            </p>
          </details>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className={tutorial.guideStep}>
          <Clock3 className="h-5 w-5 text-[#d87334]" aria-hidden="true" />
          <h2 className="mt-3 font-semibold text-slate-900">每年保号提醒</h2>
          <p className="mt-2 text-xs leading-5">
            为防止号码过期被回收，建议在手机日历设置提前 11 个月的提醒。每年充值一次 10 纽币（约 40 多元人民币）即可一直长期保留该海外原生号码。
          </p>
        </div>
        <div className={tutorial.guideStep}>
          <Globe className="h-5 w-5 text-[#d87334]" aria-hidden="true" />
          <h2 className="mt-3 font-semibold text-slate-900">免实名合规提醒</h2>
          <p className="mt-2 text-xs leading-5">
            根据新西兰相关法规，此预付费卡无需个人实名登记。本站销售商品仅限跨境电商、技术开发及合法海外业务使用，严禁用于任何违法犯罪活动。
          </p>
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-2xl border border-orange-200/70 bg-orange-50/50 p-4">
        <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#b96532]" aria-hidden="true" />
        <p className="text-xs leading-5">
          收到物理卡后请妥善保管卡板上的 PUK 码和卡套资料；插卡前请务必确认关闭数据漫游。如有使用或充值疑问，随时可联系站内客服。
        </p>
      </div>
    </article>
  );
}
