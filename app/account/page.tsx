"use client";

/**
 * Account Center Page - User profile and account overview
 *
 * Shows: user profile card, balance card, order count card,
 * recent orders card, recharge button placeholder, contact support button.
 *
 * Mock data only. Uses PublicLayout. No footer. No cart.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Wallet,
  ClipboardList,
  CreditCard,
  Headphones,
} from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import OrderTable from "@/components/orders/OrderTable";
import { mockUser, orders } from "@/lib/mock-data";
import { Order } from "@/lib/types";

export default function AccountPage() {
  const user = mockUser;
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

  return (
    <PublicLayout>
      <h1 className="text-xl font-bold text-foreground mb-4">账号中心</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* User profile card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-medium text-sm">{user.phone || user.email}</div>
                <Badge variant="outline" className="text-xs mt-0.5">
                  {user.roleLabel}
                </Badge>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              <div>手机：{user.phone || "未设置"}</div>
              <div>邮箱：{user.email || "未设置"}</div>
            </div>
          </CardContent>
        </Card>

        {/* Balance card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">当前余额</div>
                <div className="text-lg font-bold text-foreground">
                  ¥{user.balance.toFixed(2)}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-full h-7 text-xs" disabled>
              <CreditCard className="h-3 w-3 mr-1" />
              充值
            </Button>
          </CardContent>
        </Card>

        {/* Order count card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">订单数量</div>
                <div className="text-lg font-bold text-foreground">
                  {user.orderCount + localOrders.length}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-full h-7 text-xs" asChild>
              <Link href="/account/orders">查看订单</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent orders */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">最近订单</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
              <Link href="/account/orders">查看全部</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <OrderTable orders={allOrders.slice(0, 5)} />
        </CardContent>
      </Card>

      {/* Contact support */}
      <Button variant="outline" className="w-full h-10" asChild>
        <a href="mailto:support@jianlian.shop">
          <Headphones className="h-4 w-4 mr-2" />
          联系客服
        </a>
      </Button>
    </PublicLayout>
  );
}
