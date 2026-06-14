"use client";

import {
  AlertTriangle,
  Clock3,
  HelpCircle,
  MailCheck,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import PublicLayout from "@/components/layout/PublicLayout";

const faqGroups = [
  {
    title: "购买前",
    icon: HelpCircle,
    items: [
      {
        question: "下单前需要注意什么？",
        answer:
          "请先看清商品名称、地区、库存、价格、交付方式和商品说明。账号、卡密、充值类商品通常不支持无理由退换。",
      },
      {
        question: "库存为 0 还能购买吗？",
        answer:
          "库存为 0 时请不要直接下单。需要补货或批量购买时，请先联系在线客服确认库存和交付时间。",
      },
      {
        question: "不确定商品是否适合怎么办？",
        answer:
          "请先联系客服说明你的使用场景，让客服帮你确认商品类型。确认后再下单，可以减少买错规格的情况。",
      },
    ],
  },
  {
    title: "交付与查询",
    icon: PackageCheck,
    items: [
      {
        question: "数字商品如何交付？",
        answer:
          "账号、卡密或充值结果会按商品说明交付。请填写正确的接收邮箱，并在订单提交后留意订单状态。",
      },
      {
        question: "如何查询订单？",
        answer:
          "进入左侧菜单“我的订单”，可查看订单记录，也可以在页面右侧输入订单号快速查询。",
      },
      {
        question: "多久可以处理完成？",
        answer:
          "不同商品处理时间不同，具体以商品详情页说明为准。部分商品需要人工处理，可能会有排队时间。",
      },
    ],
  },
  {
    title: "售后规则",
    icon: ShieldCheck,
    items: [
      {
        question: "售后期是多久？",
        answer:
          "如无单独标注，售后期通常为商品发货后 24 小时内。收到账号或卡密后，请第一时间检查。",
      },
      {
        question: "什么情况不支持退换？",
        answer:
          "非商品问题、买错规格、未按说明操作、超出售后期、账号共享或违规使用导致的问题，通常不支持退换。",
      },
      {
        question: "网站是否提供教程？",
        answer:
          "本站不提供任何违法用途教程，不为任何非法行业提供支持。仅提供商品登录、核验等必要说明。",
      },
    ],
  },
];

const keyPoints = [
  { title: "24 小时内检查", text: "拿到账号或卡密后第一时间核验。", icon: Clock3 },
  { title: "邮箱填写正确", text: "卡密类商品请填写可接收的邮箱。", icon: MailCheck },
  { title: "合规使用", text: "仅限合法电商拓客服务场景。", icon: ShieldCheck },
];

export default function FAQPage() {
  return (
    <PublicLayout contentClassName="h-[calc(100dvh-87px)] max-w-none overflow-hidden px-4 py-3 md:px-6">
      <div className="mx-auto grid h-full max-w-[1500px] gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <Card className="overflow-hidden border-orange-100 bg-gradient-to-br from-orange-50 via-white to-white">
            <CardContent className="p-6 md:p-8">
              <div className="inline-flex rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-primary">
                常见问题
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
                购买、交付、售后问题集中说明
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                如果商品详情页和本页说明不一致，请以商品详情页为准。不确定时先联系在线客服确认。
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-3">
            {faqGroups.map((group) => {
              const Icon = group.icon;
              return (
                <Card key={group.title} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="border-b border-orange-100 bg-orange-50/60 p-5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary shadow-sm">
                          <Icon className="h-5 w-5" />
                        </span>
                        <h2 className="text-lg font-bold text-slate-950">
                          {group.title}
                        </h2>
                      </div>
                    </div>
                    <Accordion type="single" collapsible className="px-5">
                      {group.items.map((item, index) => (
                        <AccordionItem
                          key={item.question}
                          value={`${group.title}-${index}`}
                          className="border-orange-100"
                        >
                          <AccordionTrigger className="text-left text-sm font-semibold">
                            {item.question}
                          </AccordionTrigger>
                          <AccordionContent className="text-sm leading-7 text-muted-foreground">
                            {item.answer}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <aside className="space-y-5">
          <Card className="border-orange-100">
            <CardContent className="p-5">
              <h2 className="text-lg font-bold text-slate-950">重点提醒</h2>
              <div className="mt-4 space-y-3">
                {keyPoints.map((point) => {
                  const Icon = point.icon;
                  return (
                    <div
                      key={point.title}
                      className="flex gap-3 rounded-xl bg-slate-50 p-4"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="font-bold text-slate-950">
                          {point.title}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {point.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-100 bg-red-50/70">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                <h2 className="text-lg font-bold">合规声明</h2>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-700">
                本站产品拒绝任何违法行为，不提供任何违法用途教程，不为任何非法行业提供任何支持。
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </PublicLayout>
  );
}
