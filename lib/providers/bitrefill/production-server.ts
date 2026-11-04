import 'server-only';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { createBitrefillProductionRuntime } from './production-composition.mjs';
import { REAL_BITREFILL_PURCHASE_ENABLED } from './prelaunch-policy.mjs';
import { GIFFGAFF_PIN_SKUS } from './pin-order-entry.mjs';
import { authorizeBitrefillPinOrder, installBitrefillPinRuntime } from './pin-runtime.mjs';
import { authorizePinLocalOrPurchase } from './pin-local-entry.mjs';

let installed = false;
export async function authorizeBitrefillStorefrontOrder(input: {
  userId: string; productId: string; skuId: string | null; quantity: number; clientRequestId: string;
}) {
  if (!GIFFGAFF_PIN_SKUS.includes(input.skuId ?? '')) return { applicable: false };
  return authorizePinLocalOrPurchase({ input, service: getSupabaseServiceRoleClient(), authorizePurchase: async () => {
    ensureBitrefillProductionRuntime(input.skuId);
    return authorizeBitrefillPinOrder(input);
  } });
}
// Both call sites are server-only, restricted to frozen Bitrefill/PIN scope.
// The literal release gate remains false. No env-only opt-in can activate it.
export function ensureBitrefillProductionRuntime(skuId?: string | null) {
  if (skuId !== undefined && !GIFFGAFF_PIN_SKUS.includes(skuId ?? '')) return;
  if (!REAL_BITREFILL_PURCHASE_ENABLED || process.env.BITREFILL_PURCHASE_ENABLED !== 'true' || installed) return;
  const service = getSupabaseServiceRoleClient();
  if (!service) throw Error('BITREFILL_SERVER_DATABASE_REQUIRED');
  const runtime = createBitrefillProductionRuntime({ service, environment:process.env, fetchImpl:fetch });
  // No approved cost/FX/fee/risk supplier exists in today's contract: defaults
  // deliberately fail closed. Never fabricate financial evidence for rollout.
  installBitrefillPinRuntime(runtime);
  installed = true;
}
