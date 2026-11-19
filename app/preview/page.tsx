"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  ExternalLink,
  Laptop,
  Lock,
  Maximize2,
  Monitor,
  RefreshCw,
  RotateCw,
  Search,
  Share,
  Smartphone,
  Sparkles,
  SplitSquareVertical,
  Square,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type DeviceCategory = "phone" | "laptop" | "desktop";

interface DevicePreset {
  id: string;
  name: string;
  category: DeviceCategory;
  width: number;
  height: number;
  safariContentHeight?: number; // Safari 真实可用内容高度 (扣除状态栏与 Safari 底栏)
  tag: string;
  description: string;
  isUserDevice?: boolean;
}

const DEVICE_PRESETS: DevicePreset[] = [
  // 手机 3 热门尺寸
  {
    id: "phone-promax",
    name: "iPhone 13 Pro Max (自用机)",
    category: "phone",
    width: 430,
    height: 932,
    safariContentHeight: 782, // 932 - 48(顶状态栏) - 102(Safari底栏) = 782px
    tag: "430 × 932",
    description: "用户自用 13 Pro Max 真实基准 (图1、图2现场实机)",
    isUserDevice: true,
  },
  {
    id: "phone-13",
    name: "iPhone 13/14/15 标屏",
    category: "phone",
    width: 390,
    height: 844,
    safariContentHeight: 708,
    tag: "390 × 844",
    description: "主流 6.1 寸标准屏",
  },
  {
    id: "phone-se",
    name: "iPhone SE / 小屏",
    category: "phone",
    width: 375,
    height: 667,
    safariContentHeight: 560,
    tag: "375 × 667",
    description: "经典 4.7 寸紧凑小屏 / 小视口边界测试",
  },

  // 笔记本尺寸
  {
    id: "laptop-1366",
    name: "经典笔记本 (16:9)",
    category: "laptop",
    width: 1366,
    height: 768,
    tag: "1366 × 768",
    description: "主流低分屏 / 14-15寸标准商务本 (已完成遮挡修复)",
  },
  {
    id: "laptop-1440",
    name: "轻薄本 / MacBook Air",
    category: "laptop",
    width: 1440,
    height: 900,
    tag: "1440 × 900",
    description: "16:10 视网膜轻薄本 / Windows 125% 缩放标准",
  },

  // 桌面 1K & 2K 尺寸
  {
    id: "desktop-1k",
    name: "桌面 1K 全高清 (Full HD)",
    category: "desktop",
    width: 1920,
    height: 1080,
    tag: "1920 × 1080",
    description: "目前桌面显示器最主流 1080P 标准",
  },
  {
    id: "desktop-2k",
    name: "桌面 2K (QHD)",
    category: "desktop",
    width: 2560,
    height: 1440,
    tag: "2560 × 1440",
    description: "高端办公 / 电竞 2K 大屏超宽视野",
  },
];

const QUICK_PAGES = [
  { label: "📱 图1: Apple ID 商品列表", path: "/products/digital-accounts?category=apple-id" },
  { label: "🏠 商城首页", path: "/" },
  { label: "📘 Google 换区教程", path: "/tutorials?topic=google-region" },
  { label: "📶 国际电话卡", path: "/products/sim-cards" },
  { label: "🤖 AI会员充值", path: "/products/ai-membership" },
  { label: "🎁 礼品卡充值卡", path: "/products/gift-cards" },
  { label: "📚 全部使用教程", path: "/tutorials" },
  { label: "👤 登录 / 注册", path: "/login" },
];

