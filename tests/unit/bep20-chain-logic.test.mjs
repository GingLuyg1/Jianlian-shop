import test from "node:test";
import assert from "node:assert/strict";

import {
  checkTokenDecimalsWithRpc,
  createSharedAsyncCheck,
  createBep20CompletionInput,
  decideBep20TransferStatus,
  normalizeBep20TxHash,
  shouldPrefillBep20TxHash,
  validateTokenDecimalsResult,
  validateFrozenSettlement,
} from "../../lib/payments/bep20-chain-logic.mjs";

test("69 CNY uses frozen 9.583334 USDT completion amount", () => {
  const input = createBep20CompletionInput("9.583334", `0x${"ab".repeat(32)}`, 0);
  assert.equal(input.amount, "9.583334");
  assert.equal(input.currency, "USDT");
  assert.notEqual(input.amount, "69");
  assert.notEqual(input.currency, "CNY");
});

test("transfer one second before expiry can complete after confirmations", () => {
  assert.equal(decideBep20TransferStatus({
    rawAmount: "9583334",
    expectedRawAmount: "9583334",
    confirmations: 12,
    requiredConfirmations: 12,
    transferTimestamp: "2026-07-08T11:59:59.000Z",
    sessionExpiresAt: "2026-07-08T12:00:00.000Z",
    exchangeRateExpiresAt: "2026-07-08T12:00:00.000Z",
  }), "verified");
});

test("transfer one second after expiry requires manual review", () => {
  assert.equal(decideBep20TransferStatus({
    rawAmount: "9583334",
    expectedRawAmount: "9583334",
    confirmations: 12,
    requiredConfirmations: 12,
    transferTimestamp: "2026-07-08T12:00:01.000Z",
    sessionExpiresAt: "2026-07-08T12:00:00.000Z",
    exchangeRateExpiresAt: "2026-07-08T12:00:00.000Z",
  }), "manual_review");
});

test("pre-expiry transfer remains confirming until enough confirmations", () => {
  assert.equal(decideBep20TransferStatus({
    rawAmount: "9583334",
    expectedRawAmount: "9583334",
    confirmations: 3,
    requiredConfirmations: 12,
    transferTimestamp: "2026-07-08T11:59:59.000Z",
    sessionExpiresAt: "2026-07-08T12:00:00.000Z",
    exchangeRateExpiresAt: "2026-07-08T12:00:00.000Z",
  }), "confirming");
});

test("underpaid transfer never reaches verified", () => {
  assert.equal(decideBep20TransferStatus({
    rawAmount: "9583333",
    expectedRawAmount: "9583334",
    confirmations: 12,
    requiredConfirmations: 12,
    transferTimestamp: "2026-07-08T11:59:59.000Z",
    sessionExpiresAt: "2026-07-08T12:00:00.000Z",
    exchangeRateExpiresAt: "2026-07-08T12:00:00.000Z",
  }), "underpaid");
});

test("same transfer advances from confirming only after required confirmations", () => {
  const input = {
    rawAmount: "9583334",
    expectedRawAmount: "9583334",
    requiredConfirmations: 12,
    transferTimestamp: "2026-07-08T11:59:59.000Z",
    sessionExpiresAt: "2026-07-08T12:00:00.000Z",
    exchangeRateExpiresAt: "2026-07-08T12:00:00.000Z",
  };
  assert.equal(decideBep20TransferStatus({ ...input, confirmations: 11 }), "confirming");
  assert.equal(decideBep20TransferStatus({ ...input, confirmations: 12 }), "verified");
});

test("mock decimals RPC accepts matching result", () => {
  assert.equal(validateTokenDecimalsResult(`0x${BigInt(18).toString(16).padStart(64, "0")}`, 18), true);
});

test("mock decimals RPC rejects mismatch and malformed response", () => {
  assert.throws(() => validateTokenDecimalsResult("0x06", 18), /EVM_UINT256_INVALID/);
  assert.throws(() => validateTokenDecimalsResult("0x12", 18), /EVM_UINT256_INVALID/);
  assert.equal(validateTokenDecimalsResult(`0x${BigInt(37).toString(16).padStart(64, "0")}`, 18), false);
  assert.throws(() => validateTokenDecimalsResult(`0x${"0".repeat(64)}00`, 18), /EVM_UINT256_INVALID/);
  assert.throws(() => validateTokenDecimalsResult(`0x${"z".repeat(64)}`, 18), /EVM_UINT256_INVALID/);
  assert.throws(() => validateTokenDecimalsResult(null, 18), /EVM_UINT256_INVALID/);
});

