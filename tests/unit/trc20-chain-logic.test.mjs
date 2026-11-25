import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TRC20_TRANSFER_TOPIC,
  TRON_MAINNET_CHAIN_ID,
  TRON_REQUIRED_CONFIRMATIONS,
  TRON_USDT_CONTRACT,
  TRON_USDT_DECIMALS,
  formatRawTokenAmount,
  isValidTronAddress,
  normalizeTronTxHash,
  tronBase58ToHex41,
  tronHexToBase58,
  tronTopicToBase58,
  verifyTrc20TransferReceipt,
} from "../../lib/payments/trc20-chain-logic.mjs";
import { compareRechargeDecimals } from "../../lib/payments/recharge-rate.mjs";
import { isManualPaymentReady } from "../../lib/payments/manual-channel-readiness.mjs";

const USER_RECIPIENT = "TL4aGps8PX8khNXZwm7wCx4YAbmdu6qgBU";
const SENDER_ADDRESS = "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL";
const OTHER_RECIPIENT = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const SAMPLE_TX_HASH = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

function addressToTopic(base58Address) {
  const hex41 = tronBase58ToHex41(base58Address);
  assert.ok(hex41, `invalid test address ${base58Address}`);
  return hex41.slice(2).padStart(64, "0");
}

function buildValidReceipt({
  txHash = SAMPLE_TX_HASH,
  contract = TRON_USDT_CONTRACT,
  from = SENDER_ADDRESS,
  to = USER_RECIPIENT,
  rawAmount = 14_925_400n, // 14.9254 USDT (6 decimals)
  blockNumber = 68_000_100,
  nowBlockNumber = 68_000_120, // 21 confirmations
  contractRet = "SUCCESS",
  receiptResult = "SUCCESS",
  use40ByteLogAddress = true,
} = {}) {
  const contractHex41 = tronBase58ToHex41(contract);
  const logAddress = use40ByteLogAddress ? contractHex41.slice(2) : contractHex41;
  return {
    txHash,
    tx: {
      txID: txHash,
      ret: [{ contractRet }],
    },
    txInfo: {
      id: txHash,
      blockNumber,
      blockTimeStamp: Date.parse("2026-11-25T15:00:00.000Z"),
      receipt: { result: receiptResult },
      log: [
        {
          address: logAddress,
          topics: [
            TRC20_TRANSFER_TOPIC,
            addressToTopic(from),
            addressToTopic(to),
          ],
          data: rawAmount.toString(16).padStart(64, "0"),
        },
      ],
    },
    nowBlockNumber,
    expectedContract: TRON_USDT_CONTRACT,
    expectedRecipient: USER_RECIPIENT,
  };
}

test("Base58Check <-> Hex41 round-trip validates real USDT contract and user TRON address", () => {
  const usdtHex = tronBase58ToHex41(TRON_USDT_CONTRACT);
  assert.equal(usdtHex, "41a614f803b6fd780986a42c78ec9c7f77e6ded13c");
  assert.equal(tronHexToBase58(usdtHex), TRON_USDT_CONTRACT);
  assert.equal(tronHexToBase58(usdtHex.slice(2)), TRON_USDT_CONTRACT);

  const userHex = tronBase58ToHex41(USER_RECIPIENT);
  assert.ok(userHex && /^41[0-9a-f]{40}$/.test(userHex));
  assert.equal(tronHexToBase58(userHex), USER_RECIPIENT);
  assert.equal(tronTopicToBase58(addressToTopic(USER_RECIPIENT)), USER_RECIPIENT);

  assert.equal(isValidTronAddress(USER_RECIPIENT), true);
  assert.equal(isValidTronAddress(TRON_USDT_CONTRACT), true);
  // Corrupted last checksum character must be rejected
  assert.equal(isValidTronAddress("TL4aGps8PX8khNXZwm7wCx4YAbmdu6qgBV"), false);
  // Case flip must fail Base58Check
  assert.equal(isValidTronAddress(USER_RECIPIENT.toLowerCase()), false);
  // EVM address must be rejected
  assert.equal(isValidTronAddress("0x55d398326f99059ff775485246999027b3197955"), false);
});

