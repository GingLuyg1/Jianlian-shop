export function normalizeProductPayload(input = {}) {
  const errors = {};
  const name = String(input.name ?? "").trim();
  const slug = String(input.slug ?? "").trim();
  const shortDescription = normalizeNullableText(input.shortDescription ?? input.short_description);
  const imageUrl = normalizeNullableText(input.imageUrl ?? input.image_url);
  const categoryId = normalizeNullableText(input.categoryId ?? input.category_id);
  const price = normalizeNumber(input.price);
  const originalPrice = input.originalPrice ?? input.original_price;
  const stock = normalizeInteger(input.stock);

  if (!name) errors.name = "商品名称不能为空";
  if (!slug) {
    errors.slug = "商品标识不能为空";
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    errors.slug = "商品标识只能包含小写字母、数字和短横线";
  }
  if (!categoryId) errors.categoryId = "请选择分类";
  if (price === null || price < 0) errors.price = "售价必须大于或等于 0";
  if (originalPrice !== null && originalPrice !== undefined && originalPrice !== "") {
    const parsedOriginalPrice = normalizeNumber(originalPrice);
    if (parsedOriginalPrice === null || parsedOriginalPrice < price) {
      errors.originalPrice = "原价不能小于售价";
    }
  }
  if (stock === null || stock < 0) errors.stock = "库存必须是大于或等于 0 的整数";
  if (imageUrl && !isAllowedImageReference(imageUrl)) {
    errors.imageUrl = "图片地址格式不正确";
  }

  return {
    value: {
      name,
      slug,
      shortDescription,
      imageUrl,
      categoryId,
      price,
      originalPrice: originalPrice === null || originalPrice === undefined || originalPrice === "" ? null : normalizeNumber(originalPrice),
      stock,
      status: String(input.status ?? "draft"),
      deliveryType: String(input.deliveryType ?? input.delivery_type ?? "manual"),
      sortOrder: normalizeInteger(input.sortOrder ?? input.sort_order) ?? 0,
    },
    errors,
    ok: Object.keys(errors).length === 0,
  };
}

export function isProductDirty(original, current) {
  const a = normalizeComparableProduct(original);
  const b = normalizeComparableProduct(current);
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function generateSkuCombinations(optionGroups, existingSkus = [], defaults = {}) {
  const normalizedGroups = normalizeOptionGroups(optionGroups);
  if (normalizedGroups.length === 0) return [];

  const existingByKey = new Map(existingSkus.map((sku) => [buildStableCombinationKey(sku.optionValueIds ?? []), sku]));
  const combinations = cartesianProduct(normalizedGroups.map((group) => group.values));
  const seen = new Set();

  return combinations.map((values, index) => {
    const optionValueIds = values.map((value) => value.id);
    const key = buildStableCombinationKey(optionValueIds);
    if (seen.has(key)) throw new Error(`重复 SKU 组合: ${key}`);
    seen.add(key);

    const existing = existingByKey.get(key);
    if (existing) {
      return {
        ...existing,
        optionValueIds,
        combinationKey: key,
        title: values.map((value) => value.value).join(" / "),
      };
    }

    return {
      id: null,
      skuCode: buildSkuCode(defaults.productSlug ?? "sku", index + 1),
      title: values.map((value) => value.value).join(" / "),
      optionValueIds,
      combinationKey: key,
      price: defaults.price ?? 0,
      originalPrice: defaults.originalPrice ?? null,
      stock: defaults.stock ?? 0,
      status: defaults.status ?? "draft",
      deliveryType: defaults.deliveryType ?? "manual",
    };
  });
}

export function buildStableCombinationKey(optionValueIds) {
  return [...optionValueIds].map(String).sort().join("|");
}

export function sanitizeCsvCell(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function normalizeComparableProduct(product = {}) {
  return {
    name: String(product.name ?? "").trim(),
    slug: String(product.slug ?? "").trim(),
    shortDescription: normalizeNullableText(product.shortDescription ?? product.short_description),
    imageUrl: normalizeNullableText(product.imageUrl ?? product.image_url),
    categoryId: normalizeNullableText(product.categoryId ?? product.category_id),
    price: normalizeNumber(product.price),
    originalPrice: normalizeNumber(product.originalPrice ?? product.original_price),
    stock: normalizeInteger(product.stock),
    status: String(product.status ?? ""),
    deliveryType: String(product.deliveryType ?? product.delivery_type ?? ""),
    sortOrder: normalizeInteger(product.sortOrder ?? product.sort_order) ?? 0,
  };
}

function normalizeNullableText(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeInteger(value) {
  const number = normalizeNumber(value);
  return number === null || !Number.isInteger(number) ? null : number;
}

function isAllowedImageReference(value) {
  if (value.startsWith("/")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeOptionGroups(optionGroups) {
  const groups = optionGroups
    .filter((group) => String(group.name ?? "").trim())
    .map((group) => {
      const seenValues = new Set();
      const values = (group.values ?? [])
        .map((value) => ({
          id: String(value.id),
          value: String(value.value ?? "").trim(),
          sortOrder: Number(value.sortOrder ?? value.sort_order ?? 0),
        }))
        .filter((value) => value.id && value.value)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      for (const value of values) {
        const key = value.value.toLowerCase();
        if (seenValues.has(key)) throw new Error(`规格值重复: ${value.value}`);
        seenValues.add(key);
      }

      return { name: String(group.name).trim(), values };
    })
    .filter((group) => group.values.length > 0);

  if (groups.length > 3) throw new Error("最多支持 3 个规格组");
  return groups;
}

function cartesianProduct(groups) {
  return groups.reduce(
    (result, group) => result.flatMap((prefix) => group.map((value) => [...prefix, value])),
    [[]],
  );
}

function buildSkuCode(productSlug, index) {
  const safeSlug = String(productSlug).replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${safeSlug || "sku"}-${String(index).padStart(3, "0")}`;
}
