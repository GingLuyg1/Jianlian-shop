"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clock, Mail, ReceiptText, ShieldCheck, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getOrderStatusLabel, normalizeOrderStatus } from "@/lib/orders/order-status";

type ProfileView = {
  email: string | null;
  display_name: string | null;
  role: string | null;
  created_at: string | null;
};

type OrderView = {
  id: string;
  order_no: string;
  status: string;
  total_amount: number;
  created_at: string | null;
};

const effectiveSpendStatuses = new Set(["paid", "processing", "delivered", "completed"]);

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}

function formatMoney(value: number) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

export default function AccountOverviewPage() {
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [ordersError, setOrdersError] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setProfileError(false);
    setOrdersError(false);

    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setLastSignIn(user.last_sign_in_at ?? null);

    const profileResult = await supabase
      .from("profiles")
      .select("email,display_name,role,created_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profileResult.error) {
      console.error("[Account] profile overview failed", profileResult.error);
      setProfileError(true);
      setProfile({
        email: user.email ?? null,
        display_name: null,
        role: null,
        created_at: user.created_at ?? null,
      });
    } else {
      setProfile((profileResult.data as ProfileView | null) ?? {
        email: user.email ?? null,
        display_name: null,
        role: null,
        created_at: user.created_at ?? null,
      });
    }

    const ordersResult = await supabase
      .from("orders")
      .select("id,order_no,status,total_amount,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (ordersResult.error) {
      console.error("[Account] order overview failed", ordersResult.error);
      setOrdersError(true);
      setOrders([]);
    } else {
      setOrders(
        ((ordersResult.data ?? []) as Array<Record<string, unknown>>).map((order) => ({
          id: String(order.id),
          order_no: String(order.order_no ?? ""),
          status: String(order.status ?? "pending_payment"),
          total_amount: Number(order.total_amount ?? 0),
          created_at: typeof order.created_at === "string" ? order.created_at : null,
        }))
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const stats = useMemo(() => {
    const pending = orders.filter((order) =>
      ["pending_payment", "paid", "processing"].includes(normalizeOrderStatus(order.status))
    ).length;
    const completed = orders.filter((order) => normalizeOrderStatus(order.status) === "completed").length;
    const spent = orders
      .filter((order) => effectiveSpendStatuses.has(normalizeOrderStatus(order.status)))
      .reduce((sum, order) => sum + order.total_amount, 0);
    return { pending, completed, spent };
  }, [orders]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">账户概览</CardTitle>
          <p className="text-sm text-muted-foreground">查看当前账号资料、订单统计和最近订单。</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InfoCard icon={UserRound} label="显示名称" value={profileError ? "—" : profile?.display_name || "—"} loading={loading} />
          <InfoCard icon={Mail} label="登录邮箱" value={profile?.email || "—"} loading={loading} />
          <InfoCard icon={ShieldCheck} label="账号角色" value={profile?.role || "user"} loading={loading} />
          <InfoCard icon={Clock} label="注册时间" value={formatDate(profile?.created_at)} loading={loading} />
          <InfoCard icon={Clock} label="最近登录时间" value={formatDate(lastSignIn)} loading={loading} />
          <InfoCard icon={ReceiptText} label="订单总数" value={ordersError ? "0" : String(orders.length)} loading={loading} />
          <InfoCard icon={ReceiptText} label="待处理订单数" value={ordersError ? "0" : String(stats.pending)} loading={loading} />
          <InfoCard icon={ReceiptText} label="已完成订单数" value={ordersError ? "0" : String(stats.completed)} loading={loading} />
          <InfoCard icon={ReceiptText} label="累计消费金额" value={ordersError ? "¥0.00" : formatMoney(stats.spent)} loading={loading} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base">最近订单</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">仅展示当前账号最近订单。</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/account/orders">查看全部</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : ordersError ? (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              订单统计加载失败，请稍后重试。
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/50 p-8 text-center">
              <div className="font-semibold text-slate-950">暂无订单</div>
              <p className="mt-2 text-sm text-muted-foreground">下单后可在这里查看最近订单。</p>
              <Button className="mt-4" asChild>
                <Link href="/">去商城看看</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y rounded-xl border">
              {orders.slice(0, 5).map((order) => (
                <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <div className="font-mono text-xs text-slate-500">{order.order_no}</div>
                    <div className="mt-1 text-slate-500">{formatDate(order.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{getOrderStatusLabel(order.status)}</Badge>
                    <span className="font-semibold text-primary">{formatMoney(order.total_amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
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
