"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { X, Copy, Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  isCategoryEnabled,
  listCategories,
  listProducts,
  setCategoryStatus,
  setProductStatus,
  updateCategory,
  updateProduct,
  type AdminCategory,
  type AdminProduct,
  type CategoryPayload,
  type DeliveryType,
  type ProductPayload,
  type ProductStatus,
} from "@/lib/supabase/admin-catalog";
import { cn } from "@/lib/utils";

const DEFAULT_PRODUCT_PAGE_SIZE = 20;
const PRODUCT_PAGE_SIZE_OPTIONS = [20, 50, 100];
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const PRODUCT_FALLBACK_IMAGE = "/assets/jianlian-brand-logo.png";
const HORIZONTAL_TEXT_CLASS =
  "whitespace-nowrap break-keep [writing-mode:horizontal-tb] [word-orientation:mixed]";

const productStatusLabel: Record<ProductStatus, string> = {
  draft: "草稿",
  active: "已上架",
  inactive: "已下架",
  sold_out: "已售罄",
};

const productStatusClass: Record<ProductStatus, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-600",
  active: "border-green-200 bg-green-50 text-green-700",
  inactive: "border-slate-200 bg-slate-50 text-slate-500",
  sold_out: "border-orange-200 bg-orange-50 text-orange-700",
};

const deliveryLabel: Record<DeliveryType, string> = {
  manual: "人工处理",
  automatic: "自动发货",
  shipping: "物流发货",
};

type ProductFormState = {
  id?: string;
  name: string;
  slug: string;
  primaryCategoryId: string;
  category_id: string;
  short_description: string;
  image_url: string;
  price: string;
  original_price: string;
  stock: string;
  delivery_type: DeliveryType;
  status: ProductStatus;
  sort_order: string;
  metadata_note: string;
};

type CategoryFormState = {
  id?: string;
  parent_id: string;
  level: "1" | "2";
  name: string;
  slug: string;
  icon: string;
  description: string;
  sort_order: string;
  is_active: boolean;
};

type FieldErrors = Record<string, string>;

type ConfirmAction =
  | { type: "close-product" }
  | { type: "close-category" }
  | { type: "delete-product"; id: string }
  | { type: "delete-category"; category: AdminCategory }
  | null;

type ProductSortBy = "sort_order" | "updated_at";

function emptyProductForm(): ProductFormState {
  return {
    name: "",
    slug: "",
    primaryCategoryId: "",
    category_id: "",
    short_description: "",
    image_url: "",
    price: "",
    original_price: "",
    stock: "0",
    delivery_type: "manual",
    status: "draft",
    sort_order: "0",
    metadata_note: "",
  };
}

function emptyCategoryForm(): CategoryFormState {
  return {
    parent_id: "",
    level: "1",
    name: "",
    slug: "",
    icon: "",
    description: "",
    sort_order: "0",
    is_active: true,
  };
}

function getErrorText(error: unknown, fallback = "操作失败，请稍后重试") {
  return (error as { message?: string } | null | undefined)?.message ?? fallback;
}

