"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  HelpCircle,
  KeyRound,
  Lock,
  PackageCheck,
  RefreshCw,
  Search,
  Send,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Terminal,
  Wallet,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { useAccountEmail } from "@/components/account/AccountEmailContext";
import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/AccountCenter.module.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";
import { cn } from "@/lib/utils";

const tabs = [
  { value: "overview", label: "概览" },
  { value: "calls", label: "调用记录" },
  { value: "orders", label: "API 订单" },
  { value: "docs", label: "接口文档" },
  { value: "security", label: "安全设置" },
] as const;

type ApiTab = (typeof tabs)[number]["value"];
type MerchantApiStatus = "unapplied" | "pending" | "approved";

export interface ApiApplicationRecord {
  id: string;
  email: string;
  merchantName: string;
  businessScenario: string;
  serverIps: string[];
  contact: string;
  status: "pending" | "approved" | "rejected" | "revoked";
  appliedAt: string;
  appId?: string;
  appSecret?: string;
}

export interface ApiCallLogItem {
  id: string;
  name: string;
  method: "GET" | "POST";
  path: string;
  status: number;
  time: string;
  ms: string;
  ip: string;
}

export interface ApiOrderItem {
  id: string;
  orderNo: string;
  productName: string;
  amount: number;
  status: string;
  createdAt: string;
  cards?: string;
}

const DEFAULT_CALL_LOGS: ApiCallLogItem[] = [];

const DEFAULT_API_ORDERS: ApiOrderItem[] = [];

