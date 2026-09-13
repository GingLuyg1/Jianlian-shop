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
        question: "下单前需要确认哪些信息？",
        answer:
          "确认商品名称、地区、规格、库存、售价、交付方式以及商品详情说明。不同地区或规格的商品可能存在使用限制。",
      },
      {
        question: "库存为 0 怎么办？",
        answer:
          "库存为 0 时请先联系在线客服确认补货时间。批量购买也建议先确认库存和交付能力。",
      },
      {
        question: "页面价格和库存以哪里为准？",
        answer: "商品价格与库存以商品详情页和提交订单时展示的数据为准。",
      },
      {
        question: "不确定商品是否适用怎么办？",
        answer:
          "不要直接下单。先将商品名称及使用需求告知在线客服确认。",
      },
    ],
  },
  {
    title: "订单与交付",
    icon: PackageCheck,
    items: [
      {
        question: "接收邮箱为什么要填写正确？",
        answer:
          "邮箱可能用于订单通知、交付信息或售后核验，请填写可以正常接收邮件的地址。",
      },
      {
        question: "订单在哪里查看？",
        answer:
          "登录后进入“我的订单”查看订单状态和交付结果。",
      },
      {
        question: "商品多久交付？",
        answer:
          "自动商品通常在付款确认后自动处理；人工处理商品的时间以商品详情说明为准。",
      },
      {
        question: "订单一直处理中怎么办？",
        answer: "先刷新订单状态。超过商品说明中的正常处理时间后，携带订单号联系在线客服。",
      },
    ],
  },
  {
    title: "售后与核验",
    icon: ShieldCheck,
    items: [
      {
        question: "售后时效是多久？",
        answer:
          "不同商品可能不同，以商品详情页标注的售后范围和时效为准。",
      },
      {
        question: "哪些情况可能不属于商品问题？",
        answer:
          "错误购买地区或规格、超出商品说明范围的使用，以及用户自行操作导致的问题，需要按照具体商品规则判断。",
      },
      {
        question: "收到商品后应该做什么？",
        answer:
          "尽快核对账号、卡密、充值结果或其它交付内容，并确认是否与订单一致。",
      },
      {
        question: "出现问题需要提供什么？",
        answer: "提供订单号和能够说明问题的必要截图或信息。不要通过公开渠道发送密码、验证码或其它敏感凭据。",
      },
    ],
  },
  {
    title: "合规与安全",
    icon: ShieldCheck,
    items: [
      { question: "网站是否提供违规用途教程？", answer: "不提供。本站仅提供合法合规的数字商品及相关服务，拒绝任何违法用途。" },
      { question: "账号或卡密收到后需要注意什么？", answer: "及时检查交付内容，并按照商品说明完成必要的安全设置。不要向无关第三方泄露账号、卡密或验证码。" },
    ],
  },
];

const keyPoints = [
  { title: "商品详情优先", text: "具体规格、交付和售后以商品详情为准", icon: HelpCircle },
  { title: "联系方式准确", text: "接收邮箱等订单信息请确认填写正确", icon: MailCheck },
  { title: "及时核验", text: "收到交付内容后尽快检查", icon: Clock3 },
  { title: "合规使用", text: "本站拒绝任何违法用途", icon: ShieldCheck },
];

export default function FAQPage() {
  return (
    <PublicLayout contentClassName="h-[calc(100dvh-87px)] max-w-none overflow-y-auto px-4 py-3 md:px-6">
      <div className="mx-auto grid h-full max-w-[1500px] gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <Card className="overflow-hidden border-orange-100 bg-orange-50">
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

          <div className="grid gap-5 lg:grid-cols-2">
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
                本站仅提供合法合规的数字商品及相关服务，拒绝任何违法用途。
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </PublicLayout>
  );
}
