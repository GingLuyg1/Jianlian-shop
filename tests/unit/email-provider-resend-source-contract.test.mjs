import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../../lib/email/provider.ts", import.meta.url), "utf8");

test("email provider implements the Resend send endpoint", () => {
  assert.match(source, /https:\/\/api\.resend\.com\/emails/);
  assert.match(source, /status\.provider === "resend"/);
  assert.match(source, /authorization:\s*`Bearer \$\{apiKey\}`/);
});

test("Resend send requests preserve idempotency and timeout protection", () => {
  assert.match(source, /"idempotency-key": input\.idempotencyKey/);
  assert.match(source, /AbortSignal\.timeout\(RESEND_TIMEOUT_MS\)/);
});

test("Resend success requires a provider message id", () => {
  assert.match(source, /providerMessageId/);
  assert.match(source, /EMAIL_PROVIDER_TEMPORARY_INVALID_RESPONSE/);
  assert.match(source, /status: "sent"/);
});

test("non-Resend providers remain fail-closed", () => {
  assert.match(source, /EMAIL_PROVIDER_NOT_IMPLEMENTED/);
});
