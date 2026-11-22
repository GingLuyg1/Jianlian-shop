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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// 工单类型定义
type TicketType = "order" | "recharge" | "account" | "api" | "other";
type TicketPriority = "normal" | "urgent" | "emergency";
type TicketStatus = "pending_reply" | "processing" | "replied" | "completed";

const TICKET_TYPES: { value: TicketType; label: string; desc: string }[] = [
  { value: "order", label: "订单售后", desc: "未发货、卡密异常、充值未到账等" },
  { value: "recharge", label: "充值问题", desc: "余额充值、汇率计算、USDT转账未入账等" },
  { value: "account", label: "账号异常", desc: "账号密码错误、2FA失效、区域限制等" },
  { value: "api", label: "接口对接", desc: "API申请、商户密钥、加白与接口调用" },
  { value: "other", label: "其他问题", desc: "商务合作、功能建议与体验反馈" },
];

const TICKET_PRIORITIES: { value: TicketPriority; label: string; color: string }[] = [
  { value: "normal", label: "普通", color: "text-slate-600 bg-slate-100/90 border-slate-200" },
  { value: "urgent", label: "加急", color: "text-amber-700 bg-amber-50 border-amber-200/80" },
  { value: "emergency", label: "紧急", color: "text-rose-700 bg-rose-50 border-rose-200/80" },
];

const TICKET_STATUSES: { value: TicketStatus; label: string; badgeClass: string }[] = [
  { value: "pending_reply", label: "待回复", badgeClass: "bg-blue-50 text-blue-700 border-blue-200/80" },
  { value: "processing", label: "处理中", badgeClass: "bg-amber-50 text-amber-700 border-amber-200/80" },
  { value: "replied", label: "已回复", badgeClass: "bg-purple-50 text-purple-700 border-purple-200/80" },
  { value: "completed", label: "已完成", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200/80" },
];

interface TicketMessage {
  id: string;
  sender: "user" | "support";
  senderName: string;
  content: string;
  images?: string[];
  createdAt: string;
}

interface TicketItem {
  id: string; // 类似 GD-20261106-103033-3A25
  title: string;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  orderNo?: string;
  email: string;
  description: string;
  images?: string[];
  createdAt: string;
  updatedAt: string;
  hasUnreadReply?: boolean;
  messages: TicketMessage[];
}

const STORAGE_KEY = "jianlian_shop_tickets_v1";

// 官方预置真实高保真演示工单（参考图标准数据）
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
        senderName: "我",
        content:
          "您好，我们正在接入跨境资源网普通 API (Jianlian Shop)，请协助确认以下四项技术合同：\n1. 目录读取：GET /api/open/v1/catalog/mall?search=礼品卡 会在 2026-11-05 23:27:43 至 23:27:56 (北京时间) 于客户端 12 秒超时边界未收到响应头 (KUAJINGZY REQUEST TIMEOUT)。无筛选的目录响应虽 HTTP 200，读取时接近负载 256 KiB 上限。官方推荐如何小范围读取？请提供支持的分类、单商品或 SKU 查询策略。\n2. 金额保护：POST /api/open/v1/orders/mall 屡次提交的 expectedAmount 是否校验折扣、含入、服务费扣除后的最终 CNY 钱包总扣款，并保证不会超支出金数额？PRICE CHANGED 是否促使单据退买且无任何扣款？若有独立扣款上限或保价锁，请指明参数及使用方式。\n3. 幂等与重试规范：Idempotency-Key 的保质时长及过期后行为是什么？提交超时或 500、未拿到订单 ID 时，能否复用原密匙重收？若无法通过只读方式找回单据？若无此方式，请指明官方安全恢复流度及如何确认是否已扣款。\n4. 订单、交付和追递：请提供 GET /api/open/v1/orders/[id] 的完整响应样例，标注实际 CNY 扣款（及与钱包流水关系）、itemId、skuId、quantity、状态及提现到，多卡卡密提供样例，若有不同格式请标注，感谢协助！",
        createdAt: "2026-11-06 10:30:33",
      },
      {
        id: "m-2",
        sender: "support",
        senderName: "Jianlian 官方客服",
        content: "好的，已收到您的 API 对接咨询，技术团队正在逐项核验文档与参数规范，稍后给您详细回复。",
        createdAt: "2026-11-06 13:23:27",
      },
      {
        id: "m-3",
        sender: "support",
        senderName: "Jianlian 官方客服",
        content:
          "您好，技术团队已完成排查与技术方案确认：\n1. 目录读取：推荐使用 category 与 keyword 结合小分页查询，单次推荐 limit=20，避免一次性拉取全量导致网关防爬流控拦截；\n2. 扣款安全：expectedAmount 属于严格强校验，服务端对比当前最新价格与优惠折扣后计算，若有价格变动会自动 fail-closed 并返回 PRICE_MISMATCH，绝对不会多扣余额；\n3. 幂等性：Idempotency-Key 有效期为 24 小时，网络超时请务必携带相同 key 重试，系统自动返回已存在单据结果；\n4. 交付结构：订单成功后 delivery 包含 items[]，每项含 cardCode 与 cardPin。已为您开启 API 沙箱调试权限，祝对接顺利！",
        createdAt: "2026-11-06 17:24:20",
      },
    ],
  },
];

