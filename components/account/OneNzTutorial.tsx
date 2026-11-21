"use client";

import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  CreditCard,
  Globe,
  Headphones,
  KeyRound,
  MessageSquare,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Wifi,
} from "lucide-react";
import TutorialImage from "@/components/account/TutorialImage";
import { openPublicSupport } from "@/lib/support/open-public-support";
import tutorial from "@/components/account/TutorialsGlass.module.css";

const official = {
  website: "https://one.nz",
  topup: "https://one.nz/prepaid-top-up/",
};

export type OneNzSection = "usage" | "guide" | "activation" | "binding" | "rates";

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
      "确保有移动/联通信号后，打开手机短信功能，新建短信发送内容「mynum」或「mytype」（全部小写，无空格）至号码「521」。",
    warning:
      "One NZ 系统会在几秒内免费下发短信回复，短信中包含您的新西兰本机手机号码（格式如 +64 21 xxx xxxx）及当前预付费套餐名称。",
  },
] as const;

// 6 个绑定步骤（采用竖向长方形排版，每行两个流程/两张图片并排展示）
const appBindingSteps = [
  {
    step: "01",
    title: "下载 App 并点击 Register 注册",
    desc: "在应用商店下载「My One NZ」App，打开后切换至「Register」（注册）标签。输入邮箱、设置至少 6 位包含数字的密码、输入英文名与姓，勾选隐私政策后点击「Register」创建账户。",
    image: "/tutorials/onenz/onenz_register.png",
    caption: "图 1：Register 注册页面与信息填写",
  },
  {
    step: "02",
    title: "点击 Add a service 绑定手机号",
    desc: "登录成功后进入 My One NZ 首页。在欢迎卡片下方点击绿色的「Add a service」按钮，开始将手中的实体卡号码绑定至账户中。",
    image: "/tutorials/onenz/onenz_add_service.png",
    caption: "图 2：点击 Add a service 开始绑定",
  },
  {
    step: "03",
    title: "选择业务类型为 Prepay Mobile",
    desc: "在服务类型选择列表（Choose your service）中，点击第一项「Prepay Mobile - A mobile service that you top up」（预付费手机业务）。",
    image: "/tutorials/onenz/onenz_choose_prepay.png",
    caption: "图 3：选择 Prepay Mobile 业务",
  },
  {
    step: "04",
    title: "输入新西兰本机号码",
    desc: "在 Mobile number 输入框中填入您的 021 开头新西兰本机手机号码（格式如：021xxxxxxx），确认无误后点击「Next」。",
    image: "/tutorials/onenz/onenz_enter_number.png",
    caption: "图 4：输入 021 开头新西兰手机号",
  },
  {
    step: "05",
    title: "填写 5 位短信验证码完成绑定",
    desc: "One NZ 系统会向您的手机发送一条包含 5 位数字的短信验证码。在 App 中填入 5 位验证码，勾选授权复选框，点击「Add service」即可成功绑定。",
    image: "/tutorials/onenz/onenz_confirmation_code.png",
    caption: "图 5：输入 5 位短信验证码完成绑定",
  },
  {
    step: "06",
    title: "查看手机号、余额与有效期",
    desc: "绑定成功后返回 App 首页，可随时查看：1. 顶部 021 手机号；2. 账户余额；3. 有效期（Credit expires，日月年格式，如 29 Sep 27 表示 2027年9月29日）；4. 下方为「Top up & pay bill」充值入口（到期前充值保号即可）。",
    image: "/tutorials/onenz/onenz_card_details.png",
    caption: "图 6：App 首页查看余额与有效期（日月年格式）",
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
  activeSection = "usage",
  onSelectSection,
}: OneNzTutorialProps) {
  // 判断当前是“已激活使用与账户绑定教程”还是“卡使用指南与常见问题”
  const isUsage = activeSection === "usage" || activeSection === "activation" || activeSection === "binding";

  return (
    <article className="min-w-0 space-y-7 text-sm leading-7 text-slate-600" aria-label="One NZ 电话卡教程">
      {/* 教程 1：新西兰 One NZ卡 已激活使用与账户绑定教程 */}
      {isUsage ? (
        <>
          {/* Core Features */}
          <section aria-labelledby="onenz-features">
            <h2 id="onenz-features" className="text-lg font-semibold text-slate-900">
              核心特性与说明
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

          {/* Step by step: 插卡使用 */}
          <section aria-labelledby="onenz-steps">
            <h2 id="onenz-steps" className="text-lg font-semibold text-slate-900">
              插卡与日常使用步骤
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

          {/* 账户注册与手机号绑定教程（一行两张长图排版） */}
          <section aria-labelledby="onenz-binding" className="space-y-4">
            <div className="rounded-2xl border border-orange-200/80 bg-white p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-primary">
                  <KeyRound className="h-4 w-4" />
                </span>
                <div>
                  <h3 id="onenz-binding" className="text-base font-bold text-slate-950 sm:text-lg">
                    My One NZ 账户注册与手机号绑定（随时查余额与保号期）
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    建议绑定官方 App 账户，可随时在线查询余额、流量用量以及号码有效期，便于后续保号充值。
                  </p>
                </div>
              </div>
            </div>

            {/* 一行两个流程 / 一行两张竖向长方形图片展示，紧凑省空间 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
              {appBindingSteps.map((item) => (
                <div
                  key={item.step}
                  className="rounded-2xl border border-orange-200/80 bg-white p-4 flex flex-col justify-between shadow-xs transition-shadow duration-150 hover:shadow-sm"
                >
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                        {item.step}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{item.title}</h4>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-600 min-h-[42px]">{item.desc}</p>
                  </div>
                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50 p-2 flex items-center justify-center">
                    <TutorialImage
                      src={item.image}
                      width={600}
                      height={1000}
                      caption={item.caption}
                      previewClassName="mx-auto h-[320px] sm:h-[360px] w-auto max-w-full rounded-lg object-contain shadow-xs transition-transform duration-200 hover:scale-[1.02]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 境外服务平台注册与实测 */}
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

          {/* 教程1底部导航框：直达“卡使用指南与常见问题” */}
          <section aria-label="相关指南推荐" className="pt-2">
            <div className="rounded-2xl border border-orange-200/80 bg-gradient-to-r from-orange-50/70 via-white to-orange-50/40 p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>下一篇教程</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 sm:text-lg">
                    新西兰 One 卡使用指南与常见问题
                  </h3>
                  <p className="text-xs text-slate-600">
                    了解漫游短信资费、发送 mynum 到 521 排错、每年 10 NZD 充值保号及常见故障排错。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSelectSection?.("guide");
                    const el = document.querySelector("[data-testid='tutorial-scroll']");
                    if (el) el.scrollTop = 0;
                    else window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-xs font-bold text-white shadow-sm transition-transform duration-150 hover:bg-primary/90 active:scale-95"
                >
                  <span>查看卡使用指南与常见问题</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        </>
      ) : (
        /* 教程 2：新西兰 One 卡使用指南与常见问题 */
        <>
          {/* 1. 快速上手须知 */}
          <section aria-labelledby="onenz-quickstart" className="space-y-3">
            <h3 id="onenz-quickstart" className="text-base font-bold text-slate-950 sm:text-lg flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-100 text-primary text-xs font-bold">1</span>
              快速上手须知
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-orange-200/80 bg-white p-4 shadow-xs">
                <div className="font-semibold text-slate-900 text-sm">已预先激活</div>
                <p className="mt-1 text-xs text-slate-600">卡片发货前已完成官方激活，到手直接插卡即可搜索网络使用。</p>
              </div>
              <div className="rounded-2xl border border-orange-200/80 bg-white p-4 shadow-xs">
                <div className="font-semibold text-slate-900 text-sm">漫游网络支持</div>
                <p className="mt-1 text-xs text-slate-600">在中国大陆漫游时，通常自动连接中国移动或中国联通基站。</p>
              </div>
              <div className="rounded-2xl border border-orange-200/80 bg-white p-4 shadow-xs">
                <div className="font-semibold text-slate-900 text-sm">基本计费逻辑</div>
                <p className="mt-1 text-xs text-slate-600">预付费卡无欠费风险。境外漫游免费接收短信；接打电话、发送短信按量扣费。</p>
              </div>
              <div className="rounded-2xl border border-orange-200/80 bg-white p-4 shadow-xs">
                <div className="font-semibold text-slate-900 text-sm">防跑流量提醒</div>
                <p className="mt-1 text-xs text-slate-600">漫游数据资费昂贵，平时请务必关闭手机设置中的“数据漫游”开关。</p>
              </div>
            </div>
          </section>

          {/* 2. 查号与账户管理 */}
          <section aria-labelledby="onenz-number-mgmt" className="space-y-3">
            <h3 id="onenz-number-mgmt" className="text-base font-bold text-slate-950 sm:text-lg flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-100 text-primary text-xs font-bold">2</span>
              查号与号码格式换算
            </h3>
            <div className="rounded-2xl border border-orange-200/80 bg-white p-4 sm:p-5 shadow-xs space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <div className="font-bold text-slate-900 text-xs">如何查询自己的手机号？</div>
                  <ul className="mt-2 list-disc pl-4 space-y-1 text-xs text-slate-600 leading-5">
                    <li><strong>方法 1（短信直查）：</strong> 发送短信内容 <code className="font-mono bg-orange-100/70 px-1 py-0.5 rounded text-primary">mynum</code> 到 <code className="font-mono bg-orange-100/70 px-1 py-0.5 rounded text-primary">521</code>。</li>
                    <li><strong>方法 2（App 查看）：</strong> 登录 My One NZ 官方 App，在已绑定的 Prepay Mobile 服务主页查看。</li>
                    <li><strong>方法 3（系统设置）：</strong> 在手机设置中的“蜂窝网络”或“SIM 卡”一栏查看本机号码。</li>
                    <li><strong>方法 4（包装核对）：</strong> 查看随卡附带的外包装卡托上的条码标签。</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <div className="font-bold text-slate-900 text-xs">国际格式换算规范</div>
                  <p className="mt-2 text-xs text-slate-600 leading-5">
                    新西兰国家代码为 <strong className="text-primary">+64</strong>。若本机号码在本土显示为 <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">021 xxx xxxx</code>，在国内外平台填写注册时需<strong>去掉开头的 0</strong>，填写为：
                  </p>
                  <div className="mt-2 rounded-lg bg-white p-2.5 border border-orange-200/60 font-mono text-xs text-center font-bold text-primary">
                    +64 21 xxx xxxx （或 0064 21 xxx xxxx）
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 3. 保号与有效期 */}
          <section aria-labelledby="onenz-validity" className="space-y-4">
            <h3 id="onenz-validity" className="text-base font-bold text-slate-950 sm:text-lg flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-100 text-primary text-xs font-bold">3</span>
              保号与有效期
            </h3>
            <div className="rounded-2xl border border-orange-200/80 bg-white p-4 sm:p-5 shadow-xs space-y-4">
              <div className="space-y-2">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-primary" />
                  <span>如何查看号码有效期？</span>
                </div>
                <p className="text-xs text-slate-600 leading-6 pl-6">
                  登录 One NZ 官方 App，进入已绑定的移动服务详情页（Credit expires 项，格式为日月年，如 <code className="font-mono bg-orange-50 px-1 py-0.5 rounded text-primary">29 Sep 27</code> 代表 2027年9月29日）即可直观看到到期日期。建议在手机日历中添加提前 7~14 天的日程提醒。
                </p>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-2">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>如何以最低成本长期保号？</span>
                </div>
                <div className="pl-6 text-xs text-slate-600 leading-6 space-y-1.5">
                  <p>
                    • One NZ 每次充值后，有效期通常会<strong>从充值当天起重新顺延 360 天</strong>（非原有效期向后累加）。
                  </p>
                  <p>
                    • <strong>最佳策略</strong>：在卡片<strong>临近到期前几天</strong>再充值最低档位金额（10 NZD）。充值的 10 纽币不会被系统扣除，沉淀在卡内余额中，可用于紧急发短信或开通漫游包。
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-orange-200/70 bg-orange-50/40 p-4">
                <div className="font-bold text-[#9f5327] text-xs">充值续费渠道指引：</div>
                <p className="mt-1 text-xs text-slate-700 leading-5">
                  可在 One NZ 官网（one.nz/prepaid-top-up）使用具有外币支付功能的 Visa / MasterCard 信用卡充值；<strong>如无外币信用卡，可直接联系本站在线客服代充，或在本站购买充值礼品卡/充值券进行充值续费保号</strong>（极速到账顺延 360 天）。
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openPublicSupport}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-primary/90"
                  >
                    <Headphones className="h-3.5 w-3.5" />
                    <span>联系在线客服代充保号</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 4. 网络与信号问题 */}
          <section aria-labelledby="onenz-network" className="space-y-4">
            <h3 id="onenz-network" className="text-base font-bold text-slate-950 sm:text-lg flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-100 text-primary text-xs font-bold">4</span>
              网络与信号问题
            </h3>
            <div className="rounded-2xl border border-orange-200/80 bg-white p-4 sm:p-5 shadow-xs space-y-4">
              <div className="space-y-2">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Radio className="h-4 w-4 text-primary" />
                  <span>插卡后显示“无服务”或没有网络怎么办？</span>
                </div>
                <ul className="list-disc pl-6 space-y-1.5 text-xs text-slate-600 leading-6">
                  <li>确认使用的手机没有运营商网络锁（非合约机），双卡手机建议将 One NZ 实体卡插在<strong>卡槽 1</strong>；</li>
                  <li>插卡后等待 1~3 分钟，尝试开启飞行模式等待 10 秒后再关闭，或直接重启手机；</li>
                  <li>进入手机「设置 → 蜂窝网络/移动网络 → 网络运营商」，关闭“自动选择”，手动搜索并勾选「中国移动」或「中国联通」；</li>
                  <li>尝试更换手机卡槽或换另一部手机交叉测试，并尽量避开地下室、电梯等信号屏蔽死角。</li>
                </ul>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-2">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-primary" />
                  <span>支持开启 Wi-Fi 通话（VoWiFi）吗？</span>
                </div>
                <p className="text-xs text-slate-600 leading-6 pl-6">
                  <strong>支持。</strong>若手机系统及运营商固件支持 Wi-Fi 通话，可在手机设置「蜂窝网络 → Wi-Fi 通话」中开启。连接 Wi-Fi 后能显著改善室内接收短信和通话的稳定性，在弱信号环境下依然稳定接码。
                </p>
              </div>
            </div>
          </section>

          {/* 5. 短信与电话问题 */}
          <section aria-labelledby="onenz-messages" className="space-y-4">
            <h3 id="onenz-messages" className="text-base font-bold text-slate-950 sm:text-lg flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-100 text-primary text-xs font-bold">5</span>
              短信与电话问题
            </h3>
            <div className="rounded-2xl border border-orange-200/80 bg-white p-4 sm:p-5 shadow-xs space-y-4">
              {/* 指定重点：发送 mynum 到 521 失败怎么办 */}
              <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 space-y-2">
                <div className="font-bold text-red-800 text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                  <span>发送 mynum 到 521 失败怎么办？</span>
                </div>
                <div className="pl-6 text-xs text-slate-700 leading-6 space-y-1.5">
                  <p>
                    <strong>• iPhone：</strong> 进入“设置” -&gt; “信息”，临时<strong>关闭 iMessage</strong> 功能后重新发送短信。
                  </p>
                  <p>
                    <strong>• Android：</strong> 打开自带短信 App 的设置 -&gt; 高级/更多设置 -&gt; 短信中心号码（SMSC），检查号码是否缺少 + 号。若显示为 <code className="rounded bg-white px-1 py-0.5 text-primary font-mono border border-orange-200">6421600600</code>，请手动修改为 <code className="rounded bg-white px-1 py-0.5 text-primary font-mono border border-orange-200 font-bold">+6421600600</code> 保存，检查无误后重启手机重试。
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    发送内容为 <code className="font-mono bg-white px-1 py-0.5 rounded">mynum</code> 或 <code className="font-mono bg-white px-1 py-0.5 rounded">mytype</code>（全小写、无空格），接收方直接填 <code className="font-mono bg-white px-1 py-0.5 rounded">521</code>，无需加任何区号。
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  <span>为什么收不到某些平台的验证码？</span>
                </div>
                <ul className="list-disc pl-6 space-y-1.5 text-xs text-slate-600 leading-6">
                  <li><strong>骚扰拦截检查</strong>：检查手机系统自带的骚扰拦截、垃圾短信过滤文件夹，部分系统可能误判境外短信；</li>
                  <li><strong>号码格式核对</strong>：确认平台填写的手机号格式已正确去除首位 0（格式必须为 <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">+64 21 xxx xxxx</code>）；</li>
                  <li><strong>平台风控环境</strong>：部分境外互联网平台（如某些金融、社交平台）会根据当前登录设备的 IP、地理位置或网络风控环境决定是否下发短信。若多次未收到，建议更换干净的网络节点或代理环境重试。</li>
                </ul>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-2">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-primary" />
                  <span>为什么别人拨打我的号码提示空号或接不通？</span>
                </div>
                <ul className="list-disc pl-6 space-y-1.5 text-xs text-slate-600 leading-6">
                  <li><strong>核对卡内余额</strong>：境外漫游接听电话为收费项目（约 2.89 NZD/分钟），卡内余额为 0 时系统可能限制呼入；</li>
                  <li><strong>核对呼叫格式</strong>：主叫方拨号必须加上新西兰区号，如 <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">+64 21 xxx xxxx</code> 或 <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">0064 21 xxx xxxx</code>；</li>
                  <li><strong>主叫方权限</strong>：拨打方的手机号码需开通国际长途呼出权限。</li>
                </ul>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-2">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <span>刚插卡余额为什么被扣了约 0.89 ~ 0.92 NZD？</span>
                </div>
                <p className="text-xs text-slate-600 leading-6 pl-6">
                  这是 <strong>iPhone 的系统机制</strong>：插入新卡后系统尝试激活 iMessage 或 FaceTime 时，会在后台自动向境外 Apple 服务器发送一条国际验证短信产生扣费。
                  <strong>避坑建议</strong>：iPhone 用户在插卡前或弹出提示时，务必果断点击【取消】，或在“设置 → 信息”中临时关闭 iMessage，插卡后仅收短信完全不影响正常使用。
                </p>
              </div>
            </div>
          </section>

          {/* 6. 资费与账户安全 */}
          <section aria-labelledby="onenz-security" className="space-y-4">
            <h3 id="onenz-security" className="text-base font-bold text-slate-950 sm:text-lg flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-100 text-primary text-xs font-bold">6</span>
              资费与账户安全
            </h3>
            <div className="rounded-2xl border border-orange-200/80 bg-white p-4 sm:p-5 shadow-xs space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-red-100 bg-red-50/40 p-4 space-y-1.5">
                  <div className="font-bold text-red-800 text-xs flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
                    <span>常闭数据漫游</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-5">
                    绝大多数情况下仅需用此卡接收验证码（国内收短信完全免费）。新西兰漫游数据极其昂贵（约 11.5 NZD/MB），请务必在手机设置中始终关闭该卡的数据漫游，杜绝后台应用流量偷跑。
                  </p>
                </div>

                <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-4 space-y-1.5">
                  <div className="font-bold text-[#9f5327] text-xs flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-primary shrink-0" />
                    <span>正规充值渠道</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-5">
                    建议使用官方支持的外币信用卡，或联系本站正规客服代充 / 购买官方充值礼品卡，切勿轻信来历不明的超低价黑卡代充，防止被运营商直接封号回收。
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 space-y-1.5">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <KeyRound className="h-4 w-4 text-slate-700 shrink-0" />
                    <span>信息保密防盗</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-5">
                    请妥善保管好卡套上的手机号、PUK 码、PIN 码及 One NZ 官方账户密码。切勿随意透露给第三方，切勿将平台登录短信验证码发送给任何人。
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 漫游资费对照表 */}
          <section aria-labelledby="onenz-rates-summary" className="space-y-3">
            <h4 id="onenz-rates-summary" className="text-sm font-bold text-slate-900">
              漫游资费明细速查
            </h4>
            <div className="overflow-hidden rounded-2xl border border-orange-200/80 bg-white shadow-xs">
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
          </section>

          {/* 客服与网站代充卡片 */}
          <section aria-label="代充客服支持">
            <div className="flex flex-col gap-3 rounded-2xl border border-orange-200/80 bg-white p-4 sm:flex-row sm:items-center sm:justify-between shadow-xs">
              <div>
                <div className="text-sm font-bold text-slate-900">需要代充 One NZ 纽币或购买充值礼品卡？</div>
                <p className="mt-0.5 text-xs text-muted-foreground">客服工作时间在线为您提供代充延期、礼品卡充值与技术指导。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openPublicSupport}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90"
                >
                  <Headphones className="h-4 w-4" />
                  <span>联系在线客服代充</span>
                </button>
              </div>
            </div>
          </section>

          {/* 返回教程 1 导航栏 */}
          <section aria-label="返回上篇教程" className="pt-2">
            <div className="rounded-2xl border border-orange-200/80 bg-slate-50/70 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-muted-foreground">上一篇教程</div>
                <div className="text-sm font-bold text-slate-900">新西兰 One NZ卡 已激活使用与账户绑定教程</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelectSection?.("usage");
                  const el = document.querySelector("[data-testid='tutorial-scroll']");
                  if (el) el.scrollTop = 0;
                  else window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-orange-200 bg-white px-4 py-2 text-xs font-semibold text-primary hover:bg-orange-50"
              >
                <span>查看使用与绑定教程</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </section>
        </>
      )}

      {/* 底部通用合规与安全提醒 */}
      <div className="flex items-start gap-2 rounded-2xl border border-orange-200/70 bg-orange-50/50 p-4">
        <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#b96532]" aria-hidden="true" />
        <p className="text-xs leading-5">
          收到物理卡后请妥善保管卡板上的 PUK 码和卡套资料；插卡前请务必确认关闭数据漫游。如有使用或充值疑问，随时可联系站内客服。
        </p>
      </div>
    </article>
  );
}
