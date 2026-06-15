"use client";

/**
 * Admin Product Management Page
 *
 * Shows mock product list with status badges, edit/delist buttons,
 * and add new product button.
 *
 * Fields: name, category, price, status, stock/delivery, actions.
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { products, categories } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const stockColorMap: Record<string, string> = {
  "in-stock": "bg-green-50 text-green-700 border-green-200",
  "low-stock": "bg-amber-50 text-amber-700 border-amber-200",
  "out-of-stock": "bg-red-50 text-red-600 border-red-200",
};

const listingColorMap: Record<string, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  inactive: "bg-slate-50 text-slate-600 border-slate-200",
};

export default function AdminProductsPage() {
  const categoryMap = Object.fromEntries(
    categories.map((c) => [c.id, c.name])
  );

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground">商品管理</h1>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          新增商品
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">商品列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">商品名称</TableHead>
                  <TableHead className="text-xs">商品分类</TableHead>
                  <TableHead className="text-xs">商品价格</TableHead>
                  <TableHead className="text-xs">上架状态</TableHead>
                  <TableHead className="text-xs">库存/交付方式</TableHead>
                  <TableHead className="text-xs text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="text-xs font-medium max-w-[200px] truncate">
                      {product.name}
                    </TableCell>
                    <TableCell className="text-xs">
                      {categoryMap[product.category] || product.categoryLabel}
                    </TableCell>
                    <TableCell className="text-xs">
                      ¥{product.price.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          listingColorMap[product.listingStatus] || ""
                        )}
                      >
                        {product.listingStatus === "active" ? "已上架" : "已下架"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          stockColorMap[product.stockStatus] || ""
                        )}
                      >
                        {product.stockLabel}
                      </Badge>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {product.productType === "physical" ? "实物交付" : "自动/卡密交付"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-6 text-[10px]">
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] text-red-600"
                        >
                          下架
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
