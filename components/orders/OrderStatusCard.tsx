/**
 * OrderStatusCard - Individual order status display card
 *
 * Used on order tracking and order success pages to show
 * a single order's full status information.
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

const paymentColorMap: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  paid: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-600 border-red-200",
  refunded: "bg-slate-50 text-slate-600 border-slate-200",
};

const processingColorMap: Record<string, string> = {
  processing: "bg-orange-50 text-orange-700 border-orange-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

interface OrderStatusCardProps {
  order: Order;
}

export default function OrderStatusCard({ order }: OrderStatusCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>订单信息</span>
          <span className="text-sm font-mono text-muted-foreground">
            {order.orderNo}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">商品名称</span>
            <span className="font-medium">{order.productName}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">订单金额</span>
            <span className="font-bold text-primary">
              ¥{order.amount.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">支付状态</span>
            <Badge
              variant="outline"
              className={cn(
                "text-xs px-2 py-0.5",
                paymentColorMap[order.paymentStatus] || ""
              )}
            >
              {order.paymentStatusLabel}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">处理状态</span>
            <Badge
              variant="outline"
              className={cn(
                "text-xs px-2 py-0.5",
                processingColorMap[order.processingStatus] || ""
              )}
            >
              {order.processingStatusLabel}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">创建时间</span>
            <span>{order.createdAt}</span>
          </div>
          {order.shippingInfo && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {order.productType === "physical" ? "发货信息" : "处理备注"}
              </span>
              <span className="text-right max-w-[200px]">{order.shippingInfo}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
