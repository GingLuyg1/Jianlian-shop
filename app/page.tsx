"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CreditCard,
  Gift,
  Globe2,
  KeyRound,
  MessageCircle,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Timer,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { useMobileStorefront } from "@/hooks/use-mobile-storefront";
import { fallbackCategoriesByPath, simRegionCode } from "@/lib/catalog/storefront-category-visuals";
import { findVisibleStorefrontPrimaryCategory, isCatalogCategoryHref, storefrontCategoryPaths } from "@/lib/catalog/visible-storefront-category-routes";
import { getChildCategories, normalizeText } from "@/lib/supabase/public-catalog";
import { cn } from "@/lib/utils";
import { useVisibleStorefrontCategoryHrefs } from "@/hooks/use-visible-storefront-categories";

const categoryCards = [
  {
    title: "数字 / 社媒账号",
    desc: "Apple ID / Steam / Gmail 等账号商品",
    href: "/products/digital-accounts",
    icon: KeyRound,
    active: true,
  },
  {
    title: "AI 会员充值",
    desc: "ChatGPT / Claude / Grok 等会员服务",
    href: "/products/ai-membership",
    icon: Bot,
  },
  {
    title: "礼品卡 / 充值卡",
    desc: "Apple Gift Card / App Store 等充值卡",
    href: "/products/gift-cards",
    icon: Gift,
  },
  {
    title: "国际 SIM 卡",
    desc: "海外实体卡、SIM 与通信服务",
    href: "/products/sim-cards",
    icon: CreditCard,
  },
  {
    title: "账号充值",
    desc: "账户余额与账号增值服务",
    href: "/products/account-recharge",
    icon: Wallet,
  },
];

const hotLinks = [
  { title: "Apple ID", desc: "多地区 Apple ID 与成品账号", href: "/products/digital-accounts?category=apple-id" },
  { title: "Steam 账号", desc: "Steam 成品号与游戏账号", href: "/products/digital-accounts?category=steam" },
  { title: "ChatGPT Plus", desc: "Plus / Pro 等会员服务", href: "/products/ai-membership?search=ChatGPT" },
  { title: "Grok Super", desc: "Grok 高阶会员服务", href: "/products/ai-membership?search=Grok" },
];

const highlights = [
  { title: "购买前核对", desc: "地区、规格、库存与交付说明", icon: ShieldCheck },
  { title: "按说明交付", desc: "自动或人工处理，以商品详情为准", icon: Timer },
  { title: "交付后核验", desc: "收到账号、卡密或充值结果后及时检查", icon: CheckCircle2 },
];

const heroSlides = [
  {
    title: "轻松连接全球数字生活",
    desc: "提供 AI 会员、精选数字账号与全球礼品卡等优质数字服务。下单前请核对商品说明，收到账户和卡密后请第一时间检查。",
    visual: "globe",
  },
  {
    title: "一站式数字商品交付服务",
    desc: "常用数字商品入口集中展示，按类目快速筛选。补货、批量购买或不确定商品是否适合时，请先联系在线客服确认。",
    visual: "service",
  },
];

