import type { ReactNode } from "react";
import { ArrowUpRight, ShieldCheck, Smartphone } from "lucide-react";
import TutorialImage from "@/components/account/TutorialImage";
import tutorial from "@/components/account/TutorialsGlass.module.css";

const activationSteps = [
  ["01", "输入激活码", "先准备一张未激活的 Giffgaff 实体卡，可以联系客服购买。打开官方激活页，按卡片上印制的激活码填写并点击 Activate your SIM；不同卡片可能显示 6 位或 13 位。", "找到卡片激活码，打开激活入口", 2128, 978],
  ["02", "验证邮箱", "填写自己长期使用的邮箱，点击 Next，输入收到的验证码，再创建账户密码。", "填写邮箱并接收验证码", 2124, 712],
  ["03", "确认邮箱验证码", "按页面提示完成邮箱验证；验证码只填写在 Giffgaff 官方页面，不要发送给客服或其他人。", "确认邮箱验证码", 2006, 678],
  ["04", "创建账户密码", "设置仅用于 Giffgaff 的账户密码，完成后保存好登录信息。", "创建账户密码", 2020, 890],
  ["05", "继续账户设置", "核对账户资料和服务条款，按页面提示继续激活流程。", "继续账户设置", 2158, 1100],
  ["06", "选择方案", "按实际需要选择 Pay as you go 或其他可用方案，核对页面实时金额和适用地区。", "选择按量付费方案", 2120, 958],
  ["07", "选择充值或兑换充值券", "需要充值时使用官方充值入口；使用充值券时在兑换入口填写，提交前确认金额和有效期。", "选择充值或兑换充值券", 2052, 702],
  ["08", "填写资料并核对订单", "填写本人真实资料，核对支付信息、条款和账户归属后再提交。", "填写本人资料并核对订单", 2088, 1830],
  ["09", "确认付款信息", "确认付款金额和方案后完成付款。付款页面可能因地区、方案和时间变化，请以当前页面为准。", "确认付款信息", 2468, 2444],
  ["10", "查看英国号码", "激活页会分配英国号码。回到账户首页或号码页面核对号码、余额和套餐状态。", "查看分配的英国号码", 2042, 1141],
  ["11", "插卡并核对激活状态", "将卡插入没有运营商锁的手机，按需开启数据漫游，等待信号和激活通知。不要反复提交替换或激活请求。", "回到账户核对激活状态", 2268, 1844],
] as const;

const links = {
  activate: "https://www.giffgaff.com/activate",
  account: "https://www.giffgaff.com/",
  topup: "https://www.giffgaff.com/top-up",
  email: "https://www.giffgaff.com/auth/change-email",
  number: "https://www.giffgaff.com/profile/details/getnumber",
  usage: "https://www.giffgaff.com/profile/usage-statement",
  profile: "https://www.giffgaff.com/profile/details",
  esim: "https://help.giffgaff.com/en/collections/626993-esim",
  physical: "https://help.giffgaff.com/en/articles/240706-can-i-switch-back-to-a-physical-sim-card-from-an-esim",
  support: "https://www.giffgaff.com/boiler-plate/contact",
  terms: "https://www.giffgaff.com/terms",
  roaming: "https://www.giffgaff.com/roaming/china",
};

