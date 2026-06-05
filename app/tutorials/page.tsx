"use client";

/**
 * Tutorials Page - 使用教程
 * Uses PublicLayout. Placeholder page.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PublicLayout from "@/components/layout/PublicLayout";

export default function TutorialsPage() {
  return (
    <PublicLayout>
      <h1 className="text-xl font-bold text-foreground mb-4">使用教程</h1>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">如何使用 Jianlian Shop</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div>
              <h3 className="font-medium text-foreground mb-1">1. 注册账号</h3>
              <p>点击右上角注册按钮，使用手机号或邮箱注册账号。</p>
            </div>
            <div>
              <h3 className="font-medium text-foreground mb-1">2. 选购商品</h3>
              <p>浏览商品分类，选择需要的商品，点击立即购买。</p>
            </div>
            <div>
              <h3 className="font-medium text-foreground mb-1">3. 填写订单</h3>
              <p>根据商品类型填写收货信息或联系信息，提交订单。</p>
            </div>
            <div>
              <h3 className="font-medium text-foreground mb-1">4. 完成支付</h3>
              <p>订单提交后完成支付，等待商品处理和交付。</p>
            </div>
            <div>
              <h3 className="font-medium text-foreground mb-1">5. 查询订单</h3>
              <p>使用订单查询功能随时查看订单状态和交付信息。</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </PublicLayout>
  );
}
