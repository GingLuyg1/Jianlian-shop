import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePublicSettings } from "@/components/settings/SettingsProvider";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { productImageFallbackSrc, setProductImageFallback } from "./product-ui";

interface ProductCardProps {
  product: Product;
}

const stockColorMap: Record<string, string> = {
  "in-stock": "bg-green-50 text-green-700 border-green-200",
  "low-stock": "bg-amber-50 text-amber-700 border-amber-200",
  "out-of-stock": "bg-red-50 text-red-600 border-red-200",
};

export default function ProductCard({ product }: ProductCardProps) {
  const { settings } = usePublicSettings();
  const isDisabled = product.stockStatus === "out-of-stock" || product.listingStatus !== "active";
  const minPrice = Number(product.metadata?.minPrice ?? product.price);
  const maxPrice = Number(product.metadata?.maxPrice ?? product.price);
  const hasSkus = Boolean(product.metadata?.hasSkus);
  const priceText =
    hasSkus && maxPrice > minPrice
      ? `${settings.currency_symbol}${minPrice.toFixed(2)}-${settings.currency_symbol}${maxPrice.toFixed(2)}`
      : `${settings.currency_symbol}${product.price.toFixed(2)}`;

  return (
    <Card className="border-border transition-all duration-150 hover:scale-[1.01] hover:shadow-md active:scale-[1.02]">
      <CardContent className="p-4">
        <Link href={`/products/${product.id}`} className="block">
          <div className="aspect-square overflow-hidden rounded-xl border bg-white">
            <img
              src={product.imageUrl || productImageFallbackSrc}
              alt={product.name}
              onError={(event) => setProductImageFallback(event.currentTarget)}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Badge variant="secondary" className="max-w-full truncate text-xs">
              {product.categoryLabel}
            </Badge>
            {hasSkus ? (
              <Badge variant="outline" className="text-[10px]">
                多 SKU
              </Badge>
            ) : null}
          </div>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-foreground">{product.name}</h3>
          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-lg font-bold text-primary">{isDisabled ? "已售罄" : priceText}</span>
            {settings.show_original_price && product.originalPrice ? (
              <span className="text-xs text-muted-foreground line-through">
                {settings.currency_symbol}
                {Number(product.originalPrice).toFixed(2)}
              </span>
            ) : null}
          </div>
        </Link>

        <div className="mb-4 mt-3 space-y-1.5">
          {settings.show_stock ? (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">库存状态</span>
              <Badge
                variant="outline"
                className={cn("px-1.5 py-0 text-[10px]", stockColorMap[product.stockStatus])}
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

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-8 text-xs" asChild>
            <Link href={`/products/${product.id}`}>查看详情</Link>
          </Button>
          <Button className="h-8 text-xs" disabled={isDisabled} asChild={!isDisabled}>
            {isDisabled ? "不可购买" : <Link href={`/checkout?product=${product.id}`}>立即购买</Link>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
