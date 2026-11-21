"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  CreditCard,
  Flame,
  Globe,
  HelpCircle,
  KeyRound,
  Layers,
  MessageSquare,
  PackageCheck,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Truck,
  Zap,
} from "lucide-react";
import { openPublicSupport } from "@/lib/support/open-public-support";

interface GiffgaffSimProductDetailsProps {
  product: {
    id?: string;
    slug?: string | null;
    name: string;
    price?: number | null;
    original_price?: number | null;
    [key: string]: any;
  };
}

export default function GiffgaffSimProductDetails({ product }: GiffgaffSimProductDetailsProps) {
  // 核心六大优势
  const highlights = [
    {
      icon: CreditCard,
      title: "0 月租 · 零持有成本",
      desc: "默认按量计费（Pay As You Go），平时不拨打电话、不发短信、不偷跑数据即完全 0 月租，无任何月租与隐藏费用。",
      tag: "100% 零月租",
    },
    {
      icon: MessageSquare,
      title: "国内免费接收短信",
      desc: "自动漫游接入中国移动或中国联通 4G/5G 优质网络，接收海内外平台 SMS 短信验证码永久免费、秒级送达。",
      tag: "收短信免费",
    },
    {
      icon: Globe,
      title: "英国原生 +44 手机号",
      desc: "英国第二大电信巨头 O2 旗下原生号段（非虚拟 VoIP 号码），纯净度极高，秒过海内外各大平台严苛风控拦截。",
      tag: "原生实体卡",
    },
    {
      icon: ShieldCheck,
      title: "无需实名认证",
      desc: "海外实体预付费 SIM 卡，无需提供大陆身份证、护照或人脸认证，隐私安全度极高，保护跨境出海业务。",
      tag: "免实名认证",
    },
    {
      icon: Clock3,
      title: "180 天极低成本保号",
      desc: "官方保号规则极度友好：每 180 天仅需产生一次计费活动（发 1 条短信约 30p 或用保号助手产生约 120KB 流量约 2.4 便士）。",
      tag: "年成本仅两元",
    },
    {
      icon: Smartphone,
      title: "三合一免剪卡 & 可转 eSIM",
      desc: "标准大卡、Micro、Nano 任意卡槽通用，适配 iPhone、iPad 及全网通安卓手机；支持在外版手机 App 内免费一键转 eSIM。",
      tag: "全网通通用",
    },
  ];

  // 支持的海内外平台矩阵
  const platformCategories = [
    {
      title: "AI 智能生产力矩阵",
      badge: "秒过手机验证",
      icon: Bot,
      color: "border-emerald-200 bg-emerald-50/50 text-emerald-800",
      items: [
        { name: "ChatGPT / OpenAI", desc: "注册与 Plus 绑卡验证" },
        { name: "Claude (Anthropic)", desc: "高风控手机验证秒过" },
        { name: "Google Gemini", desc: "谷歌生态高级 AI 验证" },
        { name: "xAI Grok / Midjourney", desc: "海外大模型全支持" },
      ],
    },
    {
      title: "全球主流社交与通讯",
      badge: "解 +86 双向限制",
      icon: MessageSquare,
      color: "border-blue-200 bg-blue-50/50 text-blue-800",
      items: [
        { name: "Telegram", desc: "解除中国号不能私聊陌生人限制" },
        { name: "WhatsApp", desc: "海外贸易与跨国通讯必备" },
        { name: "TikTok (海外抖音)", desc: "跨境出海带货与达人号" },
        { name: "Twitter (X) / Instagram", desc: "国际社媒高权重注册" },
      ],
    },
    {
      title: "跨境金融与电商海淘",
      badge: "海外原生信用",
      icon: CreditCard,
      color: "border-amber-200 bg-amber-50/50 text-amber-800",
      items: [
        { name: "PayPal (国际区)", desc: "英国/美区/欧洲个人商户" },
        { name: "Wise (TransferWise)", desc: "国际多币种资金账户安全验证" },
        { name: "Stripe", desc: "海外商户资金收款与认证" },
        { name: "海外 Apple ID", desc: "免绑外卡安全绑定收验证码" },
      ],
    },
    {
      title: "全球影音与海淘商铺",
      badge: "畅享海外服务",
      icon: Globe,
      color: "border-purple-200 bg-purple-50/50 text-purple-800",
      items: [
        { name: "Steam (外区)", desc: "土区/阿区/美区换区验证" },
        { name: "Netflix / Spotify", desc: "全球影音流媒体会员认证" },
        { name: "Amazon 英国/全球站", desc: "海淘买卖家安全账户绑定" },
        { name: "eBay / Discord", desc: "跨区社区与商城验证" },
      ],
    },
  ];

  // 三大 SKU 版本差异对比
  const skuComparison = [
    {
      tag: "极客自主选号",
      title: "Giffgaff 白卡（全新未激活）",
      price: "¥68",
      features: [
        "全新未拆封三合一实体纯白卡（未激活 · 无赠送）",
        "附带官方 6位/13位 激活码，需在官网自主输入激活",
        "自行充值激活，充多少到账多少（例如充 £10 到账 £10）",
        "国内自动漫游中国移动/联通 4G/5G 免费收短信",
        "适合有外币卡、喜欢 100% 自主选号与自主绑邮箱的买家",
      ],
      recommend: false,
    },
    {
      tag: "超值首充赠金",
      title: "GiffGaff 赠5英镑卡（全新未激活）",
      price: "¥98",
      features: [
        "全新三合一实体卡（未激活 · 附首充赠送特权）",
        "在官网首次充值 £10 激活时，官方额外赠送 £5 英镑",
        "首充到账合计 £15 充足余额（约合 140 元真实余额）",
        "国内自动漫游中国移动/联通 4G/5G 免费收短信",
        "极具性价比的英国原生电话卡之选，全平台通用",
      ],
      recommend: false,
    },
    {
      tag: "🔥 强烈推荐 · 即插即用",
      title: "GiffGaff 已激活余额15英镑卡",
      price: "¥239",
      features: [
        "专业团队代为合规完成官方激活，省去繁琐外网步骤",
        "卡内已充值并到账 £15 充足余额（约合 140 元真实余额）",
        "零门槛即插即用！无需外币卡、无需繁琐激活验证",
        "卡内 15 镑余额用于接收短信不扣费，足够保号 3~5 年以上",
        "适合无外币卡、怕麻烦、希望到手立刻收验证码的客户",
      ],
      recommend: true,
    },
  ];

  // 商品参数与规则说明
  const specs = [
    ["商品规格", "Giffgaff 英国预付费原生实体三合一 SIM 卡（支持标准大卡、Micro、Nano 卡槽）"],
    ["交付方式", "妥善防静电防折弯保护包装，默认包邮直达（如需顺丰加急请联系客服）"],
    ["漫游网络", "国内自动漫游接入中国移动或中国联通 4G / 5G 高速信号"],
    ["号码格式", "英国本土原生手机号码段（+44 7xxx xxxxxx，高信誉原生实体移动号）"],
    ["保号规则", "每 180 天产生一次计费活动（发 1 条短信或使用保号助手消耗约 120KB 流量约 2.4 便士，即可延期 180 天）"],
    ["售后说明", "物理 SIM 卡一经拆封插卡激活后不支持无理由退换，发货前均经严格质检验真，卡片完好"],
  ];

  // 简明操作五步走
  const steps = [
    {
      step: "01",
      title: "下单包邮送达",
      desc: "提交订单并填写准确的收件信息，妥善封装防静电防折弯保护芯片安全，默认包邮送达。",
    },
    {
      step: "02",
      title: "确认关闭数据漫游",
      desc: "【关键防扣费】插卡前先在手机蜂窝网络设置中确认【关闭数据漫游】，避免手机后台偷偷走流量扣费。",
    },
    {
      step: "03",
      title: "插卡自动选网",
      desc: "取出 Nano SIM 卡插入全网通手机卡槽，稍等数秒即可接入中国移动或中国联通 4G/5G 漫游信号。",
    },
    {
      step: "04",
      title: "激活或直接收码",
      desc: "已激活版即插即用，直接用于接收各类海外平台验证码；白卡访问官网（giffgaff.com/activate）输入卡套激活码完成充值激活。",
    },
    {
      step: "05",
      title: "每半年长效保号",
      desc: "手机日历设置每 5 个月提醒一次，使用本站【Giffgaff 保号助手】或发送 1 条普通短信，轻松永久持有号码！",
    },
  ];

  // 常见问答 FAQ
  const faqs = [
    {
      q: "在国内插卡可以直接接收短信吗？需要开数据漫游吗？",
      a: "完全可以直接免费接收短信！国内会自动漫游接入中国移动或中国联通 4G/5G 信号，接收来自全球任何平台的短信验证码都是完全免费的。特别注意：日常接收短信完全不需要开启数据漫游，请务必保持【数据漫游处于关闭状态】以防扣费。",
    },
    {
      q: "为什么在某些海外平台（如 OpenAI/Telegram）收不到短信？",
      a: "Giffgaff 号码本身接收短信是百分之百正常的。海外平台若收不到验证码，99% 是因为您当前使用的科学上网代理节点 IP 纯净度过低，触发了平台的防刷风控（平台直接拒绝发送短信）。建议更换独享干净的英美原生 IP 后重新请求发送即可。",
    },
    {
      q: "如何以最低成本保号？",
      a: "Giffgaff 规定连续 180 天（约 6 个月）需产生一次可计费的活动。最划算的方式是使用本站配套的【Giffgaff 在线保号助手】，消耗约 120KB 流量（约 2.4 便士，不到三毛钱人民币）；或者向任意国际号码发送一条普通短信（漫游费用约 30p，约 2.7 元人民币）。每次操作后，号码有效期立即自动顺延 180 天。",
    },
    {
      q: "实体卡可以转换成 eSIM 吗？",
      a: "可以！如果您拥有支持 eSIM 的外版手机（例如美版 iPhone 或外版安卓机），可以在手机连接 Wi-Fi 后，下载 Giffgaff 官方 App，在 App 内的 SIM 设置中点击「Switch to a new eSIM」，按照提示一键免费转换成 eSIM，在国内网络环境下亦可顺利完成。",
    },
    {
      q: "已经拥有 Giffgaff 卡，如何在网站充值？",
      a: "您可以随时在本站【礼品卡 / 充值卡】分类下购买「Giffgaff 英国 £10 数字话费充值卡密」。下单后系统自动交付 16 位官方 Voucher 卡密，前往 Giffgaff 官网或 App 输入卡密即可秒充到账，充值成功也会自动顺延 180 天有效期！",
    },
  ];

  return (
    <div className="mt-8 w-full space-y-6 text-slate-800">
      {/* 顶部 Hero 巨幕 */}
      <section className="overflow-hidden rounded-2xl border border-orange-200/80 bg-white shadow-sm">
        <div className="relative bg-gradient-to-br from-slate-900 via-stone-900 to-amber-950 p-6 text-white sm:p-8">
          {/* 装饰性背景微光 */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />

          <div className="relative flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300">
              🇬🇧 英国原生实体 SIM 卡
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-orange-200">
              0 月租 · 国内免费接收短信
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
              免实名认证 · 隐私安全
            </span>
          </div>

          <h2 className="relative mt-4 text-2xl font-black tracking-tight sm:text-3xl text-white">
            {product.name}
          </h2>

          <p className="relative mt-2 text-sm font-semibold text-amber-200/95 sm:text-base">
            英国第二大电信巨头 O2 旗下原生网络 · 真实实体 SIM 卡 · 纯净原生 +44 号段 · 秒过各大风控
          </p>

          <p className="relative mt-3 max-w-3xl text-xs leading-6 text-slate-300 sm:text-sm sm:leading-7">
            英国主流电信运营商 O2 旗下原生实体手机卡（+44 国际号码段），无需实名认证，国内自动接入中国移动或中国联通优质 4G/5G 漫游网络。免费接收海内外各大主流平台（ChatGPT、Telegram、WhatsApp、TikTok、海外银行等）验证码。长期持有仅需每 180 天产生一次可计费活动（发送 1 条短信或使用保号助手消耗约 120KB 流量约 2.4 便士，年持有成本不到两元人民币）。
          </p>

          <div className="relative mt-5 flex flex-wrap items-center gap-3 pt-2 text-xs text-amber-100/90">
            <div className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 backdrop-blur-sm">
              <Truck className="h-4 w-4 text-amber-300" />
              <span>默认包邮发货（加急顺丰可联系客服）</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 backdrop-blur-sm">
              <Smartphone className="h-4 w-4 text-emerald-300" />
              <span>标准/Micro/Nano 三合一免剪卡 · 全网通通用</span>
            </div>
          </div>
        </div>

        {/* 核心六大卖点网格 */}
        <div className="grid gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-6 bg-orange-50/20">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="relative flex flex-col justify-between rounded-xl border border-orange-100/80 bg-white p-4 shadow-sm transition hover:border-orange-300 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-orange-100/70 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                      {item.tag}
                    </span>
                  </div>
                  <div className="mt-3 text-sm font-bold text-slate-900">{item.title}</div>
                  <p className="mt-1.5 text-xs leading-5 text-slate-600">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 支持海内外平台矩阵 */}
      <section className="rounded-2xl border border-orange-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
              <Sparkles className="h-5 w-5 text-orange-600" />
              全场景海外应用与平台兼容矩阵
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              原生英国移动运营商号段（非 VoIP 虚拟号），真实物理 SIM 卡信誉度极高，秒过海内外各类严苛注册与验证。
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
            <Radio className="h-3.5 w-3.5 animate-pulse text-orange-600" />
            实测 100% 畅通接收
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {platformCategories.map((cat) => {
            const CatIcon = cat.icon;
            return (
              <div
                key={cat.title}
                className="flex flex-col rounded-xl border border-orange-100 bg-gradient-to-b from-orange-50/30 to-white p-4"
              >
                <div className="border-b border-orange-100/60 pb-3">
                  <div className="flex items-center gap-2">
                    <CatIcon className="h-4 w-4 shrink-0 text-orange-600" />
                    <span className="whitespace-nowrap text-xs font-bold text-slate-900 sm:text-sm">{cat.title}</span>
                  </div>
                  <div className="mt-2">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${cat.color}`}>
                      {cat.badge}
                    </span>
                  </div>
                </div>
                <div className="mt-3 space-y-2.5">
                  {cat.items.map((item) => (
                    <div key={item.name} className="text-xs">
                      <div className="font-semibold text-slate-800">{item.name}</div>
                      <div className="text-[11px] text-slate-500">{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 三大 SKU 版本差异对比 */}
      <section className="rounded-2xl border border-orange-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
            <Layers className="h-5 w-5 text-orange-600" />
            三大在售版本选购指南（如何选择最适合自己的规格？）
          </h3>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            根据您的使用习惯、是否具备外币信用卡及省心程度选择相应版本。
          </p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {skuComparison.map((sku) => (
            <div
              key={sku.title}
              className={`relative flex flex-col justify-between rounded-xl border p-5 transition ${
                sku.recommend
                  ? "border-amber-400 bg-gradient-to-b from-amber-50/50 via-white to-orange-50/30 shadow-md ring-1 ring-amber-300"
                  : "border-orange-100 bg-white shadow-sm"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      sku.recommend
                        ? "bg-amber-500 text-white shadow-sm"
                        : "bg-orange-100 text-orange-800"
                    }`}
                  >
                    {sku.tag}
                  </span>
                  <span className="text-base font-black text-slate-900">{sku.price}</span>
                </div>

                <div className="mt-3 text-sm font-bold text-slate-950 sm:text-base">
                  {sku.title}
                </div>

                <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                  {sku.features.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <CheckCircle2
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          sku.recommend ? "text-amber-600" : "text-orange-500"
                        }`}
                      />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 新手插卡必看：三大防扣费重要警示 */}
      <section className="rounded-2xl border border-red-200 bg-red-50/75 p-5 text-slate-800 shadow-sm sm:p-6">
        <div className="flex items-start gap-3.5">
          <ShieldAlert className="mt-1 h-6 w-6 shrink-0 text-red-600" />
          <div className="space-y-3">
            <div className="text-base font-bold text-red-900 sm:text-lg">
              新手插卡必看：三大防扣费避坑指南（插卡前务必阅读！）
            </div>
            <div className="space-y-2.5 text-xs leading-5 text-slate-700 sm:text-sm sm:leading-6">
              <div className="rounded-xl border border-red-200/60 bg-white/80 p-3.5">
                <p>
                  <strong className="text-red-700">1. 插卡前务必【关闭移动数据漫游】：</strong>
                  Giffgaff 在中国漫游的移动数据按量计费（约 20p/MB）。平时接收各类短信验证码完全不需要开漫游数据！在手机蜂窝网络设置中务必保持【关闭数据漫游】，防止后台 App（如微信、邮箱或系统同步）偷跑流量触发扣费。
                </p>
              </div>
              <div className="rounded-xl border border-red-200/60 bg-white/80 p-3.5">
                <p>
                  <strong className="text-red-700">2. iPhone 提示激活 iMessage / FaceTime 务必点击【取消】：</strong>
                  苹果手机插卡后，iOS 系统偶尔会弹出“可能会发送用于激活 iMessage / FaceTime 的短信，是否允许？”提示。此时<strong>务必果断点击【取消】</strong>！点击取消完全不影响任何正常接收验证码的功能；若误点“好”，手机会自动发送一条 30p 的国际短信扣除话费。
                </p>
              </div>
              <div className="rounded-xl border border-red-200/60 bg-white/80 p-3.5">
                <p>
                  <strong className="text-red-700">3. 国际号码拨打与发短信格式规范：</strong>
                  发送国际短信或拨打英国号码时，号码前面必须加国际区号 <code className="rounded bg-red-100 px-1 font-mono text-red-800">+44</code>，且必须去掉英国本土号码开头的第一个数字 <code className="rounded bg-red-100 px-1 font-mono text-red-800">0</code>。例如英国本地号码为 07123 456789，正确格式为 <code className="rounded bg-red-100 px-1 font-mono text-red-800">+44 7123 456789</code>。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 商品规格与服务说明表格 */}
      <section className="rounded-2xl border border-orange-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <ShieldCheck className="h-5 w-5 text-orange-600" />
          商品规格与交付说明
        </h3>
        <div className="mt-4 space-y-2.5">
          {specs.map(([label, text]) => (
            <div
              key={String(label)}
              className="flex flex-col rounded-xl border border-orange-100 bg-orange-50/30 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-2"
            >
              <span className="shrink-0 text-xs font-bold text-slate-900 sm:text-sm sm:w-28">{label}：</span>
              <span className="text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">{text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 简明快速上手五步走 */}
      <section className="rounded-2xl border border-orange-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <Zap className="h-5 w-5 text-orange-600" />
          从收到卡到长期保号：简明五步流程
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((st) => (
            <div
              key={st.step}
              className="relative flex flex-col justify-between rounded-xl border border-orange-100 bg-gradient-to-b from-orange-50/40 to-white p-4"
            >
              <div>
                <span className="font-mono text-2xl font-black text-orange-400">{st.step}</span>
                <div className="mt-2 text-xs font-bold text-slate-900 sm:text-sm">{st.title}</div>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">{st.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 直达全套高清图文教程横幅 */}
      <div className="flex flex-col gap-4 rounded-2xl border border-orange-200/90 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1">
          <div className="text-sm font-bold text-slate-950 sm:text-base">
            需要更详尽的卡套激活码图解、App 绑定、转 eSIM 或在线保号助手？
          </div>
          <p className="text-xs text-slate-600 sm:text-sm">
            本站为您整理了全套高清步骤图与常见排错技巧，支持一步一步对照操作，小白也能轻松搞定。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openPublicSupport}
            className="inline-flex items-center justify-center rounded-xl border border-orange-200 bg-white px-4 py-2 text-xs font-semibold text-orange-800 shadow-sm transition hover:bg-orange-50 sm:text-sm"
          >
            联系客服咨询
          </button>
          <Link
            href="/tutorials?topic=giffgaff"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-700 sm:text-sm"
          >
            <span>查看完整图文教程</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* 常见问题 FAQ 折叠卡片 */}
      <section className="rounded-2xl border border-orange-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
          <HelpCircle className="h-5 w-5 text-orange-600" />
          常见问答与疑难解答
        </h3>
        <div className="mt-4 space-y-3">
          {faqs.map((faq, i) => (
            <details
              key={i}
              className="group rounded-xl border border-orange-100 bg-orange-50/20 p-4 transition open:bg-orange-50/40"
            >
              <summary className="flex cursor-pointer items-center justify-between font-semibold text-slate-900 text-xs sm:text-sm">
                <span className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                    Q
                  </span>
                  <span>{faq.q}</span>
                </span>
                <span className="text-slate-400 transition-transform group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 pl-7 text-xs leading-6 text-slate-600 sm:text-sm sm:leading-6">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
