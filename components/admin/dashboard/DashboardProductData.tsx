"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowDownUp, ArrowRight, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";

import { DashboardDateRangeFilter, dashboardPreset, type DashboardDateRange } from "./DashboardDateRangeFilter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type ProductRow = { id: string; name: string; paidOrders: number; units: number; amountCny: null };
type DailyRow = { date: string; paidOrders: number; units: number };
type ProductResult = { ok: true; from: string; to: string; page: number; pageSize: number; total: number; sort: string; rows: ProductRow[]; daily: DailyRow[] };

function validateProductResult(body: ProductResult, range: DashboardDateRange, page: number, pageSize: number, sort: string, productId: string) {
  if (body.ok !== true || body.from !== range.from || body.to !== range.to || body.page !== page || body.pageSize !== pageSize || body.sort !== sort ||
    !Number.isSafeInteger(body.total) || body.total < 0 || !Array.isArray(body.rows) ||
    body.rows.length !== Math.max(0, Math.min(pageSize, body.total - (page - 1) * pageSize)) ||
    new Set(body.rows.map((row) => row.id)).size !== body.rows.length || !Array.isArray(body.daily) ||
    body.rows.some((row) => !row.id || typeof row.name !== "string" || !Number.isSafeInteger(row.paidOrders) || row.paidOrders < 0 || !Number.isSafeInteger(row.units) || row.units < 0 || row.amountCny !== null)) {
    throw new Error("商品数据响应不完整，已暂停展示。");
  }
  if (productId) {
    const expectedDays = Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1;
    if (body.daily.length !== expectedDays || body.rows.length !== 1 || body.rows[0].id !== productId ||
      body.daily.some((day, index) => day.date !== new Date(Date.parse(`${range.from}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10) ||
        !Number.isSafeInteger(day.paidOrders) || day.paidOrders < 0 || !Number.isSafeInteger(day.units) || day.units < 0) ||
      body.daily.reduce((sum, day) => sum + day.paidOrders, 0) !== body.rows[0].paidOrders ||
      body.daily.reduce((sum, day) => sum + day.units, 0) !== body.rows[0].units) {
      throw new Error("商品每日趋势与区间汇总不一致，已暂停展示。");
    }
  } else if (body.daily.length) {
    throw new Error("商品列表返回了意外的每日明细，已暂停展示。");
  }
  return body;
}

function useProductRows(range: DashboardDateRange, page: number, search: string, sort: string, productId = "", enabled = true, pageSize = 10) {
  const [data, setData] = useState<ProductResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ from: range.from, to: range.to, page: String(page), pageSize: String(pageSize), search, sort });
    if (productId) params.set("productId", productId);
    setData(null);
    setError("");
    setLoading(true);
    fetch(`/api/admin/dashboard/products?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(typeof body.error === "string" ? body.error : "商品数据读取失败。");
        }
        return validateProductResult(body as ProductResult, range, page, pageSize, sort, productId);
      })
      .then((next) => { if (!controller.signal.aborted) setData(next); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "商品数据读取失败。"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [range.from, range.to, page, pageSize, search, sort, productId, enabled, retry]);
  return { data, loading, error, retry: () => setRetry((value) => value + 1) };
}

const unavailable = "暂未接入";

export default function DashboardProductData() {
  const [listOpen, setListOpen] = useState(false);
  const [trendOpen, setTrendOpen] = useState(false);
  const [selected, setSelected] = useState<ProductRow | null>(null);
  const [listRange, setListRange] = useState(() => dashboardPreset("30"));
  const [trendRange, setTrendRange] = useState(() => dashboardPreset("30"));
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("paidOrders_desc");
  const [homeSort, setHomeSort] = useState("paidOrders_desc");
  const listScroll = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const trendFromList = useRef(false);
  const home = useProductRows(dashboardPreset("30"), 1, "", homeSort);
  const list = useProductRows(listRange, page, search, sort, "", listOpen, 15);
  const trend = useProductRows(trendRange, 1, "", "recent", selected?.id ?? "", trendOpen && Boolean(selected));

  const openTrend = (row: ProductRow) => {
    trendFromList.current = listOpen;
    savedScroll.current = listScroll.current?.scrollTop ?? 0;
    setSelected(row);
    setTrendRange(listOpen ? listRange : dashboardPreset("30"));
    setListOpen(false);
    window.setTimeout(() => setTrendOpen(true), 220);
  };
  const backToList = () => {
    setTrendOpen(false);
    if (!trendFromList.current) return;
    window.setTimeout(() => {
      setListOpen(true);
      window.setTimeout(() => {
        if (listScroll.current) listScroll.current.scrollTop = savedScroll.current;
        const button = Array.from(listScroll.current?.querySelectorAll<HTMLButtonElement>("[data-trend-product-id]") ?? [])
          .find((item) => item.dataset.trendProductId === selected?.id);
        button?.focus({ preventScroll: true });
      }, 0);
    }, 220);
  };
  const changeListSort = (value: string) => { setPage(1); setSort(value); if (listScroll.current) listScroll.current.scrollTop = 0; };

  return <>
    <Card className="dashboard-panel dashboard-product-data-card min-w-0 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-3">
        <CardTitle className="text-base">商品数据</CardTitle>
        <Button type="button" variant="outline" size="sm" className="dashboard-glass-action" onClick={() => setListOpen(true)}>查看全部 <ArrowRight className="ml-1 h-4 w-4" /></Button>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <p className="mb-3 text-xs text-[var(--admin-v2-text-muted)]">最近 30 个上海自然日 · 已付订单按实际支付日；成交额待分摊核对 · 默认按成交订单从高到低</p>
        {home.loading ? <p role="status" className="py-6 text-sm">正在读取商品数据…</p> : home.error ? <ErrorMessage message={home.error} retry={home.retry} /> : !home.data?.rows.length ? <p className="py-8 text-center text-sm text-slate-600">暂无商品记录</p> :
          <div className="dashboard-product-table-scroll rounded-xl border" role="region" aria-label="商品数据首页表格，可横向滚动" tabIndex={0}>
            <ProductTable rows={home.data.rows.slice(0, 10)} sort={homeSort} onSort={setHomeSort} onTrend={openTrend} />
          </div>}
      </CardContent>
    </Card>

    <Dialog open={listOpen && !trendOpen} onOpenChange={setListOpen}>
      <DialogContent overlayClassName="dashboard-glass-overlay" className="dashboard-product-dialog flex h-[min(92vh,850px)] w-[min(98vw,1380px)] max-w-none flex-col gap-3 overflow-hidden p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 pr-10">
          <div><DialogTitle>商品数据</DialogTitle><DialogDescription className="mt-1">已付订单数与销量为真实区间数据；未接入指标不以零代替。</DialogDescription></div>
          <DashboardDateRangeFilter label="商品数据" value={listRange} onChange={(value) => { setPage(1); setListRange(value); }} />
        </div>
        <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(draftSearch.trim()); }}>
          <label className="dashboard-glass-field flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-3"><Search className="h-4 w-4 text-slate-500" /><input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="搜索商品名称" aria-label="搜索商品名称" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
          <Button type="submit" variant="outline" className="dashboard-glass-action">搜索</Button>
          <select aria-label="商品排序" value={sort} onChange={(event) => changeListSort(event.target.value)} className="dashboard-glass-field min-h-11 rounded-xl px-3 text-sm"><option value="paidOrders_desc">成交订单：高到低</option><option value="paidOrders_asc">成交订单：低到高</option><option value="units_desc">销量：高到低</option><option value="units_asc">销量：低到高</option><option value="recent">最近更新</option><option value="name">商品名称</option></select>
        </form>
        <div ref={listScroll} className="dashboard-product-dialog-table min-h-0 flex-1 overflow-auto rounded-xl" role="region" aria-label="商品数据列表，可滚动" tabIndex={0}>
          {list.loading ? <p role="status" className="p-5 text-sm">正在读取商品数据…</p> : list.error ? <ErrorMessage message={list.error} retry={list.retry} /> : !list.data?.rows.length ? <p className="p-8 text-center text-sm">没有符合条件的商品</p> : <>
            <ProductTable rows={list.data.rows} sort={sort} onSort={changeListSort} onTrend={openTrend} />
          </>}
        </div>
        <div className="flex items-center justify-between text-sm"><span>共 {list.data?.total ?? "—"} 件 · 每页 15 件 · 第 {page} 页</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" className="dashboard-glass-action" disabled={page <= 1 || list.loading} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" />上一页</Button><Button type="button" variant="outline" size="sm" className="dashboard-glass-action" disabled={list.loading || !list.data || page * 15 >= list.data.total} onClick={() => setPage(page + 1)}>下一页<ChevronRight className="h-4 w-4" /></Button></div></div>
      </DialogContent>
    </Dialog>

    <Dialog open={trendOpen} onOpenChange={(open) => { if (open) setTrendOpen(true); else backToList(); }}>
      <DialogContent overlayClassName="dashboard-glass-overlay" className="dashboard-product-dialog flex max-h-[92vh] w-[min(96vw,850px)] max-w-none flex-col overflow-auto p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 pr-10"><div className="min-w-0"><DialogTitle>商品趋势</DialogTitle><DialogDescription className="mt-1 break-words">{selected?.name ?? "—"} · 按实际支付日</DialogDescription></div><DashboardDateRangeFilter label="商品趋势" value={trendRange} onChange={setTrendRange} /></div>
        <p className="text-sm text-slate-600">成交订单与销量可查看真实每日数据；其他指标尚无已核验的商品级每日序列。</p>
        {trend.loading ? <p role="status" className="p-6">正在读取商品趋势…</p> : trend.error ? <ErrorMessage message={trend.error} retry={trend.retry} /> : <ProductTrendChart rows={trend.data?.daily ?? []} />}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" className="dashboard-glass-action" onClick={backToList}>返回商品数据</Button><Button type="button" variant="outline" className="dashboard-glass-action" onClick={() => setTrendOpen(false)}>关闭</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}

function ProductTable({ rows, sort, onSort, onTrend }: { rows: ProductRow[]; sort: string; onSort: (sort: string) => void; onTrend: (row: ProductRow) => void }) {
  const sortHeader = (label: string, field: "paidOrders" | "units" | null, unavailableReason?: string) => {
    if (!field) return <th key={label} scope="col" title={unavailableReason} className="whitespace-nowrap px-2 py-2 text-center font-medium">
      <span className="dashboard-product-sort-button inline-flex min-h-9 items-center justify-center gap-1 rounded-lg px-1 text-slate-500" aria-label={`${label}排序不可用：${unavailableReason}`}>
        {label}<ArrowDownUp aria-hidden="true" className="h-3.5 w-3.5 opacity-40" />
      </span>
    </th>;
    const active = sort.startsWith(`${field}_`);
    const ascending = sort === `${field}_asc`;
    return <th key={label} scope="col" aria-sort={active ? ascending ? "ascending" : "descending" : "none"} className="whitespace-nowrap px-2 py-2 text-center font-medium">
      <button type="button" className="dashboard-product-sort-button inline-flex min-h-9 items-center justify-center gap-1 rounded-lg px-1 text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" onClick={() => onSort(`${field}_${active && !ascending ? "asc" : "desc"}`)} aria-label={`${label}，${active ? ascending ? "当前从低到高，切换从高到低" : "当前从高到低，切换从低到高" : "按从高到低排序"}`}>
        {label}{active ? ascending ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" /> : <ArrowDownUp className="h-4 w-4 text-slate-500" />}
      </button>
    </th>;
  };
  return <table className="dashboard-product-table mx-auto w-full min-w-[1280px] table-fixed text-left text-sm">
    <colgroup><col className="w-[24%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[9%]" /><col className="w-[7%]" /><col className="w-[9%]" /><col className="w-[9%]" /></colgroup>
    <thead className="dashboard-product-table-head sticky top-0 z-10 text-slate-700"><tr>
      <th scope="col" className="px-3 py-3 font-medium">商品名称</th>
      {["曝光量", "点击量", "点击率", "下单率", "付款率"].map((label) => sortHeader(label, null, "真实商品级数据暂未接入"))}
      {sortHeader("成交订单", "paidOrders")}{sortHeader("销量", "units")}
      {sortHeader("成交金额", null, "商品级人民币金额分摊尚未核对")}
      <th scope="col" className="whitespace-nowrap px-2 py-3 text-center font-medium">查看趋势</th>
    </tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-200/75 hover:bg-white/65">
      <td className="px-3 py-2.5"><Link href={`/admin/products?search=${encodeURIComponent(row.name)}`} title={row.name} className="block max-w-full truncate font-medium text-slate-900 hover:underline">{row.name}</Link></td>
      {Array.from({ length: 5 }).map((_, index) => <td key={index} className="whitespace-nowrap px-2 py-2.5 text-center text-slate-600">{unavailable}</td>)}
      <td className="px-2 py-2.5 text-center font-semibold tabular-nums text-slate-900">{row.paidOrders.toLocaleString("zh-CN")}</td>
      <td className="px-2 py-2.5 text-center font-semibold tabular-nums text-slate-900">{row.units.toLocaleString("zh-CN")}</td>
      <td className="whitespace-nowrap px-2 py-2.5 text-center text-slate-600">待核对</td>
      <td className="px-2 py-1.5 text-center"><Button type="button" variant="outline" size="sm" className="dashboard-glass-action" data-trend-product-id={row.id} onClick={() => onTrend(row)}>查看趋势</Button></td>
    </tr>)}</tbody>
  </table>;
}

function ErrorMessage({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="p-5 text-sm text-red-700">{message}<Button type="button" variant="outline" size="sm" className="ml-3" onClick={retry}>重试</Button></div>;
}

function ProductTrendChart({ rows }: { rows: DailyRow[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [showOrders, setShowOrders] = useState(true);
  const [showUnits, setShowUnits] = useState(true);
  if (!rows.length) return <p className="p-8 text-center text-sm">暂无可核验的每日趋势</p>;
  const width = 720;
  const height = 230;
  const x = (index: number) => 24 + (rows.length === 1 ? 0.5 : index / (rows.length - 1)) * (width - 48);
  const line = (key: "paidOrders" | "units") => {
    const max = Math.max(1, ...rows.map((row) => row[key]));
    return rows.map((row, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${(height - 32 - row[key] / max * (height - 60)).toFixed(1)}`).join(" ");
  };
  const inspect = (clientX: number, left: number, clientWidth: number) => setActive(Math.min(rows.length - 1, Math.max(0, Math.round(((clientX - left) / Math.max(clientWidth, 1)) * (rows.length - 1)))));
  return <div className="min-w-0">
    <div className="mb-3 flex flex-wrap gap-2" aria-label="商品趋势指标">
      {[
        { label: "曝光量", reason: "商品曝光事件暂未接入" },
        { label: "点击量", reason: "商品点击事件暂未接入" },
        { label: "点击率", reason: "商品曝光与点击事件暂未接入" },
        { label: "下单率", reason: "商品曝光及下单归因暂未核验" },
        { label: "付款率", reason: "商品级转化归因暂未核验" },
      ].map((item) => <span key={item.label} className="dashboard-glass-action dashboard-glass-action-unavailable inline-flex min-h-9 items-center rounded-xl px-3 text-xs" title={item.reason} aria-label={`${item.label}暂未接入：${item.reason}`} aria-disabled="true">{item.label}</span>)}
      <Button type="button" variant="outline" size="sm" className="dashboard-glass-action" aria-pressed={showOrders} onClick={() => setShowOrders(!showOrders)}><span className="h-2 w-2 rounded-full bg-[#3569d6]" aria-hidden="true" />成交订单{showOrders ? " ✓" : ""}</Button>
      <Button type="button" variant="outline" size="sm" className="dashboard-glass-action" aria-pressed={showUnits} onClick={() => setShowUnits(!showUnits)}><span className="h-2 w-2 rounded-full bg-[#17a7b5]" aria-hidden="true" />销量{showUnits ? " ✓" : ""}</Button>
      <span className="dashboard-glass-action dashboard-glass-action-unavailable inline-flex min-h-9 items-center rounded-xl px-3 text-xs" title="商品级人民币金额分摊尚未核对" aria-label="成交金额待核对，暂不可查看趋势" aria-disabled="true">成交金额 · 待核对</span>
    </div>
    <div className="dashboard-product-chart relative rounded-xl p-2"><svg viewBox={`0 0 ${width} ${height}`} className="h-[230px] w-full touch-pan-y" role="img" tabIndex={0} aria-label="商品成交订单与件数每日趋势" onPointerDown={(event) => { const rect = event.currentTarget.getBoundingClientRect(); inspect(event.clientX, rect.left, rect.width); }} onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); inspect(event.clientX, rect.left, rect.width); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") setActive(null); }} onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); setActive((current) => event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.min(rows.length - 1, Math.max(0, (current ?? rows.length - 1) + (event.key === "ArrowLeft" ? -1 : 1)))); }}>
      {[0.25, 0.5, 0.75].map((fraction) => <path key={fraction} d={`M24 ${fraction * 190 + 8} H696`} stroke="#dbe4ef" strokeDasharray="4 5" />)}
      {showOrders ? <path d={line("paidOrders")} fill="none" stroke="#3569d6" strokeWidth="2.5" /> : null}
      {showUnits ? <path d={line("units")} fill="none" stroke="#17a7b5" strokeWidth="2.5" /> : null}
      {rows.length === 1 && showOrders ? <circle cx={x(0)} cy={height - 32 - rows[0].paidOrders / Math.max(1, rows[0].paidOrders) * (height - 60)} r="5" fill="#3569d6" /> : null}
      {rows.length === 1 && showUnits ? <circle cx={x(0)} cy={height - 32 - rows[0].units / Math.max(1, rows[0].units) * (height - 60)} r="5" fill="#17a7b5" /> : null}
      {active !== null ? <path d={`M${x(active)} 10 V205`} stroke="#8ba2c5" strokeDasharray="4 4" /> : null}
    </svg>{active !== null ? <div role="tooltip" className="absolute left-3 top-3 rounded-xl border bg-white/95 p-3 text-sm shadow-lg"><strong>{rows[active].date}</strong><p>成交订单数：{rows[active].paidOrders} 单</p><p>成交件数：{rows[active].units} 件</p></div> : null}</div>
    <p className="mt-2 text-xs text-slate-600">{rows[0].date} — {rows[rows.length - 1].date} · 鼠标悬停、手机触摸或键盘方向键查看每日值；两条曲线使用各自量程。</p>
  </div>;
}
