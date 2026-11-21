// KuajingZY policy validation only; no credentials, transport or mutation.
export function parseKuajingZyStockPolicy(m) {
  const decimal=x=>(typeof x==='number'||typeof x==='string')&&/^(0|[1-9]\d{0,11})(?:\.\d{1,4})?$/.test(String(x))&&/[1-9]/.test(String(x));
  if(!m||m.fulfillment_source!=='supplier'||m.supplier!=='kuajingzy'
    ||typeof m.supplier_product_id!=='string'||! /^[A-Za-z0-9_-]{1,120}$/.test(m.supplier_product_id)
    ||!(m.supplier_sku===null||typeof m.supplier_sku==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(m.supplier_sku))
    ||m.supplier_currency!=='CNY'||!decimal(m.supplier_max_unit_cost)||!decimal(m.supplier_min_unit_profit)
    ||!Number.isInteger(m.supplier_min_margin_bps)||m.supplier_min_margin_bps<0||m.supplier_min_margin_bps>=10000
    ||typeof m.supplier_auto_purchase_enabled!=='boolean')return null;
  return {enabled:m.supplier_auto_purchase_enabled};
}
