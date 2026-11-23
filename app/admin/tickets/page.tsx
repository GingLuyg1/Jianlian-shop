"use client";

import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  ExternalLink,
  Headphones,
  Mail,
  MessageCircle,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
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
  STORAGE_KEY,
  TICKET_TYPES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketItem,
  type TicketMessage,
  type TicketStatus,
  type TicketType,
  type TicketPriority,
} from "@/lib/tickets/types";

const INITIAL_DEMO_TICKETS: TicketItem[] = [
  {
    id: "GD-20261106-103033-3A25",
    title: "Jianlian Shop 普通 API 接入咨询：目录、扣款、幂等与交付",
    type: "api",
    priority: "normal",
    status: "completed",
    orderNo: "",
    email: "gac000189@gmail.com",
    description:
      "您好，我们正在接入跨境资源网普通 API (Jianlian Shop)，请协助确认以下四项技术合同：\n1. 目录读取：GET /api/open/v1/catalog/mall?search=礼品卡 会在高峰期超时，服务端最大缓存限制多大？\n2. 扣款保护：POST /api/open/v1/orders/mall 屡次扣款的 expectedAmount 是否校验折扣、会入、服务费扣除后的最终 CNY 钱包总扣款？\n3. 幂等性保障：Idempotency-Key 的保质时长及过期后行为是什么？若超时或 500，未拿到订单 ID 时，能否直接复用同一 key 重试？\n4. 订单状态追踪：请提供 GET /api/open/v1/orders/[id] 的完整响应样例，包括 deliveryFormat 字段定义。感谢协助！",
    createdAt: "2026-11-06 10:30:33",
    updatedAt: "2026-11-06 17:24:20",
    hasUnreadReply: false,
    messages: [
      {
        id: "m-1",
        sender: "user",
        senderName: "gac000189@gmail.com",
        content:
          "您好，我们正在接入跨境资源网普通 API (Jianlian Shop)，请协助确认以下四项技术合同：\n1. 目录读取：GET /api/open/v1/catalog/mall?search=礼品卡 会在 2026-11-05 23:27:43 至 23:27:56 (北京时间) 于客户端 12 秒超时边界未收到响应头。官方推荐如何小范围读取？\n2. 金额保护：POST /api/open/v1/orders/mall 校验规则与扣款上限。\n3. 幂等与重试规范：Idempotency-Key 有效期。\n4. 订单交付格式样例与多卡卡密格式。",
        createdAt: "2026-11-06 10:30:33",
      },
      {
        id: "m-2",
        sender: "support",
        senderName: "官方客服",
        content: "好的，已收到您的 API 对接咨询，技术团队正在逐项核验文档与参数规范，稍后给您详细回复。",
        createdAt: "2026-11-06 13:23:27",
      },
      {
        id: "m-3",
        sender: "support",
        senderName: "官方客服",
        content:
          "您好，技术团队已完成排查与技术方案确认：\n1. 目录读取：推荐使用 category 与 keyword 结合小分页查询，单次推荐 limit=20；\n2. 扣款安全：expectedAmount 属于严格强校验，服务端对比当前最新价格与优惠折扣后计算，若有价格变动会自动 fail-closed 并返回 PRICE_MISMATCH，绝对不会多扣余额；\n3. 幂等性：Idempotency-Key 有效期为 24 小时，网络超时请务必携带相同 key 重试；\n4. 交付结构：订单成功后 delivery 包含 items[]，每项含 cardCode 与 cardPin。已为您开启 API 沙箱调试权限，祝对接顺利！",
        createdAt: "2026-11-06 17:24:20",
      },
    ],
  },
  {
    id: "GD-20261122-140215-9F1C",
    title: "USDT 充值到账延迟咨询（交易哈希已确认）",
    type: "recharge",
    priority: "urgent",
    status: "processing",
    orderNo: "RCG-20261122-88129",
    email: "vip_buyer@outlook.com",
    description: "您好，我于下午通过 BEP20 转账 50 USDT，区块链浏览器显示已达 25 个确认数，但控制台余额尚未刷新，麻烦客服专员协助核查链上流水并入账，谢谢！",
    createdAt: "2026-11-22 14:02:15",
    updatedAt: "2026-11-22 14:02:15",
    hasUnreadReply: true,
    messages: [
      {
        id: "m-rcg-1",
        sender: "user",
        senderName: "vip_buyer@outlook.com",
        content: "您好，我于下午通过 BEP20 转账 50 USDT，区块链浏览器显示已达 25 个确认数，但控制台余额尚未刷新，麻烦客服专员协助核查链上流水并入账，谢谢！",
        createdAt: "2026-11-22 14:02:15",
      },
    ],
  },
];