test("normalizeTronTxHash strictly accepts 64-hex TRON hashes and rejects 0x-prefixed BSC hashes", () => {
  assert.equal(normalizeTronTxHash(SAMPLE_TX_HASH.toUpperCase()), SAMPLE_TX_HASH);
  assert.equal(normalizeTronTxHash(`  ${SAMPLE_TX_HASH}  `), SAMPLE_TX_HASH);
  assert.equal(normalizeTronTxHash(`0x${SAMPLE_TX_HASH}`), null);
  assert.equal(normalizeTronTxHash("abc123"), null);
  assert.equal(normalizeTronTxHash(""), null);
});

test("formatRawTokenAmount formats 6-decimal TRC20 USDT values accurately without floating point", () => {
  assert.equal(formatRawTokenAmount(14_925_400n, TRON_USDT_DECIMALS), "14.9254");
  assert.equal(formatRawTokenAmount(1_000_000n, TRON_USDT_DECIMALS), "1");
  assert.equal(formatRawTokenAmount(1n, TRON_USDT_DECIMALS), "0.000001");
  assert.equal(formatRawTokenAmount(0n, TRON_USDT_DECIMALS), "0");
  assert.equal(compareRechargeDecimals(formatRawTokenAmount(14_925_400n, 6), "14.9254"), 0);
});

test("verifyTrc20TransferReceipt succeeds on valid 6-decimal USDT transfer with >= 19 confirmations", () => {
  const result = verifyTrc20TransferReceipt(buildValidReceipt());
  assert.equal(result.ok, true);
  assert.equal(result.evidence.chainId, TRON_MAINNET_CHAIN_ID);
  assert.equal(result.evidence.txHash, SAMPLE_TX_HASH);
  assert.equal(result.evidence.tokenContract, TRON_USDT_CONTRACT);
  assert.equal(result.evidence.fromAddress, SENDER_ADDRESS);
  assert.equal(result.evidence.toAddress, USER_RECIPIENT);
  assert.equal(result.evidence.rawAmount, "14925400");
  assert.equal(result.evidence.actualReceivedUsdt, "14.9254");
  assert.equal(result.evidence.confirmationCount, 21);
  assert.equal(result.evidence.blockNumber, "68000100");
  assert.equal(result.evidence.blockTimestamp, "2026-11-25T15:00:00.000Z");

  // Also verify 42-char "41..." log.address format works identically
  const result42 = verifyTrc20TransferReceipt(buildValidReceipt({ use40ByteLogAddress: false }));
  assert.equal(result42.ok, true);
  assert.equal(result42.evidence.actualReceivedUsdt, "14.9254");
});

test("verifyTrc20TransferReceipt rejects insufficient confirmations, wrong contract, wrong recipient, and failed tx", () => {
  // 18 confirmations (< 19)
  const underConfirmed = verifyTrc20TransferReceipt(
    buildValidReceipt({ blockNumber: 68_000_100, nowBlockNumber: 68_000_117 }),
  );
  assert.equal(underConfirmed.ok, false);
  assert.equal(underConfirmed.code, "TRC20_CONFIRMATIONS_INSUFFICIENT");
  assert.equal(underConfirmed.confirmationCount, 18);
  assert.equal(TRON_REQUIRED_CONFIRMATIONS, 19);

  // Wrong contract (fake USDT)
  const wrongContract = verifyTrc20TransferReceipt(
    buildValidReceipt({ contract: OTHER_RECIPIENT }),
  );
  assert.equal(wrongContract.ok, false);
  assert.equal(wrongContract.code, "TRC20_TRANSFER_NOT_FOUND");

  // Wrong recipient
  const wrongRecipient = verifyTrc20TransferReceipt(
    buildValidReceipt({ to: OTHER_RECIPIENT }),
  );
  assert.equal(wrongRecipient.ok, false);
  assert.equal(wrongRecipient.code, "TRC20_TRANSFER_NOT_FOUND");

  // Failed contract execution (OUT_OF_ENERGY / REVERT)
  const failedReceipt = verifyTrc20TransferReceipt(
    buildValidReceipt({ receiptResult: "OUT_OF_ENERGY" }),
  );
  assert.equal(failedReceipt.ok, false);
  assert.equal(failedReceipt.code, "TRC20_RECEIPT_FAILED");

  const failedContractRet = verifyTrc20TransferReceipt(
    buildValidReceipt({ contractRet: "REVERT" }),
  );
  assert.equal(failedContractRet.ok, false);
  assert.equal(failedContractRet.code, "TRC20_TX_FAILED");

  // 0x-prefixed BSC TxHash rejected immediately
  const bscHash = verifyTrc20TransferReceipt(
    buildValidReceipt({ txHash: `0x${SAMPLE_TX_HASH}` }),
  );
  assert.equal(bscHash.ok, false);
  assert.equal(bscHash.code, "TRC20_TX_HASH_INVALID");
});

