export function buildSupplierPurchaseIdentity(input: unknown): {
  identity: Record<string, string | number>;
  semanticHash: string;
};
export function classifySupplierSubmitBoundary(input: unknown): {
  state: "UNCERTAIN" | "BEFORE_SUBMIT" | "UNKNOWN";
  retryPurchase: boolean;
  next: "QUERY_ONLY" | "MANUAL_REVIEW" | "REVALIDATE_FROZEN_REQUEST";
};
