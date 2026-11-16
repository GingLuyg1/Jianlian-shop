import { money } from "./purchase-v2.mjs";
import { parseDajuProductBinding } from "./mapper.mjs";

export function createDajuV2Store(service, legacyStore, triggerSource = "daju_v2") {
  const rpc = async (name,args) => { const x = await service.rpc(name,args); if (x.error || !x.data) throw new Error("DAJU_V2_RPC_FAILED"); return x.data; };
  const rows = async query => {const x=await query;if(x.error)throw new Error("DAJU_V2_READ_FAILED");return x.data;};
  return {
    async orderCost(orderId) {
      const items = await rows(service.from("order_items").select("quantity,product_snapshot").eq("order_id",orderId));
      let total = 0n;
      let dajuItems = 0;
      for (const item of items) {
        const frozen = item.product_snapshot?.supplier_binding;
        if (frozen?.supplier !== "daju") continue;
        dajuItems++;
        const binding = parseDajuProductBinding(frozen);
        if (!binding || binding.maxUnitCost == null || !Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error("DAJU_V2_ORDER_COST_INVALID");
        total += money(binding.maxUnitCost)*BigInt(item.quantity);
      }
      // Only canary mode is currently executable: one designated order item,
      // possibly multiple units, must never become multiple supplier POSTs.
      if (dajuItems !== 1) throw new Error("DAJU_V2_CANARY_SINGLE_ITEM_REQUIRED");
      return total;
    },
    find: key => rows(service.from("supplier_purchase_attempts").select("*").eq("supplier","daju").eq("logical_request_key",key).maybeSingle()),
    get: id => rows(service.from("supplier_purchase_attempts").select("*").eq("supplier","daju").eq("id",id).single()),
    items: id => rows(service.from("supplier_purchase_attempt_items").select("*").eq("attempt_id",id).order("unit_index")),
    async root(candidate,key) {
      const marker = `daju_v2:${String(triggerSource).slice(0,60)}`;
      const claim = await legacyStore.claim(candidate,key,marker);
      const root = await rows(service.from("supplier_fulfillment_requests").select("id,status,request_id,attempt_token,provider_order_code,trigger_source,order_id,order_item_id,supplier,supplier_product_id,supplier_sku").eq("order_item_id",candidate.orderItemId).eq("supplier","daju").single());
      const identity = root.request_id === key && root.status === "PURCHASING" && root.attempt_token
        && root.order_id === candidate.orderId && root.order_item_id === candidate.orderItemId
        && root.supplier === "daju" && root.supplier_product_id === String(candidate.binding.productId)
        && root.supplier_sku === candidate.binding.sku;
      if (!identity || root.provider_order_code !== null || !/^daju_v2:[A-Za-z0-9_:-]{1,60}$/.test(root.trigger_source ?? "")) throw new Error("DAJU_V2_ROOT_INVALID");
      if (claim.action !== "PURCHASE") {
        const existing = await rows(service.from("supplier_purchase_attempts").select("id").eq("supplier","daju").eq("logical_request_key",key).maybeSingle());
        if (claim.action !== "NONE" || claim.status !== "PURCHASING" || root.provider_order_code !== null
          || existing) throw new Error("DAJU_V2_LEGACY_ROOT_REQUIRES_REVIEW");
      }
      return root;
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
