import {
  buildEffectiveCategoryVisibility,
  isProductEffectivelyVisible,
} from "./effective-category-visibility.mjs";

export function evaluateOrderProductAvailability(product, category, parent) {
  const level = Number(category.level ?? 0);
  if (level === 1) {
    if (category.parent_id) return false;
  } else if (level === 2) {
    if (!category.parent_id || !parent || parent.id !== category.parent_id) return false;
    if (Number(parent.level ?? 0) !== 1 || parent.parent_id) return false;
  } else {
    return false;
  }

  const categories = parent ? [parent, category] : [category];
  const visibility = buildEffectiveCategoryVisibility(categories);
  return isProductEffectivelyVisible(product, visibility, ["active"]);
}

export async function checkOrderProductAvailability(supabase, productId) {
  const { data: productData, error: productError } = await supabase
    .from("products")
    .select("id,status,category_id")
    .eq("id", productId)
    .maybeSingle();

  if (productError) return { available: false, reason: "check_failed" };
  if (!productData?.category_id) return { available: false, reason: "unavailable" };

  const { data: categoryData, error: categoryError } = await supabase
    .from("categories")
    .select("id,parent_id,level,is_active")
    .eq("id", productData.category_id)
    .maybeSingle();

  if (categoryError) return { available: false, reason: "check_failed" };
  if (!categoryData) return { available: false, reason: "unavailable" };

  let parentData = null;
  if (categoryData.parent_id) {
    const { data, error } = await supabase
      .from("categories")
      .select("id,parent_id,level,is_active")
      .eq("id", categoryData.parent_id)
      .maybeSingle();
    if (error) return { available: false, reason: "check_failed" };
    if (!data) return { available: false, reason: "unavailable" };
    parentData = data;
  }

  const available = evaluateOrderProductAvailability(productData, categoryData, parentData);
  return available ? { available: true } : { available: false, reason: "unavailable" };
}
