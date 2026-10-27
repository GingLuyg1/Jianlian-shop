import test from "node:test";
import { fileURLToPath } from "node:url";
import { createMemoryMockBackend } from "../../scripts/support/bitrefill-mock-store.mjs";
import { runMockHttpCases } from "../support/bitrefill-mock-http-cases.mjs";
test("Mock HTTP checkout to actual payment/delivery orchestration, CAS, private cards, refund and explicit multi-child mapping", async () => {
  await runMockHttpCases({ backend: createMemoryMockBackend(), root: fileURLToPath(new URL("../../", import.meta.url)) });
});
