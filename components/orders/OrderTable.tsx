/**
 * OrderTable - Order listing table with status badges
 *
 * Displays order data in a responsive table format.
 * Shows: order number, product name, amount, payment status,
 * processing status, created time, and view details button.
 */

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

interface OrderTableProps {
  orders: Order[];
  showDetails?: boolean;
}

// Payment status color mapping
const paymentColorMap: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  paid: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-600 border-red-200",
  refunded: "bg-slate-50 text-slate-600 border-slate-200",
};

// Processing status color mapping
const processingColorMap: Record<string, string> = {
  processing: "bg-orange-50 text-orange-700 border-orange-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

export default function OrderTable({
  orders,
  showDetails = true,
}: OrderTableProps) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        暂无订单记录
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">订单号</TableHead>
            <TableHead className="text-xs">商品名称</TableHead>
            <TableHead className="text-xs">金额</TableHead>
            <TableHead className="text-xs">支付状态</TableHead>
            <TableHead className="text-xs">处理状态</TableHead>
            <TableHead className="text-xs">创建时间</TableHead>
            {showDetails && (
              <TableHead className="text-xs text-right">操作</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="text-xs font-mono">
                {order.orderNo}
              </TableCell>
              <TableCell className="text-xs max-w-[200px] truncate">
                {order.productName}
              </TableCell>
              <TableCell className="text-xs font-medium">
                ¥{order.amount.toFixed(2)}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0",
                    paymentColorMap[order.paymentStatus] || ""
                  )}
                >
                  {order.paymentStatusLabel}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0",
                    processingColorMap[order.processingStatus] || ""
                  )}
                >
                  {order.processingStatusLabel}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {order.createdAt}
              </TableCell>
              {showDetails && (
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                    <Link href={`/order-tracking?id=${order.orderNo}`}>
                      查看详情
                    </Link>
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
