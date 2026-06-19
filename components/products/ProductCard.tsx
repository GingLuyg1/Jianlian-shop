"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  getDeliveryLabel,
  isPurchasableProduct,
  normalizeProductStatus,
} from "@/lib/catalog/product-status";
import type { PublicProductRow } from "@/lib/supabase/public-catalog";
import { cn } from "@/lib/utils";
import ProductImage from "./ProductImage";
import ProductStatusBadge from "./ProductStatusBadge";

export default function ProductCard({
  categoryPath,
  product,
}: {
  categoryPath?: string;
  product: PublicProductRow;
}) {
  const status = normalizeProductStatus(product.status);
  const canBuy = isPurchasableProduct(product);

  return (
    <Link href={`/products/${product.id}`} className="group block h-full">
      <Card className="h-full overflow-hidden border-slate-100 bg-white transition hover:border-primary/25 hover:shadow-sm">
        <CardContent className="flex h-full flex-col p-4">
          <div className="overflow-hidden rounded-xl border bg-white">
            <ProductImage
              src={product.image_url}
              alt={product.name}
              className="transition duration-150 group-hover:scale-[1.02]"
            />
          </div>

          <div className="mt-3 flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2">
              {categoryPath ? (
                <Badge variant="secondary" className="max-w-full truncate text-[11px] font-normal">
                  {categoryPath}
                </Badge>
              ) : null}
              {status === "sold_out" ? (
                <Badge
                  variant="outline"
                  className="border-orange-200 bg-orange-50 text-[11px] text-orange-700"
                >
                  已售罄
                </Badge>
              ) : null}
            </div>

            <h3 className="mt-2 line-clamp-2 min-h-[44px] text-sm font-semibold leading-[22px] text-slate-900">
              {product.name}
            </h3>
            <p className="mt-1 line-clamp-2 min-h-[38px] text-xs leading-[19px] text-muted-foreground">
              {product.short_description || "下单前请核对商品说明、地区、库存与售后规则。"}
            </p>

            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-black text-primary">
                  ¥{Number(product.price).toFixed(2)}
                </div>
                {product.original_price ? (
                  <div className="text-xs text-muted-foreground line-through">
                    ¥{Number(product.original_price).toFixed(2)}
                  </div>
                ) : null}
              </div>
              <ProductStatusBadge status={product.status} stock={Number(product.stock ?? 0)} />
            </div>

            <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
              <span className="truncate">{getDeliveryLabel(product.delivery_type)}</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-medium",
                  canBuy ? "text-primary" : "text-slate-400"
                )}
              >
                {canBuy ? "查看购买" : "不可购买"}
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
