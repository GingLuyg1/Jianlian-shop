import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..", "..");
const file = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const createOrderFunction = () => {
  const migration = file("supabase/migrations/20260710_create_order_with_item_compatibility.sql");
  const start = migration.indexOf("create or replace function public.create_order_with_item(");
  assert.ok(start >= 0, "authoritative create_order_with_item definition must exist");
  const end = migration.indexOf("\n$$;", start);
  assert.ok(end > start, "authoritative create_order_with_item definition must terminate");
  return migration.slice(start, end + "\n$$;".length);
};

const sqlGap = String.raw`(?:\s|--[^\n]*(?:\n|$)|\/\*(?:[^*]|\*+[^*/])*\*\/)+`;
const sqlOptionalGap = String.raw`(?:\s|--[^\n]*(?:\n|$)|\/\*(?:[^*]|\*+[^*/])*\*\/)*`;
const assignmentAnchorSource = String.raw`(v_auto_delivery${sqlGap}:=${sqlGap}lower${sqlOptionalGap}\(${sqlOptionalGap}coalesce${sqlOptionalGap}\(${sqlOptionalGap}v_delivery_type${sqlOptionalGap},${sqlOptionalGap}''${sqlOptionalGap}\)${sqlOptionalGap}\)${sqlGap}in${sqlOptionalGap}\(${sqlOptionalGap}'automatic'${sqlOptionalGap},${sqlOptionalGap}'auto'${sqlOptionalGap},${sqlOptionalGap}'card'${sqlOptionalGap},${sqlOptionalGap}'account'${sqlOptionalGap},${sqlOptionalGap}'auto_delivery'${sqlOptionalGap}\)${sqlOptionalGap};)`;
const assignmentPatchedSource = String.raw`${assignmentAnchorSource}${sqlGap}if${sqlGap}p_sku_id${sqlGap}is${sqlGap}not${sqlGap}null${sqlGap}then${sqlGap}v_supplier_delivery${sqlGap}:=${sqlGap}v_auto_delivery`;
const countAnchorSource = String.raw`(if${sqlGap})v_auto_delivery(${sqlGap}then${sqlGap}select${sqlGap}count\(\*\)::integer${sqlGap}into${sqlGap}v_stock${sqlGap}from${sqlGap}public\.digital_inventory${sqlGap}as${sqlGap}di_count)`;
const countPatchedSource = String.raw`if${sqlGap}v_auto_delivery${sqlGap}and${sqlGap}not${sqlGap}v_supplier_delivery${sqlGap}then${sqlGap}select${sqlGap}count\(\*\)::integer${sqlGap}into${sqlGap}v_stock${sqlGap}from${sqlGap}public\.digital_inventory${sqlGap}as${sqlGap}di_count`;
const pickAnchorSource = String.raw`(if${sqlGap})v_auto_delivery(${sqlGap}then${sqlGap}with${sqlGap}picked${sqlGap}as${sqlGap}\(${sqlGap}select${sqlGap}di_pick\.id${sqlGap}from${sqlGap}public\.digital_inventory${sqlGap}as${sqlGap}di_pick)`;
const pickPatchedSource = String.raw`if${sqlGap}v_auto_delivery${sqlGap}and${sqlGap}not${sqlGap}v_supplier_delivery${sqlGap}then${sqlGap}with${sqlGap}picked${sqlGap}as${sqlGap}\(${sqlGap}select${sqlGap}di_pick\.id${sqlGap}from${sqlGap}public\.digital_inventory${sqlGap}as${sqlGap}di_pick`;

