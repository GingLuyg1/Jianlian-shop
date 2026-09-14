export type CategoryVisibilityNode = {
  id: string;
  parent_id: string | null;
  level: number | null;
  status?: string | null;
  is_active?: boolean | null;
};

export declare function isCategoryIndividuallyEnabled(category: CategoryVisibilityNode): boolean;
export declare function buildEffectiveCategoryVisibility<T extends CategoryVisibilityNode>(categories: T[]): Map<string, boolean>;
export declare function filterEffectivelyVisibleCategories<T extends CategoryVisibilityNode>(categories: T[]): T[];
export declare function isProductEffectivelyVisible(
  product: { category_id?: string | null; status?: string | null },
  categoryVisibility: Map<string, boolean>,
  visibleProductStatuses?: readonly string[]
): boolean;
