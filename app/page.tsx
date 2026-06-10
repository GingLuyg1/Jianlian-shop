"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  ClipboardList,
  CreditCard,
  Gift,
  Headphones,
  KeyRound,
  PackageCheck,
  Search,
  ShieldCheck,
  Timer,
  Wallet,
} from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const categories = [
  {
    title: "数字账号服务",
    desc: "Apple ID / Steam / Gmail / Telegram",
    href: "/products/digital-accounts",
    icon: KeyRound,
    active: true,
  },
  {
    title: "AI会员充值",
    desc: "ChatGPT / Claude / Grok / Gemini",
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
    title: "账号充值",
    desc: "平台余额与账号增值服务",
    href: "/products/account-recharge",
    icon: Wallet,
  },
];

const hotProducts = [
  { title: "Apple ID", href: "/products/digital-accounts?category=apple-id" },
  { title: "Steam 账号", href: "/products/digital-accounts?category=steam" },
  { title: "ChatGPT Plus", href: "/checkout?product=ai-gpt-cdk-tr-plus-1m" },
  { title: "Grok Super", href: "/checkout?product=ai-grok-cdk-in-super-1m" },
];

const quickActions = [
  { title: "订单查询", href: "/order-tracking", icon: Search },
  { title: "我的订单", href: "/account/orders", icon: ClipboardList },
];

const serviceItems = [
  { title: "库存提示", desc: "库存为 0 时请先联系客服。", icon: PackageCheck },
  { title: "售后时效", desc: "账号 / 卡密类商品按说明处理售后。", icon: Timer },
  { title: "合规使用", desc: "仅提供合法电商拓客服务。", icon: ShieldCheck },
];

const noticeSlides = [
  {
    eyebrow: "购买前必读",
    title: "先看说明，再提交订单",
    desc: "账号、卡密、充值类商品请仔细核对地区、用途、库存和售后说明，非商品问题售出不退不换。",
    tag: "下单前确认",
    tone: "from-orange-500 to-amber-400",
  },
  {
    eyebrow: "售后提醒",
    title: "发货后24小时内检查",
    desc: "拿到账号第一时间检查账号。售后期内发现商品问题，请及时联系在线客服处理。",
    tag: "24小时内",
    tone: "from-red-500 to-orange-400",
  },
  {
    eyebrow: "合规声明",
    title: "拒绝任何违法用途",
    desc: "本站不提供任何违法教程，不为任何非法行业提供支持，仅提供电商拓客服务。",
    tag: "合规使用",
    tone: "from-slate-800 to-slate-600",
  },
];

const steps = ["选择类目", "阅读说明", "提交订单", "检查交付"];

function NoticeCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % noticeSlides.length);
    }, 3600);

    return () => window.clearInterval(timer);
  }, []);

  const slide = noticeSlides[activeIndex];

  return (
    <Card className="overflow-hidden border-orange-100 bg-white">
      <CardContent className="p-0">
        <div className={cn("relative min-h-[188px] bg-gradient-to-br p-4 text-white", slide.tone)}>
          <div className="absolute right-[-38px] top-[-42px] h-32 w-32 rounded-full bg-white/15" />
          <div className="absolute bottom-[-54px] left-[-34px] h-36 w-36 rounded-full bg-white/10" />
          <div className="relative z-10 flex h-full min-h-[156px] flex-col justify-between">
            <div>
              <div className="inline-flex rounded-full bg-white/18 px-3 py-1 text-xs font-semibold">
                {slide.eyebrow}
              </div>
              <h2 className="mt-3 text-2xl font-bold leading-tight">{slide.title}</h2>
              <p className="mt-2 text-sm leading-6 text-white/90">{slide.desc}</p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-950">
                {slide.tag}
              </span>
              <div className="flex gap-1.5">
                {noticeSlides.map((item, index) => (
                  <button
                    key={item.title}
                    type="button"
                    aria-label={`切换到第 ${index + 1} 张提醒`}
                    onClick={() => setActiveIndex(index)}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      index === activeIndex ? "w-6 bg-white" : "w-2 bg-white/45"
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <PublicLayout contentClassName="p-4 md:p-3 max-w-[1540px] mx-auto mt-12 md:mt-0 md:h-[calc(100vh-62px)] md:overflow-hidden">
      <div className="grid gap-3 md:h-full xl:grid-cols-[1fr_380px]">
        <section className="grid min-w-0 gap-2.5 md:grid-rows-[auto_1fr_auto] md:overflow-hidden">
          <Card className="border-orange-100 bg-[#fff8f3]">
            <CardContent className="p-3.5">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-medium text-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
                Jianlian 数字商品服务
              </div>
              <h1 className="text-2xl font-bold leading-tight text-slate-950 md:text-3xl">
                全球数字商品与通信服务商城
              </h1>
              <p className="mt-1.5 max-w-5xl text-sm leading-6 text-muted-foreground">
                提供数字账号、AI会员充值、礼品卡、国际电话卡等商品。下单前请核对说明，账号和卡密类商品请在售后期内第一时间检查。
              </p>
            </CardContent>
          </Card>

          <div className="grid min-h-0 gap-2.5 2xl:grid-cols-[1fr_310px]">
            <Card className="min-h-0 border-border bg-white">
              <CardContent className="flex h-full flex-col p-3.5">
                <div className="mb-2.5 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">商品分类</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      选择类目后进入二级类目和商品列表
                    </p>
                  </div>
                  <span className="hidden text-xs text-muted-foreground md:inline">
                    库存和价格以商品详情页为准
                  </span>
                </div>

                <div className="grid flex-1 gap-2 lg:grid-cols-2">
                  {categories.map((category) => {
                    const Icon = category.icon;
                    return (
                      <Link
                        key={category.title}
                        href={category.href}
                        className={cn(
                          "group flex min-h-[66px] items-center gap-3 rounded-lg border bg-white p-3 transition-all hover:border-primary/30 hover:shadow-sm",
                          category.active
                            ? "border-primary/25 bg-primary/5"
                            : "border-border"
                        )}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-semibold text-slate-950">
                            {category.title}
                            <ArrowRight className="h-4 w-4 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                          </div>
                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {category.desc}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-white">
              <CardContent className="p-3.5">
                <h2 className="mb-2.5 text-base font-semibold text-slate-950">
                  热门商品入口
                </h2>
                <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
                  {hotProducts.map((product) => (
                    <Link
                      key={product.title}
                      href={product.href}
                      className="flex items-center justify-between rounded-lg border border-border bg-slate-50/70 px-3 py-2 text-sm font-semibold text-slate-950 transition-colors hover:border-primary/30 hover:bg-white"
                    >
                      {product.title}
                      <ArrowRight className="h-4 w-4 text-primary" />
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-white">
            <CardContent className="p-3.5">
              <div className="grid gap-2 md:grid-cols-4">
                {steps.map((step, index) => (
                  <div
                    key={step}
                    className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-slate-950">{step}</div>
                      <div className="text-xs text-muted-foreground">有疑问先联系客服</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <aside className="grid gap-2.5 md:h-full md:grid-rows-[auto_auto_1fr_auto] md:overflow-hidden">
          <NoticeCarousel />

          <Card className="border-border bg-white">
            <CardContent className="p-4">
              <h2 className="mb-2 text-base font-semibold text-slate-950">
                快捷操作
              </h2>
              <div className="space-y-2">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.title}
                      href={action.href}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/30 hover:bg-primary/5"
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-primary" />
                        {action.title}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  );
                })}
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-left text-sm font-medium transition-colors hover:border-primary/30 hover:bg-primary/5"
                  {...({ popovertarget: "support-popover" } as Record<string, string>)}
                >
                  <span className="flex items-center gap-3">
                    <Headphones className="h-4 w-4 text-primary" />
                    联系客服
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 border-border bg-white">
            <CardContent className="flex h-full flex-col p-4">
              <h2 className="mb-2 text-base font-semibold text-slate-950">
                服务说明
              </h2>
              <div className="grid flex-1 gap-2">
                {serviceItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="flex gap-3 rounded-lg bg-slate-50 p-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <div className="text-sm font-semibold text-slate-950">
                          {item.title}
                        </div>
                        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
                          {item.desc}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-orange-100 bg-orange-50">
            <CardContent className="p-4 text-sm leading-6 text-primary">
              如需补货或批量购买，请先联系在线客服确认库存。下单后请按商品说明检查交付内容。
            </CardContent>
          </Card>
        </aside>
      </div>
    </PublicLayout>
  );
}
