import { ArrowUpRight, Clock3, MapPin, ShieldCheck, Smartphone } from "lucide-react";
import TutorialImage from "@/components/account/TutorialImage";
import tutorial from "@/components/account/TutorialsGlass.module.css";

const official = {
  product: "https://www.fortress.com.hk/en/product/roaming-data-haha-sim-card-reusable-with-50-balance/p/BP_11953923",
  faq: "https://image.fortress.com.hk/www_media/promo/hahasim_en.pdf",
  registration: "https://web.three.com.hk/prepaid/realnameregistration/index.html",
};

const steps = [
  ["01", "插入实体卡", "准备一台无运营商锁的手机，将 haha TRAVEL SIM 插入卡槽；双卡手机先选中对应线路。", ""],
  ["02", "打开数据漫游", "需要漫游联网时，进入「设置 → 蜂窝网络 → 对应 SIM → 数据漫游」。先确认当前套餐和所在地区。", "/tutorials/haha/haha_iphone_roaming_redacted.webp"],
  ["03", "等待激活短信", "关闭 Wi-Fi，让卡片连接移动网络。激活短信通常包含号码或后续操作提示；以你收到的真实短信为准。", "/tutorials/haha/haha_activation_sms_redacted.webp"],
  ["04", "登录 haha TRAVEL", "通过官方渠道安装 App，按提示使用号码及卡背面 ICCID 绑定；不要把 ICCID、密码或短信验证码发给商家。", ""],
  ["05", "核对套餐后再付款", "在 App 中选择目的地套餐，确认覆盖地区、有效期及购物车金额，付款后在账户页检查套餐已生效。", ""],
] as const;

const examplePrices = [
  ["开卡余额", "部分实体卡版本为 HK$50"],
  ["日包示例", "HK$10 / 天、500 MB 高速流量"],
  ["月包示例", "HK$138 / 30 天、15 GB 高速流量"],
  ["流量包示例", "HK$60 / 5 天 / 5 GB；HK$120 / 10 天 / 10 GB"],
] as const;

export default function HahaSimTutorial() {
  return <article className="min-w-0 space-y-7 text-sm leading-7 text-slate-600" aria-label="Haha SIM 实体卡激活与保号教程">
    <section className={tutorial.guideHero}>
      <span className="inline-flex items-center gap-2 font-semibold text-[#9f5327]"><Smartphone className="h-4 w-4" aria-hidden="true" />haha TRAVEL 实体卡</span>
      <h2 className="mt-3 text-xl font-semibold text-slate-900">从插卡到激活</h2>
      <p className="mt-2 max-w-3xl">先确认信号和号码，再通过官方 App 查看余额、套餐及有效期。</p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1"><a href={official.product} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[#9f5327] underline underline-offset-4">查看商品资料<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a><a href={official.faq} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[#9f5327] underline underline-offset-4">查看官方常见问题<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a></div>
    </section>

    <section aria-labelledby="haha-overview"><h2 id="haha-overview" className="text-lg font-semibold text-slate-900">套餐与费用</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{examplePrices.map(([label, value]) => <div key={label} className={tutorial.guideStep}><h3 className="font-semibold text-slate-900">{label}</h3><p className="mt-2">{value}</p></div>)}</div>
      <div className="mt-3 rounded-2xl border border-orange-200/70 bg-orange-50/50 p-4">日包、月包、流量包的有效期与高速流量额度可能因版本和目的地变化；请在 haha TRAVEL App 的结算页核对。通话和短信按实际资费计费。</div>
    </section>

    <section aria-labelledby="haha-steps"><h2 id="haha-steps" className="text-lg font-semibold text-slate-900">激活步骤</h2><ol className="mt-4 grid gap-4 sm:grid-cols-2">{steps.map(([number, title, detail, image]) => <li key={number} className={tutorial.guideStep}><div className="flex items-center gap-3"><span className={tutorial.guideNumber}>{number}</span><h3 className="font-semibold text-slate-900">{title}</h3></div><p className="mt-3">{detail}</p>{image ? <div className="mt-4"><TutorialImage src={image} width={855} height={image.includes("sms") ? 1821 : 1844} caption={title} previewClassName="mx-auto h-auto max-h-[300px] w-full object-contain" /></div> : null}</li>)}</ol></section>

    <section aria-labelledby="haha-troubleshooting"><h2 id="haha-troubleshooting" className="text-lg font-semibold text-slate-900">常见问题</h2><div className={`${tutorial.guideFaq} mt-4 space-y-3`}>
      <details><summary><span className={tutorial.questionBadge}>Q</span>插卡后没有信号怎么办？</summary><p><span className={tutorial.answerBadge}>A</span><span>确认卡片已启用、设备无运营商锁，并放在卡槽 1；尝试自动选网、飞行模式或重启。仍无法连接时，按官方 App 指示选择可用网络。</span></p></details>
      <details><summary><span className={tutorial.questionBadge}>Q</span>有信号但无法上网怎么办？</summary><p><span className={tutorial.answerBadge}>A</span><span>核对目的地套餐已生效、数据漫游已开启。官方 FAQ 提供的 APN 是 <code className="break-all rounded bg-orange-50 px-1.5 py-0.5">mobile.lte.three.com.hk</code>；修改前请核对当前卡片说明。</span></p></details>
      <details><summary><span className={tutorial.questionBadge}>Q</span>为什么收不到短信？</summary><p><span className={tutorial.answerBadge}>A</span><span>先检查信号、号码有效期和账户余额。部分地区或平台还有限制；购买数据包可能产生费用，也不能保证收到特定平台验证码。</span></p></details>
    </div></section>

    <section className="grid gap-3 md:grid-cols-2">
      <div className={tutorial.guideStep}><Clock3 className="h-5 w-5 text-[#d87334]" aria-hidden="true" /><h2 className="mt-3 font-semibold text-slate-900">有效期与保号</h2><p className="mt-2">官方 FAQ 记载：卡片激活后有效期为 365 天；充值 HK$10 或更多可延长 365 天。购买数据套餐本身不等于延长期限，具体以 App 的有效期显示为准。</p></div>
      <div className={tutorial.guideStep}><MapPin className="h-5 w-5 text-[#d87334]" aria-hidden="true" /><h2 className="mt-3 font-semibold text-slate-900">实名登记</h2><p className="mt-2">使用香港本地通信服务时需按规定实名；境外使用也应遵守目的地规则。收到登记提示时，只从官方 App 或官方登记页面操作。</p><a href={official.registration} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium text-[#9f5327] underline underline-offset-4">官方实名登记入口<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a></div>
    </section>
    <div className="flex items-start gap-2 rounded-2xl border border-orange-200/70 bg-orange-50/50 p-4"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#b96532]" aria-hidden="true" /><p>请在付款前核对套餐、地区和费用；不要将手机号、ICCID 或验证码公开。官方 App 中的实时状态优先于本页示意。</p></div>
  </article>;
}