const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function HeroCarousel() {
  const { isMobile } = useMobileStorefront();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const nextIndex = (activeIndex + 1) % heroSlides.length;
  const orderedSlides = [heroSlides[activeIndex], heroSlides[nextIndex]];
  const visibleIndex = isMoving ? nextIndex : activeIndex;

  useEffect(() => {
    let moveTimer: number | null = null;
    const timer = window.setInterval(() => {
      setIsMoving(true);
      moveTimer = window.setTimeout(() => {
        setActiveIndex((current) => (current + 1) % heroSlides.length);
        setIsMoving(false);
      }, 720);
    }, 4200);

    return () => {
      window.clearInterval(timer);
      if (moveTimer !== null) window.clearTimeout(moveTimer);
    };
  }, []);

  const mascotAnchorClassName =
    "hidden lg:flex items-end -space-x-2 pointer-events-none select-none absolute top-0 -translate-y-[58%] left-[21.5%] -translate-x-1/2";
  const mascotImgClassName =
    "h-[108px] xl:h-[118px] w-auto object-contain select-none pointer-events-none";

  return (
    <div data-testid="hero-carousel-outer" className="relative z-30 overflow-visible">
      {/* 1. 后景虚层（仅桌面端展示，移动端取消吉祥物展示且不触发图片下载） */}
      {!isMobile ? (
        <div
          aria-hidden="true"
          data-testid="hero-mascots-back"
          className={cn(mascotAnchorClassName, "z-[12] opacity-35 blur-[2px] saturate-90")}
        >
          <picture>
            <source media="(min-width: 1024px)" srcSet="/mascots/gemini-back.webp" type="image/webp" />
            <img src={TRANSPARENT_PIXEL} alt="" width={193} height={260} draggable={false} decoding="async" className={mascotImgClassName} />
          </picture>
          <picture>
            <source media="(min-width: 1024px)" srcSet="/mascots/chatgpt-back.webp" type="image/webp" />
            <img src={TRANSPARENT_PIXEL} alt="" width={186} height={260} draggable={false} decoding="async" className={mascotImgClassName} />
          </picture>
        </div>
      ) : null}

      {/* 2. 内层轮播轨道容器（圆角和轮播溢出裁剪只放在内层） */}
      <section className="relative overflow-hidden rounded-2xl border border-orange-100 bg-[#fff6ed] shadow-sm h-[200px] xl:h-[220px] 2xl:h-[270px]">
        <div
          className={cn(
            "flex h-full w-[200%]",
            isMoving && "transition-transform duration-700 ease-out"
          )}
          style={{ transform: isMoving ? "translateX(-50%)" : "translateX(0)" }}
        >
          {orderedSlides.map((slide) => (
            <div
              key={slide.title}
              className="relative h-full w-1/2 shrink-0 overflow-hidden px-6 py-5 2xl:px-8 2xl:py-7"
            >
              <div className="relative z-[15] flex h-full max-w-4xl flex-col justify-center pb-4 lg:max-w-[55%] lg:pb-0 lg:pt-2">
                <h1 className="max-w-3xl text-xl font-bold leading-tight tracking-tight text-slate-950 sm:text-2xl lg:text-3xl 2xl:text-4xl">
                  {slide.title}
                </h1>
                <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground sm:mt-2.5 sm:text-sm sm:leading-6 2xl:text-base">
                  {slide.desc}
                </p>
                <div className="mt-3 2xl:mt-5 flex flex-wrap gap-2 text-xs 2xl:text-sm font-medium text-primary">
                  <span className="rounded-full bg-white px-3 py-1 2xl:px-4 2xl:py-1.5 shadow-sm">
                    安全合规
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 2xl:px-4 2xl:py-1.5 shadow-sm">
                    快速交付
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 2xl:px-4 2xl:py-1.5 shadow-sm">
                    专业售后
                  </span>
                </div>
              </div>

              <HeroVisual type={slide.visual} />
            </div>
          ))}
        </div>

        <div className="absolute bottom-3.5 left-6 z-20 flex gap-2">
          {heroSlides.map((slide, index) => (
            <button
              key={slide.title}
              type="button"
              aria-label={`切换到第 ${index + 1} 张首页图`}
              onClick={() => {
                if (index === activeIndex || isMoving) return;
                setActiveIndex(index);
              }}
              className={cn(
                "h-2 rounded-full transition-all",
                index === visibleIndex ? "w-8 bg-primary" : "w-2 bg-primary/25"
              )}
            />
          ))}
        </div>
      </section>

      {/* 3. 上边框物理接触暗影（z-20）与前景实层（仅桌面端渲染，手机端取消展示） */}
      {!isMobile ? (
        <>
          <div
            aria-hidden="true"
            className="hidden lg:block pointer-events-none select-none absolute top-0 left-[21.5%] -translate-x-1/2 -translate-y-1/2 z-20 h-2 w-28 bg-[#4a2e3e]/12 blur-[4px] rounded-full"
          />
          <div
            aria-hidden="true"
            data-testid="hero-mascots-front"
            className={cn(mascotAnchorClassName, "z-40 drop-shadow-[2px_5px_7px_rgba(65,38,58,0.18)]")}
          >
            <picture>
              <source media="(min-width: 1024px)" srcSet="/mascots/gemini-front.webp" type="image/webp" />
              <img src={TRANSPARENT_PIXEL} alt="Gemini 吉祥物" width={193} height={260} draggable={false} decoding="async" className={mascotImgClassName} />
            </picture>
            <picture>
              <source media="(min-width: 1024px)" srcSet="/mascots/chatgpt-front.webp" type="image/webp" />
              <img src={TRANSPARENT_PIXEL} alt="ChatGPT 吉祥物" width={186} height={260} draggable={false} decoding="async" className={mascotImgClassName} />
            </picture>
          </div>
        </>
      ) : null}
    </div>
  );
}

