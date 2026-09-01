import type {
  SupplierBindingBase,
  SupplierFulfillmentCoreInput,
  SupplierFulfillmentSummary,
  SupplierOrderBase,
  SupplierProductBase,
  SupplierReconciliationCoreInput,
  SupplierReconciliationSuccess,
} from "./types";

export function fulfillSupplierCandidates<
  TBinding extends SupplierBindingBase,
  TProduct extends SupplierProductBase,
  TOrder extends SupplierOrderBase,
>(
  input: SupplierFulfillmentCoreInput<TBinding, TProduct, TOrder>,
): Promise<SupplierFulfillmentSummary>;

export function reconcileSupplierExistingCandidate<
  TBinding extends SupplierBindingBase,
  TOrder extends SupplierOrderBase,
>(
  input: SupplierReconciliationCoreInput<TBinding, TOrder>,
): Promise<SupplierReconciliationSuccess>;
