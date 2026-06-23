"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Ban, Eye, FileText, Loader2, PackageCheck, RefreshCw, RotateCcw, Upload, X } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type InventoryProduct = {
  id: string;
  name: string;
  slug: string;
  delivery_type: string | null;
  status: string | null;
};

type InventorySummary = {
  product_id: string;
  product_name: string;
  product_slug: string;
  total_count: number;
  available_count: number;
  reserved_count: number;
  delivered_count: number;
  disabled_count: number;
  expired_count: number;
  total_rows: number;
};

type InventoryBatch = {
  id: string;
  batch_no: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  batch_name: string | null;
  content_type: string;
  total_count: number;
  available_count: number;
  reserved_count: number;
  delivered_count: number;
  invalid_count: number;
  source_filename: string | null;
  import_status: string;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
  total_rows: number;
};

type InventoryItem = {
  id: string;
  product_id: string;
  batch_id?: string | null;
  batch_no?: string | null;
  content_type: string;
  masked_content: string;
  status: string;
  order_no?: string | null;
  created_at: string;
  delivered_at?: string | null;
  total_rows: number;
};

type ImportPreview = {
  fileName: string;
  totalRows: number;
  validRows: number;
  emptyRows: number;
  fileDuplicateRows: number;
  databaseDuplicateRows: number;
  invalidRows: number;
  estimatedImportRows: number;
  previewRows: Array<{ lineNumber: number; maskedContent: string }>;
};

type ImportResult = {
  batchId: string | null;
  batchNo: string | null;
  importedRows: number;
  skippedRows: number;
  failedRows: number;
  importStatus: string;
};

const STATUS_LABELS: Record<string, string> = {
  all: "全部状态",
  available: "可用",
  reserved: "已预留",
  delivered: "已交付",
  disabled: "已禁用",
  expired: "已过期",
  invalid: "无效",
};

const BATCH_STATUS_LABELS: Record<string, string> = {
  all: "全部批次",
  processing: "处理中",
  completed: "已完成",
  partial_failed: "部分失败",
  failed: "失败",
  disabled: "已禁用",
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  card_key: "卡密",
  redeem_code: "兑换码",
  account_password: "账号密码",
  plain_text: "纯文本交付内容",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : fallback);
  }
  return payload as T;
}