export default function ResponsiveStudioPage() {
  // 默认直接选中用户的 iPhone 13 Pro Max 自用机！
  const [selectedDevice, setSelectedDevice] = useState<DevicePreset>(DEVICE_PRESETS[0]);
  const [showSafariChrome, setShowSafariChrome] = useState(true); // 真实 Safari 仿真外壳
  const [isLandscape, setIsLandscape] = useState(false);
  // 默认直接打开图 1 的 Apple ID 商品列表！
  const [currentPath, setCurrentPath] = useState("/products/digital-accounts?category=apple-id");
  const [inputUrl, setInputUrl] = useState("/products/digital-accounts?category=apple-id");
  const [scaleMode, setScaleMode] = useState<"auto" | number>("auto");
  const [calculatedScale, setCalculatedScale] = useState(1);
  const [isMultiView, setIsMultiView] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);

  // 实际视口计算 (考虑横竖屏与 Safari 顶底栏)
  const activeWidth = useMemo(() => {
    if (selectedDevice.category === "phone" && isLandscape) {
      return selectedDevice.height;
    }
    return selectedDevice.width;
  }, [selectedDevice, isLandscape]);

  const activeHeight = useMemo(() => {
    if (selectedDevice.category === "phone" && isLandscape) {
      return selectedDevice.width;
    }
    return selectedDevice.height;
  }, [selectedDevice, isLandscape]);

  // iframe 内容实际可用高度
  const iframeContentHeight = useMemo(() => {
    if (selectedDevice.category === "phone" && showSafariChrome && selectedDevice.safariContentHeight && !isLandscape) {
      return selectedDevice.safariContentHeight;
    }
    return activeHeight;
  }, [selectedDevice, showSafariChrome, activeHeight, isLandscape]);

  // 自适应缩放比例计算
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const availableW = rect.width - 48;
      const availableH = rect.height - 48;

      if (scaleMode === "auto") {
        const totalFrameHeight = activeHeight + (selectedDevice.category === "phone" ? 40 : 0);
        const scaleX = availableW / activeWidth;
        const scaleY = availableH / totalFrameHeight;
        const fitScale = Math.min(scaleX, scaleY, 1);
        setCalculatedScale(Number(fitScale.toFixed(2)));
      } else {
        setCalculatedScale(scaleMode);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [scaleMode, activeWidth, activeHeight, isMultiView, selectedDevice]);

  const handleRefresh = () => {
    setIframeKey((k) => k + 1);
    toast.success("页面已重新加载");
  };

  const handleApplyUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let target = inputUrl.trim();
    if (!target.startsWith("/")) {
      if (target.startsWith("http://") || target.startsWith("https://")) {
        // ok
      } else {
        target = "/" + target;
      }
    }
    setCurrentPath(target);
    setIframeKey((k) => k + 1);
  };

  const handleCopyLink = () => {
    const fullUrl = `${window.location.origin}${currentPath}`;
    navigator.clipboard.writeText(fullUrl);
    toast.success("已复制当前页面链接：" + fullUrl);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* 顶部主控制条 */}
      <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 backdrop-blur-md">
        {/* 左侧：Logo & 返回商城 */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
            title="退出模拟器，返回全屏商城"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>返回商城</span>
          </Link>

          <div className="h-4 w-px bg-slate-800" />

          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-500/20 text-orange-400">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-bold tracking-tight text-white sm:text-sm">
              多端响应式模拟工作室
            </span>
            <span className="hidden rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-bold text-orange-400 md:inline">
              13 Pro Max 1:1 真机仿真
            </span>
          </div>
        </div>

        {/* 中间：网址切换 & 快速页面 */}
        <div className="flex max-w-xl flex-1 items-center justify-center px-4">
          <form onSubmit={handleApplyUrl} className="relative flex w-full items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="输入页面路径，例如 /products/digital-accounts?category=apple-id"
              className="h-8 w-full rounded-lg border border-slate-700 bg-slate-950/70 pl-8 pr-16 text-xs text-slate-200 transition-all focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <button
              type="submit"
              className="absolute right-1 h-6 rounded-md bg-orange-600 px-2 text-[11px] font-medium text-white transition-colors hover:bg-orange-500"
            >
              前往
            </button>
          </form>
        </div>

        {/* 右侧：单屏/多屏切换 & 快捷操作 */}
        <div className="flex items-center gap-2">
          {/* 模式切换 */}
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5">
            <button
              type="button"
              onClick={() => setIsMultiView(false)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                !isMultiView ? "bg-orange-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              )}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>单端拟真</span>
            </button>
            <button
              type="button"
              onClick={() => setIsMultiView(true)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                isMultiView ? "bg-orange-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              )}
            >
              <SplitSquareVertical className="h-3.5 w-3.5" />
              <span>多屏并列</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            title="刷新 iframe 内容"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            title="复制当前页面完整链接"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>

          <a
            href={currentPath}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            title="在新标签页独立打开此页面"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      {/* 二级工具栏：设备选择 & 快速跳转页面 */}
      <div className="z-20 flex h-11 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/60 px-4 text-xs">
        {/* 设备选择选项卡 */}
        {!isMultiView ? (
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
            <span className="mr-1 text-[11px] font-bold text-slate-400">预设设备：</span>
            {DEVICE_PRESETS.map((d) => {
              const isSelected = selectedDevice.id === d.id;
              const Icon = d.category === "phone" ? Smartphone : d.category === "laptop" ? Laptop : Monitor;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDevice(d)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all",
                    isSelected
                      ? "border-orange-500 bg-orange-500/20 text-orange-300 shadow-sm"
                      : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  )}
                  title={`${d.name} (${d.width}×${d.height}): ${d.description}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{d.name}</span>
                  {d.isUserDevice ? (
                    <span className="rounded bg-orange-500/40 px-1 text-[9px] font-bold text-orange-200">
                      自用真机
                    </span>
                  ) : null}
                  <span className={cn("text-[10px]", isSelected ? "text-orange-400 font-bold" : "text-slate-400")}>
                    {d.tag}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-300">
            <span className="font-semibold text-orange-400">多屏并列视图：</span>
            <span>📱 13 Pro Max (430) ＋ 💻 笔记本 (1366) ＋ 🖥️ 桌面 (1920) 实时同屏渲染对比</span>
          </div>
        )}

        {/* 快捷页面跳转与缩放控制 */}
        <div className="flex items-center gap-3">
          {/* 快捷页面标签 */}
          <div className="hidden items-center gap-1 xl:flex">
            <span className="text-[11px] text-slate-400">快速场景：</span>
            {QUICK_PAGES.slice(0, 4).map((p) => (
              <button
                key={p.path}
                type="button"
                onClick={() => {
                  setInputUrl(p.path);
                  setCurrentPath(p.path);
                  setIframeKey((k) => k + 1);
                }}
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] transition-colors",
                  currentPath === p.path
                    ? "bg-orange-500/25 font-bold text-orange-300"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* 真实 Safari 仿真开关 (仅手机) */}
          {!isMultiView && selectedDevice.category === "phone" ? (
            <button
              type="button"
              onClick={() => setShowSafariChrome(!showSafariChrome)}
              className={cn(
                "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors",
                showSafariChrome
                  ? "border-orange-500/40 bg-orange-500/20 font-bold text-orange-300"
                  : "border-slate-800 text-slate-400 hover:text-white"
              )}
              title="切换是否显示真机 Safari 顶栏与底栏工具条"
            >
              <Compass className="h-3 w-3" />
              <span>{showSafariChrome ? "Safari 仿真开启" : "仅无边框内容"}</span>
            </button>
          ) : null}

          {/* 手机旋转 */}
          {!isMultiView && selectedDevice.category === "phone" ? (
            <button
              type="button"
              onClick={() => setIsLandscape(!isLandscape)}
              className={cn(
                "flex items-center gap-1 rounded-md border border-slate-800 px-2 py-1 text-[11px] transition-colors",
                isLandscape ? "border-orange-500/40 bg-orange-500/20 text-orange-300" : "text-slate-400 hover:text-white"
              )}
              title="切换横屏 / 竖屏"
            >
              <RotateCw className="h-3 w-3" />
              <span>{isLandscape ? "横屏" : "竖屏"}</span>
            </button>
          ) : null}

          {/* 缩放选择 */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-400">缩放：</span>
            <select
              value={typeof scaleMode === "number" ? String(scaleMode) : "auto"}
              onChange={(e) => {
                const val = e.target.value;
                setScaleMode(val === "auto" ? "auto" : Number(val));
              }}
              className="h-6 rounded-md border border-slate-700 bg-slate-950 px-1 text-[11px] text-slate-300 focus:outline-none"
            >
              <option value="auto">自适应 ({Math.round(calculatedScale * 100)}%)</option>
              <option value="1">100% 原始尺寸</option>
              <option value="0.85">85%</option>
              <option value="0.75">75%</option>
              <option value="0.6">60%</option>
              <option value="0.5">50%</option>
              <option value="0.4">40%</option>
            </select>
          </div>
        </div>
      </div>

      {/* 主预览画布区域 */}
      <main
        ref={containerRef}
        className="relative flex-1 overflow-auto bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] p-6"
      >
        {!isMultiView ? (
          /* 单设备拟真视图 */
          <div className="flex min-h-full min-w-full items-center justify-center">
            <div
              style={{
                width: `${activeWidth}px`,
                height: `${activeHeight}px`,
                transform: `scale(${calculatedScale})`,
                transformOrigin: "center center",
                transition: "transform 0.15s ease-out, width 0.2s ease-out, height 0.2s ease-out",
              }}
              className="relative shrink-0"
            >
              {/* 设备拟真外框 */}
              {selectedDevice.category === "phone" ? (
                /* iPhone 手机真实外框 (含真实 Safari 顶栏与底栏) */
                <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[52px] border-[12px] border-slate-800 bg-[#f9fafb] shadow-[0_25px_80px_-15px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.15)] ring-1 ring-slate-700/60">
                  {/* 1. iOS 顶部状态栏 (Status Bar: 47px) */}
                  <div className="relative z-30 flex h-[47px] shrink-0 items-center justify-between bg-white px-7 text-slate-900 select-none">
                    <span className="text-[13px] font-bold tracking-tight">10:20</span>
                    {/* 灵动岛 / 听筒 */}
                    <div className="absolute top-2.5 left-1/2 -translate-x-1/2 flex items-center justify-center">
                      <div className="h-6 w-28 rounded-full bg-black shadow-inner flex items-center justify-end pr-2.5">
                        <div className="h-2.5 w-2.5 rounded-full bg-slate-950 ring-1 ring-slate-800" />
                      </div>
                    </div>
                    {/* 右侧信号与电池 */}
                    <div className="flex items-center gap-1.5 text-[11px] font-bold">
                      <Wifi className="h-3 w-3" />
                      <span>5G</span>
                      <span className="ml-0.5 rounded-sm bg-slate-900 px-1 py-0.2 text-[9px] text-white">87%</span>
                    </div>
                  </div>

                  {/* 2. 真实网页可视内容 (iframe: 782px) */}
                  <div
                    style={{ height: `${iframeContentHeight}px` }}
                    className="relative w-full overflow-hidden bg-white"
                  >
                    <iframe
                      key={`${iframeKey}-${selectedDevice.id}`}
                      src={`${currentPath}${currentPath.includes("?") ? "&" : "?"}previewWidth=${activeWidth}`}
                      className="h-full w-full border-0"
                      title={selectedDevice.name}
                    />
                  </div>

                  {/* 3. 真实 Safari 底部导航栏 (底栏: 103px) */}
                  {showSafariChrome && !isLandscape ? (
                    <div className="relative z-30 flex flex-1 flex-col justify-between border-t border-slate-200/80 bg-[#f8f9fa] px-5 pt-2 pb-2 text-slate-700 select-none">
                      {/* Safari 地址胶囊 */}
                      <div className="mx-auto flex h-9 w-[92%] items-center justify-between rounded-xl bg-white px-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-slate-200/70">
                        <span className="text-xs font-semibold text-slate-400">AA</span>
                        <div className="flex items-center gap-1 text-xs font-medium text-slate-800">
                          <Lock className="h-3 w-3 text-slate-500" />
                          <span>jianlian.shop</span>
                        </div>
                        <button type="button" onClick={handleRefresh} title="刷新页面">
                          <RefreshCw className="h-3 w-3 text-slate-500 hover:text-slate-800" />
                        </button>
                      </div>

                      {/* Safari 底部 5 个操作按钮 */}
                      <div className="flex items-center justify-between px-2 pt-1 text-slate-600">
                        <ChevronLeft className="h-5 w-5" />
                        <ChevronRight className="h-5 w-5 text-slate-300" />
                        <Share className="h-4.5 w-4.5" />
                        <Compass className="h-4.5 w-4.5" />
                        <Square className="h-4 w-4" />
                      </div>

                      {/* 底部横条 Home Indicator */}
                      <div className="mx-auto h-1 w-36 rounded-full bg-slate-900 mt-1" />
                    </div>
                  ) : (
                    /* 极简底部指示横条 */
                    <div className="flex h-5 shrink-0 items-center justify-center bg-white">
                      <div className="h-1 w-32 rounded-full bg-slate-400" />
                    </div>
                  )}
                </div>
              ) : selectedDevice.category === "laptop" ? (
                /* 笔记本外框 */
                <div className="relative flex h-full w-full flex-col rounded-t-2xl border-[12px] border-b-[20px] border-slate-800 bg-slate-900 shadow-[0_30px_90px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.1)]">
                  {/* 顶部摄像头与麦克风 */}
                  <div className="absolute -top-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-700" />
                    <div className="h-2 w-2 rounded-full bg-slate-950 ring-1 ring-slate-700" />
                  </div>
                  {/* 屏幕内容 iframe */}
                  <div className="relative h-full w-full overflow-hidden rounded-sm bg-white">
                    <iframe
                      key={`${iframeKey}-${selectedDevice.id}`}
                      src={`${currentPath}${currentPath.includes("?") ? "&" : "?"}previewWidth=0`}
                      className="h-full w-full border-0"
                      title={selectedDevice.name}
                    />
                  </div>
                  {/* 笔记本底部铝合金开槽与底座阴影 */}
                  <div className="absolute -bottom-4 left-1/2 h-3.5 w-40 -translate-x-1/2 rounded-b-lg bg-slate-700 shadow-md flex items-center justify-center">
                    <div className="h-1 w-16 rounded-full bg-slate-800" />
                  </div>
                </div>
              ) : (
                /* 桌面显示器外框 */
                <div className="relative flex h-full w-full flex-col rounded-xl border-[10px] border-b-[18px] border-slate-800 bg-slate-900 shadow-[0_30px_100px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.1)]">
                  {/* 屏幕内容 iframe */}
                  <div className="relative h-full w-full overflow-hidden rounded-sm bg-white">
                    <iframe
                      key={`${iframeKey}-${selectedDevice.id}`}
                      src={`${currentPath}${currentPath.includes("?") ? "&" : "?"}previewWidth=0`}
                      className="h-full w-full border-0"
                      title={selectedDevice.name}
                    />
                  </div>
                  {/* 显示器底座与支架 */}
                  <div className="absolute -bottom-8 left-1/2 h-8 w-24 -translate-x-1/2 bg-gradient-to-b from-slate-700 to-slate-800 shadow-lg" />
                  <div className="absolute -bottom-11 left-1/2 h-3 w-64 -translate-x-1/2 rounded-full bg-slate-800 shadow-2xl ring-1 ring-slate-700" />
                </div>
              )}

              {/* 悬浮设备参数标签 */}
              <div className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900/90 px-3 py-1 text-[11px] font-medium text-slate-300 shadow-lg backdrop-blur-md ring-1 ring-slate-800">
                {selectedDevice.name} · {activeWidth} × {activeHeight} (Safari可视: {iframeContentHeight}px) · 缩放：{Math.round(calculatedScale * 100)}%
              </div>
            </div>
          </div>
        ) : (
          /* 多屏并列对比视图 (13 Pro Max 430 + 笔记本 1366 + 桌面 1920) */
          <div className="flex min-h-full items-start justify-center gap-8 py-4">
            {/* 1. 手机屏 (13 Pro Max) */}
            <div className="flex flex-col items-center">
              <div className="mb-2 text-xs font-bold text-orange-400">📱 iPhone 13 Pro Max (自用机 · 430×932)</div>
              <div
                style={{
                  width: "430px",
                  height: "932px",
                  transform: `scale(${calculatedScale * 0.9})`,
                  transformOrigin: "top center",
                }}
                className="overflow-hidden rounded-[44px] border-[10px] border-slate-800 bg-white shadow-2xl"
              >
                <iframe
                  key={`multi-promax-${iframeKey}`}
                  src={`${currentPath}${currentPath.includes("?") ? "&" : "?"}previewWidth=430`}
                  className="h-full w-full border-0"
                  title="iPhone 13 Pro Max Preview"
                />
              </div>
            </div>

            {/* 2. 笔记本屏 */}
            <div className="flex flex-col items-center">
              <div className="mb-2 text-xs font-bold text-amber-400">💻 笔记本标屏 (1366×768 · 遮挡已修复)</div>
              <div
                style={{
                  width: "1366px",
                  height: "768px",
                  transform: `scale(${calculatedScale * 0.55})`,
                  transformOrigin: "top center",
                }}
                className="overflow-hidden rounded-t-xl border-[10px] border-b-[18px] border-slate-800 bg-white shadow-2xl"
              >
                <iframe
                  key={`multi-laptop-${iframeKey}`}
                  src={`${currentPath}${currentPath.includes("?") ? "&" : "?"}previewWidth=0`}
                  className="h-full w-full border-0"
                  title="Laptop Preview"
                />
              </div>
            </div>

            {/* 3. 桌面 1K */}
            <div className="flex flex-col items-center">
              <div className="mb-2 text-xs font-bold text-sky-400">🖥️ 桌面 1K 显示器 (1920×1080)</div>
              <div
                style={{
                  width: "1920px",
                  height: "1080px",
                  transform: `scale(${calculatedScale * 0.4})`,
                  transformOrigin: "top center",
                }}
                className="overflow-hidden rounded-xl border-[10px] border-slate-800 bg-white shadow-2xl"
              >
                <iframe
                  key={`multi-desktop-${iframeKey}`}
                  src={`${currentPath}${currentPath.includes("?") ? "&" : "?"}previewWidth=0`}
                  className="h-full w-full border-0"
                  title="Desktop 1K Preview"
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
