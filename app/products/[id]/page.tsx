"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Headphones,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import SupportCard from "@/components/common/SupportCard";
import PublicLayout from "@/components/layout/PublicLayout";
import { usePublicSettings } from "@/components/settings/SettingsProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getErrorText,
  getProductByIdOrSlug,
  listPublicCategories,
  searchPublicCatalogProducts,
  type PublicCategory,
  type PublicCatalogProductRow,
  type PublicProductRow,
} from "@/lib/supabase/public-catalog";
import { cn } from "@/lib/utils";

const productImageFallbackSrc = "/assets/jianlian-brand-logo.png";

function setProductImageFallback(image: HTMLImageElement) {
  if (image.src.endsWith(productImageFallbackSrc)) return;
  image.src = productImageFallbackSrc;
}

function getCategoryPath(categories: PublicCategory[], categoryId: string | null) {
  if (!categoryId) return "未分类";
  const byId = new Map(categories.map((category) => [category.id, category]));
  const path: string[] = [];
  let current = byId.get(categoryId) ?? null;
  const seen = new Set<string>();

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) ?? null : null;
  }

  return path.join(" / ") || "未分类";
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
  if (product.status === "sold_out" || Number(product.stock ?? 0) <= 0) return "该商品已售罄";
  if (product.status !== "active") return "该商品目前不可购买";
  return "";
}

function getRecommendationQuery(categories: PublicCategory[], product: PublicProductRow) {
  const currentCategory = categories.find((category) => category.id === product.category_id);
  if (!currentCategory) return {};
  if (currentCategory.level === 1) return { primaryCategoryId: currentCategory.id };
  if (currentCategory.level === 2) {
    return {
      primaryCategoryId: currentCategory.parent_id ?? "",
      secondaryCategoryId: currentCategory.id,
    };
  }
  return { primaryCategoryId: currentCategory.parent_id ?? "" };
}

export default function ProductDetailPage() {
  const params = useParams();
  const { settings } = usePublicSettings();
  const routeId = params?.id;
  const productIdentifier = Array.isArray(routeId) ? routeId[0] : routeId;
  const [product, setProduct] = useState<PublicProductRow | null>(null);
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [recommendations, setRecommendations] = useState<PublicCatalogProductRow[]>([]);
  const [recommendationError, setRecommendationError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadProduct() {
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
  }

  useEffect(() => {
    void loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIdentifier]);

  useEffect(() => {
    let mounted = true;

    async function loadRecommendations() {
      if (!product?.category_id || categories.length === 0) {
        setRecommendations([]);
        return;
      }

      setRecommendationError("");
      try {
        const result = await searchPublicCatalogProducts({
          ...getRecommendationQuery(categories, product),
          pageSize: 4,
          excludeId: product.id,
        });
        if (!mounted) return;
        setRecommendations(result.products);
      } catch {
        if (!mounted) return;
        setRecommendationError("推荐商品加载失败");
        setRecommendations([]);
      }
    }

    void loadRecommendations();

    return () => {
      mounted = false;
    };
  }, [categories, product]);

  const categoryPath = useMemo(() => getCategoryPath(categories, product?.category_id ?? null), [categories, product]);
  const unavailableMessage = getUnavailableMessage(product);
  const canBuy = Boolean(product && !unavailableMessage);

  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-[1360px] px-4 py-5 lg:px-7">
        <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
          返回商城
        </Link>

        {loading ? (
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="h-8 w-52 animate-pulse rounded bg-slate-100" />
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="aspect-[16/9] animate-pulse rounded-2xl bg-slate-100" />
                <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
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
              <p className="mt-2 text-sm text-muted-foreground">请返回商品列表重新选择。</p>
              <Button className="mt-5" asChild>
                <Link href="/">返回商城</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <Card>
                <CardContent className="p-5">
                  <div className="grid gap-5 md:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="aspect-square overflow-hidden rounded-2xl border bg-slate-50">
                      <img
                        src={product.image_url || productImageFallbackSrc}
                        alt={product.name}
                        onError={(event) => setProductImageFallback(event.currentTarget)}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{categoryPath}</Badge>
                        <Badge variant="secondary">{getDeliveryLabel(product.delivery_type)}</Badge>
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
                      <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">{product.name}</h1>
                      <p className="mt-3 text-base leading-7 text-muted-foreground">
                        {product.short_description || product.description || "请下单前核对商品说明、库存和售后规则。"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">商品说明</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
                  <p>{product.description || product.short_description || "请下单前核对商品说明、地区、库存和售后规则。"}</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <InfoItem icon={ShieldCheck} title="安全合规" desc="请确认商品用途符合当地规则" />
                    <InfoItem icon={PackageCheck} title="交付方式" desc={getDeliveryLabel(product.delivery_type)} />
                    <InfoItem icon={Headphones} title="售后支持" desc="遇到问题请及时联系客服" />
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">推荐商品</CardTitle>
                </CardHeader>
                <CardContent>
                  {recommendationError ? (
                    <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      {recommendationError}
                    </div>
                  ) : recommendations.length === 0 ? (
                    <div className="rounded-xl border border-dashed bg-slate-50 px-4 py-6 text-center text-sm text-muted-foreground">
                      暂无相关推荐
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {recommendations.map((item) => (
                        <Link
                          key={item.id}
                          href={`/products/${item.id}`}
                          className="group flex min-w-0 gap-3 rounded-xl border bg-white p-3 transition-colors hover:border-primary/30 hover:bg-primary/5"
                        >
                          <img
                            src={item.image_url || productImageFallbackSrc}
                            alt={item.name}
                            onError={(event) => setProductImageFallback(event.currentTarget)}
                            className="h-14 w-14 shrink-0 rounded-lg object-cover"
                          />
                          <span className="min-w-0">
                            <span className="line-clamp-1 text-sm font-semibold text-slate-900 group-hover:text-primary">
                              {item.name}
                            </span>
                            <span className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                              {item.short_description || item.category_path || "同分类商品"}
                            </span>
                            <span className="mt-1 block text-sm font-bold text-primary">
                              {settings.currency_symbol}{Number(item.price).toFixed(2)}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="sticky top-20">
                <CardContent className="space-y-4 p-5">
                  <InfoRow label="商品价格" value={`${settings.currency_symbol}${Number(product.price).toFixed(2)}`} strong />
                  <InfoRow label="交付方式" value={getDeliveryLabel(product.delivery_type)} />
                  {settings.show_stock ? <InfoRow label="当前库存" value={String(Number(product.stock ?? 0))} /> : null}

                  {unavailableMessage ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                      {unavailableMessage}
                    </div>
                  ) : null}

                  <Button className="w-full" disabled={!canBuy} asChild={canBuy}>
                    {canBuy ? <Link href={`/checkout?product=${product.id}`}>立即购买</Link> : "不可购买"}
                  </Button>
                </CardContent>
              </Card>

              <SupportCard
                title="购买咨询"
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

function InfoRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-medium text-slate-900", strong && "text-2xl font-black text-primary")}>
        {value}
      </span>
    </div>
  );
}
