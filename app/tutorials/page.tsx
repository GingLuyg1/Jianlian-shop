"use client";

import { useEffect, useRef, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  BookOpen,
  ArrowUpRight,
  Bot,
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
import { useMobileStorefront } from "@/hooks/use-mobile-storefront";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { openPublicSupport } from "@/lib/support/open-public-support";
import BinanceTutorial from "@/components/account/BinanceTutorial";
import GiffgaffTutorial from "@/components/account/GiffgaffTutorial";
import GiffgaffActivationTutorial from "@/components/account/GiffgaffActivationTutorial";
import HahaSimTutorial from "@/components/account/HahaSimTutorial";
import OneNzTutorial, { type OneNzSection } from "@/components/account/OneNzTutorial";
import ChatGptAccountGuideTutorial, { type ChatGptTutorialSection } from "@/components/account/ChatGptAccountGuideTutorial";
import AppleIdTutorial, { appleChapters } from "@/components/account/AppleIdTutorial";
import {
  AppleWireframeIcon,
  BinanceWireframeIcon,
  ChatGptWireframeIcon,
  GiffgaffWireframeIcon,
  HahaSimWireframeIcon,
  OneNzWireframeIcon,
} from "@/components/icons/TutorialBrandWireframeIcons";
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
  { id: "required", label: "使用必读", title: "使用必读", description: "", icon: BookOpen, keywords: ["购买与交付指南", "服务说明", ...steps.flatMap(item => [item.title, item.text]), ...notices, ...serviceRules.flatMap(item => [item.title, item.text])] },
  { id: "binance", label: "币安教程", title: "币安 · USDT 交易教程", description: "", icon: BinanceWireframeIcon, keywords: ["Binance", "BEP20", "安卓", "iPhone", "Apple", "注册", "邀请码", "JIANLIAN", "购买 USDT", "提现", "支付", "收款地址", "网络手续费"] },
  { id: "apple-id", label: "Apple ID", title: "Apple ID 使用教程", description: "", icon: AppleWireframeIcon, keywords: ["苹果 ID", "苹果ID", "卡密", "密保", "生日", "格式 A", "格式 B", "格式 C", "iCloud", ...appleChapters.map(([, label]) => label)] },
  { id: "giffgaff", label: "Giffgaff", title: "Giffgaff 教程", description: "", icon: GiffgaffWireframeIcon, keywords: ["英国", "SIM", "激活", "保号", "移动数据", "漫游", "120KB", "流量", "余额", "eSIM", "实体卡"] },
  { id: "haha-sim", label: "Haha SIM", title: "Haha SIM 实体卡激活与保号教程", description: "首次插卡、漫游设置、官方 App、故障排查与实名登记。", icon: HahaSimWireframeIcon, keywords: ["Haha", "haha SIM", "haha Travel", "实体卡", "激活", "数据漫游", "ICCID", "短信", "APN", "实名", "保号", "香港", "中港澳"] },
  { id: "one-nz", label: "One NZ", title: "One NZ 新西兰电话卡激活与保号教程", description: "0月租、免费收短信、国内5G漫游防扣费与保号指南", icon: OneNzWireframeIcon, keywords: ["One NZ", "OneNZ", "新西兰", "Vodafone", "沃达丰", "激活", "0月租", "短信免费", "mytype", "521", "充值保号", "iMessage", "关闭数据漫游"] },
  { id: "chatgpt-guide", label: "Chat Gpt", title: "ChatGPT 综合使用与保号教程", description: "账号登录、2FA 安全验证、密码管理、陌生设备剔除与防封禁指南", icon: ChatGptWireframeIcon, keywords: ["ChatGPT", "Plus", "成品号", "保号", "Codex", "客户端下载", "防封", "403", "接码", "短信验证", "节点", "Access Denied", "2FA", "改密", "安全设置"] },
] as const;

