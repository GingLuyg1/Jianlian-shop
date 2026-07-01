"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Edit, Loader2, PackagePlus, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createCategory,
  createProduct,
  deleteCategory,
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
};

type ProductForm = {
  id?: string;
  primaryCategoryId: string;
  category_id: string;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  image_url: string;
  price: string;
  original_price: string;
  stock: string;
  delivery_type: DeliveryType;
  status: ProductStatus;
  sort_order: string;
  metadata_note: string;
};

type FieldErrors = Record<string, string>;

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
  };
}

function emptyProductForm(rootId = "", categoryId = ""): ProductForm {
  return {
    primaryCategoryId: rootId,
    category_id: categoryId,
    name: "",
    slug: "",
    short_description: "",
    description: "",
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

function sortCategories(a: AdminCategory, b: AdminCategory) {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name);
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
    name: form.name.trim(),
    slug: form.slug.trim().toLowerCase(),
    short_description: form.short_description.trim(),
    description: form.description.trim(),
    image_url: form.image_url.trim(),
    price: Number(form.price || 0),
    original_price: form.original_price.trim() ? Number(form.original_price) : null,
    stock: Number(form.stock || 0),
    delivery_type: form.delivery_type,
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
  return {
    id: product.id,
    primaryCategoryId: rootId,
    category_id: category?.level === 2 ? category.id : "",
    name: product.name,
    slug: product.slug,
    short_description: product.short_description ?? "",
    description: product.description ?? "",
    image_url: product.image_url ?? "",
    price: String(product.price ?? ""),
    original_price: product.original_price === null || product.original_price === undefined ? "" : String(product.original_price),
    stock: String(product.stock ?? 0),
    delivery_type: product.delivery_type,
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [selectedRootId, setSelectedRootId] = useState("");
  const [selectedChildId, setSelectedChildId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [productStatus, setProductStatusFilter] = useState<ProductStatus | "all">("all");
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [categoryForm, setCategoryForm] = useState<CategoryForm | null>(null);
  const [productForm, setProductForm] = useState<ProductForm | null>(null);
  const [productInitialForm, setProductInitialForm] = useState<ProductForm | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

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

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true);
    setError("");
    try {
      const rows = await listCategories();
      setCategories(rows);
      const roots = rows.filter((row) => row.level === 1).sort(sortCategories);
      const queryRoot = searchParams.get("root");
      const queryCategory = searchParams.get("category");
      setSelectedRootId((current) => {
        if (queryRoot && roots.some((row) => row.id === queryRoot)) return queryRoot;
        if (current && roots.some((row) => row.id === current)) return current;
        return roots[0]?.id ?? "";
      });
      setSelectedChildId((current) => {
        if (queryCategory && rows.some((row) => row.id === queryCategory && row.parent_id === (queryRoot || selectedRootId))) {
          return queryCategory;
        }
        return current && rows.some((row) => row.id === current) ? current : "";
      });
    } catch (loadError) {
      setError(getErrorText(loadError, "分类读取失败，请稍后重试"));
    } finally {
      setLoadingCategories(false);
    }
  }, [searchParams, selectedRootId]);

  const loadProducts = useCallback(async () => {
    if (!selectedProductCategoryId) {
      setProducts([]);
      setProductCount(0);
      return;
    }
    setLoadingProducts(true);
    setError("");
    try {
      const result = await listProducts({
        search: debouncedSearch,
        categoryId: selectedProductCategoryId,
        status: productStatus,
        sortBy: "updated_at",
        page: 1,
        pageSize: 100,
      });
      setProducts(result.products);
      setProductCount(result.count);
    } catch (loadError) {
      setError(getErrorText(loadError, "商品读取失败，请稍后重试"));
    } finally {
      setLoadingProducts(false);
    }
  }, [debouncedSearch, productStatus, selectedProductCategoryId]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(productSearch), 300);
    return () => window.clearTimeout(timer);
  }, [productSearch]);

  function updateUrl(rootId: string, childId = "") {
    const params = new URLSearchParams();
    if (rootId) params.set("root", rootId);
    if (childId) params.set("category", childId);
    router.replace(`/admin/categories${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }

  function selectRoot(categoryId: string) {
    setSelectedRootId(categoryId);
    setSelectedChildId("");
    updateUrl(categoryId);
  }

  function selectChild(categoryId: string) {
    setSelectedChildId(categoryId);
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

    const payload: CategoryPayload = {
      parent_id: categoryForm.level === 1 ? null : categoryForm.parent_id,
      level: categoryForm.level,
      name: categoryForm.name.trim(),
      slug: categoryForm.slug.trim().toLowerCase(),
      icon: categoryForm.icon.trim() || null,
      description: categoryForm.description.trim() || null,
      sort_order: parseNumber(categoryForm.sort_order),
      is_active: categoryForm.is_active,
    };

    setSaving(true);
    setNotice("");
    setError("");
    try {
      const saved = categoryForm.id ? await updateCategory(categoryForm.id, payload) : await createCategory(payload);
      setNotice(categoryForm.id ? "分类已保存" : "分类已新增");
      setCategoryForm(null);
      await loadCategories();
      if (saved.level === 1) selectRoot(saved.id);
      if (saved.level === 2) {
        setSelectedRootId(saved.parent_id ?? "");
        setSelectedChildId(saved.id);
        updateUrl(saved.parent_id ?? "", saved.id);
      }
    } catch (saveError) {
      setError(getErrorText(saveError, "分类保存失败，请检查输入内容"));
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
      setError(getErrorText(deleteError, "分类删除失败"));
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
      setError(getErrorText(statusError, "分类状态更新失败"));
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
    if (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice < price)) errors.original_price = "原价不能小于售价";
    if (!isIntegerText(form.stock) || Number(form.stock) < 0) errors.stock = "库存必须是大于或等于 0 的整数";
    if (!isIntegerText(form.sort_order)) errors.sort_order = "排序必须是整数";
    if (!isValidImagePath(form.image_url)) errors.image_url = "图片地址必须是 /assets/... 或 http(s) URL，不能使用 blob 临时地址";
    return errors;
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productForm || saving) return;
    const errors = validateProduct(productForm);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (!isProductDirty(productForm, productInitialForm)) {
      setNotice("没有需要保存的商品修改");
      return;
    }

    const payload: ProductPayload = {
      name: productForm.name.trim(),
      slug: productForm.slug.trim().toLowerCase(),
      category_id: resolveProductCategoryId(productForm),
      short_description: productForm.short_description.trim() || null,
      description: productForm.description.trim() || null,
      image_url: productForm.image_url.trim() || null,
      price: parseNumber(productForm.price),
      original_price: productForm.original_price.trim() ? parseNumber(productForm.original_price) : null,
      stock: parseNumber(productForm.stock),
      delivery_type: productForm.delivery_type,
      status: productForm.status,
      sort_order: parseNumber(productForm.sort_order),
      metadata: productForm.metadata_note.trim() ? { note: productForm.metadata_note.trim() } : null,
    };

    setSaving(true);
    setNotice("");
    setError("");
    try {
      const saved = productForm.id ? await updateProduct(productForm.id, payload) : await createProduct(payload);
      mergeSavedProductIntoPanel(saved);
      const savedForm = toProductForm(saved, categoryMap);
      setProductInitialForm(savedForm);
      setProductForm(savedForm);
      setNotice(productForm.id ? "\u5546\u54c1\u5df2\u4fdd\u5b58" : "\u5546\u54c1\u5df2\u65b0\u589e");
      closeProductEditorAfterSave();
      await loadProducts();
    } catch (saveError) {
      setError(getErrorText(saveError, "商品保存失败，请检查输入内容"));
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
      await loadProducts();
    } catch (statusError) {
      setError(getErrorText(statusError, "商品状态更新失败"));
    } finally {
      setSaving(false);
    }
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
      {notice ? (
        <div className="mb-3 shrink-0 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="mb-3 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[minmax(260px,300px)_minmax(300px,360px)_minmax(0,1fr)]">
        <CategoryColumn
          title="一级分类"
          loading={loadingCategories}
          emptyTitle="暂无一级分类"
          actionLabel="新增一级分类"
          onAction={openCreateRoot}
          error={Boolean(error && categories.length === 0)}
          onRetry={loadCategories}
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
            />
          ))}
        </CategoryColumn>

        <CategoryColumn
          title={selectedRoot ? `${selectedRoot.name} / 二级分类` : "二级分类"}
          loading={loadingCategories}
          emptyTitle={selectedRoot ? "暂无二级分类" : "请选择一级分类"}
          emptyDescription={selectedRoot ? "右侧将显示直接关联该一级分类的商品。" : "选择一级分类后查看二级分类。"}
          actionLabel={selectedRoot ? "新增二级分类" : undefined}
          onAction={selectedRoot ? openCreateChild : undefined}
          error={false}
          onRetry={loadCategories}
        >
          {childCategories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              active={selectedChildId === category.id}
              count={products.filter((product) => product.category_id === category.id).length}
              onClick={() => selectChild(category.id)}
              onEdit={() => openEditCategory(category)}
              onDelete={() => removeCategory(category)}
              onToggle={() => toggleCategory(category)}
              saving={saving}
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
                <Button variant="outline" size="sm" onClick={loadProducts} disabled={loadingProducts}>
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
                <div className="sticky top-0 z-10 grid grid-cols-[72px_minmax(220px,1fr)_96px_80px_96px_140px_150px] bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
                  <div>图片</div>
                  <div>商品名称</div>
                  <div>价格</div>
                  <div>库存</div>
                  <div>状态</div>
                  <div>更新时间</div>
                  <div className="text-right">操作</div>
                </div>
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="grid grid-cols-[72px_minmax(220px,1fr)_96px_80px_96px_140px_150px] items-center px-4 py-3 text-sm"
                  >
                    <img
                      src={product.image_url || PRODUCT_FALLBACK_IMAGE}
                      alt=""
                      className="h-10 w-10 rounded-lg border object-cover"
                      onError={(event) => {
                        event.currentTarget.src = PRODUCT_FALLBACK_IMAGE;
                      }}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-950" title={product.name}>
                        {product.name}
                      </div>
                      <div className="truncate text-xs text-slate-500" title={product.slug}>
                        {product.slug}
                      </div>
                    </div>
                    <div className="tabular-nums">¥{product.price.toFixed(2)}</div>
                    <div className={cn("tabular-nums", product.stock <= 0 ? "text-red-600" : "text-slate-700")}>
                      {product.stock}
                    </div>
                    <StatusBadge status={product.status} />
                    <time className="text-xs text-slate-500">{formatDate(product.updated_at)}</time>
                    <div className="flex justify-end gap-1">
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
}: {
  active: boolean;
  category: AdminCategory;
  count: number;
  onClick: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onToggle: () => void;
  saving: boolean;
}) {
  return (
    <div className={cn("rounded-lg border p-3", active ? "border-primary bg-orange-50" : "border-slate-200")}>
      <button type="button" className="block w-full text-left" onClick={onClick}>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-slate-950">{category.name}</span>
          <Badge
            variant="outline"
            className={isCategoryEnabled(category) ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 bg-slate-50 text-slate-500"}
          >
            {isCategoryEnabled(category) ? "启用" : "停用"}
          </Badge>
        </div>
        <div className="mt-1 truncate text-xs text-slate-500">
          {category.slug} · sort {category.sort_order} · {count} 项
        </div>
        {category.description ? <p className="mt-2 line-clamp-2 text-xs text-slate-500">{category.description}</p> : null}
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEdit} disabled={saving}>
          <Edit className="mr-1 h-3.5 w-3.5" />
          编辑
        </Button>
        <Button variant="outline" size="sm" onClick={onToggle} disabled={saving}>
          {isCategoryEnabled(category) ? "停用" : "启用"}
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete} disabled={saving}>
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
              onChange={(event) => {
                const name = event.target.value;
                onUpdate({ ...form, name, slug: form.slug || slugify(name) });
              }}
            />
          </Field>
          <Field label="分类标识" error={errors.slug} required>
            <Input value={form.slug} onChange={(event) => onUpdate({ ...form, slug: event.target.value.trim().toLowerCase() })} />
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
          <Field label="图标">
            <Input value={form.icon} onChange={(event) => onUpdate({ ...form, icon: event.target.value })} />
          </Field>
          <Field label="排序" error={errors.sort_order} required>
            <Input type="number" step="1" value={form.sort_order} onChange={(event) => onUpdate({ ...form, sort_order: event.target.value })} />
          </Field>
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
          <Field label="描述" className="sm:col-span-2">
            <Textarea rows={3} value={form.description} onChange={(event) => onUpdate({ ...form, description: event.target.value })} />
          </Field>
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
}: {
  categories: AdminCategory[];
  errors: FieldErrors;
  form: ProductForm | null;
  isDirty: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (form: ProductForm) => void;
  saving: boolean;
}) {
  const rootCategories = categories.filter((category) => category.level === 1 && isCategoryEnabled(category)).sort(sortCategories);
  const secondaries = form?.primaryCategoryId ? getEnabledChildren(categories, form.primaryCategoryId) : [];
  if (!form) return null;
  return (
    <ModalFrame title={form.id ? "编辑商品" : "新增商品"} onClose={onClose} saving={saving}>
      <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
        <div className="grid min-h-0 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          <Field label="商品名称" error={errors.name} required>
            <Input
              value={form.name}
              onChange={(event) => {
                const name = event.target.value;
                onUpdate({ ...form, name, slug: form.slug || slugify(name) });
              }}
            />
          </Field>
          <Field label="商品标识" error={errors.slug} required>
            <Input value={form.slug} onChange={(event) => onUpdate({ ...form, slug: event.target.value.trim().toLowerCase() })} />
          </Field>
          <Field label="一级分类" error={errors.primaryCategoryId} required>
            <select
              value={form.primaryCategoryId}
              onChange={(event) => onUpdate({ ...form, primaryCategoryId: event.target.value, category_id: "" })}
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
              onChange={(event) => onUpdate({ ...form, category_id: event.target.value })}
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
          <Field label="简短说明" className="sm:col-span-2">
            <Input value={form.short_description} onChange={(event) => onUpdate({ ...form, short_description: event.target.value })} />
          </Field>
          <Field label="详细说明" className="sm:col-span-2">
            <Textarea rows={3} value={form.description} onChange={(event) => onUpdate({ ...form, description: event.target.value })} />
          </Field>
          <Field label="主图" className="sm:col-span-2" error={errors.image_url}>
            <div className="flex gap-3">
              <Input value={form.image_url} onChange={(event) => onUpdate({ ...form, image_url: event.target.value })} />
              <img
                src={form.image_url || PRODUCT_FALLBACK_IMAGE}
                alt=""
                className="h-10 w-10 rounded-lg border object-cover"
                onError={(event) => {
                  event.currentTarget.src = PRODUCT_FALLBACK_IMAGE;
                }}
              />
            </div>
          </Field>
          <Field label="售价" error={errors.price} required>
            <Input type="number" min="0" step="0.01" value={form.price} onChange={(event) => onUpdate({ ...form, price: event.target.value })} />
          </Field>
          <Field label="原价" error={errors.original_price}>
            <Input type="number" min="0" step="0.01" value={form.original_price} onChange={(event) => onUpdate({ ...form, original_price: event.target.value })} />
          </Field>
          <Field label="库存" error={errors.stock} required>
            <Input type="number" min="0" step="1" value={form.stock} onChange={(event) => onUpdate({ ...form, stock: event.target.value })} />
          </Field>
          <Field label="排序" error={errors.sort_order} required>
            <Input type="number" step="1" value={form.sort_order} onChange={(event) => onUpdate({ ...form, sort_order: event.target.value })} />
          </Field>
          <Field label="交付方式" required>
            <select
              value={form.delivery_type}
              onChange={(event) => onUpdate({ ...form, delivery_type: event.target.value as DeliveryType })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(deliveryLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
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
        </div>
        <DialogActions saving={saving} onClose={onClose} disableSave={!isDirty} />
      </form>
    </ModalFrame>
  );
}

function ModalFrame({
  children,
  onClose,
  saving,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  saving: boolean;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div className="flex max-h-[calc(100vh-48px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl">
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