function generateApiKey() {
  const chars = "abcdef0123456789";
  let randomHex = "";
  for (let i = 0; i < 32; i++) {
    randomHex += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `jl_live_${randomHex}`;
}

export default function AccountApiPage() {
  const email = useAccountEmail();
  const [activeTab, setActiveTab] = useState<ApiTab>("overview");
  const [apiStatus, setApiStatus] = useState<MerchantApiStatus>("unapplied");
  const [wasRevoked, setWasRevoked] = useState<boolean>(false);
  const [viewingDocsWhileUnapproved, setViewingDocsWhileUnapproved] = useState<boolean>(false);
  const [appId, setAppId] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedAppId, setCopiedAppId] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [whitelistIps, setWhitelistIps] = useState<string[]>([]);
  const [merchantBalance, setMerchantBalance] = useState<number>(0);
  const [callLogs, setCallLogs] = useState<ApiCallLogItem[]>([]);
  const [apiOrders, setApiOrders] = useState<ApiOrderItem[]>([]);

  const {
    containerRef: apiTabsRef,
    setItemRef: setApiTabRef,
    indicator: apiTabIndicator,
  } = useSlidingIndicator<ApiTab>(apiStatus === "approved" ? activeTab : null, [apiStatus]);

  // 申请表单状态
  const [merchantName, setMerchantName] = useState("");
  const [businessScenario, setBusinessScenario] = useState("");
  const [applyIps, setApplyIps] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [submittingApply, setSubmittingApply] = useState(false);

  // 调用记录分页状态
  const [callLogsPage, setCallLogsPage] = useState<number>(1);
  const [callLogsPageSize, setCallLogsPageSize] = useState<number>(10);

  // API 订单分页与搜索状态
  const [ordersSearch, setOrdersSearch] = useState<string>("");
  const [ordersPage, setOrdersPage] = useState<number>(1);
  const [ordersPageSize, setOrdersPageSize] = useState<number>(10);

  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/v1`
      : "https://www.jianlian.shop/api/v1";

  // 读取或同步商户 API 状态（严格与后台「代理与分销 - API管理 / API申请记录」保持实时同步，收回权限后必须重新申请）
  const syncMerchantApiState = useCallback(() => {
    if (typeof window === "undefined") return;
    const userEmail = email || "developer@example.com";
    const statusKey = `jianlian_mch_app_status_${userEmail}`;
    const keyKey = `jianlian_developer_key_${userEmail}`;
    const appIdKey = `jianlian_mch_app_id_${userEmail}`;
    const ipKey = `jianlian_mch_whitelist_${userEmail}`;

    const savedStatus = window.localStorage.getItem(statusKey);
    const savedKey = window.localStorage.getItem(keyKey);
    const savedAppId = window.localStorage.getItem(appIdKey);
    const savedIps = window.localStorage.getItem(ipKey);

    let adminRecord: ApiApplicationRecord | undefined;
    try {
      const raw = window.localStorage.getItem("jianlian_admin_api_applications");
      const list: ApiApplicationRecord[] = raw ? JSON.parse(raw) : [];
      adminRecord = list.find((item) => item && item.email === userEmail);
    } catch {}

    // 1. 若后台已回收或被移除，强制回到未开通/重新申请状态
    if (
      savedStatus === "revoked" ||
      savedStatus === "unapplied" ||
      adminRecord?.status === "revoked" ||
      adminRecord?.status === "rejected"
    ) {
      setApiStatus("unapplied");
      setWasRevoked(savedStatus === "revoked" || adminRecord?.status === "revoked");
      setAppId("");
      setApiKey("");
      setWhitelistIps([]);
      return;
    }

    // 2. 审核中状态
    if (savedStatus === "pending" || adminRecord?.status === "pending") {
      setApiStatus("pending");
      setWasRevoked(false);
      return;
    }

    // 3. 仅当已明确通过审批时展示已开通开发者面板
    if (savedStatus === "approved" || adminRecord?.status === "approved") {
      const resolvedAppId = adminRecord?.appId || savedAppId || `MCH_${Math.abs(hashString(userEmail)).toString().slice(0, 8).padEnd(8, "0")}`;
      const resolvedKey = adminRecord?.appSecret || savedKey || generateApiKey();
      let parsedIpsList: string[] = [];
      if (savedIps) {
        try {
          const parsedIps = JSON.parse(savedIps);
          parsedIpsList = Array.isArray(parsedIps) ? parsedIps.filter((ip) => ip && ip !== "124.220.100.12") : [];
        } catch {
          parsedIpsList = savedIps !== "124.220.100.12" ? [savedIps] : [];
        }
      } else if (adminRecord?.serverIps?.length) {
        parsedIpsList = adminRecord.serverIps;
      }
      setApiStatus("approved");
      setWasRevoked(false);
      setViewingDocsWhileUnapproved(false);
      setAppId(resolvedAppId);
      setApiKey(resolvedKey);
      setWhitelistIps(parsedIpsList);
      return;
    }

    // 4. 默认未开通：要求提交接入申请
    setApiStatus("unapplied");
    setWasRevoked(false);
    setAppId("");
    setApiKey("");
    setWhitelistIps([]);
  }, [email]);

  useEffect(() => {
    syncMerchantApiState();
    const onSync = () => syncMerchantApiState();
    window.addEventListener("storage", onSync);
    window.addEventListener("focus", onSync);
    window.addEventListener("jianlian-admin-badges-updated", onSync);
    return () => {
      window.removeEventListener("storage", onSync);
      window.removeEventListener("focus", onSync);
      window.removeEventListener("jianlian-admin-badges-updated", onSync);
    };
  }, [syncMerchantApiState]);

  // 读取真实用户账户余额与真实 API 订单/调用记录
  useEffect(() => {
    let active = true;
    fetch("/api/account/assets", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!active || !payload) return;
        const rawBal = payload?.summary?.availableBalance ?? payload?.profile?.balance ?? payload?.balance;
        const num = Number(rawBal);
        if (Number.isFinite(num) && num >= 0) {
          setMerchantBalance(num);
        }
      })
      .catch(() => {});

    // 读取真实开放 API 调用日志与订单（不含假数据）
    if (typeof window !== "undefined") {
      try {
        const userEmail = email || "developer@example.com";
        const rawLogs = window.localStorage.getItem(`jianlian_api_call_logs_${userEmail}`);
        if (rawLogs) {
          const parsed = JSON.parse(rawLogs);
          if (Array.isArray(parsed)) setCallLogs(parsed);
        } else {
          setCallLogs([]);
        }
      } catch {
        setCallLogs([]);
      }
    }

    fetch("/api/orders?page=1&pageSize=50", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!active || !payload) return;
        const rows = Array.isArray(payload?.orders) ? payload.orders : [];
        const realApiOnly: ApiOrderItem[] = rows
          .filter((row: any) => {
            const note = String(row.customer_note || "").toLowerCase();
            return (
              row.source === "api" ||
              row.channel === "api" ||
              row.order_source === "api" ||
              note.includes("open_api") ||
              note.includes("api:")
            );
          })
          .map((row: any) => {
            const firstItem = Array.isArray(row.order_items) ? row.order_items[0] : null;
            const statusMap: Record<string, string> = {
              delivered: "已发货",
              completed: "已完成",
              paid: "已支付",
              processing: "处理中",
              pending_payment: "待支付",
              cancelled: "已取消",
              expired: "已过期",
            };
            const dt = row.created_at ? new Date(row.created_at) : null;
            const pad = (n: number) => String(n).padStart(2, "0");
            const formatted =
              dt && !Number.isNaN(dt.getTime())
                ? `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`
                : "—";
            return {
              id: String(row.id || row.order_no),
              orderNo: String(row.order_no || row.id || "—"),
              productName: firstItem?.product_name || row.product_name || "数字商品",
              amount: Number(row.total_amount ?? 0),
              status: statusMap[String(row.status || "")] || String(row.status || "处理中"),
              createdAt: formatted,
            };
          });
        setApiOrders(realApiOnly);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [email]);

  function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  // 提交 API 接入申请
  const handleSubmitApplication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantName.trim()) {
      toast.error("请输入商户/企业或个人主体名称");
      return;
    }
    if (!businessScenario.trim()) {
      toast.error("请描述您的业务对接场景");
      return;
    }

    setSubmittingApply(true);
    const userEmail = email || "developer@example.com";
    const statusKey = `jianlian_mch_app_status_${userEmail}`;

    const ipsParsed = applyIps
      .split(/[\n,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const newRecord: ApiApplicationRecord = {
      id: `APP_${Date.now()}`,
      email: userEmail,
      merchantName: merchantName.trim(),
      businessScenario: businessScenario.trim(),
      serverIps: ipsParsed,
      contact: contactInfo.trim() || userEmail,
      status: "pending",
      appliedAt: new Date().toISOString(),
    };

    setTimeout(() => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(statusKey, "pending");
        try {
          const raw = window.localStorage.getItem("jianlian_admin_api_applications");
          const list: ApiApplicationRecord[] = raw ? JSON.parse(raw).filter((item: ApiApplicationRecord) => item && item.email !== userEmail) : [];
          list.unshift(newRecord);
          window.localStorage.setItem("jianlian_admin_api_applications", JSON.stringify(list));
          window.dispatchEvent(new Event("jianlian-admin-badges-updated"));
        } catch {}
      }
      setApiStatus("pending");
      setSubmittingApply(false);
      toast.success("API 申请已成功提交，平台管理员审核中！");
    }, 600);
  };

  const handleCopyKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopiedKey(true);
      toast.success("商户密钥 (AppSecret) 已复制");
      setTimeout(() => setCopiedKey(false), 2000);
    });
  };

  const handleCopyAppId = () => {
    if (!appId) return;
    navigator.clipboard.writeText(appId).then(() => {
      setCopiedAppId(true);
      toast.success("商户 ID (AppID) 已复制");
      setTimeout(() => setCopiedAppId(false), 2000);
    });
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(baseUrl).then(() => {
      setCopiedUrl(true);
      toast.success("接口地址已复制到剪贴板");
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  };

  const handleResetKey = () => {
    const fresh = generateApiKey();
    setApiKey(fresh);
    if (typeof window !== "undefined") {
      const userEmail = email || "developer@example.com";
      const storageKey = `jianlian_developer_key_${userEmail}`;
      window.localStorage.setItem(storageKey, fresh);
    }
    toast.success("商户密钥已重置并立即生效");
  };

  const maskedKey = apiKey
    ? `${apiKey.slice(0, 10)}${"•".repeat(20)}${apiKey.slice(-4)}`
    : "正在生成开发者凭证...";

  // 实时计算今日真实统计指标
  const apiMetrics = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const todayShortPrefix = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const todayCalls = callLogs.filter(
      (c) => c.time.startsWith(todayPrefix) || c.time.startsWith(todayShortPrefix)
    );
    const todayErrors = todayCalls.filter((c) => c.status >= 400).length;
    const successRate =
      todayCalls.length === 0
        ? "100%"
        : `${(((todayCalls.length - todayErrors) / todayCalls.length) * 100).toFixed(1)}%`;

    const todayOrders = apiOrders.filter((o) => o.createdAt.startsWith(todayPrefix));
    const todayAmount = todayOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

    return {
      todayCallCount: todayCalls.length,
      totalCallCount: callLogs.length,
      todayErrorCount: todayErrors,
      successRate,
      todayOrderCount: todayOrders.length,
      todayAmount,
    };
  }, [callLogs, apiOrders]);

  // 调用记录分页计算
  const totalCallLogsPages = Math.max(1, Math.ceil(callLogs.length / callLogsPageSize));
  const pagedCallLogs = useMemo(() => {
    const start = (callLogsPage - 1) * callLogsPageSize;
    return callLogs.slice(start, start + callLogsPageSize);
  }, [callLogs, callLogsPage, callLogsPageSize]);

  // API 订单搜索与分页
  const filteredOrders = useMemo(() => {
    const q = ordersSearch.trim().toLowerCase();
    if (!q) return apiOrders;
    return apiOrders.filter(
      (o) =>
        o.orderNo.toLowerCase().includes(q) ||
        o.productName.toLowerCase().includes(q)
    );
  }, [apiOrders, ordersSearch]);

  const totalOrdersPages = Math.max(1, Math.ceil(filteredOrders.length / ordersPageSize));
  const pagedOrders = useMemo(() => {
    const start = (ordersPage - 1) * ordersPageSize;
    return filteredOrders.slice(start, start + ordersPageSize);
  }, [filteredOrders, ordersPage, ordersPageSize]);

  return (
    <div
      data-account-page="/account/api"
      data-account-ready={true}
      aria-busy={false}
      className={`${styles.page} ${styles.apiPage} flex min-w-0 flex-col gap-5`}
      data-testid="account-api-page"
    >
      {/* 头部面板 */}
      <section className={`${glass.surface} ${styles.panel} overflow-hidden`}>
        <header className={`${styles.pageHeader} flex flex-wrap items-center justify-between gap-4`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={`${glass.icon} h-11 w-11`}>
              <Code2 className="h-5 w-5 text-primary" strokeWidth={1.6} aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">API 开放平台</h1>
              <p className="mt-1 text-sm text-slate-500">商户接口凭证、自动化下单、分销管理与白名单管控</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-orange-200 bg-white/80 hover:bg-orange-50 font-bold text-xs"
              onClick={() => {
                if (apiStatus === "approved") {
                  setActiveTab("docs");
                } else {
                  setViewingDocsWhileUnapproved((prev) => !prev);
                }
              }}
            >
              <BookOpen className="mr-2 h-4 w-4 text-primary" aria-hidden="true" />
              {apiStatus !== "approved" && viewingDocsWhileUnapproved
                ? "返回 API 接入申请"
                : "查看接口协议与文档"}
            </Button>
          </div>
        </header>
      </section>

      {/* 未开通状态：展示申请表单（若点击查看文档则预览文档） */}
      {apiStatus === "unapplied" && !viewingDocsWhileUnapproved ? (
        <section className={`${glass.surface} ${styles.panel} p-6 sm:p-8 space-y-6`}>
          {wasRevoked && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-xs text-rose-800 shadow-2xs">
              <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold text-rose-900">您的 API 接入权限已被管理员收回</p>
                <p className="text-rose-700/90">原 AppID、AppSecret 与白名单 IP 均已停用失效，如需继续对接开放平台接口，请重新提交接入申请。</p>
              </div>
            </div>
          )}
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span>开放平台接入申请</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              申请开通 API 接口权限
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              为保证生产平台交易合规与商户资金安全，API 接口采用<strong>审核与白名单准入制</strong>。开通后系统将分配专属商户 ID (AppID) 与商户密钥 (AppSecret)，并由平台管理员在后台统一加白服务器出口 IP。
            </p>
          </div>

          <form onSubmit={handleSubmitApplication} className="max-w-xl space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="merchantName" className="text-xs font-semibold text-slate-700">
                商户/企业/个人主体名称 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="merchantName"
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                placeholder="例如：极客数字科技有限公司 / 个人开发者"
                className="h-11 rounded-xl bg-white text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="businessScenario" className="text-xs font-semibold text-slate-700">
                接入业务场景说明 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="businessScenario"
                value={businessScenario}
                onChange={(e) => setBusinessScenario(e.target.value)}
                placeholder="例如：自建电商系统对接、ERP批量代充、海外卡分销等"
                className="h-11 rounded-xl bg-white text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="applyIps" className="text-xs font-semibold text-slate-700">
                拟加白的服务器外网 IP（选填，支持后续由后台人工加白）
              </Label>
              <textarea
                id="applyIps"
                rows={3}
                value={applyIps}
                onChange={(e) => setApplyIps(e.target.value)}
                placeholder="例如：124.220.100.12（每行一个 IP 地址）"
                className="w-full rounded-xl border border-orange-200 bg-white p-3 font-mono text-xs text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contactInfo" className="text-xs font-semibold text-slate-700">
                紧急技术对接联系方式（QQ / Telegram / 电话）
              </Label>
              <Input
                id="contactInfo"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="例如：TG: @jianlian_dev / 手机号"
                className="h-11 rounded-xl bg-white text-sm"
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={submittingApply}
                className="h-11 px-6 rounded-xl font-bold text-sm shadow-sm"
              >
                {submittingApply ? "正在提交申请..." : "立即提交接入申请"}
              </Button>
            </div>
          </form>
        </section>
      ) : apiStatus === "pending" && !viewingDocsWhileUnapproved ? (
        /* 申请审核中状态 */
        <section className={`${glass.surface} ${styles.panel} p-8 text-center space-y-4`}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-xs">
            <Clock className="h-7 w-7 animate-pulse" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-xl font-bold text-slate-900">API 接入申请正在审核中</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              您的商户对接申请已成功提交至平台风控与安全中心。管理员将在后台「代理管理」中为您分配商户 ID、签名密钥并完成服务器 IP 白名单加白，通常在 1 个工作日内完成。
            </p>
          </div>
        </section>
      ) : apiStatus === "approved" ? (
        /* 已开通状态：展示商户开发者控制台 */
        <>
          {/* 开发者凭证与快捷操作面板 */}
          <div className={styles.apiTop}>
            <section className={`${glass.surface} ${styles.panel} p-5 sm:p-6 space-y-4`} aria-labelledby="api-credentials-title">
              <div className="flex items-center justify-between gap-3">
                <h2 id="api-credentials-title" className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
                  商户凭证 (AppID & AppSecret)
                </h2>
              </div>

              {/* 商户 ID */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">商户 ID (AppID)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={appId || "MCH_10082691"}
                    readOnly
                    className="flex-1 rounded-xl border border-orange-200/80 bg-white/90 px-3.5 py-2 text-xs font-mono font-bold text-slate-800 shadow-2xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyAppId}
                    className="rounded-xl border-orange-200 hover:bg-orange-50 text-xs font-semibold"
                  >
                    {copiedAppId ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 mr-1 text-slate-500" />}
                    {copiedAppId ? "已复制" : "复制"}
                  </Button>
                </div>
              </div>

              {/* 商户密钥 */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">商户密钥 (AppSecret)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={showKey ? apiKey : maskedKey}
                    readOnly
                    className="flex-1 rounded-xl border border-orange-200/80 bg-white/90 px-3.5 py-2 text-xs font-mono font-medium text-slate-800 shadow-2xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowKey(!showKey)}
                    className="rounded-xl border-orange-200 hover:bg-orange-50 text-xs font-semibold"
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5 mr-1 text-slate-500" /> : <Eye className="h-3.5 w-3.5 mr-1 text-slate-500" />}
                    {showKey ? "隐藏" : "显示"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyKey}
                    className="rounded-xl border-orange-200 hover:bg-orange-50 text-xs font-semibold"
                  >
                    {copiedKey ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 mr-1 text-slate-500" />}
                    {copiedKey ? "已复制" : "复制"}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                <span className="truncate">接口基地址：<code className="text-slate-700 font-mono font-semibold">{baseUrl}</code></span>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="text-primary hover:underline shrink-0 ml-2 font-medium"
                >
                  {copiedUrl ? "已复制地址" : "复制基地址"}
                </button>
              </div>
            </section>

            <section className={`${glass.surface} ${styles.panel} p-5 sm:p-6`} aria-labelledby="api-actions-title">
              <h2 id="api-actions-title" className="text-base font-semibold text-slate-900">
                快捷操作与安全
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetKey}
                  className="rounded-xl border-orange-200 hover:bg-orange-50 text-xs font-semibold text-slate-800"
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 text-primary" />
                  重置密钥
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("security")}
                  className="rounded-xl border-orange-200 hover:bg-orange-50 text-xs font-semibold text-slate-800"
                >
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                  查看加白 IP
                </Button>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                重置密钥将立即注销旧凭证，所有使用旧 Secret 的请求将被安全风控拒绝。
              </p>
            </section>
          </div>

          {/* 实时统计指标：参考图 3 全面重构为 5 张卡片 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {/* 1. 账户余额 */}
            <div className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-2xs transition-all hover:shadow-xs">
              <p className="text-xs font-medium text-slate-600">账户余额</p>
              <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
                ¥{merchantBalance.toFixed(2)}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">API 下单可用余额</p>
            </div>

            {/* 2. 今日调用 */}
            <div className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-2xs transition-all hover:shadow-xs">
              <p className="text-xs font-medium text-slate-600">今日调用</p>
              <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
                {apiMetrics.todayCallCount}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">累计 {apiMetrics.totalCallCount} 次</p>
            </div>

            {/* 3. 今日成功率 */}
            <div className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-2xs transition-all hover:shadow-xs">
              <p className="text-xs font-medium text-slate-600">今日成功率</p>
              <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
                {apiMetrics.successRate}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{apiMetrics.todayErrorCount} 次错误</p>
            </div>

            {/* 4. 今日 API 订单 */}
            <div className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-2xs transition-all hover:shadow-xs">
              <p className="text-xs font-medium text-slate-600">今日 API 订单</p>
              <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
                {apiMetrics.todayOrderCount}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">仅统计 API 余额支付</p>
            </div>

            {/* 5. 今日成交 */}
            <div className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-2xs transition-all hover:shadow-xs">
              <p className="text-xs font-medium text-slate-600">今日成交</p>
              <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
                ¥{apiMetrics.todayAmount.toFixed(2)}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">按已创建订单全额</p>
            </div>
          </div>
        </>
      ) : null}

      {/* 选项卡栏：仅已开通商户显示控制台选项卡（精确 DOM 测量高光药丸滑动指示器） */}
      {apiStatus === "approved" && (
      <div
        ref={apiTabsRef}
        role="tablist"
        aria-label="开放平台工作台切换"
        className="relative flex rounded-2xl bg-orange-100/60 p-1 border border-orange-200/70 shadow-2xs w-fit max-w-full overflow-x-auto"
      >
        {apiTabIndicator.visible && (
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute top-1 bottom-1 rounded-xl bg-white shadow-sm ring-1 ring-orange-200/80",
              apiTabIndicator.animated && "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            )}
            style={{
              left: `${apiTabIndicator.left}px`,
              width: `${apiTabIndicator.width}px`,
            }}
          />
        )}
        {tabs.map((tab) => (
          <button
            key={tab.value}
            ref={setApiTabRef(tab.value)}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "relative z-10 flex min-w-[92px] items-center justify-center px-4 py-2 text-xs sm:text-sm font-bold transition-colors duration-200 cursor-pointer rounded-xl whitespace-nowrap",
              activeTab === tab.value
                ? "text-primary font-black"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      )}

      {/* 选项卡内容区 */}
      <div className="space-y-6">
        {/* 1. 概览：参考图 4 实现两栏（左：最近调用，右：最近 API 订单） */}
        {apiStatus === "approved" && activeTab === "overview" && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* 左栏：最近调用 */}
            <section className={`${glass.surface} ${styles.panel} p-5 flex flex-col justify-between space-y-4`}>
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-orange-100/70">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    最近调用
                  </h2>
                  <span className="text-xs text-slate-400">实时日志</span>
                </div>

                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-100">
                        <th className="py-2.5 px-3 font-normal">接口</th>
                        <th className="py-2.5 px-3 font-normal">状态</th>
                        <th className="py-2.5 px-3 font-normal text-right">时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {callLogs.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-10 text-center text-xs text-slate-400">
                            暂无接口调用记录
                          </td>
                        </tr>
                      ) : (
                        callLogs.slice(0, 6).map((item) => (
                          <tr key={item.id} className="hover:bg-orange-50/40 transition-colors">
                            <td className="py-2.5 px-3 font-medium text-slate-800">{item.name}</td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                                {item.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-500">{item.time}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("calls")}
                  className="rounded-xl border-orange-200 text-xs font-semibold hover:bg-orange-50"
                >
                  查看全部记录
                </Button>
              </div>
            </section>

            {/* 右栏：最近 API 订单 */}
            <section className={`${glass.surface} ${styles.panel} p-5 flex flex-col justify-between space-y-4`}>
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-orange-100/70">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-primary" />
                    最近 API 订单
                  </h2>
                  <span className="text-xs text-slate-400">自动履约交付</span>
                </div>

                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-100">
                        <th className="py-2.5 px-3 font-normal">商品</th>
                        <th className="py-2.5 px-3 font-normal text-right">金额</th>
                        <th className="py-2.5 px-3 font-normal">创建时间</th>
                        <th className="py-2.5 px-3 font-normal text-right">状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {apiOrders.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-10 text-center text-xs text-slate-400">
                            暂无 API 订单记录
                          </td>
                        </tr>
                      ) : (
                        apiOrders.slice(0, 10).map((item) => (
                          <tr key={item.id} className="hover:bg-orange-50/40 transition-colors">
                            <td className="py-2.5 px-3">
                              <div className="font-medium text-slate-800 max-w-[200px] truncate">{item.productName}</div>
                              <div className="text-[10px] font-mono text-slate-400">{item.orderNo}</div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono">
                              ¥{item.amount.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                              {item.createdAt.slice(5, 16)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("orders")}
                  className="rounded-xl border-orange-200 text-xs font-semibold hover:bg-orange-50"
                >
                  查看全部订单
                </Button>
              </div>
            </section>
          </div>
        )}

        {/* 2. 调用记录 Tab（支持 10 行/页与自定义条数分页） */}
        {apiStatus === "approved" && activeTab === "calls" && (
          <section className={`${glass.surface} ${styles.panel} overflow-hidden`}>
            <div className="px-6 py-4 border-b border-orange-100/70 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  接口调用日志流水
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">全量记录近 50 次出口 IP 白名单请求与响应耗时</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label="每页显示条数"
                  value={callLogsPageSize}
                  onChange={(e) => {
                    setCallLogsPageSize(Number(e.target.value));
                    setCallLogsPage(1);
                  }}
                  className="h-8 rounded-lg border border-orange-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs"
                >
                  <option value={10}>10 条/页</option>
                  <option value={20}>20 条/页</option>
                  <option value={50}>50 条/页</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-semibold">请求时间</th>
                    <th className="px-5 py-3 font-semibold">接口操作</th>
                    <th className="px-5 py-3 font-semibold">方法</th>
                    <th className="px-5 py-3 font-semibold">路径</th>
                    <th className="px-5 py-3 font-semibold">HTTP 状态</th>
                    <th className="px-5 py-3 font-semibold">耗时</th>
                    <th className="px-5 py-3 font-semibold">出口 IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {pagedCallLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                        暂无接口调用日志
                      </td>
                    </tr>
                  ) : (
                    pagedCallLogs.map((row) => (
                      <tr key={row.id} className="hover:bg-orange-50/30 transition-colors">
                        <td className="px-5 py-3 text-slate-500 font-mono">{row.time}</td>
                        <td className="px-5 py-3 font-medium text-slate-900">{row.name}</td>
                        <td className="px-5 py-3 font-mono font-bold text-blue-600">{row.method}</td>
                        <td className="px-5 py-3 font-mono text-slate-800">{row.path}</td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                            {row.status} OK
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono text-slate-500">{row.ms}</td>
                        <td className="px-5 py-3 text-slate-600 font-mono">{row.ip}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 分页控制栏 */}
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              <div>共 {callLogs.length} 条记录 · 第 {callLogsPage} / {totalCallLogsPages} 页</div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs rounded-lg"
                  disabled={callLogsPage <= 1}
                  onClick={() => setCallLogsPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="mr-0.5 h-3.5 w-3.5" /> 上一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs rounded-lg"
                  disabled={callLogsPage >= totalCallLogsPages}
                  onClick={() => setCallLogsPage((p) => Math.min(totalCallLogsPages, p + 1))}
                >
                  下一页 <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* 3. API 订单 Tab（新增到调用记录右侧） */}
        {apiStatus === "approved" && activeTab === "orders" && (
          <section className={`${glass.surface} ${styles.panel} overflow-hidden space-y-4 p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-100/70 pb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-primary" />
                  API 开放订单明细
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">仅展示通过开放 API 接口完成扣费与自动交付的订单记录</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    value={ordersSearch}
                    onChange={(e) => {
                      setOrdersSearch(e.target.value);
                      setOrdersPage(1);
                    }}
                    placeholder="搜索订单号或商品..."
                    className="h-8 w-44 rounded-lg pl-8 text-xs bg-white"
                  />
                </div>
                <select
                  aria-label="每页显示条数"
                  value={ordersPageSize}
                  onChange={(e) => {
                    setOrdersPageSize(Number(e.target.value));
                    setOrdersPage(1);
                  }}
                  className="h-8 rounded-lg border border-orange-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs"
                >
                  <option value={10}>10 条/页</option>
                  <option value={20}>20 条/页</option>
                  <option value={50}>50 条/页</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">创建时间</th>
                    <th className="px-4 py-3 font-semibold">订单号</th>
                    <th className="px-4 py-3 font-semibold">商品名称</th>
                    <th className="px-4 py-3 font-semibold">实付金额</th>
                    <th className="px-4 py-3 font-semibold">交付状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {pagedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
                        暂无 API 订单记录
                      </td>
                    </tr>
                  ) : (
                    pagedOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-orange-50/30 transition-colors">
                        <td className="px-4 py-3 text-slate-500 font-mono">{ord.createdAt}</td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">{ord.orderNo}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{ord.productName}</td>
                        <td className="px-4 py-3 font-mono font-bold text-primary">¥{ord.amount.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                            {ord.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 分页控制栏 */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
              <div>共 {filteredOrders.length} 个订单 · 第 {ordersPage} / {totalOrdersPages} 页</div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs rounded-lg"
                  disabled={ordersPage <= 1}
                  onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="mr-0.5 h-3.5 w-3.5" /> 上一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs rounded-lg"
                  disabled={ordersPage >= totalOrdersPages}
                  onClick={() => setOrdersPage((p) => Math.min(totalOrdersPages, p + 1))}
                >
                  下一页 <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* 4. 接口文档指南：标准开放平台卖家 API 文档（未开通时点击右上角查看文档亦可预览） */}
        {((apiStatus === "approved" && activeTab === "docs") || (apiStatus !== "approved" && viewingDocsWhileUnapproved)) && (
          <div className="space-y-6">
            {/* 全局接入协议与规范 */}
            <section className={`${glass.surface} ${styles.panel} p-6 space-y-4`}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-primary" />
                  接口协议与通用接入规范
                </h2>
                <span className="text-xs font-semibold rounded-full bg-orange-100 px-2.5 py-0.5 text-primary">
                  协议版本: v1.0
                </span>
              </div>
              <div className="text-xs text-slate-600 space-y-2 leading-relaxed">
                <p>• <strong>通信协议</strong>：全站强制采用 HTTPS 协议交互，传输编码统一使用 <code>UTF-8</code>。</p>
                <p>• <strong>鉴权机制</strong>：接口请求 Header 须携带 <code>Authorization: Bearer &lt;AppSecret&gt;</code> 与 <code>X-Merchant-Id: &lt;AppID&gt;</code>。</p>
                <p>• <strong>网络白名单</strong>：生产环境下所有请求必须由管理员后台加白的出口公网 IP 发起，否则系统直接拒绝并返回 403。</p>
                <p>• <strong>通用响应格式</strong>：所有接口统一返回标准 JSON，格式为 <code>{`{ "code": 200, "message": "success", "data": ..., "timestamp": 1732338000 }`}</code>。</p>
              </div>
            </section>

            {/* 接口 1: 获取商品列表 */}
            <section className={`${glass.surface} ${styles.panel} p-6 space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700 font-mono">GET</span>
                  <code className="text-sm font-bold font-mono text-slate-900">/api/v1/products</code>
                </div>
                <span className="text-xs text-slate-500 font-medium">1. 查询全部在售商品与实时库存</span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0d131f] p-4 text-xs font-mono text-slate-300 overflow-x-auto">
                <pre>{`// 请求头 Headers
Authorization: Bearer ${apiKey || "YOUR_APP_SECRET"}
X-Merchant-Id: ${appId || "YOUR_APP_ID"}
Accept: application/json

// 响应示例 (200 OK)
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "prod_gemini_pro",
      "name": "Gemini Pro（Pixel/Jio开通）成品账号",
      "price": 17.50,
      "stock": 35,
      "category": "ai-membership"
    }
  ]
}`}</pre>
              </div>
            </section>

            {/* 接口 2: 查询账户资产与余额 */}
            <section className={`${glass.surface} ${styles.panel} p-6 space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700 font-mono">GET</span>
                  <code className="text-sm font-bold font-mono text-slate-900">/api/v1/user/assets</code>
                </div>
                <span className="text-xs text-slate-500 font-medium">2. 查询商户可用余额与信用额度</span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0d131f] p-4 text-xs font-mono text-slate-300 overflow-x-auto">
                <pre>{`// 响应示例 (200 OK)
{
  "code": 200,
  "message": "success",
  "data": {
    "balance": 4.50,
    "currency": "CNY",
    "status": "active"
  }
}`}</pre>
              </div>
            </section>

            {/* 接口 3: 自动化提交采购订单 */}
            <section className={`${glass.surface} ${styles.panel} p-6 space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 font-mono">POST</span>
                  <code className="text-sm font-bold font-mono text-slate-900">/api/v1/orders/create</code>
                </div>
                <span className="text-xs text-slate-500 font-medium">3. 自动扣费采购下单与卡密交付</span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0d131f] p-4 text-xs font-mono text-slate-300 overflow-x-auto">
                <pre>{`// 请求 Payload (JSON)
{
  "productId": "prod_gemini_pro",
  "quantity": 1,
  "clientOrderId": "EXT_ORDER_20261123_001",
  "customerEmail": "user@example.com"
}

// 响应示例 (200 OK)
{
  "code": 200,
  "message": "order created and delivered",
  "data": {
    "orderNo": "2026081101022967415473",
    "status": "delivered",
    "productName": "Gemini Pro（Pixel/Jio开通）成品账号",
    "amount": 17.50,
    "delivery": {
      "cards": "GEMINI_PRO_ACC_71829||PWD_9918"
    }
  }
}`}</pre>
              </div>
            </section>

            {/* 接口 4: 订单状态与卡密查询 */}
            <section className={`${glass.surface} ${styles.panel} p-6 space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700 font-mono">GET</span>
                  <code className="text-sm font-bold font-mono text-slate-900">/api/v1/orders/[orderNo]</code>
                </div>
                <span className="text-xs text-slate-500 font-medium">4. 根据平台订单号复核履约状态与提取卡密</span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0d131f] p-4 text-xs font-mono text-slate-300 overflow-x-auto">
                <pre>{`// 响应示例 (200 OK)
{
  "code": 200,
  "message": "success",
  "data": {
    "orderNo": "2026081101022967415473",
    "status": "completed",
    "deliveryStatus": "delivered",
    "cards": "GEMINI_PRO_ACC_71829||PWD_9918",
    "amount": 17.50
  }
}`}</pre>
              </div>
            </section>
          </div>
        )}

        {/* 5. 安全设置：删除小字，优化加白引导 */}
        {apiStatus === "approved" && activeTab === "security" && (
          <div className="space-y-5">
            <section className={`${glass.surface} ${styles.panel} p-6 space-y-5`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    已生效的服务器 IP 白名单
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    调用商户订单与扣费 API 的请求必须来自以下白名单 IP。<strong>为保障资金安全，白名单由平台统一审核管控，商户不可在此自主加白。</strong>
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 shrink-0">
                  <Lock className="h-3.5 w-3.5" />
                  后台风控托管
                </span>
              </div>

              {/* 已加白列表展示（删除小字：仅限管理员后台增删） */}
              <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>当前授权公网 IP 列表 ({whitelistIps.length} 个)</span>
                </div>
                {whitelistIps.length > 0 ? (
                  <div className="space-y-2">
                    {whitelistIps.map((ip, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl border border-white/80 bg-white/90 px-4 py-2.5 text-xs font-mono shadow-2xs"
                      >
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-emerald-600" />
                          <span className="font-bold text-slate-800">{ip}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          已加白 · 运行中
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-orange-200 bg-white/60 p-6 text-center text-xs text-slate-500">
                    暂未绑定有效 IP 白名单，请联系平台管理员或客服加白。
                  </div>
                )}
              </div>

              {/* 申请加白引导提示：查看接口协议直接切换至文档 */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-xs">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-800">如需新增或变更服务器 IP？</div>
                  <div className="text-slate-500">请联系专属在线客服或提交加白工单，管理员将在后台代理管理中心为您配置。</div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("docs")}
                  className="inline-flex items-center gap-1 text-primary hover:underline font-semibold shrink-0 ml-4 cursor-pointer"
                >
                  <span>查看接口协议与文档</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
              <h3 className="text-sm font-bold text-slate-900">密钥与白名单风控规范</h3>
              <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1.5 leading-relaxed">
                <li>接口调用采用「商户密钥签名 + 服务器 IP 白名单」双因子鉴权，非白名单 IP 请求将直接返回 403 Forbidden。</li>
                <li>商户密钥具有账户余额扣费权限，切勿泄露或硬编码进客户端软件。</li>
                <li>若服务器迁移或机房变更，请提前 24 小时向客服申请新增白名单 IP。</li>
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
