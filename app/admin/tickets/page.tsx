"use client";

import React, { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Headphones,
  Image as ImageIcon,
  Mail,
  MessageCircle,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Upload,
  User,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import AdminPageShell from "@/components/admin/AdminPageShell";
import { AdminListSurface, AdminTableViewport } from "@/components/admin/v2/AdminList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  TICKET_TYPES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  clearLegacyLocalTickets,
  type TicketAttachment,
  type TicketItem,
  type TicketMessage,
  type TicketStatus,
  type TicketType,
  type TicketPriority,
} from "@/lib/tickets/types";

type AdminTicketTab = "all" | "processing" | "completed" | "flagged";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function AdminTicketsPage() {
  const searchParams = useSearchParams();
  const initialUrlTicketId = searchParams.get("ticket") || searchParams.get("ticketId") || null;
  const initialUrlQuery = searchParams.get("q") || "";
  const rawInitialTab = searchParams.get("tab");
  const initialTab: AdminTicketTab =
    rawInitialTab === "processing" || rawInitialTab === "completed" || rawInitialTab === "flagged"
      ? rawInitialTab
      : "all";
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(initialUrlTicketId);
  const [activeTab, setActiveTab] = useState<AdminTicketTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState(initialUrlQuery);

  // 回复表单状态
  const [replyText, setReplyText] = useState("");
  const [replyImages, setReplyImages] = useState<string[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<TicketAttachment[]>([]);
  const [markAsCompleted, setMarkAsCompleted] = useState(true);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabBtnRefs = useRef<Record<AdminTicketTab, HTMLButtonElement | null>>({
    all: null,
    processing: null,
    completed: null,
    flagged: null,
  });
  const [sliderStyle, setSliderStyle] = useState<{ left: number; width: number }>({ left: 4, width: 108 });
  const [leftColWidth, setLeftColWidth] = useState<number>(384);

  const updateTabGeometry = useCallback(() => {
    const bar = tabBarRef.current;
    const activeBtn = tabBtnRefs.current[activeTab];
    if (bar && activeBtn) {
      setSliderStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
      });
      setLeftColWidth(Math.max(320, Math.round(bar.getBoundingClientRect().width)));
    }
  }, [activeTab]);

  const loadTicketsFromServer = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingTickets(true);
    try {
      clearLegacyLocalTickets();
      const response = await fetch("/api/admin/tickets", { cache: "no-store" });
      if (!response.ok) {
        if (!quiet) toast.error("工单列表加载失败，请刷新重试");
        return;
      }
      const data = (await response.json()) as { tickets?: TicketItem[] };
      const loaded = Array.isArray(data.tickets) ? data.tickets : [];
      setTickets(loaded);
      setSelectedTicketId((prev) => {
        if (prev && loaded.some((t) => t.id === prev)) return prev;
        return loaded.length > 0 ? loaded[0].id : null;
      });
    } catch {
      if (!quiet) toast.error("工单列表加载失败，请稍后重试");
    } finally {
      if (!quiet) setLoadingTickets(false);
    }
  }, []);

  // 初始化从服务端数据库加载真实工单（电脑端与手机端实时同步，不再读取本地假数据）
  useEffect(() => {
    void loadTicketsFromServer();
  }, [loadTicketsFromServer]);

  useEffect(() => {
    const paramTicket = searchParams.get("ticket") || searchParams.get("ticketId");
    const paramQuery = searchParams.get("q");
    const paramTab = searchParams.get("tab");
    if (paramTab === "all" || paramTab === "processing" || paramTab === "completed" || paramTab === "flagged") {
      setActiveTab(paramTab);
    }
    if (paramQuery !== null) {
      setSearchQuery(paramQuery);
    }
    if (paramTicket && tickets.some((item) => item.id === paramTicket)) {
      setSelectedTicketId(paramTicket);
    }
  }, [searchParams, tickets]);

  // 通知侧边栏和控制台刷新未处理徽章
  const syncAdminTicketsState = (newTickets: TicketItem[]) => {
    setTickets(newTickets);
    try {
      window.dispatchEvent(new Event("jianlian-admin-badges-updated"));
    } catch {}
  };

  // 当前选中工单
  const currentTicket = useMemo(() => {
    return tickets.find((t) => t.id === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentTicket?.messages.length]);

  // 统计指标
  const stats = useMemo(() => {
    const processing = tickets.filter((t) => t.status === "processing").length;
    const completed = tickets.filter((t) => t.status === "completed").length;
    const flagged = tickets.filter((t) => Boolean(t.isFlagged)).length;
    const urgent = tickets.filter((t) => t.priority === "urgent" || t.priority === "emergency").length;
    return {
      all: tickets.length,
      total: tickets.length,
      processing,
      completed,
      flagged,
      urgent,
    };
  }, [tickets]);

  useIsomorphicLayoutEffect(() => {
    updateTabGeometry();
    const bar = tabBarRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(updateTabGeometry);
    ro.observe(bar);
    window.addEventListener("resize", updateTabGeometry);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateTabGeometry);
    };
  }, [updateTabGeometry, stats.all, stats.processing, stats.completed, stats.flagged]);

  // 过滤工单
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (activeTab === "processing" && t.status !== "processing") return false;
      if (activeTab === "completed" && t.status !== "completed") return false;
      if (activeTab === "flagged" && !t.isFlagged) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = t.id.toLowerCase().includes(q);
        const matchEmail = t.email.toLowerCase().includes(q);
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchOrder = t.orderNo?.toLowerCase().includes(q) ?? false;
        if (!matchId && !matchEmail && !matchTitle && !matchOrder) return false;
      }
      return true;
    });
  }, [tickets, activeTab, searchQuery]);

  // 时间格式化
  const getNowFormatted = () => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  // 粘贴图片支持 (Ctrl+V)
  const handlePasteImages = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) continue;
        if (file.size > 4 * 1024 * 1024) {
          toast.error("粘贴的截图不能超过 4MB");
          continue;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          if (base64) {
            setReplyImages((prev) => (prev.length < 6 ? [...prev, base64] : prev));
            toast.success("已粘贴图片附件");
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // 上传图片或文件附件
  const handleAttachmentFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`附件 ${file.name} 超过 5MB 限制`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (!base64) return;
        if (file.type.startsWith("image/")) {
          setReplyImages((prev) => (prev.length < 6 ? [...prev, base64] : prev));
          toast.success(`已添加图片：${file.name}`);
        } else {
          setReplyAttachments((prev) =>
            prev.length < 6
              ? [...prev, { name: file.name, url: base64, mimeType: file.type || "application/octet-stream", size: file.size }]
              : prev
          );
          toast.success(`已添加文件附件：${file.name}`);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  // 管理员发送官方答复（自动转换为已解决/已处理状态，实时写入服务端数据库）
  const handleAdminReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentTicket || submittingReply) return;
    const text = replyText.trim();
    if (!text && replyImages.length === 0 && replyAttachments.length === 0) {
      toast.error("请输入官方答复内容或添加图片/文件附件");
      return;
    }

    setSubmittingReply(true);
    try {
      const response = await fetch("/api/admin/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: currentTicket.id,
          content: text,
          images: replyImages.length > 0 ? replyImages : undefined,
          attachments: replyAttachments.length > 0 ? replyAttachments : undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        tickets?: TicketItem[];
      };
      if (!response.ok || !Array.isArray(payload.tickets)) {
        toast.error(payload.error || "发送官方答复失败，请重试");
        return;
      }
      syncAdminTicketsState(payload.tickets);
      setReplyText("");
      setReplyImages([]);
      setReplyAttachments([]);
      toast.success(`答复已发送，工单【${currentTicket.id}】状态已自动更新为「已处理」！`);
    } catch {
      toast.error("网络异常，发送官方答复失败");
    } finally {
      setSubmittingReply(false);
    }
  };

  // 切换工单标记状态（用于收录进“标记”选项卡，实时同步服务端）
  const handleToggleFlag = async () => {
    if (!currentTicket) return;
    const nextFlag = !currentTicket.isFlagged;
    try {
      const response = await fetch("/api/admin/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: currentTicket.id,
          isFlagged: nextFlag,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        tickets?: TicketItem[];
      };
      if (!response.ok || !Array.isArray(payload.tickets)) {
        toast.error(payload.error || "更新标记状态失败");
        return;
      }
      syncAdminTicketsState(payload.tickets);
      toast.success(nextFlag ? "已标记此工单（已收录至「标记」选项卡）" : "已取消对该工单的标记");
    } catch {
      toast.error("网络异常，更新标记状态失败");
    }
  };

  // 快速切换结单/处理中状态
  const handleToggleStatus = async () => {
    if (!currentTicket) return;
    const nextStatus: TicketStatus = currentTicket.status === "completed" ? "processing" : "completed";
    try {
      const response = await fetch("/api/admin/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: currentTicket.id,
          status: nextStatus,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        tickets?: TicketItem[];
      };
      if (!response.ok || !Array.isArray(payload.tickets)) {
        toast.error(payload.error || "更新工单状态失败");
        return;
      }
      syncAdminTicketsState(payload.tickets);
      toast.success(nextStatus === "completed" ? "已将工单标记为已解决归档" : "已将工单恢复为处理中");
    } catch {
      toast.error("网络异常，更新工单状态失败");
    }
  };

  const handleCopy = (val: string, label: string) => {
    navigator.clipboard?.writeText(val);
    toast.success(`已复制 ${label}`);
  };

  return (
    <AdminPageShell
      title="工单处理中心"
      description="统一处理前台用户提交的订单售后、充值异常、账号咨询与接口对接工单，12 小时内快速答复并闭环解决。"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        {/* 顶部 Tab 切换与搜索栏（带精确 DOM 测量的丝滑滑动指示器：全部工单 · 待处理 · 已处理 · 标记） */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-3">
          <div
            ref={tabBarRef}
            className="relative flex rounded-2xl bg-slate-100/90 p-1 border border-slate-200/80 shadow-2xs"
          >
            {/* 动态平滑滑动的白色高光药丸背景指示器（按实际按钮宽度精确对齐） */}
            <div
              className="pointer-events-none absolute top-1 bottom-1 rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                left: `${sliderStyle.left}px`,
                width: `${sliderStyle.width}px`,
              }}
            />

            {/* 1. 全部工单 */}
            <button
              ref={(el) => { tabBtnRefs.current.all = el; }}
              type="button"
              onClick={() => setActiveTab("all")}
              className={cn(
                "relative z-10 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors duration-200 cursor-pointer whitespace-nowrap",
                activeTab === "all"
                  ? "text-slate-900 font-black"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              <span>全部工单</span>
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-slate-200 px-1.5 text-[10px] text-slate-700 font-mono font-bold">
                {stats.all}
              </span>
            </button>

            {/* 2. 待处理（红色） */}
            <button
              ref={(el) => { tabBtnRefs.current.processing = el; }}
              type="button"
              onClick={() => setActiveTab("processing")}
              className={cn(
                "relative z-10 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors duration-200 cursor-pointer whitespace-nowrap",
                activeTab === "processing"
                  ? "text-red-600 font-black"
                  : "text-slate-600 hover:text-red-600"
              )}
            >
              <Clock className="h-3.5 w-3.5 shrink-0 text-red-500" />
              <span>待处理</span>
              <span
                className={cn(
                  "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-mono font-bold",
                  stats.processing > 0 ? "bg-red-500 text-white" : "bg-slate-200 text-slate-600"
                )}
              >
                {stats.processing}
              </span>
            </button>

            {/* 3. 已处理（绿色） */}
            <button
              ref={(el) => { tabBtnRefs.current.completed = el; }}
              type="button"
              onClick={() => setActiveTab("completed")}
              className={cn(
                "relative z-10 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors duration-200 cursor-pointer whitespace-nowrap",
                activeTab === "completed"
                  ? "text-emerald-600 font-black"
                  : "text-slate-600 hover:text-emerald-600"
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span>已处理</span>
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-100 text-emerald-700 px-1.5 text-[10px] font-mono font-bold">
                {stats.completed}
              </span>
            </button>

            {/* 4. 标记（黄色，始终预留数量位置并固定最小宽度，避免标记与取消标记跳动） */}
            <button
              ref={(el) => { tabBtnRefs.current.flagged = el; }}
              type="button"
              onClick={() => setActiveTab("flagged")}
              className={cn(
                "relative z-10 flex min-w-[92px] items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors duration-200 cursor-pointer whitespace-nowrap",
                activeTab === "flagged"
                  ? "text-amber-600 font-black"
                  : "text-slate-600 hover:text-amber-600"
              )}
            >
              <Bookmark className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>标记</span>
              <span
                className={cn(
                  "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-mono font-bold transition-colors",
                  stats.flagged > 0 ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-600"
                )}
              >
                {stats.flagged}
              </span>
            </button>
          </div>

          {/* 搜索框 */}
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索工单号 / 邮箱 / 标题"
              className="h-9 rounded-xl border-slate-200/90 pl-9 pr-8 text-xs bg-white shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 主体两栏客服处理工作台（左侧宽度精确对齐顶部「标记」选项卡容器右边界，剩余空间全部给右侧内容框） */}
        <AdminListSurface className="flex-1 min-h-[500px] flex flex-col p-0 overflow-hidden">
          <div
            style={{ ["--ticket-left-width" as string]: `${leftColWidth}px` }}
            className="grid grid-cols-1 lg:grid-cols-[var(--ticket-left-width)_minmax(0,1fr)] flex-1 h-full min-h-[500px]"
          >
            {/* 左侧：工单列表栏 */}
            <div className="border-r border-slate-100 flex flex-col h-full overflow-hidden bg-slate-50/40">
              <div className="p-3 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700 shrink-0">
                <span>工单列表 ({filteredTickets.length})</span>
                <button
                  type="button"
                  onClick={() => void loadTicketsFromServer()}
                  disabled={loadingTickets}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                  title="刷新服务端工单列表"
                >
                  <RefreshCw className={cn("h-3 w-3", loadingTickets && "animate-spin")} />
                  <span>{loadingTickets ? "同步中..." : "刷新"}</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
                {loadingTickets && filteredTickets.length === 0 ? (
                  <div className="flex h-64 flex-col items-center justify-center text-center p-4">
                    <RefreshCw className="h-6 w-6 text-slate-300 mb-2 animate-spin" />
                    <p className="text-xs font-semibold text-slate-500">正在同步服务端工单...</p>
                  </div>
                ) : filteredTickets.length === 0 ? (
                  <div className="flex h-64 flex-col items-center justify-center text-center p-4">
                    <Headphones className="h-8 w-8 text-slate-300 mb-2" />
                    <p className="text-xs font-semibold text-slate-600">暂无匹配的工单</p>
                  </div>
                ) : (
                  filteredTickets.map((t) => {
                    const isSelected = selectedTicketId === t.id;
                    const typeObj = TICKET_TYPES.find((item) => item.value === t.type);
                    const prioObj = TICKET_PRIORITIES.find((p) => p.value === t.priority);
                    const statusObj = TICKET_STATUSES.find((s) => s.value === t.status);

                    return (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTicketId(t.id)}
                        className={cn(
                          "cursor-pointer rounded-xl p-3 transition-all",
                          isSelected
                            ? "bg-white shadow-sm ring-1 ring-orange-200 border-l-4 border-l-primary"
                            : "hover:bg-white/80"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-mono text-[11px] font-bold text-slate-900 truncate">
                            {t.id}
                          </span>
                          <div className="flex items-center gap-1">
                            {t.isFlagged && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800 border border-amber-300">
                                标记
                              </span>
                            )}
                            <span className={cn("rounded px-1.5 py-0.2 text-[10px] font-bold border", statusObj?.badgeClass)}>
                              {statusObj?.label}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs font-bold text-slate-800 line-clamp-1 mb-1">
                          {t.title}
                        </div>

                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1.5">
                          <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate">{t.email}</span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100/60">
                          <span className="rounded bg-slate-100 px-1 py-0.2 text-slate-600 font-medium">
                            {typeObj?.label}
                          </span>
                          <span className={cn("rounded px-1 py-0.2 font-semibold border", prioObj?.color)}>
                            {prioObj?.label}
                          </span>
                          <span className="font-mono">{t.updatedAt.slice(5, 16)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 右侧：工单详情与客服回复工作区 */}
            <div className="min-w-0 flex flex-col h-full overflow-hidden bg-white">
              {currentTicket ? (
                <div
                  onPaste={handlePasteImages}
                  className="flex flex-col h-full overflow-hidden"
                >
                  {/* 工单头部状态栏 */}
                  <div className="p-4 border-b border-slate-100 bg-slate-50/30 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-slate-900">
                          {currentTicket.id}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(currentTicket.id, "工单编号")}
                          className="text-slate-400 hover:text-slate-600"
                          title="复制工单号"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-xs font-bold",
                            TICKET_STATUSES.find((s) => s.value === currentTicket.status)?.badgeClass
                          )}
                        >
                          {TICKET_STATUSES.find((s) => s.value === currentTicket.status)?.label}
                        </span>
                        {currentTicket.isFlagged && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 border border-amber-300">
                            已标记
                          </span>
                        )}
                        {currentTicket.priority === "urgent" || currentTicket.priority === "emergency" ? (
                          <span className="rounded bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200">
                            加急件
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span>客户邮箱：<strong className="text-slate-800 font-mono">{currentTicket.email}</strong></span>
                        {currentTicket.orderNo && (
                          <span>关联订单：<strong className="text-slate-800 font-mono">{currentTicket.orderNo}</strong></span>
                        )}
                        <span>提交时间：{currentTicket.createdAt}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleToggleStatus}
                        className={cn(
                          "rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                          currentTicket.status === "completed"
                            ? "border-slate-300 text-slate-700 hover:bg-slate-100"
                            : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        )}
                      >
                        {currentTicket.status === "completed" ? "恢复处理中" : "标记已解决"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleToggleFlag}
                        className={cn(
                          "w-[104px] justify-center rounded-xl text-xs font-bold transition-all",
                          currentTicket.isFlagged
                            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            : "text-slate-700 hover:bg-slate-100"
                        )}
                      >
                        <Bookmark className={cn("h-3.5 w-3.5 mr-1.5 shrink-0", currentTicket.isFlagged ? "fill-amber-500 text-amber-500" : "text-slate-400")} />
                        <span>{currentTicket.isFlagged ? "取消标记" : "标记工单"}</span>
                      </Button>
                    </div>
                  </div>

                  {/* 消息对话与用户原始诉求 */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
                    {/* 问题摘要卡片 */}
                    <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-3.5">
                      <div className="font-bold text-slate-900 mb-1 text-sm">{currentTicket.title}</div>
                      <p className="whitespace-pre-wrap text-slate-700 leading-relaxed text-xs">
                        {currentTicket.description}
                      </p>

                      {currentTicket.images && currentTicket.images.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {currentTicket.images.map((img, i) => (
                            <img
                              key={i}
                              src={img}
                              alt="截图"
                              onClick={() => setPreviewImage(img)}
                              className="h-16 w-16 cursor-zoom-in rounded-xl border border-orange-200 object-cover hover:scale-105 transition-transform"
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 对话沟通历史 */}
                    <div className="space-y-3 pt-2">
                      <div className="text-[11px] font-bold text-slate-400">沟通处理进度</div>
                      {currentTicket.messages.map((msg) => {
                        const isSupport = msg.sender === "support";
                        return (
                          <div
                            key={msg.id}
                            className={cn("flex flex-col", isSupport ? "items-end" : "items-start")}
                          >
                            <div className="mb-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                              <span className={cn("font-bold", isSupport ? "text-primary" : "text-slate-700")}>
                                {isSupport ? "官方客服（我方）" : `客户（${msg.senderName}）`}
                              </span>
                              <span>{msg.createdAt}</span>
                            </div>

                            <div
                              className={cn(
                                "max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-2xs",
                                isSupport
                                  ? "bg-slate-900 text-white rounded-tr-xs"
                                  : "border border-slate-200 bg-slate-50/90 text-slate-800 rounded-tl-xs"
                              )}
                            >
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                              {msg.images && msg.images.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {msg.images.map((img, i) => (
                                    <img
                                      key={i}
                                      src={img}
                                      alt="截图"
                                      onClick={() => setPreviewImage(img)}
                                      className="h-14 w-14 cursor-zoom-in rounded-lg object-cover border border-white/20"
                                    />
                                  ))}
                                </div>
                              )}
                              {msg.attachments && msg.attachments.length > 0 && (
                                <div className="mt-2 space-y-1.5">
                                  {msg.attachments.map((att, i) => (
                                    <a
                                      key={i}
                                      href={att.url}
                                      download={att.name}
                                      className={cn(
                                        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                                        isSupport
                                          ? "border-white/20 bg-white/10 text-white hover:bg-white/20"
                                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                                      )}
                                    >
                                      <FileText className="h-3.5 w-3.5 shrink-0" />
                                      <span className="truncate max-w-[200px]">{att.name}</span>
                                      <Download className="ml-auto h-3 w-3 shrink-0 opacity-75" />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  </div>

                  {/* 官方答复输入底栏（支持 Ctrl+V 粘贴图片与上传图片/文件） */}
                  <form
                    onSubmit={handleAdminReply}
                    className="p-3.5 border-t border-slate-100 bg-slate-50/40 shrink-0 space-y-2.5"
                  >
                    <Textarea
                      rows={3}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onPaste={handlePasteImages}
                      placeholder="输入官方处理结果、答复方案或操作指引（支持直接 Ctrl+V 粘贴截图，或点击左下方添加图片/文件附件）..."
                      className="rounded-xl border-slate-200 bg-white text-xs shadow-none resize-none"
                    />

                    {(replyImages.length > 0 || replyAttachments.length > 0) && (
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {replyImages.map((img, i) => (
                          <div
                            key={`img-${i}`}
                            className="group relative h-12 w-12 overflow-hidden rounded-lg border border-orange-200 bg-white"
                          >
                            <img
                              src={img}
                              alt="待发图片"
                              onClick={() => setPreviewImage(img)}
                              className="h-full w-full cursor-zoom-in object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => setReplyImages((prev) => prev.filter((_, idx) => idx !== i))}
                              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/65 text-white hover:bg-black"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                        {replyAttachments.map((att, i) => (
                          <div
                            key={`att-${i}`}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700"
                          >
                            <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="max-w-[160px] truncate">{att.name}</span>
                            <button
                              type="button"
                              onClick={() => setReplyAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                              className="ml-1 text-slate-400 hover:text-rose-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-slate-600 hover:text-primary transition-colors">
                          <Paperclip className="h-3.5 w-3.5" />
                          <span>添加图片/文件</span>
                          <input
                            type="file"
                            multiple
                            accept="image/*,.pdf,.txt,.csv,.zip,.json,.doc,.docx,.xls,.xlsx"
                            onChange={handleAttachmentFiles}
                            className="hidden"
                          />
                        </label>
                        <span className="text-xs text-slate-500 font-medium">
                          💡 发送官方答复后，此工单处理状态将<strong className="text-emerald-700 font-bold">自动转换为「已处理」</strong>
                        </span>
                      </div>

                      <Button
                        type="submit"
                        disabled={
                          submittingReply ||
                          (!replyText.trim() && replyImages.length === 0 && replyAttachments.length === 0)
                        }
                        size="sm"
                        className="gap-1.5 rounded-xl bg-primary text-white font-bold text-xs px-5 shadow-xs hover:bg-primary/90"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {submittingReply ? "发送中..." : "发送官方答复"}
                      </Button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-slate-400">
                  <Headphones className="h-10 w-10 mb-2 text-slate-300" />
                  <p className="text-xs font-semibold text-slate-600">请选择左侧工单进行查看与回复</p>
                </div>
              )}
            </div>
          </div>
        </AdminListSurface>
      </div>

      {/* 图片 Lightbox 预览 Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-white p-2 shadow-2xl">
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={previewImage}
              alt="大图预览"
              className="max-h-[85vh] max-w-[85vw] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
