"use client";

/**
 * My Orders Page - Full order history with tabs
 *
 * Order table with tabs: all, pending payment, processing, completed.
 * Shows: order number, product name, amount, payment status,
 * processing status, created time, view details button.
 *
 * Mock data only. Uses PublicLayout. No footer. No cart.
 */

import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PublicLayout from "@/components/layout/PublicLayout";
import OrderTable from "@/components/orders/OrderTable";
import { orders } from "@/lib/mock-data";
import { Order } from "@/lib/types";

export default function MyOrdersPage() {
  const [tab, setTab] = useState("all");
  const [localOrders, setLocalOrders] = useState<Order[]>([]);

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

  const filteredOrders = useMemo(() => {
    if (tab === "all") return allOrders;
    if (tab === "pending")
      return allOrders.filter((o) => o.paymentStatus === "pending");
    if (tab === "processing")
      return allOrders.filter((o) => o.processingStatus === "processing");
    if (tab === "completed")
      return allOrders.filter((o) => o.processingStatus === "completed");
    return allOrders;
  }, [allOrders, tab]);

  return (
    <PublicLayout>
      <h1 className="text-xl font-bold text-foreground mb-4">我的订单</h1>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">订单列表</CardTitle>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs h-6">
                  全部
                </TabsTrigger>
                <TabsTrigger value="pending" className="text-xs h-6">
                  待付款
                </TabsTrigger>
                <TabsTrigger value="processing" className="text-xs h-6">
                  处理中
                </TabsTrigger>
                <TabsTrigger value="completed" className="text-xs h-6">
                  已完成
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <OrderTable orders={filteredOrders} />
        </CardContent>
      </Card>
    </PublicLayout>
  );
}
