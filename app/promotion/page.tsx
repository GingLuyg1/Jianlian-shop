"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  DollarSign,
  Link2,
  Percent,
  RefreshCcw,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import PublicLayout from "@/components/layout/PublicLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

type ReferralStatus = "pending" | "available" | "withdrawn" | "cancelled";

type NullableStat = {
  value: number | null;
  error?: string;
};

type ReferralRecord = {
  id: string;
  referredUser: string;
  orderNo: string;
  paidAt: string | null;
  orderAmount: number;
  commissionRate: number;
  commissionAmount: number;
  status: ReferralStatus;
};

type ReferralResponse = {
  inviteCode: string;
  promotionEnabled?: boolean;
  commissionRate: number;
  minWithdrawAmount: number;
  updatedAt: string;
  stats: {
    visits: NullableStat;
    registrations: NullableStat;
    referrals: NullableStat;
    registrationRate: { value: string | null; error?: string };
    totalCommission: number | null;
    availableCommission: number | null;
    commissionError?: string;
  };
  records: ReferralRecord[];
  recordError?: string;
  count: number;
  page: number;
  pageSize: number;
  error?: string;
};

const statusOptions: Array<{ value: "all" | ReferralStatus; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "pending", label: "待确认" },
  { value: "available", label: "可用" },
  { value: "withdrawn", label: "已提现" },
  { value: "cancelled", label: "已取消" },
];

const statusLabels: Record<ReferralStatus, string> = {
  pending: "待确认",
  available: "已确认",
  withdrawn: "已提现",
  cancelled: "已取消",
};

const statusStyles: Record<ReferralStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-100",
  available: "bg-blue-50 text-blue-700 ring-blue-100",
  withdrawn: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
};

