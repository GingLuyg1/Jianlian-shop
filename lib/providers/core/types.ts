export type SupplierProductId = string | number;

export type SupplierBindingBase<
  TProductId extends SupplierProductId = SupplierProductId,
> = {
  supplier: string;
  productId: TProductId;
  sku: string | null;
};

export type SupplierFulfillmentCandidate<
  TBinding extends SupplierBindingBase = SupplierBindingBase,
> = {
  orderId: string;
  orderItemId: string;
  quantity: number;
  binding: TBinding | null;
  bindingInvalid: boolean;
  orderFields: Record<string, unknown>;
};

export type SupplierClaimAction = "PURCHASE" | "QUERY" | "NONE";

export type SupplierClaim = {
  action: SupplierClaimAction;
  requestId: string;
  attemptToken: string | null;
  status: string;
  orderCode: string | null;
};

export type SupplierFulfillmentState =
  | "PENDING"
  | "FULFILLED"
  | "FAILED"
  | "UNCERTAIN"
  | "RECONCILIATION"
  | "NEEDS_INPUT"
  | "FAILED_VALIDATION";

export type SupplierOutcomeInput = {
  orderId: string;
  orderItemId: string;
  requestId: string;
  attemptToken: string | null;
  state: SupplierFulfillmentState;
  retryable: boolean;
  code: string | null;
  orderCode: string | null;
  deliveredContent: string | null;
  supplierUnitPrice: string | null;
  supplierTotalPrice: string | null;
  triggerSource: string;
};

export type SupplierFulfillmentExecutionStore<
  TBinding extends SupplierBindingBase = SupplierBindingBase,
> = {
  claim(
    candidate: SupplierFulfillmentCandidate<TBinding>,
    requestId: string,
    triggerSource: string,
  ): Promise<SupplierClaim>;
  recordOutcome(input: SupplierOutcomeInput): Promise<void>;
};

export type SupplierFulfillmentStore<
  TBinding extends SupplierBindingBase = SupplierBindingBase,
> = SupplierFulfillmentExecutionStore<TBinding> & {
  loadCandidates(orderId: string): Promise<SupplierFulfillmentCandidate<TBinding>[]>;
};

export type SupplierFulfillmentSummary = {
  handled: number;
  fulfilled: number;
  failed: number;
  uncertain: number;
  needsInput: number;
};

export type SupplierPurchaseInput<
  TProductId extends SupplierProductId = SupplierProductId,
> = {
  productId: TProductId;
  requestId: string;
  quantity: number;
  sku?: string | null;
  inputs?: Record<string, string>;
};

export type SupplierProductBase = {
  price: string;
};

export type SupplierOrderBase = {
  orderCode: string;
  unitPrice: string;
  totalPrice: string;
};

export type SupplierSafeError = {
  code: string;
  kind: string;
  orderCode: string | null;
};

export type SupplierErrorDecision = {
  kind: "failed" | "retry_later" | "uncertain";
  state: "FAILED" | "PENDING" | "UNCERTAIN";
  retryable: boolean;
  code: string;
};

export type SupplierOrderDecision =
  | { kind: "fulfilled"; state: "FULFILLED"; orderCode?: string }
  | { kind: "query_order"; state: "PURCHASING"; orderCode: string }
  | { kind: "uncertain"; state: "UNCERTAIN"; code: string };

export type SupplierReadinessResult =
  | { ok: true; inputs: Record<string, string> }
  | { ok: false; code: string; missing?: string[] };

export type SupplierReconciliationResult =
  | { ok: true }
  | { ok: false; code: string };

export type SupplierFulfillmentClient<
  TProduct extends SupplierProductBase,
  TOrder extends SupplierOrderBase,
  TProductId extends SupplierProductId = SupplierProductId,
> = {
  getProduct(productId: TProductId): Promise<TProduct>;
  purchase(input: SupplierPurchaseInput<TProductId>): Promise<TOrder>;
  getOrder(orderCode: string): Promise<TOrder>;
};

export type SupplierOutcomeFactory<
  TBinding extends SupplierBindingBase = SupplierBindingBase,
> = (
  candidate: SupplierFulfillmentCandidate<TBinding>,
  claim: SupplierClaim,
  requestId: string,
  state: SupplierFulfillmentState,
  retryable: boolean,
  code: string | null,
  extra?: Partial<SupplierOutcomeInput>,
) => SupplierOutcomeInput;

export type SupplierFulfillmentCoreInput<
  TBinding extends SupplierBindingBase,
  TProduct extends SupplierProductBase,
  TOrder extends SupplierOrderBase,
> = {
  candidates: SupplierFulfillmentCandidate<TBinding>[];
  store: SupplierFulfillmentExecutionStore<TBinding>;
  client: SupplierFulfillmentClient<TProduct, TOrder, TBinding["productId"]>;
  triggerSource: string;
  createRequestId(orderId: string, orderItemId: string): string | null;
  validateReadiness(input: {
    product: TProduct;
    binding: TBinding;
    quantity: number;
    orderFields: Record<string, unknown>;
  }): SupplierReadinessResult;
  decideError(error: SupplierSafeError): SupplierErrorDecision;
  decideOrderResult(order: TOrder): SupplierOrderDecision;
  extractDeliveredContent(order: TOrder): string | null;
  countDelivered(order: TOrder): number;
  outcome: SupplierOutcomeFactory<TBinding>;
};

export type SupplierReconciliationCoreInput<
  TBinding extends SupplierBindingBase,
  TOrder extends SupplierOrderBase,
> = {
  candidate: SupplierFulfillmentCandidate<TBinding>;
  store: SupplierFulfillmentExecutionStore<TBinding>;
  client: Pick<SupplierFulfillmentClient<SupplierProductBase, TOrder, TBinding["productId"]>, "getOrder">;
  orderCode: string;
  triggerSource: string;
  createRequestId(orderId: string, orderItemId: string): string | null;
  validateReconciliation(input: {
    order: TOrder;
    orderCode: string;
    requestId: string;
    candidate: SupplierFulfillmentCandidate<TBinding>;
  }): SupplierReconciliationResult;
  extractDeliveredContent(order: TOrder): string | null;
  countDelivered(order: TOrder): number;
  outcome: SupplierOutcomeFactory<TBinding>;
};

export type SupplierReconciliationSuccess = {
  ok: true;
  orderCode: string;
  requestId: string;
  deliveredCount: number;
};
