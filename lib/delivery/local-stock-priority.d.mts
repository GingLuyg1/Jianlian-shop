export type LocalStockPriorityReservation = { localReadyCount: number; supplierFallbackCount: number; blockedCount: number };
export function parseLocalStockPriorityReservation(value: unknown): LocalStockPriorityReservation | null;
export function runLocalStockPriorityDelivery<TLocal, TSupplier>(input: {
  reserveLocal(): Promise<unknown>;
  deliverLocal(): Promise<TLocal>;
  deliverSupplier(): Promise<TSupplier>;
}): Promise<{ reservation: LocalStockPriorityReservation; local: TLocal; supplier: TSupplier }>;
