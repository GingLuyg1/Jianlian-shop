import { handlePaymentCallback } from "@/lib/payments/payment-callback-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handlePaymentCallback(request);
}
