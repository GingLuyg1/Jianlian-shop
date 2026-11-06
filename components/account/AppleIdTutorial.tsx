import Link from "next/link";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import TutorialImage from "./TutorialImage";
import tutorial from "./TutorialsGlass.module.css";
import selection from "@/components/ui/SelectionMotion.module.css";

export const appleArticles = [
  { id: "login", title: "登录与下载", chapters: [
    ["apple-product", "商品说明"], ["apple-id-formats", "交付格式"], ["apple-store-login", "App Store 登录"],
  ] },
  { id: "security", title: "账号安全与恢复", chapters: [
    ["apple-account-recovery", "账号恢复"], ["apple-account-settings", "修改资料"], ["apple-faq", "常见问题"],
  ] },
] as const;

export type AppleArticle = (typeof appleArticles)[number]["id"];
type AppleAccordionProps = { openArticle: AppleArticle | ""; onChange: (article: AppleArticle | "") => void };

const formats = [
  {
    title: "格式 A · 带标注",
    hasOrderNotes: true,
    description: "密码和密保答案只复制冒号后的值。「朋友」「工作」「父母」等标签用于辨认对应项。",
    fields: ["登录账号", "密码", "朋友答案", "工作答案", "父母答案", "生日"],
    example: "store@example.com----密码：ExamplePass1----朋友：ExampleFriend----工作：ExampleJob----父母：ExampleParents----2000/1/1----美国----已购备注",
  },
  {
    title: "格式 B · 按顺序",
    hasOrderNotes: true,
    description: "按图中第 1–6 项读取，依次为账号、密码、三个密保答案和生日。",
    fields: ["登录账号", "密码", "朋友答案", "工作答案", "父母答案", "生日"],
    example: "store@example.com----ExamplePass1----ExampleFriend----ExampleJob----ExampleParents----2000/1/1",
  },
  {
    title: "格式 C · 密保问题与答案",
    description: "按顺序读取账号、密码、密保问题、答案和生日。若有多组密保，请按交付内容逐一对应。",
    fields: ["登录账号", "密码", "密保问题", "答案", "生日"],
    example: "store@example.com----ExamplePass1----ExampleQuestion----ExampleAnswer----2000/1/1",
  },
];

function Illustration({ name, caption, width = 1040, height }: { name: string; caption: string; width?: number; height: number }) {
  return <TutorialImage src={`/assets/tutorials/apple-id/apple-${name}-zh.png`} caption={caption} width={width} height={height} />;
}

function GuideHeading({ number, id, children }: { number: string; id: string; children: ReactNode }) {
  return <h2 id={id} tabIndex={-1} className="flex scroll-mt-4 items-center gap-3 text-lg font-semibold text-slate-900"><span className={`${tutorial.appleBadge} h-9 w-9`}>{number}</span>{children}</h2>;
}

function Step({ number, title, children, image }: { number: number; title: string; children: ReactNode; image?: ReactNode }) {
  return <li className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/65 p-4 sm:p-5">
    <div className="flex items-start gap-3"><span className={`${tutorial.appleBadge} h-7 w-7`}>{number}</span><div className="min-w-0"><h4 className="font-semibold text-slate-900">{title}</h4><div className="mt-2 space-y-2 text-sm leading-7 text-slate-600">{children}</div></div></div>
    {image ? <div className="mt-4">{image}</div> : null}
  </li>;
}

function AppleLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-800 underline-offset-4 hover:underline">{children}</a>;
}

function scrollToChapter(id: string) {
  const heading = document.getElementById(id);
  const article = heading?.closest<HTMLElement>("[data-apple-article-content]");
  if (!heading || !article || article.dataset.state !== "open") return;
  const jump = () => {
    if (!heading.isConnected || article.dataset.state !== "open") return;
    heading.scrollIntoView({ block: "start" });
    heading.focus({ preventScroll: true });
  };
  // A chapter near the end of an opening article cannot be reached until
  // the accordion has expanded to its full scrollable height.
  const opening = article.getAnimations().find(animation => animation.playState === "running");
  if (opening) void opening.finished.then(jump, () => {});
  else jump();
}

