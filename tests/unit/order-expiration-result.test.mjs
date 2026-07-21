import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOrderExpirationRpcResult } from "../../lib/orders/order-expiration-result.mjs";

test("expiration result reads all release counts from the atomic nested release payload", () => {
  const result = normalizeOrderExpirationRpcResult({
    ok: true,
    code: "EXPIRED",
    release: { released_normal: 2, released_sku: 3, released_digital: 1 },
  }, "request-1");

  assert.equal(result.releasedNormal, 2);
  assert.equal(result.releasedSku, 3);
  assert.equal(result.releasedDigital, 1);
});

test("expiration result supports the legacy top-level release count contract", () => {
  const result = normalizeOrderExpirationRpcResult({
    ok: true,
    code: "EXPIRED",
    released_normal: 1,
    released_sku: 2,
    released_digital: 4,
  }, "request-2");

  assert.equal(result.releasedNormal, 1);
  assert.equal(result.releasedSku, 2);
  assert.equal(result.releasedDigital, 4);
});

test("missing or malformed release counts are not guessed as zero", () => {
  const missing = normalizeOrderExpirationRpcResult({ ok: true, code: "ALREADY_EXPIRED" }, "request-3");
  const malformed = normalizeOrderExpirationRpcResult({
    ok: true,
    code: "EXPIRED",
    release: { released_digital: "not-a-count" },
    released_digital: 9,
  }, "request-4");

  assert.equal(missing.releasedNormal, undefined);
  assert.equal(missing.releasedSku, undefined);
  assert.equal(missing.releasedDigital, undefined);
  assert.equal(malformed.releasedDigital, undefined);
});
