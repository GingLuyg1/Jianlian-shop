"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Loader2, PackageCheck, Plus, RefreshCw, Search, Upload } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type InventoryStatus = "all" | "available" | "reserved" | "delivered" | "disabled" | "invalid";

type InventorySummary = {
  product_id: string;
  product_name: string;
  product_slug: string | null;
  batch_no: string | null;
  available_count: number;
  reserved_count: number;
  delivered_count: number;
  disabled_count: number;
  expired_count: number;
  total_count: number;
  updated_at: string | null;
};

type InventoryItem = {
  id: string;
  product_id: string;
  masked_content: string;
  status: InventoryStatus;
  order_id: string | null;
  batch_no: string | null;
  remark: string | null;
  reserved_at: string | null;
  delivered_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type InventoryProduct = {
  id: string;
  name: string;
  slug: string | null;
  delivery_type: string | null;
  status: string | null;
};

const PAGE_SIZE = 20;
const DETAIL_PAGE_SIZE = 50;

const statusOptions: Array<{ value: InventoryStatus; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "available", label: "可用" },
  { value: "reserved", label: "已预留" },
  { value: "delivered", label: "已交付" },
  { value: "disabled", label: "已禁用" },
  { value: "invalid", label: "无效" },
];

const statusLabel: Record<string, string> = {
  available: "可用",
  reserved: "已预留",
  delivered: "已交付",
  disabled: "已禁用",
  invalid: "无效",
};

const statusClass: Record<string, string> = {
  available: "bg-green-50 text-green-700 ring-green-200",
  reserved: "bg-amber-50 text-amber-700 ring-amber-200",
  delivered: "bg-blue-50 text-blue-700 ring-blue-200",
  disabled: "bg-slate-100 text-slate-600 ring-slate-200",
  invalid: "bg-red-50 text-red-700 ring-red-200",
};
function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  return fallback;
}

function parseImportText(text: string) {
  const lines = text.split(/\r?\n/);
  const seen = new Set<string>();
  const valid: string[] = [];
  let empty = 0;
  let duplicate = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      empty += 1;
      continue;
    }
    if (seen.has(trimmed)) {
      duplicate += 1;
      continue;
    }
    seen.add(trimmed);
    valid.push(trimmed);
  }

  return { total: lines.length, valid, empty, duplicate };
}

