import assert from "node:assert/strict";
import test from "node:test";

import {
  callbackObservationRecord,
  createCallbackObservation,
  getCallbackRequestId,
} from "../../lib/payments/callback-observability.mjs";

const headers = (values = {}) => ({ get: (name) => values[name.toLowerCase()] ?? null });

test("callback request id prefers a safe ingress request id and rejects unsafe values", () => {
  assert.equal(getCallbackRequestId(headers({ "x-request-id": "nginx-request-123" })), "nginx-request-123");
  const generated = getCallbackRequestId(headers({ "x-request-id": "secret?sign=do-not-copy" }));
  assert.match(generated, /^[0-9a-f-]{36}$/);
  assert.doesNotMatch(generated, /secret|sign/i);
});

for (const scenario of [
  { name: "valid callback", signatureResult: "success", processResult: "success", httpStatus: 200 },
  { name: "invalid signature", signatureResult: "failed", processResult: "signature_failed", httpStatus: 400 },
  { name: "duplicate callback", signatureResult: "success", processResult: "duplicate", httpStatus: 200 },
  { name: "parse failure", signatureResult: "success", processResult: "processing_failed", httpStatus: 400 },
]) {
  test(`${scenario.name} has a request id and a secret-free structured record`, () => {
    const observation = createCallbackObservation({
      headers: headers(),
      channel: "wechat",
      receivedAt: "2026-09-17T00:00:00.000Z",
    });
    const record = callbackObservationRecord(observation, {
      provider: "liuhaoyi",
      sessionNo: scenario.name === "parse failure" ? null : "PS_SAFE_1",
      signatureResult: scenario.signatureResult,
      processResult: scenario.processResult,
      httpStatus: scenario.httpStatus,
    });
    assert.ok(record.requestId);
    assert.deepEqual(Object.keys(record), [
      "requestId", "provider", "channel", "sessionNo", "receivedAt",
      "signatureResult", "processResult", "httpStatus",
    ]);
    assert.doesNotMatch(JSON.stringify(record), /merchant|secret|sign=|providerTransactionId|token/i);
  });
}