export function AppleIdContents({ openArticle, onChange }: AppleAccordionProps) {
  return <nav aria-label="Apple ID 教程目录" className={tutorial.appleContents}>
    <Accordion.Root type="single" collapsible value={openArticle} onValueChange={value => onChange(value as AppleArticle | "")}>
      {appleArticles.map(({ id, title, chapters }) => <Accordion.Item key={id} value={id}>
        <Accordion.Header>
          <Accordion.Trigger className={`${tutorial.contentsLink} ${tutorial.treeArticle} ${selection.item}`} data-sidebar-current={openArticle === id || undefined}>
            <span className="min-w-0 flex-1">{title}</span>
            <span><ChevronDown className={tutorial.chevron} aria-hidden="true" /></span>
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content className={tutorial.accordionContent}>
          <ul className={tutorial.chapters}>
            {chapters.map(([anchor, label]) => <li key={anchor}>
              <button type="button" onClick={() => scrollToChapter(anchor)} className={`${tutorial.contentsLink} ${selection.item}`}><span>{label}</span></button>
            </li>)}
          </ul>
        </Accordion.Content>
      </Accordion.Item>)}
    </Accordion.Root>
  </nav>;
}

export default function AppleIdTutorial({ openArticle, onChange }: AppleAccordionProps) {
  const pendingChapter = useRef<{ article: AppleArticle; id: string } | null>(null);
  useLayoutEffect(() => {
    const pending = pendingChapter.current;
    if (!pending) return;
    if (pending.article !== openArticle) {
      pendingChapter.current = null;
    } else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      pendingChapter.current = null;
      scrollToChapter(pending.id);
    }
  }, [openArticle]);

  function openChapter(article: AppleArticle, id: string) {
    if (article === openArticle) {
      scrollToChapter(id);
    } else {
      pendingChapter.current = { article, id };
      onChange(article);
    }
  }

  const login = <>
    <section aria-labelledby="apple-product" className={`${tutorial.appleCard} p-5 sm:p-6`}>
      <GuideHeading number="01" id="apple-product">商品说明</GuideHeading>
      <p className="mt-3 text-sm leading-7 text-slate-600">Apple ID 也叫 Apple 账户。App Store、iCloud 和其他 Apple 服务的可用范围取决于账号类型和商品说明。</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[['下载号', '用于 App Store 下载对应地区可用的应用。'], ['iCloud 号', '是否支持 iCloud 以商品单独标注为准。'], ['成品号', '可能已购指定应用，请核对商品详情或交付备注。']].map(([title, description]) => <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></div>)}
      </div>
      <p className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm leading-6 text-slate-700">下单前核对地区、用途和售后说明。下载账号通常用于「媒体与购买项目」，请保留设备上自己的 iCloud 账号。</p>
    </section>
    <section aria-labelledby="apple-id-formats">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="apple-id-formats" tabIndex={-1} className="scroll-mt-4 text-lg font-semibold">看懂订单交付格式</h2><p className="mt-1 text-sm leading-6 text-slate-600">打开订单里的卡密信息，对照下面三种格式，按实际交付内容填写。</p></div>
        <Link href="/account/orders" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800">查看我的订单</Link>
      </div>
      <div className="space-y-4">
        {formats.map(({ title, description, fields, example, hasOrderNotes }) => <article key={title} className={`${tutorial.appleCard} p-5 sm:p-6`}>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          <ol aria-label={`${title}字段顺序`} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {fields.map((field, index) => <li key={field} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
              <span className={`${tutorial.appleBadge} h-5 w-5`}>{index + 1}</span>{field}
            </li>)}
          </ol>
          <p className="mt-4 text-xs font-medium text-slate-500">格式示例 · 虚构账号</p>
          <code className="mt-2 block rounded-lg bg-slate-100/80 p-3 text-xs leading-6 text-slate-700 [overflow-wrap:anywhere]">{example}</code>
          {hasOrderNotes ? <p className="mt-2 text-xs leading-5 text-slate-500">生日后如有地区或已购备注，仅用于核对订单。</p> : null}
        </article>)}
      </div>
    </section>
    <section aria-labelledby="apple-store-login" className={`${tutorial.appleCard} p-5 sm:p-6`}>
      <GuideHeading number="02" id="apple-store-login">通过设置登录 App Store</GuideHeading>
      <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-7"><strong>设置 → 你的姓名 → 媒体与购买项目</strong><br />仅切换购买账号，保留原来的 iCloud 主账号。菜单名称以设备实际显示为准。</p>
      <ol className="mt-4 grid gap-4 lg:grid-cols-2">
        <Step number={1} title="打开设置，进入自己的 Apple 账户" image={<Illustration name="settings-entry" caption="步骤 1 · 点设置顶部自己的姓名" height={1636} />}>
          <p>打开 iPhone 设置，点顶部自己的姓名。如果顶部显示「登录 iPhone」或「Apple 账户」，先用自己的个人账号完成设备设置。</p>
        </Step>
        <Step number={2} title="找到「媒体与购买项目」" image={<Illustration name="media-entry" caption="步骤 2 · 找到媒体与购买项目" height={1777} />}>
          <p>在 Apple 账户页面点「媒体与购买项目」。iCloud 入口和整个 Apple 账户页面底部的退出登录会影响设备账号，请保留当前设备设置。</p>
        </Step>
        <Step number={3} title="需要换账号时，仅退出当前购买账号" image={<Illustration name="media-signout" caption="步骤 3 · 在弹出菜单退出购买账号" height={1922} />}>
          <p>如果购买项目已登录其他账号，在弹出菜单中点「退出登录」并确认。未登录可直接进入下一步，已登录目标账号则继续使用。</p>
        </Step>
        <Step number={4} title="选择「不是你的姓名？」登录" image={<Illustration name="media-other-account" caption="步骤 4 · 选择其他账号并登录" height={1898} />}>
          <p>再次打开「媒体与购买项目」。若系统询问是否继续使用设备主账号，点「不是 [你的姓名]？」。进入输入页后，填写用于 App Store 的账号和密码。</p>
        </Step>
        <Step number={5} title="处理账户安全提示" image={<div className="grid gap-3 sm:grid-cols-2"><Illustration name="security-options" caption="图 5A · 选择其他选项" height={1503} /><Illustration name="security-no-upgrade" caption="图 5B · 可选升级提示中的不升级按钮" height={1918} /></div>}>
          <p>如果页面提供可选升级，可按图选择「其他选项 → 不升级」。已开启双重认证的账号仍须完成原有验证。</p>
          <p>若系统要求绑定手机号才能继续，按提示选「继续」或「绑定手机号」，填写自己长期使用且可接收验证码的号码，选择对应区号（中国大陆为 +86）并完成验证。</p>
        </Step>
        <Step number={6} title="完成验证，再去 App Store 下载">
          <p>按页面提示使用这个账号的受信任号码或设备完成验证，回到「媒体与购买项目」核对登录邮箱，再打开 App Store 搜索并下载应用。</p>
          <p>下载完成后可切回自己的购买账号。设备顶部仍使用原来的个人 iCloud 账号。</p>
        </Step>
      </ol>
    </section>
  </>;
  const security = <>
    <section aria-labelledby="apple-account-recovery" className={`${tutorial.appleCard} p-5 sm:p-6`}>
      <h2 id="apple-account-recovery" tabIndex={-1} className="scroll-mt-4 text-lg font-semibold">账号被锁定、停用或处于非活跃状态</h2>
      <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-7 text-slate-600">
        <li>因安全原因锁定或停用。前往 <AppleLink href="https://iforgot.apple.com/">Apple 密码恢复页面</AppleLink>，按提示验证身份并重设密码。</li>
        <li>显示被锁定或处于非活跃状态。点提醒里的「请求访问」，或提交 <AppleLink href="https://iforgot.apple.com/unlock">Apple 账户解锁申请</AppleLink>。</li>
        <li>「媒体与购买项目」或「App Store 和 iTunes」账户被停用。点提醒里的「继续」，或前往 <AppleLink href="https://getsupport.apple.com/?PGF=PGF63005&caller=kbase&category_id=SC0245&symptom_id=23362">Apple 重新激活入口</AppleLink>。</li>
      </ul>
      <p className="mt-3 text-sm leading-6 text-slate-600">恢复结果以 Apple 页面提示和审核为准。重装 App 无法解除账户停用。</p>
    </section>
    <section aria-labelledby="apple-account-settings" className={`${tutorial.appleCard} p-5 sm:p-6`}>
      <GuideHeading number="03" id="apple-account-settings">修改密码、邮箱与密保</GuideHeading>
      <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6">收到可修改资料的账号后，建议尽快更换为自己的邮箱、密码及可用安全资料。可修改的项目以账号页面为准。</p>
      <ol className="mt-4 grid gap-4 lg:grid-cols-2">
        <Step number={1} title="登录 Apple 账户管理页面" image={<Illustration name="web-signin" caption="网页步骤 1 · 登录要修改资料的账号" width={1800} height={1459} />}>
          <p>打开 <AppleLink href="https://account.apple.com/">Apple 官方账号管理页面</AppleLink>，用本次购买收到的账号与密码登录，先核对邮箱再修改。</p>
        </Step>
        <Step number={2} title="填写对应的密保答案"><p>以订单卡密为准，对照题目填写各自答案。带标注的交付格式只填写标签后的值。</p></Step>
        <Step number={3} title="完成网页端的安全验证" image={<Illustration name="web-security" caption="网页步骤 3 · 可选升级提示与手机号设置" width={1800} height={1720} />}>
          <p>可选升级按界面选「其他选项 → 不升级」。要求绑定手机号时，使用自己可接收验证码的号码和对应区号；现有双重认证仍按提示完成。</p>
        </Step>
        <Step number={4} title="更改登录邮箱" image={<Illustration name="web-change-email" caption="网页步骤 4 · 更新并核对账户邮箱" width={1800} height={2151} />}>
          <p>在「登录与安全」中选择 Apple ID 或邮箱设置，填写自己可访问、且未被其他 Apple 账号使用的邮箱并完成验证。确认页面显示新邮箱后，使用更新后的登录信息。</p>
        </Step>
        <Step number={5} title="更改密码与安全信息" image={<Illustration name="web-change-security" caption="网页步骤 5 · 更改密码与安全资料" width={1800} height={2184} />}>
          <p>打开「密码」更改登录密码，在「账户安全」中更新密保或受信任号码。可用选项取决于账户的验证方式。系统要求再次确认时，输入当前 Apple 账户密码。</p>
        </Step>
      </ol>
    </section>
    <section aria-labelledby="apple-faq" className={`${tutorial.appleCard} p-5 sm:p-6`}>
      <GuideHeading number="04" id="apple-faq">常见问题</GuideHeading>
      <div className={`${tutorial.appleFaq} mt-4 space-y-3 text-sm leading-7 text-slate-600`}>
        <details className="rounded-xl border border-orange-100 bg-white/75 p-4"><summary className="cursor-pointer font-semibold text-slate-900">无法登录或一直转圈</summary><p className="mt-2">先核对「媒体与购买项目」当前账号，再检查网络。可尝试开关飞行模式、临时关闭代理、在 Wi-Fi 与移动数据之间切换，或重启后再登录。也可到 Apple 官网检查账号是否能通过验证。</p></details>
        <details className="rounded-xl border border-orange-100 bg-white/75 p-4"><summary className="cursor-pointer font-semibold text-slate-900">更新 App 时要求输入原账号</summary><p className="mt-2">用原下载账号更新。若要改用当前账号重新下载，先备份应用数据并确认该账号及所在商店能下载该 App，再决定是否删除旧版本。</p></details>
        <details className="rounded-xl border border-orange-100 bg-white/75 p-4"><summary className="cursor-pointer font-semibold text-slate-900">提示密码错误</summary><p className="mt-2">先确认在 <button type="button" onClick={() => openChapter("login", "apple-store-login")} className="text-primary underline">「媒体与购买项目」登录</button>，并核对输入的是正确账号。新购账号可从卡密复制对应值，避免带上标签、空格或分隔符；Apple 官网验证仍失败时联系订单客服。已修改过资料的账号应使用更新后的邮箱和密码，忘记密码可走 Apple 官方恢复流程。</p></details>
        <details className="rounded-xl border border-orange-100 bg-white/75 p-4"><summary className="cursor-pointer font-semibold text-slate-900">账号锁定、非活跃或 App Store 账户停用</summary><p className="mt-2">按屏幕提示选择对应的 <button type="button" onClick={() => openChapter("security", "apple-account-recovery")} className="text-primary underline">Apple 账户恢复入口</button>。</p></details>
      </div>
    </section>
    <p className="px-2 text-xs text-slate-500">步骤配图来源：大橘 Apple ID 使用教程。</p>
  </>;

  return <Accordion.Root type="single" collapsible value={openArticle} onValueChange={value => onChange(value as AppleArticle | "")} className={tutorial.articles}>
    {appleArticles.map(({ id, title }) => <Accordion.Item key={id} value={id}>
      <Accordion.Header className={tutorial.articleHeading}>
        <Accordion.Trigger className={tutorial.articleTrigger}>
          <span className="min-w-0 flex-1">{title}</span>
          <span><ChevronDown className={tutorial.chevron} aria-hidden="true" /></span>
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content data-apple-article-content className={tutorial.accordionContent} onAnimationEnd={event => {
        const pending = pendingChapter.current;
        if (event.target === event.currentTarget && openArticle === id && pending?.article === id) {
          pendingChapter.current = null;
          scrollToChapter(pending.id);
        }
      }}>
        <div className={`${tutorial.appleArticle} space-y-6`}>{id === "login" ? login : security}</div>
      </Accordion.Content>
    </Accordion.Item>)}
  </Accordion.Root>;
}
