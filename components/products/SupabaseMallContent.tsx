"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bot,
  ChevronRight,
  CreditCard,
  Gift,
  KeyRound,
  MessageCircle,
  Phone,
  Search,
  Sparkles,
  Wallet,
} from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Product, ProductCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  findPrimaryCategory,
  getChildCategories,
  getErrorText,
  listActiveProductsByCategory,
  listPublicCategories,
  mapPublicProductToProduct,
  normalizeText,
  type PublicCatalogConfig,
  type PublicCategory,
} from "@/lib/supabase/public-catalog";
import CategoryContentBoundary from "./CategoryContentBoundary";
import {
  categoryListScrollClassName,
  categoryPanelInnerClassName,
  compactProductRowClassName,
  compactSearchButtonClassName,
  compactSearchInputClassName,
  compactSearchWrapperClassName,
  interactiveButtonClass,
  mallContentClassName,
  productImageFallbackSrc,
  productListFiveRowsClassName,
  productPanelContentClassName,
  productSupportTextClassName,
  setProductImageFallback,
  shopNoticeClassName,
} from "./product-ui";

const iconMap = {
  bot: Bot,
  creditCard: CreditCard,
  gift: Gift,
  key: KeyRound,
  message: MessageCircle,
  phone: Phone,
  sparkles: Sparkles,
  wallet: Wallet,
};

type FallbackCategory = {
  slug: string;
  name: string;
  image?: string;
  icon?: keyof typeof iconMap;
  aliases?: string[];
};

export type SupabaseMallContentProps = PublicCatalogConfig & {
  queryParam?: string;
  fallbackTitle: string;
  fallbackCategories: FallbackCategory[];
};

type DisplayCategory = PublicCategory & {
  displayImage?: string;
  displayIcon?: keyof typeof iconMap;
};

