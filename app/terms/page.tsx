import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, FileText, PackageCheck, ShieldAlert, ShieldCheck } from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { publicMainPanelHeightClassName } from "@/components/layout/public-content";
import { Card, CardContent } from "@/components/ui/card";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "用户服务协议与退款政策",
  description: "Jianlian Shop 用户服务协议、数字商品自动交付规则、售后质保与退款政策说明。",
  path: "/terms",
});

const sections = [
  {
    icon: ShieldCheck,
    title: "一、总则与合法合规使用声明",
    items: [
      "欢迎使用 Jianlian Shop（以下简称“本站”）。您在注册账号、充值余额或提交订单前，请仔细阅读并确认同意本协议全部条款。",
      "本站提供的所有数字账号、AI 会员充值、礼品卡及国际 SIM 卡商品，仅限用于合法正当的技术研究、跨境业务、学术科研及个人合规通信用途。",
      "严禁使用本站任何商品从事电信网络诈骗、洗钱、恶意群发、黑客攻击或其他违反所在国家/地区法律法规的活动。一经发现违规用途，本站有权立即终止服务并冻结相关账户。",
    ],
  },
  {
    icon: PackageCheck,
    title: "二、数字商品与实体 SIM 卡交付规则",
    items: [
      "自动发货商品（卡密/成品号/充值码）：订单支付成功后，系统将实时自动分配卡密或账号信息至您的「我的订单」页面及下单填写的接收邮箱。",
      "人工处理 / 代充商品：支付成功后将按订单队列由客服或自动化系统处理，具体处理时效以商品详情页标注为准。",
      "国际实体 SIM 卡（物流发货）：下单时请务必填写真实准确的收件人姓名、联系电话及详细收货地址。默认下单后 24 小时内安排打包发货，物流单号将同步至订单详情页与接收邮箱。",
    ],
  },
  {
    icon: ShieldAlert,
    title: "三、售后质保与退款政策",
    items: [
      "数字商品特殊性说明：数字账号、一次性激活码、充值卡密（CDK/PIN）等商品具有可复制性与即时兑付属性，一经售出并发货，非商品本身质量问题（如买错规格、个人网络环境不支持、不看说明误操作等）概不支持无理由退换。",
      "首登质保承诺：凡商品详情页标注有「首登质保 / 24 小时包换 / 30 天质保」的商品，在质保期内如遇初始密码错误、卡密无效或交付前已失效等问题，请保留完整截图并通过「工单中心」或「在线客服」联系我们，核实后将为您免费换新或按规则退赔至账户余额。",
      "物理 SIM 卡售后：实体 SIM 卡发货前均经过严格检验。卡片一经拆封、插卡激活或人为损坏后不支持无理由退货；如遇物流丢件或卡片物理损坏无法读卡，请联系客服免费补发。",
    ],
  },
  {
    icon: CheckCircle2,
    title: "四、账户安全与买家须知",
    items: [
      "收到独享账号（如 Apple ID、ChatGPT、社交账号等）并核验正常后，请按照本站《使用教程》及时修改登录密码、辅助邮箱或 2FA 双重验证密钥，确保账号归属安全。",
      "因买家使用受污染的公共代理节点、同浏览器多账号混登触发官方风控、或违反第三方平台服务条款导致的封号，不属于商品质量问题。",
      "如对订单有任何疑问，您可随时在「工单中心」提交售后工单或联系 24 小时在线客服获取协助。",
    ],
  },
];

export default function TermsPage() {
  return (
    <PublicLayout contentClassName="w-full max-w-none px-4 py-3 md:px-6">
      <div className={`mx-auto flex w-full max-w-[1640px] flex-col overflow-visible md:min-h-0 md:overflow-hidden ${publicMainPanelHeightClassName}`}>
        <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border-orange-100/90 bg-white shadow-sm">
          <div className="shrink-0 border-b border-orange-100 bg-gradient-to-r from-[#fff6ed] via-[#fffaf5] to-white px-6 py-4 sm:px-8 sm:py-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-white px-3 py-1 text-xs font-semibold text-primary shadow-2xs">
              <FileText className="h-3.5 w-3.5" />
              <span>官方服务条款 · 交易与售后保障</span>
            </div>
            <h1 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
              用户服务协议与退款政策
            </h1>
            <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">
              适用范围：Jianlian Shop 全站数字商品、AI 会员服务、礼品卡与国际 SIM 卡订单。
            </p>
          </div>

          <CardContent className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6 sidebar-scroll sm:p-8">
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
              <span>您还可以查阅我们的《隐私政策》了解个人数据与订单隐私保护措施。</span>
              <div className="flex items-center gap-3 font-semibold text-primary">
                <Link href="/privacy" className="underline underline-offset-4 hover:opacity-80">
                  查看隐私政策
                </Link>
                <span>·</span>
                <Link href="/" className="underline underline-offset-4 hover:opacity-80">
                  返回商城首页
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