export default function AdminInventoryPage() {
  const [rows, setRows] = useState<InventorySummary[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [count, setCount] = useState(0);
  const [itemCount, setItemCount] = useState(0);
  const [page, setPage] = useState(1);
  const [itemPage, setItemPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InventoryStatus>("all");
  const [detailStatus, setDetailStatus] = useState<InventoryStatus>("all");
  const [selected, setSelected] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formProductId, setFormProductId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [remark, setRemark] = useState("");
  const [singleContent, setSingleContent] = useState("");
  const [bulkContent, setBulkContent] = useState("");

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const detailPages = Math.max(1, Math.ceil(itemCount / DETAIL_PAGE_SIZE));
  const importPreview = useMemo(() => parseImportText(bulkContent), [bulkContent]);

  const loadProducts = useCallback(async () => {
    const response = await fetch("/api/admin/inventory?mode=products");
    const result = (await response.json().catch(() => null)) as
      | { products?: InventoryProduct[]; error?: string }
      | null;
    if (!response.ok) throw new Error(result?.error ?? "商品读取失败");
    setProducts(result?.products ?? []);
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      search,
      status,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });

    try {
      const response = await fetch(`/api/admin/inventory?${params.toString()}`);
      const result = (await response.json().catch(() => null)) as
        | { rows?: InventorySummary[]; count?: number; error?: string }
        | null;
      if (!response.ok) throw new Error(result?.error ?? "库存读取失败");
      setRows(result?.rows ?? []);
      setCount(result?.count ?? 0);
    } catch (loadError) {
      setRows([]);
      setCount(0);
      setError(getErrorMessage(loadError, "库存读取失败"));
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  const loadItems = useCallback(async (target: InventorySummary | null = selected) => {
    if (!target) return;
    setDetailLoading(true);
    const params = new URLSearchParams({
      mode: "items",
      productId: target.product_id,
      batchNo: target.batch_no ?? "",
      status: detailStatus,
      page: String(itemPage),
      pageSize: String(DETAIL_PAGE_SIZE),
    });

    try {
      const response = await fetch(`/api/admin/inventory?${params.toString()}`);
      const result = (await response.json().catch(() => null)) as
        | { items?: InventoryItem[]; count?: number; error?: string }
        | null;
      if (!response.ok) throw new Error(result?.error ?? "库存详情读取失败");
      setItems(result?.items ?? []);
      setItemCount(result?.count ?? 0);
    } catch (loadError) {
      setItems([]);
      setItemCount(0);
      setMessage(getErrorMessage(loadError, "库存详情读取失败"));
    } finally {
      setDetailLoading(false);
    }
  }, [detailStatus, itemPage, selected]);

  useEffect(() => {
    loadProducts().catch(() => undefined);
  }, [loadProducts]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (selected) loadItems(selected);
  }, [loadItems, selected]);

  async function importInventory(contents: string[]) {
    if (!formProductId) {
      setMessage("请选择商品");
      return;
    }
    if (contents.length === 0) {
      setMessage("没有可导入的有效库存");
      return;
    }
    if (contents.length > 1000) {
      setMessage("单次最多导入 1000 条");
      return;
    }

    const confirmed = window.confirm(`确认导入 ${contents.length} 条库存？重复内容将由服务端继续跳过。`);
    if (!confirmed) return;

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: formProductId,
          contents,
          batch_no: batchNo,
          remark,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | {
            result?: {
              inserted_count?: number;
              skipped_count?: number;
              available_count?: number;
            };
            error?: string;
          }
        | null;
      if (!response.ok) throw new Error(result?.error ?? "库存导入失败");
      setMessage(
        `导入完成：新增 ${result?.result?.inserted_count ?? 0} 条，跳过 ${result?.result?.skipped_count ?? 0} 条，可用库存 ${result?.result?.available_count ?? 0}。`
      );
      setSingleContent("");
      setBulkContent("");
      await loadRows();
      if (selected) await loadItems(selected);
    } catch (saveError) {
      setMessage(getErrorMessage(saveError, "库存导入失败"));
    } finally {
      setSaving(false);
    }
  }

  async function disableItem(item: InventoryItem) {
    const confirmed = window.confirm("确认禁用该库存？已交付库存不能禁用。");
    if (!confirmed) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory_id: item.id, remark: "管理员禁用" }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "库存禁用失败");
      setMessage("库存已禁用");
      await loadRows();
      if (selected) await loadItems(selected);
    } catch (disableError) {
      setMessage(getErrorMessage(disableError, "库存禁用失败"));
    } finally {
      setSaving(false);
    }
  }

  function openDetail(row: InventorySummary) {
    setSelected(row);
    setFormProductId(row.product_id);
    setBatchNo(row.batch_no ?? "");
    setItemPage(1);
  }

  return (
    <AdminPageShell
      title="数字库存"
      description="管理自动发货商品的卡密、账号和交付内容。敏感内容仅通过服务端交付给对应订单。"
      actions={
        <Button variant="outline" size="sm" onClick={loadRows} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      }
    >
      <div className="grid min-h-0 w-full flex-1 gap-3 overflow-hidden xl:grid-cols-[minmax(0,1fr)_minmax(360px,400px)]">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CardHeader className="shrink-0 px-4 py-3">
            <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_150px_auto] xl:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="按商品名称或 Slug 搜索"
                  className="h-9 pl-9"
                />
              </div>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as InventoryStatus);
                  setPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="text-sm text-slate-500">当前结果 {count} 条</div>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-0 pb-0 pt-0">
            {error ? (
              <AdminErrorState description={error} onRetry={loadRows} />
            ) : loading ? (
              <div className="p-4">
                <AdminTableSkeleton rows={8} />
              </div>
            ) : rows.length === 0 ? (
              <AdminEmptyState
                icon={<PackageCheck className="h-5 w-5" />}
                title="暂无数字库存"
                description="选择自动发货商品后，可以在右侧新增或批量导入库存。"
              />
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                <Table className="min-w-[980px]">
                  <TableHeader className="sticky top-0 z-10 bg-white">
                    <TableRow>
                      <TableHead className="min-w-[220px]">商品</TableHead>
                      <TableHead className="min-w-[120px]">库存批次</TableHead>
                      <TableHead className="whitespace-nowrap text-center">可用</TableHead>
                      <TableHead className="whitespace-nowrap text-center">已预留</TableHead>
                      <TableHead className="whitespace-nowrap text-center">已交付</TableHead>
                      <TableHead className="whitespace-nowrap text-center">已禁用</TableHead>
                      <TableHead className="min-w-[150px]">更新时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={`${row.product_id}-${row.batch_no ?? "default"}`}>
                        <TableCell>
                          <div className="font-medium text-slate-900">{row.product_name}</div>
                          <div className="text-xs text-slate-500">{row.product_slug ?? "-"}</div>
                        </TableCell>
                        <TableCell className="text-sm">{row.batch_no || "默认批次"}</TableCell>
                        <TableCell className="text-center font-semibold text-green-700">{row.available_count}</TableCell>
                        <TableCell className="text-center">{row.reserved_count}</TableCell>
                        <TableCell className="text-center">{row.delivered_count}</TableCell>
                        <TableCell className="text-center">{row.disabled_count}</TableCell>
                        <TableCell className="text-xs text-slate-500">{formatDate(row.updated_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openDetail(row)}>
                            <Eye className="mr-1 h-4 w-4" />
                            查看
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="flex shrink-0 items-center justify-between border-t px-4 py-3 text-sm text-slate-500">
              <span>第 {page} / {totalPages} 页</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((next) => Math.max(1, next - 1))}>
                  上一页
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((next) => next + 1)}>
                  下一页
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <aside className="flex min-h-0 flex-col overflow-hidden pr-1">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <Card className="shrink-0">
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-base">新增库存</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4 pt-0">
                <div className="space-y-1.5">
                  <Label>商品</Label>
                  <select
                    value={formProductId}
                    onChange={(event) => setFormProductId(event.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">选择自动发货商品</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>批次</Label>
                    <Input value={batchNo} onChange={(event) => setBatchNo(event.target.value)} placeholder="可选" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>备注</Label>
                    <Input value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="可选" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>单条库存</Label>
                  <Textarea
                    value={singleContent}
                    onChange={(event) => setSingleContent(event.target.value)}
                    rows={3}
                    placeholder="卡密、账号---密码或完整交付内容"
                  />
                </div>
                <Button className="w-full" disabled={saving || !singleContent.trim()} onClick={() => importInventory([singleContent])}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  单条新增
                </Button>
              </CardContent>
            </Card>

            <Card className="flex min-h-[360px] flex-1 flex-col overflow-hidden">
              <CardHeader className="shrink-0 px-4 py-3">
                <CardTitle className="text-base">批量导入</CardTitle>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pb-4 pt-0">
                <Textarea
                  value={bulkContent}
                  onChange={(event) => setBulkContent(event.target.value)}
                  className="min-h-0 flex-1 resize-none"
                  placeholder={"每行一条卡密\n账号----密码\n卡号----密码\n自定义完整交付内容"}
                />
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <PreviewStat label="总行数" value={importPreview.total} />
                  <PreviewStat label="有效" value={importPreview.valid.length} />
                  <PreviewStat label="重复" value={importPreview.duplicate} />
                  <PreviewStat label="空行" value={importPreview.empty} />
                </div>
                <Button disabled={saving || importPreview.valid.length === 0} onClick={() => importInventory(importPreview.valid)}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  确认导入
                </Button>
                {message ? <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{message}</div> : null}
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelected(null)}>
          <div className="flex h-full w-full max-w-[760px] flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4">
              <div>
                <div className="font-semibold text-slate-950">{selected.product_name}</div>
                <div className="mt-1 text-sm text-slate-500">{selected.batch_no || "默认批次"} · 共 {itemCount} 条</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                关闭
              </Button>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3">
              <select
                value={detailStatus}
                onChange={(event) => {
                  setDetailStatus(event.target.value as InventoryStatus);
                  setItemPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={() => loadItems(selected)} disabled={detailLoading}>
                刷新
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              {detailLoading ? (
                <AdminTableSkeleton rows={8} />
              ) : items.length === 0 ? (
                <AdminEmptyState title="暂无库存明细" description="当前筛选下没有库存记录。" />
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-xs text-slate-900">{item.masked_content}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            更新：{formatDate(item.updated_at)}
                            {item.order_id ? ` · 订单 ${item.order_id.slice(0, 8)}` : ""}
                          </div>
                        </div>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs ring-1", statusClass[item.status] ?? statusClass.disabled)}>
                          {statusLabel[item.status] ?? item.status}
                        </span>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Button variant="outline" size="sm" disabled={saving || item.status === "delivered"} onClick={() => disableItem(item)}>
                          禁用
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-between border-t px-5 py-3 text-sm text-slate-500">
              <span>第 {itemPage} / {detailPages} 页</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={itemPage <= 1} onClick={() => setItemPage((next) => Math.max(1, next - 1))}>
                  上一页
                </Button>
                <Button variant="outline" size="sm" disabled={itemPage >= detailPages} onClick={() => setItemPage((next) => next + 1)}>
                  下一页
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AdminPageShell>
  );
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-2">
      <div className="font-semibold text-slate-900">{value}</div>
      <div className="mt-0.5 text-slate-500">{label}</div>
    </div>
  );
}

