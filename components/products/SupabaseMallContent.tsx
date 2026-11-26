"use client";

import { Suspense, type RefObject, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { checkoutHref } from "@/lib/products/checkout-navigation";
import { getPublicStockDisplay } from "@/lib/products/delivery-and-stock";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Gift,
  KeyRound,
  LayoutGrid,
  Loader2,
  MessageCircle,
  Phone,
  Search,
  Sparkles,
  Wallet,
} from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { useMobileStorefront } from "@/hooks/use-mobile-storefront";
import { usePublicSettings } from "@/components/settings/SettingsProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Product, ProductCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { refreshPublicCategories, usePublicCategorySnapshot } from "@/lib/catalog/public-category-snapshot";
import { simRegionCode, fallbackCategoriesByPath, type StorefrontFallbackCategory } from "@/lib/catalog/storefront-category-visuals";
import { clearPublicProductCounts, forgetPublicProductCount, getPublicProductCount, getPublicProductCountForRoute, rememberPublicProductCount, retainVisiblePublicProductCounts, subscribePublicProductCounts, getPublicProductCountVersion, getServerPublicProductCountVersion } from "@/lib/catalog/public-product-count-cache";
import { forgetPublicProductPage, getPublicProductPage, peekPublicProductPage, prefetchPublicProductPage, publicProductQueryKey } from "@/lib/catalog/public-product-query-cache";
import { useProgressiveWheelMotion } from "@/hooks/use-progressive-wheel-motion";
import { WHEEL_CONFIG } from "@/lib/motion/progressive-wheel";
import { findVisibleStorefrontPrimaryCategory, storefrontCategoryPaths } from "@/lib/catalog/visible-storefront-category-routes";
import { clearCatalogRoutePending, consumeIntendedCatalogCategory, getCatalogRoutePending, getServerCatalogRoutePending, selectPendingCatalogCategory, subscribeCatalogRoutePending } from "@/lib/motion/catalog-route-exit";
import {
  computeProductSalesCount,
  findPrimaryCategory,
  getChildCategories,
  getErrorText,
  mapPublicProductToProduct,
  normalizeText,
  type PublicCatalogConfig,
  type PublicCategory,
} from "@/lib/supabase/public-catalog";
import CategoryContentBoundary from "./CategoryContentBoundary";
import OptionLoadingSpinner from "@/components/ui/OptionLoadingSpinner";
import selectionMotion from "@/components/ui/SelectionMotion.module.css";
import catalogMotion from "./CatalogSelectionMotion.module.css";
import {
  categoryListScrollClassName,
  categoryPanelInnerClassName,
  compactProductRowClassName,
  interactiveButtonClass,
  mallContentClassName,
  productImageFallbackSrc,
  productPanelContentClassName,
  resolveProductImageSrc,
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
  displayCode?: string;
  displayImage?: string;
  displayIcon?: keyof typeof iconMap;
};

type FilterState = {
  search: string;
  page: number;
  pageSize: number;
};

const CATALOG_PAGE_SIZE = 500;

export function extractProductSubcategoryLabel(product: {
  description?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown> | null;
}): string {
  const fromMeta =
    product.metadata && typeof product.metadata.subcategory === "string"
      ? product.metadata.subcategory.trim()
      : "";
  if (fromMeta) return fromMeta;
  const raw = String(product.description || product.detail || "").trim();
  const match = raw.match(/^【([^】]{1,60})】/);
  return match?.[1]?.trim() ?? "";
}

function normalizeSubcategoryMatch(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/[｢「『]/g, "「")
    .replace(/[｣」』]/g, "」")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getDefaultSubcategoryForCategory(category: DisplayCategory | null | undefined): string {
  if (!category) return "";
  const slug = normalizeText(category.slug);
  const name = normalizeText(category.name);
  const configured = category.metadata?.subcategories ?? [];
  if ((slug === "telegram" || name === "telegram") && configured.length >= 2) {
    return configured[0]?.name?.trim() ?? "";
  }
  return "";
}

export function stripProductSubcategoryPrefix(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/^【[^】]{1,60}】\s*/, "").trim();
}