const patchAuthoritativeCreateOrder = (definition) => {
  const assignmentMatches = [...definition.matchAll(new RegExp(assignmentAnchorSource, "g"))];
  const assignmentPatchedMatches = [...definition.matchAll(new RegExp(assignmentPatchedSource, "g"))];
  const countMatches = [...definition.matchAll(new RegExp(countAnchorSource, "g"))];
  const countPatchedMatches = [...definition.matchAll(new RegExp(countPatchedSource, "g"))];
  const pickMatches = [...definition.matchAll(new RegExp(pickAnchorSource, "g"))];
  const pickPatchedMatches = [...definition.matchAll(new RegExp(pickPatchedSource, "g"))];
  if (
    assignmentMatches.length === 1 &&
    assignmentPatchedMatches.length === 1 &&
    countMatches.length === 0 &&
    countPatchedMatches.length === 1 &&
    pickMatches.length === 0 &&
    pickPatchedMatches.length === 1
  ) {
    return definition;
  }
  if (
    assignmentMatches.length !== 1 ||
    assignmentPatchedMatches.length !== 0 ||
    countMatches.length !== 1 ||
    countPatchedMatches.length !== 0 ||
    pickMatches.length !== 1 ||
    pickPatchedMatches.length !== 0
  ) {
    throw new Error("DAJU_FULFILLMENT_CREATE_ORDER_CONTRACT_DRIFT");
  }
  return definition
    .replace(
      new RegExp(assignmentAnchorSource),
      "$1\n  if p_sku_id is not null then\n    v_supplier_delivery := v_auto_delivery",
    )
    .replace(new RegExp(countAnchorSource), "$1v_auto_delivery and not v_supplier_delivery$2")
    .replace(new RegExp(pickAnchorSource), "$1v_auto_delivery and not v_supplier_delivery$2");
};

test("Daju server client uses only server environment names and never logs credentials or delivery secrets", () => {
  const client = file("lib/providers/daju/client.ts");
  const core = file("lib/providers/daju/client-core.mjs");
  const route = file("app/api/admin/suppliers/daju/route.ts");
  assert.match(client, /import "server-only"/);
  assert.match(client, /DAJU_API_BASE_URL/);
  assert.match(client, /DAJU_API_KEY/);
  assert.doesNotMatch(`${client}\n${core}\n${route}`, /console\.(?:log|info|warn)[\s\S]{0,120}(?:apiKey|delivered)/i);
  assert.doesNotMatch(`${client}\n${core}`, /NEXT_PUBLIC_DAJU/);
});

test("paid-order delivery reserves and delivers local stock before supplier fallback", () => {
  const service = file("lib/delivery/delivery-service.ts");
  const reserveIndex = service.indexOf('supabase.rpc("reserve_local_inventory_for_daju_order"');
  const localIndex = service.indexOf('supabase.rpc("deliver_digital_order"');
  const supplierIndex = service.indexOf("deliverSupplier: () => fulfillDajuOrderWithSupabase");
  assert.ok(reserveIndex >= 0 && localIndex > reserveIndex && supplierIndex > localIndex);
  assert.match(service, /supplier\.uncertain > 0/);
  assert.match(service, /supplier\.failed > 0 \|\| supplier\.needsInput > 0/);
});

