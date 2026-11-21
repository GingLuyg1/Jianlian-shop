"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  CreditCard,
  FileText,
  Globe,
  HelpCircle,
  Mail,
  MessageSquare,
  PhoneCall,
  Radio,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react";
import { openPublicSupport } from "@/lib/support/open-public-support";

interface TMobileProductDetailsProps {
  product: {
    id?: string;
    slug?: string | null;
    name: string;
    price?: number | null;
    original_price?: number | null;
    [key: string]: any;
  };
}

export default function TMobileProductDetails({ product }: TMobileProductDetailsProps) {
  const coreMetrics = [
    {
      label: "号码归属地",
      value: "美国原生号码",
      sub: "T-Mobile 官方物理移动号段",
      color: "text-pink-600",
      bg: "bg-pink-50/70",
      border: "border-pink-200",
    },
    {
      label: "首月内含套餐",
      value: "含首月 $15 套餐",
      sub: "首月全功能激活，畅享高速网络",
      color: "text-rose-600",
      bg: "bg-rose-50/70",
      border: "border-rose-200",
    },
    {
      label: "后续保号资费",
      value: "可转 $3/月 PAYGO",
      sub: "阶段实测保号降费神级方案",
      color: "text-amber-600",
      bg: "bg-amber-50/70",
      border: "border-amber-200",
    },
    {
      label: "开卡激活方式",
      value: "收卡后联系客服激活",
      sub: "先收卡再激活 · 专属技术协助",
      color: "text-purple-600",
      bg: "bg-purple-50/70",
      border: "border-purple-200",
    },
    {
      label: "国内使用方式",
      value: "仅限 Wi-Fi Calling",
      sub: "WLAN 通话零漫游费免费收发短信",
      color: "text-cyan-600",
      bg: "bg-cyan-50/70",
      border: "border-cyan-200",
    },
    {
      label: "卡片介质选择",
      value: "实体卡 / eSIM 同价",
      sub: "全网通免剪卡槽 / 极速发码",
      color: "text-emerald-600",
      bg: "bg-emerald-50/70",
      border: "border-emerald-200",
    },
  ];

  const onboardingSteps = [
    {
      step: "01",
      title: "收卡核对 · 联系客服",
      desc: "收到实体卡片后请先核对 ICCID 并联系客服协助；若为 eSIM 订单，请先核对手机机型与系统兼容性并备注接收安装码的邮箱。切勿自行盲目插卡操作！",
      tag: "先收卡再激活",
      icon: Mail,
    },
    {
      step: "02",
      title: "提交资料 · 指定州/邮编",
      desc: "向客服提供您本人的常用联系邮箱（用于接收 T-Mobile 官方通知），以及期望分配手机号码的美国州名与对应 5 位邮政编码（支持地区偏好）。",
      tag: "支持自选地区",
      icon: Send,
    },
    {
      step: "03",
      title: "协助开卡 · 开启 Wi-Fi 通话",
      desc: "客服协助完成官方开卡（eSIM 通过邮箱发送专属激活二维码）。插卡或扫码后，核对分配号码并开启手机【Wi-Fi 通话】，状态栏显示后即可畅通收发验证码！",
      tag: "即开即通",
      icon: PhoneCall,
    },
  ];

  const paygoFourSteps = [
    {
      num: "1",
      title: "首月正常使用",
      desc: "新卡激活默认含 $15 套餐，首月内可正常享受高速网络、通话与短信服务，平稳度过首个账单月。",
    },
    {
      num: "2",
      title: "次月停止全额续费",
      desc: "到了第二个账单日起，让账户自然进入欠费状态，切记不要充值满足 $15 的全额续费金额。",
    },
    {
      num: "3",
      title: "卡滞适度余额区间",
      desc: "账户内保留大于 $3 且小于 $15 的零钱余额（例如存入 $5~$10），促使系统触发欠费停机机制。",
    },
    {
      num: "4",
      title: "静待约 120 天自动转换",
      desc: "保持停机状态持续约 120 天，按目前阶段实测机制，系统将自动变更为 $3/月 PAYGO 套餐（按量计费）。",
    },
  ];

  const faqs = [
    {
      q: "购卡费用包含什么？",
      a: "实体 SIM 卡与 eSIM 同价，均包含首月 15 美元套餐费用及全流程一对一协助激活服务。后续次月续费及套餐外产生的按量费用由用户按需充值自理。",
    },
    {
      q: "可以指定美国号码的归属地区吗？",
      a: "支持地区偏好！激活时请向客服提供期望分配的美国州名（如加州 CA、特拉华 DE 免税州等）和对应 5 位邮编，实际分配以运营商当前号码池可用资源为准，暂不支持自选具体尾号。",
    },
    {
      q: "保证能注册所有海外软件或收到所有验证码吗？",
      a: "T-Mobile 原生号段属于美国顶级移动物理卡（非虚拟 VoIP），在电信底层数据库具备最高信用度，能秒过绝大多数海外高风控平台；但具体能否收到验证码仍取决于目标平台的注册政策、您的 IP 网络环境与设备纯净度，任何海外卡片均无法承诺特定第三方平台 100% 成功。",
    },
    {
      q: "日常使用遇到连接问题时怎么处理？",
      a: "请勿重复拔插或频繁修改手机设置。首先确认手机 Wi-Fi Calling 是否正常开启，并检查是否连入了稳定的网络；如仍有疑问，请保留订单号、ICCID、错误提示截图并联系在线客服快速排查解决。",
    },
  ];

  return (
    <div className="mt-8 space-y-7">
      {/* 顶部 T-Mobile 洋红旗舰 Hero 横幅 */}
      <section className="relative overflow-hidden rounded-3xl border border-pink-500/30 bg-gradient-to-br from-slate-950 via-pink-950/60 to-slate-950 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-pink-600/20 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 h-72 w-72 rounded-full bg-rose-600/15 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-500 px-3 py-1 text-xs font-black uppercase tracking-wider text-white shadow-sm">
                <Radio className="h-3.5 w-3.5 animate-pulse text-pink-200" />
                T-Mobile 原生卡
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-pink-400/40 bg-pink-500/15 px-3 py-0.5 text-xs font-semibold text-pink-200 backdrop-blur-sm">
                实体 SIM / eSIM 同价
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-pink-400/30 bg-pink-900/30 px-2.5 py-0.5 text-xs text-pink-300">
                先收卡 · 再激活
              </span>
            </div>

            <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl md:text-3xl">
              美国 T-Mobile 原生手机卡
              <span className="mt-1 block text-base font-bold text-pink-300 sm:text-lg">
                （含首月 $15 套餐 · 收卡后技术协助激活）
              </span>
            </h2>

            <p className="text-xs leading-relaxed text-slate-300 sm:text-sm">
              专为长期深耕美国原生号段打造！通杀各大海外主流社媒（TikTok、X、Telegram、WhatsApp）与美区各大银行（BOA、Chase、Citi、Amex）高风控短信验证，国内开启 Wi-Fi Calling 畅享跨国免费通话。采用安全省心的「先收卡，再协助激活」交付体系，绑定您本人真实邮箱并支持自选美国州名与邮编偏好！
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-slate-400">
              <span className="flex items-center gap-1 text-pink-300">
                <CheckCircle2 className="h-4 w-4 text-pink-400" />
                默认包邮发货 (加急顺丰可联系客服)
              </span>
              <span className="flex items-center gap-1 text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-pink-400" />
                三合一免剪卡槽 / 全网通手机通用
              </span>
            </div>
          </div>

          {/* 右侧核心亮点卡：Wi-Fi Calling 专属指引 */}
          <div className="flex shrink-0 flex-col justify-between rounded-2xl border border-pink-500/30 bg-pink-950/40 p-5 backdrop-blur-md lg:w-72">
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-pink-300">
                  <Wifi className="h-4 w-4 text-pink-400" />
                  国内零漫游核心
                </span>
                <span className="rounded-full bg-pink-500/20 px-2 py-0.5 text-[10px] font-semibold text-pink-300">
                  WLAN 通话
                </span>
              </div>
              <h3 className="mt-2 text-sm font-bold text-white">开启 Wi-Fi Calling 免费接码</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                在国内无需任何国际漫游数据流量，连接宽带 WiFi 开启手机原生 WLAN 通话功能，即可 0 费用收发短信与高清通话。
              </p>
            </div>
            <div className="mt-4 rounded-xl border border-pink-500/20 bg-pink-900/30 p-2.5 text-center text-xs text-pink-200">
              状态栏显示「T-Mobile Wi-Fi」即代表成功生效
            </div>
          </div>
        </div>
      </section>

      {/* 核心指标 6 宫格看板 */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {coreMetrics.map((item, idx) => (
          <div
            key={idx}
            className={`flex flex-col justify-between rounded-2xl border ${item.border} ${item.bg} p-4 shadow-sm transition hover:shadow-md`}
          >
            <span className="text-[11px] font-medium text-slate-500">{item.label}</span>
            <div className={`mt-2 font-mono text-sm font-extrabold sm:text-base ${item.color}`}>
              {item.value}
            </div>
            <p className="mt-1 text-[10px] leading-tight text-slate-600 sm:text-[11px]">{item.sub}</p>
          </div>
        ))}
      </section>

      {/* 卡片到手 · 三步开启连接流程 */}
      <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <Zap className="h-5 w-5 text-pink-600" />
          卡片到手 · 三步极速开启连接
        </div>
        <p className="mt-1 text-xs text-slate-500 sm:text-sm">
          全程一对一技术指导，从收卡到插卡通话顺畅无阻
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {onboardingSteps.map((st) => {
            const Icon = st.icon;
            return (
              <div
                key={st.step}
                className="group relative flex flex-col justify-between rounded-2xl border border-pink-100 bg-gradient-to-b from-pink-50/40 via-white to-pink-50/20 p-5 shadow-xs transition hover:border-pink-300 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-2xl font-black text-pink-300 group-hover:text-pink-500 transition-colors">
                      {st.step}
                    </span>
                    <span className="rounded-full bg-pink-100 px-2.5 py-0.5 text-[10px] font-bold text-pink-800">
                      {st.tag}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-pink-600 shrink-0" />
                    <h3 className="text-sm font-bold text-slate-900">{st.title}</h3>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">{st.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 核心重点板块：如何变为 $3/月 PAYGO 套餐（阶段实测方法） */}
      <section className="overflow-hidden rounded-3xl border-2 border-pink-300 bg-gradient-to-br from-white via-pink-50/30 to-rose-50/20 p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between border-b border-pink-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-600 text-white shadow-xs">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-base font-extrabold text-slate-950 sm:text-lg">
                如何变更为 $3/月 PAYGO 套餐？（阶段实测保号降费指南）
              </h3>
              <p className="text-xs text-slate-500">
                很多客户关心的长期低成本持有方案，请按以下实测步骤与风控边界谨慎操作
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-pink-100 px-3 py-1 text-xs font-bold text-pink-800">
            独家实操攻略
          </span>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          {/* 左栏：转换四步流程 */}
          <div className="space-y-3.5 lg:col-span-7">
            <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
              <FileText className="h-4 w-4 text-pink-600" />
              自行转换四步流程规范
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {paygoFourSteps.map((st) => (
                <div
                  key={st.num}
                  className="rounded-2xl border border-pink-100/90 bg-white p-4 shadow-2xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pink-500 text-[10px] font-bold text-white">
                      {st.num}
                    </span>
                    <span className="text-xs font-bold text-slate-900">{st.title}</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">{st.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 右栏：120天停机限制与风险提示（必读） */}
          <div className="flex flex-col justify-between rounded-2xl border-2 border-red-200 bg-red-50/80 p-5 shadow-xs lg:col-span-5">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-red-900 sm:text-base">
                <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
                ⚠️ 120 天停机限制与风险提示（必读！）
              </div>
              <div className="mt-3.5 space-y-3 text-xs leading-relaxed text-slate-700">
                <div className="rounded-xl border border-red-200/80 bg-white/90 p-3.5">
                  <strong className="text-red-700">1. 停机期内无法接收任何第三方验证码：</strong>
                  在约 120 天的欠费停机期内，该卡<strong>只能接收 T-Mobile 官方网站登录验证码</strong>！美区银行、海外社媒、支付软件等第三方短信验证码一律无法收到。重要账号请勿在此时提前换绑！
                </div>
                <div className="rounded-xl border border-red-200/80 bg-white/90 p-3.5">
                  <strong className="text-red-700">2. 非官方承诺业务，存在销号关户风险：</strong>
                  此保号降费路径为玩家群体目前阶段的实测机制，非运营商官方承诺政策，不保证 100% 成功；若 120 天内因运营商规则变更被系统提前回收或注销，号码将无法找回。重要主力工作号请勿使用此方法！
                </div>
              </div>
            </div>
            <div className="mt-4 pt-2 border-t border-red-200/60 text-[11px] text-red-800">
              建议：若追求绝对稳定与长期无间断接码，推荐继续保留默认正常资费持有。
            </div>
          </div>
        </div>
      </section>

      {/* 使用条件与售后风险告知（双栏） */}
      <section className="grid gap-5 md:grid-cols-2">
        {/* 国内无漫游与设备兼容要求 */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-base font-bold text-slate-950">
            <Smartphone className="h-5 w-5 text-pink-600" />
            国内无漫游与设备兼容要求
          </div>
          <div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-600">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <strong className="text-slate-900">国内无基站漫游说明：</strong>
              本卡在中国大陆不提供传统基站信号漫游，必须在 <strong>Wi-Fi Calling（WLAN 通话）</strong>已成功生效的网络环境下使用，即可正常免费收发短信与接打电话。
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <strong className="text-slate-900">苹果与安卓手机兼容性：</strong>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                <li><strong>苹果手机：</strong>国行或海外版 iPhone（建议 iPhone 8 及以上，系统保持较新版本）均可原生完美支持 Wi-Fi Calling。</li>
                <li><strong>安卓手机：</strong>海外版安卓通常原生支持；<strong>国行安卓手机请务必在下单前联系在线客服核对具体机型与基带支持情况</strong>，以免设备不支持 WLAN 通话。</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 交付保障与售后服务边界 */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-base font-bold text-slate-950">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            交付保障与售后服务边界
          </div>
          <div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-600">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
              <strong className="text-emerald-900">交付前方责任包退换：</strong>
              卡片按约定交付并在我方技术协助完成激活前，若因卡片故障、无法识别或号码无法激活，包换或全额退款，保障您的权益。
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <strong className="text-slate-900">交付后运营与平台免责：</strong>
              协助激活确认正常后即视为交付完成。后续若因用户违规操作、运营商风控政策调整、停机转套餐失败导致受限，或因单方第三方平台规则/本地网络问题收不到验证码，不在售后与退款范围。
            </div>
          </div>
        </div>
      </section>

      {/* 常见问题解答 FAQ */}
      <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <HelpCircle className="h-5 w-5 text-pink-600" />
          常见问答与疑难解答
        </h3>
        <div className="mt-4 space-y-3">
          {faqs.map((faq, i) => (
            <details
              key={i}
              className="group rounded-2xl border border-pink-100 bg-pink-50/20 p-4 transition open:bg-pink-50/40"
            >
              <summary className="flex cursor-pointer items-center justify-between text-xs font-bold text-slate-900 sm:text-sm">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pink-600 text-[10px] font-bold text-white">
                    Q
                  </span>
                  <span>{faq.q}</span>
                </span>
                <span className="text-slate-400 transition-transform group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 pl-7 text-xs leading-relaxed text-slate-600 sm:text-sm">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* 底部客服咨询条 */}
      <div className="flex flex-col gap-4 rounded-3xl border border-pink-200/90 bg-gradient-to-r from-pink-50 via-rose-50 to-pink-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1">
          <div className="text-sm font-bold text-slate-950 sm:text-base">
            需要了解更多 T-Mobile 激活支持、Wi-Fi Calling 设备设置或自选州偏好？
          </div>
          <p className="text-xs text-slate-600 sm:text-sm">
            本站为您提供全流程卡片激活指导与售后支持，保障您的境外卡片长期安全稳定持有。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openPublicSupport}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:from-pink-700 hover:to-rose-700 sm:text-sm"
          >
            <span>联系在线客服确认</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
