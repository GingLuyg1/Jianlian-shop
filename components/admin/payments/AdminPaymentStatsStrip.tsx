"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart3, ClipboardList, Loader, TrendingUp, WalletCards } from "lucide-react";

import AdminStatsCard from "@/components/admin/AdminStatsCard";
import { getPaymentChannelLabel } from "@/lib/payments/admin-payment-types";

type PaymentStats = {
  todayPaymentAmount: number;
  todayRechargeAmount: number;
  todaySuccessCount: number;
  successRate: number;
  pendingExceptionCount: number;
  channelShare: Array<{ channel: string; count: number }>;
};

function money(value: number | undefined) {
  return `¥${Number(value ?? 0).toFixed(2)}`;
}

export default function AdminPaymentStatsStrip() {
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch("/api/admin/payment-stats", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as PaymentStats | { error?: string } | null;
        if (!response.ok) throw new Error((payload as { error?: string } | null)?.error ?? "failed");
        if (mounted) setStats(payload as PaymentStats);
      })
      .catch(() => mounted && setFailed(true))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const channelShare = stats?.channelShare.length
    ? stats.channelShare.slice(0, 2).map((item) => `${getPaymentChannelLabel(item.channel)} ${item.count}`).join(" / ")
    : "暂无数据";

  const cards = [
    { title: "今日支付金额", value: failed ? "-" : money(stats?.todayPaymentAmount), icon: WalletCards },
    { title: "今日充值金额", value: failed ? "-" : money(stats?.todayRechargeAmount), icon: WalletCards },
    { title: "今日成功笔数", value: failed ? "-" : stats?.todaySuccessCount ?? 0, icon: ClipboardList },
    { title: "支付成功率", value: failed ? "-" : `${Number(stats?.successRate ?? 0).toFixed(2)}%`, icon: TrendingUp },
    { title: "待处理异常", value: failed ? "-" : stats?.pendingExceptionCount ?? 0, icon: Loader, href: "/admin/payments?view=exceptions" },
    { title: "渠道占比", value: failed ? "-" : channelShare, icon: BarChart3 },
  ];

  return (
    <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 min-[1500px]:grid-cols-6">
      {cards.map((card) => {
        const node = (
          <AdminStatsCard
            title={card.title}
            value={loading ? "..." : card.value}
            icon={card.icon}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
          />
        );
        return "href" in card && card.href ? (
          <Link key={card.title} href={card.href} className="min-w-0">
            {node}
          </Link>
        ) : (
          <div key={card.title} className="min-w-0">{node}</div>
        );
      })}
    </div>
  );
}
