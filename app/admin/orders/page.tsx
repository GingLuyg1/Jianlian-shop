"use client";

/**
 * Admin Order Management Page
 *
 * Full admin order table with all fields and action buttons.
 * Uses AdminLayout. Mock data only.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminOrderTable from "@/components/admin/AdminOrderTable";
import { adminOrders } from "@/lib/mock-data";

export default function AdminOrdersPage() {
  return (
    <AdminLayout>
      <h1 className="text-xl font-bold text-foreground mb-4">订单管理</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">订单列表</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminOrderTable orders={adminOrders} />
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
