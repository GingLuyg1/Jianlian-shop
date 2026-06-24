"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

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
  isCategoryEnabled,
  listCategories,
  setCategoryStatus,
  updateCategory,
  type AdminCategory,
  type CategoryPayload,
} from "@/lib/supabase/admin-catalog";
import { cn } from "@/lib/utils";

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

function emptyForm(parentId = ""): CategoryForm {
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

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<CategoryForm | null>(null);

  const rootCategories = useMemo(
    () => categories.filter((category) => category.level === 1).sort(sortCategories),
    [categories]
  );
  const selectedRoot = rootCategories.find((category) => category.id === selectedId) ?? null;
  const childCategories = useMemo(
    () => categories.filter((category) => category.parent_id === selectedId).sort(sortCategories),
    [categories, selectedId]
  );

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const rows = await listCategories();
      setCategories(rows);
      setSelectedId((current) => current || rows.find((row) => row.level === 1)?.id || "");
    } catch (loadError) {
      console.error("[Admin Categories] Failed to load categories", loadError);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  function openCreateRoot() {
    setNotice("");
    setForm(emptyForm());
  }

  function openCreateChild() {
    setNotice("");
    setForm(emptyForm(selectedId));
  }

  function openEdit(category: AdminCategory) {
    setNotice("");
    setForm({
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

  async function toggleCategory(category: AdminCategory) {
    setNotice("");
    try {
      await setCategoryStatus(category, !isCategoryEnabled(category));
      setNotice("分类状态已更新");
      await loadCategories();
    } catch (statusError) {
      console.error("[Admin Categories] Failed to update status", statusError);
      setError(true);
    }
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || saving) return;
    const payload: CategoryPayload = {
      parent_id: form.level === 1 ? null : form.parent_id,
      level: form.level,
      name: form.name.trim(),
      slug: form.slug.trim(),
      icon: form.icon.trim() || null,
      description: form.description.trim() || null,
      sort_order: Number(form.sort_order || 0),
      is_active: form.is_active,
    };
    if (!payload.name || !payload.slug || (payload.level === 2 && !payload.parent_id)) return;

    setSaving(true);
    setNotice("");
    try {
      if (form.id) {
        await updateCategory(form.id, payload);
        setNotice("分类已保存");
      } else {
        const created = await createCategory(payload);
        setNotice("分类已新增");
        if (created.level === 1) setSelectedId(created.id);
      }
      setForm(null);
      await loadCategories();
    } catch (saveError) {
      console.error("[Admin Categories] Failed to save category", saveError);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPageShell
      title="分类管理"
      description="维护商品一级分类和子分类。"
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

      <div className="grid h-full min-h-0 w-full flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
        <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="shrink-0 border-b px-4 py-3 text-sm font-semibold text-slate-950">
            一级分类
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading ? (
              <AdminTableSkeleton rows={7} />
            ) : error ? (
              <AdminErrorState onRetry={loadCategories} />
            ) : rootCategories.length === 0 ? (
              <AdminEmptyState title="暂无分类" action={<Button size="sm" onClick={openCreateRoot}>新增一级分类</Button>} />
            ) : (
              <div className="space-y-2">
                {rootCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelectedId(category.id)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-3 text-left transition-colors",
                      selectedId === category.id
                        ? "border-primary bg-orange-50"
                        : "border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-950">{category.name}</span>
                      <StatusBadge enabled={isCategoryEnabled(category)} />
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500">{category.slug}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-950">
                {selectedRoot ? selectedRoot.name : "子分类内容"}
              </div>
              <div className="mt-1 truncate text-xs text-slate-500">
                {selectedRoot ? selectedRoot.slug : "请选择左侧一级分类"}
              </div>
            </div>
            {selectedRoot ? (
              <Button size="sm" onClick={openCreateChild}>
                <Plus className="mr-2 h-4 w-4" />
                新增子分类
              </Button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loading ? (
              <AdminTableSkeleton rows={8} />
            ) : error ? (
              <AdminErrorState onRetry={loadCategories} />
            ) : !selectedRoot ? (
              <AdminEmptyState title="请选择一级分类" description="选择左侧分类后查看和维护子分类。" />
            ) : childCategories.length === 0 ? (
              <AdminEmptyState
                title="暂无子分类"
                description="当前一级分类下还没有子分类。"
                action={<Button size="sm" onClick={openCreateChild}>新增子分类</Button>}
              />
            ) : (
              <div className="space-y-3">
                {childCategories.map((category) => (
                  <div key={category.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-slate-950">{category.name}</span>
                          <StatusBadge enabled={isCategoryEnabled(category)} />
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500">
                          {category.slug} · sort_order: {category.sort_order}
                        </div>
                        {category.description ? (
                          <p className="mt-2 text-sm text-slate-500">{category.description}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(category)}>
                          编辑
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleCategory(category)}>
                          {isCategoryEnabled(category) ? "停用" : "启用"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <CategoryDialog
        categories={rootCategories}
        form={form}
        saving={saving}
        onClose={() => setForm(null)}
        onSubmit={submitCategory}
        onUpdate={setForm}
      />
    </AdminPageShell>
  );
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <Badge
      variant="outline"
      className={enabled ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 bg-slate-50 text-slate-500"}
    >
      {enabled ? "启用" : "停用"}
    </Badge>
  );
}

function CategoryDialog({
  categories,
  form,
  onClose,
  onSubmit,
  onUpdate,
  saving,
}: {
  categories: AdminCategory[];
  form: CategoryForm | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (form: CategoryForm) => void;
  saving: boolean;
}) {
  if (!form) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-6" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <form onSubmit={onSubmit} className="flex max-h-[calc(100vh-48px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">{form.id ? "编辑分类" : "新增分类"}</h2>
          <button type="button" className="rounded-full p-2 text-slate-400 hover:bg-slate-100" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid min-h-0 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          <Field label="分类名称">
            <Input
              value={form.name}
              onChange={(event) => {
                const name = event.target.value;
                onUpdate({ ...form, name, slug: form.slug || slugify(name) });
              }}
              required
            />
          </Field>
          <Field label="slug">
            <Input value={form.slug} onChange={(event) => onUpdate({ ...form, slug: event.target.value })} required />
          </Field>
          <Field label="分类级别">
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
            <Field label="所属一级分类">
              <select
                value={form.parent_id}
                onChange={(event) => onUpdate({ ...form, parent_id: event.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                required
              >
                <option value="">请选择一级分类</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="图标">
            <Input value={form.icon} onChange={(event) => onUpdate({ ...form, icon: event.target.value })} />
          </Field>
          <Field label="排序">
            <Input type="number" value={form.sort_order} onChange={(event) => onUpdate({ ...form, sort_order: event.target.value })} />
          </Field>
          <Field label="启用状态">
            <select
              value={form.is_active ? "true" : "false"}
              onChange={(event) => onUpdate({ ...form, is_active: event.target.value === "true" })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="true">启用</option>
              <option value="false">停用</option>
            </select>
          </Field>
          <Field label="描述" className="sm:col-span-2">
            <Textarea rows={3} value={form.description} onChange={(event) => onUpdate({ ...form, description: event.target.value })} />
          </Field>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-4">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <label className={cn("space-y-2", className)}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
