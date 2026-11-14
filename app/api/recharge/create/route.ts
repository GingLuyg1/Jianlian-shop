// Backward-compatible endpoint for older account recharge clients.
import { POST as createRecharge } from "@/app/api/recharges/route";

export function POST(request: Request) {
  return createRecharge(request);
}
