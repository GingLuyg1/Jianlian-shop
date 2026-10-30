"use client";

import { Suspense, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { checkoutHref } from "@/lib/products/checkout-navigation";
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
import { refreshPublicCategories, usePublicCategorySnapshot } from "@/lib/catalog/public-category-snapshot";
import { fallbackCategoriesByPath, type StorefrontFallbackCategory } from "@/lib/catalog/storefront-category-visuals";
import { clearPublicProductCounts, forgetPublicProductCount, getPublicProductCount, getPublicProductCountForRoute, rememberPublicProductCount, retainVisiblePublicProductCounts, subscribePublicProductCounts, getPublicProductCountVersion, getServerPublicProductCountVersion } from "@/lib/catalog/public-product-count-cache";
import { forgetPublicProductPage, getPublicProductPage, peekPublicProductPage, prefetchPublicProductPage } from "@/lib/catalog/public-product-query-cache";
import { useProgressiveWheelMotion } from "@/hooks/use-progressive-wheel-motion";
import { findVisibleStorefrontPrimaryCategory } from "@/hooks/use-visible-storefront-categories";
import { getCatalogRoutePending, getServerCatalogRoutePending, selectPendingCatalogCategory, subscribeCatalogRoutePending } from "@/lib/motion/catalog-route-exit";
import {
  findPrimaryCategory,
  getChildCategories,
  getErrorText,
  mapPublicProductToProduct,
  normalizeText,
  type PublicCatalogConfig,
  type PublicCategory,
} from "@/lib/supabase/public-catalog";
import CategoryContentBoundary from "./CategoryContentBoundary";
import SecondarySlidingIndicator from "./SecondarySlidingIndicator";
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

export type SupabaseMallContentProps = PublicCatalogConfig & {
  queryParam?: string;
  fallbackTitle: string;
  fallbackCategories: StorefrontFallbackCategory[];
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

function useDelayedLoading(loading: boolean, delay = 140) {
  const [phase, setPhase] = useState<"hidden" | "visible" | "leaving">("hidden");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  useEffect(() => {
    if (loading) {
      if (phaseRef.current === "leaving") setPhase("hidden");
      const timer = window.setTimeout(() => setPhase("visible"), delay);
      return () => window.clearTimeout(timer);
    }
    if (phaseRef.current === "visible") {
      setPhase("leaving");
      const timer = window.setTimeout(() => setPhase("hidden"), 120);
      return () => window.clearTimeout(timer);
    }
    setPhase("hidden");
  }, [loading, delay]);
  return phase;
}

export default function SupabaseMallContent({
  ...props
}: SupabaseMallContentProps) {
  return (
    <Suspense fallback={null}>
      <SupabaseMallContentInner {...props} />
    </Suspense>
  );
}

function SupabaseMallContentInner({
  fallbackCategories,
  primaryNames,
  primarySlugs,
  productCategory,
  queryParam = "category",
}: SupabaseMallContentProps) {
  const pathname = usePathname();
  const router = useRouter();
  const pendingRoute = useSyncExternalStore(subscribeCatalogRoutePending, getCatalogRoutePending, getServerCatalogRoutePending);
  const routePending = pendingRoute?.source === pathname && pendingRoute.target !== pathname ? pendingRoute : null;
  const searchParams = useSearchParams();
  const routeSearch = searchParams.toString();
  const [localParams, setLocalParams] = useState(() => new URLSearchParams(routeSearch));
  const { settings } = usePublicSettings();
  const categorySnapshot = usePublicCategorySnapshot();
  useSyncExternalStore(subscribePublicProductCounts, getPublicProductCountVersion, getServerPublicProductCountVersion);
  const [activeCategory, setActiveCategory] = useState<DisplayCategory | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [pendingSelectedCategoryId, setPendingSelectedCategoryId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [draftSearch, setDraftSearch] = useState(searchParams.get("search") ?? "");
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productError, setProductError] = useState("");
  const [loadedProductKey, setLoadedProductKey] = useState("");
  const [loadedCategoryId, setLoadedCategoryId] = useState("");
  const [countReadyKey, setCountReadyKey] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const productListTopRef = useRef<HTMLDivElement | null>(null);
  const productRequestIdRef = useRef(0);

  const routeCategoryKey = localParams.get(queryParam) ?? "";
  const filters = useMemo(() => readFilters(localParams), [localParams]);
  useEffect(() => { setLocalParams(new URLSearchParams(routeSearch)); }, [routeSearch]);
  useEffect(() => {
    const sync = () => setLocalParams(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const config = useMemo(
    () => ({ primaryNames, primarySlugs, productCategory }),
    [primaryNames, primarySlugs, productCategory]
  );

  const attachFallbackVisual = useCallback(
    (category: PublicCategory, visuals = fallbackCategories): DisplayCategory => {
      const normalizedSlug = normalizeText(category.slug);
      const normalizedName = normalizeText(category.name);
      const fallback = visuals.find((item) => {
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

  // Derive the rail directly from the shared, verified category snapshot. A
  // fresh route component must not render an empty local array before its
  // effect copies rows that are already available across routes.
  const secondaryCategories = useMemo(() => {
    const rows = categorySnapshot.rows;
    if (!rows) return [];
    const primary = findPrimaryCategory(rows, config);
    return primary ? getChildCategories(rows, primary.id).map((category) => attachFallbackVisual(category)) : [];
  }, [attachFallbackVisual, categorySnapshot.rows, config]);
  const isLoadingSecondaryCategories = !categorySnapshot.rows && categorySnapshot.status !== "error";
  const pendingSecondaryCategories = useMemo(() => {
    if (!routePending?.target || !categorySnapshot.rows) return null;
    const targetPath = routePending.target.split("?")[0];
    const primary = findVisibleStorefrontPrimaryCategory(targetPath, categorySnapshot.rows);
    return primary ? getChildCategories(categorySnapshot.rows, primary.id).map((category) => attachFallbackVisual(category, fallbackCategoriesByPath[targetPath] ?? [])) : null;
  }, [attachFallbackVisual, categorySnapshot.rows, routePending?.target]);
  // A verified route's first child is available during render, before any
  // route-commit effect or product request. Never derive this from stale UI.
  const resolvedCategory = useMemo(() => {
    if (!categorySnapshot.rows) return null;
    const primary = findPrimaryCategory(categorySnapshot.rows, config);
    if (!primary) return null;
    const routeChoice = secondaryCategories.find((category) => category.slug === routeCategoryKey || category.id === routeCategoryKey);
    const currentChoice = secondaryCategories.find((category) => category.id === activeCategory?.id);
    return routeChoice ?? currentChoice ?? secondaryCategories[0] ?? attachFallbackVisual(primary);
  }, [activeCategory?.id, attachFallbackVisual, categorySnapshot.rows, config, routeCategoryKey, secondaryCategories]);

  const updateUrl = useCallback(
    (patch: Partial<FilterState> & { categorySlug?: string | null }) => {
      const params = new URLSearchParams(window.location.search);
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
      // A secondary-category change is local to this page. Avoid competing RSC
      // navigations when the user selects several categories quickly.
      window.history.replaceState(window.history.state, "", `/products/${productCategory}?${params.toString()}`);
      // Next 13 does not synchronize useSearchParams after native History calls.
      // Commit filters locally as well, preserving the last-click request guard.
      setLocalParams(params);
    },
    [productCategory, queryParam]
  );

  useEffect(() => {
    setDraftSearch(filters.search);
  }, [filters.search]);

  useEffect(() => {
    const rows = categorySnapshot.rows;
    if (!rows) {
      if (categorySnapshot.status === "error") {
        clearPublicProductCounts();
        setActiveCategory(null);
        setSelectedCategoryId("");
        setProducts([]);
        setTotal(0);
        setProductError("");
        setIsLoadingProducts(false);
      }
      return;
    }
    retainVisiblePublicProductCounts(new Set(rows.map((row) => row.id)));

    const primary = findPrimaryCategory(rows, config);
    if (!primary) {
      setActiveCategory(null);
      setSelectedCategoryId("");
      setProducts([]);
      setTotal(0);
      setLoadedProductKey("");
      setLoadedCategoryId("");
      setProductError("");
      setIsLoadingProducts(false);
      return;
    }

    const selected =
      secondaryCategories.find((category) => category.slug === routeCategoryKey || category.id === routeCategoryKey) ??
      (routeCategoryKey === primary.slug || routeCategoryKey === primary.id ? attachFallbackVisual(primary) : null) ??
      secondaryCategories[0] ??
      attachFallbackVisual(primary);

    setActiveCategory((current) =>
      current?.id === selected.id &&
      current.name === selected.name &&
      current.parent_id === selected.parent_id &&
      current.level === selected.level &&
      current.slug === selected.slug
        ? current
        : selected
    );
    setSelectedCategoryId(selected.id);
  }, [attachFallbackVisual, categorySnapshot.rows, categorySnapshot.status, config, routeCategoryKey, secondaryCategories]);

  const productQueryKey = JSON.stringify([productCategory, resolvedCategory?.id ?? "", filters.search, filters.page, filters.pageSize]);

  useEffect(() => {
    if (!resolvedCategory || loadedProductKey !== productQueryKey) return;
    const query = {
      primaryCategoryId: resolvedCategory.level === 1 ? resolvedCategory.id : resolvedCategory.parent_id ?? "",
      secondaryCategoryId: resolvedCategory.level === 2 ? resolvedCategory.id : "",
      keyword: filters.search, page: filters.page, pageSize: filters.pageSize,
    };
    const revalidateIfStale = () => {
      if (document.visibilityState === "visible" && !peekPublicProductPage(query)) setRetryNonce((value) => value + 1);
    };
    window.addEventListener("focus", revalidateIfStale);
    document.addEventListener("visibilitychange", revalidateIfStale);
    return () => {
      window.removeEventListener("focus", revalidateIfStale);
      document.removeEventListener("visibilitychange", revalidateIfStale);
    };
  }, [filters.page, filters.pageSize, filters.search, loadedProductKey, productQueryKey, resolvedCategory]);

  useEffect(() => {
    if (!resolvedCategory) {
      setIsLoadingProducts(false);
      return;
    }

    const currentCategory = resolvedCategory;
    const currentQueryKey = productQueryKey;
    let mounted = true;
    const requestId = productRequestIdRef.current + 1;
    productRequestIdRef.current = requestId;

    async function loadProducts() {
      setIsLoadingProducts(true);
      setCountReadyKey("");
      setProductError("");
      setLoadedProductKey("");
      setLoadedCategoryId("");
      setProducts([]);
      setTotal(0);
      try {
        const primaryCategoryId = currentCategory.level === 1 ? currentCategory.id : currentCategory.parent_id ?? "";
        const secondaryCategoryId = currentCategory.level === 2 ? currentCategory.id : "";
        if (!primaryCategoryId) {
          forgetPublicProductCount(currentQueryKey);
          setProducts([]);
          setTotal(0);
          return;
        }
        const query = {
          primaryCategoryId,
          secondaryCategoryId,
          keyword: filters.search,
          page: filters.page,
          pageSize: filters.pageSize,
        };
        const cacheHit = Boolean(peekPublicProductPage(query));
        const countWasKnown = getPublicProductCount(currentQueryKey) !== undefined;
        const result = await getPublicProductPage(query);
        if (!mounted || requestId !== productRequestIdRef.current) return;
        rememberPublicProductCount(currentQueryKey, `${window.location.pathname}${window.location.search}`, currentCategory.id, result.products.length);
        // The existing response contains both count and rows. Commit its exact
        // count and the secondary indicator first; paint matching placeholders
        // before mounting rows. No second count query or fixed delay is needed.
        setCountReadyKey(currentQueryKey);
        if (!cacheHit && !countWasKnown && result.products.length > 0 && document.visibilityState === "visible") {
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          if (!mounted || requestId !== productRequestIdRef.current) return;
        }
        setProducts(
          result.products.map((row) =>
            mapPublicProductToProduct(row, productCategory, row.category_path || currentCategory.name)
          )
        );
        setTotal(result.total);
        setLoadedProductKey(currentQueryKey);
        setLoadedCategoryId(currentCategory.id);
      } catch (loadError) {
        if (!mounted || requestId !== productRequestIdRef.current) return;
        forgetPublicProductCount(currentQueryKey);
        setProducts([]);
        setTotal(0);
        setProductError(getErrorText(loadError, "商品读取失败，请稍后重试。"));
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
  }, [resolvedCategory, filters.search, filters.page, filters.pageSize, productCategory, productQueryKey, retryNonce]);

  function handleCategorySelect(category: DisplayCategory) {
    if (selectedCategoryId === category.id && !filters.search) return;
    productRequestIdRef.current += 1;
    setSelectedCategoryId(category.id);
    setActiveCategory(category);
    setIsLoadingProducts(true);
    setLoadedProductKey("");
    setLoadedCategoryId("");
    setProducts([]);
    setTotal(0);
    setProductError("");
    updateUrl({ categorySlug: category.slug, search: "", page: 1 });
  }

  function handlePendingCategorySelect(category: DisplayCategory) {
    const targetPath = routePending?.target.split("?")[0];
    if (!targetPath) return;
    const targetQueryParam = targetPath === "/products/sim-cards" || targetPath === "/products/sms-code" ? "country" : "category";
    const params = new URLSearchParams(routePending?.target.split("?")[1] ?? "");
    params.set(targetQueryParam, category.slug);
    const href = `${targetPath}?${params.toString()}`;
    if (selectPendingCatalogCategory(pathname, targetPath, () => router.push(href))) {
      setPendingSelectedCategoryId(category.id);
    }
  }

  function submitSearch() {
    const next = draftSearch.trim();
    productRequestIdRef.current += 1;
    setRetryNonce((value) => value + 1);
    setIsLoadingProducts(true);
    setLoadedProductKey("");
    setLoadedCategoryId("");
    setProducts([]);
    setTotal(0);
    updateUrl({ search: next, page: 1 });
    productListTopRef.current?.scrollIntoView({ block: "nearest" });
  }

  function resetFilters() {
    setDraftSearch("");
    productRequestIdRef.current += 1;
    setRetryNonce((value) => value + 1);
    setIsLoadingProducts(true);
    setLoadedProductKey("");
    setLoadedCategoryId("");
    setProducts([]);
    setTotal(0);
    updateUrl({
      search: "",
      page: 1,
      pageSize: CATALOG_PAGE_SIZE,
    });
  }

  function retryLoad() {
    if (categorySnapshot.status === "error") {
      void refreshPublicCategories(true).catch(() => undefined);
    } else {
      if (resolvedCategory) {
        forgetPublicProductPage({
          primaryCategoryId: resolvedCategory.level === 1 ? resolvedCategory.id : resolvedCategory.parent_id ?? "",
          secondaryCategoryId: resolvedCategory.level === 2 ? resolvedCategory.id : "",
          keyword: filters.search,
          page: filters.page,
          pageSize: filters.pageSize,
        });
      }
      setRetryNonce((value) => value + 1);
    }
  }

  const pendingCountCategory = pendingSecondaryCategories?.find((category) => category.id === pendingSelectedCategoryId) ?? pendingSecondaryCategories?.[0];
  const pendingFilters = readFilters(new URLSearchParams(routePending?.target.split("?")[1] ?? ""));
  const pendingCountKey = pendingCountCategory ? JSON.stringify([
    routePending?.target.split(/[?#]/)[0].split("/").pop(), pendingCountCategory.id,
    pendingFilters.search, pendingFilters.page, pendingFilters.pageSize,
  ]) : "";

  return (
    <PublicLayout contentClassName={mallContentClassName}>
      <CategoryContentBoundary>
        <CategoryPanel
          pageRoute={routePending?.target.split(/[?#]/)[0] ?? `/products/${productCategory}`}
          categories={routePending ? (pendingSecondaryCategories ?? []) : secondaryCategories}
          disabled={isLoadingSecondaryCategories || Boolean(routePending && !pendingSecondaryCategories)}
          error={categorySnapshot.status === "error"}
          isLoading={isLoadingSecondaryCategories || Boolean(routePending && !pendingSecondaryCategories)}
          pendingDestination={Boolean(routePending && pendingSecondaryCategories)}
          selectionReady={!routePending && (getPublicProductCount(productQueryKey) !== undefined || countReadyKey === productQueryKey || (!isLoadingProducts && loadedProductKey === productQueryKey)) && !productError}
          selectedCategoryId={routePending ? (pendingSelectedCategoryId || pendingSecondaryCategories?.[0]?.id || "") : (resolvedCategory?.id ?? "")}
          onSelectCategory={routePending ? handlePendingCategorySelect : handleCategorySelect}
          onPrefetchCategory={(category) => { void prefetchPublicProductPage({ primaryCategoryId: category.level === 1 ? category.id : category.parent_id ?? "", secondaryCategoryId: category.level === 2 ? category.id : "", keyword: "", page: 1, pageSize: CATALOG_PAGE_SIZE }); }}
          onRetry={retryLoad}
        />
        <ProductPanel
          pageRoute={`/products/${productCategory}`}
          activeCategory={resolvedCategory}
          currencySymbol={settings.currency_symbol}
          draftSearch={draftSearch}
          appliedSearch={filters.search}
          error={categorySnapshot.status === "error" ? "商品分类读取失败，请稍后重试。" : productError}
          isLoading={
            Boolean(routePending) ||
            isLoadingProducts ||
            (!categorySnapshot.rows && categorySnapshot.status !== "error") ||
            Boolean(resolvedCategory && loadedProductKey !== productQueryKey)
          }
          loadedProductKey={loadedProductKey}
          loadedCategoryId={loadedCategoryId}
          selectedCategoryId={resolvedCategory?.id ?? ""}
          routeCategoryKey={routeCategoryKey}
          currentProductKey={productQueryKey}
          knownProductCount={getPublicProductCount(productQueryKey)}
          knownRouteProductCount={pendingCountKey ? getPublicProductCount(pendingCountKey) : routePending?.target ? getPublicProductCountForRoute(routePending.target) : undefined}
          products={products}
          routePendingTarget={routePending?.target ?? ""}
          productListTopRef={productListTopRef}
          showStock={settings.show_stock}
          total={total}
          onDraftSearchChange={setDraftSearch}
          onResetFilters={resetFilters}
          onSearchSubmit={submitSearch}
          onRetry={retryLoad}
        />
      </CategoryContentBoundary>
    </PublicLayout>
  );
}

function CategoryPanel({
  pageRoute,
  categories,
  disabled,
  error,
  isLoading,
  pendingDestination,
  selectionReady,
  selectedCategoryId,
  onPrefetchCategory,
  onSelectCategory,
  onRetry,
}: {
  pageRoute: string;
  categories: DisplayCategory[];
  disabled: boolean;
  error: boolean;
  isLoading: boolean;
  pendingDestination: boolean;
  selectionReady: boolean;
  selectedCategoryId: string;
  onPrefetchCategory: (category: DisplayCategory) => void;
  onSelectCategory: (category: DisplayCategory) => void;
  onRetry: () => void;
}) {
  const placeholderPhase = useDelayedLoading(isLoading);
  const [visualSelectionId, setVisualSelectionId] = useState("");
  useLayoutEffect(() => {
    // Text, icon ring and border must commit with the indicator, not with the
    // pending click. Keep the existing appearance while its result is loading.
    if (selectionReady && !error) setVisualSelectionId(selectedCategoryId);
    else setVisualSelectionId((current) => categories.some((category) => category.id === current) ? current : "");
  }, [categories, selectedCategoryId, selectionReady, error]);
  // Cached rows are already verified. Never cover them with the exit phase of
  // an earlier placeholder or replay their entrance animation on route mount.
  const hadCategoriesAtMount = useRef(categories.length > 0);
  const animatedInitialRows = useRef(categories.length > 0);
  useEffect(() => {
    if (categories.length > 0) animatedInitialRows.current = true;
  }, [categories]);
  const showPlaceholder = (isLoading && categories.length === 0) ||
    (!pendingDestination && !hadCategoriesAtMount.current && placeholderPhase === "leaving");
  const { containerRef, centerItem } = useProgressiveWheelMotion({
    activeId: selectedCategoryId,
    contentKey: categories.map((category) => category.id).join(","),
  });
  return (
    <Card data-testid="storefront-secondary-categories" data-catalog-secondary-route={pageRoute} data-catalog-secondary-ready={!isLoading && !error && !showPlaceholder ? "true" : "false"} data-placeholder-phase={placeholderPhase} className="relative h-full min-h-0 overflow-hidden">
      <CardContent className="h-full min-h-0 p-3">
        <div className={categoryPanelInnerClassName}>
          <div ref={containerRef} data-wheel-container="secondary" className={cn(categoryListScrollClassName, "relative")}>
            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                分类读取失败。<button type="button" className="ml-2 font-semibold underline" onClick={onRetry}>重试</button>
              </div>
            ) : categories.length === 0 && !isLoading ? (
              <div className="rounded-xl border border-dashed bg-white p-5 text-center text-sm text-muted-foreground">
                暂无二级分类
              </div>
            ) : categories.length > 0 ? categories.map((category, index) => (
              <div key={category.id} data-wheel-item={category.id} className="catalog-wheel-item relative z-10">
                <div className={animatedInitialRows.current ? undefined : "catalog-enter-item"} style={animatedInitialRows.current ? undefined : { animationDelay: `${Math.min(index * 30, 200)}ms` }}>
                  <CategoryButton
                    category={category}
                    active={visualSelectionId === category.id}
                    disabled={disabled}
                    onIntent={() => onPrefetchCategory(category)}
                    onClick={() => {
                      centerItem(category.id);
                      onSelectCategory(category);
                    }}
                  />
                </div>
              </div>
            )) : null}
            <SecondarySlidingIndicator containerRef={containerRef} activeId={selectedCategoryId} ready={selectionReady && !error} layoutKey={categories.map((category) => category.id).join(",")} />
            {showPlaceholder ? (
              <div className={cn("absolute inset-0 z-10 bg-gradient-to-b from-orange-50/95 to-white px-1 py-1 pointer-events-none", placeholderPhase === "leaving" && "catalog-placeholder-leaving")}>
                <CategoryLoadingPlaceholder count={categories.length || 5} />
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryLoadingPlaceholder({ count }: { count: number }) {
  return (
    <div className="space-y-2.5" role="status" aria-label="二级分类加载中，数量待确认">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} data-testid="catalog-secondary-skeleton-item" className="catalog-placeholder flex h-[70px] items-center gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-3" style={{ animationDelay: `${index * 35}ms` }}>
          <div className="h-11 w-11 rounded-xl bg-slate-100" />
          <div className="h-4 w-28 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function CategoryButton({
  active,
  category,
  disabled,
  onIntent,
  onClick,
}: {
  active: boolean;
  category: DisplayCategory;
  disabled: boolean;
  onIntent: () => void;
  onClick: () => void;
}) {
  const Icon = category.displayIcon ? iconMap[category.displayIcon] : KeyRound;

  return (
    <button
      onMouseEnter={onIntent}
      onFocus={onIntent}
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        interactiveButtonClass,
        "flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left disabled:cursor-default [-webkit-tap-highlight-color:transparent]",
        active
          ? "border border-transparent bg-transparent text-primary"
          : "border border-slate-100 bg-transparent text-foreground"
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
  pageRoute,
  activeCategory,
  currencySymbol,
  draftSearch,
  appliedSearch,
  error,
  isLoading,
  loadedProductKey,
  loadedCategoryId,
  selectedCategoryId,
  routeCategoryKey,
  currentProductKey,
  knownProductCount,
  knownRouteProductCount,
  products,
  routePendingTarget,
  productListTopRef,
  showStock,
  total,
  onDraftSearchChange,
  onResetFilters,
  onSearchSubmit,
  onRetry,
}: {
  pageRoute: string;
  activeCategory: DisplayCategory | null;
  currencySymbol: string;
  draftSearch: string;
  appliedSearch: string;
  error: string;
  isLoading: boolean;
  loadedProductKey: string;
  loadedCategoryId: string;
  selectedCategoryId: string;
  routeCategoryKey: string;
  currentProductKey: string;
  knownProductCount: number | undefined;
  knownRouteProductCount: number | undefined;
  products: Product[];
  routePendingTarget: string;
  productListTopRef: RefObject<HTMLDivElement>;
  showStock: boolean;
  total: number;
  onDraftSearchChange: (query: string) => void;
  onResetFilters: () => void;
  onSearchSubmit: () => void;
  onRetry: () => void;
}) {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [routeStalled, setRouteStalled] = useState(false);
  const placeholderPhase = useDelayedLoading(isLoading, 0);
  useEffect(() => {
    setRouteStalled(false);
    if (!routePendingTarget) return;
    const timer = window.setTimeout(() => setRouteStalled(true), 10000);
    return () => window.clearTimeout(timer);
  }, [routePendingTarget]);
  const { containerRef, centerItem } = useProgressiveWheelMotion({
    activeId: selectedProductId,
    contentKey: loadedProductKey,
    resetKey: activeCategory?.id,
  });
  const routeMatchesCategory = !routeCategoryKey || activeCategory?.slug === routeCategoryKey || activeCategory?.id === routeCategoryKey;
  const resultReady = !isLoading && !routePendingTarget && !!activeCategory &&
    selectedCategoryId === activeCategory.id && loadedCategoryId === activeCategory.id &&
    loadedProductKey === currentProductKey && routeMatchesCategory;
  const currentProducts = resultReady ? products : [];
  const resultText = resultReady ? String(total) : "/";

  return (
    <Card data-testid="storefront-product-list" data-catalog-route={pageRoute} data-catalog-page-ready={resultReady && !error ? "true" : "false"} aria-busy={isLoading} className="h-full min-h-0 overflow-hidden">
      <CardContent className={productPanelContentClassName}>
        <div ref={productListTopRef} className="mb-3 flex flex-col justify-between gap-3 xl:flex-row xl:items-start">
          <div className="min-w-0">
            <h1 className={cn("min-h-7 truncate text-xl font-bold", resultReady && "catalog-title-enter")}>{resultReady ? activeCategory.name : ""}</h1>
            <div data-testid="catalog-product-result-bar" className="mt-1.5 flex min-h-4 items-center gap-2 text-xs text-muted-foreground">
              <span data-testid="catalog-product-result-dot" className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />
              <span>{`当前结果 ${resultText} 个商品`}</span>
            </div>
          </div>
          <div className="flex w-full gap-2 xl:w-[760px]">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d6355]" />
              <Input
                disabled={Boolean(routePendingTarget)}
                value={draftSearch}
                onChange={(event) => onDraftSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSearchSubmit();
                }}
                placeholder="搜索商品、SKU、规格或分类"
                className="h-10 rounded-lg border-[#ead9cc] bg-[#fffaf6] pl-11 text-sm text-[#6f5a4d] placeholder:text-[#8a6f60] focus-visible:ring-primary/25"
              />
            </div>
            <Button type="button" disabled={Boolean(routePendingTarget)} onClick={onSearchSubmit} className="h-10 w-[92px] rounded-lg bg-[#df7334] text-sm font-medium hover:bg-[#d7672a]">
              搜索
            </Button>
          </div>
        </div>

        {routePendingTarget ? (
          <div data-testid="catalog-route-pending" role="status" aria-label="商品区域加载中" className="min-h-0 flex-1 overflow-auto px-1.5 py-1 text-sm text-slate-700">
            {routeStalled ? <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3"><p className="font-medium">目标分类仍在加载。</p><button type="button" className="mt-2 font-semibold text-primary underline" onClick={() => window.location.assign(routePendingTarget)}>重试加载目标分类</button></div> : null}
            {placeholderPhase === "visible" ? <ProductLoadingPlaceholder knownCount={knownRouteProductCount} /> : null}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button type="button" className="ml-3 font-semibold underline" onClick={onRetry}>
              重试
            </button>
          </div>
        ) : (
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {resultReady && currentProducts.length === 0 ? (
              <ProductEmptyState search={appliedSearch} onResetFilters={onResetFilters} />
            ) : (
              <div ref={containerRef} data-wheel-container="products" className={cn("scroll-fade-y relative h-full min-h-0 space-y-2.5 overflow-y-auto px-1.5 py-1 pr-2 sidebar-scroll", isLoading && currentProducts.length > 0 && "catalog-exiting")}>
                {currentProducts.map((product, index) => (
                  <div key={`${loadedProductKey}-${product.id}`} data-wheel-item={product.id} className="catalog-wheel-item">
                    <div className="catalog-enter-item" style={{ animationDelay: `${Math.min(index * 35, 210)}ms` }}>
                      <ProductRowCompact
                        product={product}
                        currencySymbol={currencySymbol}
                        showStock={showStock}
                        disabled={!resultReady}
                        onSelect={() => {
                          setSelectedProductId(product.id);
                          centerItem(product.id);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isLoading && placeholderPhase === "visible" ? <div className="absolute inset-0 bg-white/90 pointer-events-none">
              <ProductLoadingPlaceholder knownCount={knownProductCount} />
            </div> : null}
          </div>
        )}

      </CardContent>
    </Card>
  );
}

function ProductRow({ currencySymbol, product, showStock }: { currencySymbol: string; product: Product; showStock: boolean }) {
  const router = useRouter();
  const stock = product.stock ?? 0;
  const imageSrc = product.imageUrl || productImageFallbackSrc;
  const minPrice = Number(product.metadata?.minPrice ?? product.price);
  const maxPrice = Number(product.metadata?.maxPrice ?? product.price);
  const hasSkus = Boolean(product.metadata?.hasSkus);
  const priceText = hasSkus && maxPrice > minPrice
    ? `${currencySymbol}${minPrice.toFixed(2)}-${currencySymbol}${maxPrice.toFixed(2)}`
    : `${currencySymbol}${product.price.toFixed(2)}`;

  return (
    <button type="button" onClick={() => router.push(checkoutHref(product.id, window.location.pathname + window.location.search))} className={cn(compactProductRowClassName, "group")}>
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

function ProductRowCompact({ currencySymbol, product, showStock, disabled, onSelect }: { currencySymbol: string; product: Product; showStock: boolean; disabled: boolean; onSelect: () => void }) {
  const router = useRouter();
  const stock = Number(product.stock ?? 0);
  const imageSrc = product.imageUrl || productImageFallbackSrc;
  const minPrice = Number(product.metadata?.minPrice ?? product.price);
  const maxPrice = Number(product.metadata?.maxPrice ?? product.price);
  const hasSkus = Boolean(product.metadata?.hasSkus);
  const hasStock = stock > 0 && product.stockStatus !== "out-of-stock";
  const priceText = hasSkus && maxPrice > minPrice
    ? `${currencySymbol}${minPrice.toFixed(2)}-${currencySymbol}${maxPrice.toFixed(2)}`
    : `${currencySymbol}${product.price.toFixed(2)}`;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        onSelect();
        router.push(checkoutHref(product.id, window.location.pathname + window.location.search));
      }}
      className={cn(compactProductRowClassName, "group")}
    >
      <div className="flex h-full min-w-0 items-center gap-5">
        <img
          src={imageSrc}
          alt={product.name}
          onError={(event) => setProductImageFallback(event.currentTarget)}
          className="h-12 w-12 shrink-0 rounded-xl bg-white object-cover"
        />
        <div className="min-w-0 flex-1 text-left">
          <div className="line-clamp-1 text-base font-semibold text-slate-700 group-hover:text-primary">
            {product.name}
          </div>
          {product.description ? (
            <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {product.description}
            </div>
          ) : null}
          {hasSkus ? (
            <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">多 SKU</span>
            </div>
          ) : null}
        </div>
        {showStock ? (
          <div
            className={cn(
              "hidden min-w-[96px] shrink-0 items-center justify-center gap-1 text-center text-sm font-semibold md:flex",
              hasStock ? "text-green-600" : "text-red-500"
            )}
          >
            <span>库存</span>
            <span>{stock}</span>
          </div>
        ) : null}
        {product.originalPrice ? (
          <div className="hidden shrink-0 text-sm text-muted-foreground line-through lg:block">
            {currencySymbol}{Number(product.originalPrice).toFixed(2)}
          </div>
        ) : null}
        <div className="min-w-[92px] shrink-0 text-center text-lg font-bold text-blue-600">
          {hasStock ? priceText : "已售罄"}
        </div>
      </div>
    </button>
  );
}

function ProductSkeleton({ count }: { count: number }) {
  return (
    <div className="h-full space-y-2.5 overflow-hidden px-1.5 py-1 pr-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} data-testid="catalog-product-skeleton-item" className="catalog-placeholder h-[86px] rounded-xl border border-slate-100 bg-slate-50 p-4" style={{ animationDelay: `${index * 35}ms` }}>
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

function ProductLoadingPlaceholder({ knownCount }: { knownCount: number | undefined }) {
  if (knownCount === 0) return null;
  if (knownCount !== undefined) return <ProductSkeleton count={knownCount} />;
  return <div data-testid="catalog-product-count-unknown" role="status" aria-label="商品加载中，三张为临时占位，实际数量待确认"><ProductSkeleton count={3} /></div>;
}

function ProductEmptyState({ search, onResetFilters }: { search: string; onResetFilters: () => void }) {
  return (
    <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed bg-slate-50 text-center">
      <div>
        <p className="text-base font-semibold text-slate-800">暂无商品</p>
        <p className="mt-1 break-words px-4 text-sm text-muted-foreground">{search ? `没有找到与“${search}”相关的商品。` : "当前分类还没有可售的商品。"}</p>
        {search ? <Button type="button" variant="outline" className="mt-4" onClick={onResetFilters}>
          清空搜索
        </Button> : null}
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




