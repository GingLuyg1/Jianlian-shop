import fs from "node:fs";
import { createHash } from "node:crypto";

export const migrationPath = "supabase/migrations/20261121034312_kuajingzy_atomic_sellable_cap_v1.sql";
export const createSignature = "public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)";
export const releaseSignature = "public.release_order_inventory(uuid,text)";
export const fingerprint = text => createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
export const read = file => fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n");

export function extractFunction(file, name) {
  const source = read(file);
  const start = source.indexOf("create or replace function public." + name + "(");
  if (start < 0) throw Error("FUNCTION_SOURCE_MISSING");
  const end = source.indexOf("\n$$;", start);
  if (end < 0) throw Error("FUNCTION_TERMINATOR_MISSING");
  return source.slice(start, end + 4);
}

const reserve = `  if v_kj_metadata->>'fulfillment_source' = 'supplier'
     and coalesce(v_kj_metadata->>'supplier', '') not in ('kuajingzy','daju','bitrefill') then
    raise exception 'UNKNOWN_SUPPLIER';
  end if;
  if v_kuajingzy_binding is not null then
    if p_sku_id is null then raise exception 'KUAJINGZY_SELLABLE_CAP_EXHAUSTED'; end if;
    update public.product_skus as s
       set stock = s.stock - v_quantity,
           status = case when s.stock - v_quantity <= 0 and s.status = 'active' then 'sold_out' else s.status end,
           updated_at = now()
     where s.id = p_sku_id
       and s.product_id = p_product_id
       and s.status = 'active'
       and s.stock >= v_quantity
     returning s.stock into v_stock;
    if not found then raise exception 'KUAJINGZY_SELLABLE_CAP_EXHAUSTED'; end if;
  elsif v_auto_delivery then
    null;`;

const release = `  -- Only an exact frozen reservation marker can restore MODEL_C capacity.
  with reserved as (
    select oi.sku_id, oi.product_id, sum(oi.quantity)::integer as quantity
    from public.order_items oi
    where oi.order_id = p_order_id
      and v_order.payment_status in ('unpaid','failed')
      and v_order.status in ('pending_payment','cancelled','expired','failed')
      and oi.sku_id is not null
      and oi.quantity > 0
      and lower(coalesce(oi.delivery_type, '')) in ('automatic','auto','card','account','auto_delivery')
      and oi.product_snapshot->'sellable_cap_reservation' @> jsonb_build_object(
        'version', 1, 'model', 'MODEL_C', 'provider', 'kuajingzy',
        'sku_id', oi.sku_id::text, 'quantity', oi.quantity, 'reserved', true)
      and not exists (
        select 1 from public.order_deliveries od
        where od.order_item_id = oi.id and od.delivery_status = 'delivered'
      )
    group by oi.sku_id, oi.product_id
  )
  update public.product_skus s
     set stock = s.stock + r.quantity,
         status = case when s.status = 'sold_out' then 'active' else s.status end,
         updated_at = v_now
    from reserved r
   where s.id = r.sku_id and s.product_id = r.product_id;
  get diagnostics v_released_kuajingzy_cap = row_count;

`;

export function patches(kind) {
  if (kind === "create") return [
    ["      and s.status = 'active'\n    for update;", `      and (s.status = 'active' or (
        s.status = 'sold_out'
        and coalesce(s.metadata->>'supplier', v_product.metadata->>'supplier') = 'kuajingzy'
        and coalesce(s.metadata->>'fulfillment_source', v_product.metadata->>'fulfillment_source') = 'supplier'
      ))
    for update;`],
    ["  if v_auto_delivery then\n    null;", reserve],
    ["      'supplier_binding', case when v_kuajingzy_binding is not null then", `      'sellable_cap_reservation', case when v_kuajingzy_binding is not null then
        jsonb_build_object('version', 1, 'model', 'MODEL_C', 'provider', 'kuajingzy',
          'sku_id', p_sku_id, 'quantity', v_quantity, 'reserved', true)
        else null end,
      'supplier_binding', case when v_kuajingzy_binding is not null then`],
  ];
  return [
    ["  v_released_digital integer := 0;", "  v_released_digital integer := 0;\n  v_released_kuajingzy_cap integer := 0;"],
    ["  update public.product_skus s", release + "  update public.product_skus s"],
    ["      'released_digital', 0", "      'released_kuajingzy_cap', 0,\n      'released_digital', 0"],
    ["    'released_digital', v_released_digital", "    'released_kuajingzy_cap', v_released_kuajingzy_cap,\n    'released_digital', v_released_digital"],
  ];
}

export function patch(source, kind) {
  for (const [anchor, replacement] of patches(kind)) {
    if (source.split(anchor).length !== 2) throw Error("ATOMIC_CAP_ANCHOR_DRIFT");
    source = source.replace(anchor, () => replacement);
  }
  return source;
}
