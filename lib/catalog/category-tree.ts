import type { PublicCategory } from "@/lib/supabase/public-catalog";

export function sortCategories<T extends Pick<PublicCategory, "sort_order" | "name">>(categories: T[]) {
  return [...categories].sort(
    (first, second) =>
      Number(first.sort_order ?? 0) - Number(second.sort_order ?? 0) ||
      String(first.name ?? "").localeCompare(String(second.name ?? ""), "zh-Hans-CN")
  );
}

export function buildCategoryMaps(categories: PublicCategory[]) {
  const byId = new Map<string, PublicCategory>();
  const bySlug = new Map<string, PublicCategory>();
  const childrenByParent = new Map<string, PublicCategory[]>();

  categories.forEach((category) => {
    byId.set(category.id, category);
    bySlug.set(category.slug, category);
    if (category.parent_id) {
      const children = childrenByParent.get(category.parent_id) ?? [];
      children.push(category);
      childrenByParent.set(category.parent_id, children);
    }
  });

  childrenByParent.forEach((children, parentId) => {
    childrenByParent.set(parentId, sortCategories(children));
  });

  return { byId, bySlug, childrenByParent };
}

export function getCategoryPath(categories: PublicCategory[], categoryId: string | null) {
  if (!categoryId) return [];
  const { byId } = buildCategoryMaps(categories);
  const path: PublicCategory[] = [];
  const seen = new Set<string>();
  let current = byId.get(categoryId);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }

  return path;
}

export function getDescendantCategoryIds(categories: PublicCategory[], categoryId: string) {
  const { childrenByParent } = buildCategoryMaps(categories);
  const ids = [categoryId];
  const walk = (parentId: string) => {
    const children = childrenByParent.get(parentId) ?? [];
    children.forEach((child) => {
      ids.push(child.id);
      walk(child.id);
    });
  };
  walk(categoryId);
  return ids;
}

export function findCategoryBySlugOrId(categories: PublicCategory[], identifier: string | null) {
  if (!identifier) return null;
  return categories.find((category) => category.slug === identifier || category.id === identifier) ?? null;
}
