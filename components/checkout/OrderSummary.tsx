/**
 * OrderSummary - Sticky right-side order summary card for checkout
 *
 * Displays the product being purchased, price, and order status.
 * Sticks to the right side of the checkout page on desktop.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Product } from "@/lib/types";

interface OrderSummaryProps {
  product: Product;
}

export default function OrderSummary({ product }: OrderSummaryProps) {
  return (
    <Card className="sticky top-20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">订单摘要</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Product info */}
        <div>
          <Badge variant="secondary" className="text-xs mb-1.5">
            {product.categoryLabel}
          </Badge>
          <h4 className="font-semibold text-sm text-foreground">
            {product.name}
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            {product.description}
          </p>
        </div>

        <div className="border-t border-border pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">商品价格</span>
            <span className="font-medium">¥{product.price.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">处理时效</span>
            <span>{product.processingTime}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">交付方式</span>
            <span>{product.deliveryLabel}</span>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">支付状态</span>
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
              待付款
            </Badge>
          </div>
          <div className="flex justify-between text-sm mt-2">
            <span className="text-muted-foreground">处理状态</span>
            <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
              处理中
            </Badge>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex justify-between items-center">
            <span className="font-medium text-sm">订单金额</span>
            <span className="text-xl font-bold text-primary">
              ¥{product.price.toFixed(2)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
