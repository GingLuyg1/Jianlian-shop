"use client";

/**
 * Product Detail Page - Shows full product information
 *
 * Displays: title, category, price, stock status, processing time,
 * delivery method, description, purchase notes, FAQ, support card,
 * and 立即购买 button.
 *
 * No cart. No footer. Uses PublicLayout.
 */

import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import PublicLayout from "@/components/layout/PublicLayout";
import SupportCard from "@/components/common/SupportCard";
import { products } from "@/lib/mock-data";
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

  const product = products.find((p) => p.id === productId);

  if (!product) {
    return (
      <PublicLayout>
        <div className="text-center py-20">
          <h2 className="text-lg font-semibold mb-2">商品未找到</h2>
          <p className="text-sm text-muted-foreground mb-4">
            该商品不存在或已下架
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
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main product info - takes 2 columns */}
          <div className="lg:col-span-2 space-y-4">
            {/* Product header card */}
            <Card>
              <CardContent className="p-5">
                <Badge variant="secondary" className="text-xs mb-2">
                  {product.categoryLabel}
                </Badge>
                <h1 className="text-lg font-bold text-foreground mb-3">
                  {product.name}
                </h1>

                {/* Price */}
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-2xl font-bold text-primary">
                    ¥{product.price.toFixed(2)}
                  </span>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-muted/50 rounded-md p-3">
                    <div className="text-xs text-muted-foreground mb-1">
                      库存状态
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        stockColorMap[product.stockStatus]
                      )}
                    >
                      {product.stockLabel}
                    </Badge>
                  </div>
                  <div className="bg-muted/50 rounded-md p-3">
                    <div className="text-xs text-muted-foreground mb-1">
                      处理时效
                    </div>
                    <span className="text-sm font-medium">
                      {product.processingTime}
                    </span>
                  </div>
                  <div className="bg-muted/50 rounded-md p-3">
                    <div className="text-xs text-muted-foreground mb-1">
                      交付方式
                    </div>
                    <span className="text-sm font-medium">
                      {product.deliveryLabel}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Product description */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">商品说明</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {product.detail || product.description}
                </p>
              </CardContent>
            </Card>

            {/* Purchase notes */}
            {product.purchaseNotes && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">购买须知</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {product.purchaseNotes}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* FAQ */}
            {product.faq && product.faq.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">常见问题</CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible>
                    {product.faq.map((item, index) => (
                      <AccordionItem
                        key={index}
                        value={`faq-${index}`}
                      >
                        <AccordionTrigger className="text-sm text-left">
                          {item.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                          {item.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right sidebar: buy button and support */}
          <div className="space-y-4">
            {/* Buy card */}
            <Card className="sticky top-20">
              <CardContent className="p-4">
                <div className="flex items-baseline justify-between mb-4">
                  <span className="text-muted-foreground text-sm">价格</span>
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
                    <Link href={`/checkout?product=${product.id}`}>
                      立即购买
                    </Link>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Support card */}
            <SupportCard
              title="在线客服"
              description="购买前如有疑问，请联系客服咨询"
            />
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
