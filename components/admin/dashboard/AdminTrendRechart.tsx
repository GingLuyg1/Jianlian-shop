"use client";

import { useEffect, useRef, useState } from "react";
import { init, use } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, AriaComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import AdminEmptyState from "@/components/admin/AdminEmptyState";
import { cn } from "@/lib/utils";

// Apache ECharts (Apache-2.0): https://github.com/apache/echarts
use([LineChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer]);

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


export function AdminTrendRechart({ points, loading }: { points: DashboardTrendPoint[]; loading: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<TrendMetricKey[]>(["payAmount", "orderCount"]);
  useEffect(() => {
    if (loading || !host.current || points.length === 0) return;
    const chart = init(host.current, undefined, { renderer: "canvas" });
    chart.setOption({
      animation: false,
      aria: { enabled: true },
      tooltip: { trigger: "axis", renderMode: "richText" },
      grid: { left: 56, right: 48, top: 20, bottom: 32, containLabel: true },
      xAxis: { type: "category", data: points.map(p => p.label), boundaryGap: false },
      yAxis: [
        { type: "value", name: "金额", position: "left" },
        { type: "value", name: "数量 / %", position: "right", minInterval: 1 },
      ],
      series: SERIES.filter(item => selected.includes(item.key)).map(item => ({
        name: item.label, type: "line", smooth: false, connectNulls: false,
        showSymbol: points.length === 1, symbolSize: 7,
        yAxisIndex: item.unit === "money" ? 0 : 1,
        itemStyle: { color: item.color }, lineStyle: { width: 2 },
        data: points.map(point => point[item.key] ?? null),
      })),
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(host.current);
    return () => { observer.disconnect(); chart.dispose(); };
  }, [points, selected, loading]);
  if (loading) return <div className="h-[260px] animate-pulse rounded-lg bg-slate-100" />;
  if (!points.length) return <AdminEmptyState title="暂无趋势数据" description="有真实记录后显示趋势。" />;
  return <div className="min-w-0">
    <div className="mb-3 flex flex-wrap gap-1.5" aria-label="经营趋势指标">
      {SERIES.map(item => <button key={item.key} type="button" aria-pressed={selected.includes(item.key)}
        onClick={() => setSelected(current => current.includes(item.key) ? (current.length === 1 ? current : current.filter(key => key !== item.key)) : [...current, item.key])}
        className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs", selected.includes(item.key) ? "border-slate-300 bg-white text-slate-900" : "border-transparent bg-slate-100 text-slate-500")}>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}
      </button>)}
    </div>
    <div ref={host} data-testid="dashboard-echarts" role="img" aria-label="经营趋势曲线图" className="w-full min-w-0 rounded-lg border border-slate-200 bg-white" style={{ height: 250 }} />
  </div>;
}
