export function isCategoryIndividuallyEnabled(category) {
  if (typeof category.is_active === "boolean") return category.is_active;
  return category.status !== "inactive";
}

export function buildEffectiveCategoryVisibility(categories) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const visibility = new Map();
  const visiting = new Set();

  const resolve = (category) => {
    if (visibility.has(category.id)) return visibility.get(category.id);
    if (!isCategoryIndividuallyEnabled(category) || visiting.has(category.id)) {
      visibility.set(category.id, false);
      return false;
    }
    visiting.add(category.id);
    const parent = category.parent_id ? categoryMap.get(category.parent_id) : null;
    const visible = category.parent_id ? Boolean(parent && resolve(parent)) : true;
    visiting.delete(category.id);
    visibility.set(category.id, visible);
    return visible;
  };

  categories.forEach(resolve);
  return visibility;
}

export function filterEffectivelyVisibleCategories(categories) {
  const visibility = buildEffectiveCategoryVisibility(categories);
  return categories.filter((category) => visibility.get(category.id) === true);
}

export function isProductEffectivelyVisible(product, categoryVisibility, visibleProductStatuses = ["active", "sold_out"]) {
  return Boolean(
    product.category_id &&
      visibleProductStatuses.includes(String(product.status ?? "")) &&
      categoryVisibility.get(product.category_id) === true
  );
}
