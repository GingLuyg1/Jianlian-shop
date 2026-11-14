"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AdminDateRangeFilter,
  getPresetDateRange,
  type DashboardDateFilterValue,
} from "@/components/admin/dashboard/AdminDateRangeFilter";
import { cn } from "@/lib/utils";

export type ProductDetailModalData = {
  id: string;
  slug?: string | null;
  name: string;
  price: number;
  stock: number;
  status: string;
};

export type RawOrderItemForDetail = {
  order_id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  quantity?: number | null;
  line_total?: number | null;
  created_at?: string | null;
};

export type RawVisitForDetail = {
  visit_date: string;
  visitor_key?: string | null;
  page_path?: string | null;
};

type DetailMetricKey = "amount" | "orders" | "clicks" | "conversionRate";

const DETAIL_SERIES: ReadonlyArray<{
  key: DetailMetricKey;
  label: string;
  color: string;
  unit: "money" | "count" | "percent";
  yAxisId: "money" | "count" | "percent";
}> = [
  { key: "amount", label: "销售额", color: "#2563eb", unit: "money", yAxisId: "money" },
  { key: "orders", label: "订单量", color: "#6366f1", unit: "count", yAxisId: "count" },
  { key: "clicks", label: "商品页点击", color: "#10b981", unit: "count", yAxisId: "count" },
  { key: "conversionRate", label: "点击转化率", color: "#f59e0b", unit: "percent", yAxisId: "percent" },
];

function toBizDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

function toBizHour(date: Date) {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hour12: false,
  }).format(date);
  return Number(hourStr) % 24;
}

