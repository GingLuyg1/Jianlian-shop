"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  Filter,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Server,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Store,
  Terminal,
  Trash2,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import AdminPageShell from "@/components/admin/AdminPageShell";
import {
  AdminFilterBar,
  AdminListSurface,
  AdminTableViewport,
  adminListControlClass,
  adminListRowClass,
  adminListTableHeadClass,
} from "@/components/admin/v2/AdminList";
import AdminStatusBadge from "@/components/admin/v2/AdminStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type AgentTab = "applications" | "whitelist" | "orders";

export interface ApiApplication {
  id: string;
  email: string;
  merchantName: string;
  businessScenario: string;
  serverIps: string[];
  contact: string;
  status: "pending" | "approved" | "rejected";
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
  amount: number;
  channel: "API接口对接" | "分销链接推广";
  deliveryStatus: "auto_delivered" | "processing" | "pending";
  createdAt: string;
}

const DEFAULT_APPLICATIONS: ApiApplication[] = [
  {
    id: "APP_1732204801",
    email: "merchant@example.com",
    merchantName: "极客海外数码工作室",
    businessScenario: "自建电商独立站自动采购海外 eSIM 与数字账户",
    serverIps: ["124.220.100.12", "47.98.220.5"],
    contact: "TG: @jianlian_mch",
    status: "approved",
    appliedAt: "2026-11-22 10:30:15",
    appId: "MCH_10082691",
    appSecret: "jl_live_3fa89210c4d7e82910fa982341bcee71",
  },
  {
    id: "APP_1732203920",
    email: "enterprise_dev@foxmail.com",
    merchantName: "星云互联（深圳）软件有限公司",
    businessScenario: "企业 ERP 批量充值卡密与自动化发放",
    serverIps: ["118.195.201.44"],
    contact: "QQ: 3829104",
    status: "pending",
    appliedAt: "2026-11-22 11:15:22",
  },
  {
    id: "APP_1732198000",
    email: "cloud_reseller@outlook.com",
    merchantName: "亚太数字分销联盟",
    businessScenario: "海外游戏代购与 Steam 充值 API 对接",
    serverIps: ["156.234.88.90"],
    contact: "mail: cloud_reseller@outlook.com",
    status: "rejected",
    appliedAt: "2026-11-21 16:40:00",
  },
];

const DEFAULT_WHITELISTS: WhitelistEntry[] = [
  {
    id: "WL_01",
    email: "merchant@example.com",
    merchantName: "极客海外数码工作室",
    appId: "MCH_10082691",
    ip: "124.220.100.12",
    remark: "腾讯云广州生产集群",
    addedAt: "2026-11-22 10:35:00",
    status: "active",
  },
  {
    id: "WL_02",
    email: "merchant@example.com",
    merchantName: "极客海外数码工作室",
    appId: "MCH_10082691",
    ip: "47.98.220.5",
    remark: "阿里云杭州备用节点",
    addedAt: "2026-11-22 10:35:00",
    status: "active",
  },
  {
    id: "WL_03",
    email: "partner@example.com",
    merchantName: "全球数码分销商A",
    appId: "MCH_98210344",
    ip: "154.212.89.10",
    remark: "新加坡机房出口",
    addedAt: "2026-11-20 14:20:00",
    status: "active",
  },
];

const DEFAULT_AGENT_ORDERS: AgentOrder[] = [
  {
    id: "ORD_AG_1001",
    orderNo: "JL2026112214019283",
    merchantEmail: "merchant@example.com",
    appId: "MCH_10082691",
    productName: "Steam账号 | 阿根廷 | 全新账号 | 邮箱可用",
    amount: 2.71,
    channel: "API接口对接",
    deliveryStatus: "auto_delivered",
    createdAt: "2026-11-22 13:45:10",
  },
  {
    id: "ORD_AG_1002",
    orderNo: "JL2026112213501922",
    merchantEmail: "merchant@example.com",
    appId: "MCH_10082691",
    productName: "英国 Giffgaff SIM 卡 原生漫游实体卡",
    amount: 35.00,
    channel: "API接口对接",
    deliveryStatus: "processing",
    createdAt: "2026-11-22 13:50:45",
  },
  {
    id: "ORD_AG_1003",
    orderNo: "JL2026112212301990",
    merchantEmail: "partner@example.com",
    appId: "MCH_98210344",
    productName: "ChatGPT Plus 官方代充 / 独享账号",
    amount: 148.00,
    channel: "分销链接推广",
    deliveryStatus: "auto_delivered",
    createdAt: "2026-11-22 12:30:00",
  },
];

