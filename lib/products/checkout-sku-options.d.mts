export type CheckoutSkuOption = {
  id: string;
  code?: string | null;
  label: string;
  rmb: number;
  stock?: number;
  status?: string;
  isDatabaseSku?: boolean;
  isCompatibilityPlaceholder?: boolean;
};
export function mergeCheckoutSkuOptions(
  databaseOptions: CheckoutSkuOption[],
  legacyOptions: CheckoutSkuOption[],
  options?: { productHasSkus?: boolean },
): CheckoutSkuOption[];
export function findCheckoutSkuOption(options: CheckoutSkuOption[], requestedIdOrCode: string | null | undefined): CheckoutSkuOption | undefined;
