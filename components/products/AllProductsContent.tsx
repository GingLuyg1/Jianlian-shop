"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { usePublicSettings } from "@/components/settings/SettingsProvider";
import { useMobileStorefront } from "@/hooks/use-mobile-storefront";
import { usePublicCategorySnapshot } from "@/lib/catalog/public-category-snapshot";
import { getPublicProductPage, peekPublicProductPage } from "@/lib/catalog/public-product-query-cache";
import {
  findVisibleStorefrontPrimaryCategory,
  storefrontCategoryPaths,
} from "@/lib/catalog/visible-storefront-category-routes";
import { checkoutHref } from "@/lib/products/checkout-navigation";
import { getPublicStockDisplay } from "@/lib/products/delivery-and-stock";
import {
  computeProductSalesCount,
  getErrorText,
  mapPublicProductToProduct,
  type PublicCategory,
} from "@/lib/supabase/public-catalog";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  mallContentClassName,
  resolveProductImageSrc,
  setProductImageFallback,
} from "./product-ui";
import { stripProductSubcategoryPrefix } from "./SupabaseMallContent";

type SortMode = "recommended" | "sales" | "stock";

const PAGE_SIZE = 48;

const SORT_OPTIONS: Array<{ value: SortMode; label: string; desc: string }> = [
  { value: "recommended", label: "推荐排序", desc: "按类目权重与置顶优先" },
  { value: "sales", label: "按销量排序", desc: "全站热销商品优先展示" },
  { value: "stock", label: "按库存排序", desc: "库存最充足的商品优先" },
];

function formatPrimaryLabel(rawName: string) {
  return rawName
    .replace(/国际\s*sim\s*卡|国际电话卡/gi, "国际 SIM 卡")
    .replace(/数字\s*\/\s*社媒账号/g, "数字 / 社媒账号")
    .replace(/礼品卡\s*\/\s*充值卡/g, "礼品卡 / 充值卡");
}