export default function AdminAgentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: AgentTab =
    rawTab === "whitelist" || rawTab === "orders" || rawTab === "applications"
      ? rawTab
      : "applications";

  const [applications, setApplications] = useState<ApiApplication[]>([]);
  const [whitelists, setWhitelists] = useState<WhitelistEntry[]>([]);
  const [orders, setOrders] = useState<AgentOrder[]>([]);
  const [search, setSearch] = useState("");

  // 手动加白对话框
  const [addWhitelistOpen, setAddWhitelistOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addMchName, setAddMchName] = useState("");
  const [addIp, setAddIp] = useState("");
  const [addRemark, setAddRemark] = useState("");

  // 加载数据
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawApps = window.localStorage.getItem("jianlian_admin_api_applications");
      if (rawApps) {
        setApplications(JSON.parse(rawApps));
      } else {
        setApplications(DEFAULT_APPLICATIONS);
        window.localStorage.setItem("jianlian_admin_api_applications", JSON.stringify(DEFAULT_APPLICATIONS));
      }

      const rawWl = window.localStorage.getItem("jianlian_admin_ip_whitelist");
      if (rawWl) {
        setWhitelists(JSON.parse(rawWl));
      } else {
        setWhitelists(DEFAULT_WHITELISTS);
        window.localStorage.setItem("jianlian_admin_ip_whitelist", JSON.stringify(DEFAULT_WHITELISTS));
      }

      const rawOrders = window.localStorage.getItem("jianlian_admin_agent_orders");
      if (rawOrders) {
        setOrders(JSON.parse(rawOrders));
      } else {
        setOrders(DEFAULT_AGENT_ORDERS);
        window.localStorage.setItem("jianlian_admin_agent_orders", JSON.stringify(DEFAULT_AGENT_ORDERS));
      }
    } catch {
      setApplications(DEFAULT_APPLICATIONS);
      setWhitelists(DEFAULT_WHITELISTS);
      setOrders(DEFAULT_AGENT_ORDERS);
    }
  }, []);

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
    window.localStorage.setItem("jianlian_admin_api_applications", JSON.stringify(updatedApps));

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
        addedAt: new Date().toLocaleString(),
        status: "active",
      }));
      const nextWl = [...newEntries, ...whitelists];
      setWhitelists(nextWl);
      window.localStorage.setItem("jianlian_admin_ip_whitelist", JSON.stringify(nextWl));
      window.localStorage.setItem(`jianlian_mch_whitelist_${app.email}`, JSON.stringify(app.serverIps));
    }

    toast.success(`商户 ${app.merchantName} API 申请已批准！已分配 AppID: ${freshAppId}`);
  };

  // 驳回
  const handleReject = (app: ApiApplication) => {
    const updatedApps = applications.map((item) =>
      item.id === app.id ? { ...item, status: "rejected" as const } : item
    );
    setApplications(updatedApps);
    window.localStorage.setItem("jianlian_admin_api_applications", JSON.stringify(updatedApps));
    window.localStorage.setItem(`jianlian_mch_app_status_${app.email}`, "unapplied");
    toast.error(`已驳回商户 ${app.merchantName} 的接入申请`);
  };

  // 删除白名单 IP
  const handleDeleteWhitelist = (entry: WhitelistEntry) => {
    const nextWl = whitelists.filter((w) => w.id !== entry.id);
    setWhitelists(nextWl);
    window.localStorage.setItem("jianlian_admin_ip_whitelist", JSON.stringify(nextWl));

    // 同步更新用户端绑定的白名单
    const remainingForEmail = nextWl.filter((w) => w.email === entry.email).map((w) => w.ip);
    window.localStorage.setItem(`jianlian_mch_whitelist_${entry.email}`, JSON.stringify(remainingForEmail));
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
      appId: "MCH_10082691",
      ip: cleanIp,
      remark: addRemark.trim() || "管理员手动加白",
      addedAt: new Date().toLocaleString(),
      status: "active",
    };
    const nextWl = [newEntry, ...whitelists];
    setWhitelists(nextWl);
    window.localStorage.setItem("jianlian_admin_ip_whitelist", JSON.stringify(nextWl));

    // 同步给该用户
    if (addEmail.trim()) {
      const remainingForEmail = nextWl.filter((w) => w.email === addEmail.trim()).map((w) => w.ip);
      window.localStorage.setItem(`jianlian_mch_whitelist_${addEmail.trim()}`, JSON.stringify(remainingForEmail));
    }

    setAddWhitelistOpen(false);
    setAddIp("");
    setAddRemark("");
    setAddEmail("");
    setAddMchName("");
    toast.success(`成功为商户加白公网 IP: ${cleanIp}`);
  };

  return (
    <AdminPageShell
      variant="v2"
      title="代理与分销管理"
      description="统一管理商户 API 接入申请、集中维护服务器 IP 白名单、监控分销代理订单与调用状态。"
    >
      <div className="space-y-6">
        {/* 顶部统计面板 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-orange-100 bg-white/90 p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">待审核 API 申请</span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-black font-mono text-slate-900">
              {applications.filter((a) => a.status === "pending").length}
            </div>
            <div className="mt-1 text-[11px] text-amber-600 font-medium">需要平台管理员核验</div>
          </div>

          <div className="rounded-2xl border border-orange-100 bg-white/90 p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">已生效白名单 IP</span>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-black font-mono text-slate-900">
              {whitelists.length}
            </div>
            <div className="mt-1 text-[11px] text-emerald-600 font-medium">后台严格风控授权中</div>
          </div>

          <div className="rounded-2xl border border-orange-100 bg-white/90 p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">今日代理分销订单</span>
              <Store className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-2 text-2xl font-black font-mono text-slate-900">
              {orders.length}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">实付 ¥{orders.reduce((sum, o) => sum + o.amount, 0).toFixed(2)}</div>
          </div>

          <div className="rounded-2xl border border-orange-100 bg-white/90 p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">已开通商户数</span>
              <UserCheck className="h-4 w-4 text-blue-600" />
            </div>
            <div className="mt-2 text-2xl font-black font-mono text-slate-900">
              {applications.filter((a) => a.status === "approved").length}
            </div>
            <div className="mt-1 text-[11px] text-blue-600 font-medium">享受全自动秒级卡密回调</div>
          </div>
        </div>

        {/* 顶部 Tab 切换与操作栏 */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={activeTab === "applications" ? "default" : "outline"}
              size="sm"
              onClick={() => switchTab("applications")}
              className="rounded-xl font-bold text-xs"
            >
              <Code2 className="mr-1.5 h-3.5 w-3.5" />
              API 申请记录
              {applications.filter((a) => a.status === "pending").length > 0 && (
                <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.2 text-[10px] text-white">
                  {applications.filter((a) => a.status === "pending").length}
                </span>
              )}
            </Button>

            <Button
              type="button"
              variant={activeTab === "whitelist" ? "default" : "outline"}
              size="sm"
              onClick={() => switchTab("whitelist")}
              className="rounded-xl font-bold text-xs"
            >
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              IP 加白管理
            </Button>

            <Button
              type="button"
              variant={activeTab === "orders" ? "default" : "outline"}
              size="sm"
              onClick={() => switchTab("orders")}
              className="rounded-xl font-bold text-xs"
            >
              <Store className="mr-1.5 h-3.5 w-3.5" />
              分销代理订单
            </Button>
          </div>

          {activeTab === "whitelist" && (
            <Button
              type="button"
              size="sm"
              onClick={() => setAddWhitelistOpen(true)}
              className="rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              添加白名单 IP
            </Button>
          )}
        </div>

        {/* 1. API 申请记录 Tab */}
        {activeTab === "applications" && (
          <AdminListSurface>
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
                  {applications.map((app) => (
                    <tr key={app.id} className={adminListRowClass}>
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900">{app.merchantName}</div>
                        <div className="text-[11px] font-mono text-slate-500">{app.email}</div>
                        {app.appId && (
                          <div className="mt-0.5 inline-block rounded bg-orange-50 px-1 text-[10px] font-mono font-bold text-primary border border-orange-200">
                            {app.appId}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 max-w-[200px] truncate" title={app.businessScenario}>
                        {app.businessScenario}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-800">
                        {app.serverIps && app.serverIps.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {app.serverIps.map((ip, idx) => (
                              <span key={idx} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">
                                {ip}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">未提供</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{app.contact}</td>
                      <td className="px-4 py-3.5 font-mono text-slate-500 text-[11px]">{app.appliedAt}</td>
                      <td className="px-4 py-3.5">
                        {app.status === "approved" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" /> 已批准开通
                          </span>
                        ) : app.status === "pending" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
                            <Clock className="h-3 w-3 animate-pulse" /> 待管理员审核
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 border border-red-200">
                            <XCircle className="h-3 w-3" /> 已拒绝
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center space-x-2">
                        {app.status === "pending" ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleApprove(app)}
                              className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              通过并加白
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleReject(app)}
                              className="h-7 px-2.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50"
                            >
                              驳回
                            </Button>
                          </>
                        ) : (
                          <span className="text-slate-400 text-xs">已归档</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableViewport>
          </AdminListSurface>
        )}

        {/* 2. IP 加白管理 Tab */}
        {activeTab === "whitelist" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-xs text-blue-900 leading-relaxed flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600" />
              <span>
                <strong>风控安全边界</strong>：商户前台不提供自主添加 IP 白名单入口。所有调用订单与扣费 API 的出口公网 IP 均须在此由管理员审核录入，非加白 IP 请求系统将直接阻断拦截。
              </span>
            </div>

            <AdminListSurface>
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
                    {whitelists.map((wl) => (
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
                        <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500">{wl.addedAt}</td>
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
                    ))}
                  </tbody>
                </table>
              </AdminTableViewport>
            </AdminListSurface>
          </div>
        )}

        {/* 3. 分销代理订单 Tab */}
        {activeTab === "orders" && (
          <AdminListSurface>
            <AdminTableViewport>
              <table className="w-full text-left text-xs">
                <thead className={adminListTableHeadClass}>
                  <tr>
                    <th className="px-4 py-3 font-semibold">订单编号</th>
                    <th className="px-4 py-3 font-semibold">代理商户 / 邮箱</th>
                    <th className="px-4 py-3 font-semibold">商品名称</th>
                    <th className="px-4 py-3 font-semibold">实付金额</th>
                    <th className="px-4 py-3 font-semibold">订单渠道来源</th>
                    <th className="px-4 py-3 font-semibold">履约交付状态</th>
                    <th className="px-4 py-3 font-semibold">下单时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {orders.map((ord) => (
                    <tr key={ord.id} className={adminListRowClass}>
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900">{ord.orderNo}</td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-800">{ord.merchantEmail}</div>
                        <div className="text-[11px] font-mono text-slate-400">{ord.appId}</div>
                      </td>
                      <td className="px-4 py-3.5 max-w-[240px] truncate" title={ord.productName}>
                        {ord.productName}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-bold text-orange-600">
                        ¥{ord.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          {ord.channel}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {ord.deliveryStatus === "auto_delivered" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" /> 已自动交付卡密
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
                            <Clock className="h-3 w-3 animate-pulse" /> 物流打包发货中
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500">{ord.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableViewport>
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
                placeholder="例如：极客海外数码工作室"
                className="h-10 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">服务器公网 IP <span className="text-red-500">*</span></label>
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
              <Button type="button" variant="outline" size="sm" onClick={() => setAddWhitelistOpen(false)}>
                取消
              </Button>
              <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                确认加白
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminPageShell>
  );
}
