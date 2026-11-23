"use client";
import { statusLabel as adminUnknownStatusLabel } from '@/lib/admin/display-labels';

import { statusLabel as displayStatusLabel } from '@/lib/admin/display-labels';

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCcw, Search, ShieldAlert, ShieldCheck } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import {
  AdminFilterBar,
  AdminListPagination,
  AdminListStat,
  AdminListStats,
  AdminListSurface,
  AdminTableViewport,
  adminListControlClass,
  adminListRowClass,
  adminListTableHeadClass,
} from "@/components/admin/v2/AdminList";
import AdminStatusBadge, { type AdminStatusTone } from "@/components/admin/v2/AdminStatusBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RiskEvent = {
  id: string; ruleCode: string; riskLevel: string; riskScore: number; recommendedAction: string;
  businessType: string; businessId: string | null; userId: string | null; requestId: string | null;
  sourceHash: string | null; summary: string; status: string; occurrences: number;
  firstSeenAt: string | null; lastSeenAt: string | null; createdAt: string | null; updatedAt: string | null;
};
type RiskStats = { pending: number; high: number; today: number; processed: number };

const LEVELS = [["all", "全部等级"], ["low", "低"], ["medium", "中"], ["high", "高"], ["critical", "严重"]] as const;
const STATUSES = [["all", "全部状态"], ["open", "未处理"], ["pending", "待审核"], ["reviewing", "审核中"], ["monitoring", "观察中"], ["approved", "已批准"], ["rejected", "已拒绝"], ["resolved", "已解除"], ["expired", "已过期"], ["cancelled", "已取消"]] as const;
const BUSINESS_TYPES = [["all", "全部业务"], ["account", "账户"], ["login", "登录"], ["order", "订单"], ["inventory", "库存"], ["payment", "支付"], ["recharge", "充值"], ["refund", "退款"], ["delivery", "交付"]] as const;
const SORTS = [["newest", "最近发现"], ["oldest", "最早发现"], ["risk_desc", "风险分数从高到低"], ["risk_asc", "风险分数从低到高"]] as const;
const PAGE_SIZE = 20;

const ACTIVE_PROTECTION_RULES = [
  {
    code: "ORDER_UNPAID_BURST",
    title: "恶意占单 / 高频未付拦截",
    threshold: "15 分钟内未支付订单 ≥ 5 单",
    weight: "35 分",
    desc: "防止恶意刷单批量锁死商品库存或耗尽限购额度。",
  },
  {
    code: "ORDER_SKU_REPEATED_RESERVATION",
    title: "同一规格高频锁库保护",
    threshold: "30 分钟内同 SKU 未付锁单 ≥ 3 次",
    weight: "30 分",
    desc: "保护稀缺卡密/激活码规格不被单一账号重复占用。",
  },
  {
    code: "PAYMENT_SESSION_BURST",
    title: "高频拉起支付会话监控",
    threshold: "15 分钟内创建支付单 ≥ 6 次",
    weight: "35 分",
    desc: "防止恶意探测收款通道或频繁刷取第三方收银台二维码。",
  },
  {
    code: "PAYMENT_DUPLICATE_PROVIDER_TRADE",
    title: "支付网关流水重放拦截",
    threshold: "24 小时内重复第三方交易号 ≥ 1 次",
    weight: "95 分（高危拦截）",
    desc: "严格阻断同一笔上游支付流水或链上哈希重复入账。",
  },
  {
    code: "RECHARGE_REQUEST_BURST",
    title: "账户充值高频提交保护",
    threshold: "30 分钟内发起充值请求 ≥ 5 次",
    weight: "35 分",
    desc: "防止恶意抢占 USDT 金额指纹或刷爆充值审核队列。",
  },
  {
    code: "REFUND_DELIVERED_DIGITAL",
    title: "已发货数字商品退款审计",
    threshold: "30 天内已交付卡密申请退款 ≥ 1 次",
    weight: "30 分",
    desc: "对已提取卡密/自动发货商品的异常退款请求触发人工复核。",
  },
] as const;

function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer); }, [delay, value]);
  return debounced;
}

