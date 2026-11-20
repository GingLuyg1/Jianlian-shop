"use client";

import { useEffect, useRef, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
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
  X,
} from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import { useMobileStorefront } from "@/hooks/use-mobile-storefront";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { openPublicSupport } from "@/lib/support/open-public-support";
import BinanceTutorial from "@/components/account/BinanceTutorial";
import GiffgaffTutorial from "@/components/account/GiffgaffTutorial";
import GiffgaffActivationTutorial from "@/components/account/GiffgaffActivationTutorial";
import HahaSimTutorial from "@/components/account/HahaSimTutorial";
import OneNzTutorial, { type OneNzSection } from "@/components/account/OneNzTutorial";
import ChatGptAccountGuideTutorial, { type ChatGptTutorialSection } from "@/components/account/ChatGptAccountGuideTutorial";
import AppleIdTutorial, { appleChapters } from "@/components/account/AppleIdTutorial";
import GoogleRegionTutorial from "@/components/account/GoogleRegionTutorial";
import FacebookTutorial from "@/components/account/FacebookTutorial";
import TwitterTutorial, { type TwitterSection } from "@/components/account/TwitterTutorial";
import {
  AppleWireframeIcon,
  BinanceWireframeIcon,
  ChatGptWireframeIcon,
  GiffgaffWireframeIcon,
  HahaSimWireframeIcon,
  OneNzWireframeIcon,
  GoogleWireframeIcon,
  FacebookWireframeIcon,
  TwitterWireframeIcon,
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
  { id: "one-nz", label: "One NZ", title: "新西兰 One NZ 电话卡教程", description: "0月租、免费收短信、国内5G漫游防扣费与保号指南", icon: OneNzWireframeIcon, keywords: ["One NZ", "OneNZ", "新西兰", "已激活使用与账户绑定教程", "卡使用指南与常见问题", "Vodafone", "沃达丰", "激活", "0月租", "短信免费", "mytype", "mynum", "521", "充值保号", "iMessage", "关闭数据漫游"] },
  { id: "chatgpt-guide", label: "Chat Gpt", title: "ChatGPT 综合使用与保号教程", description: "账号登录、2FA 安全验证、密码管理、陌生设备剔除、防封禁与官方解封申诉指南", icon: ChatGptWireframeIcon, keywords: ["ChatGPT", "Plus", "成品号", "保号", "Codex", "客户端下载", "防封", "403", "接码", "短信验证", "节点", "Access Denied", "2FA", "改密", "安全设置", "解封", "申诉", "账号解封", "账号停用", "身份验证错误", "OpenAI申诉", "撤销警告"] },
  { id: "google-region", label: "Google", title: "Google · 修改 Google 账号国家区域教程", description: "Google 账号服务条款归属地、Play 商店锁区改区与绑定境外卡完整教程", icon: GoogleWireframeIcon, keywords: ["Google", "谷歌", "Google账号", "改区", "换区", "Play商店", "Google Play", "美国", "美区", "免税州", "绑卡", "虚拟信用卡", "境外银行卡", "服务条款", "关联地区", "关闭支付资料"] },
  { id: "facebook", label: "Facebook", title: "Facebook · 账号与 2FA 登录教程", description: "Facebook 账号卡密格式解析、2FA 双重身份验证码获取与安全登录全流程指引", icon: FacebookWireframeIcon, keywords: ["Facebook", "FB", "脸书", "2FA", "两步验证", "TOTP", "双重认证", "UID", "账号", "登录", "尝试其他方法", "身份验证应用程序", "2fa.cn", "2fa.show", "2fa.live", "2fa.web-ai.top", "验证码", "养号", "防封"] },
  { id: "twitter", label: "X (Twitter)", title: "X (Twitter) 账号使用与管理教程", description: "X Token 电脑免密直登、2FA 两步动态验证码安全登录、以及修改密码后重新提取最新 Token 全流程指引", icon: TwitterWireframeIcon, keywords: ["X", "Twitter", "推特", "Token", "auth_token", "X Token", "X 2fa", "2FA", "两步验证", "重新获取Token", "改密", "修改密码", "插件登录", "Cookie", "Application", "F12", "开发者工具"] },
] as const;