function formatMoney(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return `¥ ${amount.toFixed(2)}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getPromotionOrigin() {
  if (typeof window === "undefined") return "https://www.jianlian.shop";
  return window.location.origin || "https://www.jianlian.shop";
}

function getErrorMessage(error: unknown, fallback = "推广数据读取失败，请稍后重试") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

function StatCard({ label, value, icon: Icon, highlight }: { label: string; value: string | number; icon: LucideIcon; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="h-4 w-4 text-orange-500" />
        <span>{label}</span>
      </div>
      <div className={cn("mt-2 text-2xl font-bold text-slate-950", highlight && "text-blue-600")}>{value}</div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-orange-50 px-4 py-3">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-950">{value}</div>
    </div>
  );
}

function ReferralPagination({ page, totalPages, total, onPageChange }: { page: number; totalPages: number; total: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) {
    return <div className="text-sm text-slate-500">共 {total} 条记录</div>;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
      <div>
        共 {total} 条记录，当前第 {page} / {totalPages} 页
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-400 transition hover:bg-orange-50 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => onPageChange(item)}
            className={cn(
              "h-9 min-w-9 rounded-lg px-3 font-semibold transition",
              item === page ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-700 hover:bg-orange-100",
            )}
          >
            {item}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-400 transition hover:bg-orange-50 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="ml-4 text-slate-500">前往</span>
        <span className="inline-flex h-9 min-w-12 items-center justify-center rounded-full border border-orange-100 bg-white px-4 text-slate-700">{page}</span>
        <span>页</span>
      </div>
    </div>
  );
}

export default function PromotionPage() {
  const [data, setData] = useState<ReferralResponse | null>(null);
  const [status, setStatus] = useState<"all" | ReferralStatus>("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReferralData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        status,
      });
      const response = await fetch(`/api/referrals?${params.toString()}`, { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as ReferralResponse | null;

      if (response.status === 401) {
        setError("请先登录后查看推广数据。");
        setData(null);
        return;
      }

      if (!response.ok) {
        throw new Error(result?.error ?? "推广数据读取失败，请稍后重试");
      }

      setData(result);
    } catch (fetchError) {
      setError(getErrorMessage(fetchError));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void loadReferralData();
  }, [loadReferralData]);

  const promotionLink = useMemo(() => {
    if (!data?.inviteCode) return "";
    return `${getPromotionOrigin()}/register?invite=${encodeURIComponent(data.inviteCode)}`;
  }, [data?.inviteCode]);

  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  const stats = useMemo(
    () => [
      { label: "访问量", value: data?.stats.visits.value ?? "未接入", icon: BarChart3 },
      { label: "注册", value: data?.stats.registrations.value ?? 0, icon: Users },
      { label: "推荐人", value: data?.stats.referrals.value ?? 0, icon: Users },
      { label: "注册率", value: data?.stats.registrationRate.value ?? "未接入", icon: Percent },
      { label: "总收入", value: formatMoney(data?.stats.totalCommission), icon: DollarSign },
      { label: "可用金额", value: formatMoney(data?.stats.availableCommission), icon: Wallet, highlight: true },
    ],
    [data],
  );

  const copyPromotionLink = async () => {
    if (!promotionLink) {
      toast.error("暂无推广链接，请稍后重试");
      return;
    }

    try {
      await navigator.clipboard.writeText(promotionLink);
      toast.success("推广链接已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  if (error === "请先登录后查看推广数据。") {
    return (
      <PublicLayout contentClassName="p-4 md:p-3 max-w-[1540px] mx-auto mt-12 md:mt-0">
        <div className="rounded-2xl border border-orange-100 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-950">推广赚钱</h1>
          <p className="mt-3 text-slate-500">登录后可查看推广链接、佣金统计和推广记录。</p>
          <Link
            href="/login?redirect=/promotion"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-orange-500 px-6 font-semibold text-white transition hover:bg-orange-600"
          >
            去登录
          </Link>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout contentClassName="p-4 md:p-3 max-w-[1540px] mx-auto mt-12 md:mt-0 md:h-[calc(100vh-62px)] md:overflow-hidden">
      <div className="grid gap-3 md:h-full md:grid-rows-[auto_1fr]">
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button type="button" onClick={() => void loadReferralData()} className="ml-3 font-semibold underline">
              重新加载
            </button>
          </div>
        )}

        {data?.promotionEnabled === false && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            推广功能暂未开启，开启后这里会显示推广链接和佣金记录。
          </div>
        )}

        <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-950">推广链接</h1>
                <p className="mt-1 text-sm text-slate-500">复制链接发送给好友，注册后自动绑定推广关系。</p>
              </div>
              <div className="rounded-xl bg-orange-50 p-3 text-orange-500">
                <Link2 className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <div className="min-w-0 flex-1 truncate text-sm text-slate-700" title={promotionLink || "推广链接生成中"}>
                {loading && !promotionLink ? "推广链接生成中..." : promotionLink || "暂无推广链接"}
              </div>
              <button
                type="button"
                onClick={copyPromotionLink}
                disabled={!promotionLink}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
              <InfoTile label="充值提佣倍率" value={`${Math.round((data?.commissionRate ?? 0.03) * 100)}%`} />
              <InfoTile label="最低提现额" value={formatMoney(data?.minWithdrawAmount ?? 100)} />
              <button
                type="button"
                onClick={() => void loadReferralData()}
                className="inline-flex h-full min-h-[78px] items-center justify-center rounded-xl bg-orange-500 px-5 text-base font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
              >
                {loading ? "刷新中..." : "生成短链接"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-950">推广数据</h2>
                <p className="mt-1 text-sm text-slate-500">推广访问、注册和佣金收益统计。</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-red-500">只可提现到账户余额进行使用</span>
                <button
                  type="button"
                  disabled
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-orange-500 px-5 font-semibold text-white opacity-60"
                  title="提现功能暂未开放"
                >
                  提现
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {stats.map((item) => (
                <StatCard key={item.label} {...item} />
              ))}
            </div>
          </section>
        </div>

        <section className="flex min-h-0 flex-col rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">推广记录</h2>
              <p className="mt-1 text-sm text-slate-500">推广用户后，用户每一次充值提成记录都会在这里展示。</p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as "all" | ReferralStatus);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 w-[140px] rounded-xl border-orange-100 bg-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => void loadReferralData()}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-orange-100 bg-white px-3 text-sm font-semibold text-orange-600 transition hover:bg-orange-50"
              >
                <RefreshCcw className="h-4 w-4" />
                刷新
              </button>
            </div>
          </div>

          {data?.recordError && (
            <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {data.recordError}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-orange-100">
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                <tr>
                  <th className="border-b border-orange-100 px-4 py-3 text-center font-semibold">用户名</th>
                  <th className="border-b border-orange-100 px-4 py-3 text-center font-semibold">支付时间</th>
                  <th className="border-b border-orange-100 px-4 py-3 text-center font-semibold">充值金额</th>
                  <th className="border-b border-orange-100 px-4 py-3 text-center font-semibold">佣金变动</th>
                  <th className="border-b border-orange-100 px-4 py-3 text-center font-semibold">付款状态</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index}>
                      <td className="border-b border-orange-50 px-4 py-4" colSpan={5}>
                        <div className="h-5 animate-pulse rounded bg-slate-100" />
                      </td>
                    </tr>
                  ))
                ) : data?.records.length ? (
                  data.records.map((record) => (
                    <tr key={record.id} className="text-slate-700 transition hover:bg-orange-50/40">
                      <td className="border-b border-orange-50 px-4 py-3 text-center font-medium text-slate-900">{record.referredUser}</td>
                      <td className="border-b border-orange-50 px-4 py-3 text-center tabular-nums">{formatDateTime(record.paidAt)}</td>
                      <td className="border-b border-orange-50 px-4 py-3 text-center tabular-nums">{formatMoney(record.orderAmount)}</td>
                      <td className="border-b border-orange-50 px-4 py-3 text-center font-semibold tabular-nums text-orange-600">
                        {formatMoney(record.commissionAmount)}
                      </td>
                      <td className="border-b border-orange-50 px-4 py-3 text-center">
                        <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1", statusStyles[record.status])}>
                          {statusLabels[record.status]}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center">
                      <CheckCircle2 className="mx-auto h-10 w-10 text-orange-200" />
                      <div className="mt-3 text-base font-semibold text-slate-900">暂无推广记录</div>
                      <p className="mt-1 text-sm text-slate-500">复制推广链接给好友，产生充值后记录会显示在这里。</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 shrink-0">
            <ReferralPagination page={page} totalPages={totalPages} total={data?.count ?? 0} onPageChange={setPage} />
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
