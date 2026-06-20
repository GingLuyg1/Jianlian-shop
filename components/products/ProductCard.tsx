"use client";

/**
 * ProductCard - Displays a single product in the mall
 *
 * Shows: name, category badge, description, price, stock status,
 * processing time, delivery method, and 立即购买 button.
 * Does NOT show add-to-cart button (no cart system).
 */

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePublicSettings } from "@/components/settings/SettingsProvider";
import { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: Product;
}

// Stock status color mapping
const stockColorMap: Record<string, string> = {
  "in-stock": "bg-green-50 text-green-700 border-green-200",
  "low-stock": "bg-amber-50 text-amber-700 border-amber-200",
  "out-of-stock": "bg-red-50 text-red-600 border-red-200",
};

export default function ProductCard({ product }: ProductCardProps) {
  const { settings } = usePublicSettings();
  const isDisabled =
    product.stockStatus === "out-of-stock" ||
    product.listingStatus !== "active";

  return (
    <Card className="hover:scale-[1.01] active:scale-[1.02] hover:shadow-md transition-all duration-150 border-border">
      <CardContent className="p-4">
        {/* Category badge */}
        <Badge variant="secondary" className="text-xs mb-2">
          {product.categoryLabel}
        </Badge>

        {/* Product name */}
        <h3 className="font-semibold text-sm text-foreground mb-1.5 line-clamp-2">
          {product.name}
        </h3>

        {/* Description */}
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
          {product.description}
        </p>

        {/* Price */}
        <div className="flex items-baseline gap-1 mb-3">
          <span className="text-lg font-bold text-primary">
            {settings.currency_symbol}{product.price.toFixed(2)}
          </span>
          {settings.show_original_price && product.originalPrice ? (
            <span className="text-xs text-muted-foreground line-through">
              {settings.currency_symbol}{Number(product.originalPrice).toFixed(2)}
            </span>
          ) : null}
        </div>

        {/* Info row: stock, processing time, delivery */}
        <div className="space-y-1.5 mb-4">
          {settings.show_stock ? (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">库存状态</span>
              <Badge
                variant="outline"
                className={cn("text-[10px] px-1.5 py-0", stockColorMap[product.stockStatus])}
              >
                {product.stockLabel}
              </Badge>
            </div>
          ) : null}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">处理时效</span>
            <span className="text-foreground">{product.processingTime}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">交付方式</span>
            <span className="text-foreground">{product.deliveryLabel}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-8 text-xs" asChild>
            <Link href={`/products/${product.id}`}>查看详情</Link>
          </Button>
          <Button
            className="h-8 text-xs"
            disabled={isDisabled}
            asChild={!isDisabled}
          >
            {isDisabled ? (
              product.listingStatus !== "active" ? "不可购买" : "已售罄"
            ) : (
              <Link href={`/checkout?product=${product.id}`}>立即购买</Link>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
