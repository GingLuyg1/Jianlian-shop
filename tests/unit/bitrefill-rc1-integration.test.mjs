import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { REAL_BITREFILL_PURCHASE_ENABLED } from "../../lib/providers/bitrefill/prelaunch-policy.mjs";
import { compareRc1FrozenContract } from "../support/bitrefill-rc1-frozen-evidence.mjs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
test("RC1 uses the exact DB10-reviewed migration bytes and shared checksum pin", () => {
  const sha = createHash("sha256").update(readFileSync(new URL(
    "../../supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql", import.meta.url))).digest("hex");
  assert.equal(sha, "90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0");
  assert.ok(read("tests/support/supplier-v13-local-fixture.mjs").includes(`expectedMigrationSha256 = "${sha}"`));
  assert.equal(REAL_BITREFILL_PURCHASE_ENABLED, false);
});

test("merged harness retains DB9 owner/defaults plus P3 application paths and timeouts", () => {
  const source = read("tests/support/supplier-v13-db5-local-e2e.mjs");
  assert.match(source, /: db9Defaults \? `set role \$\{fixtureOwner\}; ` : ""/);
  assert.match(source, /supplier-v13-db9-default-acl\.sql/);
  assert.match(source, /runP2LocalCases\(/);
  assert.match(source, /runP3LocalPrelaunch\(/);
  assert.match(source, /verifyRc1PostmigrationPlan\(/);
  assert.match(source, /LOCAL_PG_COMMAND_TIMEOUT/);
  assert.match(source, /"-f", "-"/);
  assert.doesNotMatch(source, /^(?:<<<<<<<|=======|>>>>>>>)/m);
});

test("RC1 acceptance launcher is opt-in, loopback-pinned, sanitized and DB9-only", () => {
  const source = read("tests/support/bitrefill-rc1-local-acceptance.mjs");
  assert.match(source, /RC1_EXPLICIT_LOCAL_OPT_IN_REQUIRED/);
  assert.match(source, /V13_PGHOST: "127\.0\.0\.1", V13_PGPORT: "55433"/);
  assert.match(source, /delete env\[name\]/);
  assert.match(source, /BITREFILL_/);
  assert.match(source, /--db9-production-default-acl/);
  assert.match(source, /--db9-owner/);
  assert.doesNotMatch(source, /fetch\(|https:\/\/|SUPABASE_SERVICE_ROLE_KEY|console\.log\(env/);
});

test("future postmigration plan is SELECT-only and never equates version with source SHA", () => {
  const source = read("docs/integrations/sql/bitrefill-rc1-postmigration-readonly.sql");
  const tokens = source.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''").trim();
  assert.match(tokens, /^with\b/i);
  assert.doesNotMatch(tokens, /\b(?:insert|update|delete|create|alter|drop|grant|revoke|truncate|call|execute|copy)\b/i);
  assert.equal(tokens.split(";").filter((part) => part.trim()).length, 1);
  assert.match(source, /'source_sha_proven_by_version',false/);
  assert.match(source, /pg_has_role\(a.name,r.oid,'SET'\)/);
  assert.match(source, /has_column_privilege/);
  assert.match(source, /t\.tgenabled='O'/);
  assert.match(source, /current_setting\('transaction_read_only'\)='on'/);
  assert.doesNotMatch(source, /public\.(?:orders|order_items|digital_delivery_secrets)\b/);
});

test("RC1 metadata rehearsal reuses the guarded baseline migration-history fixture", () => {
  const source = read("tests/support/bitrefill-rc1-postmigration-local.mjs");
  assert.match(source, /RC1_REQUIRES_DB9_DEFAULT_ACL_OWNER_MODEL/);
  assert.match(source, /insert into supabase_migrations\.schema_migrations\(version\)/);
  assert.doesNotMatch(source, /create schema|create table/);
  assert.match(source, /begin read only;/);
  assert.match(source, /rollback;/);
});

test("RC1 evidence preserves raw hashes and accepts only proved outcome-body EOL difference", () => {
  const lf = "CREATE OR REPLACE FUNCTION public.probe()\nAS $function$\nbegin\nreturn;\nend;\n$function$\n";
  const crlf = lf.replace("$function$\nbegin\nreturn;\nend;\n$function$",
    "$function$\r\nbegin\r\nreturn;\r\nend;\r\n$function$");
  const row = (definition) => ({ schema_version: "v1", section: "contract", object_type: "function",
    schema_name: "public", object_name: "record_supplier_fulfillment_outcome(uuid,uuid,text,text,uuid,text,boolean,text,text,text,numeric,numeric,text)",
    canonical_definition: JSON.stringify({ security_definer: true,
      definition_md5: createHash("md5").update(definition).digest("hex") }) });
  const current = [row(lf)], frozen = [row(crlf)];
  const before = JSON.stringify({ current, frozen });
  assert.equal(compareRc1FrozenContract({ current, frozen, outcomeDefinition: lf }).length, 1);
  assert.equal(JSON.stringify({ current, frozen }), before);
  assert.deepEqual(compareRc1FrozenContract({ current, frozen: current, outcomeDefinition: lf }), []);
  const changed = lf.replace("return;", "return 1;");
  assert.throws(() => compareRc1FrozenContract({ current: [row(changed)], frozen,
    outcomeDefinition: changed }), /RC1_SOURCE_NOT_EOL_ONLY/);
  assert.throws(() => compareRc1FrozenContract({ current: [{ ...current[0], object_name: "other()" }],
    frozen, outcomeDefinition: lf }), /RC1_CONTRACT_IDENTITY_CHANGED/);
  const metadata = { ...current[0], canonical_definition: JSON.stringify({
    ...JSON.parse(current[0].canonical_definition), security_definer: false }) };
  assert.throws(() => compareRc1FrozenContract({ current: [metadata], frozen,
    outcomeDefinition: lf }), /RC1_FUNCTION_METADATA_CHANGED/);
  const runner = read("tests/support/supplier-v13-db7b-local-evidence.mjs");
  assert.match(runner, /preserveRc1 \? \["--verify-frozen-rc1"\]/);
});