test("mock RPC decimals check handles match, mismatch and failure", async () => {
  const matchingRpc = async () => `0x${BigInt(18).toString(16).padStart(64, "0")}`;
  const mismatchRpc = async () => `0x${BigInt(6).toString(16).padStart(64, "0")}`;
  const failedRpc = async () => { throw new Error("RPC unavailable"); };
  assert.equal(await checkTokenDecimalsWithRpc(matchingRpc, `0x${"11".repeat(20)}`, 18), true);
  assert.equal(await checkTokenDecimalsWithRpc(mismatchRpc, `0x${"11".repeat(20)}`, 18), false);
  await assert.rejects(() => checkTokenDecimalsWithRpc(failedRpc, `0x${"11".repeat(20)}`, 18), /RPC unavailable/);
});

test("ten concurrent decimals checks share one in-flight operation", async () => {
  const shared = createSharedAsyncCheck();
  let calls = 0;
  const operation = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return true;
  };
  const results = await Promise.all(Array.from({ length: 10 }, () => shared("bsc-usdt-18", operation)));
  assert.deepEqual(results, Array(10).fill(true));
  assert.equal(calls, 1);
});

test("frozen settlement separates CNY order value from USDT channel amount", () => {
  const matched = validateFrozenSettlement({
    orderAmount: "69", orderCurrency: "CNY",
    payableAmount: "9.583334", sessionCurrency: "USDT",
    paidAmount: "9.583334", paidCurrency: "USDT",
  });
  assert.deepEqual(matched, { ok: true, reason: "matched" });
  assert.deepEqual(validateFrozenSettlement({
    payableAmount: "9.583334", sessionCurrency: "USDT", paidAmount: "9.5", paidCurrency: "USDT",
  }), { ok: false, reason: "underpaid" });
  assert.deepEqual(validateFrozenSettlement({
    payableAmount: "9.583334", sessionCurrency: "USDT", paidAmount: "9.583334", paidCurrency: "CNY",
  }), { ok: false, reason: "currency_mismatch" });
  assert.deepEqual(validateFrozenSettlement({
    payableAmount: "69", sessionCurrency: "CNY", paidAmount: "69.000000", paidCurrency: "CNY",
  }), { ok: true, reason: "matched" });
});

test("BEP20 TxHash normalization accepts valid case and whitespace variants", () => {
  const lower = `0x${"ab".repeat(32)}`;
  const upper = `0x${"AB".repeat(32)}`;

  assert.equal(normalizeBep20TxHash(lower), lower);
  assert.equal(normalizeBep20TxHash(upper), lower);
  assert.equal(normalizeBep20TxHash(`  ${upper}  `), lower);
});

test("BEP20 TxHash normalization rejects malformed input", () => {
  assert.throws(() => normalizeBep20TxHash(""), /TX_HASH_INVALID/);
  assert.throws(() => normalizeBep20TxHash(`${"ab".repeat(32)}`), /TX_HASH_INVALID/);
  assert.throws(() => normalizeBep20TxHash(`0x${"ab".repeat(31)}`), /TX_HASH_INVALID/);
  assert.throws(() => normalizeBep20TxHash(`0x${"ab".repeat(33)}`), /TX_HASH_INVALID/);
  assert.throws(() => normalizeBep20TxHash(`0x${"gh".repeat(32)}`), /TX_HASH_INVALID/);
});

test("BEP20 failed retryable TxHash is not prefilled on resume", () => {
  const txHash = `0x${"ab".repeat(32)}`;
  assert.equal(shouldPrefillBep20TxHash({
    status: "submitted",
    submittedTxHash: txHash,
    failureReason: "transaction not found",
  }), false);
});

test("BEP20 active confirmed states keep submitted TxHash on resume", () => {
  const txHash = `0x${"ab".repeat(32)}`;
  for (const status of ["confirming", "verified", "completing", "payment_failed", "manual_review", "paid"]) {
    assert.equal(shouldPrefillBep20TxHash({
      status,
      submittedTxHash: txHash,
      failureReason: null,
    }), true);
  }
});

test("BEP20 new session without TxHash starts with an empty input", () => {
  assert.equal(shouldPrefillBep20TxHash({
    status: "waiting_payment",
    submittedTxHash: null,
    failureReason: null,
  }), false);
});
