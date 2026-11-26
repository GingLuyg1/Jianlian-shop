"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  Package,
  RefreshCcw,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import AdminPageShell from "@/components/admin/AdminPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRESETS = [
  { key: "today", label: "今日" },
  { key: "yesterday", label: "昨日" },
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
  { key: "thisMonth", label: "本月" },
  { key: "lastMonth", label: "上月" },
] as const;

const EXPORT_GROUPS = [
  {
    title: "交易与资金",
    items: [
      ["orders", "订单明细", "含金额、状态、下单时间"],
      ["payments", "支付记录", "含渠道、实付、网关状态"],
      ["recharges", "充值记录", "含 USDT / CNY 与审核结果"],
      ["refunds", "退款记录", "含申请、审批与到账金额"],
      ["balance", "余额流水", "含入账、消费与后台调账"],
    ] as const,
  },
  {
    title: "商品、库存与用户",
    items: [
      ["product-sales", "商品销售", "按商品汇总销量与成交额"],
      ["sku-sales", "规格销售", "按 SKU 汇总销量与成交额"],
      ["inventory", "库存摘要", "可用、预留与售出库存统计"],
      ["deliveries", "交付摘要", "自动与人工发货状态统计"],
      ["users", "用户摘要", "注册、付费与复购数据摘要"],
    ] as const,
  },
] as const;

const CHANNEL_LABELS: Record<string, string> = {
  alipay: "支付宝",
  wechat: "微信支付",
  usdt_bep20: "USDT-BEP20",
  usdt_trc20: "USDT-TRC20",
  balance: "余额支付",
  binance_pay: "币安转账",
  unknown: "其他渠道",
};

type Report = Record<string, any>;

const SHANGHAI_TZ = "Asia/Shanghai";

