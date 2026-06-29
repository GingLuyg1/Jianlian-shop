"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Search, X } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const ACCOUNT_LABELS: Record<string, string> = {
  active: "正常",
  restricted: "受限",
  suspended: "暂停",
  disabled: "禁用",
};

const RISK_LABELS: Record<string, string> = {
  normal: "正常",
  watch: "关注",
  high_risk: "高风险",
  blocked: "拦截",
};

const ADJUSTMENT_LABELS: Record<string, string> = {
  increase: "增加余额",
  decrease: "扣减余额",
  compensation: "系统补偿",
  refund: "订单退款",
  correction: "错误入账修正",
  other: "其他",
};

type AdminUserRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: string;
  accountStatus: string;
  riskStatus: string;
  balance: number;
  totalRecharge: number;
  totalSpend: number;
  orderCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  lastLoginAt: string | null;
  statusReason: string | null;
  riskReason: string | null;
};

type UserDetail = {
  profile: AdminUserRow;
  summary: {
    balance: number;
    totalRecharge: number;
    totalSpend: number;
    orderCount: number;
    rechargeCount: number;
    transactionCount: number;
    deliveryCount: number;
  };
  orders: Record<string, unknown>[];
  recharges: Record<string, unknown>[];
  balanceTransactions: Record<string, unknown>[];
  deliveries: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  statusHistory: Record<string, unknown>[];
  riskRecords: Record<string, unknown>[];
  auditLogs: Record<string, unknown>[];
  errors?: Record<string, string>;
  schemaReady?: boolean;
};

type UserListResponse = {
  users: AdminUserRow[];
  count: number;
  page: number;
  pageSize: number;
  schemaReady?: boolean;
  errors?: Record<string, string>;
  error?: string;
};

type ActionForm = {
  accountStatus: string;
  riskStatus: string;
  adjustmentType: string;
  direction: "credit" | "debit";
  amount: string;
  reason: string;
};

