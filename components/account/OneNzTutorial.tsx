import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Globe,
  Headphones,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import TutorialImage from "@/components/account/TutorialImage";
import { openPublicSupport } from "@/lib/support/open-public-support";
import tutorial from "@/components/account/TutorialsGlass.module.css";

const official = {
  website: "https://one.nz",
  topup: "https://one.nz/prepaid-top-up/",
};

export type OneNzSection = "activation" | "binding" | "rates";

interface OneNzTutorialProps {
  activeSection?: OneNzSection;
  onSelectSection?: (section: OneNzSection) => void;
}

const keyFeatures = [
  { title: "0 月租 · 零持有成本", desc: "平时不打电话、不发短信即完全 0 月租，不用不花钱" },
  { title: "国内免费接收短信", desc: "国内接入移动/联通 5G 漫游，接收海内外平台验证码短信完全免费" },
  { title: "无需实名认证", desc: "海外原生预付费 SIM 物理卡，即插即用，保障个人隐私安全" },
  { title: "每年 10 NZD 轻松保号", desc: "每次充值 10 纽币自动延长 360 天有效期，一年仅需约 40 余元" },
] as const;

const activationSteps = [
  {
    number: "01",
    title: "插卡与选网准备",
    detail:
      "将 One NZ 实体三合一 SIM 卡插入无运营商网络锁的全网通手机卡槽（双卡手机建议插在卡槽 1）。等待手机自动接入中国移动或中国联通漫游网络（状态栏显示 4G 或 5G 信号）。",
    warning: "如果等待 1-2 分钟仍无信号，可在手机网络设置中关闭「自动选择」，手动搜索并勾选「中国移动」或「中国联通」，然后开关一次飞行模式。",
  },
  {
    number: "02",
    title: "【极度重要】关闭数据漫游防偷跑",
    detail:
      "插卡后务必第一时间进入手机「设置 → 蜂窝网络/移动网络 → One NZ 蜂窝号码」，确保【数据漫游】开关处于【关闭】状态！",
    warning:
      "防扣费重点：国际数据漫游费用昂贵（约 11.5 NZD/MB），若误开数据漫游，后台应用偷跑哪怕几 KB 流量都会触发扣费！仅在接收短信时，切勿开启漫游数据。",
  },
  {
    number: "03",
    title: "【iPhone 专属】取消 iMessage / FaceTime 激活",
    detail:
      "iPhone 用户插卡后，iOS 系统通常会弹出弹窗提示：「运营商可能会针对用于激活 iMessage 与 FaceTime 的 SMS 短信收费。是否激活？」，请务必果断点击【取消】！",
    warning:
      "防扣费重点：若点击“好/激活”，iPhone 将在后台自动向境外 Apple 服务器发送验证国际短信产生费用。直接点取消完全不影响正常接收验证码短信。",
  },
  {
    number: "04",
    title: "获取本机号码（免费发短信）",
    detail:
      "确保有移动/联通信号后，打开手机短信功能，新建短信发送内容「mytype」（全部小写，无空格）至号码「521」。",
    warning:
      "One NZ 系统会在几秒内免费下发短信回复，短信中包含您的新西兰本机手机号码（格式如 +64 21 xxx xxxx）及当前预付费套餐名称。",
  },
] as const;

const appBindingSteps = [
  {
    step: "1",
    title: "下载 App 并点击 Register 注册账户",
    desc: "在应用商店搜索「My One NZ」下载安装官方 App（或访问 one.nz 官网）。打开 App 后切换到「Register」（注册）标签，输入您的注册邮箱、设置密码（至少6位包含数字）、输入英文名（First name）与英文姓（Last name），勾选隐私协议后点击「Register」完成账户创建。",
    image: "/tutorials/onenz/onenz_register.png",
    caption: "图 1：One NZ 官方账户注册页面",
  },
  {
    step: "2",
    title: "在个人中心点击 Add a service",
    desc: "注册登录成功后进入 My One NZ 首页。在欢迎卡片下方点击绿色的「Add a service」（添加服务）按钮，开始将您手中的实体手机卡号绑定到账户中。",
    image: "/tutorials/onenz/onenz_add_service.png",
    caption: "图 2：点击 Add a service 添加号码服务",
  },
  {
    step: "3",
    title: "选择服务类型为 Prepay Mobile",
    desc: "在服务类型选择列表（Choose your service）中，点击第一项「Prepay Mobile - A mobile service that you top up」（预付费移动手机业务）。",
    image: "/tutorials/onenz/onenz_choose_prepay.png",
    caption: "图 3：选择 Prepay Mobile 预付费业务",
  },
  {
    step: "4",
    title: "输入新西兰手机号码",
    desc: "在输入框中填入您的新西兰手机号码（即插卡发短信 mytype 到 521 获取的号码），新西兰本土手机号以 021 开头，输入格式例如：021xxxxxxx，确认无误后点击「Next」。",
    image: "/tutorials/onenz/onenz_enter_number.png",
    caption: "图 4：输入 021 开头的新西兰手机号",
  },
  {
    step: "5",
    title: "接收并填写 5 位短信验证码",
    desc: "One NZ 系统会向您的手机发送一条包含 5 位数字的验证码短信。在 App 中填入 5 位确认码，勾选授权复选框，最后点击「Add service」即可成功绑定。",
    image: "/tutorials/onenz/onenz_confirmation_code.png",
    caption: "图 5：填写 5 位短信验证码完成绑定",
  },
  {
    step: "6",
    title: "手机卡核心状态与有效期解读",
    desc: "绑定成功后可在 App 首页随时查看手机卡完整详情：1. 顶部展示您的 021 手机号；2. 账户余额显示 Your balance is $0.00；3. 号码有效截止期显示 Credit expires: 29 Sep 27（格式为日月年，如 29 Sep 27 代表 2027年9月29日）；4. 页面提供「Top up & pay bill」充值入口。注意：只要仅用于接收短信，即便余额为 0 也能免费收短信，激活后无需立即充值，仅需在有效截止日前充值保号即可。",
    image: "/tutorials/onenz/onenz_card_details.png",
    caption: "图 6：App 首页余额与有效期（日月年格式）",
  },
] as const;