test("local-stock priority reserves all units or falls back without creating a supplier request", () => {
  const migration = file("supabase/migrations/20260810200000_daju_local_inventory_priority_v1.sql");
  const postcheck = file("docs/audits/20260810-daju-local-inventory-priority-v1-postcheck.sql");
  assert.match(migration, /create or replace function public\.reserve_local_inventory_for_daju_order/);
  assert.match(migration, /product_snapshot->'supplier_binding'->>'supplier'/);
  assert.doesNotMatch(migration, /products\.metadata|product_skus\.metadata/);
  assert.match(migration, /limit v_required[\s\S]*for update skip locked/);
  assert.match(migration, /cardinality\(v_inventory_ids\)[\s\S]*<> v_required[\s\S]*supplier_fallback_count/);
  assert.match(migration, /if v_reserved > 0[\s\S]*v_blocked_count := v_blocked_count \+ 1/);
  assert.match(migration, /v_delivered > 0 and v_delivered < coalesce\(v_item\.quantity, 1\)[\s\S]*v_blocked_count/);
  assert.match(migration, /v_updated_count <> v_required/);
  assert.doesNotMatch(migration, /insert into public\.supplier_fulfillment_requests/i);
  assert.match(migration, /not exists \([\s\S]*supplier_fulfillment_requests as local_sfr/);
  assert.match(migration, /local_di\.status = 'reserved'/);
  assert.match(migration, /local_di\.reserved_order_item_id = order_items\.id/);
  assert.match(migration, /revoke all on function public\.reserve_local_inventory_for_daju_order\(uuid,text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.reserve_local_inventory_for_daju_order\(uuid,text\) to service_role/);

  const uncommented = postcheck.replace(/--[^\r\n]*/g, "");
  assert.match(uncommented, /begin;[\s\S]*set transaction read only;/i);
  assert.match(uncommented, /reservation_contract_blocker_count/);
  assert.match(uncommented, /local_delivery_contract_blocker_count/);
  assert.match(uncommented, /end as assessment/);
  assert.doesNotMatch(uncommented, /(?:^|;)\s*(?:insert|update|delete|merge|create|alter|drop|grant|revoke|truncate|call|do)\b/im);
});

test("candidate migration persists one request per item and uses existing private delivery boundary", () => {
  const migration = file("supabase/migrations/20260810120000_daju_supplier_fulfillment_v1.sql");
  assert.match(migration, /create table public\.supplier_fulfillment_requests/i);
  assert.match(migration, /unique \(order_item_id\)/i);
  assert.match(migration, /unique \(request_id\)/i);
  assert.match(migration, /attempt_token uuid/i);
  assert.match(migration, /payment_status <> 'paid'/i);
  assert.match(migration, /digital_delivery_secrets/i);
  assert.match(migration, /delivery_type = 'supplier_delivery'/i);
  assert.match(migration, /supplier_fulfillment_requests[\s\S]*enable row level security/i);
  assert.match(migration, /revoke all privileges[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(migration, /fulfillment_source[\s\S]*supplier[\s\S]*daju/i);
  assert.match(migration, /v_supplier_delivery boolean/i);
  assert.match(migration, /v_auto_delivery and not v_supplier_delivery/i);
  assert.match(migration, /v_count_patched_pattern/i);
  assert.match(migration, /v_pick_patched_pattern/i);
  assert.match(migration, /v_assignment_anchor_pattern/i);
  assert.match(migration, /v_assignment_patched_pattern/i);
  assert.match(migration, /'supplier_binding'/i);
  assert.doesNotMatch(migration, /create table public\.(?:digital_delivery|delivery_secret|wallet_accounts)/i);
});

test("Daju order snapshot patch recognizes the authoritative inventory blocks without fragile formatting anchors", () => {
  const migration = file("supabase/migrations/20260810120000_daju_supplier_fulfillment_v1.sql");
  const authoritative = createOrderFunction();

  assert.match(authoritative, /v_auto_delivery boolean := false;/);
  assert.match(authoritative, /'option_snapshot', v_option_snapshot/);
  assert.doesNotThrow(() => patchAuthoritativeCreateOrder(authoritative));
  assert.doesNotThrow(() => patchAuthoritativeCreateOrder(authoritative.replace(/\n/g, "\r\n")));

  const assignment = "v_auto_delivery := lower(coalesce(v_delivery_type, '')) in\n    ('automatic','auto','card','account','auto_delivery');";
  const reindentedAssignment = "v_auto_delivery  :=\n    lower ( coalesce ( v_delivery_type , '' ) )\n      in ( 'automatic' , 'auto' , 'card' , 'account' , 'auto_delivery' );";
  assert.doesNotThrow(() => patchAuthoritativeCreateOrder(authoritative.replace(assignment, reindentedAssignment)));

  const reindented = authoritative
    .replace(
      "  if v_auto_delivery then\n    select count(*)::integer",
      "\tif   v_auto_delivery\tthen\n\t\tselect   count(*)::integer",
    )
    .replace(
      "  if v_auto_delivery then\n    with picked as (\n      select di_pick.id",
      "    if\tv_auto_delivery  then\n      with   picked as (\n        select   di_pick.id",
    );
  assert.doesNotThrow(() => patchAuthoritativeCreateOrder(reindented));

  const commented = authoritative
    .replace(
      "if v_auto_delivery then\n    select count(*)::integer",
      "if v_auto_delivery then\n    -- Count only the local inventory reserved by this block.\n    select count(*)::integer",
    )
    .replace(
      "if v_auto_delivery then\n    with picked as (",
      "if v_auto_delivery then /* keep local FIFO selection */\n    with picked as (",
    );
  assert.doesNotThrow(() => patchAuthoritativeCreateOrder(commented));

  assert.throws(
    () => patchAuthoritativeCreateOrder(authoritative.replace("select count(*)::integer", "select sum(1)::integer")),
    /CREATE_ORDER_CONTRACT_DRIFT/,
  );
  assert.throws(
    () => patchAuthoritativeCreateOrder(authoritative.replace("with picked as (", "with removed_pick_block as (")),
    /CREATE_ORDER_CONTRACT_DRIFT/,
  );
  assert.throws(
    () => patchAuthoritativeCreateOrder(authoritative.replace(assignment, "")),
    /CREATE_ORDER_CONTRACT_DRIFT/,
  );
  assert.throws(
    () => patchAuthoritativeCreateOrder(authoritative.replace(assignment, `${assignment}\n  ${assignment}`)),
    /CREATE_ORDER_CONTRACT_DRIFT/,
  );
  assert.throws(
    () => patchAuthoritativeCreateOrder(authoritative.replace("'automatic','auto','card','account','auto_delivery'", "'automatic','auto','voucher','account','auto_delivery'")),
    /CREATE_ORDER_CONTRACT_DRIFT/,
  );

  const patched = patchAuthoritativeCreateOrder(authoritative);
  assert.match(patched, /if p_sku_id is not null then\s+v_supplier_delivery := v_auto_delivery/);
  assert.equal((patched.match(/if v_auto_delivery and not v_supplier_delivery then/g) ?? []).length, 2);
  assert.match(patched, /select count\(\*\)::integer[\s\S]*from public\.digital_inventory as di_count/);
  assert.match(patched, /with picked as \([\s\S]*from public\.digital_inventory as di_pick/);
  assert.match(patched, /di_count\.status = 'available'/);
  assert.match(patched, /di_pick\.status = 'available'/);
  assert.equal(patchAuthoritativeCreateOrder(patched), patched);

  const snapshotPatch = migration.match(/do \$snapshot_supplier_binding\$[\s\S]*?\$snapshot_supplier_binding\$;/i)?.[0] ?? "";
  const noSkuBranch = snapshotPatch.split("'  else'")[1]?.split("'  end if;'")[0] ?? "";
  assert.match(snapshotPatch, /v_supplier_delivery boolean/);
  assert.match(snapshotPatch, /''supplier_binding''/);
  assert.match(noSkuBranch, /v_product\.metadata->''supplier_product_id''/);
  assert.doesNotMatch(noSkuBranch, /v_sku\.metadata/);
  assert.match(snapshotPatch, /pg_catalog\.regexp_count\(v_definition, v_count_anchor_pattern\)/);
  assert.match(snapshotPatch, /pg_catalog\.regexp_replace\([\s\S]*v_count_anchor_pattern/);
  assert.match(snapshotPatch, /pg_catalog\.regexp_count\(v_definition, v_assignment_anchor_pattern\)/);
  assert.match(snapshotPatch, /pg_catalog\.regexp_replace\([\s\S]*v_assignment_anchor_pattern/);
  assert.doesNotMatch(snapshotPatch, /v_auto_delivery := lower\(coalesce\(v_delivery_type,[\s\S]{0,120}chr\(10\)/);
  assert.doesNotMatch(snapshotPatch, /chr\(10\) \|\| '    select count\(\*\)::integer'/);
  assert.doesNotMatch(snapshotPatch, /chr\(10\) \|\| '    with picked as'/);
});

test("local delivery selection is frozen by the order-item supplier snapshot", () => {
  const migration = file("supabase/migrations/20260810120000_daju_supplier_fulfillment_v1.sql");
  const exclusion = migration.match(/do \$exclude_supplier_items\$[\s\S]*?\$exclude_supplier_items\$;/i)?.[0] ?? "";

  assert.match(exclusion, /order_items\.product_snapshot->'supplier_binding'->>'fulfillment_source'/i);
  assert.match(exclusion, /order_items\.product_snapshot->'supplier_binding'->>'supplier'/i);
  assert.doesNotMatch(exclusion, /supplier_product|supplier_sku|products\s|product_skus\s/i);
  assert.match(migration, /Legacy rows without supplier_binding remain local-inventory rows/i);
});

test("supplier binding creation separates validated SKU and no-SKU metadata paths", () => {
  const migration = file("supabase/migrations/20260810120000_daju_supplier_fulfillment_v1.sql");
  const snapshotPatch = migration.match(/do \$snapshot_supplier_binding\$[\s\S]*?\$snapshot_supplier_binding\$;/i)?.[0] ?? "";
  const branch = snapshotPatch.match(/'  if p_sku_id is not null then'[\s\S]*?'  end if;'/i)?.[0] ?? "";
  const noSkuBranch = branch.split("'  else'")[1] ?? "";

  assert.match(branch, /v_sku\.metadata->>''fulfillment_source''/i);
  assert.match(branch, /coalesce\(v_sku\.metadata->''supplier_product_id'', v_product\.metadata->''supplier_product_id''\)/i);
  assert.match(noSkuBranch, /v_product\.metadata->>''fulfillment_source''/i);
  assert.match(noSkuBranch, /v_supplier_product_id := v_product\.metadata->''supplier_product_id''/i);
  assert.doesNotMatch(noSkuBranch, /v_sku\.metadata/i);
  assert.match(migration, /existing RPC validates a requested SKU/i);
});

test("snapshot fields, not later catalog metadata, preserve supplier and local history", () => {
  const migration = file("supabase/migrations/20260810120000_daju_supplier_fulfillment_v1.sql");
  const exclusion = migration.match(/do \$exclude_supplier_items\$[\s\S]*?\$exclude_supplier_items\$;/i)?.[0] ?? "";

  const supplierSnapshot = {
    supplier_binding: { fulfillment_source: "supplier", supplier: "daju" },
  };
  const legacyLocalSnapshot = { id: "historical-local-item" };
  const isDajuSnapshot = (snapshot) =>
    snapshot?.supplier_binding?.fulfillment_source === "supplier"
    && snapshot?.supplier_binding?.supplier === "daju";

  assert.equal(isDajuSnapshot(supplierSnapshot), true);
  assert.equal(isDajuSnapshot(legacyLocalSnapshot), false);
  assert.doesNotMatch(exclusion, /metadata/);
});

test("runtime trusts the immutable order-item supplier snapshot instead of later product metadata", () => {
  const fulfillment = file("lib/providers/daju/fulfillment.ts");
  const candidate = file("lib/providers/daju/fulfillment-candidate.mjs");
  assert.match(fulfillment, /product_snapshot/);
  assert.match(fulfillment, /classifyDajuFulfillmentCandidate\(item\)/);
  assert.doesNotMatch(fulfillment, /from\("products"\)|from\("product_skus"\)/);
  assert.match(candidate, /snapshot\.supplier_binding/);
  assert.match(candidate, /parseDajuProductBinding\(snapshotBinding\)/);
  assert.doesNotMatch(`${fulfillment}\n${candidate}`, /parseDajuProductBinding\(product\.metadata/);
  assert.doesNotMatch(candidate, /current_product_metadata|current_sku_metadata/);
});

test("admin existing-order reconciliation is GET-only and reuses the private delivery outcome boundary", () => {
  const route = file("app/api/admin/orders/[orderId]/route.ts");
  const fulfillment = file("lib/providers/daju/fulfillment.ts");
  const core = file("lib/providers/daju/fulfillment-core.mjs");
  const client = file("lib/providers/daju/client-core.mjs");
  assert.match(route, /action === "reconcile_daju_order"/);
  assert.match(route, /reconcileDajuExistingOrderWithSupabase/);
  assert.match(fulfillment, /reconcileDajuExistingCandidate/);
  assert.match(core, /input\.client\.getOrder\(input\.orderCode\)/);
  assert.match(core, /input\.store\.recordOutcome/);
  assert.doesNotMatch(core.match(/export async function reconcileDajuExistingCandidate[\s\S]*$/)?.[0] ?? "", /\.purchase\(/);
  assert.match(client, /parseDajuPurchaseReference/);
  assert.match(client, /await readOrder\(reference\.orderCode\)/);
  const reconciliationBlock = route.slice(
    route.indexOf('if (body?.action === "reconcile_daju_order")'),
    route.indexOf('if (body?.action === "retry_auto_delivery")'),
  );
  assert.doesNotMatch(reconciliationBlock, /delivery_content|deliveredContent/);
});

test("candidate migration never exposes supplier delivery content in logs", () => {
  const migration = file("supabase/migrations/20260810120000_daju_supplier_fulfillment_v1.sql");
  for (const block of migration.match(/perform public\.write_delivery_log\([\s\S]*?\);/gi) ?? []) {
    assert.doesNotMatch(block, /p_delivery_content/);
  }
  assert.match(migration, /'provider_order_code_present',true/);
});

test("public delivery remains ownership-scoped and does not query private tables directly", () => {
  const userRoute = file("app/api/orders/[orderNo]/delivery/route.ts");
  const fulfillmentRoute = file("app/api/orders/[orderNo]/fulfillment/route.ts");
  assert.match(userRoute, /get_order_delivery_for_user/);
  assert.match(fulfillmentRoute, /get_order_fulfillment_for_user/);
  assert.doesNotMatch(`${userRoute}\n${fulfillmentRoute}`, /from\("(?:digital_delivery_secrets|supplier_fulfillment_requests)"\)/);
});

test("Daju product binding is metadata-only and never synchronizes supplier cost into Jianlian sale price", () => {
  const binding = file("app/api/admin/suppliers/daju/bindings/[productId]/route.ts");
  assert.match(binding, /fulfillment_source:\s*"supplier"/);
  assert.match(binding, /supplier:\s*"daju"/);
  assert.match(binding, /supplier_product_id/);
  assert.match(binding, /supplier_max_unit_cost/);
  const update = binding.match(/\.update\(\{[\s\S]*?\}\)/)?.[0] ?? "";
  assert.doesNotMatch(update, /\bprice\b/);
});

test("joint test rollout artifacts are read-only, ordered and fail closed", () => {
  const precheck = file("docs/audits/20260810-account-recharge-daju-test-precheck.sql");
  const retryPrecheck = file("docs/audits/20260810-daju-supplier-fulfillment-v1-retry-precheck.sql");
  const rechargePostcheck = file("docs/audits/20260809-account-recharge-usdt-cny-v1-postcheck.sql");
  const dajuPostcheck = file("docs/audits/20260810-daju-supplier-fulfillment-v1-postcheck.sql");
  const checklist = file("docs/account-recharge-daju-test-execution-checklist.md");
  const writeStatement = /(?:^|;)\s*(?:insert|update|delete|merge|create|alter|drop|grant|revoke|truncate|call|do|copy|vacuum|analyze|refresh)\b/im;

  for (const sql of [precheck, retryPrecheck, rechargePostcheck, dajuPostcheck]) {
    const uncommented = sql.replace(/--[^\r\n]*/g, "");
    assert.match(uncommented, /begin;[\s\S]*set transaction read only;/i);
    assert.match(uncommented, /rollback;/i);
    assert.doesNotMatch(uncommented, writeStatement);
  }
  assert.match(precheck, /READY_FOR_TEST_MIGRATIONS/);
  assert.match(retryPrecheck, /assignment_match_count/);
  assert.match(retryPrecheck, /patched_assignment_match_count/);
  assert.match(retryPrecheck, /READY_FOR_DAJU_MIGRATION_RETRY/);
  assert.match(dajuPostcheck, /order_items\.product_snapshot/);
  assert.match(dajuPostcheck, /supplier_product\.metadata[\s\S]*= 0/);
  const ordered = [
    "20260810-account-recharge-daju-test-precheck.sql",
    "20260809120000_account_recharge_usdt_cny_v1.sql",
    "20260809-account-recharge-usdt-cny-v1-postcheck.sql",
    "20260810120000_daju_supplier_fulfillment_v1.sql",
    "20260810-daju-supplier-fulfillment-v1-postcheck.sql",
  ].map((name) => checklist.indexOf(name));
  assert.ok(ordered.every((index) => index >= 0));
  assert.ok(ordered.every((index, position) => position === 0 || index > ordered[position - 1]));
  assert.match(checklist, /STOP/g);
  assert.match(checklist, /不调用真实 `\/purchase`/);
});

test("Daju rollout artifacts are candidate-only and SQL remains unexecuted", () => {
  const rollout = file("docs/daju-supplier-fulfillment-v1-rollout.md");
  assert.match(rollout, /不得执行|DO NOT EXECUTE/i);
  assert.match(rollout, /所有测试使用 mock\/fake HTTP/i);
  assert.match(rollout, /DAJU_API_KEY/);
  assert.match(rollout, /UNCERTAIN/);
  assert.match(rollout, /不得自动重试采购/);
});