function matchCategoryByRouteKey(category: DisplayCategory, rawRouteKey: string) {
  const key = normalizeText(rawRouteKey);
  if (!key) return false;
  const slug = normalizeText(category.slug);
  const name = normalizeText(category.name);
  const code = category.displayCode ? normalizeText(category.displayCode) : "";
  const strippedSlug = slug.replace(/^sim-cards?-|^digital-accounts?-|^ai-membership-|^gift-cards?-/, "");
  return (
    category.slug === rawRouteKey ||
    category.id === rawRouteKey ||
    slug === key ||
    strippedSlug === key ||
    name === key ||
    code === key ||
    (key === "giffgaff" && (code === "uk" || slug.includes("uk") || name.includes("英国"))) ||
    (key === "one-nz" && (code === "nz" || slug.includes("nz") || name.includes("新西兰"))) ||
    (key === "haha-sim" && (code === "hk" || slug.includes("hk") || name.includes("香港"))) ||
    (key === "rakuten-mobile" && (code === "jp" || slug.includes("jp") || name.includes("日本")))
  );
}

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
  fallbackTitle,
  primaryNames,
  primarySlugs,
  productCategory,
  queryParam = "category",
}: SupabaseMallContentProps) {
  const pathname = usePathname();
  const router = useRouter();
  const pendingRoute = useSyncExternalStore(subscribeCatalogRoutePending, getCatalogRoutePending, getServerCatalogRoutePending);
  const routeTargetBase = pendingRoute?.target ? pendingRoute.target.split("?")[0] : "";
  const routePending = pendingRoute?.source === pathname && routeTargetBase !== pathname ? pendingRoute : null;
  const searchParams = useSearchParams();
  const routeSearch = searchParams.toString();
  const [localParams, setLocalParams] = useState(() => {
    const initial = new URLSearchParams(routeSearch);
    const intended = consumeIntendedCatalogCategory(pathname);
    if (intended && !initial.get(intended.queryParam)) {
      initial.set(intended.queryParam, intended.slug);
    }
    return initial;
  });
  const lastRouteSearchRef = useRef(routeSearch);
  const { settings } = usePublicSettings();
  const { isMobile } = useMobileStorefront();

  useEffect(() => {
    const intended = consumeIntendedCatalogCategory(pathname);
    clearCatalogRoutePending();
    const shell = document.querySelector<HTMLElement>('[data-testid="storefront-category-layout"]');
    shell?.removeAttribute("data-route-exiting");
    if (intended) {
      const next = new URLSearchParams(window.location.search);
      if (!next.get(intended.queryParam)) {
        next.set(intended.queryParam, intended.slug);
        window.history.replaceState(window.history.state, "", `${pathname}?${next.toString()}`);
        setLocalParams(next);
      }
    }
  }, [pathname]);
  const categorySnapshot = usePublicCategorySnapshot();
  useSyncExternalStore(subscribePublicProductCounts, getPublicProductCountVersion, getServerPublicProductCountVersion);
  const [activeCategory, setActiveCategory] = useState<DisplayCategory | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
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
  useEffect(() => {
    if (routeSearch === lastRouteSearchRef.current) return;
    lastRouteSearchRef.current = routeSearch;
    if (typeof window !== "undefined") {
      const currentWindowParams = new URLSearchParams(window.location.search);
      const nextRouteParams = new URLSearchParams(routeSearch);
      // Preserve an in-page replaceState category selection if Next.js emits an empty late routeSearch
      if (!nextRouteParams.get(queryParam) && currentWindowParams.get(queryParam)) {
        setLocalParams(currentWindowParams);
        return;
      }
      setLocalParams(nextRouteParams);
    } else {
      setLocalParams(new URLSearchParams(routeSearch));
    }
  }, [queryParam, routeSearch]);
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
        displayCode: visuals === fallbackCategoriesByPath["/products/sim-cards"] && category.parent_id ? simRegionCode(category.slug, category.name) : undefined,
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

  const allMobileSecondaryCategories = useMemo(() => {
    const rows = categorySnapshot.rows;
    if (!rows) return secondaryCategories;
    const seen = new Set<string>();
    const list: DisplayCategory[] = [];
    for (const item of secondaryCategories) {
      seen.add(item.id);
      list.push(item);
    }
    for (const path of storefrontCategoryPaths) {
      const primary = findVisibleStorefrontPrimaryCategory(path, rows);
      if (!primary) continue;
      const visuals = fallbackCategoriesByPath[path] ?? [];
      const children = getChildCategories(rows, primary.id);
      if (children.length > 0) {
        for (const child of children) {
          if (seen.has(child.id)) continue;
          seen.add(child.id);
          list.push(attachFallbackVisual(child, visuals));
        }
      } else if (!seen.has(primary.id)) {
        seen.add(primary.id);
        list.push(attachFallbackVisual(primary, visuals));
      }
    }
    return list.length > 0 ? list : secondaryCategories;
  }, [attachFallbackVisual, categorySnapshot.rows, secondaryCategories]);

  const activeCategoryPool = isMobile
    ? (secondaryCategories.length > 0 ? secondaryCategories : allMobileSecondaryCategories)
    : secondaryCategories;

  // Avoid firing 14+ simultaneous category prefetches on mount; hover/focus
  // intent prefetch handles instant switching without saturating bandwidth.

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
    const routeChoice = activeCategoryPool.find((category) => matchCategoryByRouteKey(category, routeCategoryKey));
    const currentChoice = activeCategoryPool.find((category) => category.id === activeCategory?.id);
    return routeChoice ?? currentChoice ?? secondaryCategories[0] ?? attachFallbackVisual(primary);
  }, [activeCategory?.id, activeCategoryPool, attachFallbackVisual, categorySnapshot.rows, config, routeCategoryKey, secondaryCategories]);

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
    if (typeof document === "undefined") return;
    const baseTitle = fallbackTitle || primaryNames[0] || "商品分类";
    const subTitle = resolvedCategory?.name ? `${resolvedCategory.name} · ${baseTitle}` : baseTitle;
    document.title = `${subTitle} | Jianlian Shop`;
  }, [fallbackTitle, primaryNames, resolvedCategory?.name]);

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
      activeCategoryPool.find((category) => matchCategoryByRouteKey(category, routeCategoryKey)) ??
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
    setSelectedCategoryId((prev) => {
      if (prev !== selected.id) {
        setSelectedSubcategory(getDefaultSubcategoryForCategory(selected));
      }
      return selected.id;
    });
  }, [activeCategoryPool, attachFallbackVisual, categorySnapshot.rows, categorySnapshot.status, config, routeCategoryKey, secondaryCategories]);

  const effectiveSubcategory = useMemo(() => {
    if (selectedCategoryId && resolvedCategory?.id === selectedCategoryId) {
      return selectedSubcategory;
    }
    return selectedSubcategory || getDefaultSubcategoryForCategory(resolvedCategory);
  }, [resolvedCategory, selectedCategoryId, selectedSubcategory]);

  const productQueryKey = JSON.stringify([productCategory, resolvedCategory?.id ?? "", effectiveSubcategory, filters.search, filters.page, filters.pageSize]);

  useEffect(() => {
    if (!resolvedCategory || loadedProductKey !== productQueryKey) return;
    const query = {
      primaryCategoryId: resolvedCategory.level === 1 ? resolvedCategory.id : resolvedCategory.parent_id ?? "",
      secondaryCategoryId: resolvedCategory.level === 2 ? resolvedCategory.id : "",
      subcategory: effectiveSubcategory,
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
  }, [effectiveSubcategory, filters.page, filters.pageSize, filters.search, loadedProductKey, productQueryKey, resolvedCategory]);

  const resolvedCategoryId = resolvedCategory?.id ?? "";
  const resolvedCategoryLevel = resolvedCategory?.level ?? 0;
  const resolvedCategoryParentId = resolvedCategory?.parent_id ?? "";
  const resolvedCategoryName = resolvedCategory?.name ?? "";

  useEffect(() => {
    if (!resolvedCategoryId) {
      setIsLoadingProducts(false);
      return;
    }

    const currentQueryKey = productQueryKey;
    let mounted = true;
    const requestId = productRequestIdRef.current + 1;
    productRequestIdRef.current = requestId;

    async function loadProducts() {
      setProductError("");
      try {
        const primaryCategoryId = resolvedCategoryLevel === 1 ? resolvedCategoryId : resolvedCategoryParentId;
        const secondaryCategoryId = resolvedCategoryLevel === 2 ? resolvedCategoryId : "";
        if (!primaryCategoryId) {
          forgetPublicProductCount(currentQueryKey);
          setProducts([]);
          setTotal(0);
          return;
        }
        const query = {
          primaryCategoryId,
          secondaryCategoryId,
          subcategory: effectiveSubcategory,
          keyword: filters.search,
          page: filters.page,
          pageSize: filters.pageSize,
        };
        const cachedPage = peekPublicProductPage(query);
        const cacheHit = Boolean(cachedPage);
        if (cachedPage) {
          rememberPublicProductCount(currentQueryKey, `${window.location.pathname}${window.location.search}`, resolvedCategoryId, cachedPage.products.length);
          setCountReadyKey(currentQueryKey);
          setProducts(
            cachedPage.products.map((row) =>
              mapPublicProductToProduct(row, productCategory, row.category_path || resolvedCategoryName)
            )
          );
          setTotal(cachedPage.total);
          setLoadedProductKey(currentQueryKey);
          setLoadedCategoryId(resolvedCategoryId);
          setIsLoadingProducts(false);
        } else {
          setIsLoadingProducts(true);
          setCountReadyKey("");
          setLoadedProductKey("");
          setLoadedCategoryId("");
          setProducts([]);
          setTotal(0);
        }
        const countWasKnown = getPublicProductCount(currentQueryKey) !== undefined;
        const result = await getPublicProductPage(query);
        if (!mounted || requestId !== productRequestIdRef.current) return;
        rememberPublicProductCount(currentQueryKey, `${window.location.pathname}${window.location.search}`, resolvedCategoryId, result.products.length);
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
            mapPublicProductToProduct(row, productCategory, row.category_path || resolvedCategoryName)
          )
        );
        setTotal(result.total);
        setLoadedProductKey(currentQueryKey);
        setLoadedCategoryId(resolvedCategoryId);
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
  }, [resolvedCategoryId, resolvedCategoryLevel, resolvedCategoryParentId, resolvedCategoryName, effectiveSubcategory, filters.search, filters.page, filters.pageSize, productCategory, productQueryKey, retryNonce]);

  function handleCategorySelect(category: DisplayCategory, initialSubcategory = "") {
    clearCatalogRoutePending();
    const shell = document.querySelector<HTMLElement>('[data-testid="storefront-category-layout"]');
    shell?.removeAttribute("data-route-exiting");
    const defaultSubcategory = getDefaultSubcategoryForCategory(category);
    const resolvedInitialSub = initialSubcategory || defaultSubcategory;
    if (selectedCategoryId === category.id && !filters.search) {
      if (initialSubcategory) {
        setSelectedSubcategory((current) =>
          current === initialSubcategory ? (defaultSubcategory ? current : "") : initialSubcategory
        );
      } else if (selectedSubcategory && !defaultSubcategory) {
        setSelectedSubcategory("");
      }
      return;
    }
    productRequestIdRef.current += 1;
    setSelectedCategoryId(category.id);
    setSelectedSubcategory(resolvedInitialSub);
    setActiveCategory(category);
    setProductError("");

    const primaryCategoryId = category.level === 1 ? category.id : category.parent_id ?? "";
    const secondaryCategoryId = category.level === 2 ? category.id : "";
    const query = {
      primaryCategoryId,
      secondaryCategoryId,
      subcategory: resolvedInitialSub,
      keyword: "",
      page: 1,
      pageSize: CATALOG_PAGE_SIZE,
    };
    const nextProductKey = JSON.stringify([productCategory, category.id, resolvedInitialSub, "", 1, CATALOG_PAGE_SIZE]);
    const cached = peekPublicProductPage(query);
    if (cached) {
      setProducts(
        cached.products.map((row) =>
          mapPublicProductToProduct(row, productCategory, row.category_path || category.name)
        )
      );
      setTotal(cached.total);
      setIsLoadingProducts(false);
      setLoadedCategoryId(category.id);
      setLoadedProductKey(nextProductKey);
      setCountReadyKey(nextProductKey);
      rememberPublicProductCount(nextProductKey, `/products/${productCategory}?${queryParam}=${category.slug}`, category.id, cached.products.length);
    } else {
      setIsLoadingProducts(true);
      setLoadedProductKey("");
      setLoadedCategoryId("");
      setProducts([]);
      setTotal(0);
    }
    updateUrl({ categorySlug: category.slug, search: "", page: 1 });
  }

  function handlePendingCategorySelect(category: DisplayCategory) {
    const targetPath = routePending?.target.split("?")[0];
    if (!targetPath) return;
    const targetQueryParam = targetPath === "/products/sim-cards" || targetPath === "/products/sms-code" ? "country" : "category";
    const params = new URLSearchParams(routePending?.target.split("?")[1] ?? "");
    params.set(targetQueryParam, category.slug);
    const href = `${targetPath}?${params.toString()}`;
    const primaryId = category.level === 1 ? category.id : category.parent_id ?? "";
    const secondaryId = category.level === 2 ? category.id : "";
    if (primaryId) {
      void prefetchPublicProductPage({
        primaryCategoryId: primaryId,
        secondaryCategoryId: secondaryId,
        subcategory: getDefaultSubcategoryForCategory(category),
        keyword: "",
        page: 1,
        pageSize: CATALOG_PAGE_SIZE,
      });
    }
    if (
      selectPendingCatalogCategory(pathname, targetPath, () => router.push(href), {
        slug: category.slug,
        id: category.id,
        queryParam: targetQueryParam,
      })
    ) {
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
          subcategory: effectiveSubcategory,
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

  const availableSubcategories = useMemo(() => {
    const configured = resolvedCategory?.metadata?.subcategories ?? [];
    const seenLower = new Set<string>();
    const list: Array<{ name: string; slug: string; sort_order: number }> = [];
    for (const item of configured) {
      const name = item.name.trim();
      const lower = normalizeSubcategoryMatch(name);
      if (!name || seenLower.has(lower)) continue;
      seenLower.add(lower);
      list.push(item);
    }
    for (const prod of products) {
      const label = extractProductSubcategoryLabel(prod);
      const lower = normalizeSubcategoryMatch(label);
      if (label && !seenLower.has(lower)) {
        seenLower.add(lower);
        list.push({ name: label, slug: label, sort_order: (list.length + 1) * 10 });
      }
    }
    return list;
  }, [resolvedCategory?.metadata?.subcategories, products]);

  const filteredProducts = useMemo(() => {
    const isOutOfStock = (prod: Product) => {
      const sd = getPublicStockDisplay(prod.stock, { metadata: prod.metadata });
      return !sd.available || (prod.stockStatus === "out-of-stock" && sd.code !== "preorder");
    };
    if (effectiveSubcategory) {
      const targetNorm = normalizeSubcategoryMatch(effectiveSubcategory);
      return products
        .filter((prod) => {
          const label = extractProductSubcategoryLabel(prod);
          return !label || normalizeSubcategoryMatch(label) === targetNorm;
        })
        .map((prod, index) => ({ prod, index, out: isOutOfStock(prod) ? 1 : 0 }))
        .sort((a, b) => a.out - b.out || a.index - b.index)
        .map((entry) => entry.prod);
    }
    const subOrder = new Map<string, number>();
    availableSubcategories.forEach((sub, idx) => {
      subOrder.set(normalizeSubcategoryMatch(sub.name), idx);
    });
    const fallbackRank = availableSubcategories.length;
    return products
      .map((prod, index) => ({
        prod,
        index,
        out: isOutOfStock(prod) ? 1 : 0,
        rank: subOrder.get(normalizeSubcategoryMatch(extractProductSubcategoryLabel(prod))) ?? fallbackRank,
      }))
      .sort((a, b) => a.out - b.out || a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.prod);
  }, [products, effectiveSubcategory, availableSubcategories]);

  const [discoveredSubcategoriesByCategory, setDiscoveredSubcategoriesByCategory] = useState<
    Record<string, Array<{ name: string; slug: string; sort_order: number }>>
  >({});

  useEffect(() => {
    if (!resolvedCategory?.id || availableSubcategories.length === 0) return;
    setDiscoveredSubcategoriesByCategory((prev) => {
      const existing = prev[resolvedCategory.id];
      if (
        existing &&
        existing.length === availableSubcategories.length &&
        existing.every((item, idx) => item.name === availableSubcategories[idx]?.name)
      ) {
        return prev;
      }
      return { ...prev, [resolvedCategory.id]: availableSubcategories };
    });
  }, [resolvedCategory?.id, availableSubcategories]);

  const handleSubcategoryToggle = useCallback(
    (subName: string) => {
      const fallbackSub = getDefaultSubcategoryForCategory(resolvedCategory);
      setSelectedSubcategory((current) =>
        normalizeSubcategoryMatch(current) === normalizeSubcategoryMatch(subName)
          ? (fallbackSub ? current : "")
          : subName
      );
      productListTopRef.current?.scrollIntoView({ block: "nearest" });
    },
    [resolvedCategory]
  );

  return (
    <PublicLayout contentClassName={cn(mallContentClassName, isMobile && "!px-3 !py-2.5 !overflow-visible")}>
      <CategoryContentBoundary>
        <CategoryPanel
          pageRoute={routePending?.target.split(/[?#]/)[0] ?? `/products/${productCategory}`}
          categories={routePending ? (pendingSecondaryCategories ?? []) : activeCategoryPool}
          disabled={isLoadingSecondaryCategories || Boolean(routePending && !pendingSecondaryCategories)}
          error={categorySnapshot.status === "error"}
          isLoading={isLoadingSecondaryCategories || Boolean(routePending && !pendingSecondaryCategories)}
          isLoadingProducts={
            Boolean(routePending) ||
            isLoadingProducts ||
            Boolean(resolvedCategory && loadedProductKey !== productQueryKey)
          }
          pendingDestination={Boolean(routePending && pendingSecondaryCategories)}
          selectionReady={!routePending && (getPublicProductCount(productQueryKey) !== undefined || countReadyKey === productQueryKey || (!isLoadingProducts && loadedProductKey === productQueryKey)) && !productError}
          selectedCategoryId={routePending ? (pendingSelectedCategoryId || pendingSecondaryCategories?.[0]?.id || "") : (resolvedCategory?.id ?? "")}
          selectedSubcategory={effectiveSubcategory}
          activeCategorySubcategories={availableSubcategories}
          discoveredSubcategoriesByCategory={discoveredSubcategoriesByCategory}
          onSelectCategory={routePending ? handlePendingCategorySelect : handleCategorySelect}
          onSelectSubcategory={handleSubcategoryToggle}
          onPrefetchCategory={(category) => {
            void prefetchPublicProductPage({
              primaryCategoryId: category.level === 1 ? category.id : category.parent_id ?? "",
              secondaryCategoryId: category.level === 2 ? category.id : "",
              subcategory: getDefaultSubcategoryForCategory(category),
              keyword: "",
              page: 1,
              pageSize: CATALOG_PAGE_SIZE,
            });
          }}
          onRetry={retryLoad}
        />
        <ProductPanel
          pageRoute={`/products/${productCategory}`}
          activeCategory={resolvedCategory}
          selectedSubcategory={effectiveSubcategory}
          availableSubcategories={availableSubcategories}
          onSelectSubcategory={handleSubcategoryToggle}
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
          products={filteredProducts}
          routePendingTarget={routePending?.target ?? ""}
          productListTopRef={productListTopRef}
          showStock={settings.show_stock}
          total={effectiveSubcategory ? total || filteredProducts.length : total}
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
  isLoadingProducts = false,
  pendingDestination,
  selectionReady,
  selectedCategoryId,
  selectedSubcategory = "",
  activeCategorySubcategories = [],
  discoveredSubcategoriesByCategory = {},
  onPrefetchCategory,
  onSelectCategory,
  onSelectSubcategory,
  onRetry,
}: {
  pageRoute: string;
  categories: DisplayCategory[];
  disabled: boolean;
  error: boolean;
  isLoading: boolean;
  isLoadingProducts?: boolean;
  pendingDestination: boolean;
  selectionReady: boolean;
  selectedCategoryId: string;
  selectedSubcategory?: string;
  activeCategorySubcategories?: Array<{ name: string; slug: string; sort_order: number }>;
  discoveredSubcategoriesByCategory?: Record<string, Array<{ name: string; slug: string; sort_order: number }>>;
  onPrefetchCategory: (category: DisplayCategory) => void;
  onSelectCategory: (category: DisplayCategory, initialSubcategory?: string) => void;
  onSelectSubcategory?: (subName: string) => void;
  onRetry: () => void;
}) {
  const placeholderPhase = useDelayedLoading(isLoading);
  const { isMobile } = useMobileStorefront();
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [visualSelectionId, setVisualSelectionId] = useState("");
  const [clickedCategoryId, setClickedCategoryId] = useState("");
  const [clickPulseId, setClickPulseId] = useState("");
  const [navigatingProductCategoryId, setNavigatingProductCategoryId] = useState("");
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<string[]>(() =>
    selectedCategoryId ? [selectedCategoryId] : []
  );
  const lastExpandedRouteRef = useRef(pageRoute);
  const lastAutoExpandedSelectionRef = useRef(selectedCategoryId);

  useEffect(() => {
    if (lastExpandedRouteRef.current !== pageRoute) {
      lastExpandedRouteRef.current = pageRoute;
      lastAutoExpandedSelectionRef.current = selectedCategoryId;
      setExpandedCategoryIds(selectedCategoryId ? [selectedCategoryId] : []);
      return;
    }
    if (selectedCategoryId && selectedCategoryId !== lastAutoExpandedSelectionRef.current) {
      lastAutoExpandedSelectionRef.current = selectedCategoryId;
      // Clean single-open accordion: switching categories smoothly collapses the previous sub-tree.
      setExpandedCategoryIds([selectedCategoryId]);
    }
  }, [pageRoute, selectedCategoryId]);

  useEffect(() => {
    const handleProductNavStart = (event: Event) => {
      const custom = event as CustomEvent<{ categoryId?: string }>;
      const targetCatId = custom.detail?.categoryId || selectedCategoryId || visualSelectionId;
      if (targetCatId) {
        setNavigatingProductCategoryId(targetCatId);
      }
    };
    window.addEventListener("jianlian:product-navigation-start", handleProductNavStart);
    return () => {
      window.removeEventListener("jianlian:product-navigation-start", handleProductNavStart);
    };
  }, [selectedCategoryId, visualSelectionId]);

  useEffect(() => {
    setNavigatingProductCategoryId("");
  }, [selectedCategoryId, pageRoute]);

  useEffect(() => {
    if (!clickedCategoryId) return;
    if (!isLoadingProducts && selectedCategoryId === clickedCategoryId) {
      const timer = window.setTimeout(() => setClickedCategoryId(""), 60);
      return () => window.clearTimeout(timer);
    }
    const maxTimer = window.setTimeout(() => setClickedCategoryId(""), 3500);
    return () => window.clearTimeout(maxTimer);
  }, [clickedCategoryId, isLoadingProducts, selectedCategoryId]);

  useIsomorphicLayoutEffect(() => {
    // Immediately reflect the clicked secondary category so selection feedback is 0ms instant
    if (!error && selectedCategoryId) setVisualSelectionId(selectedCategoryId);
    else setVisualSelectionId((current) => categories.some((category) => category.id === current) ? current : "");
  }, [categories, selectedCategoryId, selectionReady, error]);
  // Cached rows are already verified. Never cover them with the exit phase of
  // an earlier placeholder or replay their entrance animation on route mount.
  const hadCategoriesAtMount = useRef(categories.length > 0);
  const animatedInitialRows = useRef(categories.length > 0);
  useEffect(() => {
    if (categories.length > 0) animatedInitialRows.current = true;
  }, [categories]);
  const showPlaceholder = isLoading && categories.length === 0;
  const { containerRef, centerItem } = useProgressiveWheelMotion({
    activeId: selectedCategoryId,
    contentKey: categories.map((category) => category.id).join(","),
    minScale: WHEEL_CONFIG.secondaryMinScale,
  });
  return (
    <Card data-testid="storefront-secondary-categories" data-catalog-secondary-route={pageRoute} data-catalog-secondary-ready={!isLoading && !error && !showPlaceholder ? "true" : "false"} data-placeholder-phase={placeholderPhase} className={cn("relative min-h-0 overflow-hidden lg:h-full", isMobile && "!border-orange-100/80 !shadow-xs !rounded-2xl sticky top-[58px] self-start min-h-[calc(100dvh-72px)] overflow-y-auto")}>
      <CardContent className={cn("h-full min-h-0 p-3", isMobile && "!p-1")}>
        <div className={cn(categoryPanelInnerClassName, isMobile && "!bg-transparent")}>
          {isMobile && categories.length > 0 ? (
            <div className="mb-2 flex items-center justify-center gap-1 border-b border-orange-100/80 pb-2 pt-0.5 text-center">
              <span className="text-xs font-bold text-slate-700">分类</span>
              <span className="rounded-full bg-orange-100/90 px-2 py-0.5 text-[11px] font-bold text-primary">
                ({categories.length})
              </span>
            </div>
          ) : null}
          <div
            ref={containerRef}
            data-wheel-container="secondary"
            className={cn(
              categoryListScrollClassName,
              "relative",
              isMobile && "!flex !flex-col !gap-2 !overflow-y-auto !overflow-x-hidden !space-y-0 !p-1"
            )}
          >
            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-2 text-center text-xs text-red-700">
                失败 <button type="button" className="font-semibold underline" onClick={onRetry}>重试</button>
              </div>
            ) : categories.length === 0 && !isLoading ? (
              <div className="rounded-xl border border-dashed bg-white p-3 text-center text-xs text-muted-foreground">
                暂无分类
              </div>
            ) : categories.length > 0 ? categories.map((category, index) => {
              const isSelected = visualSelectionId === category.id;
              const cachedSubItems = discoveredSubcategoriesByCategory[category.id];
              const subItems = isSelected
                ? (activeCategorySubcategories.length > 0 ? activeCategorySubcategories : (cachedSubItems ?? category.metadata?.subcategories ?? []))
                : (cachedSubItems ?? category.metadata?.subcategories ?? []);
              // Only show expandable sub-directory when a category has 2 or more subcategories.
              const hasSubcategories = subItems.length >= 2;
              const isExpanded = hasSubcategories && expandedCategoryIds.includes(category.id);
              return (
              <div key={`${pageRoute}-${category.id}`} data-wheel-item={category.id} className={cn("catalog-wheel-item relative z-10 shrink-0 lg:shrink", isMobile && "!w-full")}>
                <div className={isMobile ? undefined : "catalog-enter-item"} style={isMobile ? undefined : { animationDelay: `${Math.min(index * 24, 160)}ms` }}>
                  <CategoryButton
                    category={category}
                    active={isSelected}
                    hasSubcategories={hasSubcategories}
                    expanded={isExpanded}
                    loading={
                      clickPulseId === category.id ||
                      navigatingProductCategoryId === category.id ||
                      (Boolean(navigatingProductCategoryId) && isSelected) ||
                      ((clickedCategoryId === category.id || (!clickedCategoryId && isSelected)) && isLoadingProducts)
                    }
                    disabled={disabled}
                    isMobile={isMobile}
                    mobileExpanded={false}
                    onIntent={() => onPrefetchCategory(category)}
                    onClick={() => {
                      if (hasSubcategories && !isMobile) {
                        if (isSelected) {
                          setExpandedCategoryIds((prev) =>
                            prev.includes(category.id)
                              ? prev.filter((id) => id !== category.id)
                              : [category.id]
                          );
                          if (selectedSubcategory && !getDefaultSubcategoryForCategory(category)) {
                            onSelectCategory(category);
                          }
                          return;
                        }
                        setExpandedCategoryIds([category.id]);
                      } else if (!isMobile) {
                        setExpandedCategoryIds([]);
                      }
                      setClickedCategoryId(category.id);
                      setClickPulseId(category.id);
                      window.setTimeout(() => {
                        setClickPulseId((curr) => (curr === category.id ? "" : curr));
                      }, 120);
                      centerItem(category.id);
                      onSelectCategory(category);
                    }}
                  />
                  {hasSubcategories && !isMobile ? (
                    <div
                      data-testid="storefront-subcategory-tree"
                      aria-hidden={!isExpanded}
                      className={cn(
                        "grid transition-[grid-template-rows,opacity,margin] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                        isExpanded
                          ? "mt-1.5 mb-2 grid-rows-[1fr] opacity-100"
                          : "mt-0 mb-0 grid-rows-[0fr] opacity-0 pointer-events-none"
                      )}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <div
                          className={cn(
                            "relative ml-6 space-y-1 border-l-2 border-[#ead5c3]/90 pl-3 py-0.5 transition-[transform,opacity] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] origin-top",
                            isExpanded ? "translate-y-0 scale-100 opacity-100" : "-translate-y-2 scale-[0.985] opacity-0"
                          )}
                        >
                          {subItems.map((sub, subIdx) => {
                            const subActive =
                              isSelected &&
                              normalizeSubcategoryMatch(selectedSubcategory) === normalizeSubcategoryMatch(sub.name);
                            return (
                              <button
                                key={sub.slug || sub.name}
                                type="button"
                                tabIndex={isExpanded ? 0 : -1}
                                style={{
                                  transitionDelay: isExpanded ? `${Math.min(subIdx * 24, 140)}ms` : "0ms",
                                }}
                                onClick={() => {
                                  if (isSelected) {
                                    onSelectSubcategory?.(sub.name);
                                  } else {
                                    setExpandedCategoryIds([category.id]);
                                    setClickedCategoryId(category.id);
                                    centerItem(category.id);
                                    onSelectCategory(category, sub.name);
                                  }
                                }}
                                className={cn(
                                  "group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs sm:text-[13px] transition-[transform,opacity,background-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                  isExpanded ? "translate-x-0 opacity-100" : "-translate-x-1.5 opacity-0",
                                  subActive
                                    ? "bg-gradient-to-r from-[#fde8d7] via-[#fef2e8] to-[#fce3cd] font-bold text-[#c85e22] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_-2px_rgba(161,92,42,0.14)] ring-1 ring-[#e6a679]/50"
                                    : "font-medium text-slate-600 hover:translate-x-[3px] hover:bg-[#fff7f0]/90 hover:text-[#b4531a]"
                                )}
                              >
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                    subActive ? "scale-125 bg-[#d96927]" : "bg-slate-300 group-hover:scale-110 group-hover:bg-[#e59866]"
                                  )}
                                />
                                <span className="truncate leading-snug">{sub.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              );
            }) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryLoadingPlaceholder({ count }: { count: number }) {
  return (
    <div className="flex gap-2 overflow-hidden lg:block lg:space-y-2.5" role="status" aria-label="二级分类加载中，数量待确认">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} data-testid="catalog-secondary-skeleton-item" className="catalog-placeholder flex h-12 shrink-0 items-center gap-2.5 rounded-xl border border-slate-100 bg-white px-3 py-2 lg:h-[70px] lg:gap-3 lg:px-3.5 lg:py-3" style={{ animationDelay: `${index * 35}ms` }}>
          <div className="h-8 w-8 rounded-lg bg-slate-100 lg:h-11 lg:w-11 lg:rounded-xl" />
          <div className="h-4 w-16 rounded bg-slate-100 lg:w-28" />
        </div>
      ))}
    </div>
  );
}

function CategoryButton({
  active,
  loading = false,
  hasSubcategories = false,
  expanded = false,
  category,
  disabled,
  isMobile = false,
  mobileExpanded = false,
  onIntent,
  onClick,
}: {
  active: boolean;
  loading?: boolean;
  hasSubcategories?: boolean;
  expanded?: boolean;
  category: DisplayCategory;
  disabled: boolean;
  isMobile?: boolean;
  mobileExpanded?: boolean;
  onIntent: () => void;
  onClick: () => void;
}) {
  const Icon = category.displayIcon ? iconMap[category.displayIcon] : KeyRound;

  if (isMobile) {
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
          "relative flex w-full flex-col items-center justify-center rounded-2xl px-2 py-2.5 text-center transition-colors [-webkit-tap-highlight-color:transparent]",
          active
            ? "border border-orange-300 bg-orange-50 font-bold text-primary shadow-xs"
            : "border border-orange-100/60 bg-white/85 text-slate-700 hover:bg-slate-50"
        )}
      >
        <OptionLoadingSpinner active={loading} size="sm" className="absolute right-1.5 top-1.5" />
        {category.displayCode ? (
          <span aria-hidden="true" className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold tracking-wide", active ? "bg-primary text-white shadow-xs" : "bg-primary/10 text-primary")}>
            {category.displayCode}
          </span>
        ) : category.displayImage ? (
          <img
            src={category.displayImage}
            alt={category.name}
            onError={(event) => setProductImageFallback(event.currentTarget)}
            className={cn(
              "h-11 w-11 shrink-0 rounded-xl bg-white object-cover",
              active ? "ring-2 ring-primary shadow-xs" : "ring-1 ring-slate-200"
            )}
          />
        ) : (
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", active ? "bg-primary text-white shadow-xs" : "bg-primary/10 text-primary")}>
            <Icon className="h-5 w-5" />
          </div>
        )}
        <span className={cn(
          "mt-1.5 line-clamp-2 w-full break-words text-center text-xs leading-snug",
          active ? "font-bold text-primary" : "font-semibold text-slate-800"
        )}>
          {category.name}
        </span>
      </button>
    );
  }

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
        selectionMotion.item,
        "flex items-center justify-between rounded-xl px-3 py-2 text-left disabled:cursor-default lg:w-full lg:px-3.5 lg:py-3 [-webkit-tap-highlight-color:transparent] transition-all duration-150",
        active
          ? "border border-[#e6a679]/65 bg-gradient-to-r from-[#fde6d4] via-[#fef0e4] to-[#fce1ca] hover:from-[#fcdec7] hover:via-[#fee9d9] hover:to-[#fbd9be] text-[#c85e22] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_4px_12px_-3px_rgba(161,92,42,0.16)] font-bold"
          : "border border-slate-100/90 bg-white/80 text-foreground hover:border-orange-200/55 hover:bg-[#fff7f0]/90"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 lg:gap-3">
        {category.displayCode ? (
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold tracking-wide text-primary lg:h-11 lg:w-11 lg:rounded-xl lg:text-sm">{category.displayCode}</span>
        ) : category.displayImage ? (
          <img
            src={category.displayImage}
            alt={category.name}
            onError={(event) => setProductImageFallback(event.currentTarget)}
            className={cn(
              "h-8 w-8 shrink-0 rounded-lg bg-white object-cover lg:h-11 lg:w-11 lg:rounded-xl",
              active ? "ring-2 ring-primary/25" : "ring-1 ring-slate-200"
            )}
          />
        ) : (
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg lg:h-11 lg:w-11 lg:rounded-xl", active ? "bg-primary/15" : "bg-primary/10")}>
            <Icon className="h-4 w-4 text-primary lg:h-6 lg:w-6" />
          </div>
        )}
        <span className="min-w-0 flex-1 truncate text-left text-xs font-semibold leading-tight sm:text-sm lg:text-base">{category.name}</span>
      </div>
      <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        {hasSubcategories ? (
          <ChevronDown
            className={cn(
              "hidden h-5 w-5 shrink-0 lg:block transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
              active ? "text-primary" : "text-muted-foreground/60",
              !expanded && "-rotate-90",
              loading && "opacity-0"
            )}
          />
        ) : (
          <ChevronRight className={cn("hidden h-5 w-5 shrink-0 lg:block transition-[opacity,transform] duration-200 ease-out", active ? "text-primary" : "text-muted-foreground/60", loading && "opacity-0")} />
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <OptionLoadingSpinner active size="sm" />
          </div>
        )}
      </div>
    </button>
  );
}

function ProductPanel({
  pageRoute,
  activeCategory,
  selectedSubcategory = "",
  availableSubcategories = [],
  onSelectSubcategory,
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
  selectedSubcategory?: string;
  availableSubcategories?: Array<{ name: string; slug: string; sort_order: number }>;
  onSelectSubcategory?: (subName: string) => void;
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
  const { isMobile } = useMobileStorefront();
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
  const currentProducts = products.length > 0 ? products : [];
  const resultText = resultReady ? String(total) : products.length > 0 ? String(total) : "/";

  return (
    <Card data-testid="storefront-product-list" data-catalog-route={pageRoute} data-catalog-page-ready={resultReady && !error ? "true" : "false"} aria-busy={isLoading} className={cn("min-h-0 overflow-hidden lg:h-full", isMobile && "min-h-[calc(100dvh-72px)] !rounded-2xl")}>
      <CardContent className={cn(productPanelContentClassName, isMobile && "!p-2.5")}>
        <div ref={productListTopRef} className={cn("mb-2 flex flex-col justify-between gap-2 sm:mb-3 sm:gap-3", !isMobile && "xl:flex-row xl:items-start")}>
          <div className={cn("flex min-w-0 items-center justify-between gap-2", !isMobile && "xl:block xl:shrink-0")}>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={cn("min-h-6 whitespace-nowrap text-base font-bold sm:min-h-7 sm:text-xl", resultReady && "catalog-title-enter")}>{activeCategory?.name || ""}</h1>
              {selectedSubcategory ? (
                <span className="inline-flex items-center rounded-full border border-[#e6a679]/60 bg-[#fef0e4] px-2.5 py-0.5 text-xs font-bold text-[#c85e22]">
                  {selectedSubcategory}
                </span>
              ) : null}
            </div>
            <div data-testid="catalog-product-result-bar" className={cn("flex min-h-4 shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground", !isMobile && "xl:mt-1.5 xl:gap-2")}>
              <span data-testid="catalog-product-result-dot" className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />
              <span className="whitespace-nowrap">
                {resultText === "/" ? "商品加载中..." : `当前 ${resultText} 个商品`}
              </span>
            </div>
          </div>
          <div className={cn("flex w-full gap-2", !isMobile && "xl:min-w-[300px] xl:max-w-[680px] xl:flex-1")}>
            <div className="relative min-w-0 flex-1">
              <Search className={cn("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7d6355]", isMobile ? "h-3.5 w-3.5" : "left-3.5 sm:left-4 h-4 w-4")} />
              <Input
                disabled={Boolean(routePendingTarget)}
                value={draftSearch}
                onChange={(event) => onDraftSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSearchSubmit();
                }}
                placeholder="搜索商品、SKU、规格或分类"
                className={cn(
                  "rounded-lg border-[#ead9cc] bg-[#fffaf6] text-base text-[#6f5a4d] placeholder:text-[#8a6f60] focus-visible:ring-primary/25 md:text-sm",
                  isMobile ? "h-[34px] pl-9" : "h-10 pl-10 sm:pl-11"
                )}
              />
            </div>
            <Button
              type="button"
              disabled={Boolean(routePendingTarget)}
              onClick={onSearchSubmit}
              className={cn(
                "shrink-0 rounded-lg bg-[#df7334] font-medium hover:bg-[#d7672a]",
                isMobile ? "h-[34px] w-14 text-xs" : "h-10 w-[76px] text-sm sm:w-[92px]"
              )}
            >
              搜索
            </Button>
          </div>
        </div>

        {isMobile && availableSubcategories.length >= 2 && onSelectSubcategory ? (
          <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1">
            {availableSubcategories.map((sub) => {
              const subActive = normalizeSubcategoryMatch(selectedSubcategory) === normalizeSubcategoryMatch(sub.name);
              return (
                <button
                  key={sub.slug || sub.name}
                  type="button"
                  onClick={() => onSelectSubcategory(sub.name)}
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    subActive
                      ? "border-[#e6a679] bg-[#fef0e4] text-[#c85e22]"
                      : "border-slate-200 bg-white text-slate-600"
                  )}
                >
                  {sub.name}
                </button>
              );
            })}
          </div>
        ) : null}

        {routePendingTarget && routeStalled ? (
          <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-medium">目标分类仍在加载。</p>
            <button type="button" className="mt-2 font-semibold text-primary underline" onClick={() => { clearCatalogRoutePending(); window.location.assign(routePendingTarget); }}>重试加载目标分类</button>
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button type="button" className="ml-3 font-semibold underline" onClick={onRetry}>
              重试
            </button>
          </div>
        ) : isLoading && currentProducts.length === 0 ? (
          <ProductSkeleton count={Math.max(knownProductCount || 3, 3)} />
        ) : currentProducts.length === 0 ? (
          <ProductEmptyState search={appliedSearch} onResetFilters={onResetFilters} />
        ) : (
          <div className={cn("relative min-h-[260px] flex-1 lg:min-h-0 lg:overflow-hidden", isMobile && "!overflow-visible")}>
            <div ref={containerRef} data-wheel-container="products" className={cn("relative min-h-0 space-y-2.5 px-1 py-1 lg:scroll-fade-y lg:h-full lg:overflow-y-auto lg:px-1.5 lg:pr-2 lg:sidebar-scroll", isMobile && "!h-auto !overflow-visible !px-0 !space-y-1.5")}>
              {currentProducts.map((product, index) => (
                <div key={`${loadedProductKey || activeCategory?.id || "list"}-${product.id}`} data-wheel-item={product.id} className="catalog-wheel-item">
                  <div className={isMobile ? undefined : "catalog-enter-item"} style={isMobile ? undefined : { animationDelay: `${Math.min(index * 26, 180)}ms` }}>
                    <ProductRowCompact
                      product={product}
                      category={activeCategory}
                      currencySymbol={currencySymbol}
                      showStock={showStock}
                      disabled={false}
                      selected={selectedProductId === product.id}
                      isMobile={isMobile}
                      priority={index < 8}
                      onSelect={() => {
                        setSelectedProductId(product.id);
                        centerItem(product.id);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}

let activeNavigationTimer: number | null = null;
let navCancelListenersAttached = false;

function clearActiveNavigationTimer() {
  if (activeNavigationTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(activeNavigationTimer);
    activeNavigationTimer = null;
  }
}

function safeNavigate(router: any, href: string, categoryId?: string) {
  if (typeof window === "undefined") return;
  if (!navCancelListenersAttached) {
    navCancelListenersAttached = true;
    window.addEventListener("popstate", clearActiveNavigationTimer);
    window.addEventListener("pagehide", clearActiveNavigationTimer);
  }
  window.dispatchEvent(new CustomEvent("jianlian:start-top-loading"));
  window.dispatchEvent(
    new CustomEvent("jianlian:product-navigation-start", {
      detail: { categoryId: categoryId || "" },
    })
  );
  clearActiveNavigationTimer();
  const originHref = window.location.href;
  const targetPath = href.split("?")[0];
  activeNavigationTimer = window.setTimeout(() => {
    activeNavigationTimer = null;
    if (window.location.href === originHref && window.location.pathname !== targetPath) {
      window.location.assign(href);
    }
  }, 2400);

  try {
    router.push(href);
  } catch {
    clearActiveNavigationTimer();
    window.location.assign(href);
  }
}

function ProductRow({ currencySymbol, product, showStock }: { currencySymbol: string; product: Product; showStock: boolean }) {
  const router = useRouter();
  const stock = product.stock ?? 0;
  const imageSrc = resolveProductImageSrc(product.imageUrl);
  const minPrice = Number(product.metadata?.minPrice ?? product.price);
  const maxPrice = Number(product.metadata?.maxPrice ?? product.price);
  const hasSkus = Boolean(product.metadata?.hasSkus);
  const priceText = hasSkus && maxPrice > minPrice
    ? `${currencySymbol}${minPrice.toFixed(2)} ~ ${currencySymbol}${maxPrice.toFixed(2)}`
    : `${currencySymbol}${product.price.toFixed(2)}`;

  return (
    <button
      type="button"
      data-catalog-card
      onClick={() => {
        const href = checkoutHref(product.slug || product.id, typeof window !== "undefined" ? window.location.pathname + window.location.search : "");
        safeNavigate(router, href);
      }}
      className={cn(compactProductRowClassName, selectionMotion.item, catalogMotion.card, "group")}
    >
      <div className="flex h-full min-w-0 items-center gap-5">
        <img data-selection-icon src={imageSrc} alt={product.name} onError={(event) => setProductImageFallback(event.currentTarget)} className="h-12 w-12 shrink-0 rounded-xl bg-white object-cover" />
        <div className="min-w-0 flex-1 text-left">
          <div data-selection-title className="line-clamp-1 text-base font-semibold text-slate-700">{product.name}</div>
          {product.description ? <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{product.description}</div> : null}
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <span>{product.deliveryLabel}</span>

          </div>
        </div>
        {showStock ? (
          <div className="hidden shrink-0 items-center gap-2 text-sm text-slate-600 md:flex">
            {(() => {
              const sd = getPublicStockDisplay(stock, { metadata: product.metadata });
              return (
                <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", sd.badgeClassName)}>
                  {sd.label}
                </span>
              );
            })()}
          </div>
        ) : null}
        <div className={cn("shrink-0 text-lg font-bold", product.stockStatus === "out-of-stock" ? "text-slate-400" : "text-slate-950")}>
          {product.stockStatus === "out-of-stock" ? "暂无库存" : priceText}
        </div>
      </div>
    </button>
  );
}

function CatalogProductIcon({ product, category, isMobile, priority = false }: { product: Product; category: DisplayCategory | null; isMobile?: boolean; priority?: boolean }) {
  const [failed, setFailed] = useState<string[]>([]);
  const ownImage = resolveProductImageSrc(product.imageUrl?.trim());
  const source = [ownImage, category?.displayImage].find(value => value && !failed.includes(value));
  const Icon = category?.displayIcon ? iconMap[category.displayIcon] : KeyRound;
  const sizeClass = isMobile ? "h-9 w-9 shrink-0 rounded-lg" : "h-12 w-12 shrink-0 rounded-xl";
  const pxSize = isMobile ? 36 : 48;
  const iconSizeClass = isMobile ? "h-4.5 w-4.5 text-primary" : "h-6 w-6 text-primary";
  return source ? <img data-selection-icon src={source} alt={product.name} width={pxSize} height={pxSize} loading={priority ? "eager" : "lazy"} decoding="async" className={cn(sizeClass, "bg-white object-cover")} onError={() => setFailed(values => [...values, source])} />
    : <span data-selection-icon className={cn("flex items-center justify-center bg-primary/10", sizeClass)}><Icon className={iconSizeClass} aria-label={category?.name || "商品"} /></span>;
}

function ProductRowCompact({ currencySymbol, product, category, showStock, disabled, selected, isMobile = false, priority = false, onSelect }: { currencySymbol: string; product: Product; category: DisplayCategory | null; showStock: boolean; disabled: boolean; selected: boolean; isMobile?: boolean; priority?: boolean; onSelect: () => void }) {
  const router = useRouter();
  const stock = Number(product.stock ?? 0);
  const rawSales = Number(product.metadata?.salesCount ?? 0);
  const salesCount = computeProductSalesCount({
    id: product.id,
    slug: typeof product.metadata?.slug === "string" ? product.metadata.slug : product.id,
    name: product.name,
    category: `${category?.name ?? ""} ${product.categoryLabel ?? ""}`,
    price: product.price,
    explicitSales: rawSales > 0 ? rawSales : null,
  });
  const minPrice = Number(product.metadata?.minPrice ?? product.price);
  const maxPrice = Number(product.metadata?.maxPrice ?? product.price);
  const hasSkus = Boolean(product.metadata?.hasSkus);
  const stockDisplay = getPublicStockDisplay(stock, { metadata: product.metadata });
  const hasStock = stockDisplay.available && (product.stockStatus !== "out-of-stock" || stockDisplay.code === "preorder");
  const priceText = hasSkus && maxPrice > minPrice
    ? `${currencySymbol}${minPrice.toFixed(2)} ~ ${currencySymbol}${maxPrice.toFixed(2)}`
    : `${currencySymbol}${product.price.toFixed(2)}`;

  const handleCardClick = () => {
    onSelect();
    const href = checkoutHref(
      product.slug || product.id,
      typeof window !== "undefined" ? window.location.pathname + window.location.search : ""
    );
    safeNavigate(router, href, category?.id);
  };

  if (isMobile) {
    return (
      <button
        type="button"
        disabled={disabled}
        data-catalog-card
        data-selected={selected ? "true" : undefined}
        onClick={handleCardClick}
        className={cn(
          compactProductRowClassName,
          selectionMotion.item,
          catalogMotion.card,
          "group !h-auto !px-2.5 !py-2 shadow-[0_1px_6px_-2px_rgba(91,62,38,0.12)] rounded-xl"
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <CatalogProductIcon product={product} category={category} isMobile={isMobile} priority={priority} />
          <div className="min-w-0 flex-1 text-left">
            <div
              data-selection-title
              className="line-clamp-1 text-[13.5px] font-bold leading-tight text-slate-900"
            >
              {product.name}
            </div>
            {product.description ? (
              <div className="mt-0.5 line-clamp-1 text-[11px] leading-tight text-slate-500">
                {product.description}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-1.5 border-t border-orange-100/70 pt-1.5">
          <div className="flex flex-wrap items-center gap-1">
            {showStock ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10.5px] font-semibold",
                  stockDisplay.badgeClassName
                )}
              >
                <span>{stockDisplay.label}</span>
              </span>
            ) : null}
            <span className="inline-flex items-center rounded-full bg-orange-50/90 px-1.5 py-0.5 text-[10.5px] font-semibold text-[#9a552b] ring-1 ring-inset ring-orange-200/60">
              {`销量 ${salesCount}`}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={cn("text-[14px] sm:text-base font-extrabold tracking-tight", hasStock ? "text-slate-950" : "text-slate-400")}>
              {hasStock ? priceText : "暂无库存"}
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      data-catalog-card
      data-selected={selected ? "true" : undefined}
      onClick={handleCardClick}
      className={cn(compactProductRowClassName, selectionMotion.item, catalogMotion.card, "group")}
    >
      <div className="flex h-full min-w-0 items-center gap-3 sm:gap-5">
        <CatalogProductIcon product={product} category={category} priority={priority} />
        <div className="min-w-0 flex-1 text-left">
          <div data-selection-title className="line-clamp-1 text-sm font-semibold text-slate-700 sm:text-base">
            {product.name}
          </div>
          {product.description ? (
            <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:mt-1">
              {product.description}
            </div>
          ) : null}
          {showStock ? (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium md:hidden">
              <span className={stockDisplay.textClassName}>
                {stockDisplay.label}
              </span>
            </div>
          ) : null}
        </div>
        {showStock ? (
          <div className="hidden min-w-[90px] shrink-0 items-center justify-center text-center md:flex">
            <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", stockDisplay.badgeClassName)}>
              {stockDisplay.label}
            </span>
          </div>
        ) : null}
        <div className="hidden min-w-[80px] shrink-0 items-center justify-center gap-1 text-center text-sm font-semibold text-[#9a552b] md:flex">
          <span>销量</span>
          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-[#9a552b]">{salesCount}</span>
        </div>
        <div className={cn("shrink-0 text-right text-base font-bold min-w-[120px] sm:min-w-[140px] sm:text-right pr-2", hasStock ? "text-slate-950" : "text-slate-400")}>
          {hasStock ? priceText : "暂无库存"}
        </div>
      </div>
    </button>
  );
}

function ProductSkeleton({ count }: { count: number }) {
  return (
    <div className="h-full space-y-2.5 overflow-hidden px-1.5 py-1 pr-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} data-testid="catalog-product-skeleton-item" className="catalog-placeholder h-[72px] rounded-xl border border-slate-100 bg-slate-50 p-[11px] md:h-[84px] md:p-4" style={{ animationDelay: `${index * 35}ms` }}>
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
    <div className="flex h-full min-h-[260px] flex-1 items-center justify-center rounded-2xl bg-white p-8 text-center">
      <div className="max-w-sm space-y-2">
        <p className="text-base font-bold text-primary">暂无商品</p>
        <p className="break-words px-4 text-xs font-medium text-slate-600 leading-relaxed">{search ? `没有找到与“${search}”相关的商品。` : "当前分类还没有可售的商品。"}</p>
        {search ? <Button type="button" variant="outline" size="sm" className="mt-4 rounded-xl border-orange-200 bg-white/90 hover:bg-white text-xs font-bold text-primary" onClick={onResetFilters}>
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