function getTutorialTitleMeta({
  topicId,
  giffgaffGuide,
  oneNzGuide,
  chatgptGuide,
  twitterGuide,
}: {
  topicId: string;
  giffgaffGuide: "activation" | "keeper";
  oneNzGuide: OneNzSection;
  chatgptGuide: ChatGptTutorialSection;
  twitterGuide: TwitterSection;
}) {
  switch (topicId) {
    case "twitter": {
      const subTitle =
        twitterGuide === "x-token"
          ? "X Token 使用教程(仅电脑)"
          : twitterGuide === "x-2fa"
          ? "X 2fa 使用教程(手机/电脑)"
          : "X 修改密码后重新获取Token";
      const desc =
        twitterGuide === "x-token"
          ? "电脑端通过 Chrome / Edge 扩展或控制台代码一键免密注入登录，避开密码风控"
          : twitterGuide === "x-2fa"
          ? "手机或电脑使用两步验证 (TOTP) 动态 6 位验证码安全登录全流程"
          : "在推特修改密码后，通过 F12 开发者工具重新提取最新 40 位 auth_token 会话凭证";
      return {
        mainTitle: "X (Twitter) 使用教程",
        subTitle,
        desc,
      };
    }
    case "facebook":
      return {
        mainTitle: "Facebook 使用教程",
        subTitle: "FB通过2FA的登录教程",
        desc: "Facebook 账号卡密格式解析、2FA 双重身份验证码获取与安全登录全流程指引",
      };
    case "google-region":
      return {
        mainTitle: "Google 使用教程",
        subTitle: "Google 账号修改国家/地区完整指南",
        desc: "Google 账号服务条款归属地、Play 商店地区区分与锁定海外全套指南",
      };
    case "one-nz": {
      const isUsage = oneNzGuide === "usage" || oneNzGuide === "activation" || oneNzGuide === "binding";
      return {
        mainTitle: "新西兰 One NZ 使用教程",
        subTitle: isUsage ? "已激活使用与账户绑定教程" : "卡使用指南与常见问题",
        desc: isUsage
          ? "0月租、免费收短信、国内5G漫游防扣费设置与 My One NZ App 账户绑定"
          : "日常使用技巧、资费明细、每年 10 纽币充值保号规则及常见卡点排查",
      };
    }
    case "chatgpt-guide": {
      const subMap: Record<ChatGptTutorialSection, { title: string; desc: string }> = {
        login: { title: "登录与 2FA 验证", desc: "ChatGPT 账号基础登录、2FA 两步动态验证码获取与多设备兼容操作" },
        security: { title: "改密与安全设置", desc: "修改账户登录密码、增强会话安全性与官方安全设置指南" },
        rebind: { title: "设备与 2FA 换绑", desc: "剔除陌生异地设备登录态、重置或换绑两步身份验证器" },
        "anti-ban": { title: "防封与保号指南", desc: "纯净网络环境、规避 OpenAI 节点风控与长期保号技巧" },
        unban: { title: "账号解封申诉教程", desc: "遭遇误封或警告时的官方申诉模板与成功解封全流程" },
      };
      const cur = subMap[chatgptGuide] || subMap.login;
      return {
        mainTitle: "ChatGPT 使用教程",
        subTitle: cur.title,
        desc: cur.desc,
      };
    }
    case "giffgaff": {
      const isAct = giffgaffGuide === "activation";
      return {
        mainTitle: "Giffgaff 教程",
        subTitle: isAct ? "实体卡激活与使用" : "保号助手",
        desc: isAct
          ? "英国原生 SIM 卡激活、充值、首插使用与国内漫游收短信全流程"
          : "利用极小流量（约 120 KB）快速完成一次网络请求，轻松维持 6 个月活跃保号",
      };
    }
    case "haha-sim":
      return {
        mainTitle: "Haha SIM 电话卡教程",
        subTitle: "Haha SIM 实体卡激活与保号教程",
        desc: "首次插卡、漫游设置、官方 App、故障排查与实名登记",
      };
    case "apple-id":
      return {
        mainTitle: "Apple ID 使用教程",
        subTitle: "账号登录与卡密格式说明",
        desc: "仅登录 App Store、密保问题与答案填写、避免 iCloud 锁机安全指南",
      };
    case "binance":
      return {
        mainTitle: "币安教程",
        subTitle: "币安 · USDT 交易教程",
        desc: "Binance 注册、C2C 快捷购买 USDT 与 BEP20 充值网络提现流程",
      };
    case "required":
    default:
      return {
        mainTitle: "使用必读",
        subTitle: "购买与交付指南",
        desc: "先核对商品适用范围与交付说明，减少订单信息填写错误，保障交易安全",
      };
  }
}

