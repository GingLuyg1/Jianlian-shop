import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductAvailabilityRow = {
  id: string;
  status: string | null;
  category_id: string | null;
};

export type CategoryAvailabilityRow = {
  id: string;
  parent_id: string | null;
  level: number | null;
  is_active: boolean | null;
};

export type OrderProductAvailability =
  | { available: true }
  | { available: false; reason: "unavailable" | "check_failed" };

export function evaluateOrderProductAvailability(
  product: ProductAvailabilityRow,
  category: CategoryAvailabilityRow,
  parent: CategoryAvailabilityRow | null,
): boolean;

export function checkOrderProductAvailability(
  supabase: SupabaseClient,
  productId: string,
): Promise<OrderProductAvailability>;
