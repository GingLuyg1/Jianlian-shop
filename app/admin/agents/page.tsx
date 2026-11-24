"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Code2,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Store,
  Trash2,
  TrendingUp,
  UserCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import AdminPageShell from "@/components/admin/AdminPageShell";
import {
  AdminListPagination,
  AdminListSurface,
  AdminTableViewport,
  adminListControlClass,
  adminListRowClass,
  adminListTableHeadClass,
} from "@/components/admin/v2/AdminList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";
import { cn } from "@/lib/utils";

type AgentTab = "applications" | "management" | "whitelist" | "orders";

export interface ApiApplication {
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

export interface WhitelistEntry {
  id: string;
  email: string;
  merchantName: string;
  appId: string;
  ip: string;
  remark: string;
  addedAt: string;
  status: "active" | "disabled";
}

export interface AgentOrder {
  id: string;
  orderNo: string;
  merchantEmail: string;
  appId: string;
  productName: string;
  /** 实付结算金额 */
  amount: number;
  /** 订单原价/面值金额 */
  orderAmount?: number;
  /** 供货渠道成本金额 */
  costAmount?: number;
  /** 平台净利润 */
  profitAmount?: number;
  channel?: string;
  deliveryStatus: "auto_delivered" | "processing" | "pending";
  createdAt: string;
}

// 历史演示假数据 ID 集合：自动识别并清理，确保页面仅展示真实业务数据
const LEGACY_FAKE_APP_IDS = new Set([
  "APP_1732204801",
  "APP_1732203920",
  "APP_1732198000",
]);
const LEGACY_FAKE_WL_IDS = new Set(["WL_01", "WL_02", "WL_03"]);
const LEGACY_FAKE_ORDER_IDS = new Set([
  "ORD_AG_1001",
  "ORD_AG_1002",
  "ORD_AG_1003",
]);

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

/**
 * 订单金额与利润核算逻辑：
 * - paidAmount: 实付结算金额
 * - orderAmount: 订单原价（若无折扣则等于实付金额）
 * - costAmount: 优先取真实供货成本；若未标注显式成本，则根据订单商品类型核算供货成本
 * - profitAmount: 实付结算金额 - 供货成本
 * - marginPercent: 利润率 (%)
 */
function computeOrderFinancials(ord: AgentOrder) {
  const paidAmount = Math.max(0, Number(ord.amount) || 0);
  const orderAmount =
    ord.orderAmount && Number(ord.orderAmount) >= paidAmount
      ? Number(ord.orderAmount)
      : paidAmount;

  let costAmount: number;
  if (typeof ord.costAmount === "number" && ord.costAmount >= 0) {
    costAmount = ord.costAmount;
  } else {
    // 根据商品名称特征估算标准渠道供货成本率（82% ~ 88%）
    const name = (ord.productName || "").toLowerCase();
    const costRatio =
      name.includes("chatgpt") || name.includes("claude") || name.includes("grok")
        ? 0.84
        : name.includes("sim") || name.includes("giffgaff") || name.includes("卡")
        ? 0.82
        : 0.85;
    costAmount = Number((paidAmount * costRatio).toFixed(2));
  }

  const profitAmount =
    typeof ord.profitAmount === "number"
      ? ord.profitAmount
      : Number((paidAmount - costAmount).toFixed(2));

  const marginPercent =
    paidAmount > 0 ? Number(((profitAmount / paidAmount) * 100).toFixed(1)) : 0;

  return {
    orderAmount,
    paidAmount,
    costAmount,
    profitAmount,
    marginPercent,
  };
}

function notifySidebarBadgesUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("jianlian-admin-badges-updated"));
  }
}

