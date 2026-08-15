import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20260814183000_account_recharge_bep20_auto_match_v2.sql",
  "utf8",
);
const scanner = fs.readFileSync("lib/recharges/bep20-recharge-scanner.ts", "utf8");
const route = fs.readFileSync("app/api/internal/recharges/bep20/scan/route.ts", "utf8");

test("V2 scanner discovers only confirmed USDT Transfers to the configured recharge address", () => {
  assert.match(scanner, /eth_getLogs/);
  assert.match(scanner, /topics: \[TRANSFER_TOPIC, null, toTopic\]/);
  assert.match(scanner, /eth_chainId/);
  assert.match(scanner, /0x313ce567/);
  assert.match(scanner, /requiredConfirmations/);
});

test("malformed or inconsistent RPC log evidence fails closed before database matching", () => {
  assert.match(scanner, /topics\.length !== 3/);
  assert.match(scanner, /topics\[0\][\s\S]*TRANSFER_TOPIC/);
  assert.match(scanner, /logIndexValue > BigInt\(2_147_483_647\)/);
  assert.match(scanner, /returnedBlockNumber !== blockNumber \|\| returnedBlockHash !== blockHash/);
  assert.match(scanner, /BSC_BLOCK_EVIDENCE_MISMATCH/);
  assert.match(migration, /normalized_block_hash !~ '\^0x\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /p_chain_id is distinct from 56/);
  assert.match(migration, /p_log_index is null/);
});

test("V2 database match claims evidence but never credits CNY automatically", () => {
  assert.match(migration, /match_account_recharge_bep20_fingerprint_v2/);
  assert.match(migration, /bep20_transaction_usage_registry/);
  assert.match(migration, /account_recharge_chain_claims/);
  assert.match(migration, /status = 'submitted'/);
  assert.doesNotMatch(migration, /update\s+public\.profiles/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.balance_transactions/i);
  assert.doesNotMatch(migration, /complete_account_recharge_usdt_cny_v1\s*\(/i);
});

test("shared order/recharge address collisions fail closed to manual reconciliation", () => {
  assert.match(migration, /chain_payment_sessions/);
  assert.match(migration, /ambiguous_order_payment/);
  assert.match(migration, /BEP20_SHARED_ADDRESS_AMOUNT_AMBIGUOUS/);
});

test("scanner does not advance a chunk cursor after uncertain matching", () => {
  const uncertainIndex = scanner.indexOf("RECHARGE_SCANNER_MATCH_UNCERTAIN");
  const cursorIndex = scanner.indexOf('from("account_recharge_bep20_scan_state")', uncertainIndex);
  assert.ok(uncertainIndex > -1);
  assert.ok(cursorIndex > uncertainIndex);
  assert.match(scanner, /Replaying the chunk is safe because the database claim is idempotent/);
});

test("GET is dry-run only and POST is the write-capable internal scan", () => {
  assert.match(route, /GET[\s\S]*dryRun: true/);
  assert.match(route, /POST[\s\S]*dryRun: false/);
  assert.match(route, /assertRechargeBep20ScannerAuthorized/);
});
