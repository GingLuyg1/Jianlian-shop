import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createKuajingZyReadonlyClient } from "./readonly-client.mjs";
import { createKuajingZyPurchaseClient } from "./purchase-client.mjs";
import { KUAJINGZY_PURCHASE_RELEASE_ENABLED } from "./purchase-policy.mjs";
import { createKuajingZyPurchaseStore } from "./purchase-store.mjs";
import { fulfillKuajingZyCandidate, reconcileKuajingZyAttempt, createKuajingZyRequestId } from "./fulfillment-core.mjs";
import { zeroSupplierSummary } from "../core/supplier-router-core.mjs";
import type { SupplierFulfillmentSummary } from "../core/types";
import { getVerifiedMerchantCostsForOrder, type VerifiedBalanceMerchantCosts } from "../../payments/verified-merchant-costs";
import { isSupplierInsufficientBalanceError, notifySupplierInsufficientBalance } from "../core/supplier-balance-alert";

type VerifiedCosts = (orderId:string) => Promise<VerifiedBalanceMerchantCosts>;

// Pricing is observed through ONE bounded reader; no clone/tee, no raw log and
// no mutation of the strictly GET-only readonly-client.
export function createKuajingZyServerClient(environment: NodeJS.ProcessEnv, fetchImpl: typeof fetch) {
  if (environment.NODE_DEBUG || environment.NODE_DEBUG_NATIVE || environment.NEXT_PUBLIC_KUAJINGZY_API_KEY) {
    throw new Error("KUAJINGZY_UNSAFE_RUNTIME_CONFIG");
  }
  const apiKey = environment.KUAJINGZY_API_KEY;
  const purchase = createKuajingZyPurchaseClient({apiKey,fetchImpl,environment,releaseGate:KUAJINGZY_PURCHASE_RELEASE_ENABLED});
  let pricing: {memberDiscount?:string|number;currency?:string}|null=null;
  const observed: typeof fetch = async (url, options) => {
    const response = await fetchImpl(url, options);
    if (new URL(String(url)).pathname !== "/api/open/v1/catalog/mall" || !response.body) return response;
    return new Proxy(response,{get(target,property) {
      if (property !== "body") { const v=Reflect.get(target,property,target);return typeof v==="function"?v.bind(target):v; }
      return {getReader() {
        const reader=target.body!.getReader();let bytes=0;let parts:Uint8Array[]=[];
        return {async read() {
          const chunk=await reader.read();
          if (chunk.done) {
            if (bytes<=262144) {
              try { const p=JSON.parse(Buffer.concat(parts).toString("utf8"))?.data?.pricing;
                if (p && (typeof p.memberDiscount==="string" || typeof p.memberDiscount==="number")) {
                  pricing={memberDiscount:p.memberDiscount,...(p.currency===undefined?{}:{currency:p.currency==="CNY"?"CNY":"INVALID"})};
                }
              } catch { /* Real readonly parser rejects invalid bodies. */ }
            }
            parts=[];
          } else { bytes+=chunk.value.byteLength;if(bytes<=262144)parts.push(chunk.value);else parts=[]; }
          return chunk;
        },async cancel() {parts=[];return reader.cancel();}};
      }};
    }}) as Response;
  };
  const readonly=createKuajingZyReadonlyClient({apiKey,fetchImpl:observed,onDiagnostics:undefined});
  return {
    ...purchase,
    getBalance:()=>readonly.readBalance(),
    async getProduct(itemId:string) {
      pricing=null;
      const page=await readonly.collectMallCatalog({itemId,limit:1});
      if(page.status!=="COMPLETE" || !("items" in page) || page.items.length!==1 || !pricing)throw new Error("KUAJINGZY_FRESH_PRODUCT_UNVERIFIED");
      return {item:page.items[0],pricing};
    },
  };
}

export function createKuajingZyProductionRuntime(input: {
  service:SupabaseClient; environment?:NodeJS.ProcessEnv;fetchImpl?:typeof fetch;verifiedCosts?:VerifiedCosts;
}) {
  const env=input.environment??process.env;
  // No env/config/body/header/cookie can supply this release gate.
  const enabled=()=>KUAJINGZY_PURCHASE_RELEASE_ENABLED && env.SUPPLIER_AUTO_PURCHASE_ENABLED==="true"
    && env.KUAJINGZY_REAL_PURCHASE_ENABLED==="true";
  return {
    async reconcileExistingOrder(orderId:string):Promise<SupplierFulfillmentSummary> {
      const summary=zeroSupplierSummary();
      const db=createKuajingZyPurchaseStore(input.service);
      const candidates=await db.loadCandidates(orderId,false);
      let client:ReturnType<typeof createKuajingZyServerClient>|undefined;
      for(const candidate of candidates) {
        const attempt=await db.find(createKuajingZyRequestId(candidate.orderId,candidate.orderItemId));
        if(!attempt)continue; // Recovery never creates a root or intent.
        summary.handled++;
        if(attempt.status==="SUCCEEDED"){summary.fulfilled++;continue;}
        if(!["EXTERNAL_CREATED","RECONCILING"].includes(attempt.status)||!attempt.external_invoice_id){
          summary.uncertain++;continue; // No documented lookup-by-key; manual.
        }
        client??=createKuajingZyServerClient(env,input.fetchImpl??fetch);
        try {
          const result=await reconcileKuajingZyAttempt({db,client,candidate,attempt});
          if(result.fulfilled)summary.fulfilled++;else summary.uncertain++;
        } catch {summary.uncertain++;}
      }
      return summary;
    },
    async fulfillPaidOrder(orderId:string,triggerSource:string):Promise<SupplierFulfillmentSummary> {
      const summary=zeroSupplierSummary();
      if(!enabled())return summary; // no credentials, network or DB writes
      const verifiedCosts=input.verifiedCosts ?? ((targetOrderId:string)=>getVerifiedMerchantCostsForOrder(input.service,targetOrderId));
      const db=createKuajingZyPurchaseStore(input.service,{verifiedCosts,triggerSource});
      const candidates=await db.loadCandidates(orderId);
      const client=createKuajingZyServerClient(env,input.fetchImpl??fetch);
      for(const candidate of candidates) {
        summary.handled++;
        try {
          const result=await fulfillKuajingZyCandidate({db,client,candidate,env,releaseGate:KUAJINGZY_PURCHASE_RELEASE_ENABLED,pollDelaysMs:[1500,2000,2500,3000]});
          if(result.fulfilled)summary.fulfilled++;
          else {
            summary.uncertain++;
            if (result.classification === "NO_DEBIT_INSUFFICIENT_BALANCE") {
              void notifySupplierInsufficientBalance({
                supplierCode: "kuajingzy",
                supplierName: "跨境资源网",
                orderId: candidate.orderId,
                orderItemId: candidate.orderItemId,
                productId: candidate.binding?.productId ?? null,
                reason: "NO_DEBIT_INSUFFICIENT_BALANCE",
              });
            }
          }
        } catch (error) {
          summary.failed++;
          if (isSupplierInsufficientBalanceError(error)) {
            void notifySupplierInsufficientBalance({
              supplierCode: "kuajingzy",
              supplierName: "跨境资源网",
              orderId: candidate.orderId,
              orderItemId: candidate.orderItemId,
              productId: candidate.binding?.productId ?? null,
              reason: error instanceof Error ? error.message : "KUAJINGZY_BALANCE_INSUFFICIENT",
            });
          }
        }
      }
      return summary;
    },
  };
}
