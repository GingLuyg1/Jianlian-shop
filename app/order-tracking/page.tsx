"use client";

/**
 * Order Tracking Page - Look up order by order number and last 4 digits of phone
 *
 * Form fields: order number, last 4 digits of phone
 * Result card shows: order number, product name, payment status,
 * processing status, shipping info, created time.
 *
 * Uses PublicLayout. No cart. No footer.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PublicLayout from "@/components/layout/PublicLayout";
import OrderStatusCard from "@/components/orders/OrderStatusCard";
import { orders } from "@/lib/mock-data";
import { Order } from "@/lib/types";

export default function OrderTrackingPage() {
  const searchParams = useSearchParams();
  const prefillOrderNo = searchParams.get("id") || "";

  const [orderNo, setOrderNo] = useState(prefillOrderNo);
  const [phoneLast4, setPhoneLast4] = useState("");
  const [localOrders, setLocalOrders] = useState<Order[]>([]);
  const [foundOrder, setFoundOrder] = useState<Order | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    try {
      const savedOrders = JSON.parse(
        localStorage.getItem("jianlian_mock_orders") || "[]"
      );
      if (Array.isArray(savedOrders)) {
        setLocalOrders(savedOrders);
      }
    } catch {
      setLocalOrders([]);
    }
  }, []);

  const allOrders = useMemo(
    () => [...localOrders, ...orders],
    [localOrders]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearched(true);

    // Mock search: find by order number. Phone suffix is kept for future auth.
    const order = allOrders.find((o) => o.orderNo === orderNo);
    setFoundOrder(order || null);
  };

  return (
    <PublicLayout>
      <h1 className="text-xl font-bold text-foreground mb-4">订单查询</h1>

      <div className="max-w-2xl">
        {/* Search form */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">查询订单</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orderNo" className="text-sm">
                  订单号
                </Label>
                <Input
                  id="orderNo"
                  value={orderNo}
                  onChange={(e) => setOrderNo(e.target.value)}
                  placeholder="请输入订单号"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneLast4" className="text-sm">
                  手机号后四位
                </Label>
                <Input
                  id="phoneLast4"
                  value={phoneLast4}
                  onChange={(e) => setPhoneLast4(e.target.value)}
                  placeholder="请输入手机号后四位"
                  maxLength={4}
                />
              </div>
              <Button type="submit" className="w-full">
                查询
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Search result */}
        {searched && (
          <>
            {foundOrder ? (
              <OrderStatusCard order={foundOrder} />
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    未找到该订单，请检查订单号是否正确
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Demo hint */}
        <div className="mt-4 text-xs text-muted-foreground">
          演示订单号：JL20260601001、JL20260602002、JL20260603003。刚提交的
          mock 订单也可以直接查询。
        </div>
      </div>
    </PublicLayout>
  );
}
