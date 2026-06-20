"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Headphones,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import SupportCard from "@/components/common/SupportCard";
import { usePublicSettings } from "@/components/settings/SettingsProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getErrorText,
  getProductByIdOrSlug,
  listPublicCategories,
  type PublicCategory,
  type PublicProductRow,
} from "@/lib/supabase/public-catalog";
import { cn } from "@/lib/utils";
import {
  productImageFallbackSrc,
  setProductImageFallback,
} from "@/components/products/product-ui";

function getCategoryPath(categories: PublicCategory[], categoryId: string | null) {
  if (!categoryId) return "";

  const byId = new Map(categories.map((category) => [category.id, category]));
  const path: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(categoryId) ?? null;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) ?? null : null;
  }

  return path.join(" / ");
}

function getDeliveryLabel(deliveryType: string | null | undefined) {
  if (deliveryType === "automatic") return "自动发货";
  if (deliveryType === "shipping") return "物流发货";
  if (deliveryType === "card") return "卡密交付";
  if (deliveryType === "account") return "账号交付";
  return "人工处理";
}

function getUnavailableMessage(product: PublicProductRow | null) {
  if (!product) return "";
  if (product.status === "sold_out" || Number(product.stock ?? 0) <= 0) {
    return "该商品已售罄";
  }
  if (product.status !== "active") return "该商品目前不可购买";
  return "";
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { settings } = usePublicSettings();
  const routeId = params?.id;
  const productIdentifier = Array.isArray(routeId) ? routeId[0] : routeId;
  const [product, setProduct] = useState<PublicProductRow | null>(null);
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProduct = async () => {
    if (!productIdentifier) {
      setError("缺少商品标识");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [productRow, categoryRows] = await Promise.all([
        getProductByIdOrSlug(productIdentifier),
        listPublicCategories(),
      ]);
      setProduct(productRow);
      setCategories(categoryRows);
    } catch (loadError) {
      setError(getErrorText(loadError, "商品详情读取失败，请稍后重试"));
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
  const unavailableMessage = getUnavailableMessage(product);
  const canBuy = Boolean(product && !unavailableMessage);

  return (
    <PublicLayout>
      <div className="max-w-5xl">
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
              <div className="mt-4 h-32 animate-pulse rounded-xl bg-slate-100" />
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
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5">
              <Card>
                <CardContent className="grid gap-5 p-5 sm:grid-cols-[160px_minmax(0,1fr)]">
                  <div className="aspect-square overflow-hidden rounded-2xl border bg-white">
                    <img
                      src={product.image_url || productImageFallbackSrc}
                      alt={product.name}
                      className="h-full w-full object-cover"
                      onError={(event) =>
                        setProductImageFallback(event.currentTarget)
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    {categoryPath ? (
                      <div className="mb-2 text-xs text-muted-foreground">
                        {categoryPath}
                      </div>
                    ) : null}
                    <h1 className="text-2xl font-black leading-tight text-slate-950">
                      {product.name}
                    </h1>
                    {product.short_description ? (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {product.short_description}
                      </p>
                    ) : null}
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <span className="text-3xl font-black text-primary">
                        {settings.currency_symbol}{Number(product.price).toFixed(2)}
                      </span>
                      {settings.show_original_price && product.original_price ? (
                        <span className="text-sm text-muted-foreground line-through">
                          {settings.currency_symbol}{Number(product.original_price).toFixed(2)}
                        </span>
                      ) : null}
                      {settings.show_stock ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            Number(product.stock) > 0
                              ? "border-green-200 bg-green-50 text-green-700"
                              : "border-slate-200 bg-slate-50 text-slate-500"
                          )}
                        >
                          库存：{Number(product.stock ?? 0)}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">商品说明</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
                  <p>
                    {product.description ||
                      product.short_description ||
                      "请下单前核对商品说明、地区、库存和售后规则。"}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <InfoItem icon={ShieldCheck} title="安全合规" desc="下单前请核对用途" />
                    <InfoItem icon={PackageCheck} title="交付方式" desc={getDeliveryLabel(product.delivery_type)} />
                    <InfoItem icon={Headphones} title="售后支持" desc="有疑问请联系客服" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">购买前须知</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm leading-7 text-muted-foreground">
                  <p>1. 下单前请核对商品名称、分类路径、库存状态和交付方式。</p>
                  <p>2. 账号类商品售后期为商品发货 24 小时内，拿到账号后请第一时间检查。</p>
                  <p>3. 如需补货、批量购买或不确定商品是否适合，请先联系客服确认。</p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="sticky top-20">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">商品价格</span>
                    <span className="text-2xl font-black text-primary">
                      {settings.currency_symbol}{Number(product.price).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">交付方式</span>
                    <span className="font-medium">
                      {getDeliveryLabel(product.delivery_type)}
                    </span>
                  </div>
                  {settings.show_stock ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">当前库存</span>
                      <span
                        className={cn(
                          "font-bold",
                          Number(product.stock) > 0
                            ? "text-green-600"
                            : "text-slate-400"
                        )}
                      >
                        {Number(product.stock ?? 0)}
                      </span>
                    </div>
                  ) : null}

                  {unavailableMessage ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                      {unavailableMessage}
                    </div>
                  ) : null}

                  <Button
                    className="w-full"
                    disabled={!canBuy}
                    asChild={canBuy}
                  >
                    {canBuy ? (
                      <Link href={`/checkout?product=${product.id}`}>
                        立即购买
                      </Link>
                    ) : (
                      "不可购买"
                    )}
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
  icon: typeof CheckCircle2;
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
