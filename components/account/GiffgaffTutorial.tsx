import { ArrowUpRight, Clock3, ShieldCheck, Signal, WifiOff } from "lucide-react";
import tutorial from "@/components/account/TutorialsGlass.module.css";

const helper = "https://dennischancs.github.io/gg-keeper/";
const activity = "https://help.giffgaff.com/en/articles/242797-understanding-why-your-number-has-been-deactivated";
const roaming = "https://www.giffgaff.com/roaming/china";

const steps = [
  ["01", "准备好 SIM", "插入 Giffgaff SIM，确认号码仍有效、账户有余额。先在 Wi-Fi 下查看当前漫游资费与教程。"],
  ["02", "只用这张卡联网", "关闭 Wi-Fi，将 Giffgaff 设为移动数据卡；需要时开启数据漫游，并暂停其他应用的后台流量。"],
  ["03", "打开保号助手", "用手机浏览器打开助手，点击一次「开始保号」，等待下载完成。请勿因账单延迟而连续点击。"],
  ["04", "关闭数据并核对", "立即关闭移动数据，再到 Giffgaff App 或账户核对使用记录；当地支持时也可拨打 *100# 查询余额。"],
] as const;

const questions = [
  ["Wi-Fi 能测试吗？", "可以测试网页能否打开，但 Wi-Fi 流量不算 Giffgaff SIM 的移动数据使用。"],
  ["为什么要限制其他应用联网？", "消息同步、更新和云备份可能产生额外流量。iOS 系统服务也无法保证完全停止联网。"],
  ["网页显示成功就算保号吗？", "网页只确认本次下载完成；号码是否保持活跃仍需核对运营商记录。余额可能不会即时更新。"],
  ["多久操作一次？", "Giffgaff 可能停用连续 6 个月没有符合条件活动的号码。请自行提前提醒，避免压到最后一天。"],
] as const;

export default function GiffgaffTutorial() {
  return <article className="min-w-0 space-y-7 text-sm leading-7 text-slate-600" aria-label="Giffgaff 保号助手教程">
    <section className={tutorial.guideHero}>
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#9f5327]"><Signal className="h-4 w-4" aria-hidden="true" />少量流量 · 手动保号</span>
      <h2 className="mt-3 text-xl font-semibold text-slate-900">Giffgaff 保号助手</h2>
      <p className="mt-2 max-w-3xl">用 Giffgaff SIM 的移动数据完成一次真实联网。助手标称下载约 120 KB；实际流量和扣费还会受网页、系统后台及运营商计费方式影响。</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a href={helper} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#d96e2c] px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-[#c96022] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d96e2c]">打开保号助手<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
      </div>
    </section>

    <section aria-labelledby="giffgaff-steps">
      <h2 id="giffgaff-steps" className="text-lg font-semibold text-slate-900">按顺序操作</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">{steps.map(([number, title, detail]) => <li key={number} className={tutorial.guideStep}>
        <div className="flex items-center gap-3"><span className={tutorial.guideNumber}>{number}</span><h3 className="font-semibold text-slate-900">{title}</h3></div><p className="mt-3">{detail}</p>
      </li>)}</ol>
    </section>

    <section className="grid gap-3 md:grid-cols-3" aria-label="流量、费用与保号时间">
      <div className={tutorial.guideStep}><Signal className="h-5 w-5 text-[#d87334]" aria-hidden="true" /><h3 className="mt-3 font-semibold text-slate-900">约 120 KB</h3><p className="mt-1">这是助手文件的标称大小，不等于手机全部计费流量。</p></div>
      <div className={tutorial.guideStep}><WifiOff className="h-5 w-5 text-[#d87334]" aria-hidden="true" /><h3 className="mt-3 font-semibold text-slate-900">费用看账单</h3><p className="mt-1">中国漫游当前标价 20p/MB。仅按文件估算约 2.46 便士，实际费用可能不同。</p></div>
      <div className={tutorial.guideStep}><Clock3 className="h-5 w-5 text-[#d87334]" aria-hidden="true" /><h3 className="mt-3 font-semibold text-slate-900">提前核对活跃状态</h3><p className="mt-1">连续 6 个月没有符合条件的使用，号码可能被停用。</p></div>
    </section>

    <section aria-labelledby="giffgaff-faq"><h2 id="giffgaff-faq" className="text-lg font-semibold text-slate-900">常见问题</h2><div className={`${tutorial.guideFaq} mt-4 space-y-3`}>{questions.map(([title, answer]) => <details key={title}><summary><span className={tutorial.questionBadge}>Q</span>{title}</summary><p><span className={tutorial.answerBadge}>A</span><span>{answer}</span></p></details>)}</div></section>

    <section className="rounded-2xl border border-orange-200/70 bg-orange-50/50 p-5"><h2 className="flex items-center gap-2 font-semibold text-[#a65b2e]"><ShieldCheck className="h-5 w-5" aria-hidden="true" />使用提醒</h2><p className="mt-2">这是第三方工具，不是 Giffgaff 官方服务。不要输入账号密码、验证码或卡密；不要将网页提示当作运营商保号确认。使用前请核对当前资费。</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1"><a href={roaming} target="_blank" rel="noopener noreferrer" className="text-[#9f5327] underline underline-offset-4">官方漫游资费</a><a href={activity} target="_blank" rel="noopener noreferrer" className="text-[#9f5327] underline underline-offset-4">官方号码活跃说明</a></div></section>
  </article>;
}
