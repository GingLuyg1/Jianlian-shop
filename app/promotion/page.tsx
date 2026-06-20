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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

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
  status: "pending" | "available" | "withdrawn" | "cancelled";
};

type ReferralResponse = {
  inviteCode: string;
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

type StatCard = {
  label: string;
  value: string;
  icon: LucideIcon;
  error?: string;
  highlight?: boolean;
  hint?: string;
};

const commissionStatuses = [
  { value: "all", label: "全部状态" },
  { value: "pending", label: "待确认" },
  { value: "available", label: "可提现" },
  { value: "withdrawn", label: "已提现" },
  { value: "cancelled", label: "已取消" },
];

const statusLabels: Record<ReferralRecord["status"], string> = {
  pending: "待确认",
  available: "可提现",
  withdrawn: "已提现",
  cancelled: "已取消",
};

const statusStyles: Record<ReferralRecord["status"], string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  withdrawn: "bg-blue-50 text-blue-700 border-blue-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
};

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `¥${Number(value).toFixed(2)}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function getPromotionOrigin() {
  if (typeof window === "undefined") return "https://www.jianlian.shop";
  return window.location.hostname.includes("localhost")
    ? window.location.origin
    : "https://www.jianlian.shop";
}

export default function PromotionPage() {
  const [data, setData] = useState<ReferralResponse | null>(null);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));
  const promotionLink = data?.inviteCode
    ? `${getPromotionOrigin()}/register?invite=${encodeURIComponent(data.inviteCode)}`
    : "";

  const loadReferralData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        status,
      });
      const response = await fetch(`/api/referrals?${params.toString()}`, {
        cache: "no-store",
      });
      const result = (await response.json().catch(() => null)) as ReferralResponse | null;

      if (response.status === 401) {
        setError("请先登录后查看推广数据。");
        setData(null);
        return;
      }

      if (!response.ok) {
        throw new Error(result?.error || "推广数据读取失败");
      }

      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "推广数据读取失败");
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    loadReferralData();
  }, [loadReferralData]);

  const stats = useMemo<StatCard[]>(() => {
    const visits = data?.stats.visits;
    const registrations = data?.stats.registrations;
    const referrals = data?.stats.referrals;
    const registrationRate = data?.stats.registrationRate;

    return [
      {
        label: "访问量",
        value: visits?.value === null || visits?.value === undefined ? "未接入" : String(visits.value),
        icon: BarChart3,
        error: visits?.error,
      },
      {
        label: "注册人数",
        value:
          registrations?.value === null || registrations?.value === undefined
            ? "-"
            : String(registrations.value),
        icon: Users,
        error: registrations?.error,
      },
      {
        label: "推荐人数",
        value:
          referrals?.value === null || referrals?.value === undefined ? "-" : String(referrals.value),
        icon: Users,
        hint: "已绑定邀请关系的用户数",
        error: referrals?.error,
      },
      {
        label: "注册率",
        value: registrationRate?.value ?? "未接入",
        icon: Percent,
        error: registrationRate?.error,
      },
      {
        label: "累计佣金",
        value: formatMoney(data?.stats.totalCommission),
        icon: DollarSign,
        error: data?.stats.commissionError,
      },
      {
        label: "可提现金额",
        value: formatMoney(data?.stats.availableCommission),
        icon: Wallet,
        highlight: true,
        error: data?.stats.commissionError,
      },
    ];
  }, [data]);

  async function copyPromotionLink() {
    if (!promotionLink) {
      toast.error("推广链接暂未生成，请稍后重试。");
      return;
    }

    try {
      await navigator.clipboard.writeText(promotionLink);
      toast.success("推广链接已复制");
    } catch {
      toast.error("复制失败，请手动复制推广链接。");
    }
  }

  if (!loading && error === "请先登录后查看推广数据。") {
    return (
      <PublicLayout contentClassName="max-w-none px-4 py-5 md:px-6">
        <div className="mx-auto max-w-[1500px]">
          <Card className="border-orange-100 bg-white">
            <CardContent className="flex min-h-[360px] flex-col items-center justify-center text-center">
              <h1 className="text-2xl font-semibold text-slate-950">登录后查看推广数据</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                推广链接、邀请关系和佣金记录会绑定到当前登录账号。
              </p>
              <Button className="mt-6" asChild>
                <Link href="/login?redirect=/promotion">去登录</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout contentClassName="max-w-none px-4 py-5 md:px-6">
      <div className="mx-auto grid max-w-[1500px] gap-4">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="border-orange-100 bg-white">
            <CardContent className="p-4">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold text-slate-950">推广链接</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    复制专属链接邀请新用户注册，注册后会绑定推广关系。
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-primary">
                  <Link2 className="h-5 w-5" />
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-orange-100 bg-orange-50/40 px-4 py-3">
                <div className="min-w-0 flex-1 truncate text-sm text-slate-700">
                  {loading ? "正在加载推广链接..." : promotionLink || "暂无推广链接"}
                </div>
                <Button
                  type="button"
                  size="icon"
                  onClick={copyPromotionLink}
                  disabled={!promotionLink}
                  aria-label="复制推广链接"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <InfoPill label="佣金比例" value={`${((data?.commissionRate ?? 0.03) * 100).toFixed(0)}%`} />
                <InfoPill label="最低提现额" value={formatMoney(data?.minWithdrawAmount ?? 100)} />
                <Button
                  type="button"
                  variant="outline"
                  className="h-full min-h-11"
                  onClick={loadReferralData}
                  disabled={loading}
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  刷新推广链接
                </Button>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                邀请码由服务端生成并持久保存，不会使用用户 UUID 作为公开邀请码。
              </p>
            </CardContent>
          </Card>

          <Card className="border-orange-100 bg-white">
            <CardContent className="p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">推广数据</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    最近更新时间：{data?.updatedAt ? formatDateTime(data.updatedAt) : "-"}
                  </p>
                </div>
                <div className="text-right">
                  <Button disabled className="h-9 cursor-not-allowed opacity-70">
                    暂未开放
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    达到最低提现金额后，可在提现功能开放后申请。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {stats.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="min-h-[88px] rounded-xl border border-orange-100 bg-orange-50/30 px-4 py-3"
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Icon className="h-3.5 w-3.5 text-primary" />
                        {item.label}
                      </div>
                      <div
                        className={cn(
                          "mt-2 text-lg font-semibold",
                          item.highlight ? "text-primary" : "text-slate-950"
                        )}
                      >
                        {loading ? "-" : item.value}
                      </div>
                      {item.error || item.hint ? (
                        <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {item.error || item.hint}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-orange-100 bg-white">
          <CardContent className="p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">推广记录</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  被推荐用户完成有效订单后，佣金记录会显示在这里。
                </p>
              </div>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="佣金状态" />
                </SelectTrigger>
                <SelectContent>
                  {commissionStatuses.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {data?.recordError ? (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {data.recordError}
              </div>
            ) : null}

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded-xl bg-orange-50" />
                ))}
              </div>
            ) : data && data.records.length > 0 ? (
              <>
                <div className="overflow-auto rounded-xl border border-orange-100">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="bg-orange-50/80 text-muted-foreground">
                      <tr>
                        <TableHead>被推荐用户</TableHead>
                        <TableHead>订单编号</TableHead>
                        <TableHead>支付时间</TableHead>
                        <TableHead>订单金额</TableHead>
                        <TableHead>佣金比例</TableHead>
                        <TableHead>佣金金额</TableHead>
                        <TableHead>佣金状态</TableHead>
                      </tr>
                    </thead>
                    <tbody>
                      {data.records.map((record) => (
                        <tr key={record.id} className="border-t border-orange-100 hover:bg-orange-50/30">
                          <TableCell>{record.referredUser}</TableCell>
                          <TableCell>
                            <span className="font-mono text-xs">{record.orderNo}</span>
                          </TableCell>
                          <TableCell>{formatDateTime(record.paidAt)}</TableCell>
                          <TableCell>{formatMoney(record.orderAmount)}</TableCell>
                          <TableCell>{(record.commissionRate * 100).toFixed(0)}%</TableCell>
                          <TableCell className="font-semibold text-primary">
                            {formatMoney(record.commissionAmount)}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                                statusStyles[record.status]
                              )}
                            >
                              {statusLabels[record.status]}
                            </span>
                          </TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ReferralPagination
                  page={page}
                  totalPages={totalPages}
                  totalCount={data.count}
                  onPageChange={setPage}
                />
              </>
            ) : (
              <div className="flex min-h-[240px] max-h-[300px] items-center justify-center rounded-xl border border-dashed border-orange-200 bg-orange-50/30 p-6 text-center">
                <div className="max-w-md">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                    <Users className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-950">暂无推广记录</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    通过专属链接邀请用户注册并完成有效订单后，推广记录会显示在这里。
                  </p>
                  <Button className="mt-4" onClick={copyPromotionLink} disabled={!promotionLink}>
                    <Copy className="mr-2 h-4 w-4" />
                    复制推广链接
                  </Button>
                  <div className="mt-3 text-xs text-muted-foreground">共 0 条记录</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50/40 px-4 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function TableHead({ children }: { children: ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 text-left font-semibold">{children}</th>;
}

function TableCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={cn("whitespace-nowrap px-4 py-3 text-slate-700", className)}>{children}</td>;
}

function ReferralPagination({
  page,
  totalPages,
  totalCount,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>共 {totalCount} 条记录</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span>
          第 {page} / {totalPages} 页
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
