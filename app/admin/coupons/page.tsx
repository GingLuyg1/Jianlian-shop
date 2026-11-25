"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  TicketPercent,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type CouponItem = {
  id: string;
  code: string;
  name: string;
  batch_label: string | null;
  discount_amount: number;
  min_order_amount: number;
  max_uses: number;
  used_count: number;
  status: "active" | "disabled" | "exhausted";
  expires_at: string | null;
  note: string | null;
  created_at: string;
  last_order_no?: string | null;
};

type CouponSummary = {
  total: number;
  active: number;
  exhausted: number;
  disabled: number;
  totalRedeemed: number;
  totalDiscountGranted: number;
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: "可用中", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  exhausted: { label: "已核销", className: "border-blue-200 bg-blue-50 text-blue-700" },
  disabled: { label: "已停用", className: "border-slate-200 bg-slate-100 text-slate-500" },
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "永久有效";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [summary, setSummary] = useState<CouponSummary>({
    total: 0,
    active: 0,
    exhausted: 0,
    disabled: 0,
    totalRedeemed: 0,
    totalDiscountGranted: 0,
  });
  const [batches, setBatches] = useState<string[]>([]);
  const [schemaReady, setSchemaReady] = useState(true);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("all");
  const [discountFilter, setDiscountFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Batch generation dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [genCount, setGenCount] = useState("5");
  const [genAmount, setGenAmount] = useState("10");
  const [genMinAmount, setGenMinAmount] = useState("0");
  const [genMaxUses, setGenMaxUses] = useState("1");
  const [genName, setGenName] = useState("10元代金券");
  const [genPrefix, setGenPrefix] = useState("JL10");
  const [genBatchLabel, setGenBatchLabel] = useState("");
  const [genCustomCode, setGenCustomCode] = useState("");
  const [genExpiresAt, setGenExpiresAt] = useState("");
  const [genNote, setGenNote] = useState("");

  // Newly generated codes export dialog
  const [generatedCodes, setGeneratedCodes] = useState<{ title: string; codes: string[] } | null>(null);

  const loadCoupons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status: statusFilter,
      });
      if (search.trim()) params.set("search", search.trim());
      if (batchFilter !== "all") params.set("batch", batchFilter);
      if (discountFilter !== "all") params.set("discount", discountFilter);

      const res = await fetch(`/api/admin/coupons?${params.toString()}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as {
        schemaReady?: boolean;
        coupons?: CouponItem[];
        count?: number;
        batches?: string[];
        summary?: CouponSummary;
        error?: string;
      } | null;

      if (!res.ok) {
        throw new Error(payload?.error || "优惠券数据加载失败");
      }

      setSchemaReady(payload?.schemaReady !== false);
      setCoupons(payload?.coupons ?? []);
      setCount(payload?.count ?? 0);
      setBatches(payload?.batches ?? []);
      if (payload?.summary) setSummary(payload.summary);
      if (payload?.schemaReady === false && payload.error) {
        setError(payload.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "优惠券数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [batchFilter, discountFilter, page, search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCoupons();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [loadCoupons]);

  const applyPreset = (preset: { count: number; amount: number; name: string; prefix: string; batch: string }) => {
    setGenCount(String(preset.count));
    setGenAmount(String(preset.amount));
    setGenMinAmount("0");
    setGenMaxUses("1");
    setGenName(preset.name);
    setGenPrefix(preset.prefix);
    setGenBatchLabel(preset.batch);
    setGenCustomCode("");
    setCreateOpen(true);
  };

  const handleGenerate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: Number(genCount),
          discountAmount: Number(genAmount),
          minOrderAmount: Number(genMinAmount || 0),
          maxUses: Number(genMaxUses || 1),
          name: genName.trim() || `¥${genAmount} 优惠券`,
          prefix: genPrefix.trim() || "JL",
          batchLabel: genBatchLabel.trim() || undefined,
          code: Number(genCount) === 1 && genCustomCode.trim() ? genCustomCode.trim() : undefined,
          expiresAt: genExpiresAt ? new Date(genExpiresAt).toISOString() : undefined,
          note: genNote.trim() || undefined,
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        codes?: string[];
        createdCount?: number;
        error?: string;
      } | null;
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || "生成优惠券失败");
      }
      toast.success(`成功生成 ${payload.createdCount ?? 0} 张优惠券`);
      setCreateOpen(false);
      setGeneratedCodes({
        title: `${genName.trim() || `¥${genAmount} 优惠券`}（共 ${payload.codes?.length ?? 0} 张）`,
        codes: payload.codes ?? [],
      });
      setPage(1);
      await loadCoupons();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成优惠券失败");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (item: CouponItem) => {
    const nextStatus = item.status === "disabled" ? "active" : "disabled";
    setBusyId(item.id);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, status: nextStatus }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "状态更新失败");
      toast.success(nextStatus === "disabled" ? "优惠券已停用" : "优惠券已重新启用");
      await loadCoupons();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "状态更新失败");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: CouponItem) => {
    if (!window.confirm(`确定删除未使用的优惠券 ${item.code} 吗？删除后不可恢复。`)) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/admin/coupons?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "删除失败");
      toast.success("优惠券已删除");
      await loadCoupons();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  };

  const handleExportCurrentFilter = async () => {
    try {
      const params = new URLSearchParams({
        export: "1",
        status: statusFilter,
      });
      if (search.trim()) params.set("search", search.trim());
      if (batchFilter !== "all") params.set("batch", batchFilter);
      if (discountFilter !== "all") params.set("discount", discountFilter);

      const res = await fetch(`/api/admin/coupons?${params.toString()}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { coupons?: CouponItem[]; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "导出失败");
      const rows = payload?.coupons ?? [];
      if (rows.length === 0) {
        toast.info("当前筛选条件下没有可导出的优惠券");
        return;
      }
      const header = "优惠券码,名称,面额(元),最低门槛(元),状态,已用/上限,批次,过期时间,关联订单号";
      const lines = rows.map((r) =>
        [
          r.code,
          `"${(r.name || "").replace(/"/g, '""')}"`,
          r.discount_amount.toFixed(2),
          r.min_order_amount.toFixed(2),
          STATUS_BADGE[r.status]?.label ?? r.status,
          `${r.used_count}/${r.max_uses}`,
          `"${(r.batch_label || "").replace(/"/g, '""')}"`,
          formatDateTime(r.expires_at),
          r.last_order_no || "",
        ].join(",")
      );
      downloadTextFile(`coupons-export-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${header}\n${lines.join("\n")}`);
      toast.success(`已导出 ${rows.length} 条优惠券记录`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const todayStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  return (
    <AdminPageShell
      variant="v2"
      title="优惠券管理"
      description="批量生成高安全随机优惠券码、管理使用状态与核销记录；单券原子锁定防刷，支持一键导出发券。"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleExportCurrentFilter()} disabled={loading || !schemaReady}>
            <Download className="mr-1.5 h-4 w-4" />
            导出 CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void loadCoupons()} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} />
            刷新
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!schemaReady}>
            <Plus className="mr-1.5 h-4 w-4" />
            批量生成优惠券
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        {/* KPI 概览 */}
        <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <Card className="p-3.5">
            <div className="text-xs text-slate-500">优惠券总数</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{summary.total}</div>
          </Card>
          <Card className="p-3.5">
            <div className="text-xs text-slate-500">可用中</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-emerald-600">{summary.active}</div>
          </Card>
          <Card className="p-3.5">
            <div className="text-xs text-slate-500">已核销</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-blue-600">{summary.exhausted}</div>
          </Card>
          <Card className="p-3.5">
            <div className="text-xs text-slate-500">已停用</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-slate-500">{summary.disabled}</div>
          </Card>
          <Card className="p-3.5">
            <div className="text-xs text-slate-500">累计抵扣金额</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-orange-600">¥{summary.totalDiscountGranted.toFixed(2)}</div>
          </Card>
        </div>

        {/* 快捷发券预设条 */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
            <TicketPercent className="h-4 w-4 text-primary" />
            快捷批量发券：
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={!schemaReady}
            onClick={() => applyPreset({ count: 5, amount: 10, name: "10元代金券", prefix: "JL10", batch: `${todayStamp}-10元x5` })}
          >
            + 5 张 ¥10 券
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={!schemaReady}
            onClick={() => applyPreset({ count: 10, amount: 10, name: "10元代金券", prefix: "JL10", batch: `${todayStamp}-10元x10` })}
          >
            + 10 张 ¥10 券
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={!schemaReady}
            onClick={() => applyPreset({ count: 100, amount: 1, name: "1元代金券", prefix: "JL1", batch: `${todayStamp}-1元x100` })}
          >
            + 100 张 ¥1 券
          </Button>
          <span className="ml-auto text-[11px] text-slate-400">
            安全规则：服务端随机高熵码 + 接口防爆破限流 + 数据库原子行锁核销（实付最低 ¥0.01）
          </span>
        </div>

        {/* 主表格卡片 */}
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CardHeader className="shrink-0 border-b px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1 max-w-[280px]">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="搜索券码 / 名称 / 批次"
                  className="h-9 pl-9 text-sm"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-[124px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="active">可用中</SelectItem>
                  <SelectItem value="exhausted">已核销</SelectItem>
                  <SelectItem value="disabled">已停用</SelectItem>
                </SelectContent>
              </Select>
              <Select value={discountFilter} onValueChange={(v) => { setDiscountFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-[124px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部面额</SelectItem>
                  <SelectItem value="10">¥10 面额</SelectItem>
                  <SelectItem value="1">¥1 面额</SelectItem>
                  <SelectItem value="5">¥5 面额</SelectItem>
                </SelectContent>
              </Select>
              <Select value={batchFilter} onValueChange={(v) => { setBatchFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部批次</SelectItem>
                  {batches.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setBatchFilter("all");
                  setDiscountFilter("all");
                  setPage(1);
                }}
              >
                重置
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            {error ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <AdminErrorState title="优惠券加载失败" description={error} onRetry={() => void loadCoupons()} />
              </div>
            ) : loading ? (
              <div className="p-4"><AdminTableSkeleton rows={8} /></div>
            ) : coupons.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <AdminEmptyState
                  title="暂无优惠券"
                  description="点击上方「批量生成优惠券」或快捷预设按钮即可一键创建。"
                />
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                <Table className="min-w-[960px]">
                  <TableHeader className="sticky top-0 z-10 bg-slate-50">
                    <TableRow>
                      <TableHead className="whitespace-nowrap">优惠券码</TableHead>
                      <TableHead className="whitespace-nowrap">名称 / 批次</TableHead>
                      <TableHead className="whitespace-nowrap text-right">面额</TableHead>
                      <TableHead className="whitespace-nowrap text-right">使用门槛</TableHead>
                      <TableHead className="whitespace-nowrap text-center">状态</TableHead>
                      <TableHead className="whitespace-nowrap text-center">使用进度</TableHead>
                      <TableHead className="whitespace-nowrap">核销订单</TableHead>
                      <TableHead className="whitespace-nowrap">有效期</TableHead>
                      <TableHead className="whitespace-nowrap text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coupons.map((item) => {
                      const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.disabled;
                      const isBusy = busyId === item.id;
                      return (
                        <TableRow key={item.id} className="text-xs">
                          <TableCell className="whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-900">
                                {item.code}
                              </code>
                              <button
                                type="button"
                                onClick={() => void copyText(item.code, `已复制券码 ${item.code}`)}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="复制券码"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-slate-900">{item.name}</div>
                            {item.batch_label ? (
                              <div className="mt-0.5 text-[11px] text-slate-500">批次：{item.batch_label}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums text-orange-600">
                            ¥{item.discount_amount.toFixed(2)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums text-slate-600">
                            {item.min_order_amount > 0 ? `满 ¥${item.min_order_amount.toFixed(2)}` : "无门槛"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-center">
                            <Badge variant="outline" className={badge.className}>
                              {badge.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-center tabular-nums text-slate-700">
                            {item.used_count} / {item.max_uses}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {item.last_order_no ? (
                              <Link
                                href={`/admin/orders?search=${encodeURIComponent(item.last_order_no)}`}
                                className="font-mono text-blue-600 hover:underline"
                              >
                                {item.last_order_no}
                              </Link>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-slate-500">
                            {formatDateTime(item.expires_at)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {item.status !== "exhausted" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  disabled={isBusy}
                                  onClick={() => void handleToggleStatus(item)}
                                >
                                  {item.status === "disabled" ? (
                                    <>
                                      <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" />
                                      启用
                                    </>
                                  ) : (
                                    <>
                                      <Ban className="mr-1 h-3 w-3 text-amber-600" />
                                      停用
                                    </>
                                  )}
                                </Button>
                              ) : null}
                              {item.used_count === 0 ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
                                  disabled={isBusy}
                                  onClick={() => void handleDelete(item)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex shrink-0 items-center justify-between border-t px-4 py-2.5 text-xs text-slate-500">
              <span>共 {count} 条，第 {page} / {totalPages} 页</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  上一页
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  下一页
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 批量生成弹窗 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>批量生成优惠券</DialogTitle>
            <DialogDescription>
              系统将使用高强度随机码生成优惠券，默认单码单次使用、结算实付最低保留 ¥0.01。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>生成数量（1–500 张）</Label>
                <Input type="number" min={1} max={500} value={genCount} onChange={(e) => setGenCount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>立减面额（CNY）</Label>
                <Input type="number" min={0.01} step="0.01" value={genAmount} onChange={(e) => setGenAmount(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>最低订单门槛（0 为无门槛）</Label>
                <Input type="number" min={0} step="0.01" value={genMinAmount} onChange={(e) => setGenMinAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>每张券可用次数</Label>
                <Input type="number" min={1} max={10000} value={genMaxUses} onChange={(e) => setGenMaxUses(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>优惠券名称</Label>
                <Input value={genName} onChange={(e) => setGenName(e.target.value)} placeholder="例如：10元代金券" />
              </div>
              <div className="space-y-1.5">
                <Label>券码前缀</Label>
                <Input value={genPrefix} onChange={(e) => setGenPrefix(e.target.value)} placeholder="例如：JL10 / JL1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>批次标签（方便筛选导出）</Label>
                <Input value={genBatchLabel} onChange={(e) => setGenBatchLabel(e.target.value)} placeholder="例如：20261125-活动批" />
              </div>
              <div className="space-y-1.5">
                <Label>过期时间（留空永久有效）</Label>
                <Input type="datetime-local" value={genExpiresAt} onChange={(e) => setGenExpiresAt(e.target.value)} />
              </div>
            </div>
            {Number(genCount) === 1 ? (
              <div className="space-y-1.5">
                <Label>自定义券码（仅单张可选，留空自动随机）</Label>
                <Input value={genCustomCode} onChange={(e) => setGenCustomCode(e.target.value)} placeholder="例如：VIP10OFF" />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>内部备注（选填）</Label>
              <Input value={genNote} onChange={(e) => setGenNote(e.target.value)} placeholder="例如：发给老客补偿 / 群福利" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>取消</Button>
            <Button onClick={() => void handleGenerate()} disabled={creating}>
              {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              确认生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 生成结果一键复制/导出弹窗 */}
      <Dialog open={Boolean(generatedCodes)} onOpenChange={(open) => { if (!open) setGeneratedCodes(null); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{generatedCodes?.title ?? "生成完成"}</DialogTitle>
            <DialogDescription>以下优惠券已写入数据库并立即生效，可直接复制或导出 TXT 发给客户。</DialogDescription>
          </DialogHeader>
          <textarea
            readOnly
            rows={10}
            value={(generatedCodes?.codes ?? []).join("\n")}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-6 text-slate-800 focus:outline-none"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() =>
                downloadTextFile(
                  `coupons-${todayStamp}.txt`,
                  (generatedCodes?.codes ?? []).join("\n")
                )
              }
            >
              <Download className="mr-1.5 h-4 w-4" />
              下载 TXT
            </Button>
            <Button
              onClick={() => void copyText((generatedCodes?.codes ?? []).join("\n"), "已复制全部优惠券码")}
            >
              <Copy className="mr-1.5 h-4 w-4" />
              一键复制全部
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageShell>
  );
}
