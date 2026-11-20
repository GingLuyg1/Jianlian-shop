"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Globe,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Truck,
} from "lucide-react";

interface OneNzProductDetailsProps {
  product: {
    id?: string;
    slug?: string | null;
    name: string;
    [key: string]: any;
  };
}

export default function OneNzProductDetails({ product }: OneNzProductDetailsProps) {
  const highlights = [
    {
      icon: Smartphone,
      title: "0 月租 · 零持有成本",
      text: "不打电话、不发短信即完全 0 月租，平时持有无需缴纳任何日常费用。",
    },
    {
      icon: CheckCircle2,
      title: "国内免费接收短信",
      text: "国内接入中国移动/联通 5G/4G 漫游，接收海内外平台验证码完全免费。",
    },
    {
      icon: Globe,
      title: "海外高权重原生号",
      text: "021 开头真实海外手机号（非 VoIP），秒过 OpenAI、Claude、TikTok、TG 等各大平台风控。",
    },
    {
      icon: ShieldCheck,
      title: "无需实名认证",
      text: "海外实体预付费 SIM 卡，保护个人隐私安全，收到即可插卡使用。",
    },
    {
      icon: Truck,
      title: "默认包邮（如需加急联系客服）",
      text: "国内现货默认包邮直达，妥善包装防静电防折弯保护芯片安全，如需顺丰加急请联系客服。",
    },
    {
      icon: Clock3,
      title: "每年 10 NZD 轻松保号",
      text: "新卡一年有效期，后续每年充值 10 纽币自动顺延 360 天，余额留存永久有效。",
    },
  ];

  const rules = [
    ["商品规格", "One NZ 新西兰预付费实体三合一 SIM 卡（支持标准大卡、Micro、Nano 卡槽）"],
    ["交付方式", "默认包邮发货（如需加急联系客服；下单后请正确填写收货人、联系电话及详细收件地址）"],
    ["漫游网络", "国内自动漫游接入中国移动或中国联通 5G / 4G 信号"],
    ["号码格式", "新西兰本土手机号码段（+64 21 xxx xxxx）"],
    ["保号规则", "新卡含 360 天有效期；后续每年充值 10 纽币可顺延 360 天（支持本站客服代充秒到账）"],
    ["售后说明", "物理 SIM 卡一经拆封插卡激活后不支持无理由退换，发货前均经严格质检验真"],
  ];

  const steps = [
    ["第一步：下单收件", "提交订单并填写准确的收件信息，等待快递包邮送达（如需加急请联系在线客服）。"],
    ["第二步：关闭数据漫游", "【极度重要】插卡前务必在手机设置中确认【关闭数据漫游】，避免后台流量偷跑产生高额漫游费。"],
    ["第三步：插卡选网", "取出 Nano SIM 卡插入全网通手机卡槽，等待接入中国移动或中国联通信号。"],
    ["第四步：获取本机号码", "新建短信发送内容「mytype」至号码「521」，系统将在数秒内免费回复您的本机号码。"],
    ["第五步：注册绑定 App", "下载官方 App 或访问官网绑定号码，随时查询余额、流量及号码有效期。"],
  ];

  return (
    <div className="mt-8 w-full space-y-5">
      {/* Hero Section */}
      <section className="overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm">
        <div className="relative bg-gradient-to-br from-orange-500 via-orange-600 to-amber-700 px-6 py-8 text-white">
          <div className="inline-flex rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold">
            One NZ | 新西兰原生 SIM 卡 (物理卡)
          </div>
          <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl text-white">
            {product.name}
          </h2>
          <p className="mt-2 text-sm font-semibold text-orange-50 sm:text-base">
            0 月租 · 免费收短信 · 移动/联通 5G 漫游 · 免实名认证 · 默认包邮（如需加急联系客服）
          </p>
          <p className="mt-4 max-w-3xl text-xs leading-6 text-orange-50/90 sm:text-sm sm:leading-7">
            新西兰第一大运营商（前身 Vodafone NZ）原生实体手机卡，真实三大运营商移动号码段（021 开头）。
            接入国内移动/联通优质 5G 漫游，接收全球各类应用及银行验证码完全免费。每年充值 10 纽币即可顺延 360 天有效期。
          </p>
        </div>

        {/* Highlights */}
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 bg-orange-50/20">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-xl border border-orange-100 bg-white p-4 text-center shadow-sm"
              >
                <Icon className="mx-auto h-7 w-7 text-orange-700" />
                <div className="mt-2 text-sm font-semibold text-slate-950">
                  {item.title}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {item.text}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Critical Warnings Notice */}
      <section className="rounded-2xl border border-red-200 bg-red-50/70 p-5 text-slate-800 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="space-y-2 text-xs leading-5 sm:text-sm sm:leading-6">
            <div className="text-sm font-bold text-red-800 sm:text-base">
              新手插卡必看：两大防扣费重要提醒！
            </div>
            <p>
              <strong>1. 严禁开启手机「数据漫游」：</strong>国际数据漫游费用昂贵（约 11.5 NZD/MB），手机后台即使推送几 KB 流量也可能触发扣费。在国内接收短信完全不需要开数据，请务必在手机设置中关闭数据漫游！
            </p>
            <p>
              <strong>2. iPhone 提示激活 iMessage / FaceTime 务必点击【取消】：</strong>插卡后若 iOS 弹出激活收费提示，请果断点击取消。点取消完全不影响接收短信，若点确认激活则会向海外苹果服务器发送扣费国际短信。
            </p>
          </div>
        </div>
      </section>

      {/* Product Specs & Rules */}
      <section className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
          <ShieldCheck className="h-5 w-5 text-orange-700" />
          商品说明与交付规格
        </h3>
        <div className="mt-4 space-y-3">
          {rules.map(([label, text]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-orange-100 bg-orange-50/30 px-4 py-3 text-xs leading-5 sm:text-sm sm:leading-6"
            >
              <span className="font-semibold text-slate-950">{label}：</span>
              <span className="text-slate-600">{text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Setup Steps */}
      <section className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
          <CheckCircle2 className="h-5 w-5 text-orange-700" />
          激活与使用流程
        </h3>
        <div className="mt-4 space-y-3">
          {steps.map(([title, text]) => (
            <div
              key={String(title)}
              className="rounded-xl border border-orange-100 bg-orange-50/30 px-4 py-3"
            >
              <div className="text-sm font-semibold text-slate-950">
                {title}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Link to Full Graphic Tutorial */}
      <div className="flex flex-col gap-3 rounded-2xl border border-orange-200/90 bg-gradient-to-r from-orange-50 via-white to-orange-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-bold text-slate-950 sm:text-base">需要更详尽的插卡激活、App 绑定与资费保号指南？</div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            本站为您整理了全套高清步骤截图与排错技巧，支持一步一步对照操作。
          </p>
        </div>
        <Link
          href="/tutorials?topic=one-nz"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#df7334] px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#d7672a] sm:text-sm"
        >
          <span>查看完整图文教程</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