function extractCategoryBadge(categoryPath: string) {
  const parts = String(categoryPath || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || "商品";
}

export default function AllProductsContent() {
  const router = useRouter();
  const { settings } = usePublicSettings();
  const { isMobile } = useMobileStorefront();
  const categorySnapshot = usePublicCategorySnapshot();

  const [primaryCategoryId, setPrimaryCategoryId] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);

  const requestIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sortDropdownRef = useRef<HTMLDivElement | null>(null);
  const tabTrackRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [tabSlider, setTabSlider] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  // Strictly only show the four storefront catalog categories in Resource Center.
  // Never append legacy/non-catalog level-1 DB rows such as "账号充值" or "推广赚钱".
  const primaryCategories = useMemo<PublicCategory[]>(() => {
    const rows = categorySnapshot.rows;
    if (!rows) return [];
    const seen = new Set<string>();
    const ordered: PublicCategory[] = [];
    for (const path of storefrontCategoryPaths) {
      const matched = findVisibleStorefrontPrimaryCategory(path, rows);
      if (matched && !seen.has(matched.id)) {
        seen.add(matched.id);
        ordered.push(matched);
      }
    }
    return ordered;
  }, [categorySnapshot.rows]);

  const activeTabKey = primaryCategoryId || "__all__";

  const updateTabSlider = useCallback(() => {
    const track = tabTrackRef.current;
    const activeEl = tabRefs.current[activeTabKey];
    if (!track || !activeEl) return;
    const left = activeEl.offsetLeft;
    const width = activeEl.offsetWidth;
    setTabSlider((prev) =>
      prev.ready && Math.abs(prev.left - left) < 0.5 && Math.abs(prev.width - width) < 0.5
        ? prev
        : { left, width, ready: true }
    );
  }, [activeTabKey]);

  useLayoutEffect(() => {
    updateTabSlider();
  }, [updateTabSlider, primaryCategories.length]);

  useEffect(() => {
    const track = tabTrackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updateTabSlider());
    ro.observe(track);
    return () => ro.disconnect();
  }, [updateTabSlider]);

  useEffect(() => {
    if (!sortMenuOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSortMenuOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [sortMenuOpen]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = "全部商品 · 资源中心 | Jianlian Shop";
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = draftSearch.trim();
      setAppliedSearch((prev) => {
        if (prev !== next) setPage(1);
        return next;
      });
    }, 240);
    return () => window.clearTimeout(timer);
  }, [draftSearch]);

  const listRenderKey = `${primaryCategoryId || "all"}-${sortMode}-${inStockOnly ? "1" : "0"}-${appliedSearch}-${page}`;

  useEffect(() => {
    let mounted = true;
    const reqId = requestIdRef.current + 1;
    requestIdRef.current = reqId;

    const query = {
      primaryCategoryId: primaryCategoryId || undefined,
      sort: sortMode,
      inStockOnly,
      keyword: appliedSearch,
      page,
      pageSize: PAGE_SIZE,
    };

    const cached = peekPublicProductPage(query);
    if (cached) {
      setProducts(
        cached.products.map((row) =>
          mapPublicProductToProduct(row, "digital-accounts", row.category_path || "全部商品")
        )
      );
      setTotal(cached.total);
      setTotalPages(cached.totalPages);
      setLoading(false);
      setError("");
    } else {
      setLoading(true);
      setError("");
    }

    void getPublicProductPage(query)
      .then((result) => {
        if (!mounted || reqId !== requestIdRef.current) return;
        setProducts(
          result.products.map((row) =>
            mapPublicProductToProduct(row, "digital-accounts", row.category_path || "全部商品")
          )
        );
        setTotal(result.total);
        setTotalPages(result.totalPages);
        setError("");
      })
      .catch((loadError) => {
        if (!mounted || reqId !== requestIdRef.current) return;
        setProducts([]);
        setTotal(0);
        setTotalPages(1);
        setError(getErrorText(loadError, "商品读取失败，请稍后重试。"));
      })
      .finally(() => {
        if (mounted && reqId === requestIdRef.current) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [primaryCategoryId, sortMode, inStockOnly, appliedSearch, page, retryNonce]);

  const handleOpenProduct = (product: Product) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("jianlian:start-top-loading"));
    }
    const href = checkoutHref(product.slug || product.id, "/products/all");
    router.push(href);
  };

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const currentSortOption = SORT_OPTIONS.find((item) => item.value === sortMode) ?? SORT_OPTIONS[0];

  return (
    <PublicLayout contentClassName={cn(mallContentClassName, isMobile && "!px-3 !py-2.5 !overflow-visible")}>
      <Card
        data-testid="storefront-all-products"
        className={cn(
          "min-h-0 overflow-hidden !rounded-[26px] border-[#f0e4d8] bg-white/95 shadow-[0_14px_40px_-22px_rgba(133,82,43,0.22)] lg:h-[calc(100dvh-84px)]",
          isMobile && "min-h-[calc(100dvh-72px)] !rounded-2xl"
        )}
      >
        <CardContent className={cn("flex h-full min-h-0 flex-col p-4 sm:p-5", isMobile && "!p-3")}>
          {/* 顶部筛选与排序区 */}
          <div className="shrink-0 space-y-3 border-b border-orange-100/80 pb-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">全部商品</h1>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {loading && products.length === 0 ? "商品加载中..." : `当前共 ${total} 个商品`}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  跨分类一站式检索 · 有库存与预约发货置顶，暂无库存自动沉底
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d6355]" />
                  <Input
                    value={draftSearch}
                    onChange={(event) => setDraftSearch(event.target.value)}
                    placeholder="搜索全站商品、国家、平台或规格..."
                    className="h-9 rounded-xl border-[#ead9cc] bg-[#fffaf6] pl-9 text-sm text-[#6f5a4d] placeholder:text-[#8a6f60] focus-visible:ring-primary/25 sm:h-10"
                  />
                </div>

                <label className="flex h-9 cursor-pointer select-none items-center gap-1.5 rounded-xl border border-[#ead9cc] bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-orange-300 hover:bg-orange-50/40 sm:h-10">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(event) => {
                      setInStockOnly(event.target.checked);
                      setPage(1);
                    }}
                    className="h-3.5 w-3.5 accent-[#df7334]"
                  />
                  <span>仅看有货</span>
                </label>

                {/* 美化后的自定义下拉排序栏 */}
                <div ref={sortDropdownRef} className="relative z-30">
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={sortMenuOpen}
                    aria-label="排序方式"
                    onClick={() => setSortMenuOpen((open) => !open)}
                    className={cn(
                      "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all duration-200 sm:h-10",
                      sortMenuOpen
                        ? "border-[#df7334] bg-[#fff3e8] text-[#c85e22] shadow-sm ring-2 ring-[#df7334]/15"
                        : "border-orange-200/90 bg-gradient-to-b from-[#fffaf5] to-[#fff2e6] text-[#c85e22] hover:border-[#df7334]/70 hover:shadow-xs"
                    )}
                  >
                    <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-[#df7334]" />
                    <span className="hidden text-[#9a552b] sm:inline">排序：</span>
                    <span className="font-bold">{currentSortOption.label}</span>
                    <ChevronDown
                      className={cn(
                        "ml-0.5 h-3.5 w-3.5 shrink-0 text-[#c85e22]/80 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        sortMenuOpen && "rotate-180"
                      )}
                    />
                  </button>

                  <div
                    role="listbox"
                    aria-label="排序选项"
                    className={cn(
                      "absolute right-0 top-[calc(100%+8px)] w-52 origin-top-right rounded-2xl border border-orange-100/90 bg-white/95 p-1.5 shadow-[0_18px_42px_-12px_rgba(124,72,32,0.22),0_4px_12px_-4px_rgba(15,23,42,0.06)] ring-1 ring-white/90 backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      sortMenuOpen
                        ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                        : "pointer-events-none -translate-y-1.5 scale-95 opacity-0"
                    )}
                  >
                    {SORT_OPTIONS.map((option) => {
                      const active = sortMode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => {
                            setSortMode(option.value);
                            setSortMenuOpen(false);
                            setPage(1);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-all duration-150",
                            active
                              ? "bg-gradient-to-r from-[#fde8d7] to-[#fff5ec] text-[#c85e22] shadow-2xs"
                              : "text-slate-700 hover:bg-orange-50/70 hover:text-[#b4531a]"
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block text-xs font-bold leading-snug">{option.label}</span>
                            <span className="mt-0.5 block text-[10.5px] leading-tight text-slate-400">
                              {option.desc}
                            </span>
                          </span>
                          {active ? (
                            <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-[#df7334] text-white">
                              <Check className="h-3 w-3" />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 一级大类滑块切换条 */}
            <div className="overflow-x-auto pb-0.5">
              <div
                ref={tabTrackRef}
                role="tablist"
                aria-label="商品大类筛选"
                className="relative inline-flex items-center gap-1 rounded-full border border-[#ead9cc]/85 bg-[#fff8f1] p-1 shadow-[inset_0_1px_2px_rgba(140,86,42,0.06)]"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute top-1 bottom-1 left-0 rounded-full bg-gradient-to-r from-[#e67b39] to-[#d96727] shadow-[0_4px_12px_-3px_rgba(217,103,39,0.48)]",
                    tabSlider.ready
                      ? "opacity-100 transition-[transform,width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      : "opacity-0"
                  )}
                  style={{
                    transform: `translate3d(${tabSlider.left}px, 0, 0)`,
                    width: `${tabSlider.width}px`,
                  }}
                />
                <button
                  ref={(el) => {
                    tabRefs.current.__all__ = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={!primaryCategoryId}
                  onClick={() => {
                    setPrimaryCategoryId("");
                    setPage(1);
                  }}
                  className={cn(
                    "relative z-10 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-300",
                    !primaryCategoryId ? "text-white" : "text-slate-600 hover:text-[#c85e22]"
                  )}
                >
                  全部
                </button>
                {primaryCategories.map((category) => {
                  const active = primaryCategoryId === category.id;
                  return (
                    <button
                      key={category.id}
                      ref={(el) => {
                        tabRefs.current[category.id] = el;
                      }}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setPrimaryCategoryId(category.id);
                        setPage(1);
                      }}
                      className={cn(
                        "relative z-10 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-300",
                        active ? "text-white" : "text-slate-600 hover:text-[#c85e22]"
                      )}
                    >
                      {formatPrimaryLabel(category.name)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 商品滚动网格区 */}
          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
              <button
                type="button"
                className="ml-3 font-semibold underline"
                onClick={() => setRetryNonce((value) => value + 1)}
              >
                重试
              </button>
            </div>
          ) : loading && products.length === 0 ? (
            <div className="mt-4 grid flex-1 grid-cols-1 content-start gap-2.5 overflow-hidden xl:grid-cols-2">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex h-[74px] items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-4"
                >
                  <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                  </div>
                  <div className="h-5 w-16 animate-pulse rounded bg-slate-200" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex min-h-[260px] flex-1 items-center justify-center rounded-2xl bg-white p-8 text-center">
              <div className="space-y-2">
                <p className="text-base font-bold text-primary">暂无符合条件的商品</p>
                <p className="text-xs text-slate-500">
                  {appliedSearch ? `没有找到与“${appliedSearch}”相关的商品。` : "请切换分类或取消筛选条件后查看。"}
                </p>
                {(appliedSearch || inStockOnly || primaryCategoryId) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 rounded-xl border-orange-200 text-xs font-bold text-primary"
                    onClick={() => {
                      setDraftSearch("");
                      setAppliedSearch("");
                      setInStockOnly(false);
                      setPrimaryCategoryId("");
                      setSortMode("recommended");
                      setPage(1);
                    }}
                  >
                    重置筛选
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div
              ref={scrollRef}
              className={cn(
                "mt-3.5 grid min-h-0 flex-1 grid-cols-1 content-start gap-2.5 overflow-y-auto pr-1 sidebar-scroll xl:grid-cols-2",
                isMobile && "!overflow-visible !pr-0"
              )}
            >
              {products.map((product, index) => {
                const stock = Number(product.stock ?? 0);
                const stockDisplay = getPublicStockDisplay(stock, { metadata: product.metadata });
                const hasStock =
                  stockDisplay.available && (product.stockStatus !== "out-of-stock" || stockDisplay.code === "preorder");
                const minPrice = Number(product.metadata?.minPrice ?? product.price);
                const maxPrice = Number(product.metadata?.maxPrice ?? product.price);
                const hasSkus = Boolean(product.metadata?.hasSkus);
                const priceText =
                  hasSkus && maxPrice > minPrice
                    ? `${settings.currency_symbol}${minPrice.toFixed(2)} ~ ${settings.currency_symbol}${maxPrice.toFixed(2)}`
                    : `${settings.currency_symbol}${product.price.toFixed(2)}`;
                const rawSales = Number(product.metadata?.salesCount ?? 0);
                const salesCount = computeProductSalesCount({
                  id: product.id,
                  slug: typeof product.metadata?.slug === "string" ? product.metadata.slug : product.id,
                  name: product.name,
                  category: product.categoryLabel,
                  price: product.price,
                  explicitSales: rawSales > 0 ? rawSales : null,
                });
                const badge = extractCategoryBadge(product.categoryLabel);
                const cleanDesc = stripProductSubcategoryPrefix(product.description);
                const imageSrc = resolveProductImageSrc(product.imageUrl);

                return (
                  <div
                    key={`${listRenderKey}-${product.id}`}
                    className={isMobile ? undefined : "catalog-enter-item"}
                    style={isMobile ? undefined : { animationDelay: `${Math.min(index * 28, 280)}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenProduct(product)}
                      className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-3.5 py-3 text-left transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[1px] hover:border-orange-300/80 hover:shadow-[0_10px_24px_-14px_rgba(169,103,52,0.28)]"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <img
                          src={imageSrc}
                          alt={product.name}
                          width={44}
                          height={44}
                          loading={index < 10 ? "eager" : "lazy"}
                          decoding="async"
                          onError={(event) => setProductImageFallback(event.currentTarget)}
                          className="h-11 w-11 shrink-0 rounded-xl border border-orange-100/80 bg-white object-cover transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="shrink-0 rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-[#c85e22]">
                              {badge}
                            </span>
                            <span className="truncate text-sm font-bold text-slate-900">{product.name}</span>
                          </div>
                          {cleanDesc ? (
                            <p className="mt-1 truncate text-xs text-slate-500">{cleanDesc}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {settings.show_stock ? (
                          <span
                            className={cn(
                              "hidden rounded-full border px-2 py-0.5 text-[11px] font-semibold sm:inline-flex",
                              stockDisplay.badgeClassName
                            )}
                          >
                            {stockDisplay.label}
                          </span>
                        ) : null}
                        <span className="hidden rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-[#9a552b] md:inline-flex">
                          销量 {salesCount}
                        </span>
                        <span
                          className={cn(
                            "min-w-[80px] text-right text-sm font-extrabold",
                            hasStock ? "text-slate-950" : "text-slate-400"
                          )}
                        >
                          {hasStock ? priceText : "暂无库存"}
                        </span>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 底部分页 */}
          {totalPages > 1 ? (
            <div className="mt-3 flex shrink-0 items-center justify-between border-t border-orange-100/80 pt-3 text-xs text-slate-500">
              <span>
                第 <strong className="text-slate-800">{page}</strong> / {totalPages} 页（共 {total} 个商品）
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => handlePageChange(page - 1)}
                  className="h-8 rounded-lg border-orange-200/80 px-2.5 text-xs"
                >
                  <ChevronLeft className="mr-0.5 h-3.5 w-3.5" />
                  上一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => handlePageChange(page + 1)}
                  className="h-8 rounded-lg border-orange-200/80 px-2.5 text-xs"
                >
                  下一页
                  <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </PublicLayout>
  );
}
