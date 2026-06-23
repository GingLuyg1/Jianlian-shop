import { handlePaymentCallback } from "@/lib/payments/payment-callback-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { channel: string } };

export async function POST(request: Request, context: RouteContext) {
  return handlePaymentCallback(request, context.params.channel);
}
