"use client";

import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import { cn } from "@/lib/utils";

export type DashboardTrendPoint = {
  date: string;
  label: string;
  payAmount: number | null;
  rechargeAmount: number | null;
  orderCount: number | null;
  views: number | null;
  visitors?: number | null;
  newUsers?: number | null;
  conversionRate?: number | null;
  distributionOrders?: number | null;
  distributionAmount?: number | null;
};

export type TrendMetricKey =
  | "payAmount"
  | "rechargeAmount"
  | "orderCount"
  | "views"
  | "visitors"
  | "newUsers"
  | "conversionRate"
  | "distributionOrders"
  | "distributionAmount";

const SERIES: ReadonlyArray<{
  key: TrendMetricKey;
  label: string;
  color: string;
  unit: "money" | "count" | "percent";
  yAxisId: "money" | "count" | "percent";
}> = [
  { key: "payAmount", label: "支付金额", color: "#2563eb", unit: "money", yAxisId: "money" },
  { key: "rechargeAmount", label: "充值金额", color: "#0ea5e9", unit: "money", yAxisId: "money" },
  { key: "orderCount", label: "订单数量", color: "#6366f1", unit: "count", yAxisId: "count" },
  { key: "visitors", label: "访客数量", color: "#0d9488", unit: "count", yAxisId: "count" },
  { key: "views", label: "访问量", color: "#10b981", unit: "count", yAxisId: "count" },
  { key: "newUsers", label: "新增用户", color: "#8b5cf6", unit: "count", yAxisId: "count" },
  { key: "conversionRate", label: "访客转化率", color: "#f59e0b", unit: "percent", yAxisId: "percent" },
  { key: "distributionOrders", label: "分销订单", color: "#ec4899", unit: "count", yAxisId: "count" },
  { key: "distributionAmount", label: "分销金额", color: "#f43f5e", unit: "money", yAxisId: "money" },
];

export function AdminTrendRechart({
  points,
  loading,
}: {
  points: DashboardTrendPoint[];
  loading: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(640);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = () => { const width = node.clientWidth - 16; if (width > 0) setChartWidth(width); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, points.length]);
  const [selectedMetrics, setSelectedMetrics] = useState<TrendMetricKey[]>(["payAmount", "orderCount"]);

  if (loading) {
    return (
      <div className="h-[250px] animate-pulse rounded-lg bg-[var(--admin-v2-surface-muted)]" />
    );
  }

  if (points.length === 0) {
    return (
      <AdminEmptyState
        title="暂无趋势数据"
        description="有真实订单、充值或访问记录后会显示趋势。"
      />
    );
  }

  const toggleMetric = (key: TrendMetricKey) => {
    setSelectedMetrics((current) => {
      if (current.includes(key)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== key);
      }
      return [...current, key];
    });
  };

  const activeSeries = SERIES.filter((item) => selectedMetrics.includes(item.key));
  const hasMoney = activeSeries.some((item) => item.yAxisId === "money");
  const hasCount = activeSeries.some((item) => item.yAxisId === "count");
  const hasPercent = activeSeries.some((item) => item.yAxisId === "percent");

  const chartData = points.map((point) => ({
    label: point.label,
    date: point.date,
    payAmount: point.payAmount ?? 0,
    rechargeAmount: point.rechargeAmount ?? 0,
    orderCount: point.orderCount ?? 0,
    visitors: point.visitors ?? 0,
    views: point.views ?? 0,
    newUsers: point.newUsers ?? 0,
    conversionRate: point.conversionRate ?? 0,
    distributionOrders: point.distributionOrders ?? 0,
    distributionAmount: point.distributionAmount ?? 0,
  }));

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" aria-label="经营趋势指标">
          {SERIES.map((item) => {
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
                    : "border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200/70 hover:text-slate-700"
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: active ? item.color : "#cbd5e1" }}
                  aria-hidden="true"
                />
                {item.label}
              </button>
            );
          })}
        </div>
        <span className="text-[11px] text-slate-400">支持多选对比，再次点击取消</span>
      </div>

      <div ref={containerRef} className="h-[240px] min-w-0 w-full overflow-hidden rounded-lg border border-slate-200 bg-white p-2 pt-3">
          <AreaChart width={chartWidth} height={220} data={chartData} margin={{ top: 8, right: hasCount || hasPercent ? 8 : 12, left: 0, bottom: 0 }}>
            <defs>
              {SERIES.map((item) => (
                <linearGradient key={item.key} id={`adminTrendFill-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={item.color} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={item.color} stopOpacity={0.01} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              minTickGap={20}
            />
            {hasMoney ? (
              <YAxis
                yAxisId="money"
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={(val: number) => `¥${val}`}
              />
            ) : null}
            {hasCount ? (
              <YAxis
                yAxisId="count"
                orientation={hasMoney ? "right" : "left"}
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                width={38}
                allowDecimals={false}
              />
            ) : null}
            {hasPercent ? (
              <YAxis
                yAxisId="percent"
                orientation={hasMoney || hasCount ? "right" : "left"}
                hide={hasMoney && hasCount}
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(val: number) => `${val}%`}
              />
            ) : null}
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                fontSize: "12px",
                boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
              }}
              formatter={(value: number, name: string) => {
                const s = SERIES.find((item) => item.key === name);
                if (!s) return [String(value), name];
                if (s.unit === "money") return [`¥${Number(value).toFixed(2)}`, s.label];
                if (s.unit === "percent") return [`${Number(value).toFixed(1)}%`, s.label];
                return [`${Math.trunc(Number(value)).toLocaleString("zh-CN")}`, s.label];
              }}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.date ? String(payload[0].payload.date) : ""
              }
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
                isAnimationActive={false}
                dot={chartData.length === 1 ? { r: 4 } : false}
                fill={`url(#adminTrendFill-${item.key})`}
                activeDot={{ r: 4, strokeWidth: 0, fill: item.color }}
              />
            ))}
          </AreaChart>
      </div>
    </div>
  );
}
