import type { Metadata } from "next";
import Link from "next/link";
import { EyeOff, FileLock2, Lock, Server, ShieldCheck } from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { Card, CardContent } from "@/components/ui/card";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "隐私政策",
  description: "Jianlian Shop 隐私保护政策、数据加密传输、订单信息最小化采集与用户隐私权利说明。",
  path: "/privacy",
});

const sections = [
  {
    icon: FileLock2,
    title: "一、信息最小化收集原则",
    items: [
      "我们仅在完成订单交付与账户安全验证所必需的最小范围内收集信息。",
      "数字商品订单：仅需提供用于接收卡密和订单凭证的联系邮箱，无需提供任何真实身份或住址信息。",
      "实体 SIM 卡物流订单：仅收集用于快递派送的收件人姓名、联系电话及收货地址，相关物流信息仅用于包裹寄递，绝不用于任何营销推广。",
    ],
  },
  {
    icon: Lock,
    title: "二、数据安全与加密存储",
    items: [
      "全站通信均采用高强度 TLS/HTTPS 加密传输，账户密码经过不可逆哈希加盐存储，任何工作人员均无法查看您的明文密码。",
      "支付结算通过正规第三方收银台或区块链智能合约网络（USDT BEP20）完成，本站从不收集、不存储您的银行卡号、支付密码或私钥助记词。",
      "交付给您的独享卡密与账号凭证受严格的行级访问控制（RLS）保护，仅限下单账户本人凭有效会话查阅。",
    ],
  },
  {
    icon: EyeOff,
    title: "三、Cookie 与本地存储说明",
    items: [
      "本站仅使用维持登录会话（Session）、防跨站请求伪造（CSRF）及记住基础界面偏好的必要 Cookie 与本地缓存。",
      "我们不会向任何第三方广告联盟出售、出租或共享您的个人浏览轨迹、邮箱地址或历史订单数据。",
    ],
  },
  {
    icon: Server,
    title: "四、您的隐私权利与数据管理",
    items: [
      "登录后，您可以随时前往「个人中心 → 隐私设置」自助申请导出个人账户数据摘要，或提交账户数据匿名化/注销请求。",
      "售后工单记录默认保留 7 天以便跟进处理，超期后系统将自动清理附件与冗余对话记录，全方位保障您的隐私安全。",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <PublicLayout contentClassName="mx-auto max-w-5xl px-4 py-5 md:px-6 md:py-8">
      <Card className="overflow-hidden rounded-2xl border-orange-100/90 bg-white shadow-sm">
        <div className="border-b border-orange-100 bg-gradient-to-r from-[#fff6ed] via-[#fffaf5] to-white px-6 py-6 sm:px-8 sm:py-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-white px-3 py-1 text-xs font-semibold text-primary shadow-2xs">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>隐私与数据安全 · 最小化收集原则</span>
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            隐私政策与数据安全说明
          </h1>
          <p className="mt-2 text-xs leading-5 text-slate-500 sm:text-sm">
            Jianlian Shop 高度重视您的个人隐私与交易数据安全，严格执行最小化数据采集与端到端访问保护。
          </p>
        </div>

        <CardContent className="space-y-6 p-6 sm:p-8">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <section
                key={section.title}
                className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 sm:p-6"
              >
                <h2 className="flex items-center gap-2.5 text-base font-bold text-slate-900 sm:text-lg">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-100/80 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>{section.title}</span>
                </h2>
                <ul className="mt-3.5 space-y-2.5 text-xs leading-6 text-slate-600 sm:text-sm">
                  {section.items.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-orange-100 bg-orange-50/40 px-5 py-4 text-xs text-slate-600 sm:text-sm">
            <span>已登录用户可前往「个人中心 → 隐私设置」自助管理个人数据导出与注销请求。</span>
            <div className="flex items-center gap-3 font-semibold text-primary">
              <Link href="/terms" className="underline underline-offset-4 hover:opacity-80">
                查看用户服务协议
              </Link>
              <span>·</span>
              <Link href="/account/privacy" className="underline underline-offset-4 hover:opacity-80">
                前往隐私设置
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </PublicLayout>
  );
}
