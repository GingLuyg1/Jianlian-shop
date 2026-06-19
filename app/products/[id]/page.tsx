"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PublicLayout from "@/components/layout/PublicLayout";
import SupportCard from "@/components/common/SupportCard";
import {
  getActiveProductByIdOrSlug,
  getErrorText,
  mapPublicProductToProduct,
} from "@/lib/supabase/public-catalog";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

const stockColorMap: Record<string, string> = {
  "in-stock": "bg-green-50 text-green-700 border-green-200",
  "low-stock": "bg-amber-50 text-amber-700 border-amber-200",
  "out-of-stock": "bg-red-50 text-red-600 border-red-200",
};

export default function ProductDetailPage() {
  const params = useParams();
  const routeId = params?.id;
  const productId = Array.isArray(routeId) ? routeId[0] : routeId;
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadProduct() {
      if (!productId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");
      try {
        const row = await getActiveProductByIdOrSlug(productId);
        if (!mounted) return;
        setProduct(
          row
            ? mapPublicProductToProduct(row, "digital-accounts", "商品详情")
            : null
        );
      } catch (loadError) {
        if (!mounted) return;
        setError(getErrorText(loadError, "商品详情读取失败，请稍后重试"));
        setProduct(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadProduct();

    return () => {
      mounted = false;
    };
  }, [productId]);

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="max-w-4xl space-y-4">
          <div className="h-5 w-52 animate-pulse rounded bg-slate-100" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <div className="h-44 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
            </div>
            <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (!product) {
    return (
      <PublicLayout>
        <div className="py-20 text-center">
          <h2 className="mb-2 text-lg font-semibold">商品未找到</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {error || "该商品不存在或已下架"}
          </p>
          <Button asChild>
            <Link href="/">返回首页</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  const isDisabled = product.stockStatus === "out-of-stock";

  return (
    <PublicLayout>
      <div className="max-w-4xl">
        <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            首页
          </Link>
          <span>/</span>
          <Link
            href={`/products/${product.category}`}
            className="hover:text-foreground"
          >
            {product.categoryLabel}
          </Link>
          <span>/</span>
          <span className="text-foreground">{product.name}</span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardContent className="p-5">
                <Badge variant="secondary" className="mb-2 text-xs">
                  {product.categoryLabel}
                </Badge>
                <h1 className="mb-3 text-lg font-bold text-foreground">
                  {product.name}
                </h1>

                <div className="mb-4 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-primary">
                    ¥{product.price.toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <InfoBlock title="库存状态">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        stockColorMap[product.stockStatus]
                      )}
                    >
                      {product.stockLabel}
                    </Badge>
                  </InfoBlock>
                  <InfoBlock title="处理时效">
                    <span className="text-sm font-medium">
                      {product.processingTime}
                    </span>
                  </InfoBlock>
                  <InfoBlock title="交付方式">
                    <span className="text-sm font-medium">
                      {product.deliveryLabel}
                    </span>
                  </InfoBlock>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">商品说明</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {product.detail || product.description || "暂无商品说明"}
                </p>
              </CardContent>
            </Card>

            {product.purchaseNotes ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">购买须知</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {product.purchaseNotes}
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="space-y-4">
            <Card className="sticky top-20">
              <CardContent className="p-4">
                <div className="mb-4 flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">价格</span>
                  <span className="text-xl font-bold text-primary">
                    ¥{product.price.toFixed(2)}
                  </span>
                </div>
                <Button
                  className="w-full"
                  disabled={isDisabled}
                  asChild={!isDisabled}
                >
                  {isDisabled ? (
                    "暂时缺货"
                  ) : (
                    <Link href={`/checkout?product=${product.id}`}>立即购买</Link>
                  )}
                </Button>
              </CardContent>
            </Card>

            <SupportCard
              title="在线客服"
              description="购买前如有疑问，请先联系客服确认库存和适用范围。"
            />
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

function InfoBlock({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <div className="mb-1 text-xs text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}