function HeroVisual({ type }: { type: string }) {
  if (type === "service") {
    const steps = [
      { title: "选择类目", desc: "按类目进入商品列表" },
      { title: "核对说明", desc: "查看地区、库存和售后" },
      { title: "提交订单", desc: "填写接收信息并提交" },
      { title: "检查交付", desc: "发货后及时核验内容" },
    ];

    return (
      <div className="hero-visual-desktop absolute inset-y-0 right-0 hidden w-[48%] lg:block">
        <div className="absolute right-14 top-1/2 w-[390px] -translate-y-1/2 rounded-2xl border border-orange-100 bg-white/85 p-4 shadow-[0_28px_80px_rgba(214,106,44,0.16)] backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <PackageCheck className="h-6 w-6" />
            </span>
            <div>
              <div className="text-lg font-bold text-slate-950">
                商品交付流程
              </div>
              <div className="text-sm text-muted-foreground">
                先确认说明，再提交订单
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {steps.map((item, index) => (
              <div
                key={item.title}
                className="rounded-xl bg-orange-50 px-3 py-3 shadow-[inset_0_0_0_1px_rgba(221,113,47,0.06)]"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-bold text-primary">
                    {index + 1}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {item.title}
                  </span>
                </div>
                <div className="mt-2 text-xs leading-5 text-muted-foreground">
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="absolute right-8 top-12 h-28 w-28 rounded-full bg-orange-200/30 blur-2xl" />
        <div className="absolute bottom-10 right-80 h-24 w-24 rounded-full bg-primary/15 blur-2xl" />
      </div>
    );
  }

  return (
    <div className="hero-visual-desktop absolute inset-y-0 right-0 hidden w-[50%] lg:block">
      <div className="absolute right-16 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.92)_0%,rgba(255,208,161,0.7)_42%,rgba(255,255,255,0)_72%)]" />
      <div className="absolute right-20 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full border border-orange-200/70" />
      <div className="absolute right-8 top-[43%] h-28 w-[390px] rotate-12 rounded-full border border-orange-300/50" />
      <div className="absolute right-8 top-[51%] h-28 w-[390px] -rotate-12 rounded-full border border-orange-300/40" />
      <Globe2
        className="absolute right-[140px] top-1/2 h-28 w-28 -translate-y-1/2 text-orange-300/80"
        strokeWidth={1.15}
      />
      <span className="absolute right-24 top-16 h-2 w-2 rounded-full bg-primary" />
      <span className="absolute right-80 bottom-16 h-2 w-2 rounded-full bg-primary" />
    </div>
  );
}

export default function HomePage() {
  const { isMobile } = useMobileStorefront();
  const { visibleHrefs: visibleCategoryHrefs, rows: categoryRows } = useVisibleStorefrontCategoryHrefs();
  const visibleCategoryCards = categoryCards
    .filter((item) => !isCatalogCategoryHref(item.href) || visibleCategoryHrefs.has(item.href))
    .map((item) => {
      if (categoryRows && isCatalogCategoryHref(item.href)) {
        const primary = findVisibleStorefrontPrimaryCategory(item.href, categoryRows);
        if (primary?.name) {
          const normalizedTitle = primary.name
            .replace(/国际\s*sim\s*卡|国际电话卡/gi, "国际 SIM 卡")
            .replace(/数字\s*\/\s*社媒账号/g, "数字 / 社媒账号")
            .replace(/礼品卡\s*\/\s*充值卡/g, "礼品卡 / 充值卡");
          return { ...item, title: normalizedTitle };
        }
      }
      return item;
    });
  const visibleHotLinks = hotLinks.filter((item) => {
    const categoryHref = item.href.split("?")[0];
    return !isCatalogCategoryHref(categoryHref) || visibleCategoryHrefs.has(categoryHref);
  });
  const [activeMobilePrimaryIndex, setActiveMobilePrimaryIndex] = useState(0);

  const mobileCategoryTree = useMemo(() => {
    if (!categoryRows) return [];
    const tree: Array<{
      path: string;
      primaryId: string;
      primaryName: string;
      icon: LucideIcon;
      items: Array<{
        id: string;
        name: string;
        targetUrl: string;
        image?: string;
        code?: string;
      }>;
    }> = [];

    for (const card of categoryCards) {
      if (!isCatalogCategoryHref(card.href) || !visibleCategoryHrefs.has(card.href)) continue;
      const primary = findVisibleStorefrontPrimaryCategory(card.href, categoryRows);
      if (!primary) continue;
      const visuals = fallbackCategoriesByPath[card.href] ?? [];
      const queryKey = card.href === "/products/sim-cards" ? "country" : "category";
      const children = getChildCategories(categoryRows, primary.id);
      if (children.length === 0) continue;

      const subItems = children.map((child) => {
        const normalizedSlug = normalizeText(child.slug);
        const normalizedName = normalizeText(child.name);
        const visual = visuals.find((v) => {
          const aliases = [v.slug, v.name, ...(v.aliases ?? [])].map(normalizeText);
          return aliases.some(
            (alias) => alias === normalizedSlug || normalizedName.includes(alias) || alias.includes(normalizedName)
          );
        });
        return {
          id: child.id,
          name: child.name,
          targetUrl: `${card.href}?${queryKey}=${encodeURIComponent(child.slug)}`,
          image: visual?.image,
          code: card.href === "/products/sim-cards" ? simRegionCode(child.slug, child.name) : undefined,
        };
      });

      tree.push({
        path: card.href,
        primaryId: primary.id,
        primaryName: primary.name || card.title,
        icon: card.icon,
        items: subItems,
      });
    }

    return tree;
  }, [categoryRows, visibleCategoryHrefs]);

  const mobileSecondaryItems = useMemo(() => {
    return mobileCategoryTree.flatMap((cat) => cat.items);
  }, [mobileCategoryTree]);

  return (
    <PublicLayout contentClassName={cn("mx-auto max-w-[1540px] px-4 py-3 md:px-5 md:py-4 pb-12", isMobile && "!px-3 !py-2.5 !pb-16")}>
      <div className={cn("flex flex-col gap-3.5 md:gap-4", isMobile && "!gap-3")}>
        <div className={cn(
          "[&_h1]:text-xl [&_h1]:sm:text-2xl [&_h1]:lg:text-3xl [&_h1]:2xl:text-4xl [&_p]:mt-2 [&_p]:text-xs [&_p]:leading-5 [&_p]:sm:mt-2.5 [&_p]:sm:text-sm [&_p]:sm:leading-6 [&_p]:2xl:text-base [&_section>div:first-child>div]:px-5 [&_section>div:first-child>div]:py-4 [&_section>div:first-child>div]:pb-8 [&_section>div:first-child>div]:lg:px-7 [&_section>div:first-child>div]:lg:py-6 [&_section>div:last-child]:bottom-3 [&_section>div:last-child]:left-5 [&_section>div:last-child]:lg:bottom-4 [&_section>div:last-child]:lg:left-7",
          isMobile && "[&_h1]:!text-xl [&_h1]:!leading-7 [&_p]:!mt-2 [&_p]:!text-xs [&_p]:!leading-5 [&_section]:!min-h-0 [&_section>div:first-child]:!min-h-[168px] [&_section>div:first-child>div]:!px-4 [&_section>div:first-child>div]:!py-3.5 [&_section>div:first-child>div]:!pb-9 [&_section>div:last-child]:!bottom-2.5 [&_section>div:last-child]:!left-4 [&_.hero-visual-desktop]:!hidden"
        )}>
          <HeroCarousel />
        </div>

        <section className={cn("grid gap-3 md:gap-4 xl:grid-cols-[1fr_330px]", isMobile && "!grid-cols-1")}>
          {isMobile && mobileSecondaryItems.length > 0 ? (
            <div data-testid="mobile-secondary-direct-grid" className="rounded-2xl border border-orange-200/80 bg-white p-3.5 shadow-sm">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-950">分类直达</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    点击任意子分类直接进入对应商品列表
                  </p>
                </div>
                <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  共 {mobileSecondaryItems.length} 项
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {mobileSecondaryItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.targetUrl}
                    className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-100 bg-orange-50/25 px-2 py-2.5 text-center transition-colors hover:border-primary/30 hover:bg-orange-50/60"
                  >
                    {item.code ? (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                        {item.code}
                      </span>
                    ) : item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-8 w-8 shrink-0 rounded-lg bg-white object-cover ring-1 ring-slate-200/80"
                      />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <KeyRound className="h-4 w-4" />
                      </span>
                    )}
                    <span className="w-full truncate text-xs font-semibold text-slate-900">
                      {item.name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className={cn("rounded-2xl border border-border bg-white p-4 shadow-sm md:p-5", isMobile && "!p-3.5")}>
            <div className="mb-3 flex items-end justify-between gap-3 md:mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-950 md:text-xl">
                  {isMobile ? "核心服务专区" : "商品分类"}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground md:mt-1 md:text-sm">
                  选择类目后进入商品列表
                </p>
              </div>
              <span className="hidden text-sm text-muted-foreground xl:block">
                库存和价格以详情页为准
              </span>
            </div>
            <div className={cn("grid grid-cols-2 gap-2.5 md:gap-3 2xl:grid-cols-3", isMobile && "!grid-cols-2 !gap-2")}>
              {visibleCategoryCards.map((category) => {
                const Icon = category.icon;
                return (
                  <Link
                    key={category.title}
                    href={category.href}
                    className={cn(
                      "group flex min-h-[72px] items-center gap-2.5 rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm md:min-h-[92px] md:gap-4 md:p-4",
                      isMobile && "!min-h-[64px] !gap-2 !p-2.5",
                      category.active
                        ? "border-primary/25 bg-primary/[0.04]"
                        : "border-border bg-white"
                    )}
                  >
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary md:h-12 md:w-12", isMobile && "!h-9 !w-9")}>
                      <Icon className={cn("h-5 w-5 md:h-6 md:w-6", isMobile && "!h-4 !w-4")} />
                    </span>
                    <span className="min-w-0">
                      <span className={cn("flex items-center gap-1.5 text-sm font-semibold text-slate-950 md:gap-2 md:text-base", isMobile && "!text-[13px]")}>
                        <span className="truncate">{category.title}</span>
                        <ArrowRight className="hidden h-4 w-4 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100 xl:inline" />
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground md:mt-1 md:text-sm">
                        {category.desc}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className={cn("rounded-2xl border border-border bg-white p-4 shadow-sm md:p-5", isMobile && "!p-3.5")}>
            <div className="mb-3 flex items-center justify-between md:mb-4">
              <h2 className="text-base font-bold text-slate-950 md:text-xl">热门入口</h2>
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className={cn("grid grid-cols-2 gap-2.5 xl:grid-cols-1 xl:gap-0 xl:space-y-3", isMobile && "!grid-cols-2 !gap-2")}>
              {visibleHotLinks.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className={cn("flex items-center justify-between gap-2 rounded-xl border border-border bg-slate-50/70 px-3 py-2.5 font-semibold text-slate-950 transition-colors hover:border-primary/30 hover:bg-white md:px-4 md:py-3", isMobile && "!px-2.5 !py-2")}
                >
                  <span className="min-w-0 text-sm md:text-base">
                    <span className={cn("block truncate", isMobile && "text-[13px]")}>{item.title}</span>
                    <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground md:mt-1">{item.desc}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className={cn("grid gap-3 md:gap-4 xl:grid-cols-[1fr_330px]", isMobile && "!grid-cols-1")}>
          <div className={cn("grid gap-3 rounded-2xl border border-border bg-white p-3.5 shadow-sm sm:grid-cols-3 md:p-4", isMobile && "!grid-cols-1 !gap-2.5 !p-3")}>
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-950">
                      {item.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.desc}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-xs leading-5 text-primary shadow-sm sm:text-sm sm:leading-6">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            本站仅提供合法合规的数字商品及相关服务，拒绝任何违法用途。
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}