export default function SupabaseMallContent({
  fallbackCategories,
  fallbackTitle,
  primaryNames,
  primarySlugs,
  productCategory,
  queryParam = "category",
}: SupabaseMallContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<DisplayCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<DisplayCategory | null>(
    null
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  const config = useMemo(
    () => ({ primaryNames, primarySlugs, productCategory }),
    [primaryNames, primarySlugs, productCategory]
  );

  const attachFallbackVisual = useCallback(
    (category: PublicCategory): DisplayCategory => {
      const normalizedSlug = normalizeText(category.slug);
      const normalizedName = normalizeText(category.name);
      const fallback = fallbackCategories.find((item) => {
        const aliases = [item.slug, item.name, ...(item.aliases ?? [])].map(
          normalizeText
        );
        return aliases.some(
          (alias) =>
            alias === normalizedSlug ||
            normalizedName.includes(alias) ||
            alias.includes(normalizedName)
        );
      });

      return {
        ...category,
        displayImage: fallback?.image,
        displayIcon: fallback?.icon,
      };
    },
    [fallbackCategories]
  );

  const loadProducts = useCallback(
    async (category: DisplayCategory, requestId: number) => {
      const rows = await listActiveProductsByCategory(category.id);
      if (requestId !== requestIdRef.current) return;
      setProducts(
        rows.map((row) =>
          mapPublicProductToProduct(row, productCategory, category.name)
        )
      );
    },
    [productCategory]
  );

  useEffect(() => {
    let mounted = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    async function loadCatalog() {
      setIsLoading(true);
      setError("");
      try {
        const rows = await listPublicCategories();
        if (!mounted || requestId !== requestIdRef.current) return;

        const primary = findPrimaryCategory(rows, config);
        if (!primary) {
          setCategories([]);
          setActiveCategory(null);
          setProducts([]);
          setError(`未找到「${fallbackTitle}」一级分类`);
          return;
        }

        const childCategories = getChildCategories(rows, primary.id).map(
          attachFallbackVisual
        );
        const routeCategory = searchParams.get(queryParam);
        const selected =
          childCategories.find(
            (category) =>
              category.slug === routeCategory || category.id === routeCategory
          ) ?? childCategories[0] ?? null;

        setCategories(childCategories);
        setActiveCategory(selected);
        setSelectedCategoryId(selected?.id ?? "");

        if (selected) {
          await loadProducts(selected, requestId);
        } else {
          setProducts([]);
        }
      } catch (loadError) {
        if (!mounted || requestId !== requestIdRef.current) return;
        setError(getErrorText(loadError, "商品分类读取失败，请稍后重试"));
        setProducts([]);
      } finally {
        if (mounted && requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    }

    loadCatalog();

    return () => {
      mounted = false;
    };
  }, [
    attachFallbackVisual,
    config,
    fallbackTitle,
    loadProducts,
    queryParam,
    searchParams,
  ]);

  async function handleCategorySelect(category: DisplayCategory) {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setSelectedCategoryId(category.id);
    setActiveCategory(category);
    setSelectedProductId(null);
    setProducts([]);
    setError("");
    setIsLoading(true);
    router.replace(
      `/products/${productCategory}?${queryParam}=${encodeURIComponent(
        category.slug
      )}`,
      { scroll: false }
    );

    try {
      await loadProducts(category, requestId);
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(getErrorText(loadError, "商品读取失败，请稍后重试"));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.description.toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

  return (
    <PublicLayout contentClassName={mallContentClassName}>
      <CategoryContentBoundary isLoading={isLoading}>
        <CategoryPanel
          categories={categories}
          disabled={isLoading}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={handleCategorySelect}
        />
        <ProductPanel
          error={error}
          products={filteredProducts}
          searchQuery={searchQuery}
          selectedCategoryName={activeCategory?.name ?? fallbackTitle}
          selectedProductId={selectedProductId}
          onSearchChange={setSearchQuery}
          onSelectProduct={(productId) => {
            setSelectedProductId(productId);
            router.push(`/checkout?product=${productId}`);
          }}
        />
      </CategoryContentBoundary>
    </PublicLayout>
  );
}

function CategoryPanel({
  categories,
  disabled,
  selectedCategoryId,
  onSelectCategory,
}: {
  categories: DisplayCategory[];
  disabled: boolean;
  selectedCategoryId: string;
  onSelectCategory: (category: DisplayCategory) => void;
}) {
  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className="h-full min-h-0 p-4">
        <div className={categoryPanelInnerClassName}>
          <div className={categoryListScrollClassName}>
            {categories.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-white p-5 text-center text-sm text-muted-foreground">
                暂无二级分类
              </div>
            ) : (
              categories.map((category) => (
                <CategoryButton
                  key={category.id}
                  category={category}
                  active={selectedCategoryId === category.id}
                  disabled={disabled}
                  onClick={() => onSelectCategory(category)}
                />
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryButton({
  active,
  category,
  disabled,
  onClick,
}: {
  active: boolean;
  category: DisplayCategory;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = category.displayIcon ? iconMap[category.displayIcon] : KeyRound;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        interactiveButtonClass,
        "flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left disabled:cursor-wait",
        active
          ? "scale-[1.015] border border-primary/25 bg-primary/10 text-primary shadow-sm"
          : "border border-slate-100 bg-white text-foreground hover:scale-[1.01] hover:border-primary/25 hover:bg-primary/5"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {category.displayImage ? (
          <img
            src={category.displayImage}
            alt={category.name}
            onError={(event) => setProductImageFallback(event.currentTarget)}
            className={cn(
              "h-11 w-11 shrink-0 rounded-xl bg-white object-cover",
              active ? "ring-2 ring-primary/25" : "ring-1 ring-slate-200"
            )}
          />
        ) : (
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
              active ? "bg-primary/15" : "bg-primary/10"
            )}
          >
            <Icon className="h-6 w-6 text-primary" />
          </div>
        )}
        <div className="max-w-[130px] truncate whitespace-nowrap text-base font-semibold">
          {category.name}
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0" />
    </button>
  );
}

function ProductPanel({
  error,
  products,
  searchQuery,
  selectedCategoryName,
  selectedProductId,
  onSearchChange,
  onSelectProduct,
}: {
  error: string;
  products: Product[];
  searchQuery: string;
  selectedCategoryName: string;
  selectedProductId: string | null;
  onSearchChange: (query: string) => void;
  onSelectProduct: (productId: string) => void;
}) {
  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className={productPanelContentClassName}>
        <ShopNotice />

        <div className="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h1 className="truncate text-xl font-bold">
              {selectedCategoryName}
            </h1>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              共计{products.length}个商品
            </div>
          </div>
          <div className={compactSearchWrapperClassName}>
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d6355]" />
              <Input
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="请输入名称搜索"
                className={compactSearchInputClassName}
              />
            </div>
            <Button className={compactSearchButtonClassName}>搜索</Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : (
          <div className={productListFiveRowsClassName}>
            {products.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-slate-50 text-sm text-muted-foreground">
                该分类暂无商品
              </div>
            ) : (
              products.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  selected={selectedProductId === product.id}
                  onClick={() => onSelectProduct(product.id)}
                />
              ))
            )}
          </div>
        )}

        <div className={productSupportTextClassName}>
          如需补货或批量购买，请先联系在线客服确认库存。
          <button
            type="button"
            className="ml-1 text-primary underline-offset-4 hover:underline"
            {...({ popovertarget: "support-popover" } as Record<string, string>)}
          >
            联系客服
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductRow({
  product,
  selected,
  onClick,
}: {
  product: Product;
  selected: boolean;
  onClick: () => void;
}) {
  const stock = product.stock ?? 0;
  const imageSrc = product.imageUrl || productImageFallbackSrc;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        compactProductRowClassName,
        selected && "border-primary/30 bg-primary/5"
      )}
    >
      <div className="flex h-full min-w-0 items-center gap-5">
        <img
          src={imageSrc}
          alt={product.name}
          onError={(event) => setProductImageFallback(event.currentTarget)}
          className="h-12 w-12 shrink-0 rounded-xl bg-white object-cover"
        />
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate text-base font-semibold text-slate-700">
            {product.name}
          </div>
          {product.description ? (
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {product.description}
            </div>
          ) : null}
        </div>
        <div className="hidden shrink-0 items-center gap-2 text-sm text-slate-600 md:flex">
          库存：
          <span className={stock > 0 ? "text-green-600" : "text-slate-400"}>
            {stock}
          </span>
        </div>
        <div className="shrink-0 text-lg font-bold text-blue-600">
          ¥{product.price.toFixed(2)}
        </div>
      </div>
    </button>
  );
}

function ShopNotice() {
  return (
    <div className={shopNoticeClassName}>
      <div className="font-semibold">选购请注意</div>
      <div className="mt-2 space-y-1">
        <p>1. 下单之前请一定一定要看清商品说明，非商品问题一经售出不退不换~</p>
        <p>
          2. 本店在技术范围内会尽力保障商品的可用性，所有商品如无单独标注，售后期均为商品发货
          <span className="font-bold text-red-600">24小时内</span>。
        </p>
        <p>
          3. 切记，
          <span className="font-bold text-red-600">
            拿到账号第一时间检查账号。
          </span>
          售后期限为<span className="font-bold text-red-600">24小时</span>，请勿扯皮！
        </p>
        <p className="font-bold text-red-600">
          4. 本站产品拒绝任何违法行为，不提供任何教程（仅限登录），不为任何非法行业提供任何支持，仅提供电商拓客服务。
        </p>
      </div>
    </div>
  );
}
