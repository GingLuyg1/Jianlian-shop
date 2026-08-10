function notify(onStage, stage, error = null) {
  try {
    onStage?.({ stage, error });
  } catch {
    // Observability must never alter payment or fulfillment behavior.
  }
}

export async function runPostPaymentDelivery(input) {
  notify(input.onStage, "AUTO_DELIVERY_STARTED");
  try {
    const delivery = await input.deliver();
    notify(input.onStage, "AUTO_DELIVERY_COMPLETED");
    return { payment: input.payment, delivery, deliveryError: null };
  } catch (deliveryError) {
    notify(input.onStage, "AUTO_DELIVERY_FAILED", deliveryError);
    return { payment: input.payment, delivery: null, deliveryError };
  }
}
