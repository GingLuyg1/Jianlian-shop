import Link from "next/link";
import { ArrowUpRight, CircleAlert } from "lucide-react";
import glass from "./AccountGlass.module.css";
import TutorialImage from "./TutorialImage";

const download = "https://www.binance.com/zh-TC/download";
const registerGuide = "https://www.binance.com/zh-CN/support/faq/detail/360042718372";
const guides = [
  { title: "币安入门指南", href: "https://www.binance.com/zh-CN/support/faq/detail/c780097f75dd450a82d17f1e84153276" },
  { title: "币安 App 注册账户教程", href: registerGuide },
  { title: "购买 USDT 教程", href: "https://www.binance.com/zh-CN/support/faq/detail/360039384951" },
];

const transferSteps = [
  { title: "打开提现入口", text: "在币安 App 的「支付」页点「提现」，选择「提现资产」。如界面不同，可在资产页寻找转出入口。" },
  { title: "选择 USDT，粘贴收款地址", text: "在 Jianlian 创建 USDT BEP20 充值单，从待支付页面复制本单的收款地址。回到币安选择 USDT 并粘贴地址。" },
  { title: "确认网络为 BSC（BEP20）", text: "核对币安所选网络与 Jianlian 充值单一致。确认币种、网络和收款地址后，再进入下一步。" },
  { title: "核对扣费后的到账数量", text: "输入提现金额，查看网络手续费与最低提现额。确认扣费后的「到账数量」等于充值单显示的精确应付 USDT 金额，再提交提现。" },
];

const transferImage = "/assets/binance-usdt-transfer-guide.jpg";

function ExternalLink({ href, children }: { href: string; children: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-xl border border-orange-100 bg-white/80 px-4 py-3 text-sm font-medium text-primary hover:bg-orange-50">
    {children}<ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
  </a>;
}

export default function BinanceTutorial() {
  return <div className="space-y-6">
    <section aria-labelledby="binance-start" className={`${glass.inset} rounded-2xl p-5 sm:p-6`}>
      <h2 id="binance-start" className="text-lg font-semibold">下载与注册</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ExternalLink href={download}>安卓客户端下载</ExternalLink>
        <ExternalLink href="https://apps.apple.com/app/id1436799971">iPhone · App Store</ExternalLink>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">iPhone 版是否可下载取决于 Apple 账户所在商店地区。若链接不可用，请从币安下载页查看 iOS 下载指南。</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50/60 p-4">
        <div><p className="text-sm font-medium">邀请码 <strong className="ml-2 font-mono text-primary">JIANLIAN</strong></p><p className="mt-1 text-xs leading-5 text-slate-600">通过邀请码注册涉及返佣，是否绑定及适用规则以币安注册页显示为准。</p></div>
        <ExternalLink href={registerGuide}>查看官方注册步骤</ExternalLink>
      </div>
    </section>

    <section aria-labelledby="binance-guides" className={`${glass.inset} rounded-2xl p-5 sm:p-6`}>
      <h2 id="binance-guides" className="text-lg font-semibold">币安官方教程</h2>
      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        {guides.map(({ title, href }) => <ExternalLink key={href} href={href}>{title}</ExternalLink>)}
      </div>
    </section>

    <section aria-labelledby="binance-transfer">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="binance-transfer" className="text-lg font-semibold">从币安转账至 Jianlian</h2><p className="mt-1 text-sm text-slate-600">先创建充值单，再按下方步骤核对地址、网络与到账数量。</p></div>
        <Link href="/products/account-recharge" className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-primary">前往账户充值</Link>
      </div>
      <ol className="grid gap-4 xl:grid-cols-2">
        {transferSteps.map((step, index) => <li key={step.title} className={`${glass.inset} rounded-2xl p-5`}>
          <div className="flex items-center gap-3"><span className={`${glass.icon} h-9 w-9 text-sm font-semibold`}>{index + 1}</span><h3 className="font-semibold">{step.title}</h3></div>
          <p className="mt-3 text-sm leading-7 text-slate-600">{step.text}</p>
        </li>)}
      </ol>
      <div className="mt-4 flex gap-3 rounded-xl border border-orange-200 bg-orange-50/70 p-4 text-sm leading-6 text-slate-700">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <p>网络手续费与最低提现额以币安当时显示为准。请在充值单有效期内完成付款。已发起提现但未到账时，先查看该笔提现状态，避免重复转账。</p>
      </div>
      <div className="mt-5 space-y-2">
        <p className="text-xs leading-5 text-slate-600">图中的手续费、最低提现额和预计时间为截图示例。点击图片可放大查看。</p>
        <TutorialImage src={transferImage} caption="币安 App 支付与转账图解" width={1920} height={4054} previewClassName="mx-auto h-auto w-full max-w-[840px]" />
      </div>
      <div className="mt-4"><ExternalLink href="https://www.binance.com/zh-CN/support/faq/detail/85a1c394ac1d489fb0bfac0ef2fceafd">查看币安官方提现指南</ExternalLink></div>
    </section>

    <section className={`${glass.inset} flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5`}>
      <div><h2 className="font-semibold">到账后选购商品</h2><p className="mt-1 text-sm leading-6 text-slate-600">确认 Jianlian 充值记录显示到账后，返回商城选择需要购买的商品。</p></div>
      <Link href="/" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white">返回 Jianlian 商城</Link>
    </section>
  </div>;
}
