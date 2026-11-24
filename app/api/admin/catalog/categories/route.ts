import {
  CATEGORY_FIELDS,
  assertCategoryParent,
  auditCatalogAction,
  jsonResponse,
  normalizeCategoryPayload,
  parseBody,
  requireCatalogAdmin,
} from "../_shared";

import { markMediaReferenceByUrl } from "@/lib/media/media-service";
import { revalidateCategoryCache } from "@/lib/cache/cache-tags";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireCatalogAdmin();
  if (!admin.ok) return admin.response;

  const service = getSupabaseServiceRoleClient() ?? admin.supabase;
  const [catRes, prodRes] = await Promise.all([
    service
      .from("categories")
      .select("*")
      .order("level", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    service
      .from("products")
      .select("category_id,slug,name")
      .range(0, 4999),
  ]);

  if (catRes.error) {
    return jsonResponse({ error: "分类读取失败，请稍后重试" }, 500);
  }

  const productCounts: Record<string, number> = {};
  if (!prodRes.error && Array.isArray(prodRes.data)) {
    for (const row of prodRes.data as Array<{ category_id?: string | null; slug?: string | null; name?: string | null }>) {
      const cid = row.category_id;
      if (!cid) continue;
      const slug = String(row.slug ?? "").trim().toLowerCase();
      const name = String(row.name ?? "").trim().toLowerCase();
      if (slug === "sms-code" || slug.startsWith("sms-code-") || name.includes("接码")) continue;
      productCounts[cid] = (productCounts[cid] ?? 0) + 1;
    }
  }

  return jsonResponse({
    categories: catRes.data ?? [],
    productCounts,
  });
}

export async function POST(request: Request) {
  const admin = await requireCatalogAdmin();
  if (!admin.ok) return admin.response;

  const body = parseBody(await request.json().catch(() => ({})));
  const { payload, errors } = normalizeCategoryPayload(body);
  if (Object.keys(errors).length > 0) {
    return jsonResponse({ error: "分类信息填写不完整", errors }, 400);
  }

  const parentError = await assertCategoryParent(admin.supabase, payload);
  if (parentError) return jsonResponse({ error: parentError }, 400);

  const { data, error } = await admin.supabase.from("categories").insert(payload).select(CATEGORY_FIELDS).single();
  if (error) {
    await auditCatalogAction({
      request,
      user: admin.user,
      action: "create_category",
      module: "categories",
      targetType: "category",
      targetLabel: String(payload.name ?? ""),
      result: "failed",
      afterSummary: payload,
      errorMessage: "分类新增失败",
    });
    return jsonResponse({ error: "分类新增失败，请检查分类标识是否重复" }, 400);
  }

  await markMediaReferenceByUrl(
    admin.supabase,
    (data as { icon?: string | null }).icon,
    "category",
    String((data as { id?: unknown }).id ?? "")
  );
  revalidateCategoryCache({
    id: String((data as { id?: unknown }).id ?? ""),
    parentId: String((data as { parent_id?: unknown }).parent_id ?? ""),
  });

  await auditCatalogAction({
    request,
    user: admin.user,
    action: "create_category",
    module: "categories",
    targetType: "category",
    targetId: String((data as { id?: unknown }).id ?? ""),
    targetLabel: String((data as { name?: unknown }).name ?? ""),
    result: "success",
    afterSummary: data,
  });

  return jsonResponse({ category: data }, 201);
}