// 常见问题精选 FAQ 库（右栏折叠面板自查）
const FAQ_KNOWLEDGE_BASE = [
  {
    group: "购买与下单",
    items: [
      { q: "下单前需要确认哪些信息？", a: "请确认商品归属地区、网络环境要求、规格参数、库存以及是否为自动交付或人工处理。" },
      { q: "库存为 0 时怎么办？", a: "库存不足时请直接在工单中心提交咨询工单或联系在线客服，我们将第一时间安排采购补货。" },
    ],
  },
  {
    group: "交付与售后",
    items: [
      { q: "自动商品付款后多久到账？", a: "系统自动发货商品通常在 10 秒至 1 分钟内直发至您的“我的订单”与接收邮箱。" },
      { q: "工单处理时效是多久？", a: "工单中心提供专业技术与售后值班，所有提交的工单均保证在 12 小时内由专员核对并回复。" },
    ],
  },
  {
    group: "安全与凭据",
    items: [
      { q: "提交工单需要注意什么隐私安全？", a: "请务必不要在工单中上传您的登录密码、邮箱授权码或私有交易私钥，确保账户安全。" },
    ],
  },
];

// 高保真自定义下拉组件（100% 还原参考图 9 & 图 10 风格与轻奢触感）
function CustomTicketSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; desc?: string }[];
  onChange: (val: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  const currentOption = options.find((opt) => opt.value === value) || options[0];

  return (
    <div className="relative space-y-1.5" ref={containerRef}>
      <Label className="text-xs font-bold text-slate-800">{label}</Label>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-xl border bg-white px-3.5 text-xs font-bold text-slate-800 transition-all shadow-xs cursor-pointer",
          open
            ? "border-primary ring-2 ring-primary/20"
            : "border-slate-200/90 hover:border-slate-300"
        )}
      >
        <span>{currentOption?.label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-slate-400 transition-transform duration-200",
            open ? "rotate-180 text-primary" : ""
          )}
        />
      </button>

      {/* 展开浮层（高度复刻图9 & 图10） */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-2xl border border-slate-100 bg-white p-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.04)] backdrop-blur-xl animate-[jianlian-bubble-pop_0.2s_ease-out_forwards]">
          <div className="space-y-0.5">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all cursor-pointer",
                    isSelected
                      ? "bg-blue-50/90 text-blue-600 font-black"
                      : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <span className="flex items-center gap-2">
                    {opt.label}
                    {opt.desc && (
                      <span className="text-[11px] font-normal text-muted-foreground">
                        · {opt.desc}
                      </span>
                    )}
                  </span>
                  {isSelected && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow-2xs">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TicketCenterPage() {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [activeTabFilter, setActiveTabFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 新建工单表单状态
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

  // 消息追加回复输入框
  const [replyText, setReplyText] = useState("");
  const [replyImages, setReplyImages] = useState<string[]>([]);
  const [sendingReply, setSendingReply] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. 读取当前登录用户 Email 并初始化 Tickets
  useEffect(() => {
    async function loadUser() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email) {
          setUserEmail(user.email);
          setFormData((prev) => ({ ...prev, email: prev.email || user.email || "" }));
        }
      } catch {
        /* guest */
      }
    }
    void loadUser();

    // 读取本地存储中的工单
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TicketItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTickets(parsed);
          setSelectedTicketId(parsed[0].id);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    // 首次载入预置真实工单
    setTickets(INITIAL_DEMO_TICKETS);
    setSelectedTicketId(INITIAL_DEMO_TICKETS[0].id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DEMO_TICKETS));
    } catch {}
  }, []);

  // 保存到 localStorage
  const saveTickets = (updated: TicketItem[]) => {
    setTickets(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  };

  // 当前选中的工单详情
  const currentTicket = useMemo(() => {
    return tickets.find((t) => t.id === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

  // 工单列表过滤与搜索
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // 状态筛选
      if (activeTabFilter === "pending_reply" && t.status !== "pending_reply") return false;
      if (activeTabFilter === "processing" && t.status !== "processing") return false;
      if (activeTabFilter === "replied" && t.status !== "replied") return false;
      if (activeTabFilter === "completed" && t.status !== "completed") return false;

      // 关键词搜索（工单号、订单号、标题、描述）
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inId = t.id.toLowerCase().includes(q);
        const inOrder = (t.orderNo || "").toLowerCase().includes(q);
        const inTitle = t.title.toLowerCase().includes(q);
        const inDesc = t.description.toLowerCase().includes(q);
        return inId || inOrder || inTitle || inDesc;
      }
      return true;
    });
  }, [tickets, activeTabFilter, searchQuery]);

  // 统计角标计数
  const stats = useMemo(() => {
    const unreadCount = tickets.filter((t) => t.hasUnreadReply).length;
    const processingCount = tickets.filter((t) => t.status === "processing").length;
    const pendingReplyCount = tickets.filter((t) => t.status === "pending_reply").length;
    const repliedCount = tickets.filter((t) => t.status === "replied").length;
    const completedCount = tickets.filter((t) => t.status === "completed").length;
    return {
      total: tickets.length,
      unread: unreadCount,
      processing: processingCount,
      pendingReply: pendingReplyCount,
      replied: repliedCount,
      completed: completedCount,
    };
  }, [tickets]);

  // 滚动到最新消息
  useEffect(() => {
    if (currentTicket && !isCreating) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentTicket?.messages.length, isCreating]);

  // 剪贴板粘贴截图处理（同时支持新建表单与追加回复框）
  const handlePasteImages = (
    e: React.ClipboardEvent,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          if (file.size > 2 * 1024 * 1024) {
            toast.error("粘贴的截图超过 2MB 限制，请压缩后再试");
            continue;
          }
          const reader = new FileReader();
          reader.onload = (uploadEvent) => {
            const result = uploadEvent.target?.result as string;
            if (result) {
              setter((prev) => {
                if (prev.length >= 6) {
                  toast.warning("最多仅支持添加 6 张截图");
                  return prev;
                }
                toast.success("已通过剪贴板识别并载入 1 张截图");
                return [...prev, result];
              });
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  // 文件选择上传
  const handleFileInput = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      if (file.size > 2 * 1024 * 1024) {
        toast.error(`文件 ${file.name} 超过 2MB 限制`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const result = uploadEvent.target?.result as string;
        if (result) {
          setter((prev) => {
            if (prev.length >= 6) {
              toast.warning("最多仅支持添加 6 张截图");
              return prev;
            }
            return [...prev, result];
          });
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  // 生成格式化时间
  const getNowFormatted = () => {
    const now = new Date();
    const Y = now.getFullYear();
    const M = String(now.getMonth() + 1).padStart(2, "0");
    const D = String(now.getDate()).padStart(2, "0");
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
  };

  // 提交新建工单
  const handleSubmitTicket = (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedTitle = formData.title.trim();
    const trimmedDesc = formData.description.trim();

    if (trimmedTitle.length < 5) {
      toast.error("问题标题至少需要 5 个字符");
      return;
    }
    if (trimmedDesc.length < 10) {
      toast.error("问题描述至少需要 10 个字符");
      return;
    }

    setSubmitting(true);
    const now = new Date();
    const YMD = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const HMS = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const newId = `GD-${YMD}-${HMS}-${rand}`;

    const newTicket: TicketItem = {
      id: newId,
      title: trimmedTitle,
      type: formData.type,
      priority: formData.priority,
      status: "pending_reply",
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

    // 仿真官方客服响应
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
      status: "pending_reply",
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
    <PublicLayout>
      <main className="relative min-h-[calc(100vh-80px)] w-full overflow-hidden bg-[#fffdfa] px-3.5 py-6 sm:px-6 lg:px-8">
        {/* 背景柔暖晨曦流光光晕 */}
        <div className="pointer-events-none fixed -left-32 -top-24 h-[440px] w-[440px] rounded-full bg-gradient-to-br from-[#ffdca8]/35 via-[#ffba75]/20 to-transparent blur-3xl" />
        <div className="pointer-events-none fixed -right-24 top-1/3 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-[#ffe6cc]/40 via-[#ffd5ab]/25 to-transparent blur-3xl" />

        <div className="relative mx-auto max-w-7xl space-y-6">
          {/* 1. 顶部工单中心 Header */}
          <div className="relative overflow-hidden rounded-[28px] border border-orange-100/70 bg-gradient-to-r from-white/95 via-[#fffaf5]/90 to-white/95 p-6 shadow-[0_12px_36px_rgba(240,115,36,0.05)] backdrop-blur-xl ring-1 ring-white/80">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20">
                    <Headphones className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                    工单中心
                  </h1>
                  <span className="rounded-full border border-orange-200/60 bg-orange-50/80 px-2.5 py-0.5 text-xs font-bold text-orange-700">
                    专属售后服务通道
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-600 sm:text-sm">
                  这里集中查看工单列表、客服回复和售后处理进度。工单会在{" "}
                  <strong className="text-orange-600 font-bold">12 小时内回复</strong>
                  ，后台回复后会同步显示未读提醒。
                </p>
              </div>

              {/* 顶部指标统计徽章 */}
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                <div className="inline-flex items-center gap-2 rounded-2xl border border-blue-200/70 bg-blue-50/70 px-3.5 py-2 text-xs font-bold text-blue-700 shadow-xs backdrop-blur-md">
                  <span className="flex h-2 w-2 relative">
                    {stats.unread > 0 && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    )}
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                  <span>未读回复 ({stats.unread})</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-3.5 py-2 text-xs font-bold text-amber-700 shadow-xs backdrop-blur-md">
                  <Clock className="h-3.5 w-3.5" />
                  <span>处理中 ({stats.processing})</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-3.5 py-2 text-xs font-bold text-emerald-700 shadow-xs backdrop-blur-md">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>12小时内回复保障</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. 主体三栏响应式工作台 */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* 左栏：我的工单列表 (4 列) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="flex flex-col rounded-[26px] border border-orange-100/70 bg-white/90 p-4 shadow-[0_12px_36px_rgba(240,115,36,0.04)] backdrop-blur-xl">
                {/* 列表头部 */}
                <div className="mb-3.5 flex items-center justify-between border-b border-orange-50/80 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">我的工单</h2>
                    <p className="text-xs text-muted-foreground">
                      {tickets.length} 条记录，{stats.unread} 条有新回复
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
                      "gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-xs font-bold text-white shadow-sm hover:from-orange-600 hover:to-amber-600 transition-all",
                      isCreating ? "ring-2 ring-orange-300 ring-offset-1" : ""
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新建工单
                  </Button>
                </div>

                {/* 搜索框 */}
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索工单 / 订单号"
                    className="h-9 rounded-xl border border-slate-200/80 bg-white/95 pl-9 pr-8 text-xs shadow-none transition-all focus:border-primary focus:ring-1 focus:ring-primary/20"
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

                {/* 状态过滤 Tabs */}
                <div className="mb-3.5 flex flex-wrap gap-1 rounded-xl bg-slate-100/80 p-1 text-xs font-medium text-slate-600">
                  <button
                    type="button"
                    onClick={() => setActiveTabFilter("all")}
                    className={cn(
                      "flex-1 rounded-lg py-1 text-center font-bold transition-all",
                      activeTabFilter === "all"
                        ? "bg-white text-orange-600 shadow-xs"
                        : "hover:text-slate-900"
                    )}
                  >
                    全部 {tickets.length}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTabFilter("pending_reply")}
                    className={cn(
                      "flex-1 rounded-lg py-1 text-center font-bold transition-all",
                      activeTabFilter === "pending_reply"
                        ? "bg-white text-orange-600 shadow-xs"
                        : "hover:text-slate-900"
                    )}
                  >
                    待回复 {stats.pendingReply}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTabFilter("processing")}
                    className={cn(
                      "flex-1 rounded-lg py-1 text-center font-bold transition-all",
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
                      "flex-1 rounded-lg py-1 text-center font-bold transition-all",
                      activeTabFilter === "completed"
                        ? "bg-white text-orange-600 shadow-xs"
                        : "hover:text-slate-900"
                    )}
                  >
                    已完成 {stats.completed}
                  </button>
                </div>

                {/* 工单卡片列表 */}
                <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
                  {filteredTickets.length === 0 ? (
                    <div className="py-12 text-center">
                      <FileText className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        暂无符合条件的工单
                      </p>
                    </div>
                  ) : (
                    filteredTickets.map((ticket) => {
                      const isSelected = !isCreating && selectedTicketId === ticket.id;
                      const statusConfig = TICKET_STATUSES.find((s) => s.value === ticket.status);
                      const typeConfig = TICKET_TYPES.find((t) => t.value === ticket.type);
                      return (
                        <div
                          key={ticket.id}
                          onClick={() => {
                            setSelectedTicketId(ticket.id);
                            setIsCreating(false);
                            // 清除未读标记
                            if (ticket.hasUnreadReply) {
                              setTickets((prev) =>
                                prev.map((item) =>
                                  item.id === ticket.id ? { ...item, hasUnreadReply: false } : item
                                )
                              );
                            }
                          }}
                          className={cn(
                            "group relative cursor-pointer rounded-2xl border p-3.5 transition-all text-left",
                            isSelected
                              ? "border-orange-300 bg-gradient-to-br from-orange-50/70 to-white shadow-sm ring-1 ring-orange-200/80"
                              : "border-slate-100 bg-white/70 hover:border-orange-200 hover:bg-orange-50/30 shadow-none"
                          )}
                        >
                          {/* 状态徽章与类型 */}
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "rounded-md border px-2 py-0.5 text-[11px] font-bold",
                                  statusConfig?.badgeClass || "bg-slate-50 text-slate-600"
                                )}
                              >
                                {statusConfig?.label}
                              </span>
                              <span className="rounded-md border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                {typeConfig?.label}
                              </span>
                            </div>
                            <span className="text-[10.5px] font-medium text-slate-400">
                              {ticket.updatedAt.slice(5, 16)}
                            </span>
                          </div>

                          {/* 工单标题 */}
                          <h3 className="line-clamp-1 text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">
                            {ticket.title}
                          </h3>

                          {/* 消息预览 */}
                          <p className="line-clamp-2 mt-1 text-xs text-slate-500 leading-relaxed">
                            {ticket.messages[ticket.messages.length - 1]?.content || ticket.description}
                          </p>

                          {/* 工单编号与红点 */}
                          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100/90 pt-2 text-[11px] text-slate-400 font-mono">
                            <span>{ticket.id}</span>
                            {ticket.hasUnreadReply && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600">
                                <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                                新回复
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* 中栏：工作区（新建工单 或 工单对话流）(5 列) */}
            <div className="lg:col-span-5 space-y-4">
              {isCreating ? (
                /* === 新建工单视图 === */
                <div className="rounded-[26px] border border-orange-100/70 bg-white/95 p-6 shadow-[0_12px_36px_rgba(240,115,36,0.04)] backdrop-blur-xl">
                  {/* 新建工单头部 */}
                  <div className="mb-5 flex items-start justify-between border-b border-orange-50/80 pb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                          <Send className="h-4 w-4" />
                        </div>
                        <h2 className="text-lg font-black text-slate-900">新建工单</h2>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        订单、充值、账号或接口问题都可以提交，截图支持直接粘贴上传，工单会在 12 小时内回复。
                      </p>
                    </div>
                  </div>

                  <form
                    onSubmit={handleSubmitTicket}
                    onPaste={(e) =>
                      handlePasteImages(e, (updater) =>
                        setFormData((prev) => ({
                          ...prev,
                          images: typeof updater === "function" ? updater(prev.images) : updater,
                        }))
                      )
                    }
                    className="space-y-4 text-left"
                  >
                    {/* 问题类型与优先级（高保真还原图9 & 图10精美浮层） */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <CustomTicketSelect<TicketType>
                        label="问题类型"
                        value={formData.type}
                        options={TICKET_TYPES}
                        onChange={(type) => setFormData((prev) => ({ ...prev, type }))}
                      />

                      <CustomTicketSelect<TicketPriority>
                        label="处理优先级"
                        value={formData.priority}
                        options={TICKET_PRIORITIES}
                        onChange={(priority) => setFormData((prev) => ({ ...prev, priority }))}
                      />
                    </div>

                    {/* 订单号与联系邮箱 */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="order-no" className="text-xs font-bold text-slate-800">
                          订单号
                        </Label>
                        <Input
                          id="order-no"
                          type="text"
                          value={formData.orderNo}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, orderNo: e.target.value }))
                          }
                          placeholder="没有可不填"
                          className="h-10 rounded-xl border-slate-200/90 bg-white text-xs shadow-xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="contact-email" className="text-xs font-bold text-slate-800">
                          联系邮箱
                        </Label>
                        <Input
                          id="contact-email"
                          type="email"
                          value={formData.email}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, email: e.target.value }))
                          }
                          placeholder="请输入联系邮箱"
                          className="h-10 rounded-xl border-slate-200/90 bg-white text-xs shadow-xs"
                        />
                      </div>
                    </div>

                    {/* 问题标题 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="ticket-title" className="text-xs font-bold text-slate-800">
                          问题标题 <span className="text-red-500">*</span>
                        </Label>
                        <span className="text-[11px] text-muted-foreground">
                          {formData.title.length}/120
                        </span>
                      </div>
                      <Input
                        id="ticket-title"
                        type="text"
                        maxLength={120}
                        value={formData.title}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, title: e.target.value }))
                        }
                        placeholder="例如：订单已支付但未发货 / 充值未到账"
                        className="h-10 rounded-xl border-slate-200/90 bg-white text-xs shadow-xs"
                        required
                      />
                    </div>

                    {/* 问题描述 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="ticket-desc" className="text-xs font-bold text-slate-800">
                          问题描述 <span className="text-red-500">*</span>
                        </Label>
                        <span className="text-[11px] text-muted-foreground">
                          {formData.description.length}/2000
                        </span>
                      </div>
                      <Textarea
                        id="ticket-desc"
                        rows={4}
                        maxLength={2000}
                        value={formData.description}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, description: e.target.value }))
                        }
                        placeholder="详细描述遇到的问题、页面提示、已尝试的操作，可以在当前页面直接 Ctrl+V 粘贴截图。"
                        className="rounded-xl border-slate-200/90 bg-white text-xs leading-relaxed shadow-xs"
                        required
                      />
                    </div>

                    {/* 截图附件上传区域 */}
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-800">
                        附件截图 (最多 6 张)
                      </Label>
                      <label className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-orange-200/80 bg-orange-50/20 p-4 text-center transition-all hover:border-orange-300 hover:bg-orange-50/50">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) =>
                            handleFileInput(e, (updater) =>
                              setFormData((prev) => ({
                                ...prev,
                                images: typeof updater === "function" ? updater(prev.images) : updater,
                              }))
                            )
                          }
                          className="hidden"
                        />
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-600 group-hover:scale-105 transition-transform">
                          <Upload className="h-5 w-5" />
                        </div>
                        <div className="mt-2 text-xs font-bold text-slate-800">
                          支持粘贴截图、点击上传或拖入图片
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          最多 6 张，每张不超过 2.0 MB；支持 PNG、JPG、WEBP。
                        </p>
                      </label>

                      {/* 图片缩略图预览 */}
                      {formData.images.length > 0 && (
                        <div className="flex flex-wrap gap-2.5 pt-1">
                          {formData.images.map((img, idx) => (
                            <div
                              key={idx}
                              className="group relative h-16 w-16 overflow-hidden rounded-xl border border-orange-200/70 bg-white shadow-xs"
                            >
                              <img
                                src={img}
                                alt={`附件 ${idx + 1}`}
                                onClick={() => setPreviewImage(img)}
                                className="h-full w-full cursor-zoom-in object-cover"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    images: prev.images.filter((_, i) => i !== idx),
                                  }))
                                }
                                className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 底部提交栏 */}
                    <div className="flex items-center justify-end gap-3 border-t border-orange-50/80 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setFormData({
                            type: "order",
                            priority: "normal",
                            orderNo: "",
                            email: userEmail,
                            title: "",
                            description: "",
                            images: [],
                          })
                        }
                        className="rounded-xl text-xs font-semibold"
                      >
                        清空内容
                      </Button>
                      <Button
                        type="submit"
                        disabled={submitting}
                        className="gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 font-bold text-white shadow-md shadow-orange-500/20 hover:from-orange-600 hover:to-amber-600 transition-all"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {submitting ? "正在提交..." : "提交工单"}
                      </Button>
                    </div>
                  </form>
                </div>
              ) : currentTicket ? (
                /* === 工单详情与对话记录视图 === */
                <div className="flex flex-col rounded-[26px] border border-orange-100/70 bg-white/95 p-5 shadow-[0_12px_36px_rgba(240,115,36,0.04)] backdrop-blur-xl">
                  {/* 工单头部 */}
                  <div className="border-b border-orange-50/90 pb-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-800">
                          {currentTicket.id}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyId(currentTicket.id)}
                          className="text-slate-400 hover:text-slate-600 transition-colors"
                          title="复制工单号"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-[11px] font-bold",
                            TICKET_STATUSES.find((s) => s.value === currentTicket.status)
                              ?.badgeClass
                          )}
                        >
                          {TICKET_STATUSES.find((s) => s.value === currentTicket.status)?.label}
                        </span>
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {TICKET_TYPES.find((t) => t.value === currentTicket.type)?.label}
                        </span>
                        <span
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-[11px] font-medium",
                            TICKET_PRIORITIES.find((p) => p.value === currentTicket.priority)?.color
                          )}
                        >
                          {TICKET_PRIORITIES.find((p) => p.value === currentTicket.priority)?.label}
                        </span>
                      </div>
                    </div>
                    <h2 className="text-base font-black text-slate-900 leading-snug">
                      {currentTicket.title}
                    </h2>
                    {currentTicket.orderNo && (
                      <div className="mt-1.5 text-xs text-slate-500">
                        关联订单：<span className="font-mono">{currentTicket.orderNo}</span>
                      </div>
                    )}
                  </div>

                  {/* 对话消息流 */}
                  <div className="my-4 space-y-4 max-h-[460px] overflow-y-auto px-1 py-1">
                    {currentTicket.messages.map((msg) => {
                      const isUser = msg.sender === "user";
                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex flex-col gap-1.5",
                            isUser ? "items-end" : "items-start"
                          )}
                        >
                          {/* 发送者信息与时间 */}
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            {!isUser && (
                              <div className="flex items-center gap-1 font-bold text-orange-600">
                                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                                {msg.senderName}
                              </div>
                            )}
                            <span>{msg.createdAt}</span>
                            {isUser && <span className="font-bold text-slate-600">{msg.senderName}</span>}
                          </div>

                          {/* 消息气泡 */}
                          <div
                            className={cn(
                              "max-w-[85%] rounded-[20px] p-4 text-xs leading-relaxed shadow-xs",
                              isUser
                                ? "rounded-tr-xs bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium shadow-orange-500/10"
                                : "rounded-tl-xs border border-orange-100/80 bg-white/95 text-slate-800 shadow-slate-100"
                            )}
                          >
                            <p className="whitespace-pre-wrap">{msg.content}</p>

                            {/* 附带的图片截图 */}
                            {msg.images && msg.images.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {msg.images.map((img, i) => (
                                  <img
                                    key={i}
                                    src={img}
                                    alt={`凭证截图 ${i + 1}`}
                                    onClick={() => setPreviewImage(img)}
                                    className="h-16 w-16 cursor-zoom-in rounded-xl border border-white/60 object-cover shadow-xs hover:scale-105 transition-transform"
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
                    className="border-t border-orange-50/90 pt-3"
                  >
                    <div className="space-y-2">
                      <Textarea
                        rows={2}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="补充描述、反馈新情况... 可直接 Ctrl+V 粘贴截图"
                        className="rounded-xl border-slate-200/90 bg-white text-xs shadow-none resize-none"
                      />

                      {/* 回复附件图片 */}
                      {replyImages.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {replyImages.map((img, i) => (
                            <div
                              key={i}
                              className="group relative h-12 w-12 overflow-hidden rounded-lg border border-orange-200/70"
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

                      <div className="flex items-center justify-between pt-1">
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
                          className="gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-xs font-bold text-white shadow-xs hover:from-orange-600 hover:to-amber-600"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {sendingReply ? "发送中..." : "发送回复"}
                        </Button>
                      </div>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="flex h-96 flex-col items-center justify-center rounded-[26px] border border-orange-100/70 bg-white/80 p-8 text-center backdrop-blur-xl">
                  <Headphones className="h-12 w-12 text-orange-400/80 mb-3" />
                  <h3 className="text-base font-bold text-slate-800">请选择工单或新建工单</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    点击左侧列表查看处理进度，或点击新建工单提交新问题。
                  </p>
                  <Button
                    type="button"
                    onClick={() => setIsCreating(true)}
                    className="mt-4 gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-xs font-bold text-white shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新建工单
                  </Button>
                </div>
              )}
            </div>

            {/* 右栏：辅助指南与 FAQ 问答卡片 (3 列) */}
            <div className="lg:col-span-3 space-y-4">
              {/* 卡片 1：提交建议 */}
              <div className="rounded-[24px] border border-orange-100/70 bg-white/90 p-5 shadow-[0_12px_36px_rgba(240,115,36,0.04)] backdrop-blur-xl text-left">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">提交建议</h3>
                </div>
                <ul className="space-y-2 text-xs text-slate-600 leading-relaxed list-disc list-inside">
                  <li>
                    <strong className="text-slate-800">订单问题：</strong>
                    请尽量填写订单号，截图保留支付状态和报错提示。
                  </li>
                  <li>
                    <strong className="text-slate-800">账号售后：</strong>
                    请说明购买商品、登录环境及当前遇到的具体异常。
                  </li>
                  <li>
                    <strong className="text-slate-800">接口问题：</strong>
                    请附上请求时间、接口名称及返回的错误响应内容。
                  </li>
                  <li className="text-amber-800 bg-amber-50/80 p-2 rounded-xl list-none mt-2 border border-amber-200/60 font-medium">
                    ⚠️ 请不要提交账号密码、密钥等敏感私密凭据。
                  </li>
                </ul>
              </div>

              {/* 卡片 2：处理流程 */}
              <div className="rounded-[24px] border border-orange-100/70 bg-white/90 p-5 shadow-[0_12px_36px_rgba(240,115,36,0.04)] backdrop-blur-xl text-left">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <Clock3 className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">处理流程</h3>
                </div>

                <div className="relative pl-4 space-y-4 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-[2px] before:bg-orange-100">
                  <div className="relative">
                    <div className="absolute -left-4 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-orange-500 shadow-xs" />
                    <div className="text-xs font-bold text-slate-800">1. 提交工单</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      填写详细信息并上传相关凭证截图
                    </div>
                  </div>

                  <div className="relative">
                    <div className="absolute -left-4 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-500 shadow-xs" />
                    <div className="text-xs font-bold text-slate-800">2. 客服核验</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      核对订单编号、余额扣费与服务记录
                    </div>
                  </div>

                  <div className="relative">
                    <div className="absolute -left-4 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 shadow-xs" />
                    <div className="text-xs font-bold text-slate-800">3. 回复处理</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      12 小时内回复，未读提醒同步展现
                    </div>
                  </div>
                </div>
              </div>

              {/* 卡片 3：常见问题 FAQ 精选速查手风琴 */}
              <div className="rounded-[24px] border border-orange-100/70 bg-white/90 p-5 shadow-[0_12px_36px_rgba(240,115,36,0.04)] backdrop-blur-xl text-left">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">常见问题速查</h3>
                </div>
                <p className="text-[11px] text-slate-500 mb-3">
                  无需等待回复，常见疑问可先自查：
                </p>

                <Accordion type="single" collapsible className="space-y-1.5 text-xs">
                  {FAQ_KNOWLEDGE_BASE.flatMap((grp) => grp.items).map((item, idx) => (
                    <AccordionItem
                      key={idx}
                      value={`faq-${idx}`}
                      className="border-b-0 rounded-xl bg-orange-50/30 px-3 py-1"
                    >
                      <AccordionTrigger className="text-xs font-bold text-slate-800 hover:text-orange-600 hover:no-underline py-2 text-left">
                        {item.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-[11.5px] text-slate-600 leading-relaxed pb-2 pt-0.5">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
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
      </main>
    </PublicLayout>
  );
}
