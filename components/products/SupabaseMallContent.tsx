"use client";

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { usePublicSettings } from "@/components/settings/SettingsProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Product, ProductCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  findPrimaryCategory,
  getChildCategories,
  getErrorText,
  listPublicCategories,
  mapPublicProductToProduct,
  normalizeText,
  searchPublicCatalogProducts,
  type PublicCatalogConfig,
  type PublicCategory,
} from "@/lib/supabase/public-catalog";
import CategoryContentBoundary from "./CategoryContentBoundary";
import {
  categoryListScrollClassName,
  categoryPanelInnerClassName,
  compactProductRowClassName,
  interactiveButtonClass,
  mallContentClassName,
  productImageFallbackSrc,
  productPanelContentClassName,
  setProductImageFallback,
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

type FilterState = {
  search: string;
  page: number;
  pageSize: number;
};

const CATALOG_PAGE_SIZE = 20;

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
  const { settings } = usePublicSettings();
  const [categories, setCategories] = useState<DisplayCategory[]>([]);
  const [allCategories, setAllCategories] = useState<PublicCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<DisplayCategory | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [draftSearch, setDraftSearch] = useState(searchParams.get("search") ?? "");
  const [isLoadingSecondaryCategories, setIsLoadingSecondaryCategories] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [error, setError] = useState("");
  const productListTopRef = useRef<HTMLDivElement | null>(null);
  const categoryRequestIdRef = useRef(0);
  const productRequestIdRef = useRef(0);

  const searchParamsKey = searchParams.toString();
  const routeCategoryKey = searchParams.get(queryParam) ?? "";
  const filters = useMemo(() => readFilters(searchParams), [searchParamsKey, searchParams]);

  const config = useMemo(
    () => ({ primaryNames, primarySlugs, productCategory }),
    [primaryNames, primarySlugs, productCategory]
  );

  const attachFallbackVisual = useCallback(
    (category: PublicCategory): DisplayCategory => {
      const normalizedSlug = normalizeText(category.slug);
      const normalizedName = normalizeText(category.name);
      const fallback = fallbackCategories.find((item) => {
        const aliases = [item.slug, item.name, ...(item.aliases ?? [])].map(normalizeText);
        return aliases.some(
          (alias) => alias === normalizedSlug || normalizedName.includes(alias) || alias.includes(normalizedName)
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

  const updateUrl = useCallback(
    (patch: Partial<FilterState> & { categorySlug?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (patch.categorySlug !== undefined) {
        if (patch.categorySlug) params.set(queryParam, patch.categorySlug);
        else params.delete(queryParam);
      }
      updateOptionalParam(params, "search", patch.search);
      params.delete("priceMin");
      params.delete("priceMax");
      params.delete("stock");
      params.delete("deliveryType");
      params.delete("multiSku");
      params.delete("sort");
      if (patch.page !== undefined) {
        if (patch.page > 1) params.set("page", String(patch.page));
        else params.delete("page");
      }
      params.delete("pageSize");
      router.replace(`/products/${productCategory}?${params.toString()}`, { scroll: false });
    },
    [productCategory, queryParam, router, searchParams]
  );

  useEffect(() => {
    setDraftSearch(filters.search);
  }, [filters.search]);

  useEffect(() => {
    let mounted = true;
    const requestId = categoryRequestIdRef.current + 1;
    categoryRequestIdRef.current = requestId;

    async function loadCategories() {
      setIsLoadingSecondaryCategories(true);
      setIsLoadingProducts(true);
      setError("");
      try {
        const rows = await listPublicCategories();
        if (!mounted || requestId !== categoryRequestIdRef.current) return;

        const primary = findPrimaryCategory(rows, config);
        if (!primary) {
          setCategories([]);
          setAllCategories(rows);
          setActiveCategory(null);
          setProducts([]);
          setTotal(0);
          setError(`未找到“${fallbackTitle}”一级分类。`);
          return;
        }

        const childCategories = getChildCategories(rows, primary.id).map(attachFallbackVisual);
        const routeCategory = routeCategoryKey;
        const selected =
          childCategories.find((category) => category.slug === routeCategory || category.id === routeCategory) ??
          (routeCategory === primary.slug || routeCategory === primary.id ? attachFallbackVisual(primary) : null) ??
          childCategories[0] ??
          attachFallbackVisual(primary);

        setAllCategories(rows);
        setCategories(childCategories);
        setActiveCategory(selected);
        setSelectedCategoryId(selected.id);
      } catch (loadError) {
        if (!mounted || requestId !== categoryRequestIdRef.current) return;
        setCategories([]);
        setProducts([]);
        setTotal(0);
        setError(getErrorText(loadError, "商品分类读取失败，请稍后重试。"));
      } finally {
        if (mounted && requestId === categoryRequestIdRef.current) {
          setIsLoadingSecondaryCategories(false);
        }
      }
    }

    void loadCategories();

    return () => {
      mounted = false;
    };
  }, [attachFallbackVisual, config, fallbackTitle, routeCategoryKey]);

  useEffect(() => {
    if (!activeCategory) {
      setIsLoadingProducts(false);
      return;
    }

    const currentCategory = activeCategory;
    let mounted = true;
    const requestId = productRequestIdRef.current + 1;
    productRequestIdRef.current = requestId;

    async function loadProducts() {
      setIsLoadingProducts(true);
      setError("");
      try {
        const primaryCategoryId = currentCategory.level === 1 ? currentCategory.id : currentCategory.parent_id ?? "";
        const secondaryCategoryId = currentCategory.level === 2 ? currentCategory.id : "";
        if (!primaryCategoryId) {
          setProducts([]);
          setTotal(0);
          return;
        }
        const result = await searchPublicCatalogProducts({
          primaryCategoryId,
          secondaryCategoryId,
          keyword: filters.search,
          page: filters.page,
          pageSize: filters.pageSize,
        });
        if (!mounted || requestId !== productRequestIdRef.current) return;
        setProducts(
          result.products.map((row) =>
            mapPublicProductToProduct(row, productCategory, row.category_path || currentCategory.name)
          )
        );
        setTotal(result.total);
      } catch (loadError) {
        if (!mounted || requestId !== productRequestIdRef.current) return;
        setProducts([]);
        setTotal(0);
        setError(getErrorText(loadError, "商品读取失败，请稍后重试。"));
      } finally {
        if (mounted && requestId === productRequestIdRef.current) {
          setIsLoadingProducts(false);
        }
      }
    }

    void loadProducts();

    return () => {
      mounted = false;
    };
  }, [activeCategory, allCategories, filters, productCategory]);

  function handleCategorySelect(category: DisplayCategory) {
    if (selectedCategoryId === category.id) return;
    setSelectedCategoryId(category.id);
    setActiveCategory(category);
    setIsLoadingProducts(true);
    setError("");
    updateUrl({ categorySlug: category.slug, page: 1 });
  }

  function submitSearch() {
    const next = draftSearch.trim();
    updateUrl({ search: next, page: 1 });
    productListTopRef.current?.scrollIntoView({ block: "nearest" });
  }

  function resetFilters() {
    setDraftSearch("");
    updateUrl({
      search: "",
      page: 1,
      pageSize: CATALOG_PAGE_SIZE,
    });
  }

  return (
    <PublicLayout contentClassName={mallContentClassName}>
      <CategoryContentBoundary>
        <CategoryPanel
          categories={categories}
          disabled={isLoadingSecondaryCategories}
          isLoading={isLoadingSecondaryCategories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={handleCategorySelect}
        />
        <ProductPanel
          activeCategory={activeCategory}
          currencySymbol={settings.currency_symbol}
          draftSearch={draftSearch}
          error={error}
          isLoading={isLoadingProducts}
          products={products}
          productListTopRef={productListTopRef}
          showStock={settings.show_stock}
          total={total}
          onDraftSearchChange={setDraftSearch}
          onResetFilters={resetFilters}
          onSearchSubmit={submitSearch}
        />
      </CategoryContentBoundary>
    </PublicLayout>
  );
}

function CategoryPanel({
  categories,
  disabled,
  isLoading,
  selectedCategoryId,
  onSelectCategory,
}: {
  categories: DisplayCategory[];
  disabled: boolean;
  isLoading: boolean;
  selectedCategoryId: string;
  onSelectCategory: (category: DisplayCategory) => void;
}) {
  return (
    <Card className="relative h-full min-h-0 overflow-hidden">
      <CardContent className="h-full min-h-0 p-4">
        <div className={categoryPanelInnerClassName}>
          <div className={categoryListScrollClassName}>
            {categories.length === 0 && !isLoading ? (
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
      {isLoading ? <CategoryLoadingOverlay /> : null}
    </Card>
  );
}

function CategoryLoadingOverlay() {
  return (
    <div className="absolute inset-0 z-10 rounded-xl bg-white/75 p-4 backdrop-blur-[1px]">
      <div className="flex h-full min-h-0 flex-col rounded-xl bg-orange-50/35 p-3">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex h-[76px] animate-pulse items-center gap-3 rounded-xl border border-slate-100 bg-white px-4">
              <div className="h-11 w-11 rounded-xl bg-slate-100" />
              <div className="h-4 w-28 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
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
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", active ? "bg-primary/15" : "bg-primary/10")}>
            <Icon className="h-6 w-6 text-primary" />
          </div>
        )}
        <div className="max-w-[130px] truncate whitespace-nowrap text-base font-semibold">{category.name}</div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0" />
    </button>
  );
}

function ProductPanel({
  activeCategory,
  currencySymbol,
  draftSearch,
  error,
  isLoading,
  products,
  productListTopRef,
  showStock,
  total,
  onDraftSearchChange,
  onResetFilters,
  onSearchSubmit,
}: {
  activeCategory: DisplayCategory | null;
  currencySymbol: string;
  draftSearch: string;
  error: string;
  isLoading: boolean;
  products: Product[];
  productListTopRef: RefObject<HTMLDivElement>;
  showStock: boolean;
  total: number;
  onDraftSearchChange: (query: string) => void;
  onResetFilters: () => void;
  onSearchSubmit: () => void;
}) {
  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className={productPanelContentClassName}>
        <div ref={productListTopRef} className="mb-3 flex flex-col justify-between gap-3 xl:flex-row xl:items-start">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{activeCategory?.name ?? "商品列表"}</h1>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              当前结果 {total} 个商品
            </div>
          </div>
          <div className="flex w-full gap-2 xl:w-[760px]">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d6355]" />
              <Input
                value={draftSearch}
                onChange={(event) => onDraftSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSearchSubmit();
                }}
                placeholder="搜索商品、SKU、规格或分类"
                className="h-10 rounded-lg border-[#ead9cc] bg-[#fffaf6] pl-11 text-sm text-[#6f5a4d] placeholder:text-[#8a6f60] focus-visible:ring-primary/25"
              />
            </div>
            <Button type="button" onClick={onSearchSubmit} className="h-10 w-[92px] rounded-lg bg-[#df7334] text-sm font-medium hover:bg-[#d7672a]">
              搜索
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button type="button" className="ml-3 font-semibold underline" onClick={onSearchSubmit}>
              重试
            </button>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden">
            {isLoading ? (
              <ProductSkeleton />
            ) : products.length === 0 ? (
              <ProductEmptyState onResetFilters={onResetFilters} />
            ) : (
              <div className="scroll-fade-y h-full min-h-0 space-y-2.5 overflow-y-auto px-1.5 py-1 pr-2 sidebar-scroll">
                {products.map((product) => (
                  <ProductRow key={product.id} product={product} currencySymbol={currencySymbol} showStock={showStock} />
                ))}
              </div>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  );
}

function ProductRow({ currencySymbol, product, showStock }: { currencySymbol: string; product: Product; showStock: boolean }) {
  const stock = product.stock ?? 0;
  const imageSrc = product.imageUrl || productImageFallbackSrc;
  const minPrice = Number(product.metadata?.minPrice ?? product.price);
  const maxPrice = Number(product.metadata?.maxPrice ?? product.price);
  const hasSkus = Boolean(product.metadata?.hasSkus);
  const priceText = hasSkus && maxPrice > minPrice
    ? `${currencySymbol}${minPrice.toFixed(2)}-${currencySymbol}${maxPrice.toFixed(2)}`
    : `${currencySymbol}${product.price.toFixed(2)}`;

  return (
    <button type="button" onClick={() => { window.location.href = `/checkout?product=${encodeURIComponent(product.id)}`; }} className={cn(compactProductRowClassName, "group")}>
      <div className="flex h-full min-w-0 items-center gap-5">
        <img src={imageSrc} alt={product.name} onError={(event) => setProductImageFallback(event.currentTarget)} className="h-12 w-12 shrink-0 rounded-xl bg-white object-cover" />
        <div className="min-w-0 flex-1 text-left">
          <div className="line-clamp-1 text-base font-semibold text-slate-700 group-hover:text-primary">{product.name}</div>
          {product.description ? <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{product.description}</div> : null}
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <span>{product.deliveryLabel}</span>
            {hasSkus ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">多 SKU</span> : null}
          </div>
        </div>
        {showStock ? (
          <div className="hidden shrink-0 items-center gap-2 text-sm text-slate-600 md:flex">
            {product.stockStatus === "out-of-stock" ? "暂时缺货" : product.stockStatus === "low-stock" ? "低库存" : "有库存"}
            <span className={stock > 0 ? "text-green-600" : "text-slate-400"}>{stock}</span>
          </div>
        ) : null}
        {product.originalPrice ? (
          <div className="hidden shrink-0 text-sm text-muted-foreground line-through lg:block">
            {currencySymbol}{Number(product.originalPrice).toFixed(2)}
          </div>
        ) : null}
        <div className="shrink-0 text-lg font-bold text-blue-600">
          {product.stockStatus === "out-of-stock" ? "已售罄" : priceText}
        </div>
      </div>
    </button>
  );
}

function ProductSkeleton() {
  return (
    <div className="h-full space-y-2.5 overflow-hidden px-1.5 py-1 pr-2">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="h-[86px] animate-pulse rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-slate-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 rounded bg-slate-200" />
              <div className="h-3 w-2/3 rounded bg-slate-100" />
            </div>
            <div className="h-5 w-20 rounded bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductEmptyState({ onResetFilters }: { onResetFilters: () => void }) {
  return (
    <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed bg-slate-50 text-center">
      <div>
        <p className="text-base font-semibold text-slate-800">当前分类暂无商品</p>
        <p className="mt-1 text-sm text-muted-foreground">当前分类暂无商品。</p>
        <Button type="button" variant="outline" className="mt-4" onClick={onResetFilters}>
          清空搜索
        </Button>
      </div>
    </div>
  );
}

function readFilters(searchParams: URLSearchParams): FilterState {
  return {
    search: (searchParams.get("search") ?? "").trim(),
    page: Math.max(1, Number(searchParams.get("page") ?? 1) || 1),
    pageSize: CATALOG_PAGE_SIZE,
  };
}

function updateOptionalParam(params: URLSearchParams, key: string, value: unknown, defaultValue = "") {
  if (value === undefined) return;
  const next = String(value ?? "").trim();
  if (!next || next === defaultValue) params.delete(key);
  else params.set(key, next);
}