const roamingRates = [
  { item: "月租费用", rate: "0 NZD / 月", note: "无最低消费，不产生消费不扣费" },
  { item: "中国大陆接收短信", rate: "完全免费", note: "接入移动/联通漫游，收短信不扣除余额" },
  { item: "中国大陆发送短信", rate: "约 0.89 NZD / 条", note: "非必要不建议主动向外发短信" },
  { item: "中国大陆接打通话", rate: "约 2.89 NZD / 分钟", note: "建议来电直接挂断，避免产生漫游通话费" },
  { item: "中国大陆漫游流量", rate: "约 11.5 NZD / MB", note: "极度昂贵！务必关闭手机数据漫游" },
  { item: "每年保号充值额度", rate: "每次 10 NZD", note: "充值后有效期自动延长 360 天，余额留存" },
] as const;

const supportedPlatforms = [
  "OpenAI / ChatGPT",
  "Claude / Anthropic",
  "TikTok 国际版",
  "Telegram 电报",
  "WhatsApp 商业版",
  "Google / Gmail",
  "X (Twitter)",
  "Wise / PayPal",
];

export default function OneNzTutorial({
  activeSection = "activation",
  onSelectSection,
}: OneNzTutorialProps) {
  return (
    <article className="min-w-0 space-y-7 text-sm leading-7 text-slate-600" aria-label="One NZ 电话卡激活与保号教程">
      {/* 顶部粘性胶囊导航栏 (图9/图3药丸设计，悬浮置顶冻结) */}
      <div className="sticky top-0 z-20 -mx-1 -mt-1 mb-2 rounded-2xl border border-orange-200/80 bg-white/95 p-2 shadow-xs backdrop-blur-md">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { id: "activation" as const, label: "新手插卡与防扣费", icon: KeyRound },
            { id: "binding" as const, label: "App 注册绑定与查询", icon: Smartphone },
            { id: "rates" as const, label: "漫游资费与长期保号", icon: ShieldCheck },
          ].map((sec) => {
            const Icon = sec.icon;
            const active = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => onSelectSection?.(sec.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                  active
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-orange-50/70 text-slate-700 hover:bg-orange-100/80"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? "text-orange-400" : "text-slate-500"}`} />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hero Section */}
      <section className={tutorial.guideHero}>
        <span className="inline-flex items-center gap-2 font-semibold text-[#9f5327]">
          <Smartphone className="h-4 w-4" aria-hidden="true" />
          新西兰 One NZ（原 Vodafone NZ）预付费实体 SIM 卡
        </span>
        <h2 className="mt-3 text-xl font-semibold text-slate-900 sm:text-2xl">
          0 月租 · 免费收短信 · 5G 漫游与防扣费保号全指南
        </h2>
        <p className="mt-2 max-w-3xl">
          新西兰三大主流运营商之一，原生高信誉海外手机号段，免实名认证，国内漫游直连中国移动/中国联通 5G，海内外优质服务注册神器。
        </p>
      </section>

      {/* SECTION 1: Activation */}
      {activeSection === "activation" ? (
        <>
          {/* Core Features */}
          <section aria-labelledby="onenz-features">
            <h2 id="onenz-features" className="text-lg font-semibold text-slate-900">
              核心特性与资费说明
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  <strong>1. 严禁开启「数据漫游」：</strong>国际数据漫游费用昂贵（约 11.5 NZD/MB），后台自动推送几 KB 流量都可能扣费。国内使用仅收短信，务必在手机设置中关闭数据漫游！
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
              插卡与激活步骤
            </h2>
            <ol className="mt-4 grid gap-4 sm:grid-cols-1 md:grid-cols-2">
              {activationSteps.map((step) => (
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

          {/* Supported Platforms (Fixed: No truncation on 360/390/430px) */}
          <section aria-labelledby="onenz-platforms">
            <h2 id="onenz-platforms" className="text-lg font-semibold text-slate-900">
              境外服务平台注册与实测
            </h2>
            <div className="mt-3 rounded-2xl border border-orange-200/70 bg-white p-4 shadow-sm">
              <p className="text-xs text-muted-foreground mb-3">
                One NZ 属于新西兰原生三大运营商真实移动号码段（非 VoIP 虚拟小号），在海内外各大平台的风控系统中有极高权重：
              </p>
              <div className="flex flex-wrap gap-2">
                {supportedPlatforms.map((name) => (
                  <div
                    key={name}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200/70 bg-orange-50/60 px-3 py-1.5 text-xs font-medium text-slate-800"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}

      {/* SECTION 2: App Registration & Binding */}
      {activeSection === "binding" ? (
        <section aria-labelledby="onenz-binding" className="space-y-6">
          <div className="rounded-2xl border border-orange-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-primary">
                <KeyRound className="h-4 w-4" />
              </span>
              <div>
                <h2 id="onenz-binding" className="text-base font-bold text-slate-950 sm:text-lg">
                  注册并绑定 One NZ 官方账户（随时查余额与保号期）
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  绑定账户后可随时在线查询余额、流量用量以及号码有效期，便于后续保号充值。
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {appBindingSteps.map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-orange-200/70 bg-white p-4 sm:p-5 shadow-xs"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    {item.step}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-900 sm:text-base">{item.title}</h3>
                    <p className="mt-2 text-xs leading-6 text-slate-600 sm:text-sm">{item.desc}</p>
                    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50 p-2">
                      <TutorialImage
                        src={item.image}
                        width={600}
                        height={1000}
                        caption={item.caption}
                        previewClassName="mx-auto h-auto max-h-[380px] w-auto max-w-full rounded-lg object-contain shadow-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* SECTION 3: Roaming Rates & Keeper */}
      {activeSection === "rates" ? (
        <section aria-labelledby="onenz-rates" className="space-y-6">
          <div className="rounded-2xl border border-orange-200/80 bg-white p-5 shadow-sm">
            <h2 id="onenz-rates" className="text-base font-bold text-slate-950 sm:text-lg">
              中国漫游资费明细与充值保号指南
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              清晰明了的资费标准，让您明白消费，避免任何隐形扣费。
            </p>
          </div>

          {/* Rates Table */}
          <div className="overflow-hidden rounded-2xl border border-orange-200/80 bg-white shadow-xs">
            <div className="border-b border-orange-100 bg-orange-50/60 px-4 py-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary">漫游资费对照表</h3>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {roamingRates.map((r) => (
                <div key={r.item} className="flex flex-col gap-1 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="font-semibold text-slate-900">{r.item}</div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-primary">{r.rate}</span>
                    <span className="text-[11px] text-muted-foreground">({r.note})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Keeper / Recharge Info */}
          <div className="rounded-2xl border border-orange-200/80 bg-orange-50/40 p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#9f5327] flex items-center gap-2">
              <Clock3 className="h-4 w-4" />
              每年充值 10 纽币（NZD）长期保号规则
            </h3>
            <ul className="list-disc pl-5 space-y-2 text-xs leading-6 text-slate-700">
              <li>
                <strong>有效期自动顺延 360 天：</strong>新卡激活后拥有 12 个月（360 天）有效期。后续每年只需充值一次 10 NZD，账户有效期自动从充值当天起往后延长 360 天！
              </li>
              <li>
                <strong>余额永久留存：</strong>充值的 10 纽币不会被系统扣除，而是沉淀在卡内余额中，可用于未来紧急发短信或开通国际套餐。
              </li>
              <li>
                <strong>充值渠道指引：</strong>
                可在 One NZ 官网（one.nz/prepaid-top-up）使用具有外币支付功能的 Visa / MasterCard 信用卡充值；
                <strong>如无外币信用卡，可直接联系本站在线客服快捷代充保号</strong>（支持微信/支付宝/USDT，提供手机号即可秒充延期 360 天）。
              </li>
            </ul>
          </div>

          {/* Support Banner */}
          <div className="flex flex-col gap-3 rounded-2xl border border-orange-200/80 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-bold text-slate-900">需要协助代充 One NZ 纽币或咨询问题？</div>
              <p className="mt-0.5 text-xs text-muted-foreground">客服工作时间在线为您提供代充延期、号码查询与技术指导。</p>
            </div>
            <button
              type="button"
              onClick={openPublicSupport}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90"
            >
              <Headphones className="h-4 w-4" />
              <span>联系在线客服代充</span>
            </button>
          </div>
        </section>
      ) : null}

      {/* Common FAQ */}
      <section aria-labelledby="onenz-troubleshooting">
        <h2 id="onenz-troubleshooting" className="text-lg font-semibold text-slate-900">
          常见问题排错
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
              国内接收短信真的完全免费吗？
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

      {/* Safety Notice */}
      <div className="flex items-start gap-2 rounded-2xl border border-orange-200/70 bg-orange-50/50 p-4">
        <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#b96532]" aria-hidden="true" />
        <p className="text-xs leading-5">
          收到物理卡后请妥善保管卡板上的 PUK 码和卡套资料；插卡前请务必确认关闭数据漫游。如有使用或充值疑问，随时可联系站内客服。
        </p>
      </div>
    </article>
  );
}
