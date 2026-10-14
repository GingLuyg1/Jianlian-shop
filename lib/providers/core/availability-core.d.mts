export const SUPPLIER_AVAILABILITY: Readonly<{ AVAILABLE: "AVAILABLE"; UNAVAILABLE: "UNAVAILABLE"; UNKNOWN: "UNKNOWN" }>;
export function evaluateSupplierAvailability(snapshot: unknown, nowMs: number, maxAgeMs: number): {
  state: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  quantity: number | null;
  quantityKnown: boolean;
  purchasable: boolean;
};