export function AdminProductDetailDialog({
  product,
  open,
  onOpenChange,
  orderItems,
  visits,
  initialDateFilter,
}: {
  product: ProductDetailModalData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderItems: RawOrderItemForDetail[];
  visits: RawVisitForDetail[];
  initialDateFilter: DashboardDateFilterValue;
}) {
  const [dateFilter, setDateFilter] = useState<DashboardDateFilterValue>(
    () => initialDateFilter ?? getPresetDateRange("7d")
  );
  const [selectedMetrics, setSelectedMetrics] = useState<DetailMetricKey[]>(["amount", "orders"]);

  const fromKey = toBizDateKey(dateFilter.from);
  const toKey = toBizDateKey(dateFilter.to);
  const sameDay = fromKey === toKey;

  const { chartData, totalOrders, totalAmount, totalClicks, conversionRate } = useMemo(() => {
    if (!product) {
      return { chartData: [], totalOrders: 0, totalAmount: 0, totalClicks: 0, conversionRate: 0 };
    }
    const matchesProductItem = (item: RawOrderItemForDetail) =>
      item.product_id === product.id || (!item.product_id && item.product_name === product.name);
    const matchesProductVisit = (visit: RawVisitForDetail) => {
      const path = visit.page_path ?? "";
      return Boolean(
        (product.slug && path.includes(product.slug)) ||
          (product.id && path.includes(product.id))
      );
    };

    const filteredItems = orderItems.filter((item) => {
      if (!matchesProductItem(item) || !item.created_at) return false;
      const key = toBizDateKey(new Date(item.created_at));
      return key >= fromKey && key <= toKey;
    });
    const filteredVisits = visits.filter((visit) => {
      if (!matchesProductVisit(visit) || !visit.visit_date) return false;
      const key = visit.visit_date.length === 10 ? visit.visit_date : toBizDateKey(new Date(visit.visit_date));
      return key >= fromKey && key <= toKey;
    });

    const sumOrders = filteredItems.reduce((s, item) => s + Number(item.quantity ?? 0), 0);
    const sumAmount = filteredItems.reduce((s, item) => s + Number(item.line_total ?? 0), 0);
    const sumClicks = filteredVisits.length;
    const conv = sumClicks > 0 ? Number(((sumOrders / sumClicks) * 100).toFixed(1)) : 0;

    if (sameDay) {
      const hours = Array.from({ length: 24 }, (_, h) => ({
        date: `${fromKey} ${String(h).padStart(2, "0")}:00`,
        label: `${String(h).padStart(2, "0")}:00`,
        amount: 0,
        orders: 0,
        clicks: 0,
        conversionRate: 0,
      }));
      for (const item of filteredItems) {
        if (!item.created_at) continue;
        const h = toBizHour(new Date(item.created_at));
        hours[h].orders += Number(item.quantity ?? 0);
        hours[h].amount += Number(item.line_total ?? 0);
      }
      for (const visit of filteredVisits) {
        const dt = new Date(visit.visit_date);
        const h = Number.isNaN(dt.getTime()) ? 0 : toBizHour(dt);
        hours[h].clicks += 1;
      }
      for (const bucket of hours) {
        bucket.conversionRate =
          bucket.clicks > 0 ? Number(((bucket.orders / bucket.clicks) * 100).toFixed(1)) : 0;
      }
      return {
        chartData: hours,
        totalOrders: sumOrders,
        totalAmount: sumAmount,
        totalClicks: sumClicks,
        conversionRate: conv,
      };
    }

    const days = new Map<string, { date: string; label: string; amount: number; orders: number; clicks: number; conversionRate: number }>();
    const start = new Date(dateFilter.from);
    const end = new Date(dateFilter.to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = toBizDateKey(d);
      days.set(k, { date: k, label: k.slice(5), amount: 0, orders: 0, clicks: 0, conversionRate: 0 });
    }
    for (const item of filteredItems) {
      if (!item.created_at) continue;
      const k = toBizDateKey(new Date(item.created_at));
      const b = days.get(k);
      if (b) {
        b.orders += Number(item.quantity ?? 0);
        b.amount += Number(item.line_total ?? 0);
      }
    }
    for (const visit of filteredVisits) {
      const k = visit.visit_date.length === 10 ? visit.visit_date : toBizDateKey(new Date(visit.visit_date));
      const b = days.get(k);
      if (b) b.clicks += 1;
    }
    Array.from(days.values()).forEach((b) => {
      b.conversionRate = b.clicks > 0 ? Number(((b.orders / b.clicks) * 100).toFixed(1)) : 0;
    });
    return {
      chartData: Array.from(days.values()),
      totalOrders: sumOrders,
      totalAmount: sumAmount,
      totalClicks: sumClicks,
      conversionRate: conv,
    };
  }, [dateFilter.from, dateFilter.to, fromKey, orderItems, product, sameDay, toKey, visits]);

  const toggleMetric = (key: DetailMetricKey) => {
    setSelectedMetrics((current) => {
      if (current.includes(key)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== key);
      }
      return [...current, key];
    });
  };

  const activeSeries = DETAIL_SERIES.filter((item) => selectedMetrics.includes(item.key));
  const hasMoney = activeSeries.some((item) => item.yAxisId === "money");
  const hasCount = activeSeries.some((item) => item.yAxisId === "count");
  const hasPercent = activeSeries.some((item) => item.yAxisId === "percent");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{product?.name ?? "商品详情"}</DialogTitle>
          <DialogDescription>
            单品销售趋势、点击转化与库存快照（可独立切换时间范围）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500">
              当前售价：<strong className="text-slate-900">¥{Number(product?.price ?? 0).toFixed(2)}</strong> · 当前库存：
              <strong className="text-slate-900">{product?.stock ?? 0}</strong>
            </div>
            <AdminDateRangeFilter value={dateFilter} onChange={setDateFilter} />
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
              <div className="text-[11px] text-slate-500">时段订单量</div>
              <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{totalOrders} 单</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
              <div className="text-[11px] text-slate-500">时段销售额</div>
              <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">¥{totalAmount.toFixed(2)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
              <div className="text-[11px] text-slate-500">商品页点击</div>
              <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{totalClicks} 次</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
              <div className="text-[11px] text-slate-500">点击转化率</div>
              <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                {totalClicks > 0 ? `${conversionRate}%` : "—"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {DETAIL_SERIES.map((item) => {
              const active = selectedMetrics.includes(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleMetric(item.key)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors",
                    active
                      ? "border-slate-300 bg-white text-slate-900 shadow-sm"
                      : "border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200/70"
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? item.color : "#cbd5e1" }} />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="h-[260px] w-full rounded-lg border border-slate-200 bg-white p-2 pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} minTickGap={20} />
                {hasMoney ? (
                  <YAxis yAxisId="money" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => `¥${v}`} />
                ) : null}
                {hasCount ? (
                  <YAxis yAxisId="count" orientation={hasMoney ? "right" : "left"} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                ) : null}
                {hasPercent ? (
                  <YAxis yAxisId="percent" orientation={hasMoney || hasCount ? "right" : "left"} hide={hasMoney && hasCount} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => `${v}%`} />
                ) : null}
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const s = DETAIL_SERIES.find((item) => item.key === name);
                    if (!s) return [String(value), name];
                    if (s.unit === "money") return [`¥${Number(value).toFixed(2)}`, s.label];
                    if (s.unit === "percent") return [`${Number(value).toFixed(1)}%`, s.label];
                    return [String(Math.trunc(Number(value))), s.label];
                  }}
                />
                {activeSeries.map((item) => (
                  <Area
                    key={item.key}
                    type="monotone"
                    dataKey={item.key}
                    name={item.key}
                    yAxisId={item.yAxisId}
                    stroke={item.color}
                    strokeWidth={2}
                    fillOpacity={0.12}
                    fill={item.color}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
