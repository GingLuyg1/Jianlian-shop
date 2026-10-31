"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  Clock,
  ReceiptText,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AccountInformation from "@/components/account/AccountInformation";
import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/AccountCenter.module.css";

type ProfileView = {
  email: string | null;
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
  subtype: string | null;
  orderId: string | null;
  orderNo: string | null;
  receivedUsdt: string | null;
  expectedUsdt: string | null;
  shortfallUsdt: string | null;
  exchangeRate: string | null;
  txHashSummary: string | null;
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

  const diagnostics = data?.diagnostics;

  return (
    <div data-account-page="/account" data-account-ready={!loading && !error && Boolean(data)} aria-busy={loading} className={`${styles.page} flex min-h-0 flex-col gap-4`}>
      <Card className={`${glass.surface} ${styles.panel} shrink-0 overflow-hidden`}>
        <CardHeader className={`${glass.hero} ${styles.pageHeader} flex flex-row items-start justify-between gap-3`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={`${glass.icon} ${styles.sectionIcon}`}><WalletCards className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" /></span>
            <div>
            <CardTitle className="text-xl">账户中心</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              查看账户资产、登录信息与安全资料。
            </p>
            </div>
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
          <div className={styles.overviewStats}>
            <section className={styles.balanceHero} aria-label="账户余额">
              <div className="relative z-10">
                <div className="mb-4 flex items-center gap-2 text-sm text-[#967352]"><WalletCards className="h-4 w-4" aria-hidden="true" />当前余额</div>
                {loading ? <div className="h-12 w-40 animate-pulse rounded-lg bg-white/70 motion-reduce:animate-none" /> : <p className={styles.balanceValue}>{data ? formatMoney(data.profile.balance) : "/"}</p>}
              </div>
              <dl className={styles.balanceDetails}>
                <div className="min-w-0"><dt className="text-xs text-slate-500">可用余额</dt><dd className="mt-2 break-words text-base font-semibold text-slate-800">{loading || !data ? "/" : formatMoney(data.summary.availableBalance)}</dd></div>
                <div className="min-w-0"><dt className="text-xs text-slate-500">冻结余额</dt><dd className="mt-2 break-words text-sm font-medium text-slate-600">{loading ? "/" : data?.summary.frozenBalance == null ? "暂未开放" : formatMoney(data.summary.frozenBalance)}</dd></div>
              </dl>
            </section>
            <div className={styles.metricGrid}>
              <InfoCard icon={TrendingUp} label="累计充值" value={data ? formatMoney(data.summary.totalRecharge) : "/"} loading={loading} />
              <InfoCard icon={TrendingDown} label="累计消费" value={data ? formatMoney(data.summary.totalSpend) : "/"} loading={loading} />
              <Link href="/account/orders" className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="查看我的订单">
                <InfoCard icon={ReceiptText} label="订单数量" value={data ? String(data.summary.orderCount) : "/"} loading={loading} />
              </Link>
              <InfoCard icon={Clock} label="注册时间" value={formatDate(data?.profile.createdAt)} loading={loading} />
            </div>
          </div>
        </CardContent>
      </Card>

      <AccountInformation email={data?.profile.email ?? null} loading={loading} />
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  loading,
  value,
}: {
  icon: LucideIcon;
  label: string;
  loading: boolean;
  value: string;
}) {
  return (
    <div className={`${glass.inset} ${styles.stat}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      {loading ? (
        <div className="mt-3 h-5 w-24 animate-pulse rounded bg-slate-100" />
      ) : (
        <div className="mt-2 truncate text-base font-semibold text-slate-950" title={value}>{value || "—"}</div>
      )}
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
