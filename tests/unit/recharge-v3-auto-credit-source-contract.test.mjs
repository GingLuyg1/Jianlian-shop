import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20260815120000_account_recharge_bep20_auto_credit_v3.sql",
  "utf8",
);
const scanner = fs.readFileSync("lib/recharges/bep20-recharge-scanner.ts", "utf8");
const route = fs.readFileSync("app/api/internal/recharges/bep20/scan/route.ts", "utf8");

function functionBody(name, nextMarker) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = nextMarker ? migration.indexOf(nextMarker, start) : migration.length;
  assert.ok(end > start, `${name} body boundary must exist`);
  return migration.slice(start, end);
}

const creditHelper = functionBody(
  "credit_auto_matched_account_recharge_bep20_v3",
  "create or replace function public.match_and_credit_account_recharge_bep20_v3",
);
const atomicWrapper = functionBody("match_and_credit_account_recharge_bep20_v3", "commit;");

test("Phase 3 migration is transactional and exposes only service-role functions", () => {
  assert.match(migration, /^begin;$/m);
  assert.match(migration, /^commit;$/m);
  const compactMigration = migration.replace(/\s+/g, "");
  for (const [name, signature] of [
    ["credit_auto_matched_account_recharge_bep20_v3", "uuid,text"],
    [
      "match_and_credit_account_recharge_bep20_v3",
      "integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer",
    ],
  ]) {
    const body = functionBody(name, name.startsWith("credit_")
      ? "create or replace function public.match_and_credit_account_recharge_bep20_v3"
      : "commit;");
    assert.match(body, /language plpgsql/);
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = pg_catalog, public/);
    assert.match(body, /auth\.role\(\) <> 'service_role'/);
    assert.match(
      compactMigration,
      new RegExp(`revokeallonfunctionpublic\\.${name}\\(${signature}\\)frompublic,anon,authenticated;`),
    );
    assert.match(
      compactMigration,
      new RegExp(`grantexecuteonfunctionpublic\\.${name}\\(${signature}\\)toservice_role;`),
    );
  }
});

test("auto-credit requires an exact amount-fingerprint claim and global ownership", () => {
  assert.match(creditHelper, /target_recharge\.match_method is distinct from 'amount_fingerprint'/);
  assert.match(creditHelper, /target_recharge\.matched_at is null/);
  assert.match(creditHelper, /target_recharge\.actual_received_usdt is distinct from target_recharge\.expected_usdt_amount/);
  assert.match(creditHelper, /from public\.account_recharge_chain_claims[\s\S]*?for update/);
  assert.match(creditHelper, /target_claim\.actual_received_usdt is distinct from target_recharge\.expected_usdt_amount/);
  assert.match(creditHelper, /target_claim\.tx_hash is distinct from normalized_hash/);
  assert.match(creditHelper, /target_claim\.token_contract[\s\S]*?target_recharge\.payment_token_contract/);
  assert.match(creditHelper, /target_claim\.to_address[\s\S]*?target_recharge\.payment_address/);
  assert.match(creditHelper, /from public\.bep20_transaction_usage_registry[\s\S]*?for update/);
  assert.match(creditHelper, /target_usage\.usage_type is distinct from 'account_recharge'/);
  assert.match(creditHelper, /target_usage\.business_id is distinct from target_recharge\.id/);
});

test("auto-credit uses exact requested CNY and locks both recharge and profile", () => {
  assert.match(creditHelper, /from public\.account_recharges[\s\S]*?for update/);
  assert.match(creditHelper, /credited_cny := target_recharge\.requested_cny_amount/);
  assert.doesNotMatch(creditHelper, /actual_received_usdt\s*\*|\*\s*target_recharge\.locked_settlement_rate/);
  assert.match(creditHelper, /from public\.profiles[\s\S]*?for update/);
  assert.match(creditHelper, /after_balance := before_balance \+ credited_cny/);
  assert.match(creditHelper, /insert into public\.balance_transactions/);
  assert.match(creditHelper, /'credit',\s*credited_cny/);
  assert.match(creditHelper, /'credit_policy', 'requested_cny_exact'/);
  assert.match(creditHelper, /'match_method', 'amount_fingerprint'/);
  assert.match(creditHelper, /credited_cny_amount = credited_cny/);
  assert.match(creditHelper, /credited_amount = credited_cny/);
  assert.match(creditHelper, /received_amount = credited_cny/);
  assert.match(creditHelper, /status = 'paid'/);
});

