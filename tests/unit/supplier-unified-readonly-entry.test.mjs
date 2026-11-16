import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const file = (path) => readFileSync(join(process.cwd(), path), "utf8");

test("unified Bitrefill and KuajingZy admin entries remain read-only", () => {
  const bitrefill = file("app/api/admin/suppliers/bitrefill/route.ts");
  const kuajingzy = file("app/api/admin/suppliers/kuajingzy/route.ts");
  const registry = file("lib/providers/core/supplier-router-core.mjs");
  const ui = file("components/admin/suppliers/supplier-ui-registry.ts");
  const combined = [bitrefill, kuajingzy].join("\n");

  assert.match(ui, /code: "bitrefill"/);
  assert.match(ui, /code: "kuajingzy"/);
  assert.match(bitrefill, /purchaseEnabled: false/);
  assert.match(kuajingzy, /purchaseEnabled: false/);
  assert.match(registry, /purchase: "release_gated"/);
  assert.match(registry, /kuajingzy:[\s\S]*purchase: false/);

  assert.doesNotMatch(combined, /\.purchase\s*\(/);
  assert.doesNotMatch(combined, /createInvoice\s*\(/);
  assert.doesNotMatch(combined, /buy-products/);
  assert.doesNotMatch(combined, /method:\s*["']POST["']/);
  assert.doesNotMatch(combined, /SUPPLIER_AUTO_PURCHASE_ENABLED\s*=\s*["']true["']/);
});

test("KuajingZy production wrapper exposes only the read-only client", () => {
  const runtime = file("lib/providers/kuajingzy/production-server.ts");
  assert.match(runtime, /createKuajingZyReadonlyClient/);
  assert.doesNotMatch(runtime, /purchase|createOrder|submit/i);
});
