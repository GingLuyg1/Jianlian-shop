"use client";

import { type FormEvent, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Edit, GripVertical, Loader2, PackagePlus, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { invalidatePublicCategories } from "@/lib/catalog/public-category-snapshot";
import {
  createCategory,
  createProduct,
  deleteCategory,
  isCategoryEnabled,
  listCategoriesWithCounts,
  listProducts,
  reorderCategories,
  reorderProducts,
  setCategoryStatus,
  setProductStatus,
  updateCategory,
  updateProduct,
  type AdminCategory,
  type AdminProduct,
  type AdminProductSku,
  type CategoryPayload,
  type DeliveryType,
  type ProductPayload,
  type ProductStatus,
} from "@/lib/supabase/admin-catalog";
import AdminProductSkuManager, { type ProductSkuManagerHandle } from "@/components/admin/products/AdminProductSkuManager";
import AdminSupplierBindingSheet from "@/components/admin/suppliers/AdminSupplierBindingSheet";
import { cn } from "@/lib/utils";

const PRODUCT_FALLBACK_IMAGE = "/assets/jianlian-brand-logo.png";

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

import {
  EXTENDED_DELIVERY_OPTIONS,
  resolveExtendedDeliveryMode,
  toBaseDeliveryType,
  withDeliveryModeMetadata,
  type ExtendedDeliveryMode,
} from "@/lib/products/delivery-and-stock";

const deliveryLabel: Record<DeliveryType, string> = {
  manual: "人工处理",
  automatic: "自动发货",
  shipping: "物流发货",
};

type CategoryForm = {
  id?: string;
  parent_id: string;
  level: 1 | 2;
  name: string;
  slug: string;
  icon: string;
  description: string;
  sort_order: string;
  is_active: boolean;
  subcategories: string[];
  rawMetadata?: Record<string, unknown> | null;
};

type ProductForm = {
  id?: string;
  primaryCategoryId: string;
  category_id: string;
  subcategory: string;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  image_url: string;
  price: string;
  original_price: string;
  stock: string;
  delivery_type: DeliveryType;
  delivery_mode: ExtendedDeliveryMode;
  status: ProductStatus;
  sort_order: string;
  metadata_note: string;
};

type FieldErrors = Record<string, string>;

function extractSubcategoriesFromCategory(category?: AdminCategory | null): string[] {
  const raw = category?.metadata?.subcategories as unknown;
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item === "string" && item.trim()) {
      names.push(item.trim());
    } else if (
      item &&
      typeof item === "object" &&
      "name" in item &&
      typeof (item as { name?: unknown }).name === "string" &&
      (item as { name: string }).name.trim()
    ) {
      names.push((item as { name: string }).name.trim());
    }
  }
  return Array.from(new Set(names));
}

function extractSubcategoryFromShortDescription(shortDesc?: string | null): { subcategory: string; cleanShortDescription: string } {
  const raw = String(shortDesc ?? "").trim();
  const match = raw.match(/^【([^】]{1,40})】\s*(.*)$/);
  if (match) {
    return { subcategory: match[1].trim(), cleanShortDescription: match[2].trim() };
  }
  return { subcategory: "", cleanShortDescription: raw };
}

function emptyCategoryForm(parentId = ""): CategoryForm {
  return {
    parent_id: parentId,
    level: parentId ? 2 : 1,
    name: "",
    slug: "",
    icon: "",
    description: "",
    sort_order: "0",
    is_active: true,
    subcategories: [],
    rawMetadata: null,
  };
}

function emptyProductForm(rootId = "", categoryId = "", subcategory = ""): ProductForm {
  return {
    primaryCategoryId: rootId,
    category_id: categoryId,
    subcategory,
    name: "",
    slug: "",
    short_description: "",
    description: "",
    image_url: "",
    price: "",
    original_price: "",
    stock: "0",
    delivery_type: "manual",
    delivery_mode: "manual",
    status: "draft",
    sort_order: "0",
    metadata_note: "",
  };
}

