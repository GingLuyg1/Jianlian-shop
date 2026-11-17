import {createHash} from 'node:crypto';
export const declaration='  v_bitrefill_gate jsonb := null;';
export const hookAnchor='  if exists(select 1 from bitrefill_pin_private.sale_authorizations a where a.product_id=p_product_id) and';
export const bindingAnchor="'supplier_binding', case when v_bitrefill_gate is not null then";
export function patchOrderCreate(base,hook) {
 for(const anchor of [declaration,hookAnchor,bindingAnchor])if(base.split(anchor).length!==2)throw Error('KUAJINGZY_FREEZE_ANCHOR_DRIFT');
 if(!base.includes("= 'daju';")||!base.includes('bitrefill_pin_private.consume_quote(')||!base.includes('bitrefill_pin_private.attach_quote(')||!base.includes('bitrefill_pin_private.replay_guard('))throw Error('KUAJINGZY_EXISTING_HOOKS_MISSING');
 return base.replace(declaration,()=>declaration+'\n  v_kuajingzy_binding jsonb := null;\n  v_kj_metadata jsonb;')
 .replace(hookAnchor,()=>hook+'\n'+hookAnchor)
 .replace(bindingAnchor,()=>"'supplier_binding', case when v_kuajingzy_binding is not null then v_kuajingzy_binding when v_bitrefill_gate is not null then");
}
export const fingerprint=s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
