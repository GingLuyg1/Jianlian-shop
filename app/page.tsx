"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { cn } from "@/lib/utils";

const categoryCards = [
  {
    title: "数字账号",
    desc: "Apple ID / Steam / Gmail",
    href: "/products/digital-accounts",
    icon: KeyRound,
    active: true,
  },
  {
    title: "AI会员充值",
    desc: "ChatGPT / Claude / Grok",
    href: "/products/ai-membership",
    icon: Bot,
  },
  {
    title: "礼品卡 / 充值卡",
    desc: "Apple Gift Card / App Store",
    href: "/products/gift-cards",
    icon: Gift,
  },
  {
    title: "国际电话卡",
    desc: "海外实体卡与通信服务",
    href: "/products/sim-cards",
    icon: CreditCard,
  },
  {
    title: "接码服务",
    desc: "注册验证 / 平台接码",
    href: "/products/sms-code",
    icon: MessageCircle,
  },
  {
    title: "账号充值",
    desc: "余额与账号增值服务",
    href: "/products/account-recharge",
    icon: Wallet,
  },
];

const hotLinks = [
  { title: "Apple ID", href: "/products/digital-accounts?category=apple-id" },
  { title: "Steam 账号", href: "/products/digital-accounts?category=steam" },
  { title: "ChatGPT Plus", href: "/products/ai-membership?category=chat-gpt" },
  { title: "Grok Super", href: "/products/ai-membership?category=grok" },
];

const highlights = [
  { title: "安全合规", desc: "下单前请核对说明", icon: ShieldCheck },
  { title: "快速交付", desc: "按商品说明处理发货", icon: Timer },
  { title: "售后核验", desc: "拿到账号后及时检查", icon: CheckCircle2 },
];

const heroSlides = [
  {
    title: "全球数字商品与通信服务商城",
    desc: "提供数字账号、AI会员充值、礼品卡、国际电话卡等商品。下单前请核对商品说明，拿到账号和卡密后请第一时间检查。",
    visual: "globe",
  },
  {
    title: "一站式数字商品交付服务",
    desc: "常用数字商品入口集中展示，按类目快速筛选。补货、批量购买或不确定商品是否适合时，请先联系在线客服确认。",
    visual: "service",
  },
];

function HeroCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const nextIndex = (activeIndex + 1) % heroSlides.length;
  const orderedSlides = [heroSlides[activeIndex], heroSlides[nextIndex]];
  const visibleIndex = isMoving ? nextIndex : activeIndex;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIsMoving(true);
      window.setTimeout(() => {
        setActiveIndex((current) => (current + 1) % heroSlides.length);
        setIsMoving(false);
      }, 720);
    }, 4200);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-orange-100 bg-[#fff6ed] shadow-sm">
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
            className="relative h-full w-1/2 shrink-0 overflow-hidden px-8 py-7"
          >
            <div className="relative z-10 flex h-full max-w-4xl flex-col justify-center">
              <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-slate-950 md:text-5xl">
                {slide.title}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                {slide.desc}
              </p>
              <div className="mt-7 flex flex-wrap gap-3 text-sm font-medium text-primary">
                <span className="rounded-full bg-white px-4 py-2 shadow-sm">
                  安全合规
                </span>
                <span className="rounded-full bg-white px-4 py-2 shadow-sm">
                  快速交付
                </span>
                <span className="rounded-full bg-white px-4 py-2 shadow-sm">
                  专业售后
                </span>
              </div>
            </div>

            <HeroVisual type={slide.visual} />
          </div>
        ))}
      </div>

      <div className="absolute bottom-5 left-8 z-20 flex gap-2">
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
      <div className="absolute inset-y-0 right-0 hidden w-[48%] md:block">
        <div className="absolute right-14 top-1/2 w-[390px] -translate-y-1/2 rounded-2xl border border-orange-100 bg-white/85 p-4 shadow-[0_28px_80px_rgba(214,106,44,0.16)] backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <PackageCheck className="h-6 w-6" />
            </span>
            <div>
              <div className="text-lg font-bold text-slate-950">商品交付流程</div>
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
                  <span className="font-semibold text-slate-900">{item.title}</span>
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
    <div className="absolute inset-y-0 right-0 hidden w-[50%] md:block">
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
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  return (
    <PublicLayout contentClassName="mx-auto mt-12 max-w-[1540px] px-4 py-4 md:mt-0 md:h-[calc(100vh-64px)] md:overflow-hidden md:px-5 md:py-3">
      <div className="grid gap-4 md:h-full md:grid-rows-[300px_minmax(0,1fr)_96px]">
        <HeroCarousel />

        <section className="grid min-h-0 gap-4 xl:grid-cols-[1fr_330px]">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-950">商品分类</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  选择类目后进入商品列表
                </p>
              </div>
              <span className="hidden text-sm text-muted-foreground md:block">
                库存和价格以详情页为准
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {categoryCards.map((category) => {
                const Icon = category.icon;
                return (
                  <Link
                    key={category.title}
                    href={category.href}
                    className={cn(
                      "group flex min-h-[92px] items-center gap-4 rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm",
                      category.active
                        ? "border-primary/25 bg-primary/[0.04]"
                        : "border-border bg-white"
                    )}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-semibold text-slate-950">
                        {category.title}
                        <ArrowRight className="h-4 w-4 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                      <span className="mt-1 block truncate text-sm text-muted-foreground">
                        {category.desc}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-950">热门入口</h2>
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-3">
              {hotLinks.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="flex items-center justify-between rounded-xl border border-border bg-slate-50/70 px-4 py-3 font-semibold text-slate-950 transition-colors hover:border-primary/30 hover:bg-white"
                >
                  {item.title}
                  <ArrowRight className="h-4 w-4 text-primary" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-[1fr_330px]">
          <div className="grid gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm md:grid-cols-3">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-950">
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

          <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm leading-6 text-primary shadow-sm">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            本站拒绝任何违法用途，仅提供合法电商拓客服务。
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
