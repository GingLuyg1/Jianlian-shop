"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bot,
  CreditCard,
  Gift,
  KeyRound,
  MessageCircle,
  Phone,
  Sparkles,
  Wallet,
} from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  findCategoryBySlugOrId,
  getCategoryPath,
  getDescendantCategoryIds,
  sortCategories,
} from "@/lib/catalog/category-tree";
import {
  getDeliveryLabel,
  isFrontendVisibleStatus,
} from "@/lib/catalog/product-status";
import { cn } from "@/lib/utils";
import {
  findPrimaryCategory,
  getErrorText,
  listFrontendProducts,
  listPublicCategories,
  normalizeText,
  type PublicCatalogConfig,
  type PublicCategory,
  type PublicProductListOptions,
  type PublicProductRow,
} from "@/lib/supabase/public-catalog";
import CategoryBreadcrumb from "./CategoryBreadcrumb";
import CategoryContentBoundary from "./CategoryContentBoundary";
import CategorySidebar from "./CategorySidebar";
import ProductFilters, {
  type ProductSortValue,
  type ProductStockFilter,
} from "./ProductFilters";
import ProductGrid from "./ProductGrid";
import ProductPagination from "./ProductPagination";
import {
  mallContentClassName,
  productSupportTextClassName,
  shopNoticeClassName,
} from "./product-ui";

const PAGE_SIZE_VALUES = [20, 40, 60] as const;
const MAX_WAIT_MS = 900;

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
  legacyQueryParams?: string[];
};

type DisplayCategory = PublicCategory & {
  children: DisplayCategory[];
  displayImage?: string;
  displayIcon?: keyof typeof iconMap;
};

function clampPageSize(value: string | null) {
  const next = Number(value);
  return PAGE_SIZE_VALUES.includes(next as (typeof PAGE_SIZE_VALUES)[number])
    ? next
    : 20;
}

function clampPage(value: string | null) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? Math.floor(next) : 1;
}

function readSort(value: string | null): ProductSortValue {
  if (value === "price_asc" || value === "price_desc" || value === "newest") {
    return value;
  }
  return "default";
}

function readStock(value: string | null): ProductStockFilter {
  if (value === "in_stock" || value === "out_of_stock" || value === "sold_out") {
    return value;
  }
  return "all";
}

function buildDisplayTree(
  categories: PublicCategory[],
  parentId: string,
  attachVisual: (category: PublicCategory) => DisplayCategory
): DisplayCategory[] {
  return sortCategories(categories.filter((category) => category.parent_id === parentId)).map(
    (category) => {
      const withVisual = attachVisual(category);
      return {
        ...withVisual,
        children: buildDisplayTree(categories, category.id, attachVisual),
      };
    }
  );
}

function flattenTree(categories: DisplayCategory[]): DisplayCategory[] {
  return categories.flatMap((category) => [category, ...flattenTree(category.children)]);
}