test("completed ledger replay is idempotent and mismatches fail closed", () => {
  assert.match(creditHelper, /business_type = 'account_recharge'/);
  assert.match(creditHelper, /business_id = target_recharge\.recharge_no/);
  assert.match(creditHelper, /status = 'completed'[\s\S]*?for update/);
  assert.match(creditHelper, /existing_transaction\.amount is distinct from credited_cny/);
  assert.match(creditHelper, /existing_transaction\.direction is distinct from 'credit'/);
  assert.match(creditHelper, /existing account recharge credit is inconsistent/);
  assert.match(creditHelper, /'credited', false,[\s\S]*?'alreadyCredited', true/);
  const existingBranch = creditHelper.slice(
    creditHelper.indexOf("if found then", creditHelper.indexOf("existing_transaction")),
    creditHelper.indexOf("if target_recharge.status", creditHelper.indexOf("existing_transaction")),
  );
  assert.doesNotMatch(existingBranch, /update public\.profiles|insert into public\.balance_transactions/);
});

test("atomic wrapper credits only matched results and propagates credit failures", () => {
  const v2Call = atomicWrapper.indexOf("public.match_account_recharge_bep20_fingerprint_v2(");
  const creditCallAfterV2 = atomicWrapper.indexOf("public.credit_auto_matched_account_recharge_bep20_v3(", v2Call);
  assert.ok(v2Call >= 0);
  assert.ok(creditCallAfterV2 > v2Call);
  assert.match(atomicWrapper, /if match_kind in \('matched', 'already_matched'\) then/);
  for (const result of [
    "unmatched",
    "ambiguous_order_payment",
    "tx_conflict",
    "terminal_recharge",
    "invalid_window",
  ]) {
    assert.match(atomicWrapper, new RegExp(`'${result}'`));
  }
  assert.match(atomicWrapper, /return match_result \|\| jsonb_build_object\([\s\S]*?'credited', false,[\s\S]*?'alreadyCredited', false/);
  assert.doesNotMatch(atomicWrapper, /\bexception\s+when\b/i);
});

test("same-claim paid replay validates immutable evidence and bypasses V2", () => {
  const existingClaimRead = atomicWrapper.indexOf("from public.account_recharge_chain_claims");
  const v2Call = atomicWrapper.indexOf("public.match_account_recharge_bep20_fingerprint_v2(");
  assert.ok(existingClaimRead >= 0 && existingClaimRead < v2Call);
  const replayBranch = atomicWrapper.slice(existingClaimRead, v2Call);
  const helperCall = replayBranch.indexOf("public.credit_auto_matched_account_recharge_bep20_v3(");
  const lockedClaimRead = replayBranch.indexOf("for update;");
  assert.ok(helperCall >= 0 && lockedClaimRead > helperCall);
  assert.doesNotMatch(replayBranch.slice(0, helperCall), /for update;/);
  assert.match(replayBranch, /if not found then[\s\S]*?claim disappeared during replay/);
  for (const evidence of [
    "log_index",
    "block_number",
    "block_hash",
    "block_timestamp",
    "token_contract",
    "from_address",
    "to_address",
    "raw_amount",
    "actual_received_usdt",
    "confirmation_count",
  ]) {
    assert.match(replayBranch, new RegExp(`existing_claim\\.${evidence}`));
  }
  assert.match(replayBranch, /existing account recharge claim evidence mismatch/);
  assert.match(replayBranch, /'result', 'already_matched'/);
  assert.match(replayBranch, /credit_auto_matched_account_recharge_bep20_v3/);
});

test("scanner POST uses one atomic V3 RPC and exposes credit counters", () => {
  const scanFunction = scanner.slice(
    scanner.indexOf("export async function scanRechargeBep20Transfers"),
    scanner.indexOf("async function loadConfig"),
  );
  assert.match(scanFunction, /service\.rpc\("match_and_credit_account_recharge_bep20_v3"/);
  assert.doesNotMatch(scanFunction, /match_account_recharge_bep20_fingerprint_v2|complete_account_recharge/);
  assert.equal((scanFunction.match(/service\.rpc\(/g) ?? []).length, 1);
  assert.match(scanFunction, /if \(options\.dryRun\) continue;[\s\S]*?service\.rpc/);
  assert.match(scanFunction, /RECHARGE_SCANNER_MATCH_UNCERTAIN[\s\S]*?account_recharge_bep20_scan_state/);
  assert.match(scanner, /credited: number/);
  assert.match(scanner, /alreadyCredited: number/);
  assert.match(scanner, /if \(match\.credited\) counters\.credited \+= 1/);
  assert.match(scanner, /if \(match\.alreadyCredited\) counters\.alreadyCredited \+= 1/);
  assert.match(scanner, /RECHARGE_SCANNER_CREDIT_RESULT_INVALID/);
  assert.match(route, /GET[\s\S]*dryRun: true/);
  assert.match(route, /POST[\s\S]*dryRun: false/);
});