function formatDate(value: unknown) {
  if (!value || typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function money(value: unknown, currency = "¥") {
  const parsed = Number(value);
  return `${currency}${Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00"}`;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "—";
}

function valueOf(row: Record<string, unknown>, key: string) {
  return row[key];
}

function statusBadgeClass(value: string, kind: "account" | "risk") {
  if (kind === "account") {
    if (value === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (value === "restricted") return "border-amber-200 bg-amber-50 text-amber-700";
    if (value === "suspended") return "border-orange-200 bg-orange-50 text-orange-700";
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (value === "normal") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "watch") return "border-amber-200 bg-amber-50 text-amber-700";
  if (value === "high_risk") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-red-200 bg-red-50 text-red-700";
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schemaReady, setSchemaReady] = useState(true);
  const [partialErrors, setPartialErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [accountStatus, setAccountStatus] = useState("all");
  const [riskStatus, setRiskStatus] = useState("all");
  const [registeredFrom, setRegisteredFrom] = useState("");
  const [registeredTo, setRegisteredTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      search,
      accountStatus,
      riskStatus,
      registeredFrom,
      registeredTo,
    });

    try {
      const response = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as UserListResponse;
      if (!response.ok) throw new Error(payload.error || "用户列表加载失败。");
      setUsers(payload.users ?? []);
      setCount(payload.count ?? 0);
      setSchemaReady(payload.schemaReady !== false);
      setPartialErrors(payload.errors ?? {});
    } catch (loadError) {
      setUsers([]);
      setCount(0);
      setError(loadError instanceof Error ? loadError.message : "用户列表加载失败。");
    } finally {
      setLoading(false);
    }
  }, [accountStatus, page, registeredFrom, registeredTo, riskStatus, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const stats = useMemo(
    () => ({
      active: users.filter((user) => user.accountStatus === "active").length,
      risk: users.filter((user) => user.riskStatus !== "normal").length,
      balance: users.reduce((sum, user) => sum + Number(user.balance || 0), 0),
    }),
    [users]
  );

  function resetFilters() {
    setSearch("");
    setAccountStatus("all");
    setRiskStatus("all");
    setRegisteredFrom("");
    setRegisteredTo("");
    setPage(1);
  }

  return (
    <AdminPageShell
      title="用户管理"
      description="查看用户资产、账户状态、风险标记和管理员操作记录。"
      actions={
        <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          重新加载
        </Button>
      }
    >
      <div className="mb-3 grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="当前结果" value={count} />
        <StatCard label="本页正常账户" value={stats.active} />
        <StatCard label="本页风险账户" value={stats.risk} tone={stats.risk > 0 ? "warn" : "default"} />
        <StatCard label="本页余额合计" value={money(stats.balance)} />
      </div>

      {!schemaReady ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          用户状态字段尚未初始化，请管理员执行 admin_user_controls migration；页面会以兼容模式显示已有资料。
        </div>
      ) : null}
      {Object.keys(partialErrors).length ? (
        <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          部分模块读取失败：{Object.values(partialErrors).join("、")}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid shrink-0 gap-3 border-b p-3 2xl:grid-cols-[minmax(260px,1fr)_150px_150px_150px_150px_88px_auto] 2xl:items-center">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="搜索邮箱、昵称或用户 ID"
              className="h-9 pl-9"
            />
          </div>
          <NativeSelect value={accountStatus} onChange={(value) => { setAccountStatus(value); setPage(1); }}>
            <option value="all">全部账户状态</option>
            <option value="active">正常</option>
            <option value="restricted">受限</option>
            <option value="suspended">暂停</option>
            <option value="disabled">禁用</option>
          </NativeSelect>
          <NativeSelect value={riskStatus} onChange={(value) => { setRiskStatus(value); setPage(1); }}>
            <option value="all">全部风险状态</option>
            <option value="normal">正常</option>
            <option value="watch">关注</option>
            <option value="high_risk">高风险</option>
            <option value="blocked">拦截</option>
          </NativeSelect>
          <Input type="date" value={registeredFrom} onChange={(event) => { setRegisteredFrom(event.target.value); setPage(1); }} className="h-9" />
          <Input type="date" value={registeredTo} onChange={(event) => { setRegisteredTo(event.target.value); setPage(1); }} className="h-9" />
          <Button variant="outline" size="sm" onClick={resetFilters}>重置</Button>
          <div className="whitespace-nowrap text-sm text-slate-500">共 {count} 条</div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <AdminTableSkeleton rows={10} />
          ) : error ? (
            <AdminErrorState title="用户列表加载失败" description={error} onRetry={loadUsers} />
          ) : users.length === 0 ? (
            <AdminEmptyState title="暂无用户" description="当前筛选条件下没有用户数据。" />
          ) : (
            <Table className="min-w-[1320px]">
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-xs">用户</TableHead>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-xs">邮箱</TableHead>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-xs">账户状态</TableHead>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-xs">当前余额</TableHead>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-xs">累计充值</TableHead>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-xs">累计消费</TableHead>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-xs">订单数量</TableHead>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-xs">注册时间</TableHead>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-xs">最后登录</TableHead>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-xs">风险状态</TableHead>
                  <TableHead className="sticky right-0 h-10 whitespace-nowrap bg-slate-50 px-3 text-right text-xs">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} className="h-12">
                    <TableCell className="px-3 py-2 text-xs">
                      <div className="font-medium text-slate-900">{user.displayName || "未命名用户"}</div>
                      <div className="mt-0.5 max-w-[180px] truncate font-mono text-[11px] text-slate-400">{user.id}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-xs">{user.email || "—"}</TableCell>
                    <TableCell className="px-3 py-2"><StatusBadge value={user.accountStatus} labels={ACCOUNT_LABELS} kind="account" /></TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-xs font-semibold">{money(user.balance)}</TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-xs">{money(user.totalRecharge)}</TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-xs">{money(user.totalSpend)}</TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-xs">{user.orderCount}</TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{formatDate(user.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{formatDate(user.lastLoginAt)}</TableCell>
                    <TableCell className="px-3 py-2"><StatusBadge value={user.riskStatus} labels={RISK_LABELS} kind="risk" /></TableCell>
                    <TableCell className="sticky right-0 whitespace-nowrap bg-white px-3 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedUserId(user.id)}>查看</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-3 py-3 text-sm text-slate-500">
          <span>第 {page} / {totalPages} 页</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</Button>
          </div>
        </div>
      </div>

      <UserDrawer
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
        onChanged={() => {
          loadUsers();
        }}
      />
    </AdminPageShell>
  );
}

function UserDrawer({ userId, onClose, onChanged }: { userId: string | null; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [form, setForm] = useState<ActionForm>({
    accountStatus: "active",
    riskStatus: "normal",
    adjustmentType: "increase",
    direction: "credit",
    amount: "",
    reason: "",
  });

  const loadDetail = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as UserDetail & { error?: string };
      if (!response.ok) throw new Error(payload.error || "用户详情加载失败。");
      setDetail(payload);
      setForm((current) => ({
        ...current,
        accountStatus: payload.profile.accountStatus,
        riskStatus: payload.profile.riskStatus,
      }));
    } catch (loadError) {
      setDetail(null);
      setError(loadError instanceof Error ? loadError.message : "用户详情加载失败。");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadDetail();
  }, [loadDetail, userId]);

  useEffect(() => {
    if (!userId) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, userId]);

  if (!userId) return null;

  async function submitAction(action: string) {
    if (!detail) return;
    const reason = form.reason.trim();
    if (!reason) {
      window.alert("请填写操作原因。");
      return;
    }
    if (!window.confirm("确认执行该用户管理操作吗？操作会写入审计日志。")) return;

    const requestId = crypto.randomUUID();
    const body: Record<string, unknown> = { action, reason, requestId };
    if (action === "update_account_status") body.nextStatus = form.accountStatus;
    if (action === "update_risk_status") body.nextRiskStatus = form.riskStatus;
    if (action === "adjust_balance") {
      body.adjustmentType = form.adjustmentType;
      body.direction = form.direction;
      body.amount = Number(form.amount);
    }

    setActionLoading(action);
    try {
      const response = await fetch(`/api/admin/users/${userId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "操作失败。");
      setForm((current) => ({ ...current, amount: "", reason: "" }));
      await loadDetail();
      onChanged();
      window.alert("操作成功。" );
    } catch (actionError) {
      window.alert(actionError instanceof Error ? actionError.message : "操作失败。");
    } finally {
      setActionLoading(null);
    }
  }

  const profile = detail?.profile;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/30" onClick={onClose}>
      <aside
        className="ml-auto flex h-full w-full min-w-0 max-w-[860px] flex-col bg-white shadow-2xl sm:w-[min(860px,94vw)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-slate-950">用户详情</div>
            <div className="mt-1 truncate text-xs text-slate-500">{profile?.email || userId}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="关闭用户详情">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {loading ? (
            <AdminTableSkeleton rows={8} />
          ) : error ? (
            <AdminErrorState title="用户详情加载失败" description={error} onRetry={loadDetail} />
          ) : detail && profile ? (
            <div className="space-y-5">
              {detail.errors && Object.keys(detail.errors).length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  部分模块读取失败：{Object.values(detail.errors).join("、")}
                </div>
              ) : null}

              <Section title="基本资料">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoLine label="用户 ID" value={profile.id} mono />
                  <InfoLine label="邮箱" value={profile.email} />
                  <InfoLine label="显示名称" value={profile.displayName} />
                  <InfoLine label="角色" value={profile.role} />
                  <InfoLine label="注册时间" value={formatDate(profile.createdAt)} />
                  <InfoLine label="最后登录" value={formatDate(profile.lastLoginAt)} />
                </div>
              </Section>

              <Section title="账户状态">
                <div className="grid gap-3 lg:grid-cols-2">
                  <ControlCard title="账户状态" description="禁用、暂停和受限会影响登录后敏感业务操作。">
                    <NativeSelect value={form.accountStatus} onChange={(value) => setForm((current) => ({ ...current, accountStatus: value }))}>
                      <option value="active">正常</option>
                      <option value="restricted">受限</option>
                      <option value="suspended">暂停</option>
                      <option value="disabled">禁用</option>
                    </NativeSelect>
                    <Button size="sm" disabled={actionLoading !== null || form.accountStatus === profile.accountStatus} onClick={() => submitAction("update_account_status")}>
                      {actionLoading === "update_account_status" ? "处理中..." : "更新账户状态"}
                    </Button>
                  </ControlCard>
                  <ControlCard title="风险标记" description="风险状态独立于账户状态，blocked 会限制订单和充值。">
                    <NativeSelect value={form.riskStatus} onChange={(value) => setForm((current) => ({ ...current, riskStatus: value }))}>
                      <option value="normal">正常</option>
                      <option value="watch">关注</option>
                      <option value="high_risk">高风险</option>
                      <option value="blocked">拦截</option>
                    </NativeSelect>
                    <Button size="sm" disabled={actionLoading !== null || form.riskStatus === profile.riskStatus} onClick={() => submitAction("update_risk_status")}>
                      {actionLoading === "update_risk_status" ? "处理中..." : "更新风险标记"}
                    </Button>
                  </ControlCard>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <InfoLine label="当前账户状态" value={ACCOUNT_LABELS[profile.accountStatus] ?? profile.accountStatus} />
                  <InfoLine label="当前风险状态" value={RISK_LABELS[profile.riskStatus] ?? profile.riskStatus} />
                  <InfoLine label="账户状态原因" value={profile.statusReason} />
                  <InfoLine label="风险原因" value={profile.riskReason} />
                </div>
              </Section>

              <Section title="资产概览">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <InfoLine label="当前余额" value={money(detail.summary.balance)} />
                  <InfoLine label="累计充值" value={money(detail.summary.totalRecharge)} />
                  <InfoLine label="累计消费" value={money(detail.summary.totalSpend)} />
                  <InfoLine label="订单数量" value={String(detail.summary.orderCount)} />
                </div>
                <div className="mt-4 rounded-xl border bg-slate-50 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    调整余额
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[180px_140px_1fr]">
                    <NativeSelect value={form.adjustmentType} onChange={(value) => setForm((current) => ({ ...current, adjustmentType: value }))}>
                      {Object.entries(ADJUSTMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </NativeSelect>
                    <NativeSelect value={form.direction} onChange={(value) => setForm((current) => ({ ...current, direction: value as "credit" | "debit" }))}>
                      <option value="credit">增加</option>
                      <option value="debit">扣减</option>
                    </NativeSelect>
                    <Input value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="金额，必须大于 0" inputMode="decimal" />
                  </div>
                  <div className="mt-3 text-sm text-slate-600">
                    预计余额：{money(Number(profile.balance) + (form.direction === "credit" ? 1 : -1) * Number(form.amount || 0))}
                  </div>
                  <Textarea className="mt-3 min-h-[82px]" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="必须填写操作原因，原因会写入流水和审计日志。" />
                  <div className="mt-3 text-right">
                    <Button disabled={actionLoading !== null || !form.amount || Number(form.amount) <= 0} onClick={() => submitAction("adjust_balance")}>
                      {actionLoading === "adjust_balance" ? "调整中..." : "提交余额调整"}
                    </Button>
                  </div>
                </div>
              </Section>

              <Section title="最近订单"><SimpleRows rows={detail.orders} columns={["orderNo", "status", "paymentStatus", "totalAmount", "createdAt"]} moneyKeys={["totalAmount"]} /></Section>
              <Section title="充值记录"><SimpleRows rows={detail.recharges} columns={["rechargeNo", "channelName", "amount", "creditedAmount", "status", "createdAt"]} moneyKeys={["amount", "creditedAmount"]} /></Section>
              <Section title="余额流水"><SimpleRows rows={detail.balanceTransactions} columns={["transactionNo", "businessType", "direction", "amount", "balanceBefore", "balanceAfter", "remark", "createdAt"]} moneyKeys={["amount", "balanceBefore", "balanceAfter"]} /></Section>
              <Section title="数字交付记录"><SimpleRows rows={detail.deliveries} columns={["deliveryType", "deliveryStatus", "deliveredAt", "viewedAt", "createdAt"]} /></Section>
              <Section title="站内通知"><SimpleRows rows={detail.notifications} columns={["title", "status", "createdAt"]} /></Section>
              <Section title="管理员操作记录"><SimpleRows rows={detail.auditLogs} columns={["admin_email", "action", "result", "request_id", "created_at"]} /></Section>
              <Section title="账户与风险历史">
                <div className="grid gap-3 lg:grid-cols-2">
                  <SimpleRows rows={detail.statusHistory} columns={["old_status", "new_status", "reason", "admin_email", "created_at"]} compact />
                  <SimpleRows rows={detail.riskRecords} columns={["old_risk_status", "new_risk_status", "reason", "admin_email", "created_at"]} compact />
                </div>
              </Section>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function StatCard({ label, tone = "default", value }: { label: string; tone?: "default" | "warn"; value: ReactNode }) {
  return (
    <div className={cn("rounded-xl border bg-white px-4 py-3 shadow-sm", tone === "warn" && "border-orange-200 bg-orange-50")}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{value}</div>
    </div>
  );
}

function StatusBadge({ value, labels, kind }: { value: string; labels: Record<string, string>; kind: "account" | "risk" }) {
  return <Badge variant="outline" className={cn("whitespace-nowrap text-[10px]", statusBadgeClass(value, kind))}>{labels[value] ?? value}</Badge>;
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-base font-semibold text-slate-950">{title}</h3>
      {children}
    </section>
  );
}

function ControlCard({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="font-medium text-slate-900">{title}</div>
      <div className="mt-1 text-xs text-slate-500">{description}</div>
      <div className="mt-3 flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function InfoLine({ label, mono, value }: { label: string; mono?: boolean; value: ReactNode }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("mt-2 break-words text-sm font-medium text-slate-900", mono && "font-mono text-xs")}>{value || "—"}</div>
    </div>
  );
}

function SimpleRows({ columns, compact, moneyKeys = [], rows }: { columns: string[]; compact?: boolean; moneyKeys?: string[]; rows: Record<string, unknown>[] }) {
  if (!rows.length) return <div className="rounded-xl border border-dashed bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">暂无记录</div>;
  return (
    <div className={cn("overflow-auto rounded-xl border", compact ? "max-h-60" : "max-h-80")}>
      <Table className="min-w-[720px]">
        <TableHeader className="sticky top-0 bg-slate-50">
          <TableRow>{columns.map((column) => <TableHead key={column} className="h-9 whitespace-nowrap px-3 text-xs">{column}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={String(row.id ?? index)}>
              {columns.map((column) => {
                const raw = valueOf(row, column);
                const rendered = column.toLowerCase().includes("time") || column.endsWith("At") || column.endsWith("_at")
                  ? formatDate(raw)
                  : moneyKeys.includes(column)
                    ? money(raw)
                    : text(raw);
                return <TableCell key={column} className="whitespace-nowrap px-3 py-2 text-xs">{rendered}</TableCell>;
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function NativeSelect({ children, onChange, value }: { children: ReactNode; onChange: (value: string) => void; value: string }) {
  return (
    <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
      {children}
    </select>
  );
}