function getUrlWithParams(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export default function SupabaseMallContent({
  fallbackCategories,
  fallbackTitle,
  primaryNames,
  primarySlugs,
  productCategory,
  queryParam = "category",
  legacyQueryParams = [],
}: SupabaseMallContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestIdRef = useRef(0);
  const listTopRef = useRef<HTMLDivElement | null>(null);

  const [categories, setCategories] = useState<DisplayCategory[]>([]);
  const [allCategories, setAllCategories] = useState<PublicCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<DisplayCategory | null>(null);
  const [products, setProducts] = useState<PublicProductRow[]>([]);
  const [deliveryOptions, setDeliveryOptions] = useState<string[]>([]);
  const [count, setCount] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const config = useMemo(
    () => ({ primaryNames, primarySlugs, productCategory }),
    [primaryNames, primarySlugs, productCategory]
  );

  const queryCategory = useMemo(() => {
    const primaryValue = searchParams.get(queryParam);
    if (primaryValue) return primaryValue;
    for (const param of legacyQueryParams) {
      const value = searchParams.get(param);
      if (value) return value;
    }
    return "";
  }, [legacyQueryParams, queryParam, searchParams]);

  const search = searchParams.get("search")?.trim() ?? "";
  const sort = readSort(searchParams.get("sort"));
  const stock = readStock(searchParams.get("stock"));
  const deliveryType = searchParams.get("delivery") ?? "";
  const page = clampPage(searchParams.get("page"));
  const pageSize = clampPageSize(searchParams.get("pageSize"));

  const attachFallbackVisual = useCallback(
    (category: PublicCategory): DisplayCategory => {
      const normalizedSlug = normalizeText(category.slug);
      const normalizedName = normalizeText(category.name);
      const fallback = fallbackCategories.find((item) => {
        const aliases = [item.slug, item.name, ...(item.aliases ?? [])].map(normalizeText);
        return aliases.some(
          (alias) =>
            alias === normalizedSlug ||
            normalizedName.includes(alias) ||
            alias.includes(normalizedName)
        );
      });

      return {
        ...category,
        children: [],
        displayImage: fallback?.image,
        displayIcon: fallback?.icon,
      };
    },
    [fallbackCategories]
  );

  const updateParams = useCallback(
    (updates: Record<string, string | number | null | undefined>, scrollToList = false) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      });

      router.replace(getUrlWithParams(pathname, params), { scroll: false });

      if (scrollToList) {
        window.setTimeout(() => {
          listTopRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
        }, 80);
      }
    },
    [pathname, router, searchParams]
  );

  const categoryPath = useMemo(
    () => getCategoryPath(allCategories, selectedCategory?.id ?? null),
    [allCategories, selectedCategory?.id]
  );

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    let mounted = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const timeout = window.setTimeout(() => {
      if (mounted && requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }, MAX_WAIT_MS);

    async function loadCatalogAndProducts() {
      setIsLoading(true);
      setError("");

      try {
        const rows = await listPublicCategories();
        if (!mounted || requestId !== requestIdRef.current) return;

        const primary = findPrimaryCategory(rows, config);
        if (!primary) {
          setAllCategories(rows);
          setCategories([]);
          setSelectedCategory(null);
          setProducts([]);
          setCount(0);
          setError(`未找到「${fallbackTitle}」一级分类。`);
          return;
        }

        const tree = buildDisplayTree(rows, primary.id, attachFallbackVisual);
        const flat = flattenTree(tree);
        const selected: DisplayCategory =
          (findCategoryBySlugOrId(flat, queryCategory) as DisplayCategory | null) ??
          flat[0] ??
          attachFallbackVisual(primary);

        setAllCategories(rows);
        setCategories(tree);
        setSelectedCategory(selected);

        const baseCategoryIds = getDescendantCategoryIds(rows, selected.id);
        const normalizedSearch = normalizeText(search);
        const matchedCategoryIds = normalizedSearch
          ? baseCategoryIds.filter((categoryId) => {
              const category = rows.find((item) => item.id === categoryId);
              return category
                ? normalizeText(category.name).includes(normalizedSearch) ||
                    normalizeText(category.slug).includes(normalizedSearch)
                : false;
            })
          : [];

        const queryOptions: PublicProductListOptions = {
          categoryIds: baseCategoryIds,
          search,
          sort,
          stock,
          deliveryType,
          page,
          pageSize,
        };

        let result = await listFrontendProducts(queryOptions);

        if (search && matchedCategoryIds.length > 0) {
          const [categoryMatchedResult, searchResult] = await Promise.all([
            listFrontendProducts({
              categoryIds: matchedCategoryIds,
              sort,
              stock,
              deliveryType,
              page: 1,
              pageSize: 200,
            }),
            listFrontendProducts({
              ...queryOptions,
              page: 1,
              pageSize: 200,
            }),
          ]);
          const merged = new Map<string, PublicProductRow>();
          [...categoryMatchedResult.products, ...searchResult.products].forEach((product) => {
            if (isFrontendVisibleStatus(product.status)) merged.set(product.id, product);
          });
          const mergedProducts = Array.from(merged.values());
          const start = (page - 1) * pageSize;
          result = {
            count: mergedProducts.length,
            products: mergedProducts.slice(start, start + pageSize),
          };
        }

        const deliverySource = await listFrontendProducts({
          categoryIds: baseCategoryIds,
          page: 1,
          pageSize: 200,
        });
        const nextDeliveryOptions = Array.from(
          new Set(
            deliverySource.products
              .map((product) => product.delivery_type)
              .filter((value): value is string => Boolean(value))
          )
        ).sort((a, b) => getDeliveryLabel(a).localeCompare(getDeliveryLabel(b), "zh-CN"));

        if (!mounted || requestId !== requestIdRef.current) return;
        setProducts(result.products);
        setCount(result.count);
        setDeliveryOptions(nextDeliveryOptions);
      } catch (loadError) {
        if (!mounted || requestId !== requestIdRef.current) return;
        setError(getErrorText(loadError, "商品数据读取失败，请稍后重试。"));
        setProducts([]);
        setCount(0);
      } finally {
        window.clearTimeout(timeout);
        if (mounted && requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    }

    loadCatalogAndProducts();

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
    };
  }, [
    attachFallbackVisual,
    config,
    deliveryType,
    fallbackTitle,
    page,
    pageSize,
    queryCategory,
    search,
    sort,
    stock,
  ]);

  const handleCategorySelect = (category: PublicCategory) => {
    updateParams({ [queryParam]: category.slug, page: 1 }, true);
  };

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <PublicLayout contentClassName={mallContentClassName}>
      <CategoryContentBoundary isLoading={isLoading}>
        <CategorySidebar
          categories={categories}
          disabled={isLoading}
          selectedCategoryId={selectedCategory?.id}
          onSelectCategory={handleCategorySelect}
        />

        <Card className="h-full min-h-0 overflow-hidden">
          <CardContent className="flex h-full min-h-0 flex-col p-5">
            <ShopNotice />

            <div ref={listTopRef} className="mb-3 flex shrink-0 flex-col gap-3">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
                <div className="min-w-0">
                  <CategoryBreadcrumb items={categoryPath} onSelect={handleCategorySelect} />
                  <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                    <h1 className="truncate text-2xl font-black">
                      {selectedCategory?.name ?? fallbackTitle}
                    </h1>
                    <Badge variant="outline" className="bg-green-50 text-green-700">
                      共 {count} 个商品
                    </Badge>
                  </div>
                </div>
              </div>

              <ProductFilters
                deliveryOptions={deliveryOptions}
                deliveryType={deliveryType}
                disabled={isLoading}
                searchInput={searchInput}
                sort={sort}
                stock={stock}
                totalCount={count}
                onSearchInputChange={setSearchInput}
                onSearch={() => updateParams({ search: searchInput.trim(), page: 1 }, true)}
                onSortChange={(value) => updateParams({ sort: value, page: 1 })}
                onStockChange={(value) => updateParams({ stock: value, page: 1 })}
                onDeliveryTypeChange={(value) => updateParams({ delivery: value, page: 1 })}
                onReset={() =>
                  updateParams(
                    {
                      search: null,
                      sort: null,
                      stock: null,
                      delivery: null,
                      page: 1,
                      pageSize,
                    },
                    true
                  )
                }
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <ProductGrid
                categories={allCategories}
                error={error}
                isLoading={isLoading}
                products={products}
                onRetry={() => updateParams({ page })}
              />
            </div>

            <div className="mt-3 shrink-0">
              <ProductPagination
                count={count}
                disabled={isLoading}
                page={Math.min(page, totalPages)}
                pageSize={pageSize}
                onPageChange={(nextPage) => updateParams({ page: nextPage }, true)}
                onPageSizeChange={(nextPageSize) =>
                  updateParams({ pageSize: nextPageSize, page: 1 }, true)
                }
              />
              <div className={cn(productSupportTextClassName, "mt-3")}>
                如需补货或批量购买，请先联系在线客服确认库存。
                <button
                  type="button"
                  className="ml-1 text-primary underline-offset-4 hover:underline"
                  {...({ popovertarget: "support-popover" } as Record<string, string>)}
                >
                  联系客服
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </CategoryContentBoundary>
    </PublicLayout>
  );
}

function ShopNotice() {
  return (
    <div className={shopNoticeClassName}>
      <div className="font-semibold">选购请注意</div>
      <div className="mt-2 space-y-1">
        <p>1. 下单之前请一定要看清商品说明，非商品问题一经售出不退不换。</p>
        <p>
          2. 本店会在技术范围内尽力保障商品可用性，售后期通常为商品发货
          <span className="font-bold text-red-600">24小时内</span>。
        </p>
        <p>
          3. 拿到账号、卡密或充值结果后请第一时间检查；如有问题请在
          <span className="font-bold text-red-600">24小时内</span>联系客服。
        </p>
        <p className="font-bold text-red-600">
          4. 本站产品拒绝任何违法行为，不提供任何教程（仅限登录），不为任何非法行业提供任何支持，仅提供电商拓客服务。
        </p>
      </div>
    </div>
  );
}