function sortCategories(a: AdminCategory, b: AdminCategory) {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.name || "").localeCompare(b.name || "");
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseNumber(value: string, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function isIntegerText(value: string) {
  return /^-?\d+$/.test(value.trim());
}

function getErrorText(error: unknown, fallback = "操作失败，请稍后重试") {
  return (error as { message?: string } | null | undefined)?.message ?? fallback;
}

function getEnabledChildren(categories: AdminCategory[], parentId: string) {
  return categories
    .filter((category) => category.parent_id === parentId && isCategoryEnabled(category))
    .sort(sortCategories);
}

function getCategoryPath(categoryId: string | null, categoryMap: Map<string, AdminCategory>) {
  if (!categoryId) return "未设置";
  const category = categoryMap.get(categoryId);
  if (!category) return "未匹配分类";
  const names: string[] = [category.name];
  if (category.parent_id) {
    const parent = categoryMap.get(category.parent_id);
    if (parent) names.unshift(parent.name);
  }
  return names.join(" / ");
}

function normalizeProductForm(form: ProductForm | null) {
  if (!form) return null;
  return {
    id: form.id ?? "",
    primaryCategoryId: form.primaryCategoryId,
    category_id: form.category_id,
    subcategory: form.subcategory.trim(),
    name: form.name.trim(),
    slug: form.slug.trim().toLowerCase(),
    short_description: form.short_description.trim(),
    description: form.description.trim(),
    image_url: form.image_url.trim(),
    price: Number(form.price || 0),
    original_price: form.original_price.trim() ? Number(form.original_price) : null,
    stock: Number(form.stock || 0),
    delivery_type: toBaseDeliveryType(form.delivery_mode || form.delivery_type),
    delivery_mode: form.delivery_mode || form.delivery_type,
    status: form.status,
    sort_order: Number(form.sort_order || 0),
    metadata_note: form.metadata_note.trim(),
  };
}

function isProductDirty(form: ProductForm, initialForm: ProductForm | null) {
  return JSON.stringify(normalizeProductForm(form)) !== JSON.stringify(normalizeProductForm(initialForm));
}

function toProductForm(product: AdminProduct, categoryMap: Map<string, AdminCategory>): ProductForm {
  const category = product.category_id ? categoryMap.get(product.category_id) : null;
  const rootId = category?.level === 1 ? category.id : category?.parent_id ?? "";
  const parsedShort = extractSubcategoryFromShortDescription(product.short_description);
  const metaSub = product.metadata && typeof product.metadata.subcategory === "string" ? product.metadata.subcategory.trim() : "";
  return {
    id: product.id,
    primaryCategoryId: rootId,
    category_id: category?.level === 2 ? category.id : "",
    subcategory: parsedShort.subcategory || metaSub,
    name: product.name,
    slug: product.slug,
    short_description: parsedShort.cleanShortDescription,
    description: product.description ?? "",
    image_url: product.image_url ?? "",
    price: String(product.price ?? ""),
    original_price: product.original_price === null || product.original_price === undefined ? "" : String(product.original_price),
    stock: String(product.stock ?? 0),
    delivery_type: product.delivery_type,
    delivery_mode: resolveExtendedDeliveryMode(product.delivery_type, product.metadata),
    status: product.status,
    sort_order: String(product.sort_order ?? 0),
    metadata_note: product.metadata && typeof product.metadata.note === "string" ? product.metadata.note : "",
  };
}

function isValidImagePath(value: string) {
  const text = value.trim();
  if (!text) return true;
  if (text.startsWith("blob:")) return false;
  if (text.startsWith("/")) return true;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function AdminCategoriesPage() {
  return (
    <Suspense fallback={<AdminTableSkeleton rows={8} />}>
      <AdminCategoriesPageInner />
    </Suspense>
  );
}

function AdminCategoriesPageInner() {
  const searchParams = useSearchParams();
  const initialQueryRef = useRef<{ root: string | null; category: string | null }>({
    root: searchParams.get("root"),
    category: searchParams.get("category"),
  });
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [categoryProductCounts, setCategoryProductCounts] = useState<Record<string, number>>({});
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [selectedRootId, setSelectedRootId] = useState("");
  const [selectedChildId, setSelectedChildId] = useState("");
  const [selectedSubcategoryFilter, setSelectedSubcategoryFilter] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [productStatus, setProductStatusFilter] = useState<ProductStatus | "all">("all");
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reordering, setReordering] = useState(false);
  const [draggedProductId, setDraggedProductId] = useState<string | null>(null);
  const [reorderingCategories, setReorderingCategories] = useState(false);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm | null>(null);
  const [productForm, setProductForm] = useState<ProductForm | null>(null);
  const [productInitialForm, setProductInitialForm] = useState<ProductForm | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [skuRefreshKey, setSkuRefreshKey] = useState(0);
  const productsCacheRef = useRef<Map<string, { products: AdminProduct[]; count: number }>>(new Map());
  const productReqSeqRef = useRef(0);
  const editingProduct = useMemo(
    () => products.find((p) => p.id === productForm?.id) ?? null,
    [products, productForm?.id]
  );
  const setNotice = (message: string) => {
    if (message) toast.success(message);
  };

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const rootCategories = useMemo(
    () => categories.filter((category) => category.level === 1).sort(sortCategories),
    [categories]
  );
  const selectedRoot = selectedRootId ? categoryMap.get(selectedRootId) ?? null : null;
  const childCategories = useMemo(
    () => (selectedRootId ? categories.filter((category) => category.parent_id === selectedRootId).sort(sortCategories) : []),
    [categories, selectedRootId]
  );
  const selectedChild = selectedChildId ? categoryMap.get(selectedChildId) ?? null : null;
  const selectedProductCategoryId = selectedChildId || (childCategories.length === 0 ? selectedRootId : "");

  const loadCategories = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadingCategories(true);
    setError("");
    try {
      const { categories: rows, productCounts } = await listCategoriesWithCounts();
      setCategories(rows);
      setCategoryProductCounts(productCounts);
      const roots = rows.filter((row) => row.level === 1).sort(sortCategories);
      const queryRoot = initialQueryRef.current.root;
      const queryCategory = initialQueryRef.current.category;
      initialQueryRef.current = { root: null, category: null };

      setSelectedRootId((currentRoot) => {
        const nextRoot =
          queryRoot && roots.some((row) => row.id === queryRoot)
            ? queryRoot
            : currentRoot && roots.some((row) => row.id === currentRoot)
              ? currentRoot
              : roots[0]?.id ?? "";

        const nextChildren = nextRoot
          ? rows.filter((row) => row.parent_id === nextRoot).sort(sortCategories)
          : [];

        setSelectedChildId((currentChild) => {
          if (queryCategory && nextChildren.some((row) => row.id === queryCategory)) {
            return queryCategory;
          }
          if (currentChild && nextChildren.some((row) => row.id === currentChild)) {
            return currentChild;
          }
          return nextChildren[0]?.id ?? "";
        });

        return nextRoot;
      });
    } catch (loadError) {
      setError(getErrorText(loadError, "分类读取失败，请稍后重试"));
    } finally {
      if (!opts?.silent) setLoadingCategories(false);
    }
  }, []);

  const loadProducts = useCallback(
    async (opts?: { forceRefresh?: boolean }) => {
      if (!selectedProductCategoryId) {
        setProducts([]);
        setProductCount(0);
        return;
      }
      const cacheKey = `${selectedProductCategoryId}|${debouncedSearch.trim()}|${productStatus}`;
      const cached = !opts?.forceRefresh ? productsCacheRef.current.get(cacheKey) : undefined;
      if (cached) {
        setProducts(cached.products);
        setProductCount(cached.count);
        setLoadingProducts(false);
        return;
      }

      const seq = ++productReqSeqRef.current;
      setLoadingProducts(true);
      setError("");
      try {
        const result = await listProducts({
          search: debouncedSearch,
          categoryId: selectedProductCategoryId,
          status: productStatus,
          sortBy: "sort_order",
          page: 1,
          pageSize: 100,
          lite: true,
        });
        if (seq !== productReqSeqRef.current) return;
        productsCacheRef.current.set(cacheKey, { products: result.products, count: result.count });
        setProducts(result.products);
        setProductCount(result.count);
        if (!debouncedSearch.trim() && productStatus === "all") {
          setCategoryProductCounts((prev) =>
            prev[selectedProductCategoryId] === result.count
              ? prev
              : { ...prev, [selectedProductCategoryId]: result.count }
          );
        }
      } catch (loadError) {
        if (seq !== productReqSeqRef.current) return;
        setError(getErrorText(loadError, "商品读取失败，请稍后重试"));
      } finally {
        if (seq === productReqSeqRef.current) {
          setLoadingProducts(false);
        }
      }
    },
    [debouncedSearch, productStatus, selectedProductCategoryId]
  );

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  // Background prefetch sibling secondary categories in idle time so clicking feels instantaneous
  useEffect(() => {
    if (!childCategories.length) return;
    let cancelled = false;
    const toPrefetch = childCategories
      .filter((cat) => cat.id !== selectedChildId && !productsCacheRef.current.has(`${cat.id}||all`))
      .slice(0, 6);
    if (!toPrefetch.length) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        for (const cat of toPrefetch) {
          if (cancelled) return;
          const key = `${cat.id}||all`;
          if (productsCacheRef.current.has(key)) continue;
          try {
            const res = await listProducts({
              categoryId: cat.id,
              status: "all",
              sortBy: "sort_order",
              page: 1,
              pageSize: 100,
              lite: true,
            });
            if (!cancelled) {
              productsCacheRef.current.set(key, { products: res.products, count: res.count });
            }
          } catch {
            // ignore background prefetch errors
          }
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [childCategories, selectedChildId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(productSearch), 250);
    return () => window.clearTimeout(timer);
  }, [productSearch]);

  function updateUrl(rootId: string, childId = "") {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (rootId) params.set("root", rootId);
    if (childId) params.set("category", childId);
    const nextUrl = `/admin/categories${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }

  function selectRoot(categoryId: string) {
    setSelectedRootId(categoryId);
    const nextChildren = categories.filter((c) => c.parent_id === categoryId).sort(sortCategories);
    const firstChildId = nextChildren[0]?.id ?? "";
    setSelectedChildId(firstChildId);
    setSelectedSubcategoryFilter("");
    updateUrl(categoryId, firstChildId);
  }

  function selectChild(categoryId: string) {
    setSelectedChildId(categoryId);
    setSelectedSubcategoryFilter("");
    updateUrl(selectedRootId, categoryId);
  }

  function openCreateRoot() {
    setNotice("");
    setError("");
    setFieldErrors({});
    setCategoryForm(emptyCategoryForm());
  }

  function openCreateChild() {
    setNotice("");
    setError("");
    setFieldErrors({});
    setCategoryForm(emptyCategoryForm(selectedRootId));
  }

  function openEditCategory(category: AdminCategory) {
    setNotice("");
    setError("");
    setFieldErrors({});
    setCategoryForm({
      id: category.id,
      parent_id: category.parent_id ?? "",
      level: category.level === 1 ? 1 : 2,
      name: category.name,
      slug: category.slug,
      icon: category.icon ?? "",
      description: category.description ?? "",
      sort_order: String(category.sort_order ?? 0),
      is_active: isCategoryEnabled(category),
      subcategories: extractSubcategoriesFromCategory(category),
      rawMetadata: category.metadata ?? null,
    });
  }

  function validateCategory(form: CategoryForm) {
    const errors: FieldErrors = {};
    if (!form.name.trim()) errors.name = "分类名称不能为空";
    if (!form.slug.trim()) errors.slug = "分类标识不能为空";
    if (!/^[a-z0-9-]+$/.test(form.slug.trim())) errors.slug = "分类标识只能包含小写字母、数字和短横线";
    if (!isIntegerText(form.sort_order)) errors.sort_order = "排序必须是有效整数";
    if (form.level === 2 && !form.parent_id) errors.parent_id = "请选择所属一级分类";
    return errors;
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryForm || saving) return;
    const errors = validateCategory(categoryForm);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const cleanSubs = Array.from(new Set(categoryForm.subcategories.map((s) => s.trim()).filter(Boolean)));
    const nextMetadata: Record<string, unknown> = {
      ...(categoryForm.rawMetadata ?? {}),
      subcategories: cleanSubs.map((name, idx) => ({
        name,
        slug: name,
        sort_order: (idx + 1) * 10,
      })),
    };

    const payload: CategoryPayload = {
      parent_id: categoryForm.level === 1 ? null : categoryForm.parent_id,
      level: categoryForm.level,
      name: categoryForm.name.trim(),
      slug: categoryForm.slug.trim().toLowerCase(),
      icon: categoryForm.icon.trim() || null,
      description: categoryForm.description.trim() || null,
      sort_order: parseNumber(categoryForm.sort_order),
      is_active: categoryForm.is_active,
      ...(categoryForm.level === 2 ? { metadata: nextMetadata } : {}),
    };

    setSaving(true);
    setNotice("");
    setError("");
    try {
      const saved = categoryForm.id ? await updateCategory(categoryForm.id, payload) : await createCategory(payload);
      setNotice(categoryForm.id ? "分类已保存" : "分类已新增");
      setCategoryForm(null);
      setCategories((prev) => {
        const index = prev.findIndex((c) => c.id === saved.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = saved;
          return next;
        }
        return [...prev, saved];
      });
      void invalidatePublicCategories().catch(() => undefined);
      await loadCategories();
      if (saved.level === 1) selectRoot(saved.id);
      if (saved.level === 2) {
        setSelectedRootId(saved.parent_id ?? "");
        setSelectedChildId(saved.id);
        updateUrl(saved.parent_id ?? "", saved.id);
      }
    } catch (saveError) {
      toast.error(getErrorText(saveError, "分类保存失败，请检查输入内容"));
    } finally {
      setSaving(false);
    }
  }

  async function removeCategory(category: AdminCategory) {
    if (saving) return;
    const ok = window.confirm(`确认删除分类“${category.name}”？`);
    if (!ok) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await deleteCategory(category.id);
      setNotice("分类已删除");
      if (selectedChildId === category.id) setSelectedChildId("");
      if (selectedRootId === category.id) setSelectedRootId("");
      await loadCategories();
    } catch (deleteError) {
      toast.error(getErrorText(deleteError, "分类删除失败"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleCategory(category: AdminCategory) {
    if (saving) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await setCategoryStatus(category, !isCategoryEnabled(category));
      setNotice("分类状态已更新");
      await loadCategories();
    } catch (statusError) {
      toast.error(getErrorText(statusError, "分类状态更新失败"));
    } finally {
      setSaving(false);
    }
  }

  function openCreateProduct() {
    if (!selectedProductCategoryId) return;
    setNotice("");
    setError("");
    setFieldErrors({});
    const form = emptyProductForm(selectedRootId, selectedProductCategoryId === selectedRootId ? "" : selectedProductCategoryId);
    setProductInitialForm(form);
    setProductForm(form);
  }

  function openEditProduct(product: AdminProduct) {
    setNotice("");
    setError("");
    setFieldErrors({});
    const form = toProductForm(product, categoryMap);
    setProductInitialForm(form);
    setProductForm(form);
  }

  function resolveProductCategoryId(form: ProductForm) {
    const secondaries = form.primaryCategoryId ? getEnabledChildren(categories, form.primaryCategoryId) : [];
    return secondaries.length === 0 ? form.primaryCategoryId : form.category_id;
  }

  function mergeSavedProductIntoPanel(savedProduct: AdminProduct) {
    setProducts((current) => {
      if (savedProduct.category_id !== selectedProductCategoryId) {
        return current.filter((product) => product.id !== savedProduct.id);
      }
      const index = current.findIndex((product) => product.id === savedProduct.id);
      if (index === -1) return [savedProduct, ...current];
      const next = [...current];
      next[index] = savedProduct;
      return next;
    });
  }

  function closeProductEditorAfterSave() {
    setProductForm(null);
    setProductInitialForm(null);
    setFieldErrors({});
  }

  function requestCloseProductEditor() {
    if (saving) return;
    if (productForm && isProductDirty(productForm, productInitialForm)) {
      const ok = window.confirm("当前商品内容尚未保存，确定关闭吗？");
      if (!ok) return;
    }
    setProductForm(null);
    setProductInitialForm(null);
    setFieldErrors({});
  }

  function validateProduct(form: ProductForm) {
    const errors: FieldErrors = {};
    const categoryId = resolveProductCategoryId(form);
    const category = categoryId ? categoryMap.get(categoryId) : null;
    const price = Number(form.price);
    const originalPrice = form.original_price.trim() ? Number(form.original_price) : null;
    if (!form.name.trim()) errors.name = "商品名称不能为空";
    if (!form.slug.trim()) errors.slug = "商品标识不能为空";
    if (!/^[a-z0-9-]+$/.test(form.slug.trim())) errors.slug = "商品标识只能包含小写字母、数字和短横线";
    if (!form.primaryCategoryId) errors.primaryCategoryId = "请选择一级分类";
    if (!categoryId || !category) errors.category_id = "请选择有效分类";
    if (category && !isCategoryEnabled(category)) errors.category_id = "不能绑定已停用分类";
    if (!form.price.trim() || !Number.isFinite(price) || price < 0) errors.price = "售价必须大于或等于 0";
    if (!form.id && originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice < price)) errors.original_price = "原价不能小于售价";
    if (!isIntegerText(form.stock) || Number(form.stock) < 0) errors.stock = "库存必须是大于或等于 0 的整数";
    if (!isIntegerText(form.sort_order)) errors.sort_order = "排序必须是整数";
    if (!isValidImagePath(form.image_url)) errors.image_url = "图片地址必须是 /assets/... 或 http(s) URL，不能使用 blob 临时地址";
    return errors;
  }

  async function submitProduct(
    event: FormEvent<HTMLFormElement>,
    saveSkus?: (product: AdminProduct) => Promise<void>
  ) {
    event.preventDefault();
    if (!productForm || saving) return;
    const errors = validateProduct(productForm);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    const isDirty = isProductDirty(productForm, productInitialForm);
    if (!isDirty && !saveSkus) {
      setNotice("没有需要保存的商品修改");
      return;
    }

    const cleanSub = productForm.subcategory.trim();
    const cleanShort = productForm.short_description.trim();
    const composedShortDescription = cleanSub
      ? `【${cleanSub}】${cleanShort ? ` ${cleanShort}` : ""}`
      : cleanShort || null;

    const existingMeta =
      editingProduct?.metadata && typeof editingProduct.metadata === "object" && !Array.isArray(editingProduct.metadata)
        ? { ...editingProduct.metadata }
        : {};
    if (productForm.metadata_note.trim()) existingMeta.note = productForm.metadata_note.trim();
    else delete existingMeta.note;
    if (cleanSub) existingMeta.subcategory = cleanSub;
    else delete existingMeta.subcategory;

    const nextMeta = withDeliveryModeMetadata(existingMeta, productForm.delivery_mode || productForm.delivery_type);
    const payload: ProductPayload = {
      name: productForm.name.trim(),
      slug: productForm.slug.trim().toLowerCase(),
      category_id: resolveProductCategoryId(productForm),
      short_description: composedShortDescription,
      description: productForm.description.trim() || null,
      image_url: productForm.image_url.trim() || null,
      price: parseNumber(productForm.price),
      original_price: productForm.original_price.trim() ? parseNumber(productForm.original_price) : null,
      stock: parseNumber(productForm.stock),
      delivery_type: toBaseDeliveryType(productForm.delivery_mode || productForm.delivery_type),
      status: productForm.status,
      sort_order: parseNumber(productForm.sort_order),
      metadata: Object.keys(nextMeta).length > 0 ? nextMeta : null,
    };

    setSaving(true);
    setNotice("");
    setError("");
    try {
      const { original_price: preservedOriginalPrice, ...updatePayload } = payload;
      void preservedOriginalPrice;
      const saved = productForm.id ? await updateProduct(productForm.id, updatePayload) : await createProduct(payload);
      if (saveSkus) {
        await saveSkus(saved);
      }
      mergeSavedProductIntoPanel(saved);
      const savedForm = toProductForm(saved, categoryMap);
      setProductInitialForm(savedForm);
      setProductForm(savedForm);
      setNotice(productForm.id ? "商品已保存" : "商品已新增");
      toast.success(productForm.id ? "商品已保存" : "商品已新增");
      closeProductEditorAfterSave();
      productsCacheRef.current.clear();
      await Promise.all([loadProducts({ forceRefresh: true }), loadCategories({ silent: true })]);
    } catch (saveError) {
      toast.error(getErrorText(saveError, "商品保存失败，请检查输入内容"));
    } finally {
      setSaving(false);
    }
  }

  async function changeProductStatus(product: AdminProduct, status: ProductStatus) {
    if (saving) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await setProductStatus(product.id, status);
      setNotice("商品状态已更新");
      productsCacheRef.current.clear();
      await loadProducts({ forceRefresh: true });
    } catch (statusError) {
      toast.error(getErrorText(statusError, "商品状态更新失败"));
    } finally {
      setSaving(false);
    }
  }

  const selectedChildSubcategories = useMemo(() => {
    const configured = extractSubcategoriesFromCategory(selectedChild);
    const seenLower = new Set(configured.map((name) => name.toLowerCase()));
    const result = [...configured];
    for (const prod of products) {
      const parsed = extractSubcategoryFromShortDescription(prod.short_description);
      const sub = parsed.subcategory || (typeof prod.metadata?.subcategory === "string" ? prod.metadata.subcategory.trim() : "");
      if (sub && !seenLower.has(sub.toLowerCase())) {
        seenLower.add(sub.toLowerCase());
        result.push(sub);
      }
    }
    return result;
  }, [selectedChild, products]);

  const displayedProducts = useMemo(() => {
    if (!selectedSubcategoryFilter) return products;
    const targetLower = selectedSubcategoryFilter.trim().toLowerCase();
    return products.filter((prod) => {
      const parsed = extractSubcategoryFromShortDescription(prod.short_description);
      const sub = parsed.subcategory || (typeof prod.metadata?.subcategory === "string" ? prod.metadata.subcategory.trim() : "");
      return sub.toLowerCase() === targetLower;
    });
  }, [products, selectedSubcategoryFilter]);

  const canReorderProducts = Boolean(
    selectedProductCategoryId && productCount === products.length && !productSearch.trim() && productStatus === "all" && !selectedSubcategoryFilter && !loadingProducts && !reordering
  );

  async function moveProduct(sourceId: string, targetId: string) {
    if (!canReorderProducts || sourceId === targetId) return;
    const previous = products;
    const sourceIndex = previous.findIndex((product) => product.id === sourceId);
    const targetIndex = previous.findIndex((product) => product.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...previous];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    const optimistic = next.map((product, index) => ({ ...product, sort_order: (index + 1) * 10 }));
    setProducts(optimistic);
    setReordering(true);
    try {
      const saved = await reorderProducts(selectedProductCategoryId, optimistic);
      setProducts(saved);
      productsCacheRef.current.set(`${selectedProductCategoryId}||all`, { products: saved, count: saved.length });
      toast.success("商品排序已保存");
    } catch (reorderError) {
      setProducts(previous);
      toast.error(getErrorText(reorderError, "商品排序保存失败，已恢复原顺序"));
    } finally {
      setDraggedProductId(null);
      setReordering(false);
    }
  }

  function moveProductByKeyboard(productId: string, direction: -1 | 1) {
    if (!canReorderProducts) return;
    const index = products.findIndex((product) => product.id === productId);
    const target = products[index + direction];
    if (index < 0 || !target) return;
    void moveProduct(productId, target.id);
  }

  async function moveCategory(parentId: string | null, sourceId: string, targetId: string) {
    if (reorderingCategories || loadingCategories || saving || sourceId === targetId) return;
    const siblings = (parentId === null ? rootCategories : childCategories);
    const sourceIndex = siblings.findIndex((category) => category.id === sourceId);
    const targetIndex = siblings.findIndex((category) => category.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const nextSiblings = [...siblings];
    const [moved] = nextSiblings.splice(sourceIndex, 1);
    nextSiblings.splice(targetIndex, 0, moved);
    const optimistic = nextSiblings.map((category, index) => ({ ...category, sort_order: (index + 1) * 10 }));
    const optimisticMap = new Map(optimistic.map((category) => [category.id, category]));
    const previous = categories;
    setCategories((current) => current.map((category) => optimisticMap.get(category.id) ?? category));
    setReorderingCategories(true);
    try {
      const saved = await reorderCategories(parentId, optimistic);
      const savedMap = new Map(saved.map((category) => [category.id, category]));
      setCategories((current) => current.map((category) => savedMap.get(category.id) ?? category));
      toast.success("分类排序已保存");
    } catch (reorderError) {
      setCategories(previous);
      toast.error(getErrorText(reorderError, "分类排序保存失败，已恢复原顺序"));
    } finally {
      setDraggedCategoryId(null);
      setReorderingCategories(false);
    }
  }

  function moveCategoryByKeyboard(parentId: string | null, categoryId: string, direction: -1 | 1) {
    const siblings = parentId === null ? rootCategories : childCategories;
    const index = siblings.findIndex((category) => category.id === categoryId);
    const target = siblings[index + direction];
    if (index < 0 || !target) return;
    void moveCategory(parentId, categoryId, target.id);
  }

  return (
    <AdminPageShell
      title="分类管理"
      description="维护一级分类、二级分类，以及当前分类下的商品。"
      actions={
        <Button size="sm" onClick={openCreateRoot}>
          <Plus className="mr-2 h-4 w-4" />
          新增一级分类
        </Button>
      }
    >
      {error ? (
        <div className="mb-3 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[260px_260px_minmax(0,1fr)]">
        <CategoryColumn
          title="一级分类"
          loading={loadingCategories}
          emptyTitle="暂无一级分类"
          actionLabel="新增一级分类"
          onAction={openCreateRoot}
          error={Boolean(error && categories.length === 0)}
          onRetry={() => void loadCategories()}
        >
          {rootCategories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              active={selectedRootId === category.id}
              count={categories.filter((item) => item.parent_id === category.id).length}
              onClick={() => selectRoot(category.id)}
              onEdit={() => openEditCategory(category)}
              onDelete={() => removeCategory(category)}
              onToggle={() => toggleCategory(category)}
              saving={saving}
              dragging={draggedCategoryId === category.id}
              reorderDisabled={reorderingCategories || loadingCategories || saving}
              onDragStart={() => setDraggedCategoryId(category.id)}
              onDragEnd={() => setDraggedCategoryId(null)}
              onDrop={() => draggedCategoryId && void moveCategory(null, draggedCategoryId, category.id)}
              onMoveByKeyboard={(direction) => moveCategoryByKeyboard(null, category.id, direction)}
            />
          ))}
        </CategoryColumn>

        <CategoryColumn
          title="二级分类"
          loading={loadingCategories}
          emptyTitle={selectedRoot ? "暂无二级分类" : "请选择一级分类"}
          emptyDescription={selectedRoot ? "右侧将显示直接关联该一级分类的商品。" : "选择一级分类后查看二级分类。"}
          actionLabel={selectedRoot ? "新增二级分类" : undefined}
          onAction={selectedRoot ? openCreateChild : undefined}
          error={false}
          onRetry={() => void loadCategories()}
        >
          {childCategories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              active={selectedChildId === category.id}
              count={categoryProductCounts[category.id] ?? 0}
              onClick={() => selectChild(category.id)}
              onEdit={() => openEditCategory(category)}
              onDelete={() => removeCategory(category)}
              onToggle={() => toggleCategory(category)}
              saving={saving}
              dragging={draggedCategoryId === category.id}
              reorderDisabled={reorderingCategories || loadingCategories || saving}
              onDragStart={() => setDraggedCategoryId(category.id)}
              onDragEnd={() => setDraggedCategoryId(null)}
              onDrop={() => draggedCategoryId && void moveCategory(selectedRootId, draggedCategoryId, category.id)}
              onMoveByKeyboard={(direction) => moveCategoryByKeyboard(selectedRootId, category.id, direction)}
            />
          ))}
        </CategoryColumn>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="shrink-0 border-b px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-950">
                  {selectedChild ? selectedChild.name : selectedRoot ? selectedRoot.name : "当前分类商品"}
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">
                  {selectedProductCategoryId ? getCategoryPath(selectedProductCategoryId, categoryMap) : "请选择分类"}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => { productsCacheRef.current.clear(); void loadProducts({ forceRefresh: true }); void loadCategories({ silent: true }); }} disabled={loadingProducts}>
                  <RefreshCw className={cn("mr-2 h-4 w-4", loadingProducts && "animate-spin")} />
                  刷新
                </Button>
                <Button size="sm" onClick={openCreateProduct} disabled={!selectedProductCategoryId || saving}>
                  <PackagePlus className="mr-2 h-4 w-4" />
                  新增商品
                </Button>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_160px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  className="pl-9"
                  placeholder="搜索商品名称或标识"
                />
              </div>
              <select
                value={productStatus}
                onChange={(event) => setProductStatusFilter(event.target.value as ProductStatus | "all")}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">全部状态</option>
                {Object.entries(productStatusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {selectedChild && selectedChildSubcategories.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500">子分类筛选：</span>
                <button
                  type="button"
                  onClick={() => setSelectedSubcategoryFilter("")}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    !selectedSubcategoryFilter
                      ? "bg-orange-100 text-orange-800 ring-1 ring-orange-300"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  全部 ({products.length})
                </button>
                {selectedChildSubcategories.map((subName) => {
                  const subLower = subName.trim().toLowerCase();
                  const subCount = products.filter((p) => {
                    const parsed = extractSubcategoryFromShortDescription(p.short_description);
                    const s = parsed.subcategory || (typeof p.metadata?.subcategory === "string" ? p.metadata.subcategory.trim() : "");
                    return s.toLowerCase() === subLower;
                  }).length;
                  const active = selectedSubcategoryFilter === subName;
                  return (
                    <button
                      key={subName}
                      type="button"
                      onClick={() => setSelectedSubcategoryFilter(active ? "" : subName)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                        active
                          ? "bg-orange-100 text-orange-800 ring-1 ring-orange-300"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {subName} ({subCount})
                    </button>
                  );
                })}
              </div>
            ) : null}
            {!canReorderProducts && selectedProductCategoryId && (productSearch.trim() || productStatus !== "all" || selectedSubcategoryFilter) ? (
              <p className="mt-2 text-xs text-slate-500">清除搜索和状态筛选后可拖拽排序</p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {loadingProducts ? (
              <div className="p-4">
                <AdminTableSkeleton rows={8} />
              </div>
            ) : !selectedProductCategoryId ? (
              <AdminEmptyState title="请选择分类" description="选择左侧一级或二级分类后查看商品。" />
            ) : products.length === 0 ? (
              <AdminEmptyState
                title="暂无商品"
                description="当前分类下没有匹配的商品。"
                action={<Button size="sm" onClick={openCreateProduct}>新增商品</Button>}
              />
            ) : (
              <div className="min-w-[760px] divide-y">
                <div className="sticky top-0 z-10 grid grid-cols-[72px_minmax(220px,1fr)_96px_80px_96px_140px_168px] bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
                  <div className="text-center">图片</div>
                  <div>商品名称</div>
                  <div className="text-center">价格</div>
                  <div className="text-center">库存</div>
                  <div className="text-center">状态</div>
                  <div className="text-center">更新时间</div>
                  <div className="text-center">操作</div>
                </div>
                {displayedProducts.map((product) => (
                  <div
                    key={product.id}
                    onDragOver={(event) => {
                      if (canReorderProducts && draggedProductId) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggedProductId) void moveProduct(draggedProductId, product.id);
                    }}
                    className={cn(
                      "grid grid-cols-[72px_minmax(220px,1fr)_96px_80px_96px_140px_168px] items-center px-4 py-3 text-sm",
                      draggedProductId === product.id && "bg-blue-50 opacity-70"
                    )}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        draggable={canReorderProducts}
                        disabled={!canReorderProducts}
                        aria-label={`拖拽排序 ${product.name}；方向键可上移或下移`}
                        onDragStart={(event) => {
                          setDraggedProductId(product.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", product.id);
                        }}
                        onDragEnd={() => setDraggedProductId(null)}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                            event.preventDefault();
                            moveProductByKeyboard(product.id, event.key === "ArrowUp" ? -1 : 1);
                          }
                        }}
                        className="cursor-grab rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                      <img
                        src={product.image_url || PRODUCT_FALLBACK_IMAGE}
                        alt=""
                        className="h-10 w-10 rounded-lg border object-cover"
                        onError={(event) => {
                          event.currentTarget.src = PRODUCT_FALLBACK_IMAGE;
                        }}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className="truncate font-medium text-slate-950" title={product.name}>
                          {product.name}
                        </div>
                        {(() => {
                          const sub =
                            extractSubcategoryFromShortDescription(product.short_description).subcategory ||
                            (typeof product.metadata?.subcategory === "string" ? product.metadata.subcategory.trim() : "");
                          return sub ? (
                            <span className="shrink-0 rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-700 ring-1 ring-inset ring-orange-200">
                              {sub}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <div className="truncate text-xs text-slate-500" title={product.slug}>
                        {product.slug}
                      </div>
                    </div>
                    <div className="text-center tabular-nums">¥{product.price.toFixed(2)}</div>
                    <div className={cn("text-center tabular-nums", product.stock <= 0 ? "text-red-600" : "text-slate-700")}>
                      {product.stock}
                    </div>
                    <div className="flex justify-center"><StatusBadge status={product.status} /></div>
                    <time className="text-center text-xs text-slate-500">{formatDate(product.updated_at)}</time>
                    <div className="flex justify-center gap-1 whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => openEditProduct(product)}>
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => changeProductStatus(product, product.status === "active" ? "inactive" : "active")}
                      >
                        {product.status === "active" ? "下架" : "上架"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => changeProductStatus(product, "sold_out")}>
                        售罄
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="shrink-0 border-t px-4 py-3 text-sm text-slate-500">
            共 {productCount} 个商品
          </div>
        </section>
      </div>

      <CategoryDialog
        categories={rootCategories}
        form={categoryForm}
        errors={fieldErrors}
        saving={saving}
        onClose={() => !saving && setCategoryForm(null)}
        onSubmit={submitCategory}
        onUpdate={setCategoryForm}
      />
      <ProductDialog
        categories={categories}
        form={productForm}
        errors={fieldErrors}
        saving={saving}
        isDirty={productForm ? isProductDirty(productForm, productInitialForm) : false}
        onClose={requestCloseProductEditor}
        onSubmit={submitProduct}
        onUpdate={setProductForm}
        product={editingProduct}
        skuRefreshKey={skuRefreshKey}
      />
    </AdminPageShell>
  );
}

function CategoryColumn({
  actionLabel,
  children,
  emptyDescription,
  emptyTitle,
  error,
  loading,
  onAction,
  onRetry,
  title,
}: {
  actionLabel?: string;
  children: ReactNode;
  emptyDescription?: string;
  emptyTitle: string;
  error: boolean;
  loading: boolean;
  onAction?: () => void;
  onRetry: () => void;
  title: string;
}) {
  const hasChildren = Boolean(children && (!Array.isArray(children) || children.length > 0));
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
        <div className="truncate text-sm font-semibold text-slate-950">{title}</div>
        {onAction && actionLabel ? (
          <Button size="sm" variant="outline" onClick={onAction}>
            <Plus className="mr-1 h-4 w-4" />
            {actionLabel}
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <AdminTableSkeleton rows={7} />
        ) : error ? (
          <AdminErrorState onRetry={onRetry} />
        ) : hasChildren ? (
          <div className="space-y-2">{children}</div>
        ) : (
          <AdminEmptyState
            title={emptyTitle}
            description={emptyDescription}
            action={onAction && actionLabel ? <Button size="sm" onClick={onAction}>{actionLabel}</Button> : undefined}
          />
        )}
      </div>
    </aside>
  );
}

function CategoryCard({
  active,
  category,
  count,
  onClick,
  onDelete,
  onEdit,
  onToggle,
  saving,
  dragging,
  reorderDisabled,
  onDragStart,
  onDragEnd,
  onDrop,
  onMoveByKeyboard,
}: {
  active: boolean;
  category: AdminCategory;
  count: number;
  onClick: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onToggle: () => void;
  saving: boolean;
  dragging: boolean;
  reorderDisabled: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onMoveByKeyboard: (direction: -1 | 1) => void;
}) {
  return (
    <div
      onDragOver={(event) => {
        if (!reorderDisabled) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className={cn("rounded-lg border p-3", active ? "border-primary bg-orange-50" : "border-slate-200", dragging && "opacity-60")}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        <button
          type="button"
          draggable={!reorderDisabled}
          disabled={reorderDisabled}
          aria-label={`拖拽排序 ${category.name}；方向键可上移或下移`}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", category.id);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              onMoveByKeyboard(event.key === "ArrowUp" ? -1 : 1);
            }
          }}
          className="mt-0.5 shrink-0 cursor-grab rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onClick}>
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-slate-950" title={category.name}>{category.name}</span>
          <Badge
            variant="outline"
            className={isCategoryEnabled(category) ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 bg-slate-50 text-slate-500"}
          >
            {isCategoryEnabled(category) ? "启用" : "停用"}
          </Badge>
        </div>
        <div className="mt-1 truncate text-xs text-slate-500">
          {category.level === 1 ? `${count} 个二级分类` : `${count} 个商品`}
        </div>
        {category.level === 2 && extractSubcategoriesFromCategory(category).length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {extractSubcategoriesFromCategory(category).map((subName) => (
              <span
                key={subName}
                className="inline-flex items-center rounded bg-orange-100/70 px-1.5 py-0.5 text-[11px] font-medium text-orange-800"
              >
                • {subName}
              </span>
            ))}
          </div>
        ) : null}
      </button>
      </div>
      <div data-category-actions className="mt-3 flex flex-nowrap items-center gap-1.5">
        <Button className="h-8 shrink-0 px-2 text-xs" variant="outline" size="sm" onClick={onEdit} disabled={saving}>
          <Edit className="mr-1 h-3.5 w-3.5" />
          编辑
        </Button>
        <Button className="h-8 shrink-0 px-2 text-xs" variant="outline" size="sm" onClick={onToggle} disabled={saving}>
          {isCategoryEnabled(category) ? "停用" : "启用"}
        </Button>
        <Button className="h-8 shrink-0 px-2 text-xs" variant="outline" size="sm" onClick={onDelete} disabled={saving}>
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          删除
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ProductStatus }) {
  return (
    <Badge variant="outline" className={cn("w-fit", productStatusClass[status])}>
      {productStatusLabel[status]}
    </Badge>
  );
}

function CategoryDialog({
  categories,
  errors,
  form,
  onClose,
  onSubmit,
  onUpdate,
  saving,
}: {
  categories: AdminCategory[];
  errors: FieldErrors;
  form: CategoryForm | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (form: CategoryForm) => void;
  saving: boolean;
}) {
  if (!form) return null;
  return (
    <ModalFrame title={form.id ? "编辑分类" : "新增分类"} onClose={onClose} saving={saving}>
      <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
        <div className="grid min-h-0 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          <Field label="分类名称" error={errors.name} required>
            <Input
              value={form.name}
              placeholder="请输入分类展示名称"
              onChange={(event) => {
                const name = event.target.value;
                onUpdate({
                  ...form,
                  name,
                  slug: form.id ? form.slug : (form.slug || slugify(name)),
                });
              }}
            />
          </Field>
          <Field label="分类标识（英文唯一编号，自动生成）" error={errors.slug} required>
            <Input
              value={form.slug}
              placeholder="category-slug"
              onChange={(event) => onUpdate({ ...form, slug: event.target.value.trim().toLowerCase() })}
            />
          </Field>
          <Field label="分类级别" required>
            <select
              value={String(form.level)}
              onChange={(event) => onUpdate({ ...form, level: Number(event.target.value) as 1 | 2, parent_id: "" })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="1">一级分类</option>
              <option value="2">二级分类</option>
            </select>
          </Field>
          {form.level === 2 ? (
            <Field label="所属一级分类" error={errors.parent_id} required>
              <select
                value={form.parent_id}
                onChange={(event) => onUpdate({ ...form, parent_id: event.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">请选择一级分类</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="启用状态">
            <select
              value={form.is_active ? "1" : "0"}
              onChange={(event) => onUpdate({ ...form, is_active: event.target.value === "1" })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="1">启用</option>
              <option value="0">停用</option>
            </select>
          </Field>
          {form.level === 2 ? (
            <Field label="子分类目录（一行一个子分类名称，前台点击该二级分类后展开下拉目录）" className="sm:col-span-2">
              <Textarea
                rows={5}
                value={form.subcategories.join("\n")}
                placeholder={"例如：\nFacebook脸书 新号\nFacebook脸书 混合账号\nFacebook脸书 老号"}
                onChange={(event) =>
                  onUpdate({
                    ...form,
                    subcategories: event.target.value.split(/\r?\n/),
                  })
                }
              />
            </Field>
          ) : null}
        </div>
        <DialogActions saving={saving} onClose={onClose} />
      </form>
    </ModalFrame>
  );
}

function ProductDialog({
  categories,
  errors,
  form,
  isDirty,
  onClose,
  onSubmit,
  onUpdate,
  saving,
  product,
  skuRefreshKey,
}: {
  categories: AdminCategory[];
  errors: FieldErrors;
  form: ProductForm | null;
  isDirty: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, saveSkus?: (product: AdminProduct) => Promise<void>) => void;
  onUpdate: (form: ProductForm) => void;
  saving: boolean;
  product: AdminProduct | null;
  skuRefreshKey: number;
}) {
  const rootCategories = categories.filter((category) => category.level === 1 && isCategoryEnabled(category)).sort(sortCategories);
  const secondaries = form?.primaryCategoryId ? getEnabledChildren(categories, form.primaryCategoryId) : [];
  const skuManagerRef = useRef<ProductSkuManagerHandle>(null);
  const [isSkuDirty, setIsSkuDirty] = useState(false);
  const [bindingSku, setBindingSku] = useState<AdminProductSku | null>(null);
  const [bindingSheetOpen, setBindingSheetOpen] = useState(false);

  if (!form) return null;
  return (
    <ModalFrame title={form.id ? "编辑商品" : "新增商品"} onClose={onClose} saving={saving} size="max-w-5xl">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!skuManagerRef.current?.validate()) return;
          if (!(await skuManagerRef.current.prepareSave())) return;
          onSubmit(event, (savedProduct) => skuManagerRef.current!.saveAll(savedProduct));
        }}
        className="flex min-h-0 flex-col"
      >
        <div className="grid min-h-0 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          <Field label="商品名称" error={errors.name} required>
            <Input
              value={form.name}
              placeholder="请输入商品名称"
              onChange={(event) => {
                const name = event.target.value;
                onUpdate({ ...form, name, slug: form.slug || slugify(name) });
              }}
            />
          </Field>
          <Field label="商品标识" error={errors.slug} required>
            <Input
              value={form.slug}
              placeholder="product-slug"
              onChange={(event) => onUpdate({ ...form, slug: event.target.value.trim().toLowerCase() })}
            />
          </Field>
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
            <Field label="一级分类" error={errors.primaryCategoryId} required>
              <select
                value={form.primaryCategoryId}
                onChange={(event) => onUpdate({ ...form, primaryCategoryId: event.target.value, category_id: "", subcategory: "" })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">请选择一级分类</option>
                {rootCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="二级分类" error={errors.category_id} required={secondaries.length > 0}>
              <select
                value={form.category_id}
                disabled={!form.primaryCategoryId || secondaries.length === 0}
                onChange={(event) => onUpdate({ ...form, category_id: event.target.value, subcategory: "" })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:bg-slate-50"
              >
                <option value="">
                  {!form.primaryCategoryId ? "请先选择一级分类" : secondaries.length === 0 ? "无二级分类，直接绑定一级分类" : "请选择二级分类"}
                </option>
                {secondaries.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="所属子分类（选填）">
              {(() => {
                const selectedSec = secondaries.find((c) => c.id === form.category_id);
                const baseOptions = extractSubcategoriesFromCategory(selectedSec);
                const subOptions =
                  form.subcategory && !baseOptions.includes(form.subcategory)
                    ? [form.subcategory, ...baseOptions]
                    : baseOptions;
                return (
                  <select
                    value={form.subcategory}
                    disabled={!form.category_id || subOptions.length === 0}
                    onChange={(event) => onUpdate({ ...form, subcategory: event.target.value })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:bg-slate-50"
                  >
                    <option value="">
                      {!form.category_id
                        ? "请先选择二级分类"
                        : subOptions.length === 0
                          ? "当前二级分类暂无子分类"
                          : "不指定子分类"}
                    </option>
                    {subOptions.map((subName) => (
                      <option key={subName} value={subName}>
                        {subName}
                      </option>
                    ))}
                  </select>
                );
              })()}
            </Field>
          </div>
          <Field label="简短说明" className="sm:col-span-2">
            <Input
              value={form.short_description}
              placeholder="一句话介绍商品亮点"
              onChange={(event) => onUpdate({ ...form, short_description: event.target.value })}
            />
          </Field>
          <Field label="详细说明" className="sm:col-span-2">
            <Textarea rows={3} value={form.description} onChange={(event) => onUpdate({ ...form, description: event.target.value })} />
          </Field>
          <Field label="主图地址" className="sm:col-span-2" error={errors.image_url}>
            <div className="flex gap-3">
              <Input
                value={form.image_url}
                placeholder="/assets/... 或 https://..."
                onChange={(event) => onUpdate({ ...form, image_url: event.target.value })}
              />
              <img
                src={form.image_url || PRODUCT_FALLBACK_IMAGE}
                alt=""
                className="h-10 w-10 shrink-0 rounded-lg border object-cover"
                onError={(event) => {
                  event.currentTarget.src = PRODUCT_FALLBACK_IMAGE;
                }}
              />
            </div>
          </Field>
          <Field label="售价 (默认/基础价)" error={errors.price} required>
            <Input type="number" min="0" step="0.01" value={form.price} onChange={(event) => onUpdate({ ...form, price: event.target.value })} />
          </Field>
          <Field label="库存 (默认/基础库存)" error={errors.stock} required>
            <Input type="number" min="0" step="1" value={form.stock} onChange={(event) => onUpdate({ ...form, stock: event.target.value })} />
          </Field>
          <Field label="排序" error={errors.sort_order} required>
            <Input type="number" step="1" value={form.sort_order} onChange={(event) => onUpdate({ ...form, sort_order: event.target.value })} />
          </Field>
          <Field label="交付方式" required>
            <select
              value={form.delivery_mode || form.delivery_type}
              onChange={(event) => {
                const mode = event.target.value as ExtendedDeliveryMode;
                onUpdate({ ...form, delivery_mode: mode, delivery_type: toBaseDeliveryType(mode) });
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {EXTENDED_DELIVERY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="商品状态" required>
            <select
              value={form.status}
              onChange={(event) => onUpdate({ ...form, status: event.target.value as ProductStatus })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(productStatusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="metadata.note" className="sm:col-span-2">
            <Input value={form.metadata_note} onChange={(event) => onUpdate({ ...form, metadata_note: event.target.value })} />
          </Field>

          <div className="sm:col-span-2 mt-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">商品规格与 SKU 管理</h3>
                <p className="text-xs text-slate-500 mt-0.5">多规格商品可在此处维护规格标题、编码、价格、库存与状态。</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900"
                onClick={() => skuManagerRef.current?.reload?.()}
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                刷新规格
              </Button>
            </div>
            <AdminProductSkuManager
              ref={skuManagerRef}
              product={product}
              refreshKey={skuRefreshKey}
              defaults={{
                price: form.price,
                original_price: form.original_price,
                stock: form.stock,
                delivery_type: form.delivery_type,
                status: form.status,
              }}
              onSummary={(summary) => {
                setIsSkuDirty(true);
                onUpdate({
                  ...form,
                  price: String(summary.price ?? form.price),
                  stock: String(summary.stock),
                });
              }}
              onSupplierBinding={(_prod, sku) => {
                setBindingSku(sku ?? null);
                setBindingSheetOpen(true);
              }}
            />
          </div>
        </div>
        <DialogActions saving={saving} onClose={onClose} disableSave={!isDirty && !isSkuDirty} />
      </form>
      <AdminSupplierBindingSheet
        open={bindingSheetOpen}
        product={product}
        sku={bindingSku}
        onOpenChange={(open) => {
          setBindingSheetOpen(open);
          if (!open) setBindingSku(null);
        }}
        onSaved={() => {
          skuManagerRef.current?.reload?.();
        }}
      />
    </ModalFrame>
  );
}

function ModalFrame({
  children,
  onClose,
  saving,
  title,
  size = "max-w-3xl",
}: {
  children: ReactNode;
  onClose: () => void;
  saving: boolean;
  title: string;
  size?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div className={cn("flex max-h-[calc(100vh-48px)] w-full flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl", size)}>
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <button type="button" className="rounded-full p-2 text-slate-400 hover:bg-slate-100" onClick={onClose} disabled={saving}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DialogActions({ disableSave = false, onClose, saving }: { disableSave?: boolean; onClose: () => void; saving: boolean }) {
  return (
    <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-4">
      <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
        取消
      </Button>
      <Button type="submit" disabled={saving || disableSave}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {saving ? "保存中..." : "保存"}
      </Button>
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
    <label className={cn("space-y-1.5 text-sm", className)}>
      <span className="font-medium text-slate-700">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </span>
      {children}
      {error ? <span className="block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "-";
  }
}
