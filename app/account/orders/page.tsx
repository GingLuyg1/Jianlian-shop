"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, RefreshCcw, Search } from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import {
  getOrderStatusLabel,
  getPaymentStatusLabel,
  ORDER_STATUS_STYLES,
  PAYMENT_STATUS_STYLES,
  normalizeOrderStatus,
  normalizePaymentStatus,
  ORDER_STATUS_VALUES,
} from "@/lib/orders/order-status";
import type { OrderRecord } from "@/lib/orders/order-types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

export default function MyOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        status,
        search,
      });
      const response = await fetch(`/api/orders?${params.toString()}`);
      const result = (await response.json().catch(() => null)) as
        | { orders?: OrderRecord[]; count?: number; error?: string }
        | null;

      if (response.status === 401) {
        router.push("/login?redirect=/account/orders");
        return;
      }

      if (!response.ok) {
        throw new Error(result?.error ?? "订单读取失败");
      }

      setOrders(result?.orders ?? []);
      setCount(Number(result?.count ?? 0));
    } catch (loadError) {
      setError(getOrderErrorMessage(loadError, "订单读取失败"));
    } finally {
      setLoading(false);
    }
  }, [page, router, search, status]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const rows = useMemo(() => orders, [orders]);

  return (
    <PublicLayout contentClassName="max-w-none overflow-hidden px-4 py-3 md:px-6">
      <div className="mx-auto grid h-[calc(100dvh-87px)] max-w-[1500px] gap-4 overflow-hidden">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0 space-y-4 pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-xl">我的订单</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  查询当前账号的订单记录和处理状态。
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={loadOrders}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                重新加载
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_180px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="搜索订单编号"
                  className="pl-9"
                />
              </div>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">全部状态</option>
                {ORDER_STATUS_VALUES.map((item) => (
                  <option key={item} value={item}>
                    {getOrderStatusLabel(item)}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-16 rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                {error}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-md rounded-2xl border border-dashed border-orange-200 bg-orange-50/60 p-8 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                    <ClipboardList className="h-7 w-7" />
                  </div>
                  <h2 className="mt-5 text-xl font-semibold">暂无订单</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    下单成功后，订单会显示在这里。
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="sticky top-0 bg-white text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-3 text-left">订单编号</th>
                      <th className="px-3 py-3 text-left">商品摘要</th>
                      <th className="px-3 py-3 text-left">订单金额</th>
                      <th className="px-3 py-3 text-left">订单状态</th>
                      <th className="px-3 py-3 text-left">支付状态</th>
                      <th className="px-3 py-3 text-left">创建时间</th>
                      <th className="px-3 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((order) => {
                      const orderStatus = normalizeOrderStatus(order.status);
                      const paymentStatus = normalizePaymentStatus(
                        order.payment_status
                      );
                      const productName =
                        order.order_items?.[0]?.product_name ?? "订单商品";

                      return (
                        <tr key={order.id} className="border-b hover:bg-slate-50">
                          <td className="px-3 py-4 font-mono text-xs">
                            {order.order_no}
                          </td>
                          <td className="max-w-[260px] truncate px-3 py-4 font-medium">
                            {productName}
                          </td>
                          <td className="px-3 py-4 font-semibold text-primary">
                            ¥{Number(order.total_amount).toFixed(2)}
                          </td>
                          <td className="px-3 py-4">
                            <Badge
                              variant="outline"
                              className={cn("whitespace-nowrap text-xs", ORDER_STATUS_STYLES[orderStatus])}
                            >
                              {getOrderStatusLabel(order.status)}
                            </Badge>
                          </td>
                          <td className="px-3 py-4">
                            <Badge
                              variant="outline"
                              className={cn("whitespace-nowrap text-xs", PAYMENT_STATUS_STYLES[paymentStatus])}
                            >
                              {getPaymentStatusLabel(order.payment_status)}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-muted-foreground">
                            {new Date(order.created_at).toLocaleString("zh-CN", {
                              hour12: false,
                            })}
                          </td>
                          <td className="px-3 py-4 text-right">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/account/orders/${order.order_no}`}>
                                查看详情
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
          <div className="flex shrink-0 items-center justify-between border-t px-6 py-3 text-sm text-muted-foreground">
            <span>共 {count} 条订单</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                上一页
              </Button>
              <span>
                第 {page} / {totalPages} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                下一页
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
}
