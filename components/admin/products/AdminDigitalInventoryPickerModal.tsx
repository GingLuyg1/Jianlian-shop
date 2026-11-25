"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Database, Loader2, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type DigitalInventorySummaryRow = {
  product_id: string;
  product_name: string;
  product_slug: string;
  total_count: number;
  available_count: number;
  reserved_count: number;
  delivered_count: number;
};

export default function AdminDigitalInventoryPickerModal({
  open,
  currentProductId,
  currentInventoryProductId,
  onClose,
  onSelect,
}: {
  open: boolean;
  currentProductId?: string | null;
  currentInventoryProductId?: string | null;
  onClose: () => void;
  onSelect: (row: DigitalInventorySummaryRow) => void;
}) {
  const [rows, setRows] = useState<DigitalInventorySummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadSummary = useCallback(async (keyword = "") => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        mode: "summary",
        page: "1",
        pageSize: "100",
      });
      if (keyword.trim()) params.set("search", keyword.trim());
      const res = await fetch(`/api/admin/inventory?${params.toString()}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as {
        data?: Array<Record<string, unknown>>;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "数字库存读取失败");
      const normalized: DigitalInventorySummaryRow[] = (body.data ?? []).map((item) => ({
        product_id: String(item.product_id ?? ""),
        product_name: String(item.product_name ?? "未命名库存商品"),
        product_slug: String(item.product_slug ?? ""),
        total_count: Number(item.total_count ?? 0),
        available_count: Number(item.available_count ?? 0),
        reserved_count: Number(item.reserved_count ?? 0),
        delivered_count: Number(item.delivered_count ?? 0),
      }));
      setRows(normalized.filter((r) => Boolean(r.product_id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "数字库存读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void loadSummary(search);
    }, search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [open, search, loadSummary]);

  if (!open) return null;

  const filtered = (search.trim()
    ? rows.filter((row) => {
        const q = search.trim().toLowerCase();
        return (
          row.product_name.toLowerCase().includes(q) ||
          row.product_slug.toLowerCase().includes(q)
        );
      })
    : rows
  ).slice().sort((a, b) => {
    const aCurrent = currentProductId && a.product_id === currentProductId ? 1 : 0;
    const bCurrent = currentProductId && b.product_id === currentProductId ? 1 : 0;
    if (aCurrent !== bCurrent) return bCurrent - aCurrent;
    return b.available_count - a.available_count;
  });

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Database className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">绑定后台数字库存</h3>
              <p className="text-[11px] text-slate-500">
                仅适用于「自动发货-数字库存」规格，为防止发错货，仅允许绑定当前商品所属的数字库存池；点击绑定后需保存商品/规格生效
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索数字库存商品名称或标识..."
              className="h-8 bg-white pl-8 text-xs"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={loading}
            onClick={() => void loadSummary(search)}
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            刷新
          </Button>
        </div>

        <div className="min-h-[260px] flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在读取后台数字库存列表...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-xs text-red-700">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
              暂无匹配的数字库存池，请先在「后台 → 数字库存」导入卡密后再绑定。
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              <div className="grid grid-cols-[minmax(0,1fr)_56px_56px_56px_56px_76px] items-center bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
                <div>库存所属商品</div>
                <div className="text-center">总数</div>
                <div className="text-center">可用</div>
                <div className="text-center">预留</div>
                <div className="text-center">已发</div>
                <div className="text-center">操作</div>
              </div>
              {filtered.map((row) => {
                const isBound = currentInventoryProductId === row.product_id;
                const isDifferentProduct = Boolean(currentProductId && row.product_id !== currentProductId);
                return (
                  <div
                    key={row.product_id}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_56px_56px_56px_56px_76px] items-center px-3 py-2.5 text-xs transition-colors hover:bg-slate-50/80",
                      isBound && "bg-emerald-50/50",
                      isDifferentProduct && "opacity-60"
                    )}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-slate-900" title={row.product_name}>
                          {row.product_name}
                        </span>
                        {currentProductId && row.product_id === currentProductId ? (
                          <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            当前商品
                          </span>
                        ) : isDifferentProduct ? (
                          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                            其他商品池
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate font-mono text-[10px] text-slate-400" title={row.product_slug}>
                        {row.product_slug}
                      </div>
                    </div>
                    <div className="text-center tabular-nums text-slate-700">{row.total_count}</div>
                    <div
                      className={cn(
                        "text-center font-semibold tabular-nums",
                        row.available_count > 0 ? "text-emerald-600" : "text-slate-400"
                      )}
                    >
                      {row.available_count}
                    </div>
                    <div className="text-center tabular-nums text-amber-600">{row.reserved_count}</div>
                    <div className="text-center tabular-nums text-slate-500">{row.delivered_count}</div>
                    <div className="flex justify-center">
                      <Button
                        type="button"
                        size="sm"
                        disabled={isDifferentProduct}
                        title={isDifferentProduct ? "禁止跨商品绑定其他商品的数字库存池" : undefined}
                        variant={isBound ? "outline" : "default"}
                        className={cn(
                          "h-7 px-2.5 text-[11px]",
                          isBound && "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        )}
                        onClick={() => onSelect(row)}
                      >
                        {isBound ? (
                          <>
                            <Check className="mr-1 h-3 w-3" />
                            已选
                          </>
                        ) : isDifferentProduct ? (
                          "不可绑"
                        ) : (
                          "绑定"
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
