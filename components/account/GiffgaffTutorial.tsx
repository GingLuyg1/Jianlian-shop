import { ArrowUpRight, Signal, WifiOff, ShieldCheck, Clock3 } from "lucide-react";
import glass from "@/components/account/AccountGlass.module.css";

const helper = "https://gg.zote.eu.org/";
const activity = "https://help.giffgaff.com/en/articles/242797-understanding-why-your-number-has-been-deactivated";
const roaming = "https://www.giffgaff.com/roaming/china";

export default function GiffgaffTutorial() {
  return <article className="min-w-0 space-y-6 text-sm leading-7 text-slate-600" aria-label="Giffgaff 保号助手教程">
    <section className={`${glass.inset} rounded-2xl p-5 sm:p-6`}>
      <span className="inline-flex items-center gap-2 text-xs font-medium text-[#ac5624]"><Signal className="h-4 w-4" aria-hidden="true" />少量移动数据 · 手动使用</span>
      <p className="mt-3">通过 Giffgaff SIM 的移动数据进行一次真实联网，是维持号码活跃的方式之一。保号助手提供小流量下载；它不是运营商官方服务，也不能读取或确认你的号码活跃状态。</p>
      <a href={helper} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2 font-medium text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
        打开 Giffgaff 保号助手<ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </a>
      <p className="mt-3 text-xs text-slate-500">点击后在新窗口访问第三方网页；本教程不会自动下载或消耗你的移动数据。</p>
    </section>

    <section aria-labelledby="giffgaff-steps"><h2 id="giffgaff-steps" className="text-base font-semibold text-slate-900">按顺序操作</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          ["01", "先核对卡片与资费", "确认 SIM 已激活、有可用余额，所在地区支持漫游。先在 Wi-Fi 下阅读本教程及当地资费。"],
          ["02", "只开启这张卡的数据", "关闭 Wi-Fi，双卡手机选择 Giffgaff 为移动数据卡，关闭自动切换；在境外按需要开启数据漫游。暂停后台刷新、同步及系统更新。"],
          ["03", "手动执行一次", "打开助手，核对提示后只点击一次“开始保号”，等待下载完成。不要因为余额暂未更新就连续重试。"],
          ["04", "关闭数据并核对记录", "完成后立即关闭移动数据，再通过官方 App、账户或可用时拨打 *100# 核对余额。保存日期，并留意运营商的停用提醒邮件。"],
        ].map(([index, title, text]) => <li key={index} className={`${glass.inset} min-w-0 rounded-2xl p-4`}><span className="text-xs tabular-nums text-[#b18c63]">{index}</span><h3 className="mt-1 font-semibold text-slate-800">{title}</h3><p className="mt-2">{text}</p></li>)}
      </ol>
    </section>

    <section className={`${glass.inset} rounded-2xl p-5 sm:p-6`} aria-labelledby="giffgaff-cost"><h2 id="giffgaff-cost" className="text-base font-semibold text-slate-900">流量与成本怎么计算</h2>
      <dl className="mt-4 space-y-3">
        <div><dt className="font-medium text-slate-800">工具标称下载量</dt><dd>约 120 KiB（122,880 字节），来自工具介绍，未独立测量。首次打开网页、加密连接及后台应用还可能产生额外流量，不能把下载文件大小当作运营商计费量。</dd></div>
        <div><dt className="font-medium text-slate-800">中国漫游的参考例子</dt><dd>2026-11-07 官方网页标示按量数据为 £0.20/MB。若按十进制 MB 估算，122,880 ÷ 1,000,000 × £0.20 ≈ £0.0246（2.46 便士），尚未计入额外流量和运营商计费取整；不是每次固定扣费承诺。</dd></div>
        <div><dt className="font-medium text-slate-800">实际费用</dt><dd>以所在国家、套餐、当前官方资费和实际账单为准；人民币还受汇率影响。不固定承诺每次 ¥0.2、年度 ¥5–10 或省费百分比。</dd></div>
      </dl>
      <a className="mt-4 inline-flex items-center gap-1 text-primary underline underline-offset-4" href={roaming} target="_blank" rel="noopener noreferrer">核对所在地区官方漫游资费<ArrowUpRight className="h-3 w-3" aria-hidden="true" /></a>
    </section>

    <section className="grid gap-3 sm:grid-cols-2">
      <div className={`${glass.inset} rounded-2xl p-5`}><h2 className="flex items-center gap-2 font-semibold text-slate-900"><Clock3 className="h-4 w-4" aria-hidden="true" />多久使用一次</h2><p className="mt-3">官方要求至少每 6 个月发生一次符合条件的使用，例如移动数据联网、非免费通话/短信，或充值/购买套餐。可自行设定提前提醒，避免拖到最后一天；不需要为了保号每月反复消耗流量。</p><p className="mt-2">长期境外使用还受适用条款和公平使用规则约束，小额联网不能豁免其他限制。</p></div>
      <div className={`${glass.inset} rounded-2xl p-5`}><h2 className="flex items-center gap-2 font-semibold text-slate-900"><WifiOff className="h-4 w-4" aria-hidden="true" />网页完成不等于保号确认</h2><p className="mt-3">Wi-Fi 可以测试网页，但不算该 SIM 的移动数据使用。网页显示“保号成功”只代表它的下载流程结束；还应核对实际使用记录，必要时联系 Giffgaff。余额未即时变化时先查明原因，不盲目重复点击。</p></div>
    </section>

    <section className="rounded-2xl border border-orange-200/70 bg-orange-50/40 p-5"><h2 className="flex items-center gap-2 font-semibold text-[#b96532]"><ShieldCheck className="h-4 w-4" aria-hidden="true" />使用前注意</h2><p className="mt-3">手机的部分系统服务可能继续联网，无法保证整台设备只用 120 KiB。第三方工具的开源、缓存策略及隐私实现未独立审计，不宣称“零收集”或“不连接第三方服务器”；不要向工具输入账号密码、验证码或卡密。</p></section>
    <footer className="border-t border-orange-100 pt-4 text-xs text-slate-500">规则核对日期：2026-11-07。<a className="ml-2 text-primary underline underline-offset-4" href={activity} target="_blank" rel="noopener noreferrer">Giffgaff 官方号码活跃说明</a>；<a className="ml-1 text-primary underline underline-offset-4" href="https://www.giffgaff.com/index.php/terms" target="_blank" rel="noopener noreferrer">适用条款</a>。</footer>
  </article>;
}