export default function AdminInventoryPage() {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [summaryRows, setSummaryRows] = useState<InventorySummary[]>([]);
  const [batchRows, setBatchRows] = useState<InventoryBatch[]>([]);
  const [itemRows, setItemRows] = useState<InventoryItem[]>([]);
  const [view, setView] = useState<"summary" | "batches">("summary");
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [batchPage, setBatchPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<InventorySummary | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<InventoryBatch | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [itemStatus, setItemStatus] = useState("all");

  const [importProductId, setImportProductId] = useState("");
  const [contentType, setContentType] = useState("card_key");
  const [batchName, setBatchName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const pageSize = 20;
  const summaryTotal = summaryRows[0]?.total_rows ?? 0;
  const batchTotal = batchRows[0]?.total_rows ?? 0;
  const itemTotal = itemRows[0]?.total_rows ?? 0;

  const loadProducts = useCallback(async () => {
    const response = await fetch("/api/admin/inventory?mode=products", { cache: "no-store" });
    const payload = await readJson<{ data: InventoryProduct[] }>(response, "商品列表加载失败");
    setProducts(payload.data ?? []);
  }, []);

  const loadSummary = useCallback(async () => {
    const params = new URLSearchParams({ search, status, page: String(page), pageSize: String(pageSize) });
    const response = await fetch(`/api/admin/inventory?${params.toString()}`, { cache: "no-store" });
    const payload = await readJson<{ data: InventorySummary[] }>(response, "库存汇总加载失败");
    setSummaryRows(payload.data ?? []);
  }, [page, search, status]);

  const loadBatches = useCallback(async () => {
    const params = new URLSearchParams({ mode: "batches", search, status, page: String(batchPage), pageSize: String(pageSize) });
    const response = await fetch(`/api/admin/inventory?${params.toString()}`, { cache: "no-store" });
    const payload = await readJson<{ data: InventoryBatch[] }>(response, "库存批次加载失败");
    setBatchRows(payload.data ?? []);
  }, [batchPage, search, status]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadProducts(), view === "summary" ? loadSummary() : loadBatches()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "库存数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [loadBatches, loadProducts, loadSummary, view]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openProductItems = useCallback(async (row: InventorySummary) => {
    setSelectedProduct(row);
    setSelectedBatch(null);
    setDetailOpen(true);
    setItemsLoading(true);
    setItemRows([]);
    try {
      const params = new URLSearchParams({ mode: "items", productId: row.product_id, status: itemStatus, page: "1", pageSize: "50" });
      const response = await fetch(`/api/admin/inventory?${params.toString()}`, { cache: "no-store" });
      const payload = await readJson<{ data: InventoryItem[] }>(response, "库存明细加载失败");
      setItemRows(payload.data ?? []);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "库存明细加载失败");
    } finally {
      setItemsLoading(false);
    }
  }, [itemStatus]);

  const openBatchItems = useCallback(async (row: InventoryBatch) => {
    setSelectedBatch(row);
    setSelectedProduct({
      product_id: row.product_id,
      product_name: row.product_name,
      product_slug: row.product_slug,
      total_count: row.total_count,
      available_count: row.available_count,
      reserved_count: row.reserved_count,
      delivered_count: row.delivered_count,
      disabled_count: 0,
      expired_count: 0,
      total_rows: row.total_rows,
    });
    setDetailOpen(true);
    setItemsLoading(true);
    setItemRows([]);
    try {
      const params = new URLSearchParams({ mode: "items", productId: row.product_id, status: itemStatus, page: "1", pageSize: "50" });
      const response = await fetch(`/api/admin/inventory?${params.toString()}`, { cache: "no-store" });
      const payload = await readJson<{ data: InventoryItem[] }>(response, "库存明细加载失败");
      setItemRows((payload.data ?? []).filter((item) => item.batch_no === row.batch_no));
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "库存明细加载失败");
    } finally {
      setItemsLoading(false);
    }
  }, [itemStatus]);

  const previewImport = useCallback(async () => {
    if (!importProductId || !file) {
      setNotice("请选择商品和导入文件");
      return;
    }
    setSubmitting(true);
    setNotice(null);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.set("intent", "preview");
      formData.set("product_id", importProductId);
      formData.set("content_type", contentType);
      formData.set("batch_name", batchName);
      formData.set("file", file);
      const response = await fetch("/api/admin/inventory", { method: "POST", body: formData });
      const payload = await readJson<{ preview: ImportPreview }>(response, "库存文件解析失败");
      setPreview(payload.preview);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "库存文件解析失败");
    } finally {
      setSubmitting(false);
    }
  }, [batchName, contentType, file, importProductId]);

  const confirmImport = useCallback(async () => {
    if (!importProductId || !file || !preview) {
      setNotice("请先完成导入预览");
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.set("intent", "import");
      formData.set("product_id", importProductId);
      formData.set("content_type", contentType);
      formData.set("batch_name", batchName);
      formData.set("file", file);
      const response = await fetch("/api/admin/inventory", { method: "POST", body: formData });
      const payload = await readJson<{ result: ImportResult }>(response, "库存导入失败");
      setImportResult(payload.result);
      setPreview(null);
      setFile(null);
      setBatchName("");
      await loadData();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "库存导入失败");
    } finally {
      setSubmitting(false);
    }
  }, [batchName, contentType, file, importProductId, loadData, preview]);

  const updateInventory = useCallback(async (body: Record<string, string>) => {
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await readJson(response, "库存状态更新失败");
      setNotice("操作成功");
      await loadData();
      if (selectedProduct) await openProductItems(selectedProduct);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "库存状态更新失败");
    } finally {
      setSubmitting(false);
    }
  }, [loadData, openProductItems, selectedProduct]);

  const importableProducts = useMemo(() => products.filter((product) => product.status !== "inactive"), [products]);

  return (
    <AdminPageShell
      title="数字库存"
      description="批量导入卡密、兑换码、账号密码和纯文本交付内容，库存内容默认脱敏展示。"
      actions={(
        <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          刷新
        </Button>
      )}
    >
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CardHeader className="shrink-0 border-b px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">库存数据</CardTitle>
                <p className="mt-1 text-xs text-slate-500">支持库存汇总、批次筛选和脱敏明细查看。</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant={view === "summary" ? "default" : "outline"} size="sm" onClick={() => { setView("summary"); setStatus("all"); }}>
                  库存汇总
                </Button>
                <Button variant={view === "batches" ? "default" : "outline"} size="sm" onClick={() => { setView("batches"); setStatus("all"); }}>
                  批次管理
                </Button>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_180px_96px]">
              <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); setBatchPage(1); }} placeholder="搜索商品、批次号或文件名" />
              <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); setBatchPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(view === "summary" ? Object.entries(STATUS_LABELS) : Object.entries(BATCH_STATUS_LABELS)).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => { setSearch(""); setStatus("all"); setPage(1); setBatchPage(1); }}>重置</Button>
            </div>
          </CardHeader>

          {notice ? (
            <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{notice}</div>
          ) : null}

          {error ? (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <AdminErrorState title="库存数据加载失败" description={error} onRetry={() => void loadData()} />
            </div>
          ) : loading ? (
            <div className="p-4"><AdminTableSkeleton rows={8} /></div>
          ) : view === "summary" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-auto">
                <Table className="min-w-[980px]">
                  <TableHeader className="sticky top-0 z-10 bg-slate-50">
                    <TableRow>
                      <TableHead>商品</TableHead>
                      <TableHead className="text-center">总数</TableHead>
                      <TableHead className="text-center">可用</TableHead>
                      <TableHead className="text-center">预留</TableHead>
                      <TableHead className="text-center">已交付</TableHead>
                      <TableHead className="text-center">禁用</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryRows.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="h-72"><AdminEmptyState title="暂无库存" description="导入数字库存后会显示在这里。" /></TableCell></TableRow>
                    ) : summaryRows.map((row) => (
                      <TableRow key={row.product_id}>
                        <TableCell>
                          <div className="font-medium text-slate-900">{row.product_name}</div>
                          <div className="mt-1 text-xs text-slate-500">{row.product_slug}</div>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{row.total_count}</TableCell>
                        <TableCell className="text-center tabular-nums text-emerald-600">{row.available_count}</TableCell>
                        <TableCell className="text-center tabular-nums">{row.reserved_count}</TableCell>
                        <TableCell className="text-center tabular-nums">{row.delivered_count}</TableCell>
                        <TableCell className="text-center tabular-nums text-red-500">{row.disabled_count}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => void openProductItems(row)}><Eye className="mr-1 h-3.5 w-3.5" />明细</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pager total={summaryTotal} page={page} pageSize={pageSize} onPageChange={setPage} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-auto">
                <Table className="min-w-[1180px]">
                  <TableHeader className="sticky top-0 z-10 bg-slate-50">
                    <TableRow>
                      <TableHead>批次</TableHead>
                      <TableHead>商品</TableHead>
                      <TableHead>内容类型</TableHead>
                      <TableHead className="text-center">可用/总数</TableHead>
                      <TableHead>导入状态</TableHead>
                      <TableHead>文件</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchRows.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="h-72"><AdminEmptyState title="暂无库存批次" description="通过右侧批量导入创建第一个库存批次。" /></TableCell></TableRow>
                    ) : batchRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{row.batch_name || row.batch_no}</div>
                          <div className="mt-1 text-xs text-slate-500">{row.batch_no}</div>
                        </TableCell>
                        <TableCell>{row.product_name}</TableCell>
                        <TableCell>{CONTENT_TYPE_LABELS[row.content_type] ?? row.content_type}</TableCell>
                        <TableCell className="text-center tabular-nums"><span className="text-emerald-600">{row.available_count}</span> / {row.total_count}</TableCell>
                        <TableCell><BatchStatusBadge status={row.import_status} /></TableCell>
                        <TableCell className="max-w-[180px] truncate" title={row.source_filename ?? ""}>{row.source_filename ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-slate-500">{formatDate(row.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => void openBatchItems(row)}>详情</Button>
                            {row.import_status !== "disabled" ? (
                              <Button size="sm" variant="outline" className="text-red-600" disabled={submitting} onClick={() => {
                                if (window.confirm("确定禁用该批次的可用库存吗？已交付库存不会恢复或删除。")) void updateInventory({ action: "disable_batch", batch_id: row.id });
                              }}>禁用</Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pager total={batchTotal} page={batchPage} pageSize={pageSize} onPageChange={setBatchPage} />
            </div>
          )}
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-base"><Upload className="h-4 w-4" />批量导入</CardTitle>
            <p className="text-xs text-slate-500">支持 TXT / CSV，先预览脱敏内容，再确认写入。</p>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            <div className="space-y-1.5">
              <Label>商品</Label>
              <Select value={importProductId} onValueChange={(value) => { setImportProductId(value); setPreview(null); setImportResult(null); }}>
                <SelectTrigger><SelectValue placeholder="选择商品" /></SelectTrigger>
                <SelectContent>
                  {importableProducts.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>内容类型</Label>
              <Select value={contentType} onValueChange={(value) => { setContentType(value); setPreview(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTENT_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>批次名称</Label>
              <Input value={batchName} onChange={(event) => setBatchName(event.target.value)} placeholder="可选，默认使用批次号" />
            </div>
            <div className="space-y-1.5">
              <Label>导入文件</Label>
              <Input type="file" accept=".txt,.csv" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setImportResult(null); }} />
              <p className="text-xs text-slate-500">最多 5MB / 5000 行。不会在浏览器显示完整库存内容。</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={submitting || !file || !importProductId} onClick={() => void previewImport()}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                解析预览
              </Button>
              <Button disabled={submitting || !preview || preview.estimatedImportRows <= 0} onClick={() => void confirmImport()}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}
                确认导入
              </Button>
            </div>
            {preview ? <ImportPreviewCard preview={preview} /> : null}
            {importResult ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                批次 {importResult.batchNo ?? "—"} 导入完成：成功 {importResult.importedRows} 条，跳过 {importResult.skippedRows} 条，失败 {importResult.failedRows} 条。
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="flex w-full flex-col sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>{selectedBatch ? "批次详情" : "库存明细"}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-auto py-4">
            {selectedProduct ? (
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-950">{selectedBatch?.batch_name || selectedProduct.product_name}</div>
                    <div className="mt-1 text-sm text-slate-500">{selectedBatch?.batch_no || selectedProduct.product_slug}</div>
                  </div>
                  {selectedBatch ? <BatchStatusBadge status={selectedBatch.import_status} /> : null}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <Stat label="总数量" value={selectedBatch?.total_count ?? selectedProduct.total_count} />
                  <Stat label="可用" value={selectedBatch?.available_count ?? selectedProduct.available_count} />
                  <Stat label="已预留" value={selectedBatch?.reserved_count ?? selectedProduct.reserved_count} />
                  <Stat label="已交付" value={selectedBatch?.delivered_count ?? selectedProduct.delivered_count} />
                </div>
                {selectedBatch ? (
                  <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                    <div>内容类型：{CONTENT_TYPE_LABELS[selectedBatch.content_type] ?? selectedBatch.content_type}</div>
                    <div>导入文件：{selectedBatch.source_filename ?? "—"}</div>
                    <div>创建人：{selectedBatch.created_by_email ?? "—"}</div>
                    <div>创建时间：{formatDate(selectedBatch.created_at)}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <Select value={itemStatus} onValueChange={setItemStatus}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedProduct ? <Button variant="outline" onClick={() => void openProductItems(selectedProduct)}>重新加载</Button> : null}
            </div>
            <div className="rounded-xl border">
              {itemsLoading ? <div className="p-4"><AdminTableSkeleton rows={8} /></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>脱敏内容</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>批次</TableHead>
                      <TableHead>关联订单</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemRows.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="h-48 text-center text-sm text-slate-500">暂无库存明细</TableCell></TableRow>
                    ) : itemRows.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.masked_content}</TableCell>
                        <TableCell><InventoryStatusBadge status={item.status} /></TableCell>
                        <TableCell>{item.batch_no ?? "—"}</TableCell>
                        <TableCell>{item.order_no ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {item.status === "available" ? (
                              <Button size="sm" variant="outline" className="text-red-600" disabled={submitting} onClick={() => {
                                if (window.confirm("确定禁用这条未交付库存吗？")) void updateInventory({ action: "disable_item", inventory_id: item.id });
                              }}><Ban className="mr-1 h-3.5 w-3.5" />禁用</Button>
                            ) : null}
                            {item.status === "disabled" ? (
                              <Button size="sm" variant="outline" disabled={submitting} onClick={() => {
                                if (window.confirm("确定恢复这条未交付且未预留库存吗？")) void updateInventory({ action: "restore_item", inventory_id: item.id });
                              }}><RotateCcw className="mr-1 h-3.5 w-3.5" />恢复</Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <div className="text-xs text-slate-500">共 {itemTotal} 条明细。完整库存内容默认不展示，已交付库存不可恢复为可用。</div>
          </div>
        </SheetContent>
      </Sheet>
    </AdminPageShell>
  );
}

function Pager({ total, page, pageSize, onPageChange }: { total: number; page: number; pageSize: number; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex shrink-0 items-center justify-between border-t px-4 py-3 text-sm text-slate-500">
      <span>共 {total} 条，第 {page} / {totalPages} 页</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</Button>
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>下一页</Button>
      </div>
    </div>
  );
}

function ImportPreviewCard({ preview }: { preview: ImportPreview }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium text-slate-900"><AlertCircle className="h-4 w-4 text-orange-500" />导入预览</div>
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
        <span>文件：{preview.fileName}</span>
        <span>总行数：{preview.totalRows}</span>
        <span>有效：{preview.validRows}</span>
        <span>空行：{preview.emptyRows}</span>
        <span>文件重复：{preview.fileDuplicateRows}</span>
        <span>库内重复：{preview.databaseDuplicateRows}</span>
        <span>格式错误：{preview.invalidRows}</span>
        <span>预计导入：{preview.estimatedImportRows}</span>
      </div>
      <div className="mt-3 max-h-44 overflow-auto rounded-lg border bg-white">
        {preview.previewRows.length === 0 ? <div className="p-3 text-xs text-slate-500">没有可预览内容</div> : preview.previewRows.map((row) => (
          <div key={`${row.lineNumber}-${row.maskedContent}`} className="border-b px-3 py-2 text-xs last:border-b-0">
            第 {row.lineNumber} 行：<span className="font-mono">{row.maskedContent}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-950">{value}</div>
    </div>
  );
}

function InventoryStatusBadge({ status }: { status: string }) {
  const tone = status === "available" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : status === "delivered" ? "bg-blue-50 text-blue-700 border-blue-200"
    : status === "reserved" ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-red-50 text-red-700 border-red-200";
  return <Badge variant="outline" className={cn("whitespace-nowrap", tone)}>{STATUS_LABELS[status] ?? status}</Badge>;
}

function BatchStatusBadge({ status }: { status: string }) {
  const tone = status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : status === "processing" ? "bg-blue-50 text-blue-700 border-blue-200"
    : status === "partial_failed" ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-red-50 text-red-700 border-red-200";
  return <Badge variant="outline" className={cn("whitespace-nowrap", tone)}>{BATCH_STATUS_LABELS[status] ?? status}</Badge>;
}