export default function AdminAgentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: AgentTab =
    rawTab === "management" || rawTab === "whitelist" || rawTab === "orders" || rawTab === "applications"
      ? rawTab
      : "applications";

  const [applications, setApplications] = useState<ApiApplication[]>([]);
  const [whitelists, setWhitelists] = useState<WhitelistEntry[]>([]);
  const [orders, setOrders] = useState<AgentOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [search, setSearch] = useState("");
  const {
    containerRef: agentTabsRef,
    setItemRef: setAgentTabRef,
    indicator: agentTabIndicator,
  } = useSlidingIndicator<AgentTab>(activeTab, [applications.length]);

  // 分页与每页条数状态
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // 手动加白对话框
  const [addWhitelistOpen, setAddWhitelistOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addMchName, setAddMchName] = useState("");
  const [addIp, setAddIp] = useState("");
  const [addRemark, setAddRemark] = useState("");

  // 切换 Tab 时重置页码
  useEffect(() => {
    setPage(1);
  }, [activeTab, search, pageSize]);

  // 加载真实数据并清理历史演示假数据
  const loadRealAgentData = useCallback(async () => {
    if (typeof window === "undefined") return;
    let cleanApps: ApiApplication[] = [];
    let cleanWls: WhitelistEntry[] = [];
    let localOrders: AgentOrder[] = [];

    try {
      const rawApps = window.localStorage.getItem("jianlian_admin_api_applications");
      if (rawApps) {
        const parsed = JSON.parse(rawApps);
        if (Array.isArray(parsed)) {
          cleanApps = parsed.filter(
            (item: ApiApplication) => item && !LEGACY_FAKE_APP_IDS.has(item.id)
          );
          if (cleanApps.length !== parsed.length) {
            window.localStorage.setItem(
              "jianlian_admin_api_applications",
              JSON.stringify(cleanApps)
            );
          }
        }
      }
      // 自动扫描前台已开通的商户（jianlian_mch_app_status_<email> === "approved"）并同步到后台列表中，确保前后台信息完全同步
      let syncedNew = false;
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith("jianlian_mch_app_status_")) continue;
        const emailKey = key.replace("jianlian_mch_app_status_", "").trim();
        if (!emailKey) continue;
        const statusVal = window.localStorage.getItem(key);
        if (statusVal === "approved" && !cleanApps.some((a) => a.email === emailKey)) {
          const savedAppId = window.localStorage.getItem(`jianlian_mch_app_id_${emailKey}`) || `MCH_${Math.floor(10000000 + Math.random() * 90000000)}`;
          const savedSecret = window.localStorage.getItem(`jianlian_developer_key_${emailKey}`) || "";
          let savedIps: string[] = [];
          try {
            const rawIps = window.localStorage.getItem(`jianlian_mch_whitelist_${emailKey}`);
            if (rawIps) {
              const parsedIps = JSON.parse(rawIps);
              if (Array.isArray(parsedIps)) savedIps = parsedIps.filter(Boolean);
            }
          } catch {}
          cleanApps.unshift({
            id: `APP_SYNC_${Date.now()}_${i}`,
            email: emailKey,
            merchantName: emailKey.split("@")[0] || "平台认证商户",
            businessScenario: "开放平台标准 API 自动化订单与库存对接",
            serverIps: savedIps,
            contact: emailKey,
            status: "approved",
            appliedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
            appId: savedAppId,
            appSecret: savedSecret,
          });
          syncedNew = true;
        }
      }
      if (syncedNew) {
        window.localStorage.setItem(
          "jianlian_admin_api_applications",
          JSON.stringify(cleanApps)
        );
      }
    } catch {}

    try {
      const rawWl = window.localStorage.getItem("jianlian_admin_ip_whitelist");
      if (rawWl) {
        const parsed = JSON.parse(rawWl);
        if (Array.isArray(parsed)) {
          cleanWls = parsed.filter(
            (item: WhitelistEntry) => item && !LEGACY_FAKE_WL_IDS.has(item.id)
          );
          if (cleanWls.length !== parsed.length) {
            window.localStorage.setItem(
              "jianlian_admin_ip_whitelist",
              JSON.stringify(cleanWls)
            );
          }
        }
      }
    } catch {}

    try {
      const rawOrders = window.localStorage.getItem("jianlian_admin_agent_orders");
      if (rawOrders) {
        const parsed = JSON.parse(rawOrders);
        if (Array.isArray(parsed)) {
          localOrders = parsed.filter(
            (item: AgentOrder) => item && !LEGACY_FAKE_ORDER_IDS.has(item.id)
          );
          if (localOrders.length !== parsed.length) {
            window.localStorage.setItem(
              "jianlian_admin_agent_orders",
              JSON.stringify(localOrders)
            );
          }
        }
      }
    } catch {}

    setApplications(cleanApps);
    setWhitelists(cleanWls);
    notifySidebarBadgesUpdated();

    // 从后台真实订单 API 拉取真实开放 API 订单并整合利润数据
    setLoadingOrders(true);
    try {
      const res = await fetch("/api/admin/orders?page=1&pageSize=50", {
        cache: "no-store",
      });
      if (res.ok) {
        const payload = await res.json().catch(() => null);
        const apiRows = Array.isArray(payload?.orders) ? payload.orders : [];
        const apiOnlyRows = apiRows.filter((row: any) => {
          const isApi =
            row.source === "api" ||
            row.channel === "api" ||
            row.order_source === "api" ||
            (row.app_id && row.app_id !== "DIRECT_ORDER");
          return Boolean(isApi);
        });
        const mappedRealOrders: AgentOrder[] = apiOnlyRows.map((row: any) => {
          const itemSummary =
            Array.isArray(row.order_items) && row.order_items.length > 0
              ? row.order_items
                  .map((it: any) => `${it.product_name || "商品"} x${it.quantity || 1}`)
                  .join("、")
              : row.product_name || "平台数字商品订单";
          const totalAmount = Number(row.total_amount ?? row.amount ?? 0);
          const rawCost =
            row.cost_amount !== undefined && row.cost_amount !== null
              ? Number(row.cost_amount)
              : row.supplier_cost !== undefined && row.supplier_cost !== null
              ? Number(row.supplier_cost)
              : undefined;
          const statusStr = String(row.status || "").toLowerCase();
          const isDelivered =
            statusStr === "delivered" ||
            statusStr === "completed" ||
            statusStr === "fulfilled";

          return {
            id: String(row.id || row.order_no),
            orderNo: String(row.order_no || row.id || "—"),
            merchantEmail: String(row.customer_email || row.user_email || "真实客户订单"),
            appId: row.app_id ? String(row.app_id) : "DIRECT_ORDER",
            productName: itemSummary,
            amount: totalAmount,
            orderAmount: Number(row.original_amount ?? totalAmount),
            costAmount: rawCost,
            deliveryStatus: isDelivered ? "auto_delivered" : "processing",
            createdAt: row.created_at
              ? new Date(row.created_at).toLocaleString("zh-CN", { hour12: false })
              : "—",
          };
        });

        const existingIds = new Set(mappedRealOrders.map((o) => o.orderNo));
        const merged = [
          ...mappedRealOrders,
          ...localOrders.filter((o) => !existingIds.has(o.orderNo)),
        ];
        setOrders(merged);
      } else {
        setOrders(localOrders);
      }
    } catch {
      setOrders(localOrders);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    void loadRealAgentData();
  }, [loadRealAgentData]);

  const switchTab = (tab: AgentTab) => {
    router.replace(`/admin/agents?tab=${tab}`);
  };

  // 审核通过
  const handleApprove = (app: ApiApplication) => {
    const freshAppId = `MCH_${Math.floor(10000000 + Math.random() * 90000000)}`;
    const chars = "abcdef0123456789";
    let randomSecret = "";
    for (let i = 0; i < 32; i++) {
      randomSecret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const freshSecret = `jl_live_${randomSecret}`;

    const updatedApps = applications.map((item) =>
      item.id === app.id
        ? {
            ...item,
            status: "approved" as const,
            appId: freshAppId,
            appSecret: freshSecret,
          }
        : item
    );
    setApplications(updatedApps);
    window.localStorage.setItem(
      "jianlian_admin_api_applications",
      JSON.stringify(updatedApps)
    );
    notifySidebarBadgesUpdated();

    // 同步给该用户的前台凭证状态
    window.localStorage.setItem(`jianlian_mch_app_status_${app.email}`, "approved");
    window.localStorage.setItem(`jianlian_mch_app_id_${app.email}`, freshAppId);
    window.localStorage.setItem(`jianlian_developer_key_${app.email}`, freshSecret);

    // 自动将拟加白 IP 录入白名单池
    if (app.serverIps && app.serverIps.length > 0) {
      const newEntries: WhitelistEntry[] = app.serverIps.map((ip, idx) => ({
        id: `WL_${Date.now()}_${idx}`,
        email: app.email,
        merchantName: app.merchantName,
        appId: freshAppId,
        ip: ip.trim(),
        remark: "API审核通过自动加白",
        addedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
        status: "active",
      }));
      const nextWl = [...newEntries, ...whitelists];
      setWhitelists(nextWl);
      window.localStorage.setItem("jianlian_admin_ip_whitelist", JSON.stringify(nextWl));
      window.localStorage.setItem(
        `jianlian_mch_whitelist_${app.email}`,
        JSON.stringify(app.serverIps)
      );
    }

    toast.success(`商户 ${app.merchantName} API 申请已批准！已分配 AppID: ${freshAppId}`);
  };

  // 忽略 API 申请（从待办申请中移除，前台恢复为未申请状态）
  const handleReject = (app: ApiApplication) => {
    const updatedApps = applications.filter((item) => item.id !== app.id);
    setApplications(updatedApps);
    window.localStorage.setItem(
      "jianlian_admin_api_applications",
      JSON.stringify(updatedApps)
    );
    window.localStorage.setItem(`jianlian_mch_app_status_${app.email}`, "unapplied");
    notifySidebarBadgesUpdated();
    toast.info(`已忽略商户 ${app.merchantName} 的 API 申请`);
  };

  // 移除已开通商户的 API 接入权限（移除后需要重新申请）
  const handleRevoke = (app: ApiApplication) => {
    if (!window.confirm(`确定要移除商户【${app.merchantName}】的 API 权限吗？移除后该商户的 API 凭证将失效，需要重新提交申请才能再次开通。`)) {
      return;
    }
    const updatedApps = applications.filter((item) => item.id !== app.id);
    setApplications(updatedApps);
    window.localStorage.setItem(
      "jianlian_admin_api_applications",
      JSON.stringify(updatedApps)
    );
    window.localStorage.setItem(`jianlian_mch_app_status_${app.email}`, "revoked");
    window.localStorage.removeItem(`jianlian_mch_app_id_${app.email}`);
    window.localStorage.removeItem(`jianlian_developer_key_${app.email}`);

    // 联动清除该商户的白名单 IP
    const nextWl = whitelists.filter((w) => w.email !== app.email);
    setWhitelists(nextWl);
    window.localStorage.setItem("jianlian_admin_ip_whitelist", JSON.stringify(nextWl));
    window.localStorage.removeItem(`jianlian_mch_whitelist_${app.email}`);

    notifySidebarBadgesUpdated();
    toast.success(`已移除商户 ${app.merchantName} 的 API 权限，该商户需重新申请方可开通`);
  };

  // 删除白名单 IP
  const handleDeleteWhitelist = (entry: WhitelistEntry) => {
    const nextWl = whitelists.filter((w) => w.id !== entry.id);
    setWhitelists(nextWl);
    window.localStorage.setItem("jianlian_admin_ip_whitelist", JSON.stringify(nextWl));

    const remainingForEmail = nextWl
      .filter((w) => w.email === entry.email)
      .map((w) => w.ip);
    window.localStorage.setItem(
      `jianlian_mch_whitelist_${entry.email}`,
      JSON.stringify(remainingForEmail)
    );
    toast.success(`已从白名单中移除 IP: ${entry.ip}`);
  };

  // 手动新增白名单
  const handleAddWhitelistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addIp.trim()) {
      toast.error("请输入有效的服务器 IP 地址");
      return;
    }
    const cleanIp = addIp.trim();
    const newEntry: WhitelistEntry = {
      id: `WL_${Date.now()}`,
      email: addEmail.trim() || "admin_manual@jianlian.shop",
      merchantName: addMchName.trim() || "平台受控代理商户",
      appId: `MCH_${Math.floor(10000000 + Math.random() * 90000000)}`,
      ip: cleanIp,
      remark: addRemark.trim() || "管理员手动加白",
      addedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      status: "active",
    };
    const nextWl = [newEntry, ...whitelists];
    setWhitelists(nextWl);
    window.localStorage.setItem("jianlian_admin_ip_whitelist", JSON.stringify(nextWl));

    if (addEmail.trim()) {
      const remainingForEmail = nextWl
        .filter((w) => w.email === addEmail.trim())
        .map((w) => w.ip);
      window.localStorage.setItem(
        `jianlian_mch_whitelist_${addEmail.trim()}`,
        JSON.stringify(remainingForEmail)
      );
    }

    setAddWhitelistOpen(false);
    setAddIp("");
    setAddRemark("");
    setAddEmail("");
    setAddMchName("");
    toast.success(`成功为商户加白公网 IP: ${cleanIp}`);
  };

  // 搜索过滤与分页计算
  const pendingAppCount = useMemo(
    () => applications.filter((a) => a.status === "pending").length,
    [applications]
  );

  const filteredApplications = useMemo(() => {
    const pendingOnly = applications.filter((a) => a.status === "pending");
    const q = search.trim().toLowerCase();
    if (!q) return pendingOnly;
    return pendingOnly.filter(
      (a) =>
        a.merchantName.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.businessScenario.toLowerCase().includes(q) ||
        (a.appId && a.appId.toLowerCase().includes(q))
    );
  }, [applications, search]);

  const filteredMerchants = useMemo(() => {
    const approvedOnly = applications.filter((a) => a.status === "approved");
    const q = search.trim().toLowerCase();
    if (!q) return approvedOnly;
    return approvedOnly.filter(
      (a) =>
        a.merchantName.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.businessScenario.toLowerCase().includes(q) ||
        (a.appId && a.appId.toLowerCase().includes(q))
    );
  }, [applications, search]);

  const filteredWhitelists = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return whitelists;
    return whitelists.filter(
      (w) =>
        w.ip.toLowerCase().includes(q) ||
        w.merchantName.toLowerCase().includes(q) ||
        w.email.toLowerCase().includes(q) ||
        w.appId.toLowerCase().includes(q) ||
        w.remark.toLowerCase().includes(q)
    );
  }, [whitelists, search]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.orderNo.toLowerCase().includes(q) ||
        o.merchantEmail.toLowerCase().includes(q) ||
        o.productName.toLowerCase().includes(q) ||
        o.appId.toLowerCase().includes(q)
    );
  }, [orders, search]);

  const currentTotalCount =
    activeTab === "applications"
      ? filteredApplications.length
      : activeTab === "management"
      ? filteredMerchants.length
      : activeTab === "whitelist"
      ? filteredWhitelists.length
      : filteredOrders.length;

  const totalPages = Math.max(1, Math.ceil(currentTotalCount / pageSize));
  const safePage = Math.min(page, totalPages);

  const pagedApplications = useMemo(
    () => filteredApplications.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredApplications, safePage, pageSize]
  );

  const pagedMerchants = useMemo(
    () => filteredMerchants.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredMerchants, safePage, pageSize]
  );

  const pagedWhitelists = useMemo(
    () => filteredWhitelists.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredWhitelists, safePage, pageSize]
  );

  const pagedOrders = useMemo(
    () => filteredOrders.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredOrders, safePage, pageSize]
  );

  // 订单汇总金额与总利润
  const orderTotals = useMemo(() => {
    let totalPaid = 0;
    let totalProfit = 0;
    for (const o of orders) {
      const fin = computeOrderFinancials(o);
      totalPaid += fin.paidAmount;
      totalProfit += fin.profitAmount;
    }
    return {
      totalPaid: totalPaid.toFixed(2),
      totalProfit: totalProfit.toFixed(2),
    };
  }, [orders]);

  const renderPaginationBar = () => (
    <AdminListPagination
      summary={`共 ${currentTotalCount} 条真实记录`}
      page={safePage}
      totalPages={totalPages}
      loading={activeTab === "orders" && loadingOrders}
      leading={
        <label className="block w-[116px]">
          <span className="sr-only">每页显示数量</span>
          <select
            value={String(pageSize)}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className={cn(
              adminListControlClass,
              "w-full px-2.5 text-xs outline-none transition-colors"
            )}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} 条/页
              </option>
            ))}
          </select>
        </label>
      }
      onPrevious={() => setPage((p) => Math.max(1, p - 1))}
      onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
    />
  );

  return (
    <AdminPageShell
      variant="v2"
      title="代理与分销管理"
      description="统一管理商户 API 接入申请、集中维护服务器 IP 白名单、监控分销代理订单与利润核算。"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadRealAgentData()}
          disabled={loadingOrders}
          className="h-9 text-xs"
        >
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loadingOrders && "animate-spin")} />
          刷新真实数据
        </Button>
      }
    >
      {/* 使用 flex-1 min-h-0 overflow-hidden 且无多余 pb-6，使底部内容框与左侧导航栏 100% 精准持平 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        {/* 顶部统计面板 */}
        <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-orange-100 bg-white/90 px-4 py-3 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">待审核 API 申请</span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-2xl font-black font-mono text-slate-900">
                {pendingAppCount}
              </span>
              {pendingAppCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  待办 {pendingAppCount}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-amber-600 font-medium">
              {pendingAppCount > 0 ? "需要平台管理员核验" : "当前无待办审核申请"}
            </div>
          </div>

          <div className="rounded-2xl border border-orange-100 bg-white/90 px-4 py-3 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">已生效白名单 IP</span>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-1.5 text-2xl font-black font-mono text-slate-900">
              {whitelists.length}
            </div>
            <div className="mt-0.5 text-[11px] text-emerald-600 font-medium">
              后台严格风控授权中
            </div>
          </div>

          <div className="rounded-2xl border border-orange-100 bg-white/90 px-4 py-3 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">分销与平台订单</span>
              <Store className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-1.5 text-2xl font-black font-mono text-slate-900">
              {orders.length}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-600 font-medium">
              实付 ¥{orderTotals.totalPaid} · 净利{" "}
              <span className="font-bold text-emerald-600">+¥{orderTotals.totalProfit}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-orange-100 bg-white/90 px-4 py-3 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">已开通商户数</span>
              <UserCheck className="h-4 w-4 text-blue-600" />
            </div>
            <div className="mt-1.5 text-2xl font-black font-mono text-slate-900">
              {applications.filter((a) => a.status === "approved").length}
            </div>
            <div className="mt-0.5 text-[11px] text-blue-600 font-medium">
              享受全自动秒级卡密回调
            </div>
          </div>
        </div>

        {/* 顶部 Tab 切换、搜索框与操作栏（带精确 DOM 测量的丝滑滑动指示器） */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div
            ref={agentTabsRef}
            className="relative flex rounded-2xl bg-slate-100/90 p-1 border border-slate-200/80 shadow-2xs"
          >
            {agentTabIndicator.visible && (
              <div
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute top-1 bottom-1 rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70",
                  agentTabIndicator.animated && "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                )}
                style={{
                  left: `${agentTabIndicator.left}px`,
                  width: `${agentTabIndicator.width}px`,
                }}
              />
            )}

            <button
              ref={setAgentTabRef("applications")}
              type="button"
              onClick={() => switchTab("applications")}
              className={cn(
                "relative z-10 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors duration-200 cursor-pointer whitespace-nowrap",
                activeTab === "applications"
                  ? "text-primary font-black"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Code2 className="h-3.5 w-3.5" />
              API 申请记录
              {pendingAppCount > 0 && (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] text-white font-mono font-bold">
                  {pendingAppCount}
                </span>
              )}
            </button>

            <button
              ref={setAgentTabRef("management")}
              type="button"
              onClick={() => switchTab("management")}
              className={cn(
                "relative z-10 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors duration-200 cursor-pointer whitespace-nowrap",
                activeTab === "management"
                  ? "text-primary font-black"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <UserCheck className="h-3.5 w-3.5" />
              API管理
            </button>

            <button
              ref={setAgentTabRef("whitelist")}
              type="button"
              onClick={() => switchTab("whitelist")}
              className={cn(
                "relative z-10 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors duration-200 cursor-pointer whitespace-nowrap",
                activeTab === "whitelist"
                  ? "text-primary font-black"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              IP 加白管理
            </button>

            <button
              ref={setAgentTabRef("orders")}
              type="button"
              onClick={() => switchTab("orders")}
              className={cn(
                "relative z-10 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors duration-200 cursor-pointer whitespace-nowrap",
                activeTab === "orders"
                  ? "text-primary font-black"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Store className="h-3.5 w-3.5" />
              分销代理订单
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative w-56 sm:w-64">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  activeTab === "applications" || activeTab === "management"
                    ? "搜索商户名称、邮箱或场景..."
                    : activeTab === "whitelist"
                    ? "搜索白名单 IP、商户或备注..."
                    : "搜索订单号、邮箱或商品..."
                }
                className={cn(adminListControlClass, "h-9 pl-8 text-xs")}
              />
            </div>

            {activeTab === "whitelist" && (
              <Button
                type="button"
                size="sm"
                onClick={() => setAddWhitelistOpen(true)}
                className="h-9 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                添加白名单 IP
              </Button>
            )}
          </div>
        </div>

        {/* 1. API 申请记录 Tab（仅管理待审核的 API 申请，审核操作：通过 / 忽略） */}
        {activeTab === "applications" && (
          <AdminListSurface className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <AdminTableViewport>
              <table className="w-full text-left text-xs">
                <thead className={adminListTableHeadClass}>
                  <tr>
                    <th className="px-4 py-3 font-semibold">商户主体 / 邮箱</th>
                    <th className="px-4 py-3 font-semibold">业务场景说明</th>
                    <th className="px-4 py-3 font-semibold">拟加白服务器 IP</th>
                    <th className="px-4 py-3 font-semibold">联系方式</th>
                    <th className="px-4 py-3 font-semibold">申请时间</th>
                    <th className="px-4 py-3 font-semibold">状态</th>
                    <th className="px-4 py-3 font-semibold text-center">审核操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {pagedApplications.length > 0 ? (
                    pagedApplications.map((app) => (
                      <tr key={app.id} className={adminListRowClass}>
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-900">{app.merchantName}</div>
                          <div className="text-[11px] font-mono text-slate-500">{app.email}</div>
                        </td>
                        <td
                          className="px-4 py-3.5 max-w-[220px] truncate"
                          title={app.businessScenario}
                        >
                          {app.businessScenario}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-800">
                          {app.serverIps && app.serverIps.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {app.serverIps.map((ip, idx) => (
                                <span
                                  key={idx}
                                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]"
                                >
                                  {ip}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">未提供</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{app.contact}</td>
                        <td className="px-4 py-3.5 font-mono text-slate-500 text-[11px]">
                          {app.appliedAt}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
                            <Clock className="h-3 w-3 animate-pulse" /> 待管理员审核
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center space-x-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleApprove(app)}
                            className="h-7 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            通过
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleReject(app)}
                            className="h-7 px-3 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            忽略
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="h-64 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center space-y-1.5">
                          <Code2 className="h-7 w-7 text-slate-300" />
                          <p className="text-sm font-semibold text-slate-700">
                            暂无待审核的 API 接入申请记录
                          </p>
                          <p className="text-xs text-slate-400">
                            当用户在前台「个人中心 - API 接口」提交申请后，将实时展示在此处；审核通过的商户可在「API管理」中查看与管理。
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </AdminTableViewport>
            {renderPaginationBar()}
          </AdminListSurface>
        )}

        {/* 2. API管理 Tab（管理已开通 API 的商户，支持移除 API，移除后需重新申请） */}
        {activeTab === "management" && (
          <AdminListSurface className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <AdminTableViewport>
              <table className="w-full text-left text-xs">
                <thead className={adminListTableHeadClass}>
                  <tr>
                    <th className="px-4 py-3 font-semibold">商户主体 / 邮箱</th>
                    <th className="px-4 py-3 font-semibold">商户 AppID</th>
                    <th className="px-4 py-3 font-semibold">业务场景说明</th>
                    <th className="px-4 py-3 font-semibold">已加白服务器 IP</th>
                    <th className="px-4 py-3 font-semibold">开通时间</th>
                    <th className="px-4 py-3 font-semibold">状态</th>
                    <th className="px-4 py-3 font-semibold text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {pagedMerchants.length > 0 ? (
                    pagedMerchants.map((app) => {
                      const merchantWls = whitelists.filter((w) => w.email === app.email);
                      const displayIps =
                        merchantWls.length > 0
                          ? merchantWls.map((w) => w.ip)
                          : app.serverIps || [];
                      return (
                        <tr key={app.id} className={adminListRowClass}>
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-slate-900">{app.merchantName}</div>
                            <div className="text-[11px] font-mono text-slate-500">{app.email}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-block rounded bg-orange-50 px-2 py-0.5 text-xs font-mono font-bold text-primary border border-orange-200">
                              {app.appId || "MCH_ACTIVE"}
                            </span>
                          </td>
                          <td
                            className="px-4 py-3.5 max-w-[220px] truncate"
                            title={app.businessScenario}
                          >
                            {app.businessScenario}
                          </td>
                          <td className="px-4 py-3.5 font-mono text-slate-800">
                            {displayIps.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {displayIps.map((ip, idx) => (
                                  <span
                                    key={idx}
                                    className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]"
                                  >
                                    {ip}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400">暂未加白</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 font-mono text-slate-500 text-[11px]">
                            {app.appliedAt}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" /> 已开通运行中
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleRevoke(app)}
                              className="h-7 px-2.5 rounded-lg text-xs font-semibold text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              移除 API
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="h-64 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center space-y-1.5">
                          <UserCheck className="h-7 w-7 text-slate-300" />
                          <p className="text-sm font-semibold text-slate-700">
                            暂无已开通 API 的商户
                          </p>
                          <p className="text-xs text-slate-400">
                            在「API 申请记录」中审核通过的商户将展示在此处，支持随时移除 API 权限（移除后需重新申请）。
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </AdminTableViewport>
            {renderPaginationBar()}
          </AdminListSurface>
        )}

        {/* 2. IP 加白管理 Tab（flex-1 撑满到底部，与左侧栏完全持平） */}
        {activeTab === "whitelist" && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <AdminListSurface className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <AdminTableViewport>
                <table className="w-full text-left text-xs">
                  <thead className={adminListTableHeadClass}>
                    <tr>
                      <th className="px-4 py-3 font-semibold">白名单 IP 地址</th>
                      <th className="px-4 py-3 font-semibold">归属商户主体</th>
                      <th className="px-4 py-3 font-semibold">商户 AppID</th>
                      <th className="px-4 py-3 font-semibold">服务器说明 / 备注</th>
                      <th className="px-4 py-3 font-semibold">加白生效时间</th>
                      <th className="px-4 py-3 font-semibold">状态</th>
                      <th className="px-4 py-3 font-semibold text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {pagedWhitelists.length > 0 ? (
                      pagedWhitelists.map((wl) => (
                        <tr key={wl.id} className={adminListRowClass}>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900">
                              <Server className="h-3.5 w-3.5 text-emerald-600" />
                              {wl.ip}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-slate-800">{wl.merchantName}</div>
                            <div className="text-[11px] font-mono text-slate-400">{wl.email}</div>
                          </td>
                          <td className="px-4 py-3.5 font-mono text-slate-600">{wl.appId}</td>
                          <td className="px-4 py-3.5 text-slate-600">{wl.remark}</td>
                          <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500">
                            {wl.addedAt}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" /> 生效运行中
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteWhitelist(wl)}
                              className="h-7 px-2 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              移除加白
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="h-64 text-center text-slate-500">
                          <div className="flex flex-col items-center justify-center space-y-1.5">
                            <ShieldCheck className="h-7 w-7 text-slate-300" />
                            <p className="text-sm font-semibold text-slate-700">
                              暂无已加白的服务器 IP
                            </p>
                            <p className="text-xs text-slate-400">
                              批准商户 API 申请后将自动同步加白 IP，您也可以点击右上角「添加白名单 IP」手动录入。
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </AdminTableViewport>
              {renderPaginationBar()}
            </AdminListSurface>
          </div>
        )}

        {/* 3. 分销代理订单 Tab（配备完整的订单金额/成本/净利润计算逻辑，且与左侧栏底部持平） */}
        {activeTab === "orders" && (
          <AdminListSurface className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <AdminTableViewport>
              <table className="w-full text-left text-xs">
                <thead className={adminListTableHeadClass}>
                  <tr>
                    <th className="px-4 py-3 font-semibold">订单编号</th>
                    <th className="px-4 py-3 font-semibold">代理商户 / 客户邮箱</th>
                    <th className="px-4 py-3 font-semibold">商品名称</th>
                    <th className="px-4 py-3 font-semibold">实付金额</th>
                    <th className="px-4 py-3 font-semibold">订单金额/利润</th>
                    <th className="px-4 py-3 font-semibold">履约交付状态</th>
                    <th className="px-4 py-3 font-semibold">下单时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {pagedOrders.length > 0 ? (
                    pagedOrders.map((ord) => {
                      const fin = computeOrderFinancials(ord);
                      const isPositiveProfit = fin.profitAmount >= 0;
                      return (
                        <tr key={ord.id} className={adminListRowClass}>
                          <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                            {ord.orderNo}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-slate-800">
                              {ord.merchantEmail}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">
                              {ord.appId}
                            </div>
                          </td>
                          <td
                            className="px-4 py-3.5 max-w-[240px] truncate"
                            title={ord.productName}
                          >
                            {ord.productName}
                          </td>
                          <td className="px-4 py-3.5 font-mono font-bold text-orange-600 tabular-nums">
                            ¥{fin.paidAmount.toFixed(2)}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600 tabular-nums">
                                <span>总额 ¥{fin.orderAmount.toFixed(2)}</span>
                                <span className="text-slate-300">|</span>
                                <span>成本 ¥{fin.costAmount.toFixed(2)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums border",
                                    isPositiveProfit
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                                      : "bg-amber-50 text-amber-700 border-amber-200/80"
                                  )}
                                >
                                  <TrendingUp className="h-3 w-3 shrink-0" />
                                  净利 {isPositiveProfit ? "+" : ""}¥
                                  {fin.profitAmount.toFixed(2)} ({fin.marginPercent}%)
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            {ord.deliveryStatus === "auto_delivered" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="h-3 w-3" /> 已交付完成
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
                                <Clock className="h-3 w-3 animate-pulse" /> 履约处理中
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500">
                            {ord.createdAt}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="h-64 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center space-y-1.5">
                          <Store className="h-7 w-7 text-slate-300" />
                          <p className="text-sm font-semibold text-slate-700">
                            {loadingOrders ? "正在同步真实订单数据..." : "暂无分销代理订单记录"}
                          </p>
                          <p className="text-xs text-slate-400">
                            真实订单产生后，系统将自动在此核算每笔订单的实付金额、供货成本与平台净利润。
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </AdminTableViewport>
            {renderPaginationBar()}
          </AdminListSurface>
        )}
      </div>

      {/* 手动加白对话框 */}
      <Dialog open={addWhitelistOpen} onOpenChange={setAddWhitelistOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              为商户添加服务器 IP 白名单
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddWhitelistSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">商户登录邮箱</label>
              <Input
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="例如：merchant@example.com"
                className="h-10 text-xs"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">商户主体名称</label>
              <Input
                value={addMchName}
                onChange={(e) => setAddMchName(e.target.value)}
                placeholder="例如：企业或开发者主体名称"
                className="h-10 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                服务器公网 IP <span className="text-red-500">*</span>
              </label>
              <Input
                value={addIp}
                onChange={(e) => setAddIp(e.target.value)}
                placeholder="例如：124.220.100.12"
                className="h-10 font-mono text-xs"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">用途或机房备注</label>
              <Input
                value={addRemark}
                onChange={(e) => setAddRemark(e.target.value)}
                placeholder="例如：香港机房自动化采购节点"
                className="h-10 text-xs"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddWhitelistOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                确认加白
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminPageShell>
  );
}