function ScrollProgressFab({
  isMobile,
  previewWidth,
  mobilePreview,
}: {
  isMobile: boolean;
  previewWidth?: number | null;
  mobilePreview?: boolean;
}) {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? Math.min(100, Math.max(0, (scrollY / docHeight) * 100)) : 0;
      setScrollProgress(progress);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (scrollProgress / 100) * circumference;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      data-testid="tutorial-scroll-top-btn"
      style={
        mobilePreview && previewWidth
          ? { right: `calc(50% - ${previewWidth / 2}px + 20px)`, bottom: "24px" }
          : { right: "20px", bottom: "24px" }
      }
      className={cn(
        "fixed z-40 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-lg shadow-slate-900/10 border border-orange-200/80 backdrop-blur-md transition-all active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        scrollProgress > 2 ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none",
      )}
      aria-label="回到顶部"
      title={`已阅读 ${Math.round(scrollProgress)}%，点击回到顶部`}
    >
      <svg className="absolute inset-0 h-full w-full -rotate-90 pointer-events-none" viewBox="0 0 44 44">
        <circle
          cx="22"
          cy="22"
          r={radius}
          stroke="#fed7aa"
          strokeWidth="2.5"
          fill="none"
          className="opacity-50"
        />
        <circle
          cx="22"
          cy="22"
          r={radius}
          stroke="#df7334"
          strokeWidth="2.5"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-150"
        />
      </svg>
      <ArrowUp className="h-4 w-4 text-primary relative z-10" />
    </button>
  );
}