type AdminTicketTab = "all" | "processing" | "completed" | "flagged";

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>("GD-20261122-140215-9F1C");
  const [activeTab, setActiveTab] = useState<AdminTicketTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // 回复表单状态
  const [replyText, setReplyText] = useState("");
  const [markAsCompleted, setMarkAsCompleted] = useState(true);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 初始化加载工单
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 归并为两态
          const normalized: TicketItem[] = parsed.map((t: any) => ({
            ...t,
            status: t.status === "completed" || t.status === "replied" ? "completed" : "processing",
          }));
          setTickets(normalized);
          if (normalized.length > 0 && !normalized.some((t) => t.id === selectedTicketId)) {
            setSelectedTicketId(normalized[0].id);
          }
          return;
        }
      }
    } catch {}
    setTickets(INITIAL_DEMO_TICKETS);
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

  // 管理员发送官方答复（自动转换为已解决/已处理状态）
  const handleAdminReply = (e: FormEvent) => {
    e.preventDefault();
    if (!currentTicket || submittingReply) return;
    const text = replyText.trim();
    if (!text) {
      toast.error("请输入官方答复内容");
      return;
    }

    setSubmittingReply(true);
    const newMsg: TicketMessage = {
      id: `admin-reply-${Date.now()}`,
      sender: "support",
      senderName: "Jianlian 官方客服",
      content: text,
      createdAt: getNowFormatted(),
    };

    // 给客户回复后，处理状态自动转换为已处理（completed）
    const updatedTicket: TicketItem = {
      ...currentTicket,
      status: "completed",
      updatedAt: getNowFormatted(),
      hasUnreadReply: true, // 前台用户端显示有未读
      messages: [...currentTicket.messages, newMsg],
    };

    const nextTickets = tickets.map((t) => (t.id === currentTicket.id ? updatedTicket : t));
    saveTickets(nextTickets);
    setReplyText("");
    setSubmittingReply(false);

    toast.success(`答复已发送，工单【${currentTicket.id}】状态已自动更新为「已处理」！`);
  };

  // 切换工单标记状态（用于收录进“标记”选项卡）
  const handleToggleFlag = () => {
    if (!currentTicket) return;
    const nextFlag = !currentTicket.isFlagged;
    const updatedTicket: TicketItem = {
      ...currentTicket,
      isFlagged: nextFlag,
      updatedAt: getNowFormatted(),
    };
    const nextTickets = tickets.map((t) => (t.id === currentTicket.id ? updatedTicket : t));
    saveTickets(nextTickets);
    toast.success(nextFlag ? "已标记此工单（已收录至「标记」选项卡）" : "已取消对该工单的标记");
  };

  // 快速切换结单/处理中状态
  const handleToggleStatus = () => {
    if (!currentTicket) return;
    const nextStatus: TicketStatus = currentTicket.status === "completed" ? "processing" : "completed";
    const updatedTicket: TicketItem = {
      ...currentTicket,
      status: nextStatus,
      updatedAt: getNowFormatted(),
    };
    const nextTickets = tickets.map((t) => (t.id === currentTicket.id ? updatedTicket : t));
    saveTickets(nextTickets);
    toast.success(nextStatus === "completed" ? "已将工单标记为已解决归档" : "已将工单恢复为处理中");
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
        {/* 顶部 Tab 切换与搜索栏（带丝滑滑动指示器：全部工单 · 待处理 · 已处理 · 标记） */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-3">
          <div className="relative flex rounded-2xl bg-slate-100/90 p-1 border border-slate-200/80 shadow-2xs">
            {/* 动态平滑滑动的白色高光药丸背景指示器 */}
            <div
              className="absolute top-1 bottom-1 rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                left:
                  activeTab === "all"
                    ? "4px"
                    : activeTab === "processing"
                    ? "calc(25% + 2px)"
                    : activeTab === "completed"
                    ? "calc(50% + 1px)"
                    : "calc(75% + 0px)",
                width: "calc(25% - 4px)",
              }}
            />

            {/* 1. 全部工单 */}
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={cn(
                "relative z-10 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors duration-200 cursor-pointer",
                activeTab === "all"
                  ? "text-slate-900 font-black"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              全部工单
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-slate-200 px-1.5 text-[10px] text-slate-700 font-mono font-bold">
                {stats.all}
              </span>
            </button>

            {/* 2. 待处理（红色） */}
            <button
              type="button"
              onClick={() => setActiveTab("processing")}
              className={cn(
                "relative z-10 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors duration-200 cursor-pointer",
                activeTab === "processing"
                  ? "text-red-600 font-black"
                  : "text-slate-600 hover:text-red-600"
              )}
            >
              <Clock className="h-3.5 w-3.5 text-red-500" />
              待处理
              {stats.processing > 0 && (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] text-white font-mono font-bold">
                  {stats.processing}
                </span>
              )}
            </button>

            {/* 3. 已处理（绿色） */}
            <button
              type="button"
              onClick={() => setActiveTab("completed")}
              className={cn(
                "relative z-10 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors duration-200 cursor-pointer",
                activeTab === "completed"
                  ? "text-emerald-600 font-black"
                  : "text-slate-600 hover:text-emerald-600"
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              已处理
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-100 text-emerald-700 px-1.5 text-[10px] font-mono font-bold">
                {stats.completed}
              </span>
            </button>

            {/* 4. 标记（黄色） */}
            <button
              type="button"
              onClick={() => setActiveTab("flagged")}
              className={cn(
                "relative z-10 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors duration-200 cursor-pointer",
                activeTab === "flagged"
                  ? "text-amber-600 font-black"
                  : "text-slate-600 hover:text-amber-600"
              )}
            >
              <Bookmark className="h-3.5 w-3.5 text-amber-500" />
              标记
              {stats.flagged > 0 && (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] text-white font-mono font-bold">
                  {stats.flagged}
                </span>
              )}
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

        {/* 主体两栏客服处理工作台（内容框置底） */}
        <AdminListSurface className="flex-1 min-h-[500px] flex flex-col p-0 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 h-full min-h-[500px]">
            {/* 左侧：工单列表栏 (4 列) */}
            <div className="lg:col-span-4 border-r border-slate-100 flex flex-col h-full overflow-hidden bg-slate-50/40">
              <div className="p-3 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700 shrink-0">
                <span>工单列表 ({filteredTickets.length})</span>
                <span className="text-[11px] font-normal text-slate-400">点击进入详情回复</span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
                {filteredTickets.length === 0 ? (
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

            {/* 右侧：工单详情与客服回复工作区 (8 列) */}
            <div className="lg:col-span-8 flex flex-col h-full overflow-hidden bg-white">
              {currentTicket ? (
                <div className="flex flex-col h-full overflow-hidden">
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
                        onClick={handleToggleFlag}
                        className={cn(
                          "rounded-xl text-xs font-bold transition-all",
                          currentTicket.isFlagged
                            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            : "text-slate-700 hover:bg-slate-100"
                        )}
                      >
                        <Bookmark className={cn("h-3.5 w-3.5 mr-1.5", currentTicket.isFlagged ? "fill-amber-500 text-amber-500" : "text-slate-400")} />
                        {currentTicket.isFlagged ? "已标记 (取消标记)" : "标记工单"}
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
                                      className="h-14 w-14 cursor-zoom-in rounded-lg object-cover"
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
                  </div>

                  {/* 官方答复输入底栏 */}
                  <form
                    onSubmit={handleAdminReply}
                    className="p-3.5 border-t border-slate-100 bg-slate-50/40 shrink-0 space-y-2.5"
                  >
                    <Textarea
                      rows={3}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="输入官方处理结果、答复方案或操作指引... 发送后客户在工单中心可即时查阅"
                      className="rounded-xl border-slate-200 bg-white text-xs shadow-none resize-none"
                    />

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-medium">
                        💡 发送官方答复后，此工单处理状态将<strong className="text-emerald-700 font-bold">自动转换为「已处理」</strong>
                      </span>

                      <Button
                        type="submit"
                        disabled={submittingReply || !replyText.trim()}
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
