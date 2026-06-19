"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Plus, RefreshCw, Search } from "lucide-react";

const PRODUCT_PAGE_SIZE = 10;

const productStatusLabel: Record<ProductStatus, string> = {
  draft: "草稿",
  active: "已上架",
  inactive: "已下架",
  sold_out: "已售罄",
};

const productStatusClass: Record<ProductStatus, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-600",
  active: "border-green-200 bg-green-50 text-green-700",
  inactive: "border-amber-200 bg-amber-50 text-amber-700",
  sold_out: "border-red-200 bg-red-50 text-red-600",
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
  category_id: string;
  short_description: string;
  image_url: string;
  price: string;
  original_price: string;
  stock: string;
  delivery_type: DeliveryType;
  status: ProductStatus;
  sort_order: string;
};

type CategoryFormState = {
  id?: string;
  parent_id: string;
  level: "1" | "2" | "3";
  name: string;
  slug: string;
  icon: string;
  description: string;
  sort_order: string;
};

function emptyProductForm(): ProductFormState {
  return {
    name: "",
    slug: "",
    category_id: "",
    short_description: "",
    image_url: "",
    price: "",
    original_price: "",
    stock: "0",
    delivery_type: "manual",
    status: "draft",
    sort_order: "0",
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
  };
}

function getErrorText(error: unknown, fallback = "操作失败，请稍后重试") {
  return (error as { message?: string } | null | undefined)?.message ?? fallback;
}

function parseNumber(value: string, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function toProductForm(product: AdminProduct): ProductFormState {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    category_id: product.category_id ?? "",
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
  };
}

function toCategoryForm(category: AdminCategory): CategoryFormState {
  return {
    id: category.id,
    parent_id: category.parent_id ?? "",
    level: String(category.level) as "1" | "2" | "3",
    name: category.name,
    slug: category.slug,
    icon: category.icon ?? "",
    description: category.description ?? "",
    sort_order: String(category.sort_order ?? 0),
  };
}

function ProductTableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-12 animate-pulse rounded-lg bg-slate-100"
        />
      ))}
    </div>
  );
}

function CategoryTreeSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-xl bg-slate-100"
        />
      ))}
    </div>
  );
}

