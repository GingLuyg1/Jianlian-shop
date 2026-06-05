"use client";

/**
 * Order Success Page - Shown after order submission
 *
 * Displays: order number, product name, amount, payment status (待付款),
 * processing status (处理中), and action buttons.
 *
 * Uses PublicLayout. No cart. No footer.
 */

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, ClipboardList, Home } from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";

export default function OrderSuccessPage() {
  const searchParams = useSearchParams();
  const orderNo = searchParams.get("orderNo") || "JL0000000000";
  const productName = searchParams.get("product") || "未知商品";
  const amount = parseFloat(searchParams.get("amount") || "0");

  return (
    <PublicLayout>
      <div className="max-w-lg mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            {/* Success icon */}
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>

            <h1 className="text-xl font-bold text-foreground mb-4">
              订单提交成功
            </h1>

            {/* Order info */}
            <div className="space-y-3 text-left mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">订单号</span>
                <span className="font-mono font-medium">{orderNo}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">商品名称</span>
                <span className="font-medium">{productName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">订单金额</span>
                <span className="font-bold text-primary">
                  ¥{amount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">支付状态</span>
                <Badge
                  variant="outline"
                  className="text-xs bg-amber-50 text-amber-700 border-amber-200"
                >
                  待付款
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">处理状态</span>
                <Badge
                  variant="outline"
                  className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                >
                  处理中
                </Badge>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 justify-center">
              <Button variant="outline" asChild>
                <Link href={`/order-tracking?id=${orderNo}`}>
                  <ClipboardList className="h-4 w-4 mr-2" />
                  查询订单
                </Link>
              </Button>
              <Button asChild>
                <Link href="/">
                  <Home className="h-4 w-4 mr-2" />
                  返回首页
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
