"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, RefreshCw, Search } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import {
  AdminFilterBar,
  AdminListPagination,
  AdminListStat,
  AdminListStats,
  AdminListSurface,
  AdminTableViewport,
  adminListControlClass,
  adminListRowClass,
  adminListTableHeadClass,
} from "@/components/admin/v2/AdminList";
import AdminStatusBadge, { type AdminStatusTone } from "@/components/admin/v2/AdminStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const ACCOUNT_LABELS: Record<string, string> = { active: "正常", restricted: "受限", suspended: "暂停", disabled: "禁用" };
const RISK_LABELS: Record<string, string> = { normal: "正常", watch: "关注", high_risk: "高风险", blocked: "拦截" };
const ROLE_LABELS: Record<string, string> = { user: "用户", admin: "管理员" };
const SORT_VALUES = new Set(["newest", "oldest", "recent_activity", "balance_desc", "balance_asc"]);

type AdminUserRow = {
  id: string; email: string | null; displayName: string | null; role: string;
  accountStatus: string; riskStatus: string; balance: number;
  createdAt: string | null; updatedAt: string | null;
  lastLoginAt: string | null; statusReason: string | null; riskReason: string | null;
};
type UserListResponse = { users?: AdminUserRow[]; count?: number; schemaReady?: boolean; errors?: Record<string, string>; error?: string };