export default function AdminProductsPage() {
  const [activeTab, setActiveTab] = useState("products");
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("all");
  const [productStatusFilter, setProductStatusFilter] =
    useState<ProductStatus | "all">("all");
  const [productPage, setProductPage] = useState(1);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [isCategoryLoading, setIsCategoryLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [productForm, setProductForm] = useState<ProductFormState | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState | null>(
    null
  );

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  const totalProductPages = Math.max(
    1,
    Math.ceil(productCount / PRODUCT_PAGE_SIZE)
  );

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
        search: productSearch,
        categoryId: productCategoryFilter,
        status: productStatusFilter,
        page: productPage,
        pageSize: PRODUCT_PAGE_SIZE,
      });
      setProducts(result.products);
      setProductCount(result.count);
    } catch (loadError) {
      setError(getErrorText(loadError, "商品列表读取失败"));
    } finally {
      setIsProductLoading(false);
    }
  }, [
    productCategoryFilter,
    productPage,
    productSearch,
    productStatusFilter,
  ]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  function clearNotice() {
    setMessage("");
    setError("");
  }

  function buildProductPayload(): ProductPayload | null {
    if (!productForm) return null;

    if (!productForm.name.trim() || !productForm.slug.trim()) {
      setError("商品名称和 slug 必填");
      return null;
    }

    return {
      name: productForm.name.trim(),
      slug: productForm.slug.trim(),
      category_id: productForm.category_id || null,
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
    };
  }

  function buildCategoryPayload(): CategoryPayload | null {
    if (!categoryForm) return null;

    if (!categoryForm.name.trim() || !categoryForm.slug.trim()) {
      setError("分类名称和 slug 必填");
      return null;
    }

    const level = Number(categoryForm.level) as 1 | 2 | 3;
    const parentId = level === 1 ? null : categoryForm.parent_id || null;

    if (level > 1 && !parentId) {
      setError(level === 2 ? "二级分类必须选择一级父分类" : "三级分类必须选择二级父分类");
      return null;
    }

    return {
      parent_id: parentId,
      level,
      name: categoryForm.name.trim(),
      slug: categoryForm.slug.trim(),
      icon: categoryForm.icon.trim() || null,
      description: categoryForm.description.trim() || null,
      sort_order: parseNumber(categoryForm.sort_order),
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
        setMessage("商品已保存");
      } else {
        await createProduct(payload);
        setMessage("商品已新增");
      }

      setProductForm(null);
      await loadProducts();
    } catch (saveError) {
      setError(getErrorText(saveError, "商品保存失败"));
    } finally {
      setIsSaving(false);
    }
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
        setMessage("分类已保存");
      } else {
        await createCategory(payload);
        setMessage("分类已新增");
      }

      setCategoryForm(null);
      await loadCategories();
    } catch (saveError) {
      setError(getErrorText(saveError, "分类保存失败"));
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

  async function handleDeleteProduct(id: string) {
    if (!window.confirm("确认删除该商品吗？")) return;

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

  async function handleDeleteCategory(id: string) {
    if (!window.confirm("确认删除该分类吗？存在子分类或商品时可能会删除失败。")) {
      return;
    }

    clearNotice();
    setIsCategoryLoading(true);
    try {
      await deleteCategory(id);
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
    setProductCategoryFilter("all");
    setProductStatusFilter("all");
    setProductPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-950">商品与分类管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            使用 Supabase categories 和 products 表管理后台商品数据。
          </p>
        </div>
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
      </div>

      {(message || error) && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          )}
        >
          {error || message}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white ring-1 ring-slate-200">
          <TabsTrigger value="products">商品管理</TabsTrigger>
          <TabsTrigger value="categories">分类管理</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4 space-y-4">
          <ProductManager
            categories={categories}
            categoryMap={categoryMap}
            form={productForm}
            isLoading={isProductLoading}
            isSaving={isSaving}
            page={productPage}
            pageSize={PRODUCT_PAGE_SIZE}
            products={products}
            search={productSearch}
            statusFilter={productStatusFilter}
            categoryFilter={productCategoryFilter}
            totalPages={totalProductPages}
            totalCount={productCount}
            onCancelForm={() => setProductForm(null)}
            onDelete={handleDeleteProduct}
            onEdit={(product) => {
              clearNotice();
              setProductForm(toProductForm(product));
            }}
            onFilterCategory={(value) => {
              setProductCategoryFilter(value);
              setProductPage(1);
            }}
            onFilterStatus={(value) => {
              setProductStatusFilter(value as ProductStatus | "all");
              setProductPage(1);
            }}
            onNew={() => {
              clearNotice();
              setProductForm(emptyProductForm());
            }}
            onPageChange={setProductPage}
            onResetFilters={resetProductFilters}
            onSearch={(value) => {
              setProductSearch(value);
              setProductPage(1);
            }}
            onStatusChange={handleProductStatus}
            onSubmit={handleProductSubmit}
            onUpdateForm={setProductForm}
          />
        </TabsContent>

        <TabsContent value="categories" className="mt-4 space-y-4">
          <CategoryManager
            categories={categories}
            form={categoryForm}
            isLoading={isCategoryLoading}
            isSaving={isSaving}
            onCancelForm={() => setCategoryForm(null)}
            onDelete={handleDeleteCategory}
            onEdit={(category) => {
              clearNotice();
              setCategoryForm(toCategoryForm(category));
            }}
            onNew={() => {
              clearNotice();
              setCategoryForm(emptyCategoryForm());
            }}
            onSubmit={handleCategorySubmit}
            onToggleStatus={handleToggleCategory}
            onUpdateForm={setCategoryForm}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProductManager({
  categories,
  categoryMap,
  form,
  isLoading,
  isSaving,
  page,
  pageSize,
  products,
  search,
  statusFilter,
  categoryFilter,
  totalPages,
  totalCount,
  onCancelForm,
  onDelete,
  onEdit,
  onFilterCategory,
  onFilterStatus,
  onNew,
  onPageChange,
  onResetFilters,
  onSearch,
  onStatusChange,
  onSubmit,
  onUpdateForm,
}: {
  categories: AdminCategory[];
  categoryMap: Map<string, AdminCategory>;
  form: ProductFormState | null;
  isLoading: boolean;
  isSaving: boolean;
  page: number;
  pageSize: number;
  products: AdminProduct[];
  search: string;
  statusFilter: ProductStatus | "all";
  categoryFilter: string;
  totalPages: number;
  totalCount: number;
  onCancelForm: () => void;
  onDelete: (id: string) => void;
  onEdit: (product: AdminProduct) => void;
  onFilterCategory: (value: string) => void;
  onFilterStatus: (value: string) => void;
  onNew: () => void;
  onPageChange: (page: number) => void;
  onResetFilters: () => void;
  onSearch: (value: string) => void;
  onStatusChange: (id: string, status: ProductStatus) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateForm: (form: ProductFormState) => void;
}) {
  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-base">商品列表</CardTitle>
            <Button size="sm" onClick={onNew}>
              <Plus className="mr-2 h-4 w-4" />
              新增商品
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_160px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="搜索商品名称"
                value={search}
                onChange={(event) => onSearch(event.target.value)}
              />
            </div>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={categoryFilter}
              onChange={(event) => onFilterCategory(event.target.value)}
            >
              <option value="all">全部分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {"　".repeat(category.level - 1)}
                  {category.name}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(event) => onFilterStatus(event.target.value)}
            >
              <option value="all">全部状态</option>
              {Object.entries(productStatusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={onResetFilters}>
              重置
            </Button>
          </div>

          {isLoading ? (
            <ProductTableSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品名称</TableHead>
                    <TableHead>slug</TableHead>
                    <TableHead>所属分类</TableHead>
                    <TableHead>售价</TableHead>
                    <TableHead>原价</TableHead>
                    <TableHead>库存</TableHead>
                    <TableHead>交付方式</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>排序</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={11}
                        className="h-28 text-center text-sm text-slate-500"
                      >
                        暂无商品数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="max-w-[220px] truncate font-medium">
                          {product.name}
                        </TableCell>
                        <TableCell className="text-slate-500">
                          {product.slug}
                        </TableCell>
                        <TableCell>
                          {product.category_id
                            ? categoryMap.get(product.category_id)?.name ??
                              "未匹配分类"
                            : "未设置"}
                        </TableCell>
                        <TableCell>¥{product.price.toFixed(2)}</TableCell>
                        <TableCell>
                          {product.original_price
                            ? `¥${product.original_price.toFixed(2)}`
                            : "-"}
                        </TableCell>
                        <TableCell
                          className={
                            product.stock > 0 ? "text-green-600" : "text-slate-400"
                          }
                        >
                          {product.stock}
                        </TableCell>
                        <TableCell>{deliveryLabel[product.delivery_type]}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(productStatusClass[product.status])}
                          >
                            {productStatusLabel[product.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>{product.sort_order}</TableCell>
                        <TableCell className="whitespace-nowrap text-slate-500">
                          {product.updated_at
                            ? new Date(product.updated_at).toLocaleString()
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onEdit(product)}
                            >
                              编辑
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                onStatusChange(
                                  product.id,
                                  product.status === "active"
                                    ? "inactive"
                                    : "active"
                                )
                              }
                            >
                              {product.status === "active" ? "下架" : "上架"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onStatusChange(product.id, "sold_out")}
                            >
                              售罄
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600"
                              onClick={() => onDelete(product.id)}
                            >
                              删除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-col gap-2 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
            <span>
              共 {totalCount} 条记录，当前第 {page} / {totalPages} 页
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPageChange(Math.max(1, page - 1))}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || products.length < pageSize}
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {form && (
        <ProductFormCard
          categories={categories}
          form={form}
          isSaving={isSaving}
          onCancel={onCancelForm}
          onSubmit={onSubmit}
          onUpdate={onUpdateForm}
        />
      )}
    </>
  );
}

function ProductFormCard({
  categories,
  form,
  isSaving,
  onCancel,
  onSubmit,
  onUpdate,
}: {
  categories: AdminCategory[];
  form: ProductFormState;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (form: ProductFormState) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {form.id ? "编辑商品" : "新增商品"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <Field label="商品名称">
            <Input
              value={form.name}
              onChange={(event) => onUpdate({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="slug">
            <Input
              value={form.slug}
              onChange={(event) => onUpdate({ ...form, slug: event.target.value })}
            />
          </Field>
          <Field label="所属分类">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.category_id}
              onChange={(event) =>
                onUpdate({ ...form, category_id: event.target.value })
              }
            >
              <option value="">未设置</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {"　".repeat(category.level - 1)}
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="图片 URL">
            <Input
              value={form.image_url}
              onChange={(event) =>
                onUpdate({ ...form, image_url: event.target.value })
              }
            />
          </Field>
          <Field label="售价">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(event) => onUpdate({ ...form, price: event.target.value })}
            />
          </Field>
          <Field label="原价">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.original_price}
              onChange={(event) =>
                onUpdate({ ...form, original_price: event.target.value })
              }
            />
          </Field>
          <Field label="库存">
            <Input
              type="number"
              min="0"
              step="1"
              value={form.stock}
              onChange={(event) => onUpdate({ ...form, stock: event.target.value })}
            />
          </Field>
          <Field label="排序">
            <Input
              type="number"
              step="1"
              value={form.sort_order}
              onChange={(event) =>
                onUpdate({ ...form, sort_order: event.target.value })
              }
            />
          </Field>
          <Field label="交付方式">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.delivery_type}
              onChange={(event) =>
                onUpdate({
                  ...form,
                  delivery_type: event.target.value as DeliveryType,
                })
              }
            >
              {Object.entries(deliveryLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="状态">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.status}
              onChange={(event) =>
                onUpdate({ ...form, status: event.target.value as ProductStatus })
              }
            >
              {Object.entries(productStatusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="短描述" className="md:col-span-2">
            <Input
              value={form.short_description}
              onChange={(event) =>
                onUpdate({ ...form, short_description: event.target.value })
              }
            />
          </Field>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              取消
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "保存中..." : "保存商品"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function CategoryManager({
  categories,
  form,
  isLoading,
  isSaving,
  onCancelForm,
  onDelete,
  onEdit,
  onNew,
  onSubmit,
  onToggleStatus,
  onUpdateForm,
}: {
  categories: AdminCategory[];
  form: CategoryFormState | null;
  isLoading: boolean;
  isSaving: boolean;
  onCancelForm: () => void;
  onDelete: (id: string) => void;
  onEdit: (category: AdminCategory) => void;
  onNew: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleStatus: (category: AdminCategory) => void;
  onUpdateForm: (form: CategoryFormState) => void;
}) {
  const rootCategories = categories.filter((category) => category.level === 1);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-base">分类树</CardTitle>
            <Button size="sm" onClick={onNew}>
              <Plus className="mr-2 h-4 w-4" />
              新增分类
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <CategoryTreeSkeleton />
          ) : rootCategories.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">
              暂无分类数据
            </div>
          ) : (
            <div className="space-y-3">
              {rootCategories.map((category) => (
                <CategoryTreeNode
                  key={category.id}
                  category={category}
                  categories={categories}
                  depth={0}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onToggleStatus={onToggleStatus}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {form && (
        <CategoryFormCard
          categories={categories}
          form={form}
          isSaving={isSaving}
          onCancel={onCancelForm}
          onSubmit={onSubmit}
          onUpdate={onUpdateForm}
        />
      )}
    </>
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
  onDelete: (id: string) => void;
  onEdit: (category: AdminCategory) => void;
  onToggleStatus: (category: AdminCategory) => void;
}) {
  const children = categories.filter(
    (candidate) => candidate.parent_id === category.id
  );
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
            <span className="text-xs text-slate-400">
              sort_order: {category.sort_order}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">
            slug: {category.slug}
            {category.icon ? ` ｜ icon: ${category.icon}` : ""}
          </p>
          {category.description && (
            <p className="mt-1 text-sm text-slate-500">
              {category.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit(category)}>
            编辑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleStatus(category)}
          >
            {enabled ? "停用" : "启用"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600"
            onClick={() => onDelete(category.id)}
          >
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

function CategoryFormCard({
  categories,
  form,
  isSaving,
  onCancel,
  onSubmit,
  onUpdate,
}: {
  categories: AdminCategory[];
  form: CategoryFormState;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (form: CategoryFormState) => void;
}) {
  const parentOptions = categories.filter((category) => {
    if (form.level === "2") return category.level === 1;
    if (form.level === "3") return category.level === 2;
    return false;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {form.id ? "编辑分类" : "新增分类"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <Field label="分类名称">
            <Input
              value={form.name}
              onChange={(event) => onUpdate({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="slug">
            <Input
              value={form.slug}
              onChange={(event) => onUpdate({ ...form, slug: event.target.value })}
            />
          </Field>
          <Field label="level">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.level}
              onChange={(event) =>
                onUpdate({
                  ...form,
                  level: event.target.value as "1" | "2" | "3",
                  parent_id: "",
                })
              }
            >
              <option value="1">一级分类</option>
              <option value="2">二级分类</option>
              <option value="3">三级分类</option>
            </select>
          </Field>
          <Field label="parent_id">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              disabled={form.level === "1"}
              value={form.level === "1" ? "" : form.parent_id}
              onChange={(event) =>
                onUpdate({ ...form, parent_id: event.target.value })
              }
            >
              <option value="">
                {form.level === "1" ? "一级分类不需要父级" : "请选择父分类"}
              </option>
              {parentOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="icon">
            <Input
              value={form.icon}
              onChange={(event) => onUpdate({ ...form, icon: event.target.value })}
            />
          </Field>
          <Field label="sort_order">
            <Input
              type="number"
              step="1"
              value={form.sort_order}
              onChange={(event) =>
                onUpdate({ ...form, sort_order: event.target.value })
              }
            />
          </Field>
          <Field label="description" className="md:col-span-2">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) =>
                onUpdate({ ...form, description: event.target.value })
              }
            />
          </Field>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              取消
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "保存中..." : "保存分类"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs text-slate-500">{label}</Label>
      {children}
    </div>
  );
}
