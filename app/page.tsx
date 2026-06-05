"use client";

/**
 * Homepage - Dashboard-style landing page for Jianlian Shop
 *
 * Sections:
 * 1. Welcome account card (guest state)
 * 2. Main blue technology banner
 * 3. Quick category cards
 * 4. Product mall, recent orders, and support sections are handled by
 *    dedicated pages instead of the homepage.
 *
 * Mock data is used throughout.
 * Future Supabase integration: replace mock imports with real data queries.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LogIn,
  UserPlus,
  CreditCard,
  ShoppingCart,
  ClipboardList,
} from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import CategoryCard from "@/components/products/CategoryCard";
import { categories, mockGuest } from "@/lib/mock-data";

export default function HomePage() {
  return (
    <PublicLayout>
      <Card className="mb-6 border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-base text-foreground">
                Hi，欢迎来到 Jianlian Shop
              </h2>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                <span>
                  当前身份：
                  <Badge variant="outline" className="text-xs ml-1">
                    {mockGuest.roleLabel}
                  </Badge>
                </span>
                <span>
                  当前余额：
                  <span className="font-medium text-foreground">
                    ¥{mockGuest.balance.toFixed(2)}
                  </span>
                </span>
                <span>
                  订单数量：
                  <span className="font-medium text-foreground">
                    {mockGuest.orderCount}
                  </span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" asChild>
                <Link href="/login">
                  <LogIn className="h-3.5 w-3.5 mr-1" />
                  登录
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/register">
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  注册
                </Link>
              </Button>
              <Button variant="outline" size="sm" disabled>
                <CreditCard className="h-3.5 w-3.5 mr-1" />
                充值
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6 overflow-hidden border-orange-100 bg-gradient-to-r from-orange-100 via-amber-50 to-white">
        <CardContent className="relative p-6 md:p-8">
          <div className="relative z-10">
            <h1 className="mb-2 text-xl font-bold text-slate-950 md:text-2xl">
              全球数字商品与通信服务商城
            </h1>
            <p className="mb-4 max-w-lg text-sm text-muted-foreground">
              国际电话卡、礼品卡、数字账号服务、AI会员充值，一站式下单处理
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                className="bg-white text-primary hover:bg-orange-50"
                asChild
              >
                <Link href="/products/sim-cards">
                  <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                  立即选购
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-primary/25 bg-white/60 text-primary hover:bg-white"
                asChild
              >
                <Link href="/order-tracking">
                  <ClipboardList className="h-3.5 w-3.5 mr-1" />
                  查询订单
                </Link>
              </Button>
            </div>
          </div>
          <div className="absolute right-0 top-0 h-32 w-32 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary/10" />
          <div className="absolute bottom-0 right-20 h-20 w-20 translate-y-1/2 rounded-full bg-amber-200/30" />
        </CardContent>
      </Card>

      <div className="mb-6">
        <h2 className="font-semibold text-base mb-3">商品分类</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {categories.map((cat) => (
            <CategoryCard key={cat.id} category={cat} />
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}
