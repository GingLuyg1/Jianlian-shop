import { handlePaymentCallback } from "@/lib/payments/payment-callback-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ channel: string }> };

export async function POST(request: Request, context: RouteContext) {
  return handlePaymentCallback(request, (await context.params).channel);
}

export async function GET(request: Request, context: RouteContext) {
  return handlePaymentCallback(request, (await context.params).channel);
}
