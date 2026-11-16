import { money } from "./purchase-v2.mjs";
import { parseDajuProductBinding } from "./mapper.mjs";

export function createDajuV2Store(service, legacyStore, triggerSource = "daju_v2") {
  const rpc = async (name,args) => { const x = await service.rpc(name,args); if (x.error || !x.data) throw new Error("DAJU_V2_RPC_FAILED"); return x.data; };
  const rows = async query => {const x=await query;if(x.error)throw new Error("DAJU_V2_READ_FAILED");return x.data;};
  return {
    async orderCost(orderId) {
      const items = await rows(service.from("order_items").select("quantity,product_snapshot").eq("order_id",orderId));
      let total = 0n;
      for (const item of items) {
        const frozen = item.product_snapshot?.supplier_binding;
        if (frozen?.supplier !== "daju") continue;
        const binding = parseDajuProductBinding(frozen);
        if (!binding || binding.maxUnitCost == null || !Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error("DAJU_V2_ORDER_COST_INVALID");
        total += money(binding.maxUnitCost)*BigInt(item.quantity);
      }
      return total;
    },
    find: key => rows(service.from("supplier_purchase_attempts").select("*").eq("supplier","daju").eq("logical_request_key",key).maybeSingle()),
    get: id => rows(service.from("supplier_purchase_attempts").select("*").eq("supplier","daju").eq("id",id).single()),
    items: id => rows(service.from("supplier_purchase_attempt_items").select("*").eq("attempt_id",id).order("unit_index")),
    async root(candidate,key) {
      const claim = await legacyStore.claim(candidate,key,triggerSource);
      if (claim.action !== "PURCHASE") throw new Error("DAJU_V2_LEGACY_ROOT_REQUIRES_REVIEW");
      return rows(service.from("supplier_fulfillment_requests").select("id,status,request_id,attempt_token").eq("order_item_id",candidate.orderItemId).eq("supplier","daju").single());
    },
    claim: (key,semantic,units) => rpc("internal_supplier_purchase_claim",{p_supplier:"daju",p_logical_key:key,p_semantic_hash:semantic,p_items:units}),
    transition: (id,from,to,invoice=null) => rpc("internal_supplier_purchase_transition",{p_attempt_id:id,p_expected_status:from,p_next_status:to,p_external_invoice_id:invoice}),
    evidence: (id,status,resultClass,fingerprint) => rpc("internal_supplier_purchase_record_evidence",{p_attempt_id:id,p_external_order_row_id:null,p_status:status,p_result_class:resultClass,p_safe_fingerprint:fingerprint,p_checked_at:new Date().toISOString()}),
    async deliver(id,fingerprint,content) {
      const units = await rows(service.from("supplier_purchase_attempt_items").select("fulfillment_request_id").eq("attempt_id",id));
      if (!units.length || new Set(units.map(x=>x.fulfillment_request_id)).size !== 1) throw new Error("DAJU_V2_ROOT_INVALID");
      const root = await rows(service.from("supplier_fulfillment_requests").select("request_id,attempt_token").eq("id",units[0].fulfillment_request_id).single());
      return rpc("internal_supplier_purchase_deliver_daju_attempt",{p_attempt_id:id,p_request_id:root.request_id,p_attempt_token:root.attempt_token,p_evidence_fingerprint:fingerprint,p_delivery_content:content});
    },
  };
}