export default function AdminRiskPage() {
  const router = useRouter();
  const pathname = usePathname();
  const initial = useSearchParams();
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [stats, setStats] = useState<RiskStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(initial.get("search") ?? "");
  const [level, setLevel] = useState(initial.get("level") ?? "all");
  const [status, setStatus] = useState(initial.get("status") ?? "all");
  const [businessType, setBusinessType] = useState(initial.get("businessType") ?? "all");
  const [startAt, setStartAt] = useState(initial.get("startAt") ?? "");
  const [endAt, setEndAt] = useState(initial.get("endAt") ?? "");
  const [sort, setSort] = useState(initial.get("sort") ?? "newest");
  const [page, setPage] = useState(Math.max(Number(initial.get("page") ?? 1) || 1, 1));
  const debouncedSearch = useDebouncedValue(search);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    params.set("sort", sort);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (level !== "all") params.set("level", level);
    if (status !== "all") params.set("status", status);
    if (businessType !== "all") params.set("businessType", businessType);
    if (startAt) params.set("startAt", startAt);
    if (endAt) params.set("endAt", endAt);
    return params.toString();
  }, [businessType, debouncedSearch, endAt, level, page, sort, startAt, status]);

  const loadRisk = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/risk?${queryString}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "风险事件读取失败");
      setEvents(Array.isArray(payload.events) ? payload.events : []);
      setStats(payload.stats ?? null);
      setTotal(Number(payload.total ?? 0));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "风险事件读取失败");
      setEvents([]); setStats(null); setTotal(0);
    } finally { setLoading(false); }
  }, [queryString]);

  useEffect(() => { router.replace(`${pathname}?${queryString}`, { scroll: false }); void loadRisk(); }, [loadRisk, pathname, queryString, router]);
  useEffect(() => { setPage(1); }, [businessType, debouncedSearch, endAt, level, sort, startAt, status]);

  const resetFilters = () => { setSearch(""); setLevel("all"); setStatus("all"); setBusinessType("all"); setStartAt(""); setEndAt(""); setSort("newest"); setPage(1); };
  const hasFilters = Boolean(debouncedSearch || level !== "all" || status !== "all" || businessType !== "all" || startAt || endAt || sort !== "newest");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cards = [["当前待审核", stats?.pending ?? 0], ["高风险", stats?.high ?? 0], ["今日新增", stats?.today ?? 0], ["已处理", stats?.processed ?? 0]] as const;

  return (
    <AdminPageShell variant="v2" title="风险审核中心" description="实时自动监控恶意占单锁库、高频拉起支付会话、第三方流水重放及已交付数字卡密异常退款。正常交易不会在此产生告警记录。" actions={<Button className="h-11 sm:h-9" variant="outline" onClick={() => void loadRisk()} disabled={loading}><RefreshCcw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />{loading ? "刷新中..." : "刷新"}</Button>}>
      <AdminListStats>
        {cards.map(([label, value]) => <AdminListStat key={label} label={label} value={value} tone={label === "高风险" && value > 0 ? "warning" : "neutral"} icon={<ShieldAlert className="h-4 w-4" />} />)}
      </AdminListStats>

      {/* 风控策略总览说明面板 */}
      <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                实时自动化风控引擎运行中
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="h-3 w-3" /> 14 项防护规则已启用
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                本页面用于汇聚触发风控阈值的异常交易与行为证据。当列表为空时，代表当前商城全部订单、充值与支付均正常通过风控校验。
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIVE_PROTECTION_RULES.map((rule) => (
            <div
              key={rule.code}
              onClick={() => setSearch(rule.code)}
              className="group cursor-pointer rounded-xl border border-slate-200/75 bg-slate-50/60 p-3 transition-all hover:border-blue-300 hover:bg-blue-50/30"
              title={`点击筛选规则 ${rule.code}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 group-hover:text-blue-700">{rule.title}</span>
                <span className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500 border border-slate-200/80">
                  {rule.weight}
                </span>
              </div>
              <div className="mt-1 font-mono text-[10px] text-blue-600/90">{rule.code} · {rule.threshold}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{rule.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <AdminListSurface>
        <AdminFilterBar
          className="sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[minmax(180px,1fr)_128px_138px_138px_168px_168px_180px_76px]"
          primary={<>
            <label className="relative sm:col-span-2 lg:col-span-2 2xl:col-span-1"><span className="sr-only">搜索风险事件</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="记录号 / 规则 / 业务号 / 请求号" className={cn(adminListControlClass, "w-full pl-9 pr-3 outline-none")} /></label>
            <Select label="风险等级" value={level} onChange={setLevel} options={LEVELS} />
            <Select label="状态" value={status} onChange={setStatus} options={STATUSES} />
          </>}
          advanced={<>
            <Select label="业务类型" value={businessType} onChange={setBusinessType} options={BUSINESS_TYPES} />
            <input aria-label="开始时间" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className={cn(adminListControlClass, "px-3 outline-none")} />
            <input aria-label="结束时间" type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} className={cn(adminListControlClass, "px-3 outline-none")} />
            <Select label="排序" value={sort} onChange={setSort} options={SORTS} />
            <button type="button" onClick={resetFilters} className={cn(adminListControlClass, "px-3 text-slate-700 hover:bg-slate-50")}>重置</button>
          </>}
        />

        <AdminTableViewport>
          {error ? <AdminErrorState title="风险事件加载失败" description={error} onRetry={() => void loadRisk()} /> : loading ? <AdminTableSkeleton rows={8} /> : events.length === 0 ? <AdminEmptyState title={hasFilters ? "没有符合条件的风险事件" : "暂无风险事件"} description={hasFilters ? "请调整筛选条件后再试。" : "真实风险事件产生后会显示在这里。"} /> : (
            <table className="w-full min-w-[1280px] table-fixed text-sm">
              <colgroup><col className="w-[148px]" /><col className="w-[130px]" /><col className="w-[190px]" /><col className="w-[130px]" /><col className="w-[110px]" /><col className="w-[220px]" /><col className="w-[100px]" /><col className="w-[150px]" /><col className="w-[78px]" /></colgroup>
              <thead className={adminListTableHeadClass}><tr className="border-b">{["风险记录号", "关联用户", "关联业务", "风险类型", "等级 / 分数", "风险原因", "状态", "最后发现", "操作"].map((heading) => <th scope="col" key={heading} className={`h-10 whitespace-nowrap px-3 font-medium ${["等级 / 分数", "状态", "最后发现", "操作"].includes(heading) ? "text-center" : "text-left"}`}>{heading}</th>)}</tr></thead>
              <tbody>{events.map((event) => <tr key={event.id} className={adminListRowClass}>
                <td className="truncate px-3 py-2 font-mono text-xs" title={event.id}>{event.id}</td>
                <td className="px-3 py-2">{event.userId ? <Link className="font-mono text-xs text-primary hover:underline" href={`/admin/users?search=${encodeURIComponent(event.userId)}`}>{shortId(event.userId)}</Link> : "—"}</td>
                <td className="px-3 py-2"><div>{businessLabel(event.businessType)}</div>{event.businessId ? (businessHref(event) ? <Link className="block truncate font-mono text-xs text-primary hover:underline" href={businessHref(event)!}>{event.businessId}</Link> : <span className="block truncate font-mono text-xs text-slate-500">{event.businessId}</span>) : <span className="text-xs text-slate-400">—</span>}</td>
                <td className="truncate px-3 py-2 font-mono text-xs" title={event.ruleCode}>{event.ruleCode}</td>
                <td className="px-3 py-2 text-center"><RiskBadge level={event.riskLevel} score={event.riskScore} /></td>
                <td className="px-3 py-2"><div className="line-clamp-2" title={event.summary}>{event.summary}</div><div className="mt-1 text-xs text-slate-400">建议：{event.recommendedAction}</div></td>
                <td className="px-3 py-2 text-center">{statusLabel(event.status)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums text-slate-500">{formatDate(event.lastSeenAt)}</td>
                <td className="px-3 py-2 text-center whitespace-nowrap"><Link href={`/admin/risk/${event.id}`} className="inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-9">查看</Link></td>
              </tr>)}</tbody>
            </table>
          )}
        </AdminTableViewport>
        <AdminListPagination summary={`共 ${total} 条`} page={page} totalPages={totalPages} loading={loading} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} />
      </AdminListSurface>
    </AdminPageShell>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) { return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={cn(adminListControlClass, "px-3 outline-none")}>{options.map(([option, optionLabel]) => <option key={option} value={option}>{optionLabel}</option>)}</select>; }
function RiskBadge({ level, score }: { level: string; score: number }) { const tone: AdminStatusTone = level === "critical" || level === "high" ? "danger" : level === "medium" ? "warning" : "success"; return <AdminStatusBadge tone={tone}>{displayStatusLabel(level)} · {score}</AdminStatusBadge>; }
function businessLabel(value: string) { return Object.fromEntries(BUSINESS_TYPES)[value] ?? value; }
function statusLabel(value: string) { return Object.fromEntries(STATUSES)[value] ?? adminUnknownStatusLabel(value); }
function shortId(value: string) { return `${value.slice(0, 8)}…`; }
function businessHref(event: RiskEvent) { const search = encodeURIComponent(event.businessId ?? ""); if (event.businessType === "order") return `/admin/orders?search=${search}`; if (event.businessType === "payment") return `/admin/payments?search=${search}`; if (event.businessType === "recharge") return `/admin/recharges?search=${search}`; if (event.businessType === "account" || event.businessType === "login") return `/admin/users?search=${encodeURIComponent(event.userId ?? event.businessId ?? "")}`; return undefined; }
function formatDate(value: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false }); }
