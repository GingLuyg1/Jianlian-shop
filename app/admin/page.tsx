"use client";

/**
 * Admin Dashboard Page - Main admin control panel
 *
 * Shows 5 stat cards and recent order table.
 * Uses AdminLayout (NOT PublicLayout).
 * Mock data only.
 */

import AdminLayout from "@/components/admin/AdminLayout";
import AdminStatsCard from "@/components/admin/AdminStatsCard";
import AdminOrderTable from "@/components/admin/AdminOrderTable";
import { adminStats, adminOrders } from "@/lib/mock-data";
import {
  ClipboardList,
  Clock,
  Loader,
  CheckCircle2,
  DollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminDashboardPage() {
  return (
    <AdminLayout>
      <h1 className="text-xl font-bold text-foreground mb-4">控制台</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <AdminStatsCard
          title="今日订单"
          value={adminStats.todayOrders}
          icon={ClipboardList}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <AdminStatsCard
          title="待付款订单"
          value={adminStats.pendingPaymentOrders}
          icon={Clock}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <AdminStatsCard
          title="待处理订单"
          value={adminStats.pendingProcessingOrders}
          icon={Loader}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <AdminStatsCard
          title="已完成订单"
          value={adminStats.completedOrders}
          icon={CheckCircle2}
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
        <AdminStatsCard
          title="今日销售额"
          value={`¥${adminStats.todayRevenue.toFixed(2)}`}
          icon={DollarSign}
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">最近订单</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminOrderTable orders={adminOrders} />
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
