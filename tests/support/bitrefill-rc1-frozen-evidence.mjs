// Compare raw v1 evidence without rewriting/normalizing its canonical hashes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const outcome = "record_supplier_fulfillment_outcome(uuid,uuid,text,text,uuid,text,boolean,text,text,text,numeric,numeric,text)";
const md5 = (s) => createHash("md5").update(s).digest("hex");
export function compareRc1FrozenContract({ current, frozen, outcomeDefinition }) {
  assert.equal(current.length, frozen.length, "RC1_CONTRACT_ROW_COUNT_CHANGED");
  const differences = [];
  for (const [index, actual] of current.entries()) {
    const expected = frozen[index];
    for (const field of ["schema_version", "section", "object_type", "schema_name", "object_name"]) {
      assert.equal(actual[field], expected[field], "RC1_CONTRACT_IDENTITY_CHANGED");
    }
    if (actual.canonical_definition === expected.canonical_definition) continue;
    assert.equal(actual.object_type, "function", "RC1_UNEXPLAINED_CONTRACT_DRIFT");
    assert.equal(actual.object_name, outcome, "RC1_UNEXPLAINED_FUNCTION_DRIFT");
    const a = JSON.parse(actual.canonical_definition), e = JSON.parse(expected.canonical_definition);
    assert.equal(md5(outcomeDefinition), a.definition_md5, "RC1_ACTUAL_SOURCE_HASH_MISMATCH");
    // pg_get_functiondef emits LF headers but preserves prosrc body line endings.
    const body = outcomeDefinition.match(/AS \$function\$([\s\S]*)\$function\$/);
    assert.ok(body, "RC1_OUTCOME_BODY_REQUIRED");
    const bodyLf = body[1].replaceAll("\r\n", "\n");
    const variants = [bodyLf, bodyLf.replaceAll("\n", "\r\n")].map((value) =>
      outcomeDefinition.slice(0, body.index) + "AS $function$" + value + "$function$" +
      outcomeDefinition.slice(body.index + body[0].length));
    assert.ok(variants.some((value) => md5(value) === e.definition_md5), "RC1_SOURCE_NOT_EOL_ONLY");
    const { definition_md5: actualMd5, ...aRest } = a;
    const { definition_md5: expectedMd5, ...eRest } = e;
    assert.deepEqual(aRest, eRest, "RC1_FUNCTION_METADATA_CHANGED");
    differences.push({ object: outcome, classification: "COMPATIBLE_WITH_DOCUMENTED_DIFFERENCE",
      reason: "function body LF/CRLF only, independently reconstructed MD5; raw canonical hashes retained",
      actual_md5: actualMd5, frozen_md5: expectedMd5 });
  }
  assert.ok(differences.length <= 1);
  return differences;
}
