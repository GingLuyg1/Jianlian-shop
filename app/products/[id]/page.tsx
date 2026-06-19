"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Headphones,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import SupportCard from "@/components/common/SupportCard";
import PublicLayout from "@/components/layout/PublicLayout";
import CategoryBreadcrumb from "@/components/products/CategoryBreadcrumb";
import ProductImage from "@/components/products/ProductImage";
import ProductStatusBadge from "@/components/products/ProductStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCategoryPath } from "@/lib/catalog/category-tree";
import {
  getDeliveryLabel,
  getProductUnavailableReason,
  isPurchasableProduct,
  normalizeProductStatus,
} from "@/lib/catalog/product-status";
import {
  getErrorText,
  getProductByIdOrSlug,
  listPublicCategories,
  type PublicCategory,
  type PublicProductRow,
} from "@/lib/supabase/public-catalog";
import { cn } from "@/lib/utils";

const PRIMARY_ROUTE_FALLBACK: Record<string, string> = {
  "sim-cards": "sim-cards",
  "gift-cards": "gift-cards",
  "digital-accounts": "digital-accounts",
  "ai-membership": "ai-membership",
  "sms-code": "sms-code",
};

function getPrimaryRoute(path: PublicCategory[]) {
  const primary = path[0];
  if (!primary) return "/";
  return `/products/${PRIMARY_ROUTE_FALLBACK[primary.slug] ?? primary.slug}`;
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const routeId = params?.id;
  const productIdentifier = Array.isArray(routeId) ? routeId[0] : routeId;

  const [product, setProduct] = useState<PublicProductRow | null>(null);
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");

  const loadProduct = async () => {
    if (!productIdentifier) {
      setError("缺少商品标识。");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [productRow, categoryRows] = await Promise.all([
        getProductByIdOrSlug(productIdentifier, { activeOnly: true }),
        listPublicCategories(),
      ]);

      const productCategoryIsVisible = productRow?.category_id
        ? categoryRows.some((category) => category.id === productRow.category_id)
        : true;

      setProduct(productCategoryIsVisible ? productRow : null);
      setCategories(categoryRows);
    } catch (loadError) {
      setError(getErrorText(loadError, "商品详情读取失败，请稍后重试。"));
      setProduct(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIdentifier]);

  const categoryPath = useMemo(
    () => getCategoryPath(categories, product?.category_id ?? null),
    [categories, product?.category_id]
  );
  const unavailableMessage = getProductUnavailableReason(product);
  const canBuy = isPurchasableProduct(product);
  const status = normalizeProductStatus(product?.status);

  const handleBuy = () => {
    if (!product || !canBuy || buying) return;
    setBuying(true);
    router.push(`/checkout?product=${product.id}`);
  };

  return (
    <PublicLayout>
      <div className="max-w-6xl">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          返回上一页
        </button>

        {loading ? (
          <Card>
            <CardContent className="p-8">
              <div className="h-6 w-48 animate-pulse rounded bg-slate-100" />
              <div className="mt-4 h-44 animate-pulse rounded-xl bg-slate-100" />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
              </div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
              <h1 className="mt-4 text-lg font-bold">商品读取失败</h1>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              <Button className="mt-5" onClick={loadProduct}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重新加载
              </Button>
            </CardContent>
          </Card>
        ) : !product ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="mx-auto h-10 w-10 text-amber-500" />
              <h1 className="mt-4 text-lg font-bold">商品不存在或已被删除</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                请返回商品列表重新选择。
              </p>
              <Button className="mt-5" asChild>
                <Link href="/">返回商城</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <Card>
                <CardContent className="grid gap-5 p-5 sm:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="overflow-hidden rounded-2xl border bg-white">
                    <ProductImage
                      src={product.image_url}
                      alt={product.name}
                      className="aspect-square"
                    />
                  </div>
                  <div className="min-w-0">
                    <CategoryBreadcrumb
                      items={categoryPath}
                      onSelect={(category) => {
                        const route = getPrimaryRoute(categoryPath);
                        router.push(`${route}?category=${encodeURIComponent(category.slug)}`);
                      }}
                    />
                    <h1 className="mt-3 text-2xl font-black leading-tight text-slate-950">
                      {product.name}
                    </h1>
                    {product.short_description ? (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {product.short_description}
                      </p>
                    ) : null}
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <span className="text-3xl font-black text-primary">
                        ¥{Number(product.price).toFixed(2)}
                      </span>
                      {product.original_price ? (
                        <span className="text-sm text-muted-foreground line-through">
                          ¥{Number(product.original_price).toFixed(2)}
                        </span>
                      ) : null}
                      <ProductStatusBadge
                        status={product.status}
                        stock={Number(product.stock ?? 0)}
                      />
                      {status === "sold_out" ? (
                        <Badge
                          variant="outline"
                          className="border-orange-200 bg-orange-50 text-orange-700"
                        >
                          已售罄
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">购买前说明</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
                  <p>
                    {product.short_description ||
                      "请在下单前核对商品说明、地区、库存和售后规则。"}
                  </p>
                  <div className="rounded-xl bg-primary/5 p-4 text-primary">
                    如需补货、批量购买或不确定商品是否适合，请先联系在线客服确认。
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <InfoItem icon={ShieldCheck} title="安全合规" desc="下单前请核对用途" />
                    <InfoItem icon={PackageCheck} title="交付方式" desc={getDeliveryLabel(product.delivery_type)} />
                    <InfoItem icon={Headphones} title="售后支持" desc="有疑问请联系客服" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="sticky top-20">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">商品价格</span>
                    <span className="text-2xl font-black text-primary">
                      ¥{Number(product.price).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">交付方式</span>
                    <span className="font-medium">
                      {getDeliveryLabel(product.delivery_type)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">当前库存</span>
                    <span
                      className={cn(
                        "font-bold",
                        Number(product.stock) > 0 ? "text-green-600" : "text-slate-400"
                      )}
                    >
                      {Number(product.stock ?? 0)}
                    </span>
                  </div>

                  {unavailableMessage ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                      {unavailableMessage}
                    </div>
                  ) : null}

                  <Button
                    className="w-full"
                    disabled={!canBuy || buying}
                    onClick={handleBuy}
                  >
                    {buying ? "正在进入结算..." : canBuy ? "立即购买" : "不可购买"}
                  </Button>
                </CardContent>
              </Card>

              <SupportCard
                title="在线客服"
                description="购买前如需确认库存、地区或交付方式，请先联系客服。"
              />
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}

function InfoItem({
  icon: Icon,
  title,
  desc,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <Icon className="mb-2 h-5 w-5 text-primary" />
      <div className="font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
    </div>
  );
}
