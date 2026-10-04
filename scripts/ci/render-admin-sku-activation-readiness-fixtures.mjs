import { ACTIVATION_READINESS_FIXTURES } from "../../tests/fixtures/admin-sku-activation-readiness.mjs";

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

console.log(String.raw`\set ON_ERROR_STOP on
create or replace function pg_temp.assert_true(value boolean, label text) returns void
language plpgsql as $$ begin if value is not true then raise exception 'ASSERT_FAILED: %', label; end if; end $$;`);

for (const fixture of ACTIVATION_READINESS_FIXTURES) {
  const result = `public.admin_evaluate_product_sku_activation('automatic', 'automatic', ${fixture.stock}, ${literal(fixture.metadataJson)}::jsonb, ${fixture.localAvailableCount})`;
  console.log(`select pg_temp.assert_true(((${result})->>'ready')::boolean is ${fixture.ready ? "true" : "false"} and (${result})->'reasons' = ${literal(JSON.stringify(fixture.reasons))}::jsonb, ${literal(`READINESS_PARITY_${fixture.name}`)});`);
}

console.log(`select pg_temp.assert_true((select provolatile = 's' from pg_proc where oid = 'public.admin_evaluate_product_sku_activation(text,text,integer,jsonb,bigint)'::regprocedure), 'EVALUATOR_VOLATILITY_STABLE');`);
console.log("select 'ADMIN_SKU_ACTIVATION_READINESS_FIXTURES_PASS';");
