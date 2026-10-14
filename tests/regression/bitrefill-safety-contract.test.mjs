import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../../app/api/webhooks/bitrefill/route.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../../lib/providers/bitrefill/client-core.mjs", import.meta.url), "utf8");
const probe = readFileSync(new URL("../../scripts/probe-bitrefill-readonly.mjs", import.meta.url), "utf8");

test("Bitrefill V1 exposes only read-only API methods", () => {
  assert.match(client, /method: "GET"/);
  assert.doesNotMatch(client, /POST|\/invoices|\/accounts\/deposit|brgc-batches|auto_pay|payment_method/);
  assert.doesNotMatch(probe, /POST|\/invoices|\/accounts\/deposit|brgc-batches|auto_pay|payment_method/);
});

test("webhook route is bounded and side-effect free", () => {
  assert.match(route, /MAX_WEBHOOK_BYTES/);
  assert.match(route, /side_effects: false/);
  assert.match(route, /status: number/);
  assert.doesNotMatch(route, /getSupabase|service_role|\.from\(|\.insert\(|\.update\(|fetch\(/);
  assert.doesNotMatch(route, /console\.|redemption_info|digital_delivery_secrets/);
});

test("no Bitrefill credential is embedded in task source", () => {
  const source = `${client}\n${probe}\n${route}`;
  assert.doesNotMatch(source, /BITREFILL_API_KEY\s*=\s*["'][^"']+/);
  assert.doesNotMatch(source, /Authorization[^\n]+console/);
});
