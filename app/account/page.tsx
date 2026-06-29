"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Clock,
  CreditCard,
  Mail,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  UserRound,
  WalletCards,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrderStatusLabel, normalizeOrderStatus } from "@/lib/orders/order-status";
import { rechargeStatusLabel } from "@/lib/payments/recharge-utils";

type ProfileView = {
  email: string | null;
  displayName: string | null;
  role: string | null;
  createdAt: string | null;
  balance: number;
};

type OrderView = {
  id: string;
  orderNo: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  createdAt: string | null;
};

type RechargeView = {
  rechargeNo: string;
  channelName: string;
  currency: string;
  requestedAmount: number;
  creditedAmount: number;
  status: string;
  createdAt: string | null;
  paidAt: string | null;
};

type BalanceTransactionView = {
  transactionNo: string;
  businessType: string;
  businessId: string;
  direction: "credit" | "debit";
  amount: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  currency: string;
  status: string;
  remark: string | null;
  createdAt: string | null;
};

type AccountAssetsResponse = {
  profile: ProfileView;
  orders: OrderView[];
  recentRecharges: RechargeView[];
  recentBalanceTransactions: BalanceTransactionView[];
  summary: {
    availableBalance: number;
    frozenBalance: number | null;
    totalRecharge: number;
    totalSpend: number;
    orderCount: number;
    unfinishedOrderCount: number;
  };
  diagnostics: {
    profileError?: string | null;
    orderError?: string | null;
    rechargeError?: string | null;
    balanceTransactionError?: string | null;
    balanceTransactionsReady: boolean;
  };
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("zh-CN", {
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function formatMoney(value: number, currency = "CNY") {
  const amount = Number(value || 0).toFixed(currency === "USDT" ? 6 : 2);
  return currency === "USDT" ? `${amount} USDT` : `¥${amount}`;
}

function balanceTypeLabel(type: string) {
  return (
    {
      account_recharge: "充值入账",
      order_payment: "订单消费",
      admin_adjustment: "管理员调整",
      refund: "订单退款",
      promotion: "推广收益",
      system: "系统处理",
    }[type] ?? type
  );
}

function isUnfinishedOrder(status: string) {
  return ["pending_payment", "paid", "processing", "delivered"].includes(normalizeOrderStatus(status));
}

export default function AccountOverviewPage() {
  const [data, setData] = useState<AccountAssetsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/account/assets", { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as AccountAssetsResponse & { error?: string };
      if (!response.ok) throw new Error(result?.error ?? "账户资产加载失败，请稍后重试");
      setData(result);
    } catch (loadError) {
      setError(getClientErrorMessage(loadError, "账户资产加载失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const recentOrders = useMemo(() => data?.orders.slice(0, 5) ?? [], [data?.orders]);
  const diagnostics = data?.diagnostics;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <Card className="shrink-0">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-xl">账户中心</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              查看账户资料、余额、充值、订单和最近资金变动。
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadOverview()} disabled={loading}>
            <RefreshCw className={loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            重新加载
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
          {diagnostics?.balanceTransactionError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              余额流水暂不可用：{diagnostics.balanceTransactionError}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoCard icon={WalletCards} label="当前余额" value={formatMoney(data?.profile.balance ?? 0)} loading={loading} />
            <InfoCard icon={WalletCards} label="可用余额" value={formatMoney(data?.summary.availableBalance ?? 0)} loading={loading} />
            <InfoCard
              icon={WalletCards}
              label="冻结余额"
              value={data?.summary.frozenBalance == null ? "未接入" : formatMoney(data.summary.frozenBalance)}
              loading={loading}
            />
            <InfoCard icon={TrendingUp} label="累计充值" value={formatMoney(data?.summary.totalRecharge ?? 0)} loading={loading} />
            <InfoCard icon={TrendingDown} label="累计消费" value={formatMoney(data?.summary.totalSpend ?? 0)} loading={loading} />
            <InfoCard icon={ReceiptText} label="订单数量" value={String(data?.summary.orderCount ?? 0)} loading={loading} />
            <InfoCard icon={ReceiptText} label="未完成订单" value={String(data?.summary.unfinishedOrderCount ?? 0)} loading={loading} />
            <InfoCard icon={Mail} label="登录邮箱" value={data?.profile.email || "—"} loading={loading} />
            <InfoCard icon={UserRound} label="显示名称" value={data?.profile.displayName || "—"} loading={loading} />
            <InfoCard icon={ShieldCheck} label="账户角色" value={data?.profile.role || "user"} loading={loading} />
            <InfoCard icon={Clock} label="注册时间" value={formatDate(data?.profile.createdAt)} loading={loading} />
            <InfoCard
              icon={CreditCard}
              label="余额来源"
              value="profiles.balance"
              loading={loading}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base">最近订单</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">仅展示当前账号最近订单。</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/account/orders">查看全部</Link>
            </Button>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto">
            {loading ? (
              <SkeletonList />
            ) : diagnostics?.orderError ? (
              <ErrorBlock text={diagnostics.orderError} />
            ) : recentOrders.length === 0 ? (
              <EmptyBlock title="暂无订单" description="下单后可在这里查看最近订单。" actionHref="/" actionText="去商城看看" />
            ) : (
              <div className="divide-y rounded-xl border">
                {recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/account/orders/${order.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-orange-50/60"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs text-slate-500">{order.orderNo}</div>
                      <div className="mt-1 text-slate-500">{formatDate(order.createdAt)}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge variant="outline">{getOrderStatusLabel(order.status)}</Badge>
                      <span className="font-semibold text-primary">{formatMoney(order.totalAmount)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid min-h-0 grid-rows-2 gap-4 overflow-hidden">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <CardTitle className="text-base">最近充值</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/products/account-recharge">充值</Link>
              </Button>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-auto">
              {loading ? (
                <SkeletonList compact />
              ) : diagnostics?.rechargeError ? (
                <ErrorBlock text={diagnostics.rechargeError} />
              ) : (data?.recentRecharges.length ?? 0) === 0 ? (
                <EmptyBlock title="暂无充值记录" description="创建充值后会显示在这里。" />
              ) : (
                <div className="space-y-2">
                  {data?.recentRecharges.map((record) => (
                    <div key={record.rechargeNo} className="rounded-xl border bg-slate-50 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-mono text-xs text-slate-500">{record.rechargeNo}</span>
                        <Badge variant="outline">{rechargeStatusLabel(record.status)}</Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="truncate text-slate-500">{record.channelName}</span>
                        <span className="font-semibold text-primary">{formatMoney(record.requestedAmount, record.currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">最近余额变动</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-auto">
              {loading ? (
                <SkeletonList compact />
              ) : diagnostics?.balanceTransactionError ? (
                <ErrorBlock text={diagnostics.balanceTransactionError} />
              ) : (data?.recentBalanceTransactions.length ?? 0) === 0 ? (
                <EmptyBlock title="暂无余额流水" description="充值入账或余额消费后会显示在这里。" />
              ) : (
                <div className="space-y-2">
                  {data?.recentBalanceTransactions.map((item) => (
                    <div key={item.transactionNo} className="rounded-xl border bg-slate-50 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate">{balanceTypeLabel(item.businessType)}</span>
                        <span className={item.direction === "credit" ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
                          {item.direction === "credit" ? "+" : "-"}
                          {formatMoney(item.amount, item.currency)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500">
                        <span className="truncate">{item.remark || item.transactionNo}</span>
                        <span>{formatDate(item.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  loading,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  loading: boolean;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      {loading ? (
        <div className="mt-3 h-5 w-24 animate-pulse rounded bg-slate-100" />
      ) : (
        <div className="mt-2 truncate text-base font-semibold text-slate-950">{value || "—"}</div>
      )}
    </div>
  );
}

function SkeletonList({ compact }: { compact?: boolean }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: compact ? 3 : 5 }).map((_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}

function ErrorBlock({ text }: { text: string }) {
  return <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{text}</div>;
}

function EmptyBlock({
  actionHref,
  actionText,
  description,
  title,
}: {
  actionHref?: string;
  actionText?: string;
  description: string;
  title: string;
}) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-orange-200 bg-orange-50/50 p-6 text-center">
      <div className="font-semibold text-slate-950">{title}</div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {actionHref && actionText ? (
        <Button className="mt-4" asChild>
          <Link href={actionHref}>{actionText}</Link>
        </Button>
      ) : null}
    </div>
  );
}

function getClientErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