function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer); }, [delay, value]);
  return debounced;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const initial = useSearchParams();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [schemaReady, setSchemaReady] = useState(true);
  const [partialErrors, setPartialErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState(initial.get("search") ?? "");
  const [status, setStatus] = useState(normalizeFilter(initial.get("status"), ACCOUNT_LABELS));
  const [role, setRole] = useState(normalizeFilter(initial.get("role"), ROLE_LABELS));
  const [risk, setRisk] = useState(normalizeFilter(initial.get("risk"), RISK_LABELS));
  const [registeredFrom, setRegisteredFrom] = useState(initial.get("registeredFrom") ?? "");
  const [registeredTo, setRegisteredTo] = useState(initial.get("registeredTo") ?? "");
  const [sort, setSort] = useState(SORT_VALUES.has(initial.get("sort") ?? "") ? initial.get("sort")! : "newest");
  const [page, setPage] = useState(Math.max(Number(initial.get("page") ?? 1) || 1, 1));
  const debouncedSearch = useDebouncedValue(search);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (status !== "all") params.set("status", status);
    if (role !== "all") params.set("role", role);
    if (risk !== "all") params.set("risk", risk);
    if (registeredFrom) params.set("registeredFrom", registeredFrom);
    if (registeredTo) params.set("registeredTo", registeredTo);
    return params.toString();
  }, [debouncedSearch, page, registeredFrom, registeredTo, risk, role, sort, status]);

  const loadUsers = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/users?${queryString}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as UserListResponse;
      if (!response.ok) throw new Error(payload.error || "用户列表加载失败。");
      setUsers(payload.users ?? []); setCount(payload.count ?? 0);
      setSchemaReady(payload.schemaReady !== false); setPartialErrors(payload.errors ?? {});
    } catch (loadError) {
      setUsers([]); setCount(0); setError(loadError instanceof Error ? loadError.message : "用户列表加载失败。");
    } finally { setLoading(false); }
  }, [queryString]);

  useEffect(() => { router.replace(`${pathname}?${queryString}`, { scroll: false }); void loadUsers(); }, [loadUsers, pathname, queryString, router]);
  useEffect(() => {
    setSearch(initial.get("search") ?? "");
    setStatus(normalizeFilter(initial.get("status"), ACCOUNT_LABELS));
    setRole(normalizeFilter(initial.get("role"), ROLE_LABELS));
    setRisk(normalizeFilter(initial.get("risk"), RISK_LABELS));
    setRegisteredFrom(initial.get("registeredFrom") ?? "");
    setRegisteredTo(initial.get("registeredTo") ?? "");
    setSort(SORT_VALUES.has(initial.get("sort") ?? "") ? initial.get("sort")! : "newest");
    setPage(Math.max(Number(initial.get("page") ?? 1) || 1, 1));
  }, [initial]);
  useEffect(() => { setPage(1); }, [debouncedSearch, registeredFrom, registeredTo, risk, role, sort, status]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const hasFilters = Boolean(debouncedSearch || status !== "all" || role !== "all" || risk !== "all" || registeredFrom || registeredTo || sort !== "newest");
  const pageSummary = useMemo(() => ({ active: users.filter((user) => user.accountStatus === "active").length, risk: users.filter((user) => user.riskStatus !== "normal").length, balance: users.reduce((sum, user) => sum + Number(user.balance || 0), 0) }), [users]);
  const resetFilters = () => { setSearch(""); setStatus("all"); setRole("all"); setRisk("all"); setRegisteredFrom(""); setRegisteredTo(""); setSort("newest"); setPage(1); };

  return (
    <AdminPageShell variant="v2" title="用户管理" description="只读查询用户资料、账户摘要、关联业务、风险记录和后台审计历史。" actions={<Button className="h-11 sm:h-9" variant="outline" onClick={() => void loadUsers()} disabled={loading}><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />{loading ? "刷新中..." : "刷新"}</Button>}>
      <AdminListStats>
        <AdminListStat label="当前结果" value={count} />
        <AdminListStat label="本页正常账户" value={pageSummary.active} />
        <AdminListStat label="本页风险账户" value={pageSummary.risk} tone={pageSummary.risk ? "warning" : "neutral"} />
        <AdminListStat label="本页余额合计" value={money(pageSummary.balance)} />
      </AdminListStats>
      {!schemaReady ? <Notice>用户管理关键字段或 RPC 兼容合同尚未就绪；当前仅显示可以安全读取的资料。</Notice> : null}
      {Object.keys(partialErrors).length ? <Notice>部分用户管理能力检查失败：{Object.values(partialErrors).join("、")}</Notice> : null}

      <AdminListSurface>
        <AdminFilterBar
          className="sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[minmax(220px,1fr)_138px_120px_138px_150px_150px_180px_76px]"
          primary={<>
            <label className="relative sm:col-span-2 lg:col-span-2 2xl:col-span-1"><span className="sr-only">搜索用户</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="邮箱、昵称或用户 ID" className={cn(adminListControlClass, "pl-9")} /></label>
            <Select label="账户状态" value={status} onChange={setStatus}><option value="all">全部账户状态</option>{Object.entries(ACCOUNT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
            <Select label="角色" value={role} onChange={setRole}><option value="all">全部角色</option>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          </>}
          advanced={<>
            <Select label="风险状态" value={risk} onChange={setRisk}><option value="all">全部风险状态</option>{Object.entries(RISK_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
            <Input aria-label="注册开始日期" type="date" value={registeredFrom} onChange={(event) => setRegisteredFrom(event.target.value)} className={adminListControlClass} />
            <Input aria-label="注册结束日期" type="date" value={registeredTo} onChange={(event) => setRegisteredTo(event.target.value)} className={adminListControlClass} />
            <Select label="排序" value={sort} onChange={setSort}><option value="newest">最新注册</option><option value="oldest">最早注册</option><option value="recent_activity">最近登录</option><option value="balance_desc">余额从高到低</option><option value="balance_asc">余额从低到高</option></Select>
            <Button variant="outline" className="h-11 sm:h-9" onClick={resetFilters}>重置</Button>
          </>}
        />

        <AdminTableViewport>
          {error ? <AdminErrorState title="用户列表加载失败" description={error} onRetry={() => void loadUsers()} /> : loading ? <AdminTableSkeleton rows={10} /> : users.length === 0 ? <AdminEmptyState title={hasFilters ? "没有符合条件的用户" : "暂无用户"} description={hasFilters ? "请调整筛选条件后再试。" : "新用户注册后会显示在这里。"} /> : (
            <table className="w-full min-w-[1060px] table-fixed text-sm">
              <colgroup><col className="w-[190px]" /><col className="w-[210px]" /><col className="w-[90px]" /><col className="w-[100px]" /><col className="w-[110px]" /><col className="w-[150px]" /><col className="w-[150px]" /><col className="w-[105px]" /><col className="w-[78px]" /></colgroup>
              <thead className={adminListTableHeadClass}><tr className="border-b">{["用户", "邮箱", "角色", "账户状态", "当前余额", "注册时间", "最近活动", "风险状态", "操作"].map((heading) => <th scope="col" key={heading} className="h-10 whitespace-nowrap px-3 font-medium">{heading}</th>)}</tr></thead>
              <tbody>{users.map((user) => <tr key={user.id} className={adminListRowClass}>
                <td className="px-3 py-2"><div className="truncate font-medium text-slate-900">{user.displayName || "未命名用户"}</div><div className="truncate font-mono text-[11px] text-slate-400" title={user.id}>{user.id}</div></td>
                <td className="truncate px-3 py-2" title={user.email ?? ""}>{user.email || "—"}</td><td className="px-3 py-2">{ROLE_LABELS[user.role] ?? user.role}</td>
                <td className="px-3 py-2"><StatusBadge value={user.accountStatus} labels={ACCOUNT_LABELS} kind="account" /></td><td className="px-3 py-2 font-semibold">{money(user.balance)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-slate-500">{formatDate(user.createdAt)}</td><td className="px-3 py-2 text-xs tabular-nums text-slate-500">{formatDate(user.lastLoginAt)}</td><td className="px-3 py-2"><StatusBadge value={user.riskStatus} labels={RISK_LABELS} kind="risk" /></td>
                <td className="px-3 py-2"><Button asChild variant="ghost" size="sm" className="min-h-11 sm:min-h-9"><Link href={`/admin/users/${user.id}`}><Eye className="mr-1 h-4 w-4" />查看</Link></Button></td>
              </tr>)}</tbody>
            </table>
          )}
        </AdminTableViewport>
        <AdminListPagination summary={`共 ${count} 条`} page={page} totalPages={totalPages} loading={loading} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} />
      </AdminListSurface>
    </AdminPageShell>
  );
}

function Select({ children, label, value, onChange }: { children: React.ReactNode; label: string; value: string; onChange: (value: string) => void }) { return <select aria-label={label} className={cn(adminListControlClass, "px-3")} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>; }
function Notice({ children }: { children: React.ReactNode }) { return <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{children}</div>; }
function StatusBadge({ value, labels, kind }: { value: string; labels: Record<string, string>; kind: "account" | "risk" }) { const good = kind === "account" ? value === "active" : value === "normal"; const warn = kind === "account" ? value === "restricted" : value === "watch"; const tone: AdminStatusTone = good ? "success" : warn ? "warning" : "danger"; return <AdminStatusBadge tone={tone}>{labels[value] ?? value}</AdminStatusBadge>; }
function money(value: unknown) { const parsed = Number(value); return `¥${Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00"}`; }
function formatDate(value: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false }); }
function normalizeFilter(value: string | null, labels: Record<string, string>) { return value && Object.hasOwn(labels, value) ? value : "all"; }