test("manual-channel-readiness requires tokenContract for both usdt_bep20 and usdt_trc20", () => {
  assert.equal(
    isManualPaymentReady({
      channel: "usdt_trc20",
      reviewMode: "manual",
      paymentAddress: USER_RECIPIENT,
      tokenContract: "",
      paymentInstructions: "TRON TRC20 only",
    }),
    false,
  );
  assert.equal(
    isManualPaymentReady({
      channel: "usdt_trc20",
      reviewMode: "manual",
      paymentAddress: USER_RECIPIENT,
      tokenContract: TRON_USDT_CONTRACT,
      paymentInstructions: "TRON TRC20 only",
    }),
    true,
  );
});

test("TRC20 candidate migration enforces security boundaries and does not auto-enable usdt_trc20", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20261125233000_usdt_trc20_closed_loop.sql", import.meta.url),
    "utf8",
  );
  const verifyRoute = readFileSync(
    new URL("../../app/api/recharges/[rechargeNo]/trc20/verify/route.ts", import.meta.url),
    "utf8",
  );
  const rechargePage = readFileSync(
    new URL("../../components/account/AccountRechargeContent.tsx", import.meta.url),
    "utf8",
  );
  const paymentPage = readFileSync(
    new URL("../../app/payment/page.tsx", import.meta.url),
    "utf8",
  );

  // Migration security & safety invariants
  assert.match(migration, /set local lock_timeout = '5s'/i);
  assert.match(migration, /set local statement_timeout = '60s'/i);
  assert.match(migration, /create or replace function public\.reserve_account_recharge_usdt_fingerprint_v3/i);
  assert.match(migration, /create or replace function public\.claim_account_recharge_trc20_transfer/i);
  assert.match(migration, /create or replace function public\.complete_account_recharge_usdt_cny_v1/i);
  assert.match(migration, /p_confirmation_count < 19/i);
  assert.match(migration, /revoke all on function public\.claim_account_recharge_trc20_transfer[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.claim_account_recharge_trc20_transfer[\s\S]*to service_role/i);
  assert.match(migration, /revoke all on function public\.complete_account_recharge_usdt_cny_v1\(uuid,text\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /TL4aGps8PX8khNXZwm7wCx4YAbmdu6qgBU/);
  assert.match(migration, /TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t/);
  // Must NOT auto-enable usdt_trc20 in migration
  assert.doesNotMatch(migration, /\benabled\s*=\s*true\b/i);

  // Verify route invokes both atomic claim + canonical completion
  assert.match(verifyRoute, /inspectAccountRechargeTrc20Transfer/);
  assert.match(verifyRoute, /compareRechargeDecimals\(evidence\.actualReceivedUsdt, expectedUsdtAmount\) !== 0/);
  assert.match(verifyRoute, /claim_account_recharge_trc20_transfer/);
  assert.match(verifyRoute, /complete_account_recharge_usdt_cny_v1/);

  // UI wires usdt_trc20 card and TRC20 payment view
  assert.match(rechargePage, /code:\s*"usdt_trc20"/);
  assert.match(rechargePage, /\/assets\/usdt-trc20-icon\.jpg/);
  assert.match(paymentPage, /\/trc20\/verify/);
  assert.match(paymentPage, /TRON Network \(TRC20\)/);
});