function External({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[#9f5327] underline underline-offset-4">{children}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></a>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className={`${tutorial.appleCard} space-y-3 p-5 sm:p-6`}><h2 className="text-lg font-semibold text-slate-900">{title}</h2>{children}</section>;
}

export default function GiffgaffActivationTutorial() {
  return <article className="min-w-0 space-y-5 text-sm leading-7 text-slate-600" aria-label="Giffgaff 实体卡激活与使用教程">
    <header className={tutorial.guideHero}>
      <span className="inline-flex items-center gap-2 font-semibold text-[#9f5327]"><Smartphone className="h-4 w-4" aria-hidden="true" />英国实体 SIM</span>
      <h2 className="mt-3 text-xl font-semibold text-slate-900">实体卡激活与使用</h2>
      <p className="mt-2">先在网页激活，再插卡等待网络连接。页面按钮和资费以 Giffgaff 当前显示为准。</p>
      <div className="mt-4"><External href={links.activate}>打开 Giffgaff 激活页</External></div>
    </header>

    <Section title="激活实体卡">
      <ol className="grid gap-4 lg:grid-cols-2">
        {activationSteps.map(([number, title, detail, caption, width, height]) => <li key={number} className={tutorial.guideStep}>
          <div className="flex items-center gap-3"><span className={tutorial.guideNumber}>{number}</span><h3 className="font-semibold text-slate-900">{title}</h3></div>
          <p className="mt-3">{detail}</p>
          <div className="mt-4"><TutorialImage key={number} src={`/tutorials/giffgaff/activation-${number}.png`} width={width} height={height} caption={`激活图解 ${number} · ${caption}`} previewClassName="mx-auto h-auto max-h-[300px] w-full object-contain" /></div>
        </li>)}
      </ol>
    </Section>

    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="二、资费"><p>短信、通话、移动数据和套餐价格会随地区与方案变化。使用前在 <External href={links.roaming}>官方漫游资费</External> 核对；账户中的余额、套餐和有效期以官方页面为准。</p></Section>
      <Section title="三、保号"><p>号码需要保持符合运营商要求的活动记录。可通过短信、通话、移动数据或充值等方式维持活跃；完成后到 <External href={links.usage}>使用记录</External> 核对，避免只凭网页提示判断。</p><p>建议提前安排一次符合条件的使用，具体停用规则以官方账户页面和帮助中心为准。</p></Section>
      <Section title="四、发短信、打电话格式"><p>国际号码通常使用「+国家代码 + 号码」。例如英国号码可写为 <code className="rounded bg-slate-100 px-1.5">+44…</code>；实际短信和通话资费按漫游地区计费。</p><p>拨号键长按 0 通常可输入「+」。若通话提示受到限制，可检查网络选择、漫游状态和国际拨号格式。</p></Section>
      <Section title="五、查询本机号码"><p>可在 <External href={links.account}>Giffgaff 官网</External> 或 App 查询号码、余额和套餐。部分教程介绍将短信 <code className="rounded bg-slate-100 px-1.5">number</code> 发往 <code className="rounded bg-slate-100 px-1.5">2020</code> 查询本机号码，操作前请确认短信费用。</p><p>查询后将号码保存到手机联系人，避免在切换 SIM 时混淆。</p></Section>
      <Section title="六、更改邮箱、密码"><p>更改邮箱可进入 <External href={links.email}>官方邮箱设置</External>；密码请在官方账户安全设置中修改或使用找回流程。</p><p>修改资料时不要复用其他网站密码，也不要把验证码发给他人。</p></Section>
      <Section title="七、收不到短信"><p>先确认有信号，能收到官方短信表示号码可以正常使用，例如登录官网时收到验证码短信。</p><p>如果只有注册平台收不到短信，常见原因是代理 IP 或 VPN 质量问题，请更换更干净的网络后重试；仍有问题时联系平台客服或 Giffgaff 官方支持。</p></Section>
    </div>

    <Section title="八、更换号码"><p>如需随机更换号码，可查看 <External href={links.number}>官方更换号码页面</External>。操作前确认页面的次数、时段与生效规则。</p></Section>

    <Section title="九、SIM 转 eSIM">
      <h3 className="font-semibold text-slate-900">准备</h3>
      <ul className="list-disc space-y-2 pl-5">
        <li>支持 eSIM 的手机，例如支持 eSIM 的外版 iPhone。</li>
        <li>安装好 <External href="https://apps.apple.com/cn/app/giffgaff/id571246020">Giffgaff App</External>，并连接 Wi-Fi。</li>
        <li>操作时间：北京时间 12:30 至次日凌晨 4:30。</li>
      </ul>
      <h3 className="pt-3 font-semibold text-slate-900">步骤</h3>
      <ol className="grid gap-3 sm:grid-cols-2">
        {[
          ["登录 App，进入换卡入口", "依次点击 Account → SIM → Replace my SIM → Switch to a new eSIM。"],
          ["确认切换须知", "勾选 I understand and accept this，点击 Start the switch。"],
          ["完成短信验证", "输入短信验证码，点击 Confirm。"],
          ["再次确认开始切换", "勾选 I understand and accept this，点击 Start the switch。"],
          ["安装 eSIM", "点击 Install eSIM。在弹出的激活 eSIM 提示中点击「激活」，再点击「继续」。"],
          ["完成套餐设置", "套餐选择「语音和数据」，依次点击「继续」→「完成」→ Close。"],
          ["启用号码，等待信号", "打开手机「设置 → 蜂窝网络」，在 SIM 卡中打开「启用此号码」。一般 1 小时内激活，最慢可能需要 24 小时。"],
        ].map(([title, detail], index) => <li key={title} className={tutorial.guideStep}><div className="flex items-center gap-3"><span className={tutorial.guideNumber}>{index + 1}</span><h4 className="font-semibold text-slate-900">{title}</h4></div><p className="mt-3">{detail}</p></li>)}
      </ol>
    </Section>

    <Section title="十、eSIM 转回实体卡"><ol className="list-decimal space-y-2 pl-5"><li>先准备一张未激活的 Giffgaff 实体卡，并确认卡片上的激活码。</li><li>登录 <External href={links.profile}>个人资料和设置</External>，找到 Replace my SIM，选择 Activate your SIM。</li><li>按卡片实际标注输入激活码，核对替换目标后确认「Yes, I want to replace my SIM」及后续确认提示。</li><li>等待官方完成切换，再检查实体卡是否有信号；期间不要反复提交替换请求。</li></ol><p>操作界面、处理时间和激活码位数请以 <External href={links.physical}>Giffgaff 官方帮助</External>为准。</p></Section>

    <Section title="十一、Wi-Fi Calling"><p>如果设备和套餐支持 Wi-Fi Calling，请先在 Giffgaff 官方帮助中心确认资格、开通条件和所在地区支持情况，再按手机系统中的「电话」或「移动网络」设置开启。</p><p>Wi-Fi Calling 的可用性会受设备、账户、网络和地区影响；开启后仍应保留正常的移动网络设置，遇到无法注册时先重启设备并检查系统更新。</p></Section>

    <Section title="其他帮助"><div className="flex flex-wrap gap-x-5 gap-y-2"><External href={links.support}>官方客服</External><External href={links.terms}>服务条款</External><External href={links.esim}>eSIM 常见问题</External></div></Section>
    <div className="flex items-start gap-2 rounded-2xl border border-orange-200/70 bg-orange-50/50 p-4"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#b96532]" aria-hidden="true" /><p>不要在教程或客服聊天中公开密码、验证码和完整卡号。激活、换卡、充值前请核对官方页面显示的账户与金额。</p></div>
  </article>;
}
