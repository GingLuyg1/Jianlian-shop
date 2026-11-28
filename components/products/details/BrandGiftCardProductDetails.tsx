"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  Gamepad2,
  Gift,
  Globe,
  HelpCircle,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import { openPublicSupport } from "@/lib/support/open-public-support";
import {
  BRAND_PROFILES,
  extractGiftCardDenominationText,
  resolveGiftCardBrand,
  resolveGiftCardRegion,
  type GiftCardDetailProduct,
  type GiftCardDetailSku,
} from "./gift-card-brand-catalog";

const HIGHLIGHT_ICONS = [ShieldCheck, Zap, CreditCard, Gift, Clock3, Globe];

export default function BrandGiftCardProductDetails({
  product,
  skus,
}: {
  product: GiftCardDetailProduct;
  skus?: GiftCardDetailSku[];
}) {
  const [tab, setTab] = useState<"primary" | "secondary">("primary");
  const brandKey = resolveGiftCardBrand(product);
  if (!brandKey) return null;

  const brand = BRAND_PROFILES[brandKey];
  const region = resolveGiftCardRegion(product);
  const denominationText = extractGiftCardDenominationText(product, skus, region.currencyCode);
  const { theme } = brand;

  const highlights = brand.highlights(region.regionLabel, region.countryName);
  const specs = brand.specs(
    product.name,
    region.regionLabel,
    region.countryName,
    region.code,
    region.currencyCode,
    denominationText,
  );
  const activeSteps =
    tab === "primary"
      ? brand.deviceTabs.primarySteps(region.regionLabel, region.countryName, region.currencyCode)
      : brand.deviceTabs.secondarySteps(region.regionLabel, region.countryName, region.currencyCode);
  const warnings = brand.warnings(region.regionLabel, region.countryName, region.currencyCode);
  const faqs = brand.faqs(region.regionLabel, region.countryName, region.currencyCode);

  return (
    <div className="mt-6 w-full space-y-5 sm:mt-8 sm:space-y-6">
      {/* 1. 品牌专属旗舰 Hero + 4 格核心参数 + 6 大核心亮点卡片 */}
      <section className={`overflow-hidden rounded-2xl border ${theme.accentBorder} bg-white shadow-sm`}>
        <div className={`relative overflow-hidden bg-gradient-to-br ${theme.heroGradient} px-5 py-6 text-white sm:px-7 sm:py-8`}>
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full ${theme.heroGlowA} blur-3xl`}
          />
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -bottom-20 left-10 h-44 w-44 rounded-full ${theme.heroGlowB} blur-3xl`}
          />

          <div className="relative z-10">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur-sm ${theme.badgeClass}`}
              >
                <Gift className="h-3.5 w-3.5" />
                {brand.englishBadge} · {region.regionLabel} ({region.code})
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                官方直采 · 7×24h 自动发码
              </span>
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90">
                {region.tierBadge}
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl">
              {product.name}
            </h2>
            <p className="mt-2 text-sm font-semibold text-white/90 sm:text-base">
              {brand.tagline}
            </p>
            <p className="mt-3 max-w-3xl text-xs leading-6 text-white/80 sm:text-sm sm:leading-6">
              {brand.introSummary(region.regionLabel, region.countryName, region.currencyCode)}
            </p>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-white/70">
              {region.regionalTip}
            </p>

            {/* 4 格玻璃核心参数条 */}
            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2.5 backdrop-blur-sm">
                <div className="text-[11px] text-white/65">适用国家 / 地区</div>
                <div className="mt-0.5 text-xs font-bold text-white sm:text-sm">
                  {region.countryName} ({region.code})
                </div>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2.5 backdrop-blur-sm">
                <div className="text-[11px] text-white/65">官方结算币种</div>
                <div className="mt-0.5 font-mono text-xs font-bold text-amber-200 sm:text-sm">
                  {region.currencyCode}
                </div>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2.5 backdrop-blur-sm">
                <div className="text-[11px] text-white/65">发货模式</div>
                <div className="mt-0.5 text-xs font-bold text-emerald-300 sm:text-sm">
                  支付后秒级发码
                </div>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2.5 backdrop-blur-sm">
                <div className="text-[11px] text-white/65">可选面额 / 规格</div>
                <div className="mt-0.5 truncate text-xs font-bold text-white sm:text-sm" title={denominationText}>
                  {denominationText}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 六大核心亮点卡片网格 */}
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          {highlights.map((item, idx) => {
            const Icon = HIGHLIGHT_ICONS[idx % HIGHLIGHT_ICONS.length];
            return (
              <div
                key={item.title}
                className={`flex flex-col justify-between rounded-xl border ${theme.accentBorder} ${theme.accentBgSoft} p-4 transition-colors hover:bg-white`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${theme.accentIconBg}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className={`rounded-full border ${theme.accentBorder} bg-white px-2 py-0.5 text-[10px] font-semibold ${theme.accentText}`}>
                      {item.tag}
                    </span>
                  </div>
                  <div className="mt-2.5 text-sm font-bold text-slate-950">{item.title}</div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. 商品详细规格与交付标准（参考 GPT Plus 成品号清晰对照表） */}
      <section className="rounded-2xl border border-slate-200/85 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`h-5 w-5 ${theme.accentText}`} />
          <h3 className="text-base font-bold text-slate-900">商品详细规格与交付标准</h3>
        </div>
        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 text-xs sm:text-sm">
          {specs.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 p-3.5 sm:flex-row sm:items-center sm:gap-4">
              <span className="w-32 shrink-0 font-semibold text-slate-500">{label}</span>
              <span className="font-medium leading-6 text-slate-800">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 官方卡密交付标准与发货格式预览（参考 GPT Plus 成品号标准发货格式框） */}
      <section className={`rounded-2xl border ${theme.guaranteeBorder} bg-gradient-to-br ${theme.guaranteeBg} p-5 shadow-sm sm:p-6`}>
        <div className="flex items-center gap-2">
          <KeyRound className={`h-5 w-5 ${theme.accentText}`} />
          <h3 className="text-base font-bold text-slate-900">{brand.codeFormat.title}</h3>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm">
          {brand.codeFormat.subtitle}
        </p>

        <div className={`mt-3 overflow-x-auto rounded-xl border ${theme.accentBorder} bg-white/95 p-4 font-mono text-xs text-slate-800 shadow-inner`}>
          <div className="text-slate-400">{brand.codeFormat.sampleComment}</div>
          <div className={`mt-1.5 text-sm font-bold tracking-wider sm:text-base ${theme.codeText}`}>
            {brand.codeFormat.sampleCode}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5 font-sans text-[11px] font-medium text-slate-600 sm:grid-cols-4">
            {brand.codeFormat.anatomy.map((part) => (
              <div key={part}>{part}</div>
            ))}
          </div>
        </div>

        <div className={`mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium ${theme.guaranteeTitle}`}>
          {brand.codeFormat.promises.map((promise) => (
            <span key={promise} className="inline-flex items-center gap-1.5">
              <CheckCircle2 className={`h-3.5 w-3.5 ${theme.accentText}`} />
              {promise}
            </span>
          ))}
        </div>
      </section>

      {/* 4. 三大官方保障承诺（参考 GPT Plus 成品号三栏保障卡） */}
      <section className="rounded-2xl border border-sky-200/90 bg-gradient-to-br from-sky-50 via-blue-50/40 to-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-sky-600" />
          <h3 className="text-base font-bold text-slate-900">正版直采与无忧售后保障承诺</h3>
        </div>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          本站全系礼品卡均接入海外持牌正规数字卡密上游，杜绝来路不明的廉价黑卡，为您提供放心稳定的交付体验：
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {brand.guarantees.map((item) => (
            <div key={item.title} className="rounded-xl border border-sky-100 bg-white/95 p-4 shadow-2xs">
              <div className="text-xs font-bold text-sky-900 sm:text-sm">{item.title}</div>
              <div className="mt-1.5 text-xs leading-5 text-slate-600">{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. 充值后可以买什么？四大高频使用场景矩阵 */}
      <section className="rounded-2xl border border-slate-200/85 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
            <Sparkles className={`h-5 w-5 ${theme.accentText}`} />
            充值后能买什么？{brand.brandName} 四大热门消费场景
          </h3>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            兑换至您的 {region.regionLabel} 账号后，下列官方核心内容与会员服务均可直接抵扣消费。
          </p>
        </div>

        <div className="mt-4 grid gap-3.5 md:grid-cols-2">
          {brand.useCases.map((cat) => (
            <div key={cat.title} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Gamepad2 className={`h-4 w-4 ${theme.accentText}`} />
                  <span>{cat.title}</span>
                </div>
                <span className={`rounded-full border ${theme.accentBorder} bg-white px-2.5 py-0.5 text-[10px] font-semibold ${theme.accentText}`}>
                  {cat.badge}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {cat.items.map((sub) => (
                  <div key={sub.name} className="rounded-lg border border-slate-200/60 bg-white px-3.5 py-2.5">
                    <div className="text-xs font-semibold text-slate-900">{sub.name}</div>
                    <div className="mt-0.5 text-[11px] leading-4 text-slate-500">{sub.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. 极简四步自助兑换流程（带双端切换 + 官方兑换站外链） */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-2xs ${theme.buttonBg}`}>
              <Zap className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-950">4 步极简自助兑换指南（使用方法）</h3>
              <p className="text-xs text-slate-500">支付后在「我的订单」复制卡密，按步骤 30 秒自助入账</p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-xs">
            <button
              type="button"
              onClick={() => setTab("primary")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-all ${
                tab === "primary" ? "bg-white text-slate-950 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {brand.deviceTabs.primaryLabel}
            </button>
            <button
              type="button"
              onClick={() => setTab("secondary")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-all ${
                tab === "secondary" ? "bg-white text-slate-950 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {brand.deviceTabs.secondaryLabel}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {activeSteps.map((st) => (
            <div
              key={st.step}
              className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/75 p-4"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 font-mono text-xs font-bold text-white shadow-2xs">
                {st.step}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-950 sm:text-sm">{st.title}</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{st.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs sm:text-sm">
          <span className="font-medium text-slate-700">官方自助兑换通道直达（请先确认您的账号区域一致）：</span>
          <a
            href={brand.officialRedeemUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition ${theme.buttonBg}`}
          >
            <span>{brand.officialRedeemLabel}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </section>

      {/* 7. 下单前必看：防踩坑与锁区注意事项 */}
      <section className="rounded-2xl border border-rose-200/90 bg-rose-50/55 p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-rose-600" />
          <h3 className="text-base font-bold text-rose-950">下单前必读：锁区核对与防踩坑注意事项</h3>
        </div>
        <p className="mt-1 text-xs font-medium text-rose-700 sm:text-sm">
          数字礼品卡 99% 的兑换失败源于「账号国家/币种与所购卡密地区不匹配」，下单前请务必逐条核对：
        </p>

        <div className="mt-4 space-y-2.5">
          {warnings.map((w) => (
            <div key={w.title} className="rounded-xl border border-rose-200/75 bg-white/95 p-3.5 text-xs leading-6 sm:text-sm">
              <strong className="text-rose-800">{w.title}：</strong>
              <span className="text-slate-700">{w.desc}</span>
            </div>
          ))}
        </div>

        {brand.crossSell ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/90 bg-amber-50/75 px-4 py-3 text-xs sm:text-sm">
            <span className="flex items-center gap-2 font-medium text-amber-950">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                <strong>{brand.crossSell.title}</strong> {brand.crossSell.subtitle}
              </span>
            </span>
            <Link
              href={brand.crossSell.href}
              className="inline-flex shrink-0 items-center gap-1 font-semibold text-amber-800 hover:text-amber-950 hover:underline"
            >
              <span>{brand.crossSell.buttonLabel}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : null}
      </section>

      {/* 8. 深色高级引导横幅（参考 ChatGptGuideHeroBanner 质感） */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-900 p-5 text-white shadow-md sm:p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/20 blur-3xl"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/20 text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white sm:text-lg">
                不确定账号所属区域，或需要批量/其他面额采购？
              </h4>
              <p className="mt-1 text-xs text-slate-300 sm:text-sm">
                本站已覆盖全球 12 大主流数字品牌数百个国家和地区官方礼品卡，任何选区或兑换疑问可随时联系在线客服。
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openPublicSupport}
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20 sm:text-sm"
            >
              联系在线客服
            </button>
            <Link
              href="/products/gift-cards"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90 sm:text-sm"
            >
              <span>全部礼品卡</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* 9. 常见疑问与售后速查 (FAQ) */}
      <section className="rounded-2xl border border-slate-200/85 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <HelpCircle className={`h-5 w-5 ${theme.accentText}`} />
          <h3 className="text-base font-bold text-slate-900">买家常见疑问与售后速查 (FAQ)</h3>
        </div>
        <div className="mt-4 space-y-3">
          {faqs.map((faq, idx) => (
            <details
              key={idx}
              open={idx < 2}
              className="group rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 transition open:bg-white open:shadow-2xs"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold text-slate-900 sm:text-sm">
                <span className="flex items-center gap-2">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${theme.buttonBg}`}>
                    Q
                  </span>
                  <span>{faq.q}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400 transition-transform group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-2.5 pl-7 text-xs leading-6 text-slate-600 sm:text-sm sm:leading-6">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
