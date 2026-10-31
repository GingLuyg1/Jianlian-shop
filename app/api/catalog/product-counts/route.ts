import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getRequestSourceKey } from "@/lib/security/rate-limit";
import { filterEffectivelyVisibleCategories } from "@/lib/catalog/effective-category-visibility.mjs";

export const dynamic = "force-dynamic";
const BATCH_SIZE = 500;
const MAX_BATCHES = 20;
type Category = { id: string; parent_id: string | null; level: number | null; is_active: boolean | null };
type Product = { id: string; category_id: string | null };

/** Cosmetic counts only; no price, SKU, inventory, private fields or mutations. */
export async function GET(request: Request) {
  const limit = checkRateLimit("catalog_read", getRequestSourceKey(request));
  if (!limit.allowed) return limit.response!;
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const supabase = getSupabaseServerClient();
    const readBatch = (from: number) => supabase.from("products").select("id,category_id")
      .in("status", ["active", "sold_out"]).order("id", { ascending: true }).range(from, from + BATCH_SIZE - 1);
    const [categories, first] = await Promise.all([
      supabase.from("categories").select("id,parent_id,level,is_active").limit(1000),
      readBatch(0),
    ]);
    if (categories.error || first.error) throw new Error("COUNT_READ_FAILED");
    // Never label truncated category data as a verified complete snapshot.
    if ((categories.data?.length ?? 0) >= 1000) return NextResponse.json({ complete: false, counts: [] }, { headers });
    const visible = filterEffectivelyVisibleCategories((categories.data ?? []) as Category[])
      .filter((category: Category) => category.level === 2 && typeof category.parent_id === "string");
    const totals = new Map<string, number>(visible.map((category: Category) => [category.id, 0]));
    let batch = (first.data ?? []) as Product[];
    let complete = false;
    const seen = new Set<string>();
    for (let index = 0; index < MAX_BATCHES; index++) {
      for (const product of batch) {
        if (!seen.has(product.id) && product.category_id && totals.has(product.category_id)) {
          seen.add(product.id);
          // Match the existing listing's per-query 1000 product ceiling.
          totals.set(product.category_id, Math.min(1000, totals.get(product.category_id)! + 1));
        }
      }
      if (batch.length < BATCH_SIZE) { complete = true; break; }
      if (index === MAX_BATCHES - 1) break;
      const next = await readBatch((index + 1) * BATCH_SIZE);
      if (next.error) throw new Error("COUNT_READ_FAILED");
      batch = (next.data ?? []) as Product[];
    }
    // The budget limits speculative work. Partial scans are not false zeroes.
    return NextResponse.json({ complete, counts: complete ? visible.map((category: Category) => ({
      primaryCategoryId: category.parent_id, secondaryCategoryId: category.id, total: totals.get(category.id) ?? 0,
    })) : [] }, { headers });
  } catch {
    return NextResponse.json({ error: "商品数量暂时无法读取" }, { status: 503, headers });
  }
}
