import fs from 'node:fs';
import {patchOrderCreate,fingerprint,declaration,hookAnchor,bindingAnchor} from './kuajingzy-freeze-patch.mjs';
const base=fs.readFileSync('tests/fixtures/kuajingzy-order-create-base.sql','utf8').replaceAll('\r\n','\n');
const hook=fs.readFileSync('tests/support/kuajingzy-freeze-hook.sql','utf8').replaceAll('\r\n','\n');
const patched=patchOrderCreate(base,hook),q=s=>"'"+s.replaceAll("'","''")+"'";
const before=fingerprint(base),after=fingerprint(patched);
const newDeclaration=declaration+'\n  v_kuajingzy_binding jsonb := null;\n  v_kj_metadata jsonb;';
const newBinding="'supplier_binding', case when v_kuajingzy_binding is not null then v_kuajingzy_binding when v_bitrefill_gate is not null then";
const lines=['-- Candidate only. No Production execution without separate authorization.',
'-- Body-only extension: no tables, columns, RPC signature or payment algorithm changes.',
'begin;',"set local lock_timeout='5s';","set local statement_timeout='60s';",
'do $freeze$','declare v_oid oid; v_old text; v_new text;','begin',
" v_oid:=to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)');",
" if v_oid is null then raise exception 'KUAJINGZY_FREEZE_SIGNATURE_MISSING'; end if;",
" select replace(pg_get_functiondef(v_oid),E'\\r\\n',E'\\n') into v_old;",
' if md5(v_old)='+q(after)+' then return; end if;',
' if md5(v_old)<>'+q(before)+" then raise exception 'KUAJINGZY_FREEZE_SOURCE_DRIFT'; end if;"];
for(const a of ['bitrefill_pin_private.consume_quote(','bitrefill_pin_private.attach_quote(','bitrefill_pin_private.replay_guard(', "= 'daju';"])
 lines.push(' if position('+q(a)+" in v_old)=0 then raise exception 'KUAJINGZY_FREEZE_EXISTING_HOOK_MISSING'; end if;");
for(const a of [declaration,hookAnchor,bindingAnchor])
 lines.push(' if (length(v_old)-length(replace(v_old,'+q(a)+",'')))/length("+q(a)+")<>1 then raise exception 'KUAJINGZY_FREEZE_ANCHOR_DRIFT'; end if;");
lines.push(' v_new:=replace(v_old,'+q(declaration)+','+q(newDeclaration)+');',
' v_new:=replace(v_new,'+q(hookAnchor)+',$kj_hook$'+hook+'\n'+hookAnchor+'$kj_hook$);',
' v_new:=replace(v_new,'+q(bindingAnchor)+','+q(newBinding)+');',
' if md5(v_new)<>'+q(after)+" then raise exception 'KUAJINGZY_FREEZE_PATCH_DRIFT'; end if;",
' execute v_new;',
" select replace(pg_get_functiondef(v_oid),E'\\r\\n',E'\\n') into v_old;",
" if md5(v_old)<>"+q(after)+" then raise exception 'KUAJINGZY_FREEZE_POSTCHECK_FAILED'; end if;",
'end','$freeze$;','commit;','');
const sql=lines.join('\n').replaceAll('md5(v_old)',"encode(sha256(convert_to(v_old,'UTF8')),'hex')")
 .replaceAll('md5(v_new)',"encode(sha256(convert_to(v_new,'UTF8')),'hex')");
fs.writeFileSync('supabase/migrations/20261117184700_kuajingzy_order_binding_freeze_v1.sql',sql);
