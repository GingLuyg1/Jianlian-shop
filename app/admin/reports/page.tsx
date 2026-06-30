"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const PRESETS = [
  { key: "today", label: "今日" },
  { key: "yesterday", label: "昨日" },
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
  { key: "thisMonth", label: "本月" },
  { key: "lastMonth", label: "上月" },
] as const;

const EXPORT_TYPES = [
  ["orders", "订单"],
  ["payments", "支付"],
  ["recharges", "充值"],
  ["refunds", "退款"],
  ["users", "用户摘要"],
  ["product-sales", "商品销售"],
  ["sku-sales", "SKU 销售"],
  ["inventory", "库存摘要"],
  ["deliveries", "交付记录摘要"],
  ["balance", "余额流水"],
] as const;

type Report = Record<string, any>;

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function presetRange(key: string) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (key === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (key === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (key === "30d") {
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (key === "thisMonth") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (key === "lastMonth") {
    start.setMonth(start.getMonth() - 1, 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }
  return { start: toDateInput(start), end: toDateInput(end) };
}

function money(value: unknown) {
  return `¥${Number(value ?? 0).toFixed(2)}`;
}

function percent(value: unknown) {
  if (value === null || value === undefined) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function dateTime(value: unknown) {
  if (!value) return "—";
  return new Date(String(value)).toLocaleString("zh-CN", { hour12: false });
}

export default function AdminReportsPage() {
  const initialRange = useMemo(() => presetRange("7d"), []);
  const [range, setRange] = useState(initialRange);
  const [preset, setPreset] = useState("7d");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    if (!range.start || !range.end || new Date(range.start) > new Date(range.end)) {
      setError("请选择有效的时间范围。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/reports?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`, { cache: "no-store" });
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
      const response = await fetch(`/api/admin/reports/export?type=${encodeURIComponent(type)}&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`);
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
      toast.success("CSV 已开始下载");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    } finally {
      setExporting(null);
    }
  }

  const summary = report?.summary ?? {};
  const errors = report?.errors ?? {};

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">经营报表</h1>
          <p className="text-sm text-slate-500">统一统计订单、支付、充值、退款、商品、用户、库存和交付数据。</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={loadReport} disabled={loading}>
          <RefreshCcw className="h-4 w-4" />
          重新加载
        </Button>
      </div>

      <Card className="mb-4 shrink-0">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((item) => (
              <Button key={item.key} size="sm" variant={preset === item.key ? "default" : "outline"} onClick={() => applyPreset(item.key)}>
                {item.label}
              </Button>
            ))}
          </div>
          <label className="text-sm text-slate-600">
            开始日期
            <Input className="mt-1 w-40" type="date" value={range.start} onChange={(event) => { setPreset("custom"); setRange((prev) => ({ ...prev, start: event.target.value })); }} />
          </label>
          <label className="text-sm text-slate-600">
            结束日期
            <Input className="mt-1 w-40" type="date" value={range.end} onChange={(event) => { setPreset("custom"); setRange((prev) => ({ ...prev, end: event.target.value })); }} />
          </label>
          {report ? <Badge variant="outline">统计范围：{dateTime(report.range?.start)} - {dateTime(report.range?.end)}</Badge> : null}
        </CardContent>
      </Card>

      {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {Object.keys(errors).length ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          部分模块读取失败：{Object.entries(errors).map(([key, value]) => `${key}：${value}`).join("；")}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Metric title="销售金额" value={money(summary.salesAmount)} />
          <Metric title="实付金额" value={money(summary.paidAmount)} />
          <Metric title="订单数量" value={summary.totalOrders ?? 0} />
          <Metric title="支付成功率" value={percent(summary.paymentSuccessRate)} />
          <Metric title="退款金额" value={money(summary.refundAmount)} />
          <Metric title="充值金额" value={money(summary.rechargeAmount)} />
          <Metric title="新增用户" value={summary.newUsers ?? 0} />
          <Metric title="付费用户" value={summary.payingUsers ?? 0} />
          <Metric title="自动交付成功率" value={percent(summary.autoDeliverySuccessRate)} />
          <Metric title="访问量" value="未接入" />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-2">
          <DataCard title="订单与支付分析">
            <KeyValue label="已支付订单" value={report?.summary?.paidOrders ?? 0} />
            <KeyValue label="已取消订单" value={report?.summary?.cancelledOrders ?? 0} />
            <KeyValue label="已关闭订单" value={report?.summary?.closedOrders ?? 0} />
            <KeyValue label="待支付转化" value={percent(report?.orderPayment?.pendingPaymentConversion)} />
            <MiniList title="支付渠道分布" rows={(report?.orderPayment?.paymentChannelDistribution ?? []).map((row: any) => [`${row.channel} (${row.count})`, money(row.amount)])} />
            <MiniList title="订单金额区间" rows={Object.entries(report?.orderPayment?.amountBuckets ?? {}).map(([key, value]) => [key, String(value)])} />
          </DataCard>

          <DataCard title="商品和 SKU 分析">
            <MiniList title="销量排行" rows={(report?.products?.salesRanking ?? []).slice(0, 6).map((row: any) => [row.name, `${row.quantity} 件 / ${money(row.amount)}`])} />
            <MiniList title="低库存商品" rows={(report?.products?.lowStockProducts ?? []).slice(0, 6).map((row: any) => [row.name, `库存 ${row.stock ?? 0}`])} empty="暂无低库存商品" />
            <MiniList title="SKU 销量排行" rows={(report?.products?.skuSalesRanking ?? []).slice(0, 6).map((row: any) => [row.name, `${row.quantity} 件 / ${money(row.amount)}`])} />
          </DataCard>

          <DataCard title="用户经营分析">
            <KeyValue label="总用户" value={report?.users?.totalUsers ?? 0} />
            <KeyValue label="未付费用户" value={report?.users?.unpaidUsers ?? 0} />
            <KeyValue label="复购用户" value={report?.users?.repeatUsers ?? 0} />
            <KeyValue label="复购率" value={percent(report?.users?.repeatRate)} />
            <KeyValue label="账户受限用户" value={report?.users?.restrictedUsers ?? 0} />
            <KeyValue label="高风险用户" value={report?.users?.highRiskUsers ?? 0} />
          </DataCard>

          <DataCard title="库存与交付分析">
            <KeyValue label="库存总量" value={report?.inventory?.total ?? 0} />
            <KeyValue label="可用库存" value={report?.inventory?.available ?? 0} />
            <KeyValue label="已预留库存" value={report?.inventory?.reserved ?? 0} />
            <KeyValue label="已交付库存" value={report?.inventory?.delivered ?? 0} />
            <KeyValue label="已禁用库存" value={report?.inventory?.disabled ?? 0} />
            <KeyValue label="平均交付时长" value={report?.inventory?.averageDeliveryMinutes == null ? "—" : `${Number(report.inventory.averageDeliveryMinutes).toFixed(1)} 分钟`} />
          </DataCard>

          <DataCard title="充值、余额和退款">
            <KeyValue label="充值申请金额" value={money(report?.finance?.rechargeRequested)} />
            <KeyValue label="充值成功金额" value={money(report?.finance?.rechargeSucceeded)} />
            <KeyValue label="充值失败金额" value={money(report?.finance?.rechargeFailed)} />
            <KeyValue label="余额入账金额" value={money(report?.finance?.balanceCredit)} />
            <KeyValue label="余额消费金额" value={money(report?.finance?.balanceDebit)} />
            <KeyValue label="待处理退款金额" value={money(report?.finance?.pendingRefund)} />
            <KeyValue label="成功退款金额" value={money(report?.finance?.succeededRefund)} />
            <KeyValue label="管理员余额调整" value={money(report?.finance?.adminAdjustment)} />
          </DataCard>

          <DataCard title="安全 CSV 导出">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {EXPORT_TYPES.map(([type, label]) => (
                <Button key={type} variant="outline" size="sm" className="justify-start gap-2" onClick={() => exportCsv(type)} disabled={Boolean(exporting)}>
                  <Download className="h-4 w-4" />
                  {exporting === type ? "导出中..." : label}
                </Button>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">导出使用 UTF-8 BOM、中文字段标题，并过滤公式注入风险。不包含密码、Token、密钥、完整回调或完整库存内容。</p>
          </DataCard>
        </section>
      </div>

      {loading ? <div className="fixed inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">报表加载中...</div> : null}
    </div>
  );
}

function Metric({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-slate-500">{title}</div>
        <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      </CardContent>
    </Card>
  );
}

function DataCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="min-h-[260px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
}

function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function MiniList({ title, rows, empty = "暂无数据" }: { title: string; rows: Array<[React.ReactNode, React.ReactNode]>; empty?: string }) {
  return (
    <div>
      <div className="mb-2 font-medium text-slate-700">{title}</div>
      {rows.length ? (
        <div className="space-y-1">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
              <span className="truncate text-slate-600">{row[0]}</span>
              <span className="shrink-0 font-medium text-slate-900">{row[1]}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-slate-400">{empty}</div>
      )}
    </div>
  );
}