export default function TutorialsPage() {
  const { isMobile } = useMobileStorefront();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<(typeof tutorialTopics)[number]["id"]>("required");
  const [giffgaffTreeOpen, setGiffgaffTreeOpen] = useState(false);
  const [giffgaffGuide, setGiffgaffGuide] = useState<"activation" | "keeper">("activation");
  const [oneNzTreeOpen, setOneNzTreeOpen] = useState(false);
  const [oneNzGuide, setOneNzGuide] = useState<OneNzSection>("activation");
  const [chatgptGuide, setChatgptGuide] = useState<ChatGptTutorialSection>("login");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const paramTopic = params.get("topic");
    if (paramTopic && tutorialTopics.some((t) => t.id === paramTopic)) {
      setSelected(paramTopic as (typeof tutorialTopics)[number]["id"]);
      if (paramTopic === "one-nz") setOneNzTreeOpen(true);
      if (paramTopic === "giffgaff") setGiffgaffTreeOpen(true);
    }
    const paramGuide = params.get("guide");
    if (paramGuide === "activation" || paramGuide === "binding" || paramGuide === "rates") {
      setOneNzGuide(paramGuide);
    }
  }, []);

  const query = search.trim().toLocaleLowerCase();
  const matchingTopics = tutorialTopics.filter(topic => [topic.label, topic.title, topic.description, ...topic.keywords].some(text => text.toLocaleLowerCase().includes(query)));
  const topic = matchingTopics.find(item => item.id === selected) ?? matchingTopics[0] ?? tutorialTopics.find(item => item.id === selected)!;
  const showApple = matchingTopics.length > 0 && topic.id === "apple-id";
  const showGiffgaff = matchingTopics.length > 0 && topic.id === "giffgaff";
  const showOneNz = matchingTopics.length > 0 && topic.id === "one-nz";
  const resetScroll = () => { if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  return <div className={tutorial.shell}><PublicLayout mobileNavigationUntilLg viewportLocked={!isMobile} contentClassName="max-w-none px-4 py-3 md:px-6">
    <div data-testid="tutorial-workspace" className={`${tutorial.workspace} ${isMobile ? "!grid-cols-1 !h-auto !gap-3" : ""}`}>
      <aside data-testid="tutorial-navigation" className={`${glass.surface} ${styles.panel} ${tutorial.navigation} ${isMobile ? "!max-h-none !p-2.5 sticky top-[53px] z-30 bg-white/95 backdrop-blur-md shadow-xs border-b border-orange-100/90" : ""}`}>
        {isMobile ? (
          <div className="space-y-2">
            {/* 一级教程分类胶囊栏 (横向滚动，悬浮置顶冻结) */}
            <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5 touch-pan-x">
              {tutorialTopics.map(({ id, label, icon: Icon }) => {
                const current = topic.id === id && matchingTopics.length > 0;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setSelected(id);
                      setSearch("");
                      if (id === "giffgaff") setGiffgaffTreeOpen(true);
                      if (id === "one-nz") setOneNzTreeOpen(true);
                      resetScroll();
                    }}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                      current
                        ? "bg-slate-900 text-white shadow-xs"
                        : "bg-orange-50/70 text-slate-700 hover:bg-orange-100/80"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${current ? "text-orange-400" : "text-slate-500"}`} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* 如果当前分类是 Apple ID，显示二级章节小药丸 */}
            {topic.id === "apple-id" ? (
              <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-t border-orange-100/70 pt-2 touch-pan-x">
                {appleChapters.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      const heading = document.getElementById(id);
                      heading?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="inline-flex shrink-0 items-center rounded-lg border border-orange-200/60 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-2xs transition-colors active:bg-orange-50 active:text-primary"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            {/* 如果当前分类是 Chat Gpt，显示二级小药丸 */}
            {topic.id === "chatgpt-guide" ? (
              <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-t border-orange-100/70 pt-2 touch-pan-x">
                {[
                  { guide: "login", label: "登录与 2FA 验证" },
                  { guide: "security", label: "改密与安全设置" },
                  { guide: "rebind", label: "设备与 2FA 换绑" },
                  { guide: "protection", label: "防封与保号指南" },
                ].map((item) => (
                  <button
                    key={item.guide}
                    type="button"
                    onClick={() => {
                      setChatgptGuide(item.guide as any);
                      resetScroll();
                    }}
                    className={`inline-flex shrink-0 items-center rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      chatgptGuide === item.guide
                        ? "bg-primary text-white font-semibold"
                        : "bg-white text-slate-600 border border-orange-200/60"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}

            {/* 如果当前分类有子章节 (Giffgaff)，显示二级小药丸 */}
            {topic.id === "giffgaff" ? (
              <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-t border-orange-100/70 pt-2 touch-pan-x">
                {[
                  { guide: "activation", label: "实体卡激活与使用" },
                  { guide: "keeper", label: "保号助手" },
                ].map((item) => (
                  <button
                    key={item.guide}
                    type="button"
                    onClick={() => {
                      setGiffgaffGuide(item.guide as any);
                      resetScroll();
                    }}
                    className={`inline-flex shrink-0 items-center rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      giffgaffGuide === item.guide
                        ? "bg-primary text-white font-semibold"
                        : "bg-white text-slate-600 border border-orange-200/60"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}

            {/* 如果当前分类是 One NZ，显示二级小药丸 */}
            {topic.id === "one-nz" ? (
              <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-t border-orange-100/70 pt-2 touch-pan-x">
                {[
                  { guide: "activation", label: "新手插卡与防扣费" },
                  { guide: "binding", label: "App 注册绑定与查询" },
                  { guide: "rates", label: "国内漫游资费与保号" },
                ].map((item) => (
                  <button
                    key={item.guide}
                    type="button"
                    onClick={() => {
                      setOneNzGuide(item.guide as any);
                      resetScroll();
                    }}
                    className={`inline-flex shrink-0 items-center rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      oneNzGuide === item.guide
                        ? "bg-primary text-white font-semibold"
                        : "bg-white text-slate-600 border border-orange-200/60"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <label htmlFor="tutorial-search" className="text-sm font-semibold text-slate-900">搜索商品教程</label>
        )}
        <div className={isMobile ? "hidden" : "mt-3 border-t border-orange-100/70 pt-3 lg:border-0 lg:pt-0"}>
          {isMobile ? <label htmlFor="tutorial-search" className="sr-only">搜索商品教程</label> : null}
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" /><Input id="tutorial-search" value={search} onChange={event => { setSearch(event.target.value); resetScroll(); }} placeholder="输入商品 / 教程关键词" className="h-11 rounded-xl border-orange-100 bg-white/80 pl-9" /></div>
          <nav aria-label="使用教程分类" className={`${tutorial.topicList} ${isMobile ? "!grid !grid-cols-2 !gap-2 !mt-2.5" : ""}`} data-topic={topic.id}>
            {!isMobile ? <span aria-hidden="true" className={`${sidebar.indicator} ${tutorial.topicIndicator}`} data-ready="true" data-visible={matchingTopics.length > 0} /> : null}
            {tutorialTopics.map(({ id, label, icon: Icon }) => {
              const current = topic.id === id && matchingTopics.length > 0;
              const button = <button type="button" aria-current={current ? "true" : undefined} data-sidebar-current={current || undefined} className={`${tutorial.navItem} ${selection.item} ${isMobile ? `!h-10 !justify-start !rounded-xl !px-3 !text-xs border ${current ? "border-orange-300 bg-orange-50/90 font-semibold text-primary" : "border-slate-100 bg-white/80"}` : ""}`} onClick={() => {
                setSelected(id);
                setSearch("");
                if (id === "giffgaff" && !showGiffgaff) setGiffgaffTreeOpen(true);
                if (id === "one-nz" && !showOneNz) setOneNzTreeOpen(true);
                if (id !== "giffgaff") setGiffgaffTreeOpen(false);
                if (id !== "one-nz") setOneNzTreeOpen(false);
                if (isMobile && id !== "giffgaff" && id !== "one-nz") setMobileNavOpen(false);
                resetScroll();
              }}>
                <Icon className="h-4 w-4 shrink-0 md:h-5 md:w-5" aria-hidden="true" /><span className="flex-1 text-left">{label}</span>
                {id === "required" && <span className={`${styles.pill} hidden md:inline`}>必读</span>}
                {(id === "giffgaff" || id === "one-nz") && <span className={isMobile ? "inline" : "hidden md:inline"}><ChevronDown className={tutorial.chevron} aria-hidden="true" /></span>}
              </button>;
              if (id === "giffgaff") {
                return <Collapsible.Root key={id} asChild open={showGiffgaff && giffgaffTreeOpen} onOpenChange={setGiffgaffTreeOpen}><div className={`${tutorial.treeItem} min-w-0 ${isMobile ? "!col-span-2" : ""}`}><Collapsible.Trigger asChild>{button}</Collapsible.Trigger><Collapsible.Content className={tutorial.tree}><nav aria-label="Giffgaff 教程目录" className={`${tutorial.appleContents} ${tutorial.subtopics}`} data-guide={giffgaffGuide}><span aria-hidden="true" className={`${sidebar.indicator} ${tutorial.subtopicIndicator}`} data-ready="true" data-visible="true" /><button type="button" aria-current={giffgaffGuide === "activation" ? "page" : undefined} className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setGiffgaffGuide("activation"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>实体卡激活与使用</button><button type="button" aria-current={giffgaffGuide === "keeper" ? "page" : undefined} className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setGiffgaffGuide("keeper"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>保号助手</button></nav></Collapsible.Content></div></Collapsible.Root>;
              }
              if (id === "one-nz") {
                return <Collapsible.Root key={id} asChild open={showOneNz && oneNzTreeOpen} onOpenChange={setOneNzTreeOpen}><div className={`${tutorial.treeItem} min-w-0 ${isMobile ? "!col-span-2" : ""}`}><Collapsible.Trigger asChild>{button}</Collapsible.Trigger><Collapsible.Content className={tutorial.tree}><nav aria-label="One NZ 教程目录" className={`${tutorial.appleContents} ${tutorial.subtopics}`} data-guide={oneNzGuide}><span aria-hidden="true" className={`${sidebar.indicator} ${tutorial.subtopicIndicator}`} data-ready="true" data-visible="true" /><button type="button" aria-current={oneNzGuide === "activation" ? "page" : undefined} className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setOneNzGuide("activation"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>新手激活与防扣费</button><button type="button" aria-current={oneNzGuide === "binding" ? "page" : undefined} className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setOneNzGuide("binding"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>App 注册绑定与查询</button><button type="button" aria-current={oneNzGuide === "rates" ? "page" : undefined} className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setOneNzGuide("rates"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>国内漫游资费与保号</button></nav></Collapsible.Content></div></Collapsible.Root>;
              }
              return <div className="min-w-0" key={id}>{button}</div>;
            })}
          </nav>
        </div>
      </aside>
      <section data-testid="tutorial-content" className={`${glass.surface} ${styles.panel} ${tutorial.content} ${isMobile ? "!overflow-visible" : ""}`}>
        <header className={`${glass.hero} ${tutorial.header} ${isMobile ? "!px-4 !py-3.5" : ""}`}><div key={`${topic.id}-${showGiffgaff ? giffgaffGuide : showOneNz ? oneNzGuide : topic.id === "chatgpt-guide" ? chatgptGuide : ""}`} className={tutorial.topicEnter}><h1 className="text-lg font-semibold text-slate-900 sm:text-xl">{showGiffgaff ? "Giffgaff" : showOneNz ? `One NZ · ${oneNzGuide === "activation" ? "新手激活与防扣费" : oneNzGuide === "binding" ? "App 注册绑定与查询" : "国内漫游资费与保号"}` : topic.id === "chatgpt-guide" ? `Chat Gpt · ${chatgptGuide === "login" ? "登录与 2FA 验证" : chatgptGuide === "security" ? "改密与安全设置" : chatgptGuide === "rebind" ? "设备与 2FA 换绑" : "防封与保号指南"}` : topic.title}</h1>{topic.description && <p className="mt-1.5 text-xs leading-5 text-slate-500 sm:mt-2 sm:text-sm sm:leading-6">{topic.description}</p>}</div></header>
        <div ref={scrollRef} data-testid="tutorial-scroll" className={`${tutorial.scroll} overflow-y-auto ${isMobile ? "!overflow-visible !p-3.5" : ""}`} tabIndex={0} role="region" aria-label={`${topic.label}正文`}>
          <div key={matchingTopics.length ? `${topic.id}-${showGiffgaff ? giffgaffGuide : showOneNz ? oneNzGuide : topic.id === "chatgpt-guide" ? chatgptGuide : ""}` : "empty"} className={tutorial.topicEnter}>
          {!matchingTopics.length ? <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-4 text-center"><p className="font-medium text-slate-700">暂无匹配教程</p><p className="max-w-full break-words text-sm text-slate-500">没有找到与“{search.trim()}”相关的内容。</p><Button variant="outline" onClick={() => { setSearch(""); resetScroll(); }}>清空搜索</Button></div> : topic.id === "binance" ? <BinanceTutorial /> : showApple ? <AppleIdTutorial /> : topic.id === "giffgaff" ? giffgaffGuide === "activation" ? <GiffgaffActivationTutorial /> : <GiffgaffTutorial /> : topic.id === "haha-sim" ? <HahaSimTutorial /> : topic.id === "one-nz" ? <OneNzTutorial activeSection={oneNzGuide} onSelectSection={setOneNzGuide} /> : topic.id === "chatgpt-guide" ? <ChatGptAccountGuideTutorial activeSection={chatgptGuide} onSelectSection={setChatgptGuide} /> : <div className="space-y-7">
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
