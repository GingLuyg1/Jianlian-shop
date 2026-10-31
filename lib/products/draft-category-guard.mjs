// Only drafts may be saved under a hidden leaf. Read failures never grant access.
export async function readProductCategoryError(service, categoryId, nextStatus) {
  if (!categoryId) return "请选择有效商品分类";
  const seen = new Set();
  let id = categoryId;
  while (id) {
    if (seen.has(id) || seen.size >= 8) return "商品分类层级无效";
    seen.add(id);
    const { data, error } = await service.from("categories")
      .select("id,parent_id,is_active").eq("id", id).maybeSingle();
    if (error || !data) return "请选择有效商品分类";
    if (nextStatus !== "draft" && data.is_active !== true) return "不能在已停用分类下发布商品";
    if (id === categoryId) {
      const children = await service.from("categories").select("id", { count: "exact", head: true }).eq("parent_id", id);
      if (children.error || children.count === null) return "分类校验失败，请稍后重试";
      if (children.count > 0) return "商品只能绑定末级分类";
    }
    id = data.parent_id;
  }
  return null;
}

export async function readSkuCategoryError(service, productId, statuses) {
  if (!statuses.some(status => status === "active" || status === "sold_out")) return null;
  const { data, error } = await service.from("products").select("id,category_id").eq("id", productId).maybeSingle();
  if (error || !data) return "商品读取失败，已阻止SKU发布";
  return readProductCategoryError(service, data.category_id, "active");
}
