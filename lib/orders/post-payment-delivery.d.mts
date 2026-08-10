export type PostPaymentDeliveryStage =
  | "AUTO_DELIVERY_STARTED"
  | "AUTO_DELIVERY_COMPLETED"
  | "AUTO_DELIVERY_FAILED";

export function runPostPaymentDelivery<TPayment, TDelivery>(input: {
  payment: TPayment;
  deliver: () => Promise<TDelivery>;
  onStage?: (event: { stage: PostPaymentDeliveryStage; error: unknown | null }) => void;
}): Promise<{
  payment: TPayment;
  delivery: TDelivery | null;
  deliveryError: unknown | null;
}>;
