"use client";

import { useRef, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  BookOpen,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  Headphones,
  PackageCheck,
  Search,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { openPublicSupport } from "@/lib/support/open-public-support";
import BinanceTutorial from "@/components/account/BinanceTutorial";
import GiffgaffTutorial from "@/components/account/GiffgaffTutorial";
import GiffgaffActivationTutorial from "@/components/account/GiffgaffActivationTutorial";
import HahaSimTutorial from "@/components/account/HahaSimTutorial";
import AppleIdTutorial, { appleChapters } from "@/components/account/AppleIdTutorial";
import sidebar from "@/components/layout/SidebarSlidingList.module.css";
import selection from "@/components/ui/SelectionMotion.module.css";
import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/AccountCenter.module.css";
import tutorial from "@/components/account/TutorialsGlass.module.css";

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

const tutorialTopics = [
  { id: "required", label: "使用必读", title: "使用必读", description: "下单前了解商品规则、购买流程与交付说明。", icon: BookOpen, keywords: ["购买与交付指南", "服务说明", ...steps.flatMap(item => [item.title, item.text]), ...notices, ...serviceRules.flatMap(item => [item.title, item.text])] },
  { id: "binance", label: "币安教程", title: "币安 · USDT 交易教程", description: "下载安装、注册买币，以及使用 BSC（BEP20）转账充值。", icon: CreditCard, keywords: ["Binance", "BEP20", "安卓", "iPhone", "Apple", "注册", "邀请码", "JIANLIAN", "购买 USDT", "提现", "支付", "收款地址", "网络手续费"] },
  { id: "apple-id", label: "Apple ID", title: "Apple ID 使用教程", description: "", icon: ShieldCheck, keywords: ["苹果 ID", "苹果ID", "卡密", "密保", "生日", "格式 A", "格式 B", "格式 C", "iCloud", ...appleChapters.map(([, label]) => label)] },
  { id: "giffgaff", label: "Giffgaff", title: "Giffgaff 教程", description: "", icon: ShieldCheck, keywords: ["英国", "SIM", "激活", "保号", "移动数据", "漫游", "120KB", "流量", "余额", "eSIM", "实体卡"] },
  { id: "haha-sim", label: "Haha SIM", title: "Haha SIM 实体卡激活与保号教程", description: "首次插卡、漫游设置、官方 App、故障排查与实名登记。", icon: Smartphone, keywords: ["Haha", "haha SIM", "haha Travel", "实体卡", "激活", "数据漫游", "ICCID", "短信", "APN", "实名", "保号", "香港", "中港澳"] },
] as const;

export default function TutorialsPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<(typeof tutorialTopics)[number]["id"]>("required");
  const [giffgaffTreeOpen, setGiffgaffTreeOpen] = useState(false);
  const [giffgaffGuide, setGiffgaffGuide] = useState<"activation" | "keeper">("activation");
  const scrollRef = useRef<HTMLDivElement>(null);
  const query = search.trim().toLocaleLowerCase();
  const matchingTopics = tutorialTopics.filter(topic => [topic.label, topic.title, topic.description, ...topic.keywords].some(text => text.toLocaleLowerCase().includes(query)));
  const topic = matchingTopics.find(item => item.id === selected) ?? matchingTopics[0] ?? tutorialTopics.find(item => item.id === selected)!;
  const showApple = matchingTopics.length > 0 && topic.id === "apple-id";
  const showGiffgaff = matchingTopics.length > 0 && topic.id === "giffgaff";
  const resetScroll = () => { if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  return <div className={tutorial.shell}><PublicLayout viewportLocked contentClassName="max-w-none px-4 py-3 md:px-6">
    <div data-testid="tutorial-workspace" className={tutorial.workspace}>
      <aside data-testid="tutorial-navigation" className={`${glass.surface} ${styles.panel} ${tutorial.navigation}`}>
        <label htmlFor="tutorial-search" className="text-sm font-semibold text-slate-900">搜索商品教程</label>
        <div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" /><Input id="tutorial-search" value={search} onChange={event => { setSearch(event.target.value); resetScroll(); }} placeholder="输入商品 / 教程关键词" className="h-11 rounded-xl border-orange-100 bg-white/80 pl-9" /></div>
        <nav aria-label="使用教程分类" className={tutorial.topicList} data-topic={topic.id}>
          <span aria-hidden="true" className={`${sidebar.indicator} ${tutorial.topicIndicator}`} data-ready="true" data-visible={matchingTopics.length > 0} />
          {tutorialTopics.map(({ id, label, icon: Icon }) => {
            const current = topic.id === id && matchingTopics.length > 0;
            const button = <button type="button" aria-current={current ? "true" : undefined} data-sidebar-current={current || undefined} className={`${tutorial.navItem} ${selection.item}`} onClick={() => {
              setSelected(id);
              setSearch("");
              if (id === "giffgaff" && !showGiffgaff) setGiffgaffTreeOpen(true);
              if (id !== "giffgaff") setGiffgaffTreeOpen(false);

              resetScroll();
            }}>
              <Icon className="h-4 w-4 shrink-0 md:h-5 md:w-5" aria-hidden="true" /><span className="flex-1 text-left">{label}</span>
              {id === "required" && <span className={`${styles.pill} hidden md:inline`}>必读</span>}
              {id === "giffgaff" && <span className="hidden md:inline"><ChevronDown className={tutorial.chevron} aria-hidden="true" /></span>}
            </button>;
            return id === "giffgaff" ? <Collapsible.Root key={id} asChild open={showGiffgaff && giffgaffTreeOpen} onOpenChange={setGiffgaffTreeOpen}><div className={`${tutorial.treeItem} min-w-0`}><Collapsible.Trigger asChild>{button}</Collapsible.Trigger><Collapsible.Content className={tutorial.tree}><nav aria-label="Giffgaff 教程目录" className={`${tutorial.appleContents} ${tutorial.subtopics}`} data-guide={giffgaffGuide}><span aria-hidden="true" className={`${sidebar.indicator} ${tutorial.subtopicIndicator}`} data-ready="true" data-visible="true" /><button type="button" aria-current={giffgaffGuide === "activation" ? "page" : undefined} className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setGiffgaffGuide("activation"); resetScroll(); }}>实体卡激活与使用</button><button type="button" aria-current={giffgaffGuide === "keeper" ? "page" : undefined} className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setGiffgaffGuide("keeper"); resetScroll(); }}>保号助手</button></nav></Collapsible.Content></div></Collapsible.Root> : <div className="min-w-0" key={id}>{button}</div>;
          })}
        </nav>
      </aside>
      <section data-testid="tutorial-content" className={`${glass.surface} ${styles.panel} ${tutorial.content}`}>
        <header className={`${glass.hero} ${tutorial.header}`}><div key={`${topic.id}-${giffgaffGuide}`} className={tutorial.topicEnter}><h1 className="text-xl font-semibold text-slate-900">{showGiffgaff ? "Giffgaff" : topic.title}</h1>{topic.description && <p className="mt-2 text-sm leading-6 text-slate-500">{topic.description}</p>}</div></header>
        <div ref={scrollRef} data-testid="tutorial-scroll" className={`${tutorial.scroll} overflow-y-auto`} tabIndex={0} role="region" aria-label={`${topic.label}正文`}>
          <div key={matchingTopics.length ? `${topic.id}-${giffgaffGuide}` : "empty"} className={tutorial.topicEnter}>
          {!matchingTopics.length ? <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-4 text-center"><p className="font-medium text-slate-700">暂无匹配教程</p><p className="max-w-full break-words text-sm text-slate-500">没有找到与“{search.trim()}”相关的内容。</p><Button variant="outline" onClick={() => { setSearch(""); resetScroll(); }}>清空搜索</Button></div> : topic.id === "binance" ? <BinanceTutorial /> : showApple ? <AppleIdTutorial /> : topic.id === "giffgaff" ? giffgaffGuide === "activation" ? <GiffgaffActivationTutorial /> : <GiffgaffTutorial /> : topic.id === "haha-sim" ? <HahaSimTutorial /> : <div className="space-y-7">
            <section aria-labelledby="tutorial-service-title">
              <div className="mb-5 flex items-center gap-3"><span className={`${glass.icon} h-11 w-11`}><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span><div><h2 id="tutorial-service-title" className="text-lg font-semibold">服务说明</h2><p className="mt-1 text-xs leading-5 text-slate-500">先核对适用范围，再确认所需商品。</p></div></div>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
                <div className={`${glass.inset} rounded-2xl p-5 sm:p-6`}><span className={styles.pill}>Jianlian 数字商品服务</span><p className="mt-4 text-sm leading-7 text-slate-600">本商城提供数字账号、礼品卡、通信及相关数字商品服务。请在购买前确认商品地区、规格、使用条件与交付方式。具体商品说明优先于通用教程。</p><p className="mt-3 text-sm leading-7 text-slate-500">遇到不确定的信息，请先联系在线客服确认，避免购买不适用的商品。</p></div>
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">{serviceRules.map(({ title, text, icon: Icon }) => <div key={title} className={`${glass.inset} flex items-start gap-3 rounded-2xl p-4`}><Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div></div>)}</div>
              </div>
            </section>
            <section className="rounded-2xl border border-orange-200/70 bg-orange-50/40 p-5 sm:p-6"><h2 className="flex items-center gap-2 text-base font-semibold text-[#b96532]"><ShieldCheck className="h-5 w-5" aria-hidden="true" />合规与账户安全</h2><p className="mt-3 text-sm leading-7 text-slate-600">仅限合法用途。请勿提交涉及违法、欺诈、侵权或他人隐私的内容。不要通过公开渠道发送账号密码、卡密、验证码或支付凭证。</p></section>
            <section aria-labelledby="tutorial-purchase-title"><div className="mb-5 flex items-center gap-3"><span className={`${glass.icon} h-11 w-11`}><ClipboardCheck className="h-5 w-5" aria-hidden="true" /></span><div><h2 id="tutorial-purchase-title" className="text-lg font-semibold">购买与交付指南</h2><p className="mt-1 text-xs text-slate-500">按顺序核对，减少商品或订单信息填写错误。</p></div></div><div className="grid gap-3 sm:grid-cols-2">{steps.map(({ title, text, icon: Icon }, index) => <article key={title} className={`${glass.inset} rounded-2xl p-5`}><div className="flex items-center gap-2 text-sm font-semibold"><span className="text-xs tabular-nums text-[#b18c63]">0{index + 1}</span><Icon className="h-4 w-4 text-primary" aria-hidden="true" /><h3>{title}</h3></div><p className="mt-3 text-sm leading-7 text-slate-500">{text}</p></article>)}</div></section>
            <section className={`${glass.inset} rounded-2xl p-5 sm:p-6`}><h2 className="text-base font-semibold">下单与售后提醒</h2><ul className="mt-4 list-disc space-y-3 pl-4 text-sm leading-7 text-slate-600">{notices.map(notice => <li key={notice}>{notice}</li>)}</ul></section>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-orange-100 pt-5"><p className="text-sm text-slate-500">需要补货、批量购买或确认商品是否适用？</p><Button variant="outline" onClick={openPublicSupport}><Headphones className="mr-2 h-4 w-4" />联系在线客服<ArrowUpRight className="ml-2 h-4 w-4" /></Button></div>
          </div>}
          </div>
        </div>
      </section>
    </div>
  </PublicLayout></div>;
}
