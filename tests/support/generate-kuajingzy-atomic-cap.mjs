// Disposable PG17 generation only. Writes the forward migration candidate in this checkout.
import fs from "node:fs";
import { bootstrap, definition } from "./kuajingzy-atomic-cap-local.mjs";
import { patches, patch, fingerprint, createSignature, releaseSignature, migrationPath } from "./kuajingzy-atomic-cap-patch.mjs";

bootstrap();
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const lines = [
  "-- Candidate only. Production requires separate read-only source/ACL preflight and authorization.",
  "-- No new tables or columns. MODEL_C capacity is independent of advisory upstream stock.",
  "begin;", "set local lock_timeout = '5s';", "set local statement_timeout = '60s';",
];
const manifest = {};
for (const [kind, signature] of [["create", createSignature], ["release", releaseSignature]]) {
  // psql trims one trailing newline; pg_get_functiondef includes it.
  const before = definition(signature) + "\n";
  const after = patch(before, kind);
  manifest[kind] = { baseline: fingerprint(before), patched: fingerprint(after) };
  const tag = kind === "create" ? "CREATE_ORDER" : "RELEASE_INVENTORY";
  lines.push(`do $atomic$
declare
  target oid := to_regprocedure(${quote(signature)});
  original text;
  patched text;
  original_acl aclitem[];
  original_owner oid;
  original_config text[];
begin
  if target is null then raise exception 'ATOMIC_CAP_DEPENDENCY_MISSING'; end if;
  if to_regclass('public.product_skus') is null or to_regclass('public.order_items') is null
    or to_regclass('public.order_deliveries') is null then raise exception 'ATOMIC_CAP_DEPENDENCY_MISSING'; end if;
  if exists (
    select 1 from (values
      ('orders','reservation_released_at'), ('orders','payment_status'), ('orders','status'),
      ('order_items','product_snapshot'), ('order_items','sku_id'), ('order_items','quantity'),
      ('product_skus','stock'), ('product_skus','status'), ('product_skus','updated_at'),
      ('order_deliveries','order_item_id'), ('order_deliveries','delivery_status')
    ) required(table_name,column_name)
    where not exists (select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.table_name and c.column_name=required.column_name)
  ) then raise exception 'ATOMIC_CAP_DEPENDENCY_MISSING'; end if;
  if has_function_privilege('anon', target, 'execute')
    or not has_function_privilege('service_role', target, 'execute') then
    raise exception 'ATOMIC_CAP_ACL_PRECONDITION';
  end if;
  select replace(pg_get_functiondef(target), E'\\r\\n', E'\\n'), proacl, proowner, proconfig
    into original, original_acl, original_owner, original_config from pg_proc where oid=target;
  if encode(sha256(convert_to(original, 'UTF8')), 'hex') = '${fingerprint(after)}' then return; end if;
  if encode(sha256(convert_to(original, 'UTF8')), 'hex') <> '${fingerprint(before)}' then
    raise exception 'UNKNOWN_${tag}_BASELINE';
  end if;
  patched := original;`);
  for (const [anchor, replacement] of patches(kind)) {
    lines.push(`  if (length(patched)-length(replace(patched,${quote(anchor)},'')))/length(${quote(anchor)}) <> 1 then
    raise exception 'ATOMIC_CAP_ANCHOR_DRIFT';
  end if;
  patched := replace(patched,${quote(anchor)},${quote(replacement)});`);
  }
  lines.push(`  if encode(sha256(convert_to(patched, 'UTF8')), 'hex') <> '${fingerprint(after)}' then
    raise exception 'ATOMIC_CAP_PATCH_DRIFT';
  end if;
  execute patched;
  if encode(sha256(convert_to(replace(pg_get_functiondef(target), E'\\r\\n', E'\\n'), 'UTF8')), 'hex') <> '${fingerprint(after)}'
    or not exists (select 1 from pg_proc where oid=target and proacl is not distinct from original_acl
      and proowner=original_owner and proconfig is not distinct from original_config and prosecdef)
    or has_function_privilege('anon',target,'execute') then
    raise exception 'ATOMIC_CAP_POSTCHECK_FAILED';
  end if;
end
$atomic$;`);
}
lines.push("commit;", "");
fs.writeFileSync(migrationPath, lines.join("\n"));
console.log(JSON.stringify(manifest));