function toDateInput(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftShanghaiYmd(ymd: string, deltaDays: number) {
  const d = new Date(`${ymd}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return toDateInput(d);
}

function presetRange(key: string) {
  const todayKey = toDateInput(new Date());
  if (key === "today") return { start: todayKey, end: todayKey };
  if (key === "yesterday") {
    const yesterdayKey = shiftShanghaiYmd(todayKey, -1);
    return { start: yesterdayKey, end: yesterdayKey };
  }
  if (key === "30d") return { start: shiftShanghaiYmd(todayKey, -29), end: todayKey };
  if (key === "thisMonth") return { start: `${todayKey.slice(0, 7)}-01`, end: todayKey };
  if (key === "lastMonth") {
    const [yearStr, monthStr] = todayKey.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const firstOfThisMonth = new Date(Date.UTC(year, month - 1, 1, 4, 0, 0));
    const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 24 * 3600 * 1000);
    const endKey = toDateInput(lastOfPrevMonth);
    return { start: `${endKey.slice(0, 7)}-01`, end: endKey };
  }
  return { start: shiftShanghaiYmd(todayKey, -6), end: todayKey };
}

function money(value: unknown) {
  return `¥${Number(value ?? 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percent(value: unknown) {
  if (value === null || value === undefined) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function channelName(code: unknown) {
  const raw = String(code ?? "").trim();
  return CHANNEL_LABELS[raw] ?? (raw || "未知渠道");
}

export default function AdminReportsWorkspace({ embedded = false }: { embedded?: boolean }) {
  const initialRange = useMemo(() => presetRange("7d"), []);
  const [range, setRange] = useState(initialRange);
  const [preset, setPreset] = useState("7d");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [rankTab, setRankTab] = useState<"product" | "sku" | "lowStock">("product");

  const loadReport = useCallback(async () => {
    if (!range.start || !range.end || new Date(range.start) > new Date(range.end)) {
      setError("开始日期不能晚于结束日期，请重新选择时间范围。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/reports?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`,
        { cache: "no-store" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "经营报表加载失败");
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "经营报表加载失败");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  function applyPreset(key: string) {
    setPreset(key);
    setRange(presetRange(key));
  }

  async function exportCsv(type: string) {
    setExporting(type);
    try {
      const response = await fetch(
        `/api/admin/reports/export?type=${encodeURIComponent(type)}&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "导出失败");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? `jianlian-${type}.csv`;
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("CSV 报表已开始下载");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    } finally {
      setExporting(null);
    }
  }

  const summary = report?.summary ?? {};
  const errors = report?.errors ?? {};
  const channelDist = (report?.orderPayment?.paymentChannelDistribution ?? []) as Array<{
    channel: string;
    count: number;
    amount: number;
  }>;
  const maxChannelAmount = Math.max(...channelDist.map((item) => Number(item.amount ?? 0)), 1);
  const amountBuckets = Object.entries(report?.orderPayment?.amountBuckets ?? {}) as Array<[string, number]>;
  const maxBucketCount = Math.max(...amountBuckets.map(([, count]) => Number(count ?? 0)), 1);

  const productSales = (report?.products?.salesRanking ?? []).slice(0, 6) as Array<{
    name: string;
    quantity: number;
    amount: number;
  }>;
  const skuSales = (report?.products?.skuSalesRanking ?? []).slice(0, 6) as Array<{
    name: string;
    quantity: number;
    amount: number;
  }>;
  const lowStockProducts = (report?.products?.lowStockProducts ?? []).slice(0, 6) as Array<{
    name: string;
    stock: number;
  }>;

  const invTotal = Number(report?.inventory?.total ?? 0);
  const invAvailable = Number(report?.inventory?.available ?? 0);
  const invReserved = Number(report?.inventory?.reserved ?? 0);
  const invDelivered = Number(report?.inventory?.delivered ?? 0);
  const invDisabled = Number(report?.inventory?.disabled ?? 0);
  const invBase = Math.max(invTotal, invAvailable + invReserved + invDelivered + invDisabled, 1);

  const content = (
    <div className={embedded ? "flex min-h-0 flex-1 flex-col gap-4" : "flex h-full min-h-0 flex-col gap-4"}>
      {/* 顶部时间筛选栏 */}
      <div className="shrink-0 rounded-xl border border-slate-200/90 bg-white p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-100/80 p-1">
            {PRESETS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => applyPreset(item.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  preset === item.key
                    ? "bg-white text-slate-950 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <Input
                aria-label="开始日期"
                className="h-7 w-[124px] border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
                type="date"
                value={range.start}
                onChange={(event) => {
                  setPreset("custom");
                  setRange((prev) => ({ ...prev, start: event.target.value }));
                }}
              />
              <span className="text-xs text-slate-400">至</span>
              <Input
                aria-label="结束日期"
                className="h-7 w-[124px] border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
                type="date"
                value={range.end}
                onChange={(event) => {
                  setPreset("custom");
                  setRange((prev) => ({ ...prev, end: event.target.value }));
                }}
              />
            </div>

            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={loadReport} disabled={loading}>
              <RefreshCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              {loading ? "加载中..." : "刷新"}
            </Button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
          <span>统计口径：北京时间（UTC+8），覆盖全站交易、复购转化、库存交付与 10 类脱敏 CSV 导出。</span>
          <Badge variant="outline" className="font-mono text-[11px] font-normal text-slate-600">
            {range.start} ~ {range.end}
          </Badge>
        </div>
      </div>

      {error ? (
        <div className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {Object.keys(errors).length ? (
        <div className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          部分统计模块读取异常：{Object.entries(errors).map(([key, value]) => `${key}：${value}`).join("；")}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading && !report ? (
          <ReportSkeleton />
        ) : (
          <div className={cn("space-y-4 pb-4 transition-opacity", loading && "opacity-60")}>
            {/* 核心经营 KPI 指标卡 */}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <KpiCard
                title="销售总额"
                value={money(summary.salesAmount)}
                sub={`共 ${summary.totalOrders ?? 0} 笔订单`}
                icon={<TrendingUp className="h-4 w-4" />}
                accent="emerald"
              />
              <KpiCard
                title="实付金额"
                value={money(summary.paidAmount)}
                sub={`已支付 ${summary.paidOrders ?? 0} 笔`}
                icon={<CreditCard className="h-4 w-4" />}
                accent="blue"
              />
              <KpiCard
                title="支付成功率"
                value={percent(summary.paymentSuccessRate)}
                sub={`待支付转化 ${percent(report?.orderPayment?.pendingPaymentConversion)}`}
                icon={<CheckCircle2 className="h-4 w-4" />}
                accent="violet"
              />
              <KpiCard
                title="账户充值金额"
                value={money(summary.rechargeAmount)}
                sub={`充值成功 ${money(report?.finance?.rechargeSucceeded)}`}
                icon={<Wallet className="h-4 w-4" />}
                accent="sky"
              />
              <KpiCard
                title="退款金额"
                value={money(summary.refundAmount)}
                sub={`待审退款 ${money(report?.finance?.pendingRefund)}`}
                icon={<RotateCcw className="h-4 w-4" />}
                accent={Number(summary.refundAmount ?? 0) > 0 ? "rose" : "slate"}
              />
            </section>

            {/* 增长与履约次级指标条 */}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <CompactStat
                icon={<ShoppingBag className="h-4 w-4 text-slate-500" />}
                label="订单总数"
                value={`${summary.totalOrders ?? 0} 单`}
              />
              <CompactStat
                icon={<UserPlus className="h-4 w-4 text-sky-600" />}
                label="新增注册用户"
                value={`${summary.newUsers ?? 0} 人`}
              />
              <CompactStat
                icon={<Users className="h-4 w-4 text-emerald-600" />}
                label="区间付费用户"
                value={`${summary.payingUsers ?? 0} 人`}
              />
              <CompactStat
                icon={<Package className="h-4 w-4 text-indigo-600" />}
                label="自动交付成功率"
                value={percent(summary.autoDeliverySuccessRate)}
              />
              <CompactStat
                icon={<Eye className="h-4 w-4 text-slate-500" />}
                label="访问量 (PV / UV)"
                value={
                  summary.pageViews === null || summary.pageViews === undefined
                    ? "暂未接入统计"
                    : `${summary.pageViews} / ${summary.visitors ?? 0}`
                }
              />
            </section>

            {/* 6 大分析模块 */}
            <section className="grid gap-4 xl:grid-cols-2">
              {/* 1. 订单与支付分析 */}
              <ReportPanel
                icon={<BarChart3 className="h-4 w-4 text-blue-600" />}
                title="订单与支付分析"
                subtitle="按订单状态、支付渠道及金额分布统计"
              >
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <MiniTile label="已支付" value={report?.summary?.paidOrders ?? 0} tone="emerald" />
                  <MiniTile label="已取消" value={report?.summary?.cancelledOrders ?? 0} tone="slate" />
                  <MiniTile label="已关闭" value={report?.summary?.closedOrders ?? 0} tone="slate" />
                  <MiniTile label="待支付转化" value={percent(report?.orderPayment?.pendingPaymentConversion)} tone="blue" />
                </div>

                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-slate-700">支付渠道分布</div>
                  {channelDist.length ? (
                    <div className="space-y-2">
                      {channelDist.map((row) => {
                        const ratio = Math.min(100, Math.max(4, Math.round((Number(row.amount ?? 0) / maxChannelAmount) * 100)));
                        return (
                          <div key={row.channel} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-700">
                                {channelName(row.channel)}
                                <span className="ml-1.5 text-slate-400">{row.count} 笔</span>
                              </span>
                              <span className="font-semibold tabular-nums text-slate-900">{money(row.amount)}</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-blue-500/85 transition-all" style={{ width: `${ratio}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyBlock text="当前区间暂无成交支付渠道记录" />
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">订单金额区间</div>
                  {amountBuckets.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {amountBuckets.map(([bucket, count]) => {
                        const pct = Math.min(100, Math.max(count > 0 ? 8 : 0, Math.round((Number(count ?? 0) / maxBucketCount) * 100)));
                        return (
                          <div key={bucket} className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-600">{bucket}</span>
                              <span className="font-semibold tabular-nums text-slate-900">{count} 单</span>
                            </div>
                            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
                              <div className="h-full rounded-full bg-indigo-500/80" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyBlock text="暂无金额区间数据" />
                  )}
                </div>
              </ReportPanel>

              {/* 2. 商品与规格分析（带切换标签） */}
              <ReportPanel
                icon={<Package className="h-4 w-4 text-emerald-600" />}
                title="商品与规格分析"
                subtitle="畅销商品、规格排行与低库存预警"
                action={
                  <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
                    {[
                      ["product", "商品排行"],
                      ["sku", "规格排行"],
                      ["lowStock", `低库存 (${lowStockProducts.length})`],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setRankTab(key as "product" | "sku" | "lowStock")}
                        className={cn(
                          "rounded-md px-2.5 py-1 font-medium transition-colors",
                          rankTab === key ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                }
              >
                {rankTab === "product" ? (
                  <RankedSalesList items={productSales} emptyText="当前时间段暂无商品销量" />
                ) : rankTab === "sku" ? (
                  <RankedSalesList items={skuSales} emptyText="当前时间段暂无规格销量" />
                ) : lowStockProducts.length ? (
                  <div className="space-y-2">
                    {lowStockProducts.map((item, idx) => (
                      <div
                        key={`${item.name}-${idx}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-amber-200/70 bg-amber-50/40 px-3 py-2.5 text-xs"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                          <span className="truncate font-medium text-slate-800">{item.name}</span>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 tabular-nums",
                            Number(item.stock ?? 0) === 0
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-amber-200 bg-amber-50 text-amber-800"
                          )}
                        >
                          剩余 {item.stock ?? 0} 件
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyBlock text="当前所有在售商品库存充足，暂无低库存预警" />
                )}
              </ReportPanel>

              {/* 3. 用户经营分析 */}
              <ReportPanel
                icon={<Users className="h-4 w-4 text-indigo-600" />}
                title="用户经营分析"
                subtitle="注册规模、付费复购及风控状态分布"
              >
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <MiniTile label="平台总用户" value={report?.users?.totalUsers ?? 0} tone="slate" />
                  <MiniTile label="未付费用户" value={report?.users?.unpaidUsers ?? 0} tone="slate" />
                  <MiniTile label="复购用户" value={report?.users?.repeatUsers ?? 0} tone="emerald" />
                  <MiniTile label="整体复购率" value={percent(report?.users?.repeatRate)} tone="blue" />
                  <MiniTile
                    label="账户受限用户"
                    value={report?.users?.restrictedUsers ?? 0}
                    tone={Number(report?.users?.restrictedUsers ?? 0) > 0 ? "amber" : "slate"}
                  />
                  <MiniTile
                    label="高风险用户"
                    value={report?.users?.highRiskUsers ?? 0}
                    tone={Number(report?.users?.highRiskUsers ?? 0) > 0 ? "rose" : "slate"}
                  />
                </div>
              </ReportPanel>

              {/* 4. 库存与交付分析 */}
              <ReportPanel
                icon={<Boxes className="h-4 w-4 text-amber-600" />}
                title="库存与交付分析"
                subtitle="数字卡密池状态占比与平均交付速度"
                action={
                  <Badge variant="outline" className="text-xs font-medium text-slate-700">
                    平均交付：
                    {report?.inventory?.averageDeliveryMinutes == null
                      ? "暂无数据"
                      : `${Number(report.inventory.averageDeliveryMinutes).toFixed(1)} 分钟`}
                  </Badge>
                }
              >
                {/* 库存结构比例条 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>库存结构占比（总量 {invTotal}）</span>
                    <span className="tabular-nums">可用率 {invTotal > 0 ? `${((invAvailable / invTotal) * 100).toFixed(1)}%` : "—"}</span>
                  </div>
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="bg-emerald-500" style={{ width: `${(invAvailable / invBase) * 100}%` }} title={`可用 ${invAvailable}`} />
                    <div className="bg-amber-400" style={{ width: `${(invReserved / invBase) * 100}%` }} title={`已预留 ${invReserved}`} />
                    <div className="bg-blue-500" style={{ width: `${(invDelivered / invBase) * 100}%` }} title={`已交付 ${invDelivered}`} />
                    <div className="bg-slate-400" style={{ width: `${(invDisabled / invBase) * 100}%` }} title={`已禁用 ${invDisabled}`} />
                  </div>
                  <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />可用 {invAvailable}</span>
                    <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-400" />已预留 {invReserved}</span>
                    <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-blue-500" />已交付 {invDelivered}</span>
                    <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-slate-400" />已禁用 {invDisabled}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <MiniTile label="库存总量" value={invTotal} tone="slate" />
                  <MiniTile label="可用库存" value={invAvailable} tone="emerald" />
                  <MiniTile label="已预留库存" value={invReserved} tone="amber" />
                  <MiniTile label="已交付库存" value={invDelivered} tone="blue" />
                  <MiniTile label="已禁用库存" value={invDisabled} tone="slate" />
                  <MiniTile
                    label="自动交付率"
                    value={percent(summary.autoDeliverySuccessRate)}
                    tone="emerald"
                  />
                </div>
              </ReportPanel>

              {/* 5. 充值、余额与退款明细 */}
              <ReportPanel
                icon={<Wallet className="h-4 w-4 text-sky-600" />}
                title="充值、余额与退款"
                subtitle="统计期内资金流入、钱包变动及售后退款明细"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <FinanceRow label="充值申请总额" value={money(report?.finance?.rechargeRequested)} />
                  <FinanceRow label="充值成功总额" value={money(report?.finance?.rechargeSucceeded)} tone="emerald" />
                  <FinanceRow label="充值失败总额" value={money(report?.finance?.rechargeFailed)} tone="slate" />
                  <FinanceRow label="余额入账总额" value={money(report?.finance?.balanceCredit)} tone="blue" />
                  <FinanceRow label="余额消费总额" value={money(report?.finance?.balanceDebit)} />
                  <FinanceRow label="管理员余额调整" value={money(report?.finance?.adminAdjustment)} />
                  <FinanceRow label="待处理退款金额" value={money(report?.finance?.pendingRefund)} tone="amber" />
                  <FinanceRow label="成功退款金额" value={money(report?.finance?.succeededRefund)} tone="rose" />
                </div>
              </ReportPanel>

              {/* 6. 安全 CSV 导出中心 */}
              <ReportPanel
                icon={<FileSpreadsheet className="h-4 w-4 text-violet-600" />}
                title="安全 CSV 导出中心"
                subtitle={`按当前筛选区间（${range.start} ~ ${range.end}）一键下载`}
              >
                <div className="space-y-3">
                  {EXPORT_GROUPS.map((group) => (
                    <div key={group.title}>
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {group.title}
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {group.items.map(([type, label, hint]) => {
                          const isExporting = exporting === type;
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => void exportCsv(type)}
                              disabled={Boolean(exporting)}
                              className="group flex flex-col items-start rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-left transition-all hover:border-blue-300 hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <div className="flex w-full items-center justify-between gap-1.5">
                                <span className="text-xs font-semibold text-slate-800 group-hover:text-blue-700">
                                  {isExporting ? "导出中..." : label}
                                </span>
                                {isExporting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                                ) : (
                                  <Download className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-600" />
                                )}
                              </div>
                              <span className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">{hint}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
                  导出文件采用 UTF-8 BOM 与中文字段表头，已过滤 CSV 公式注入风险；不包含密码、密钥、完整回调体或敏感卡密原文。
                </p>
              </ReportPanel>
            </section>
          </div>
        )}
      </div>
    </div>
  );

  if (embedded) return content;

  return (
    <AdminPageShell
      variant="v2"
      title="经营报表"
      description="按日期查看全站交易、复购、库存交付统计与 10 类安全 CSV 导出。"
      actions={
        <Button variant="outline" size="sm" className="gap-2" onClick={loadReport} disabled={loading}>
          <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
          重新加载
        </Button>
      }
    >
      {content}
    </AdminPageShell>
  );
}

const ACCENT_MAP = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200/70",
  blue: "bg-blue-50 text-blue-700 border-blue-200/70",
  violet: "bg-violet-50 text-violet-700 border-violet-200/70",
  sky: "bg-sky-50 text-sky-700 border-sky-200/70",
  rose: "bg-rose-50 text-rose-700 border-rose-200/70",
  slate: "bg-slate-100 text-slate-600 border-slate-200/80",
} as const;

function KpiCard({
  title,
  value,
  sub,
  icon,
  accent,
}: {
  title: string;
  value: ReactNode;
  sub: string;
  icon: ReactNode;
  accent: keyof typeof ACCENT_MAP;
}) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{title}</span>
        <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-lg border", ACCENT_MAP[accent])}>
          {icon}
        </span>
      </div>
      <div className="mt-2.5 text-2xl font-bold tracking-tight tabular-nums text-slate-950">{value}</div>
      <div className="mt-1 text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

function CompactStat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-sm font-semibold tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

function ReportPanel({
  icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-slate-200/90 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 border border-slate-200/70">
            {icon}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <p className="text-[11px] text-slate-500">{subtitle}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="flex-1 space-y-4 p-4 text-sm">{children}</div>
    </section>
  );
}

const TILE_TONE = {
  slate: "bg-slate-50/80 border-slate-200/70 text-slate-900",
  emerald: "bg-emerald-50/50 border-emerald-200/70 text-emerald-800",
  blue: "bg-blue-50/50 border-blue-200/70 text-blue-800",
  amber: "bg-amber-50/60 border-amber-200/70 text-amber-800",
  rose: "bg-rose-50/60 border-rose-200/70 text-rose-800",
} as const;

function MiniTile({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  tone?: keyof typeof TILE_TONE;
}) {
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", TILE_TONE[tone])}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}

function RankedSalesList({
  items,
  emptyText,
}: {
  items: Array<{ name: string; quantity: number; amount: number }>;
  emptyText: string;
}) {
  if (!items.length) return <EmptyBlock text={emptyText} />;
  const maxAmount = Math.max(...items.map((item) => Number(item.amount ?? 0)), 1);
  return (
    <div className="space-y-2.5">
      {items.map((row, idx) => {
        const pct = Math.min(100, Math.max(6, Math.round((Number(row.amount ?? 0) / maxAmount) * 100)));
        const rankStyle =
          idx === 0
            ? "bg-amber-100 text-amber-800 border-amber-200"
            : idx === 1
              ? "bg-slate-200 text-slate-700 border-slate-300"
              : idx === 2
                ? "bg-orange-100 text-orange-800 border-orange-200"
                : "bg-slate-100 text-slate-500 border-slate-200";
        return (
          <div key={`${row.name}-${idx}`} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold", rankStyle)}>
                  {idx + 1}
                </span>
                <span className="truncate font-medium text-slate-800" title={row.name}>
                  {row.name}
                </span>
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <span className="font-semibold text-slate-900">{money(row.amount)}</span>
                <span className="ml-1.5 text-slate-400">· {row.quantity} 件</span>
              </div>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
              <div className="h-full rounded-full bg-emerald-500/80" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FinanceRow({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  tone?: "slate" | "emerald" | "blue" | "amber" | "rose";
}) {
  const valueClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "blue"
        ? "text-blue-700"
        : tone === "amber"
          ? "text-amber-700"
          : tone === "rose"
            ? "text-rose-700"
            : "text-slate-900";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-xs">
      <span className="text-slate-600">{label}</span>
      <span className={cn("font-semibold tabular-nums", valueClass)}>{value}</span>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-4 py-8 text-center text-xs text-slate-400">
      {text}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200/80 bg-white p-4">
            <div className="h-3 w-16 rounded bg-slate-200" />
            <div className="mt-4 h-6 w-28 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-xl border border-slate-200/80 bg-white p-4">
            <div className="h-4 w-32 rounded bg-slate-200" />
            <div className="mt-4 space-y-2.5">
              <div className="h-10 rounded-lg bg-slate-100" />
              <div className="h-10 rounded-lg bg-slate-100" />
              <div className="h-10 rounded-lg bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
