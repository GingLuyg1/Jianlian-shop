"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getSupabaseBrowserClient,
  hasSupabaseConfig,
} from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type UserRoleFilter = "all" | "user" | "admin";
type DateFilter = "all" | "today" | "7d" | "30d";

type AdminUserRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: string;
  balance: number;
  created_at: string | null;
  updated_at: string | null;
  status: string | null;
};

type UserDetail = {
  orderCount: number;
  totalSpent: number;
};

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeUser(row: Record<string, unknown>): AdminUserRow {
  return {
    id: String(row.id),
    email: normalizeText(row.email),
    displayName:
      normalizeText(row.display_name) ??
      normalizeText(row.full_name) ??
      normalizeText(row.nickname) ??
      normalizeText(row.name),
    role: normalizeText(row.role) ?? "user",
    balance: Number(row.balance ?? 0),
    created_at: normalizeText(row.created_at),
    updated_at: normalizeText(row.updated_at),
    status: normalizeText(row.status),
  };
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function isInDateRange(value: string | null, filter: DateFilter) {
  if (filter === "all") return true;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  if (filter === "today") return date.toDateString() === now.toDateString();
  const days = filter === "7d" ? 7 : 30;
  return now.getTime() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<UserRoleFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(false);

    if (!hasSupabaseConfig()) {
      setUsers([]);
      setError(true);
      setLoading(false);
      return;
    }

    try {
      const { data, error: loadError } = await getSupabaseBrowserClient()
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (loadError) throw loadError;
      setUsers(((data ?? []) as Array<Record<string, unknown>>).map(normalizeUser));
    } catch (loadError) {
      console.error("[Admin Users] Failed to load profiles", loadError);
      setUsers([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesKeyword =
        !keyword ||
        (user.email ?? "").toLowerCase().includes(keyword) ||
        (user.displayName ?? "").toLowerCase().includes(keyword);
      const matchesRole = role === "all" || user.role === role;
      return matchesKeyword && matchesRole && isInDateRange(user.created_at, dateFilter);
    });
  }, [dateFilter, role, search, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pageUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const todayCount = users.filter((user) => isInDateRange(user.created_at, "today")).length;

  function resetFilters() {
    setSearch("");
    setRole("all");
    setDateFilter("all");
    setPage(1);
  }

  return (
    <AdminPageShell
      title="用户管理"
      description="查看真实用户资料、角色和账户余额。"
    >
      <div className="mb-3 grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="总用户" value={users.length} />
        <StatCard label="普通用户" value={users.filter((user) => user.role === "user").length} />
        <StatCard label="管理员" value={users.filter((user) => user.role === "admin").length} />
        <StatCard label="今日新增" value={todayCount} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid shrink-0 gap-3 border-b p-3 xl:grid-cols-[minmax(260px,1fr)_150px_150px_88px_auto] xl:items-center">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="搜索邮箱或昵称"
              className="h-9 pl-9"
            />
          </div>
          <NativeSelect
            value={role}
            onChange={(value) => {
              setRole(value as UserRoleFilter);
              setPage(1);
            }}
          >
            <option value="all">全部角色</option>
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </NativeSelect>
          <NativeSelect
            value={dateFilter}
            onChange={(value) => {
              setDateFilter(value as DateFilter);
              setPage(1);
            }}
          >
            <option value="all">注册时间</option>
            <option value="today">今天</option>
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
          </NativeSelect>
          <Button variant="outline" size="sm" onClick={resetFilters}>
            重置
          </Button>
          <div className="whitespace-nowrap text-sm text-slate-500">
            当前结果 {filteredUsers.length} 条
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <AdminTableSkeleton rows={10} />
          ) : error ? (
            <AdminErrorState onRetry={loadUsers} />
          ) : filteredUsers.length === 0 ? (
            <AdminEmptyState title="暂无用户" description="当前筛选条件下没有用户数据。" />
          ) : (
            <Table className="min-w-[980px]">
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-xs">邮箱</TableHead>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-xs">显示名称</TableHead>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-xs">角色</TableHead>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-xs">余额</TableHead>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-xs">注册时间</TableHead>
                  <TableHead className="h-10 whitespace-nowrap px-3 text-right text-xs">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageUsers.map((user) => (
                  <TableRow key={user.id} className="h-12">
                    <TableCell className="whitespace-nowrap px-3 py-2 text-xs font-medium">
                      {user.email || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">
                      {user.displayName || "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <RoleBadge role={user.role} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-xs">
                      ¥{user.balance.toFixed(2)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedUser(user)}>
                        查看
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-3 py-3 text-sm text-slate-500">
          <span>共 {filteredUsers.length} 条</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              上一页
            </Button>
            <span>第 {page} / {totalPages} 页</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      </div>

      <UserDrawer user={selectedUser} onClose={() => setSelectedUser(null)} />
    </AdminPageShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{value}</div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap text-[10px]",
        role === "admin"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-slate-50 text-slate-600"
      )}
    >
      {role === "admin" ? "admin" : "user"}
    </Badge>
  );
}

function UserDrawer({
  onClose,
  user,
}: {
  onClose: () => void;
  user: AdminUserRow | null;
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      const { data, error: loadError, count } = await getSupabaseBrowserClient()
        .from("orders")
        .select("total_amount", { count: "exact" })
        .eq("user_id", user.id);

      if (loadError) throw loadError;
      const totalSpent = ((data ?? []) as Array<{ total_amount?: unknown }>).reduce(
        (sum, order) => sum + Number(order.total_amount ?? 0),
        0
      );
      setDetail({ orderCount: count ?? 0, totalSpent });
    } catch (loadError) {
      console.error("[Admin Users] Failed to load user detail", loadError);
      setError(true);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadDetail();
  }, [loadDetail, user]);

  useEffect(() => {
    if (!user) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, user]);

  if (!user) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/30" onClick={onClose}>
      <aside
        className="ml-auto flex h-full w-full min-w-0 max-w-[680px] flex-col bg-white shadow-2xl sm:w-[min(640px,92vw)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div>
            <div className="text-lg font-semibold text-slate-950">用户详情</div>
            <div className="mt-1 text-xs text-slate-500">{user.email || "—"}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭用户详情"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {loading ? (
            <AdminTableSkeleton rows={5} />
          ) : error ? (
            <AdminErrorState onRetry={loadDetail} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoLine label="邮箱" value={user.email} />
              <InfoLine label="显示名称" value={user.displayName} />
              <InfoLine label="角色" value={user.role} />
              <InfoLine label="余额" value={`¥${user.balance.toFixed(2)}`} />
              <InfoLine label="注册时间" value={formatDate(user.created_at)} />
              <InfoLine label="最近登录" value={null} />
              <InfoLine label="订单数量" value={String(detail?.orderCount ?? 0)} />
              <InfoLine label="累计消费" value={`¥${Number(detail?.totalSpent ?? 0).toFixed(2)}`} />
              <InfoLine label="账号状态" value={user.status ?? "—"} />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 break-words text-sm font-medium text-slate-900">{value || "—"}</div>
    </div>
  );
}

function NativeSelect({
  children,
  onChange,
  value,
}: {
  children: ReactNode;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <select
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}
