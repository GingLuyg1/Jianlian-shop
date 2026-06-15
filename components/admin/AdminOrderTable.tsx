/**
 * AdminOrderTable - Detailed admin order table with all fields
 *
 * Shows: order number, user email/contact, product, amount, status,
 * created time, and action buttons.
 */

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
import { AdminOrder } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AdminOrderTableProps {
  orders: AdminOrder[];
}

const paymentColorMap: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  paid: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-600 border-red-200",
  refunded: "bg-slate-50 text-slate-600 border-slate-200",
};

const processingColorMap: Record<string, string> = {
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

export default function AdminOrderTable({ orders }: AdminOrderTableProps) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        暂无订单数据
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">订单号</TableHead>
            <TableHead className="text-xs">用户邮箱</TableHead>
            <TableHead className="text-xs">商品</TableHead>
            <TableHead className="text-xs">金额</TableHead>
            <TableHead className="text-xs">状态</TableHead>
            <TableHead className="text-xs">创建时间</TableHead>
            <TableHead className="text-xs text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="text-xs font-mono">
                {order.orderNo}
              </TableCell>
              <TableCell className="text-xs">{order.customerContact}</TableCell>
              <TableCell className="text-xs max-w-[180px] truncate">
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
                <Badge
                  variant="outline"
                  className={cn(
                    "ml-1 text-[10px] px-1.5 py-0",
                    processingColorMap[order.processingStatus] || ""
                  )}
                >
                  {order.processingStatusLabel}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {order.createdAt}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]">
                    详情
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]">
                    处理
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