export default function TutorialsPage() {
  const { isMobile, previewWidth, mobilePreview } = useMobileStorefront();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<(typeof tutorialTopics)[number]["id"]>("required");
  const [expandAllOpen, setExpandAllOpen] = useState(false);
  const [giffgaffTreeOpen, setGiffgaffTreeOpen] = useState(false);
  const [giffgaffGuide, setGiffgaffGuide] = useState<"activation" | "keeper">("activation");
  const [oneNzTreeOpen, setOneNzTreeOpen] = useState(false);
  const [oneNzGuide, setOneNzGuide] = useState<OneNzSection>("usage");
  const [chatgptTreeOpen, setChatgptTreeOpen] = useState(false);
  const [chatgptGuide, setChatgptGuide] = useState<ChatGptTutorialSection>("login");
  const [twitterTreeOpen, setTwitterTreeOpen] = useState(false);
  const [twitterGuide, setTwitterGuide] = useState<TwitterSection>("x-token");
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
      if (paramTopic === "chatgpt-guide") setChatgptTreeOpen(true);
      if (paramTopic === "twitter") setTwitterTreeOpen(true);
    }
    const paramGuide = params.get("guide");
    if (paramGuide === "usage" || paramGuide === "activation" || paramGuide === "binding") {
      setOneNzGuide("usage");
    } else if (paramGuide === "guide" || paramGuide === "rates") {
      setOneNzGuide("guide");
    } else if (paramGuide === "login" || paramGuide === "security" || paramGuide === "rebind" || paramGuide === "anti-ban" || paramGuide === "unban") {
      setChatgptGuide(paramGuide);
    } else if (paramGuide === "x-token" || paramGuide === "x-2fa" || paramGuide === "x-renew-token") {
      setTwitterGuide(paramGuide);
    }
  }, []);

  const query = search.trim().toLocaleLowerCase();
  const matchingTopics = tutorialTopics.filter(topic => [topic.label, topic.title, topic.description, ...topic.keywords].some(text => text.toLocaleLowerCase().includes(query)));
  const topic = matchingTopics.find(item => item.id === selected) ?? matchingTopics[0] ?? tutorialTopics.find(item => item.id === selected)!;
  const showGiffgaff = matchingTopics.length > 0 && topic.id === "giffgaff";
  const showOneNz = matchingTopics.length > 0 && topic.id === "one-nz";
  const showChatgpt = matchingTopics.length > 0 && topic.id === "chatgpt-guide";
  const showTwitter = matchingTopics.length > 0 && topic.id === "twitter";
  const resetScroll = () => { if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  const titleMeta = getTutorialTitleMeta({
    topicId: topic.id,
    giffgaffGuide,
    oneNzGuide,
    chatgptGuide,
    twitterGuide,
  });
  return <div className={tutorial.shell}><PublicLayout mobileNavigationUntilLg viewportLocked={!isMobile} contentClassName={isMobile ? "max-w-none !pt-2 !px-3 pb-6" : "max-w-none px-4 py-3 md:px-6"}>
    <div data-testid="tutorial-workspace" className={`${tutorial.workspace} ${isMobile ? "!block !h-auto !space-y-3 !overflow-visible" : ""}`}>
      <aside data-testid="tutorial-navigation" className={cn(glass.surface, styles.panel, tutorial.navigation, isMobile && "!max-h-none !overflow-visible !p-2 !sticky !top-[65px] !z-30 bg-white/95 backdrop-blur-md shadow-xs border border-orange-100/90 rounded-2xl")}>
        {isMobile ? (
          <div className="space-y-2">
            {/* 一级教程分类胶囊栏 (横向滚动 + 右侧展开全部按钮，悬浮置顶冻结) */}
            <div className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5 touch-pan-x pr-2">
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

              {/* 右侧展开全部/收起按钮 */}
              <button
                type="button"
                onClick={() => setExpandAllOpen(!expandAllOpen)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-orange-200/90 bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-primary shadow-2xs hover:bg-orange-50 active:scale-95 transition-all"
                title={expandAllOpen ? "收起教程分类" : "展开全部教程分类"}
              >
                <span>{expandAllOpen ? "收起" : "展开全部"}</span>
                <ChevronDown className={cn("h-3 w-3 text-primary transition-transform duration-200", expandAllOpen && "rotate-180")} />
              </button>
            </div>

            {/* 展开全部在内容框内展开 (手风琴折叠面板，非弹窗) */}
            {expandAllOpen ? (
              <div className="rounded-2xl border border-orange-200/80 bg-orange-50/30 p-2.5 shadow-2xs animate-in fade-in-50 duration-150">
                <div className="grid grid-cols-2 gap-2">
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
                          setExpandAllOpen(false);
                          resetScroll();
                        }}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all active:scale-95",
                          current
                            ? "border-primary/60 bg-white font-semibold text-primary shadow-2xs ring-1 ring-primary/40"
                            : "border-slate-100 bg-white/80 text-slate-700 hover:bg-white"
                        )}
                      >
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", current ? "text-primary" : "text-slate-500")} />
                        <span className="text-xs font-bold truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* 如果当前分类是 Chat Gpt，显示二级小药丸 */}
            {topic.id === "chatgpt-guide" ? (
              <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-t border-orange-100/70 pt-2 touch-pan-x">
                {[
                  { guide: "login", label: "登录与 2FA 验证" },
                  { guide: "security", label: "改密与安全设置" },
                  { guide: "rebind", label: "设备与 2FA 换绑" },
                  { guide: "anti-ban", label: "防封与保号指南" },
                  { guide: "unban", label: "账号解封申诉教程" },
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
                  { guide: "usage", label: "已激活使用与账户绑定教程" },
                  { guide: "guide", label: "卡使用指南与常见问题" },
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

            {/* 如果当前分类是 X (Twitter)，显示二级小药丸 */}
            {topic.id === "twitter" ? (
              <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-t border-orange-100/70 pt-2 touch-pan-x">
                {[
                  { guide: "x-token", label: "X Token 使用教程(仅电脑)" },
                  { guide: "x-2fa", label: "X 2fa 使用教程(手机/电脑)" },
                  { guide: "x-renew-token", label: "X 修改密码后重新获取Token" },
                ].map((item) => (
                  <button
                    key={item.guide}
                    type="button"
                    onClick={() => {
                      setTwitterGuide(item.guide as any);
                      resetScroll();
                    }}
                    title={item.label}
                    className={`inline-flex shrink-0 items-center max-w-[210px] rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      twitterGuide === item.guide
                        ? "bg-primary text-white font-semibold"
                        : "bg-white text-slate-600 border border-orange-200/60"
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
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
                if (id === "chatgpt-guide" && !showChatgpt) setChatgptTreeOpen(true);
                if (id === "twitter" && !showTwitter) setTwitterTreeOpen(true);
                if (id !== "giffgaff") setGiffgaffTreeOpen(false);
                if (id !== "one-nz") setOneNzTreeOpen(false);
                if (id !== "chatgpt-guide") setChatgptTreeOpen(false);
                if (id !== "twitter") setTwitterTreeOpen(false);
                if (isMobile && id !== "giffgaff" && id !== "one-nz" && id !== "chatgpt-guide" && id !== "twitter") setMobileNavOpen(false);
                resetScroll();
              }}>
                <Icon className="h-4 w-4 shrink-0 md:h-5 md:w-5" aria-hidden="true" /><span className="flex-1 text-left">{label}</span>
                {id === "required" && <span className={`${styles.pill} hidden md:inline`}>必读</span>}
                {(id === "giffgaff" || id === "one-nz" || id === "chatgpt-guide" || id === "twitter") && <span className={isMobile ? "inline" : "hidden md:inline"}><ChevronDown className={tutorial.chevron} aria-hidden="true" /></span>}
              </button>;
              if (id === "giffgaff") {
                return <Collapsible.Root key={id} asChild open={showGiffgaff && giffgaffTreeOpen} onOpenChange={setGiffgaffTreeOpen}><div className={`${tutorial.treeItem} min-w-0 ${isMobile ? "!col-span-2" : ""}`}><Collapsible.Trigger asChild>{button}</Collapsible.Trigger><Collapsible.Content className={tutorial.tree}><nav aria-label="Giffgaff 教程目录" className={`${tutorial.appleContents} ${tutorial.subtopics}`} data-guide={giffgaffGuide}><span aria-hidden="true" className={`${sidebar.indicator} ${tutorial.subtopicIndicator}`} data-ready="true" data-visible="true" /><button type="button" aria-current={giffgaffGuide === "activation" ? "page" : undefined} title="实体卡激活与使用" className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setGiffgaffGuide("activation"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>实体卡激活与使用</button><button type="button" aria-current={giffgaffGuide === "keeper" ? "page" : undefined} title="保号助手" className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setGiffgaffGuide("keeper"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>保号助手</button></nav></Collapsible.Content></div></Collapsible.Root>;
              }
              if (id === "one-nz") {
                return <Collapsible.Root key={id} asChild open={showOneNz && oneNzTreeOpen} onOpenChange={setOneNzTreeOpen}><div className={`${tutorial.treeItem} min-w-0 ${isMobile ? "!col-span-2" : ""}`}><Collapsible.Trigger asChild>{button}</Collapsible.Trigger><Collapsible.Content className={tutorial.tree}><nav aria-label="One NZ 教程目录" className={`${tutorial.appleContents} ${tutorial.subtopics}`} data-guide={oneNzGuide}><span aria-hidden="true" className={`${sidebar.indicator} ${tutorial.subtopicIndicator}`} data-ready="true" data-visible="true" /><button type="button" aria-current={(oneNzGuide === "usage" || oneNzGuide === "activation" || oneNzGuide === "binding") ? "page" : undefined} title="已激活使用与账户绑定教程" className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setOneNzGuide("usage"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>已激活使用与账户绑定教程</button><button type="button" aria-current={(oneNzGuide === "guide" || oneNzGuide === "rates") ? "page" : undefined} title="卡使用指南与常见问题" className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setOneNzGuide("guide"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>卡使用指南与常见问题</button></nav></Collapsible.Content></div></Collapsible.Root>;
              }
              if (id === "chatgpt-guide") {
                return <Collapsible.Root key={id} asChild open={showChatgpt && chatgptTreeOpen} onOpenChange={setChatgptTreeOpen}><div className={`${tutorial.treeItem} min-w-0 ${isMobile ? "!col-span-2" : ""}`}><Collapsible.Trigger asChild>{button}</Collapsible.Trigger><Collapsible.Content className={tutorial.tree}><nav aria-label="ChatGPT 教程目录" className={`${tutorial.appleContents} ${tutorial.subtopics}`} data-guide={chatgptGuide}><span aria-hidden="true" className={`${sidebar.indicator} ${tutorial.subtopicIndicator}`} data-ready="true" data-visible="true" /><button type="button" aria-current={chatgptGuide === "login" ? "page" : undefined} title="登录与 2FA 验证" className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setChatgptGuide("login"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>登录与 2FA 验证</button><button type="button" aria-current={chatgptGuide === "security" ? "page" : undefined} title="改密与安全设置" className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setChatgptGuide("security"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>改密与安全设置</button><button type="button" aria-current={chatgptGuide === "rebind" ? "page" : undefined} title="设备与 2FA 换绑" className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setChatgptGuide("rebind"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>设备与 2FA 换绑</button><button type="button" aria-current={chatgptGuide === "anti-ban" ? "page" : undefined} title="防封与保号指南" className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setChatgptGuide("anti-ban"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>防封与保号指南</button><button type="button" aria-current={chatgptGuide === "unban" ? "page" : undefined} title="账号解封申诉教程" className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setChatgptGuide("unban"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>账号解封申诉教程</button></nav></Collapsible.Content></div></Collapsible.Root>;
              }
              if (id === "twitter") {
                return <Collapsible.Root key={id} asChild open={showTwitter && twitterTreeOpen} onOpenChange={setTwitterTreeOpen}><div className={`${tutorial.treeItem} min-w-0 ${isMobile ? "!col-span-2" : ""}`}><Collapsible.Trigger asChild>{button}</Collapsible.Trigger><Collapsible.Content className={tutorial.tree}><nav aria-label="X (Twitter) 教程目录" className={`${tutorial.appleContents} ${tutorial.subtopics}`} data-guide={twitterGuide}><span aria-hidden="true" className={`${sidebar.indicator} ${tutorial.subtopicIndicator}`} data-ready="true" data-visible="true" /><button type="button" aria-current={twitterGuide === "x-token" ? "page" : undefined} title="X Token 使用教程(仅电脑)" className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setTwitterGuide("x-token"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>X Token 使用教程(仅电脑)</button><button type="button" aria-current={twitterGuide === "x-2fa" ? "page" : undefined} title="X 2fa 使用教程(手机/电脑)" className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setTwitterGuide("x-2fa"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>X 2fa 使用教程(手机/电脑)</button><button type="button" aria-current={twitterGuide === "x-renew-token" ? "page" : undefined} title="X 修改密码后重新获取Token" className={`${tutorial.contentsLink} ${selection.item}`} onClick={() => { setTwitterGuide("x-renew-token"); if (isMobile) setMobileNavOpen(false); resetScroll(); }}>X 修改密码后重新获取Token</button></nav></Collapsible.Content></div></Collapsible.Root>;
              }
              return <div className="min-w-0" key={id}>{button}</div>;
            })}
          </nav>
        </div>
      </aside>
      <section data-testid="tutorial-content" className={`${glass.surface} ${styles.panel} ${tutorial.content} ${isMobile ? "!overflow-visible" : ""}`}>
        <header className={`${glass.hero} ${tutorial.header} ${isMobile ? "!px-4 !py-3.5" : ""}`}>
          <div
            key={`${topic.id}-${showGiffgaff ? giffgaffGuide : showOneNz ? oneNzGuide : topic.id === "chatgpt-guide" ? chatgptGuide : showTwitter ? twitterGuide : ""}`}
            className={tutorial.topicEnter}
          >
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl md:text-2xl">
                {titleMeta.mainTitle}
              </h1>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-primary sm:text-sm md:text-base">
                  {titleMeta.subTitle}
                </span>
              </div>
              {titleMeta.desc ? (
                <p className="mt-0.5 text-xs leading-5 text-slate-500 sm:text-sm sm:leading-6">
                  {titleMeta.desc}
                </p>
              ) : null}
            </div>
          </div>
        </header>
        <div ref={scrollRef} data-testid="tutorial-scroll" className={`${tutorial.scroll} overflow-y-auto ${isMobile ? "!overflow-visible !p-3.5" : ""}`} tabIndex={0} role="region" aria-label={`${topic.label}正文`}>
          <div key={matchingTopics.length ? `${topic.id}-${showGiffgaff ? giffgaffGuide : showOneNz ? oneNzGuide : topic.id === "chatgpt-guide" ? chatgptGuide : showTwitter ? twitterGuide : ""}` : "empty"} className={tutorial.topicEnter}>
          {!matchingTopics.length ? <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-4 text-center"><p className="font-medium text-slate-700">暂无匹配教程</p><p className="max-w-full break-words text-sm text-slate-500">没有找到与“{search.trim()}”相关的内容。</p><Button variant="outline" onClick={() => { setSearch(""); resetScroll(); }}>清空搜索</Button></div> : topic.id === "binance" ? <BinanceTutorial /> : topic.id === "apple-id" ? <AppleIdTutorial /> : topic.id === "giffgaff" ? giffgaffGuide === "activation" ? <GiffgaffActivationTutorial /> : <GiffgaffTutorial /> : topic.id === "haha-sim" ? <HahaSimTutorial /> : topic.id === "one-nz" ? <OneNzTutorial activeSection={oneNzGuide} onSelectSection={setOneNzGuide} /> : topic.id === "chatgpt-guide" ? <ChatGptAccountGuideTutorial activeSection={chatgptGuide} onSelectSection={setChatgptGuide} /> : topic.id === "google-region" ? <GoogleRegionTutorial /> : topic.id === "facebook" ? <FacebookTutorial /> : topic.id === "twitter" ? <TwitterTutorial activeSection={twitterGuide} onSelectSection={setTwitterGuide} /> : <div className="space-y-7">
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

    {/* 教程专用回到顶部环形进度浮动按钮 (右侧，不与左侧客服重叠) */}
    <ScrollProgressFab isMobile={isMobile} previewWidth={previewWidth} mobilePreview={mobilePreview} />
  </PublicLayout></div>;
}
