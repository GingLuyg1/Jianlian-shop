"use client";

import {
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Headphones,
  PackageCheck,
  Search,
  ShieldCheck,
} from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Card, CardContent } from "@/components/ui/card";

const steps = [
  {
    title: "选择商品",
    text: "通过左侧分类进入对应商品列表，确认商品名称、地区、规格、库存和售价。",
    icon: Search,
  },
  {
    title: "核对详情",
    text: "重点查看商品说明、交付方式、所需信息和售后时效。商品详情页的具体说明优先于通用教程。",
    icon: ClipboardCheck,
  },
  {
    title: "填写并提交",
    text: "正确填写接收邮箱及必要的订单信息。提交前再次确认商品与联系方式无误。",
    icon: CreditCard,
  },
  {
    title: "交付后核验",
    text: "收到账号、卡密或充值结果后尽快检查。如发现商品问题，请保留订单信息并在商品标注的售后时效内联系客服。",
    icon: PackageCheck,
  },
];

const notices = [
  "库存与批量购买：库存为 0 或需要批量购买时，先联系在线客服确认库存、价格和交付时间。",
  "交付方式：不同商品可能为自动发货、自动处理或人工处理，实际交付方式以商品详情页为准。",
  "售后时效：数字商品交付后请及时核验。具体售后范围与时效以商品详情和适用规则为准。",
];

const serviceRules = [
  { title: "购买前核对", text: "地区、规格、库存和交付说明", icon: ShieldCheck },
  { title: "按说明交付", text: "自动或人工处理，以商品详情为准", icon: Headphones },
  { title: "交付后核验", text: "收到账号、卡密或充值结果后及时检查", icon: CheckCircle2 },
];

export default function TutorialsPage() {
  return (
    <PublicLayout contentClassName="h-[calc(100dvh-87px)] max-w-none overflow-y-auto px-4 py-3 md:px-6">
      <div className="mx-auto grid h-full max-w-[1500px] gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <Card className="overflow-hidden border-orange-100 bg-orange-50">
            <CardContent className="p-6 md:p-8">
              <div className="inline-flex rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-primary">
                Jianlian 使用教程
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
                购买与交付指南
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                下单前核对商品信息，交付后及时完成核验。不同商品的地区、规格、交付方式和售后规则可能不同，请始终以商品详情页展示内容为准。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 md:p-6">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-950">购买流程</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    按顺序完成核对和提交，减少买错或信息填错。
                  </p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.title}
                      className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {index + 1}
                        </span>
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="mt-4 text-base font-bold text-slate-950">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {step.text}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 p-5 md:grid-cols-3 md:p-6">
              {serviceRules.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="font-bold text-slate-950">{item.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-5">
          <Card className="border-orange-100">
            <CardContent className="p-5">
              <h2 className="text-lg font-bold text-slate-950">下单提醒</h2>
              <div className="mt-4 space-y-3">
                {notices.map((notice, index) => (
                  <div
                    key={notice}
                    className="flex gap-3 rounded-xl bg-orange-50/70 p-3 text-sm leading-6 text-slate-700"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-primary">
                      {index + 1}
                    </span>
                    <span>{notice}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary text-white">
            <CardContent className="p-5">
              <h2 className="text-lg font-bold">需要补货、批量购买或不确定商品是否适用？</h2>
              <p className="mt-3 text-sm leading-7 text-white/90">
                先联系在线客服确认后再下单。
              </p>
              <button
                type="button"
                className="mt-5 rounded-full bg-white px-5 py-2 text-sm font-semibold text-primary"
                {...({ popovertarget: "support-popover" } as Record<string, string>)}
              >
                联系在线客服
              </button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </PublicLayout>
  );
}
