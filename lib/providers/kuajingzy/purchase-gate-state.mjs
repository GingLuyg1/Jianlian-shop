// Browser-safe diagnostics. Production callers must never accept context from HTTP.
export const KUAJINGZY_PURCHASE_RELEASE_ENABLED = true;

export function getKuajingZyPurchaseGateState({releaseGate=false,env={},binding}={}) {
  const reasons=[];
  if(releaseGate!==true) reasons.push('RELEASE_DISABLED');
  if(env.SUPPLIER_AUTO_PURCHASE_ENABLED!=='true') reasons.push('GLOBAL_DISABLED');
  if(env.KUAJINGZY_REAL_PURCHASE_ENABLED!=='true') reasons.push('SUPPLIER_DISABLED');
  if(binding?.enabled!==true) reasons.push('BINDING_DISABLED');
  if(typeof env.KUAJINGZY_MAX_ORDER_COST_CNY!=='string'
    || !/^(0|[1-9]\d{0,11})(?:\.\d{1,4})?$/.test(env.KUAJINGZY_MAX_ORDER_COST_CNY)
    || !/[1-9]/.test(env.KUAJINGZY_MAX_ORDER_COST_CNY)) reasons.push('ORDER_CAP_REQUIRED');
  return {ready:reasons.length===0,reasons};
}
