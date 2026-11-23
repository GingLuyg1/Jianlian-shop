"use client";

import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Clock3,
  Copy,
  FileText,
  Headphones,
  HelpCircle,
  Image as ImageIcon,
  LifeBuoy,
  MessageCircle,
  MessageSquare,
  MessageSquareQuote,
  PackageCheck,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import PublicLayout from "@/components/layout/PublicLayout";
import { publicMainPanelHeightClassName } from "@/components/layout/public-content";
import { useMobileStorefront } from "@/hooks/use-mobile-storefront";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/AccountCenter.module.css";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  type TicketType,
  type TicketPriority,
  type TicketStatus,
  type TicketMessage,
  type TicketItem,
  TICKET_TYPES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  STORAGE_KEY,
} from "@/lib/tickets/types";

// 历史测试假工单 ID 过滤器
const FAKE_DEMO_IDS = new Set(["GD-20261106-103033-3A25"]);
const INITIAL_DEMO_TICKETS: TicketItem[] = [];

export default function FAQPage() {
  const { isMobile } = useMobileStorefront();
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTabFilter, setActiveTabFilter] = useState<"all" | "processing" | "completed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // 新建工单表单
  const [formData, setFormData] = useState({
    type: "order" as TicketType,
    priority: "normal" as TicketPriority,
    orderNo: "",
    email: "",
    title: "",
    description: "",
    images: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);

  // 追加回复表单
  const [replyText, setReplyText] = useState("");
  const [replyImages, setReplyImages] = useState<string[]>([]);
  const [sendingReply, setSendingReply] = useState(false);

  // 下拉与大图预览
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 下拉弹窗点空白区域或按 ESC 自动收回
  useEffect(() => {
    if (!typeDropdownOpen && !priorityDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node | null;
      if (typeDropdownOpen && typeDropdownRef.current && !typeDropdownRef.current.contains(target)) {
        setTypeDropdownOpen(false);
      }
      if (priorityDropdownOpen && priorityDropdownRef.current && !priorityDropdownRef.current.contains(target)) {
        setPriorityDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTypeDropdownOpen(false);
        setPriorityDropdownOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [typeDropdownOpen, priorityDropdownOpen]);

  // 用户登录信息
  const [userEmail, setUserEmail] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 初始化加载工单
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 过滤开发测试用的假工单
          const cleanUserTickets = parsed.filter(
            (t: any) => t && t.id && !FAKE_DEMO_IDS.has(t.id)
          );
          if (cleanUserTickets.length !== parsed.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanUserTickets));
          }
          if (cleanUserTickets.length > 0) {
            const normalized: TicketItem[] = cleanUserTickets.map((t: any) => ({
              ...t,
              status: t.status === "completed" || t.status === "replied" ? "completed" : "processing",
            }));
            setTickets(normalized);
            setSelectedTicketId(null);
            setIsCreating(false);
            return;
          }
        }
      }
    } catch {}
    setTickets([]);
    setSelectedTicketId(null);
    setIsCreating(false);
  }, []);

  // 读取 Supabase 用户邮箱
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email;
      if (email) {
        setUserEmail(email);
        setFormData((prev) => ({ ...prev, email }));
      }
    });
  }, []);

  // 持久化存储
  const saveTickets = (newTickets: TicketItem[]) => {
    setTickets(newTickets);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newTickets));
      window.dispatchEvent(new Event("jianlian-admin-badges-updated"));
    } catch {}
  };

  // 当前选中工单
  const currentTicket = useMemo(() => {
    return tickets.find((t) => t.id === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

  // 标记未读回复为已读
  useEffect(() => {
    if (currentTicket && currentTicket.hasUnreadReply) {
      const nextTickets = tickets.map((t) =>
        t.id === currentTicket.id ? { ...t, hasUnreadReply: false } : t
      );
      saveTickets(nextTickets);
    }
  }, [currentTicket]);

  // 滚动到最新消息
  useEffect(() => {
    if (currentTicket) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentTicket?.messages.length]);

  // 统计指标
  const stats = useMemo(() => {
    const processing = tickets.filter((t) => t.status === "processing").length;
    const completed = tickets.filter((t) => t.status === "completed").length;
    const unread = tickets.filter((t) => t.hasUnreadReply).length;
    return { processing, completed, unread };
  }, [tickets]);

  // 过滤后的工单列表
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (activeTabFilter === "processing" && ticket.status !== "processing") return false;
      if (activeTabFilter === "completed" && ticket.status !== "completed") return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = ticket.id.toLowerCase().includes(q);
        const matchTitle = ticket.title.toLowerCase().includes(q);
        const matchOrder = ticket.orderNo?.toLowerCase().includes(q) ?? false;
        if (!matchId && !matchTitle && !matchOrder) return false;
      }
      return true;
    });
  }, [tickets, activeTabFilter, searchQuery]);

  // 时间格式化助手
  const getNowFormatted = () => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  // 生成工单编号 GD-YYYYMMDD-HHMMSS-XXXX
  const generateTicketId = () => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const timeStr = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `GD-${dateStr}-${timeStr}-${rand}`;
  };

  // 图片粘贴处理 (Ctrl+V)
  const handlePasteImages = (
    e: React.ClipboardEvent,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          if (file.size > 2 * 1024 * 1024) {
            toast.error("截图不能超过 2MB");
            continue;
          }
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            if (base64) {
              setter((prev) => (prev.length < 6 ? [...prev, base64] : prev));
              toast.success("已通过粘贴成功添加截图");
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  // 本地文件上传
  const handleFileInput = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (file.size > 2 * 1024 * 1024) {
        toast.error(`图片 ${file.name} 超过 2MB 限制`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          setter((prev) => (prev.length < 6 ? [...prev, base64] : prev));
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  // 提交新建工单
  const handleSubmitTicket = (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = formData.title.trim();
    const trimmedDesc = formData.description.trim();

    if (!trimmedTitle || trimmedTitle.length < 4) {
      toast.error("请填写完整的问题标题（至少4个字）");
      return;
    }
    if (!trimmedDesc || trimmedDesc.length < 10) {
      toast.error("请详细描述遇到的问题（至少10个字）");
      return;
    }

    setSubmitting(true);
    const newId = generateTicketId();
    const newTicket: TicketItem = {
      id: newId,
      title: trimmedTitle,
      type: formData.type,
      priority: formData.priority,
      status: "processing",
      orderNo: formData.orderNo.trim() || undefined,
      email: formData.email.trim() || userEmail || "未登记邮箱",
      description: trimmedDesc,
      images: formData.images,
      createdAt: getNowFormatted(),
      updatedAt: getNowFormatted(),
      hasUnreadReply: false,
      messages: [
        {
          id: `msg-${Date.now()}`,
          sender: "user",
          senderName: "我",
          content: trimmedDesc,
          images: formData.images.length > 0 ? [...formData.images] : undefined,
          createdAt: getNowFormatted(),
        },
      ],
    };

    const nextTickets = [newTicket, ...tickets];
    saveTickets(nextTickets);
    setSelectedTicketId(newId);
    setIsCreating(false);
    setSubmitting(false);

    // 重置表单
    setFormData({
      type: "order",
      priority: "normal",
      orderNo: "",
      email: userEmail,
      title: "",
      description: "",
      images: [],
    });

    toast.success("工单提交成功！客服团队将在 12 小时内为您回复。");

    // 仿真客服排查接入
    setTimeout(() => {
      setTickets((latest) => {
        const found = latest.find((t) => t.id === newId);
        if (!found) return latest;
        const autoReplyMsg: TicketMessage = {
          id: `msg-reply-${Date.now()}`,
          sender: "support",
          senderName: "Jianlian 官方客服",
          content: `您好！系统已接收到您的工单【${newId}】。客服专员已接入排查（类型：${TICKET_TYPES.find((t) => t.value === newTicket.type)?.label}），我们将在 12 小时内通过此工单及邮箱与您同步进展。`,
          createdAt: getNowFormatted(),
        };
        const updatedFound: TicketItem = {
          ...found,
          status: "processing",
          updatedAt: getNowFormatted(),
          hasUnreadReply: true,
          messages: [...found.messages, autoReplyMsg],
        };
        const res = latest.map((t) => (t.id === newId ? updatedFound : t));
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
        } catch {}
        return res;
      });
      toast.info(`您有 1 条新的客服工单回复 (${newId})`);
    }, 4500);
  };

  // 追加发送回复
  const handleSendReply = (e: FormEvent) => {
    e.preventDefault();
    if (!currentTicket || sendingReply) return;
    const text = replyText.trim();
    if (!text && replyImages.length === 0) {
      toast.error("请输入回复内容或添加截图");
      return;
    }

    setSendingReply(true);
    const newMsg: TicketMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      senderName: "我",
      content: text || "（补充附件截图）",
      images: replyImages.length > 0 ? [...replyImages] : undefined,
      createdAt: getNowFormatted(),
    };

    const updatedTicket: TicketItem = {
      ...currentTicket,
      status: "processing",
      updatedAt: getNowFormatted(),
      messages: [...currentTicket.messages, newMsg],
    };

    const nextTickets = tickets.map((t) => (t.id === currentTicket.id ? updatedTicket : t));
    saveTickets(nextTickets);
    setReplyText("");
    setReplyImages([]);
    setSendingReply(false);
    toast.success("回复已发送");
  };

  // 复制工单号
  const handleCopyId = (id: string) => {
    navigator.clipboard?.writeText(id);
    toast.success(`已复制工单号：${id}`);
  };

  return (
    <PublicLayout
      mobileNavigationUntilLg
      contentClassName={cn("mx-auto max-w-none px-4 py-3 md:px-6", isMobile && "!px-3 !pt-2 pb-6")}
    >
      <div
        data-testid="faq-glass-page"
        className={cn(
          "mx-auto flex w-full min-w-0 max-w-[1540px] flex-col gap-3.5 overflow-visible md:min-h-0 md:overflow-hidden",
          publicMainPanelHeightClassName,
          isMobile && "!h-auto !min-h-0 !overflow-visible"
        )}
      >
        {/* 1. 顶部工单中心 Header（与账号充值/推广中心一致的玻璃质感） */}
        <section className={cn(glass.surface, styles.panel, "relative shrink-0 overflow-hidden px-5 py-4")}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className={cn(glass.icon, "h-10 w-10")}>
                  <Headphones className="h-5 w-5" />
                </div>
                <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                  工单中心
                </h1>
                <span className="rounded-full border border-orange-200/80 bg-orange-50/90 px-2.5 py-0.5 text-xs font-bold text-orange-700 shadow-2xs">
                  专属售后服务通道
                </span>
              </div>
              <p className="text-xs font-medium text-slate-600">
                这里集中查看工单列表、客服回复和售后处理进度。工单会在{" "}
                <strong className="text-orange-600 font-bold">12 小时内回复</strong>
                ，后台答复后会同步更新状态。
              </p>
            </div>

            {/* 顶部指标统计徽章 */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <div className={cn(glass.inset, "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-blue-700")}>
                <span className="flex h-2 w-2 relative">
                  {stats.unread > 0 && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  )}
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                <span>未读回复 ({stats.unread})</span>
              </div>
              <div className={cn(glass.inset, "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-amber-700")}>
                <Clock className="h-3.5 w-3.5" />
                <span>处理中 ({stats.processing})</span>
              </div>
              <div className={cn(glass.inset, "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-emerald-700")}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>已完成 ({stats.completed})</span>
              </div>
            </div>
          </div>
        </section>

        {/* 2. 主体响应式一页屏工作台 */}
        <div className="flex flex-col lg:flex-row gap-3.5 flex-1 min-h-0 overflow-hidden">
          {/* 左栏：我的工单列表 (320px 黄金宽度，支持内部独立平滑滚动) */}
          <section className={cn(glass.surface, styles.panel, "w-full lg:w-[320px] shrink-0 flex flex-col p-4 h-full overflow-hidden")}>
              {/* 列表头部 */}
              <div className="mb-3 flex items-center justify-between border-b border-orange-50/80 pb-2.5 shrink-0">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">我的工单</h2>
                  <p className="text-[11px] text-muted-foreground">
                    共 {tickets.length} 条记录，{stats.unread} 条有新回复
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setIsCreating(true);
                    setSelectedTicketId(null);
                  }}
                  className={cn(
                    "gap-1 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-3 py-1 text-xs font-bold text-white shadow-sm hover:from-orange-600 hover:to-amber-600 transition-all",
                    isCreating ? "ring-2 ring-orange-300 ring-offset-1" : ""
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  新建工单
                </Button>
              </div>

              {/* 搜索框 */}
              <div className="relative mb-2.5 shrink-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索工单 / 订单号"
                  className="h-8.5 rounded-xl border border-slate-200/80 bg-white/95 pl-9 pr-8 text-xs shadow-none transition-all focus:border-primary focus:ring-1 focus:ring-primary/20"
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

              {/* 状态过滤 Tabs：滑动胶囊样式（全部 / 处理中 / 已完成） */}
              <div className="relative mb-3 flex rounded-xl bg-slate-100/80 p-0.5 text-xs font-medium text-slate-600 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTabFilter("all")}
                  className={cn(
                    "flex-1 rounded-lg py-1 text-center font-bold transition-all text-xs",
                    activeTabFilter === "all"
                      ? "bg-white text-orange-600 shadow-xs"
                      : "hover:text-slate-900"
                  )}
                >
                  全部 {tickets.length}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTabFilter("processing")}
                  className={cn(
                    "flex-1 rounded-lg py-1 text-center font-bold transition-all text-xs",
                    activeTabFilter === "processing"
                      ? "bg-white text-orange-600 shadow-xs"
                      : "hover:text-slate-900"
                  )}
                >
                  处理中 {stats.processing}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTabFilter("completed")}
                  className={cn(
                    "flex-1 rounded-lg py-1 text-center font-bold transition-all text-xs",
                    activeTabFilter === "completed"
                      ? "bg-white text-orange-600 shadow-xs"
                      : "hover:text-slate-900"
                  )}
                >
                  已完成 {stats.completed}
                </button>
              </div>

              {/* 列表条目滚动区域 */}
              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {filteredTickets.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-orange-200/80 p-4 text-center">
                    <MessageSquare className="h-7 w-7 text-orange-300 mb-1.5" />
                    <p className="text-xs font-semibold text-slate-700">暂无相关工单</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      点击右上角「新建工单」即可提交售后咨询
                    </p>
                  </div>
                ) : (
                  filteredTickets.map((ticket) => {
                    const isSelected = selectedTicketId === ticket.id && !isCreating;
                    const statusObj = TICKET_STATUSES.find((s) => s.value === ticket.status);
                    const typeObj = TICKET_TYPES.find((t) => t.value === ticket.type);

                    return (
                      <div
                        key={ticket.id}
                        onClick={() => {
                          setSelectedTicketId(ticket.id);
                          setIsCreating(false);
                        }}
                        className={cn(
                          "group relative cursor-pointer rounded-2xl border p-3 transition-all",
                          isSelected
                            ? "border-orange-400 bg-orange-50/70 shadow-xs"
                            : "border-slate-100 bg-white/70 hover:border-orange-200 hover:bg-orange-50/30"
                        )}
                      >
                        {ticket.hasUnreadReply && (
                          <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                          </span>
                        )}

                        <div className="mb-1 flex items-start justify-between gap-1.5">
                          <h3
                            className={cn(
                              "text-xs font-bold leading-snug line-clamp-1 transition-colors",
                              isSelected ? "text-orange-950 font-black" : "text-slate-800 group-hover:text-orange-600"
                            )}
                          >
                            {ticket.title}
                          </h3>
                        </div>

                        <div className="mb-2 flex items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded-md border px-1.5 py-0.2 text-[10px] font-bold",
                              statusObj?.badgeClass
                            )}
                          >
                            {statusObj?.label}
                          </span>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600">
                            {typeObj?.label}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 ml-auto truncate max-w-[110px]">
                            {ticket.updatedAt.slice(5, 16)}
                          </span>
                        </div>

                        <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-500">
                          {ticket.description}
                        </p>

                        <div className="mt-2 flex items-center justify-between border-t border-slate-100/80 pt-1.5 text-[10px] font-mono text-slate-400">
                          <span>{ticket.id}</span>
                          <span className="text-slate-500">{ticket.messages.length} 条对话</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* 中栏与右栏组合：自适应一页屏 */}
            <div className="flex-1 min-w-0 flex flex-col lg:flex-row gap-3.5 h-full overflow-hidden">
              {/* 中栏：新建工单表单 OR 工单消息互动流 */}
              <section className={cn(glass.surface, styles.panel, "flex-1 flex flex-col p-5 h-full overflow-hidden")}>
                {isCreating ? (
                  /* 新建工单表单（简洁清爽，无多余小字） */
                  <form
                    onSubmit={handleSubmitTicket}
                    onPaste={(e) => handlePasteImages(e, (imgs) => setFormData((p) => ({ ...p, images: imgs as any })))}
                    className="flex flex-col h-full overflow-hidden"
                  >
                    <div className="flex items-center justify-between border-b border-orange-50/80 pb-3 shrink-0">
                      <div>
                        <h2 className="text-base font-black text-slate-900">新建工单</h2>
                        <p className="text-xs text-muted-foreground">客服专员将在 12 小时内核验回复</p>
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                        <Send className="h-4 w-4" />
                      </div>
                    </div>

                    <div className="flex-1 space-y-3.5 overflow-y-auto py-3 pr-1 text-xs">
                      {/* 问题类型与优先级 */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div ref={typeDropdownRef} className="space-y-1 relative">
                          <Label className="text-xs font-bold text-slate-800">问题类型</Label>
                          <div
                            onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
                            className="flex h-9 w-full cursor-pointer items-center justify-between rounded-xl border border-slate-200/90 bg-white px-3 shadow-2xs hover:border-orange-300 transition-colors"
                          >
                            <span className="font-semibold text-slate-800">
                              {TICKET_TYPES.find((t) => t.value === formData.type)?.label}
                            </span>
                            <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", typeDropdownOpen ? "rotate-180 text-orange-500" : "")} />
                          </div>

                          {typeDropdownOpen && (
                            <div className="absolute left-0 top-[60px] z-20 w-full rounded-2xl border border-orange-100 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95">
                              {TICKET_TYPES.map((type) => (
                                <div
                                  key={type.value}
                                  onClick={() => {
                                    setFormData((p) => ({ ...p, type: type.value }));
                                    setTypeDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 transition-colors",
                                    formData.type === type.value
                                      ? "bg-blue-50/90 font-bold text-blue-600"
                                      : "hover:bg-slate-50 text-slate-700"
                                  )}
                                >
                                  <div>
                                    <div className="text-xs">{type.label}</div>
                                    <div className="text-[10px] text-muted-foreground">{type.desc}</div>
                                  </div>
                                  {formData.type === type.value && <Check className="h-3.5 w-3.5 text-blue-600" />}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div ref={priorityDropdownRef} className="space-y-1 relative">
                          <Label className="text-xs font-bold text-slate-800">处理优先级</Label>
                          <div
                            onClick={() => setPriorityDropdownOpen(!priorityDropdownOpen)}
                            className="flex h-9 w-full cursor-pointer items-center justify-between rounded-xl border border-slate-200/90 bg-white px-3 shadow-2xs hover:border-orange-300 transition-colors"
                          >
                            <span className="font-semibold text-slate-800">
                              {TICKET_PRIORITIES.find((p) => p.value === formData.priority)?.label}
                            </span>
                            <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", priorityDropdownOpen ? "rotate-180 text-orange-500" : "")} />
                          </div>

                          {priorityDropdownOpen && (
                            <div className="absolute left-0 top-[60px] z-20 w-full rounded-2xl border border-orange-100 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95">
                              {TICKET_PRIORITIES.map((prio) => (
                                <div
                                  key={prio.value}
                                  onClick={() => {
                                    setFormData((p) => ({ ...p, priority: prio.value }));
                                    setPriorityDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 transition-colors",
                                    formData.priority === prio.value
                                      ? "bg-blue-50/90 font-bold text-blue-600"
                                      : "hover:bg-slate-50 text-slate-700"
                                  )}
                                >
                                  <div className="text-xs font-semibold">{prio.label}</div>
                                  {formData.priority === prio.value && <Check className="h-3.5 w-3.5 text-blue-600" />}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 订单号与联系邮箱 */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="orderNo" className="text-xs font-bold text-slate-800">
                            订单号（选填）
                          </Label>
                          <Input
                            id="orderNo"
                            value={formData.orderNo}
                            onChange={(e) => setFormData((p) => ({ ...p, orderNo: e.target.value }))}
                            placeholder="如没有可不填"
                            className="h-9 rounded-xl border-slate-200/90 text-xs shadow-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="email" className="text-xs font-bold text-slate-800">
                            联系邮箱
                          </Label>
                          <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                            placeholder="用于接收工单处理进度答复通知"
                            className="h-9 rounded-xl border-slate-200/90 text-xs shadow-none"
                            required
                          />
                        </div>
                      </div>

                      {/* 问题标题 */}
                      <div className="space-y-1">
                        <Label htmlFor="title" className="text-xs font-bold text-slate-800">
                          问题标题
                        </Label>
                        <Input
                          id="title"
                          value={formData.title}
                          onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                          placeholder="例如：订单已支付但未收到激活卡密 / USDT充值未到账"
                          className="h-9 rounded-xl border-slate-200/90 text-xs shadow-none"
                          required
                        />
                      </div>

                      {/* 问题详细描述 */}
                      <div className="space-y-1">
                        <Label htmlFor="description" className="text-xs font-bold text-slate-800">
                          问题描述
                        </Label>
                        <Textarea
                          id="description"
                          rows={4}
                          value={formData.description}
                          onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                          placeholder="请详细描述遇到的问题、页面报错信息、已尝试的操作；可在当前页面直接 Ctrl+V 粘贴截图..."
                          className="rounded-xl border-slate-200/90 text-xs shadow-none resize-none"
                          required
                        />
                      </div>

                      {/* 粘贴/上传截图区域 */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-800">截图附件（支持 Ctrl+V 粘贴）</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          {formData.images.map((img, i) => (
                            <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-xl border border-orange-200">
                              <img
                                src={img}
                                alt={`附件 ${i + 1}`}
                                onClick={() => setPreviewImage(img)}
                                className="h-full w-full cursor-zoom-in object-cover"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setFormData((p) => ({
                                    ...p,
                                    images: p.images.filter((_, idx) => idx !== i),
                                  }))
                                }
                                className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ))}

                          {formData.images.length < 6 && (
                            <label className="flex h-16 w-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-orange-300 bg-orange-50/40 p-2 text-center transition-colors hover:bg-orange-100/50">
                              <Upload className="h-4 w-4 text-orange-500 mb-0.5" />
                              <span className="text-[10px] font-bold text-orange-700">点击上传/粘贴</span>
                              <span className="text-[9px] text-orange-400">最多6张 &lt;2MB</span>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(e) => handleFileInput(e, (imgs) => setFormData((p) => ({ ...p, images: imgs as any })))}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 border-t border-orange-50/80 pt-3 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsCreating(false);
                          if (tickets.length > 0) setSelectedTicketId(tickets[0].id);
                        }}
                        className="rounded-xl text-xs text-slate-600"
                      >
                        取消
                      </Button>
                      <Button
                        type="submit"
                        disabled={submitting}
                        size="sm"
                        className="gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 text-xs font-bold text-white shadow-sm hover:from-orange-600 hover:to-amber-600"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {submitting ? "提交中..." : "提交工单"}
                      </Button>
                    </div>
                  </form>
                ) : currentTicket ? (
                  /* 工单详情与双向客服沟通流 */
                  <div className="flex flex-col h-full overflow-hidden">
                    {/* 工单头部简报 */}
                    <div className="border-b border-orange-50/90 pb-3 shrink-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-orange-100/90 px-2 py-0.5 font-mono text-[11px] font-bold text-orange-800">
                            {currentTicket.id}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyId(currentTicket.id)}
                            className="text-slate-400 hover:text-slate-600"
                            title="复制工单号"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <span
                            className={cn(
                              "rounded-md border px-2 py-0.2 text-[10px] font-bold",
                              TICKET_STATUSES.find((s) => s.value === currentTicket.status)?.badgeClass
                            )}
                          >
                            {TICKET_STATUSES.find((s) => s.value === currentTicket.status)?.label}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          提交于 {currentTicket.createdAt}
                        </div>
                      </div>

                      <h2 className="mt-1.5 text-sm font-black text-slate-900 leading-snug">
                        {currentTicket.title}
                      </h2>

                      {currentTicket.orderNo && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                          <span className="text-slate-400">关联订单：</span>
                          <span className="font-mono font-medium text-slate-700">{currentTicket.orderNo}</span>
                        </div>
                      )}
                    </div>

                    {/* 消息对话列表 */}
                    <div className="flex-1 space-y-3 overflow-y-auto py-3 pr-1 text-xs">
                      {currentTicket.messages.map((msg) => {
                        const isUser = msg.sender === "user";
                        return (
                          <div
                            key={msg.id}
                            className={cn("flex flex-col", isUser ? "items-end" : "items-start")}
                          >
                            <div className="mb-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                              {!isUser && <span className="font-bold text-orange-700">{msg.senderName}</span>}
                              <span>{msg.createdAt}</span>
                              {isUser && <span className="font-bold text-slate-600">{msg.senderName}</span>}
                            </div>

                            {/* 消息气泡 */}
                            <div
                              className={cn(
                                "max-w-[85%] rounded-[18px] p-3 text-xs leading-relaxed shadow-xs",
                                isUser
                                  ? "rounded-tr-xs bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium shadow-orange-500/10"
                                  : "rounded-tl-xs border border-orange-100/80 bg-white/95 text-slate-800 shadow-slate-100"
                              )}
                            >
                              <p className="whitespace-pre-wrap">{msg.content}</p>

                              {msg.images && msg.images.length > 0 && (
                                <div className="mt-2.5 flex flex-wrap gap-2">
                                  {msg.images.map((img, i) => (
                                    <img
                                      key={i}
                                      src={img}
                                      alt={`凭证截图 ${i + 1}`}
                                      onClick={() => setPreviewImage(img)}
                                      className="h-14 w-14 cursor-zoom-in rounded-xl border border-white/60 object-cover shadow-xs hover:scale-105 transition-transform"
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* 底部追加回复输入面板 */}
                    <form
                      onSubmit={handleSendReply}
                      onPaste={(e) => handlePasteImages(e, setReplyImages)}
                      className="border-t border-orange-50/90 pt-2.5 shrink-0"
                    >
                      <div className="space-y-2">
                        <Textarea
                          rows={2}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="补充描述、反馈新情况... 可直接 Ctrl+V 粘贴截图"
                          className="rounded-xl border-slate-200/90 bg-white text-xs shadow-none resize-none"
                        />

                        {replyImages.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-0.5">
                            {replyImages.map((img, i) => (
                              <div
                                key={i}
                                className="group relative h-10 w-10 overflow-hidden rounded-lg border border-orange-200/70"
                              >
                                <img
                                  src={img}
                                  alt="回复截图"
                                  onClick={() => setPreviewImage(img)}
                                  className="h-full w-full cursor-zoom-in object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReplyImages((prev) => prev.filter((_, idx) => idx !== i))
                                  }
                                  className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/60 text-white"
                                >
                                  <X className="h-2 w-2" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-0.5">
                          <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-slate-600 hover:text-orange-600 transition-colors">
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={(e) => handleFileInput(e, setReplyImages)}
                              className="hidden"
                            />
                            <Paperclip className="h-3.5 w-3.5" />
                            <span>上传截图</span>
                          </label>

                          <Button
                            type="submit"
                            disabled={sendingReply}
                            size="sm"
                            className="gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 text-xs font-bold text-white shadow-xs hover:from-orange-600 hover:to-amber-600"
                          >
                            <Send className="h-3.5 w-3.5" />
                            {sendingReply ? "发送中..." : "发送回复"}
                          </Button>
                        </div>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div className={cn(glass.inset, "flex flex-1 flex-col items-center justify-center rounded-[22px] p-8 text-center")}>
                    <div className={cn(glass.icon, "mb-4 h-14 w-14 rounded-2xl")}>
                      <FileText className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-extrabold text-slate-900">请选择一个工单</h3>
                    <p className="mt-2 max-w-[340px] text-xs leading-relaxed text-slate-500">
                      点击左侧工单后查看聊天记录、客服回复和处理进度；需要提交新问题时点击“新建工单”。
                    </p>
                    <Button
                      type="button"
                      onClick={() => setIsCreating(true)}
                      className="mt-5 h-10 gap-1.5 rounded-full bg-gradient-to-r from-[#df7334] to-[#c85f22] px-6 text-xs font-bold text-white shadow-md shadow-orange-900/15 hover:from-[#d26728] hover:to-[#b85319]"
                    >
                      <Plus className="h-4 w-4" />
                      新建工单
                    </Button>
                  </div>
                )}
              </section>

              {/* 右栏：提交建议与处理流程指南（紧凑舒展，彻底移除冗余FAQ） */}
              <div className="lg:w-64 flex flex-col gap-3.5 shrink-0 h-full overflow-y-auto">
                {/* 提交建议 */}
                <section className={cn(glass.surface, styles.panel, "p-4 text-left")}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn(glass.icon, "h-7 w-7 rounded-lg")}>
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <h3 className="text-xs font-bold text-slate-900">提交建议</h3>
                  </div>
                  <ul className="space-y-2 text-[11px] text-slate-600 leading-relaxed list-disc list-inside">
                    <li>
                      <strong className="text-slate-800">订单问题：</strong>
                      尽量填写订单号，保留支付截图与报错提示。
                    </li>
                    <li>
                      <strong className="text-slate-800">账号售后：</strong>
                      说明购买商品、登录网络环境及具体异常。以商品详情页标注的售后范围和时效为准。
                    </li>
                    <li>
                      <strong className="text-slate-800">接口问题：</strong>
                      附上请求时间、接口路径及返回报错报文。
                    </li>
                    <li className="text-amber-800 bg-amber-50/90 p-2 rounded-xl list-none mt-2 border border-amber-200/70 font-medium shadow-2xs">
                      ⚠️ 请勿提交账号密码、私钥等敏感凭据。
                    </li>
                  </ul>
                </section>

                {/* 处理流程 */}
                <section className={cn(glass.surface, styles.panel, "p-4 text-left")}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn(glass.icon, "h-7 w-7 rounded-lg")}>
                      <Clock3 className="h-3.5 w-3.5" />
                    </div>
                    <h3 className="text-xs font-bold text-slate-900">处理流程</h3>
                  </div>

                  <div className="relative pl-3.5 space-y-3.5 before:absolute before:bottom-1 before:left-[5px] before:top-1.5 before:w-[2px] before:bg-orange-200/70">
                    <div className="relative">
                      <div className="absolute -left-3.5 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-orange-500 shadow-xs" />
                      <div className="text-[11px] font-bold text-slate-800">1. 提交工单</div>
                      <div className="text-[10px] text-slate-500">填写信息并上传相关凭据截图</div>
                    </div>

                    <div className="relative">
                      <div className="absolute -left-3.5 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-500 shadow-xs" />
                      <div className="text-[11px] font-bold text-slate-800">2. 客服核验</div>
                      <div className="text-[10px] text-slate-500">核对订单、余额扣费与调用日志</div>
                    </div>

                    <div className="relative">
                      <div className="absolute -left-3.5 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 shadow-xs" />
                      <div className="text-[11px] font-bold text-slate-800">3. 答复完成</div>
                      <div className="text-[10px] text-slate-500">12 小时内回复并更新处理结果</div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>

        {/* 3. 图片全屏 Lightbox 大图预览 Modal */}
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
      </div>
    </PublicLayout>
  );
}