function parseNumber(value: string, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function isIntegerText(value: string) {
  return /^-?\d+$/.test(value.trim());
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidImagePath(value: string) {
  if (!value.trim()) return true;
  if (value.startsWith("/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function ProductTableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}

function CategoryTreeSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}

export default function AdminProductsPage() {
  const searchParams = useSearchParams();
  const activeView = searchParams.get("view") === "categories" ? "categories" : "products";
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [productSearch, setProductSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [primaryFilter, setPrimaryFilter] = useState("all");
  const [secondaryFilter, setSecondaryFilter] = useState("all");
  const [productStatusFilter, setProductStatusFilter] = useState<ProductStatus | "all">("all");
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryType | "all">("all");
  const [sortBy, setSortBy] = useState<ProductSortBy>("sort_order");
  const [productPageSize, setProductPageSize] = useState(DEFAULT_PRODUCT_PAGE_SIZE);
  const [productPage, setProductPage] = useState(1);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [isCategoryLoading, setIsCategoryLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [productForm, setProductForm] = useState<ProductFormState | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState | null>(null);
  const [productErrors, setProductErrors] = useState<FieldErrors>({});
  const [categoryErrors, setCategoryErrors] = useState<FieldErrors>({});
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const enabledRoots = useMemo(
    () =>
      categories
        .filter((category) => category.level === 1 && isCategoryEnabled(category))
        .sort(sortCategories),
    [categories]
  );
  const filterSecondaries = useMemo(() => {
    if (primaryFilter === "all") return [];
    return getEnabledChildren(categories, primaryFilter);
  }, [categories, primaryFilter]);
  const productCategoryIds = useMemo(() => {
    if (secondaryFilter !== "all") return [secondaryFilter];
    if (primaryFilter !== "all") {
      return getLeafCategoryIds(categories, primaryFilter);
    }
    return undefined;
  }, [categories, primaryFilter, secondaryFilter]);
  const totalProductPages = Math.max(1, Math.ceil(productCount / productPageSize));

  const loadCategories = useCallback(async () => {
    setIsCategoryLoading(true);
    setError("");
    try {
      const rows = await listCategories();
      setCategories(rows);
    } catch (loadError) {
      setError(getErrorText(loadError, "分类列表读取失败"));
    } finally {
      setIsCategoryLoading(false);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setIsProductLoading(true);
    setError("");
    try {
      const result = await listProducts({
        search: debouncedSearch,
        categoryId: productCategoryIds && productCategoryIds.length === 1 ? productCategoryIds[0] : "all",
        categoryIds: productCategoryIds && productCategoryIds.length > 1 ? productCategoryIds : undefined,
        status: productStatusFilter,
        deliveryType: deliveryFilter,
        sortBy,
        page: productPage,
        pageSize: productPageSize,
      });
      setProducts(result.products);
      setProductCount(result.count);
    } catch (loadError) {
      setError(getErrorText(loadError, "商品列表读取失败"));
    } finally {
      setIsProductLoading(false);
    }
  }, [debouncedSearch, deliveryFilter, productCategoryIds, productPage, productPageSize, productStatusFilter, sortBy]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(productSearch);
      setProductPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [productSearch]);

  function clearNotice() {
    setMessage("");
    setError("");
  }

  function openNewProduct() {
    clearNotice();
    setProductErrors({});
    setProductForm(emptyProductForm());
  }

  function openEditProduct(product: AdminProduct) {
    clearNotice();
    setProductErrors({});
    setProductForm(toProductForm(product, categoryMap, categories));
  }

  function openCopyProduct(product: AdminProduct) {
    clearNotice();
    setProductErrors({});
    const form = toProductForm(product, categoryMap, categories);
    setProductForm({
      ...form,
      id: undefined,
      name: `${form.name} 副本`,
      slug: `${form.slug}-copy`,
      status: "draft",
    });
  }

  function requestCloseProduct() {
    if (!productForm || isSaving) return;
    if (isProductDirty(productForm)) {
      setConfirmAction({ type: "close-product" });
      return;
    }
    closeProductDialog();
  }

  function closeProductDialog() {
    setProductForm(null);
    setProductErrors({});
    setError("");
  }

  function openNewCategory() {
    clearNotice();
    setCategoryErrors({});
    setCategoryForm(emptyCategoryForm());
  }

  function openEditCategory(category: AdminCategory) {
    clearNotice();
    setCategoryErrors({});
    setCategoryForm(toCategoryForm(category));
  }

  function requestCloseCategory() {
    if (!categoryForm || isSaving) return;
    if (isCategoryDirty(categoryForm)) {
      setConfirmAction({ type: "close-category" });
      return;
    }
    closeCategoryDialog();
  }

  function closeCategoryDialog() {
    setCategoryForm(null);
    setCategoryErrors({});
    setError("");
  }

  function validateProductForm(form: ProductFormState) {
    const nextErrors: FieldErrors = {};
    const name = form.name.trim();
    const slug = form.slug.trim();
    const price = Number(form.price);
    const originalPrice = form.original_price.trim() ? Number(form.original_price) : null;
    const stock = Number(form.stock);
    const sortOrder = Number(form.sort_order);
    const primary = categoryMap.get(form.primaryCategoryId);
    const category = categoryMap.get(form.category_id);

    if (!name) nextErrors.name = "商品名称必填";
    if (!slug) nextErrors.slug = "slug 必填";
    else if (!SLUG_PATTERN.test(slug)) nextErrors.slug = "只允许小写字母、数字和短横线";
    if (!form.primaryCategoryId) nextErrors.primaryCategoryId = "请选择一级分类";
    if (!form.category_id) nextErrors.category_id = "请选择二级分类";
    if (category && primary && category.parent_id !== primary.id) {
      nextErrors.category_id = "二级分类必须属于已选择的一级分类";
    }
    if (category && category.level === 1) {
      nextErrors.category_id = "当前商品绑定的是一级分类，请重新选择二级分类";
    }
    if (category && !isCategoryEnabled(category)) {
      nextErrors.category_id = "请选择启用状态的分类";
    }
    if (category && hasChildren(categories, category.id)) {
      nextErrors.category_id = "商品只能绑定没有子分类的末级分类";
    }
    if (!form.price.trim() || !Number.isFinite(price) || price < 0) {
      nextErrors.price = "售价必填，且不得小于 0";
    }
    if (
      form.original_price.trim() &&
      (!Number.isFinite(originalPrice) || originalPrice === null || originalPrice < price)
    ) {
      nextErrors.original_price = "原价不得小于售价";
    }
    if (!isIntegerText(form.stock) || !Number.isFinite(stock) || stock < 0) {
      nextErrors.stock = "库存必须为大于等于 0 的整数";
    }
    if (!isIntegerText(form.sort_order) || !Number.isFinite(sortOrder)) {
      nextErrors.sort_order = "排序必须为整数";
    }
    if (!isValidImagePath(form.image_url)) {
      nextErrors.image_url = "请输入合法 URL 或 /assets/... 静态资源路径";
    }

    return nextErrors;
  }

  function buildProductPayload(): ProductPayload | null {
    if (!productForm) return null;
    const nextErrors = validateProductForm(productForm);
    setProductErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return null;

    return {
      name: productForm.name.trim(),
      slug: productForm.slug.trim(),
      category_id: productForm.category_id,
      short_description: productForm.short_description.trim() || null,
      description: null,
      image_url: productForm.image_url.trim() || null,
      price: parseNumber(productForm.price),
      original_price: productForm.original_price.trim()
        ? parseNumber(productForm.original_price)
        : null,
      stock: parseNumber(productForm.stock),
      delivery_type: productForm.delivery_type,
      status: productForm.status,
      sort_order: parseNumber(productForm.sort_order),
      metadata: productForm.metadata_note.trim()
        ? { note: productForm.metadata_note.trim() }
        : null,
    };
  }

  async function handleProductSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearNotice();
    const payload = buildProductPayload();
    if (!payload || !productForm) return;

    setIsSaving(true);
    try {
      if (productForm.id) {
        await updateProduct(productForm.id, payload);
        setMessage("商品更新成功");
      } else {
        await createProduct(payload);
        setMessage("商品创建成功");
      }
      closeProductDialog();
      await loadProducts();
    } catch (saveError) {
      const text = getErrorText(saveError, "商品保存失败");
      if (text.toLowerCase().includes("duplicate") || text.includes("slug")) {
        setProductErrors((current) => ({
          ...current,
          slug: "该商品标识已存在，请更换 slug",
        }));
      }
      setError(text);
    } finally {
      setIsSaving(false);
    }
  }

  function validateCategoryForm(form: CategoryFormState) {
    const nextErrors: FieldErrors = {};
    const name = form.name.trim();
    const slug = form.slug.trim();
    const parent = form.parent_id ? categoryMap.get(form.parent_id) : null;

    if (!name) nextErrors.name = "分类名称必填";
    if (!slug) nextErrors.slug = "slug 必填";
    else if (!SLUG_PATTERN.test(slug)) nextErrors.slug = "只允许小写字母、数字和短横线";
    if (form.level === "2" && !form.parent_id) {
      nextErrors.parent_id = "二级分类必须选择所属一级分类";
    }
    if (form.level === "2" && parent?.level !== 1) {
      nextErrors.parent_id = "父级分类必须是真实一级分类";
    }
    if (form.id && form.parent_id === form.id) {
      nextErrors.parent_id = "分类不能把自己设置为父分类";
    }
    if (!isIntegerText(form.sort_order)) nextErrors.sort_order = "排序必须为整数";
    return nextErrors;
  }

  function buildCategoryPayload(): CategoryPayload | null {
    if (!categoryForm) return null;
    const nextErrors = validateCategoryForm(categoryForm);
    setCategoryErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return null;

    return {
      parent_id: categoryForm.level === "1" ? null : categoryForm.parent_id,
      level: Number(categoryForm.level) as 1 | 2,
      name: categoryForm.name.trim(),
      slug: categoryForm.slug.trim(),
      icon: categoryForm.icon.trim() || null,
      description: categoryForm.description.trim() || null,
      sort_order: parseNumber(categoryForm.sort_order),
      is_active: categoryForm.is_active,
    };
  }

  async function handleCategorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearNotice();
    const payload = buildCategoryPayload();
    if (!payload || !categoryForm) return;

    setIsSaving(true);
    try {
      if (categoryForm.id) {
        await updateCategory(categoryForm.id, payload);
        setMessage("分类更新成功");
      } else {
        await createCategory(payload);
        setMessage("分类创建成功");
      }
      closeCategoryDialog();
      await loadCategories();
    } catch (saveError) {
      const text = getErrorText(saveError, "分类保存失败");
      if (text.toLowerCase().includes("duplicate") || text.includes("slug")) {
        setCategoryErrors((current) => ({
          ...current,
          slug: "该分类标识已存在，请更换 slug",
        }));
      }
      setError(text);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleProductStatus(id: string, status: ProductStatus) {
    clearNotice();
    setIsProductLoading(true);
    try {
      await setProductStatus(id, status);
      setMessage("商品状态已更新");
      await loadProducts();
    } catch (statusError) {
      setError(getErrorText(statusError, "商品状态更新失败"));
    } finally {
      setIsProductLoading(false);
    }
  }

  async function performDeleteProduct(id: string) {
    clearNotice();
    setIsProductLoading(true);
    try {
      await deleteProduct(id);
      setMessage("商品已删除");
      await loadProducts();
    } catch (deleteError) {
      setError(getErrorText(deleteError, "商品删除失败"));
    } finally {
      setIsProductLoading(false);
    }
  }

  async function handleToggleCategory(category: AdminCategory) {
    clearNotice();
    setIsCategoryLoading(true);
    try {
      await setCategoryStatus(category, !isCategoryEnabled(category));
      setMessage("分类状态已更新");
      await loadCategories();
    } catch (statusError) {
      setError(getErrorText(statusError, "分类状态更新失败"));
    } finally {
      setIsCategoryLoading(false);
    }
  }

  async function performDeleteCategory(category: AdminCategory) {
    if (hasChildren(categories, category.id)) {
      setError("该分类下还有子分类，请先删除或调整子分类");
      return;
    }
    if (products.some((product) => product.category_id === category.id)) {
      setError("该分类已关联当前列表商品，不能直接删除");
      return;
    }

    clearNotice();
    setIsCategoryLoading(true);
    try {
      await deleteCategory(category.id);
      setMessage("分类已删除");
      await loadCategories();
    } catch (deleteError) {
      setError(getErrorText(deleteError, "分类删除失败"));
    } finally {
      setIsCategoryLoading(false);
    }
  }

  function resetProductFilters() {
    setProductSearch("");
    setDebouncedSearch("");
    setPrimaryFilter("all");
    setSecondaryFilter("all");
    setProductStatusFilter("all");
    setDeliveryFilter("all");
    setSortBy("sort_order");
    setProductPageSize(DEFAULT_PRODUCT_PAGE_SIZE);
    setProductPage(1);
  }

  async function copyText(value: string, successText: string) {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value);
      setMessage(successText);
      setError("");
    } catch {
      setError("复制失败，请手动复制");
    }
  }

  async function handleConfirmAction() {
    const action = confirmAction;
    setConfirmAction(null);
    if (!action) return;
    if (action.type === "close-product") closeProductDialog();
    if (action.type === "close-category") closeCategoryDialog();
    if (action.type === "delete-product") await performDeleteProduct(action.id);
    if (action.type === "delete-category") await performDeleteCategory(action.category);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4 xl:px-7 2xl:px-8">
      <div className="mb-3 flex w-full shrink-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-950">商品与分类管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            管理 Supabase categories 和 products 数据，商品绑定到二级或最末级分类。
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadCategories();
              loadProducts();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
          <Button size="sm" onClick={openNewProduct}>
            <Plus className="mr-2 h-4 w-4" />
            新增商品
          </Button>
        </div>
      </div>

      {(message || error) && (
        <div
          className={cn(
            "mb-3 shrink-0 rounded-xl border px-4 py-3 text-sm",
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          )}
        >
          {error || message}
        </div>
      )}

      {activeView === "products" ? (
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <CardHeader className="shrink-0 pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle className="text-base">商品列表</CardTitle>
                <span className="text-sm text-slate-500">当前结果 {productCount} 条</span>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_190px_190px_155px_175px_145px_80px]">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    className="pl-9"
                    placeholder="搜索商品名称或 slug"
                    value={productSearch}
                    onChange={(event) => {
                      setProductSearch(event.target.value);
                      setProductPage(1);
                    }}
                  />
                </div>
                <NativeSelect
                  value={primaryFilter}
                  onChange={(value) => {
                    setPrimaryFilter(value);
                    setSecondaryFilter("all");
                    setProductPage(1);
                  }}
                >
                  <option value="all">全部一级分类</option>
                  {enabledRoots.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  value={secondaryFilter}
                  disabled={primaryFilter === "all"}
                  onChange={(value) => {
                    setSecondaryFilter(value);
                    setProductPage(1);
                  }}
                >
                  <option value="all">全部二级分类</option>
                  {filterSecondaries.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  value={productStatusFilter}
                  onChange={(value) => {
                    setProductStatusFilter(value as ProductStatus | "all");
                    setProductPage(1);
                  }}
                >
                  <option value="all">全部状态</option>
                  {Object.entries(productStatusLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  value={deliveryFilter}
                  onChange={(value) => {
                    setDeliveryFilter(value as DeliveryType | "all");
                    setProductPage(1);
                  }}
                >
                  <option value="all">全部交付方式</option>
                  {Object.entries(deliveryLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  value={sortBy}
                  onChange={(value) => {
                    setSortBy(value as ProductSortBy);
                    setProductPage(1);
                  }}
                >
                  <option value="sort_order">按排序</option>
                  <option value="updated_at">按更新时间</option>
                </NativeSelect>
                <Button variant="outline" onClick={resetProductFilters}>
                  重置
                </Button>
              </div>

              {isProductLoading ? (
                <ProductTableSkeleton />
              ) : (
                <ProductTable
                  categoryMap={categoryMap}
                  categories={categories}
                  products={products}
                  onCopy={openCopyProduct}
                  onDelete={(id) => setConfirmAction({ type: "delete-product", id })}
                  onEdit={openEditProduct}
                  onCopyText={copyText}
                  onStatusChange={handleProductStatus}
                />
              )}

              <div className="flex shrink-0 flex-col gap-3 border-t pt-3 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
                <span>
                  共 {productCount} 条，第 {productPage} / {totalProductPages} 页
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span>每页</span>
                  <NativeSelect
                    value={String(productPageSize)}
                    onChange={(value) => {
                      setProductPageSize(Number(value));
                      setProductPage(1);
                    }}
                    className="h-9 w-24"
                  >
                    {PRODUCT_PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={productPage <= 1}
                    onClick={() => setProductPage(Math.max(1, productPage - 1))}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={productPage >= totalProductPages || products.length < productPageSize}
                    onClick={() => setProductPage(Math.min(totalProductPages, productPage + 1))}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
      ) : (
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <CardHeader className="shrink-0 pb-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle className="text-base">分类树</CardTitle>
                <Button size="sm" onClick={openNewCategory}>
                  <Plus className="mr-2 h-4 w-4" />
                  新增分类
                </Button>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-auto">
              {isCategoryLoading ? (
                <CategoryTreeSkeleton />
              ) : enabledRoots.length === 0 ? (
                <EmptyState text="暂无分类数据" />
              ) : (
                <div className="space-y-3">
                  {categories
                    .filter((category) => category.level === 1)
                    .sort(sortCategories)
                    .map((category) => (
                      <CategoryTreeNode
                        key={category.id}
                        category={category}
                        categories={categories}
                        depth={0}
                        onDelete={(nextCategory) =>
                          setConfirmAction({ type: "delete-category", category: nextCategory })
                        }
                        onEdit={openEditCategory}
                        onToggleStatus={handleToggleCategory}
                      />
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
      )}

      <ProductFormDialog
        categories={categories}
        errors={productErrors}
        form={productForm}
        isSaving={isSaving}
        onClose={requestCloseProduct}
        onSubmit={handleProductSubmit}
        onUpdate={(form) => {
          setProductForm(form);
          if (Object.keys(productErrors).length > 0) setProductErrors({});
        }}
      />

      <CategoryFormDialog
        categories={categories}
        errors={categoryErrors}
        form={categoryForm}
        isSaving={isSaving}
        onClose={requestCloseCategory}
        onSubmit={handleCategorySubmit}
        onUpdate={(form) => {
          setCategoryForm(form);
          if (Object.keys(categoryErrors).length > 0) setCategoryErrors({});
        }}
      />

      <AlertDialog open={Boolean(confirmAction)} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认操作</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "delete-product" && "确定删除该商品吗？该操作不可撤销。"}
              {confirmAction?.type === "delete-category" && "确定删除该分类吗？存在子分类或关联商品时会被阻止。"}
              {(confirmAction?.type === "close-product" || confirmAction?.type === "close-category") &&
                "当前内容尚未保存，确定关闭吗？"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction} disabled={isSaving}>
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProductTable({
  categoryMap,
  categories,
  products,
  onCopy,
  onDelete,
  onEdit,
  onCopyText,
  onStatusChange,
}: {
  categoryMap: Map<string, AdminCategory>;
  categories: AdminCategory[];
  products: AdminProduct[];
  onCopy: (product: AdminProduct) => void;
  onDelete: (id: string) => void;
  onEdit: (product: AdminProduct) => void;
  onCopyText: (value: string, successText: string) => void | Promise<void>;
  onStatusChange: (id: string, status: ProductStatus) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden [&>div]:h-full [&>div]:overflow-auto">
      <Table className="min-w-[1580px] table-fixed">
        <colgroup>
          <col className="w-[72px]" />
          <col className="w-[310px]" />
          <col className="w-[180px]" />
          <col className="w-[240px]" />
          <col className="w-[105px]" />
          <col className="w-[95px]" />
          <col className="w-[85px]" />
          <col className="w-[135px]" />
          <col className="w-[110px]" />
          <col className="w-[80px]" />
          <col className="w-[175px]" />
          <col className="w-[230px]" />
        </colgroup>
        <TableHeader className="sticky top-0 z-10 bg-slate-50">
          <TableRow>
            <TableHead className={cn("h-10 px-3 text-center text-xs", HORIZONTAL_TEXT_CLASS)}>图片</TableHead>
            <TableHead className={cn("h-10 px-3 text-xs", HORIZONTAL_TEXT_CLASS)}>商品名称</TableHead>
            <TableHead className={cn("h-10 px-3 text-xs", HORIZONTAL_TEXT_CLASS)}>Slug</TableHead>
            <TableHead className={cn("h-10 px-3 text-xs", HORIZONTAL_TEXT_CLASS)}>分类路径</TableHead>
            <TableHead className={cn("h-10 px-3 text-center text-xs", HORIZONTAL_TEXT_CLASS)}>售价</TableHead>
            <TableHead className={cn("h-10 px-3 text-center text-xs", HORIZONTAL_TEXT_CLASS)}>原价</TableHead>
            <TableHead className={cn("h-10 px-3 text-center text-xs", HORIZONTAL_TEXT_CLASS)}>库存</TableHead>
            <TableHead className={cn("h-10 px-3 text-xs", HORIZONTAL_TEXT_CLASS)}>交付方式</TableHead>
            <TableHead className={cn("h-10 px-3 text-center text-xs", HORIZONTAL_TEXT_CLASS)}>状态</TableHead>
            <TableHead className={cn("h-10 px-3 text-center text-xs", HORIZONTAL_TEXT_CLASS)}>排序</TableHead>
            <TableHead className={cn("h-10 px-3 text-xs", HORIZONTAL_TEXT_CLASS)}>更新时间</TableHead>
            <TableHead className={cn("h-10 px-3 text-right text-xs", HORIZONTAL_TEXT_CLASS)}>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="h-28 text-center text-sm text-slate-500">
                暂无商品数据
              </TableCell>
            </TableRow>
          ) : (
            products.map((product) => {
              const categoryPath = getCategoryPath(product.category_id, categoryMap);
              const category = product.category_id ? categoryMap.get(product.category_id) : null;
              const hasCategoryIssue = Boolean(!category || hasChildren(categories, product.category_id ?? ""));

              return (
              <TableRow key={product.id} className={cn("h-14", hasCategoryIssue && "bg-orange-50/40")}>
                <TableCell className="px-3 py-2 text-center">
                  <div className="group relative mx-auto h-10 w-10 shrink-0 overflow-visible">
                    <div className="h-10 w-10 overflow-hidden rounded-md border border-slate-200 bg-white">
                      <img
                        src={product.image_url || PRODUCT_FALLBACK_IMAGE}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.src = PRODUCT_FALLBACK_IMAGE;
                        }}
                      />
                    </div>
                    <div className="pointer-events-none absolute left-14 top-0 z-20 hidden h-40 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg group-hover:block">
                      <img
                        src={product.image_url || PRODUCT_FALLBACK_IMAGE}
                        alt=""
                        className="h-full w-full rounded-lg object-cover"
                        onError={(event) => {
                          event.currentTarget.src = PRODUCT_FALLBACK_IMAGE;
                        }}
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="min-w-0 px-3 py-2 font-medium">
                  <div
                    className="truncate text-sm font-semibold leading-5 text-slate-900"
                    title={product.name}
                    onDoubleClick={() => onCopyText(product.name, "商品名称已复制")}
                  >
                    {product.name}
                  </div>
                  {product.short_description && (
                    <div className="mt-1 truncate text-xs leading-[18px] text-slate-500" title={product.short_description}>
                      {product.short_description}
                    </div>
                  )}
                </TableCell>
                <TableCell
                  className={cn("cursor-copy truncate px-3 py-2 text-slate-500", HORIZONTAL_TEXT_CLASS)}
                  title={product.slug}
                  onDoubleClick={() => onCopyText(product.slug, "Slug 已复制")}
                >
                  {product.slug}
                </TableCell>
                <TableCell
                  className={cn("truncate px-3 py-2", hasCategoryIssue ? "text-orange-700" : "text-slate-600", HORIZONTAL_TEXT_CLASS)}
                  title={hasCategoryIssue ? "分类层级异常" : categoryPath}
                >
                  {hasCategoryIssue ? "分类层级异常" : categoryPath}
                </TableCell>
                <TableCell className={cn("px-3 py-2 text-center tabular-nums", HORIZONTAL_TEXT_CLASS)}>
                  ¥{product.price.toFixed(2)}
                </TableCell>
                <TableCell className={cn("px-3 py-2 text-center tabular-nums", HORIZONTAL_TEXT_CLASS)}>
                  {product.original_price ? `¥${product.original_price.toFixed(2)}` : "-"}
                </TableCell>
                <TableCell className={cn("px-3 py-2 text-center tabular-nums", HORIZONTAL_TEXT_CLASS, product.stock === 0 ? "text-red-600" : product.stock <= 5 ? "text-orange-600" : "text-green-600")}>
                  {product.stock}
                </TableCell>
                <TableCell className={cn("px-3 py-2 text-slate-600", HORIZONTAL_TEXT_CLASS)}>
                  {deliveryLabel[product.delivery_type]}
                </TableCell>
                <TableCell className="px-3 py-2 text-center">
                  <div className="flex w-full justify-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        "inline-flex h-6 min-w-[64px] justify-center rounded-full px-2 text-xs font-medium",
                        HORIZONTAL_TEXT_CLASS,
                        productStatusClass[product.status]
                      )}
                    >
                      {productStatusLabel[product.status]}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className={cn("px-3 py-2 text-center tabular-nums", HORIZONTAL_TEXT_CLASS)}>
                  {product.sort_order}
                </TableCell>
                <TableCell className={cn("px-3 py-2 text-slate-500", HORIZONTAL_TEXT_CLASS)}>
                  {product.updated_at ? new Date(product.updated_at).toLocaleString() : "-"}
                </TableCell>
                <TableCell className="px-3 py-2">
                  <div className={cn("flex justify-end gap-1", HORIZONTAL_TEXT_CLASS)}>
                    <Button variant="ghost" size="sm" className={HORIZONTAL_TEXT_CLASS} onClick={() => onEdit(product)}>
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(HORIZONTAL_TEXT_CLASS, product.status === "active" ? "text-orange-600" : "text-green-700")}
                      onClick={() =>
                        onStatusChange(product.id, product.status === "active" ? "inactive" : "active")
                      }
                    >
                      {product.status === "active" ? "下架" : "上架"}
                    </Button>
                    <Button variant="ghost" size="sm" className={HORIZONTAL_TEXT_CLASS} onClick={() => onStatusChange(product.id, "sold_out")}>
                      售罄
                    </Button>
                    <Button variant="ghost" size="sm" className={HORIZONTAL_TEXT_CLASS} onClick={() => onCopy(product)}>
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      复制
                    </Button>
                    <Button variant="ghost" size="sm" className={cn("text-red-600", HORIZONTAL_TEXT_CLASS)} onClick={() => onDelete(product.id)}>
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ProductFormDialog({
  categories,
  errors,
  form,
  isSaving,
  onClose,
  onSubmit,
  onUpdate,
}: {
  categories: AdminCategory[];
  errors: FieldErrors;
  form: ProductFormState | null;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (form: ProductFormState) => void;
}) {
  const rootCategories = categories.filter((category) => category.level === 1 && isCategoryEnabled(category)).sort(sortCategories);
  const secondaryCategories = form?.primaryCategoryId
    ? getEnabledChildren(categories, form.primaryCategoryId)
    : [];
  const selectedImage = form?.image_url.trim();

  return (
    <ModalFrame
      open={Boolean(form)}
      title={form?.id ? "编辑商品" : "新增商品"}
      isSaving={isSaving}
      onClose={onClose}
    >
      {form && (
        <form onSubmit={onSubmit} className="flex max-h-[calc(100vh-48px)] flex-col">
          {Object.keys(errors).length > 0 && (
            <div className="mx-6 mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              请检查表单中标红的内容后再保存。
            </div>
          )}
          <div className="grid gap-5 overflow-y-auto px-6 py-5 md:grid-cols-2">
            <FormSection title="基础信息" className="md:col-span-2">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="商品名称" required error={errors.name}>
                  <Input
                    value={form.name}
                    onChange={(event) => {
                      const name = event.target.value;
                      onUpdate({
                        ...form,
                        name,
                        slug: form.slug || slugify(name),
                      });
                    }}
                  />
                </Field>
                <Field label="slug" required error={errors.slug}>
                  <Input
                    value={form.slug}
                    onChange={(event) => onUpdate({ ...form, slug: event.target.value.trim().toLowerCase() })}
                    placeholder="lowercase-slug"
                  />
                </Field>
                <Field label="简短说明" className="md:col-span-2" error={errors.short_description}>
                  <Input
                    value={form.short_description}
                    onChange={(event) => onUpdate({ ...form, short_description: event.target.value })}
                  />
                </Field>
                <Field label="商品图片" className="md:col-span-2" error={errors.image_url}>
                  <div className="flex gap-3">
                    <Input
                      value={form.image_url}
                      onChange={(event) => onUpdate({ ...form, image_url: event.target.value })}
                      placeholder="/assets/example.png 或 https://..."
                    />
                    <img
                      src={selectedImage || "/assets/jianlian-brand-logo.png"}
                      alt=""
                      className="h-10 w-10 rounded-lg border object-cover"
                      onError={(event) => {
                        event.currentTarget.src = "/assets/jianlian-brand-logo.png";
                      }}
                    />
                  </div>
                  {selectedImage && !errors.image_url && (
                    <p className="text-xs text-slate-500">图片加载失败不会阻止保存，会使用默认占位图。</p>
                  )}
                </Field>
              </div>
            </FormSection>

            <FormSection title="商品分类">
              <Field label="一级分类" required error={errors.primaryCategoryId}>
                <NativeSelect
                  value={form.primaryCategoryId}
                  onChange={(value) => onUpdate({ ...form, primaryCategoryId: value, category_id: "" })}
                >
                  <option value="">请选择一级分类</option>
                  {rootCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </FormSection>
            <FormSection title="二级分类">
              <Field label="二级分类" required error={errors.category_id}>
                <NativeSelect
                  value={form.category_id}
                  disabled={!form.primaryCategoryId || secondaryCategories.length === 0}
                  onChange={(value) => onUpdate({ ...form, category_id: value })}
                >
                  <option value="">
                    {!form.primaryCategoryId
                      ? "请先选择一级分类"
                      : secondaryCategories.length === 0
                        ? "该一级分类暂无可用二级分类，请先在分类管理中添加。"
                        : "请选择二级分类"}
                  </option>
                  {secondaryCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </FormSection>

            <FormSection title="价格与库存" className="md:col-span-2">
              <div className="grid gap-4 md:grid-cols-4">
                <Field label="售价" required error={errors.price}>
                  <Input type="number" min="0" step="0.01" value={form.price} onChange={(event) => onUpdate({ ...form, price: event.target.value })} />
                </Field>
                <Field label="原价" error={errors.original_price}>
                  <Input type="number" min="0" step="0.01" value={form.original_price} onChange={(event) => onUpdate({ ...form, original_price: event.target.value })} />
                </Field>
                <Field label="库存" required error={errors.stock}>
                  <Input type="number" min="0" step="1" value={form.stock} onChange={(event) => onUpdate({ ...form, stock: event.target.value })} />
                </Field>
                <Field label="排序" required error={errors.sort_order}>
                  <Input type="number" step="1" value={form.sort_order} onChange={(event) => onUpdate({ ...form, sort_order: event.target.value })} />
                </Field>
              </div>
            </FormSection>

            <FormSection title="交付与状态">
              <Field label="交付方式" required>
                <NativeSelect value={form.delivery_type} onChange={(value) => onUpdate({ ...form, delivery_type: value as DeliveryType })}>
                  {Object.entries(deliveryLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </FormSection>
            <FormSection title="商品状态">
              <Field label="状态" required>
                <NativeSelect value={form.status} onChange={(value) => onUpdate({ ...form, status: value as ProductStatus })}>
                  {Object.entries(productStatusLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </FormSection>

            <FormSection title="可选扩展信息" className="md:col-span-2">
              <Field label="metadata.note">
                <Input
                  value={form.metadata_note}
                  onChange={(event) => onUpdate({ ...form, metadata_note: event.target.value })}
                  placeholder="内部备注，可选"
                />
              </Field>
            </FormSection>
          </div>
          <DialogActions isSaving={isSaving} saveLabel="保存商品" onCancel={onClose} />
        </form>
      )}
    </ModalFrame>
  );
}

function CategoryFormDialog({
  categories,
  errors,
  form,
  isSaving,
  onClose,
  onSubmit,
  onUpdate,
}: {
  categories: AdminCategory[];
  errors: FieldErrors;
  form: CategoryFormState | null;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (form: CategoryFormState) => void;
}) {
  const rootCategories = categories
    .filter((category) => category.level === 1 && category.id !== form?.id)
    .sort(sortCategories);

  return (
    <ModalFrame
      open={Boolean(form)}
      title={form?.id ? "编辑分类" : "新增分类"}
      isSaving={isSaving}
      onClose={onClose}
      size="max-w-3xl"
    >
      {form && (
        <form onSubmit={onSubmit} className="flex max-h-[calc(100vh-48px)] flex-col">
          {Object.keys(errors).length > 0 && (
            <div className="mx-6 mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              请检查分类表单中标红的内容。
            </div>
          )}
          <div className="grid gap-5 overflow-y-auto px-6 py-5 md:grid-cols-2">
            <Field label="分类名称" required error={errors.name}>
              <Input
                value={form.name}
                onChange={(event) => {
                  const name = event.target.value;
                  onUpdate({ ...form, name, slug: form.slug || slugify(name) });
                }}
              />
            </Field>
            <Field label="slug" required error={errors.slug}>
              <Input
                value={form.slug}
                onChange={(event) => onUpdate({ ...form, slug: event.target.value.trim().toLowerCase() })}
              />
            </Field>
            <Field label="分类级别" required>
              <NativeSelect
                value={form.level}
                onChange={(value) =>
                  onUpdate({
                    ...form,
                    level: value as "1" | "2",
                    parent_id: "",
                  })
                }
              >
                <option value="1">一级分类</option>
                <option value="2">二级分类</option>
              </NativeSelect>
            </Field>
            {form.level === "2" && (
              <Field label="所属一级分类" required error={errors.parent_id}>
                <NativeSelect value={form.parent_id} onChange={(value) => onUpdate({ ...form, parent_id: value })}>
                  <option value="">请选择一级分类</option>
                  {rootCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field label="图标">
              <Input value={form.icon} onChange={(event) => onUpdate({ ...form, icon: event.target.value })} />
            </Field>
            <Field label="排序" required error={errors.sort_order}>
              <Input type="number" step="1" value={form.sort_order} onChange={(event) => onUpdate({ ...form, sort_order: event.target.value })} />
            </Field>
            <Field label="启用状态">
              <NativeSelect
                value={form.is_active ? "true" : "false"}
                onChange={(value) => onUpdate({ ...form, is_active: value === "true" })}
              >
                <option value="true">启用</option>
                <option value="false">停用</option>
              </NativeSelect>
            </Field>
            <Field label="描述" className="md:col-span-2">
              <Textarea rows={3} value={form.description} onChange={(event) => onUpdate({ ...form, description: event.target.value })} />
            </Field>
          </div>
          <DialogActions isSaving={isSaving} saveLabel="保存分类" onCancel={onClose} />
        </form>
      )}
    </ModalFrame>
  );
}

function ModalFrame({
  children,
  isSaving,
  onClose,
  open,
  size = "max-w-5xl",
  title,
}: {
  children: ReactNode;
  isSaving: boolean;
  onClose: () => void;
  open: boolean;
  size?: string;
  title: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isSaving) onClose();
      }}
      tabIndex={-1}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl",
          size
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DialogActions({
  isSaving,
  onCancel,
  saveLabel,
}: {
  isSaving: boolean;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2 border-t bg-white px-6 py-4">
      <Button type="button" variant="outline" disabled={isSaving} onClick={onCancel}>
        取消
      </Button>
      <Button type="submit" disabled={isSaving}>
        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isSaving ? "保存中..." : saveLabel}
      </Button>
    </div>
  );
}

function CategoryTreeNode({
  category,
  categories,
  depth,
  onDelete,
  onEdit,
  onToggleStatus,
}: {
  category: AdminCategory;
  categories: AdminCategory[];
  depth: number;
  onDelete: (category: AdminCategory) => void;
  onEdit: (category: AdminCategory) => void;
  onToggleStatus: (category: AdminCategory) => void;
}) {
  const children = categories
    .filter((candidate) => candidate.parent_id === category.id)
    .sort(sortCategories);
  const enabled = isCategoryEnabled(category);

  return (
    <div className={cn(depth > 0 && "ml-5 border-l border-slate-200 pl-4")}>
      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-950">{category.name}</span>
            <Badge variant="outline">L{category.level}</Badge>
            <Badge
              variant="outline"
              className={
                enabled
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-slate-200 bg-slate-50 text-slate-500"
              }
            >
              {enabled ? "启用" : "停用"}
            </Badge>
            <span className="text-xs text-slate-400">sort_order: {category.sort_order}</span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">
            slug: {category.slug}
            {category.icon ? ` · icon: ${category.icon}` : ""}
          </p>
          {category.description && <p className="mt-1 text-sm text-slate-500">{category.description}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit(category)}>
            编辑
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onToggleStatus(category)}>
            {enabled ? "停用" : "启用"}
          </Button>
          <Button variant="ghost" size="sm" className="text-red-600" onClick={() => onDelete(category)}>
            删除
          </Button>
        </div>
      </div>
      {children.length > 0 && (
        <div className="mt-3 space-y-3">
          {children.map((child) => (
            <CategoryTreeNode
              key={child.id}
              category={child}
              categories={categories}
              depth={depth + 1}
              onDelete={onDelete}
              onEdit={onEdit}
              onToggleStatus={onToggleStatus}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  children,
  className,
  error,
  label,
  required,
}: {
  children: ReactNode;
  className?: string;
  error?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function FormSection({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-slate-50/40 p-4", className)}>
      <h3 className="mb-4 text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </section>
  );
}

function NativeSelect({
  children,
  className,
  disabled,
  onChange,
  value,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function sortCategories(a: AdminCategory, b: AdminCategory) {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name);
}

function getEnabledChildren(categories: AdminCategory[], parentId: string) {
  return categories
    .filter((category) => category.parent_id === parentId && isCategoryEnabled(category))
    .sort(sortCategories);
}

function hasChildren(categories: AdminCategory[], id: string) {
  return categories.some((category) => category.parent_id === id);
}

function getLeafCategoryIds(categories: AdminCategory[], parentId: string): string[] {
  const children = getEnabledChildren(categories, parentId);
  if (children.length === 0) return [parentId];
  return children.flatMap((child) => getLeafCategoryIds(categories, child.id));
}

function getCategoryPath(categoryId: string | null, categoryMap: Map<string, AdminCategory>) {
  if (!categoryId) return "未设置";
  const category = categoryMap.get(categoryId);
  if (!category) return "未匹配分类";
  const names: string[] = [];
  const visited = new Set<string>();
  let current: AdminCategory | undefined = category;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current = current.parent_id ? categoryMap.get(current.parent_id) : undefined;
  }
  return names.join(" / ");
}

function toProductForm(
  product: AdminProduct,
  categoryMap: Map<string, AdminCategory>,
  categories: AdminCategory[]
): ProductFormState {
  const category = product.category_id ? categoryMap.get(product.category_id) : null;
  const parent = category?.parent_id ? categoryMap.get(category.parent_id) : null;
  const primaryCategoryId =
    category?.level === 1 ? category.id : parent?.level === 1 ? parent.id : "";

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    primaryCategoryId,
    category_id: category?.level === 1 ? "" : product.category_id ?? "",
    short_description: product.short_description ?? "",
    image_url: product.image_url ?? "",
    price: String(product.price ?? ""),
    original_price:
      product.original_price === null || product.original_price === undefined
        ? ""
        : String(product.original_price),
    stock: String(product.stock ?? 0),
    delivery_type: product.delivery_type,
    status: product.status,
    sort_order: String(product.sort_order ?? 0),
    metadata_note:
      product.metadata && typeof product.metadata.note === "string"
        ? product.metadata.note
        : "",
  };
}

function toCategoryForm(category: AdminCategory): CategoryFormState {
  return {
    id: category.id,
    parent_id: category.parent_id ?? "",
    level: category.level === 1 ? "1" : "2",
    name: category.name,
    slug: category.slug,
    icon: category.icon ?? "",
    description: category.description ?? "",
    sort_order: String(category.sort_order ?? 0),
    is_active: isCategoryEnabled(category),
  };
}

function isProductDirty(form: ProductFormState) {
  if (form.id) return true;
  const empty = emptyProductForm();
  return Object.keys(empty).some((key) => {
    const field = key as keyof ProductFormState;
    return form[field] !== empty[field];
  });
}

function isCategoryDirty(form: CategoryFormState) {
  if (form.id) return true;
  const empty = emptyCategoryForm();
  return Object.keys(empty).some((key) => {
    const field = key as keyof CategoryFormState;
    return form[field] !== empty[field];
  });
}
