import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = (path) => readFileSync(join(root, path), "utf8");

test("admin payment channel settings synchronize compatibility and runtime fields", () => {
  const route = file("app/api/admin/payment-channels/route.ts");
  const panel = file("components/admin/payments/PaymentSettingsPanel.tsx");
  const types = file("lib/payments/admin-payment-types.ts");

  assert.match(
    route,
    /channelSelect[\s\S]*\bcode\b[\s\S]*\bminimum_amount\b[\s\S]*\bprovider\b[\s\S]*\bpublic_config\b[\s\S]*\bconfigured\b/,
  );

  for (const field of [
    "code",
    "minimum_amount",
    "provider",
    "configured",
    "public_config",
  ]) {
    assert.match(route, new RegExp(`\\b${field}\\b`));
  }

  for (const field of [
    "review_mode",
    "maximum_amount",
    "payment_address",
    "token_contract",
    "payment_instructions",
  ]) {
    assert.match(route, new RegExp(`\\b${field}\\b`));
    assert.match(panel, new RegExp(`\\b${field}\\b`));
  }

  assert.match(types, /review_mode:\s*"provider"\s*\|\s*"manual"/);
  assert.match(types, /maximum_amount:\s*number/);
  assert.match(types, /payment_address:\s*string\s*\|\s*null/);
  assert.match(types, /token_contract:\s*string\s*\|\s*null/);
  assert.match(types, /payment_instructions:\s*string\s*\|\s*null/);

  assert.doesNotMatch(
    route,
    /return\s+NextResponse\.json\([\s\S]{0,500}\bsecret_config\b/,
  );
  assert.match(route, /resolvePaymentChannelState/);
  assert.match(route, /providerTrustedConfigured:\s*false/);
  assert.match(route, /PAYMENT_CHANNEL_CONFLICT_STATUS/);
  assert.match(route, /hasMatchingPaymentChannelVersion/);
  assert.match(route, /parseSinglePaymentChannelPatchPayload/);
  assert.match(route, /\.update\(row\)/);
  assert.match(route, /\.eq\("updated_at",\s*patch\.updated_at/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.match(panel, /selectPaymentChannelForSave/);
  assert.match(panel, /canSavePaymentSettings/);
  assert.match(panel, /updated_at:\s*channel\.updated_at/);
  assert.match(panel, /saveChannel\(channel\.channel\)/);
  assert.match(panel, /mergeSavedPaymentChannel/);
  assert.match(panel, /createPaymentChannelNumericDrafts/);
  assert.match(panel, /buildPaymentChannelNumericPatch/);
  assert.match(panel, /mergeSavedPaymentChannelNumericDrafts/);
  assert.doesNotMatch(panel, /Number\(\s*event\.target\.value/);
  assert.doesNotMatch(panel, /parse(?:Float|Int)\(\s*event\.target\.value/);
  assert.match(route, /getLegacyPaymentChannelCompatibility/);
  assert.match(route, /buildLegacyPaymentChannelCompatibilitySync/);
  assert.match(route, /parseSinglePaymentChannelPatchPayload/);
  assert.match(route, /resolvePaymentChannelFinancialValues/);
  assert.match(route, /action\s*===\s*"sync_compatibility"/);
  assert.match(route, /configured:\s*false/);
  assert.match(route, /enabled:\s*false/);
  assert.doesNotMatch(
    panel,
    /channels:\s*channels\.map\(/,
  );
});

test("public recharge creation validates amount before payment-channel queries", () => {
  const route = file("app/api/recharges/route.ts");
  const parserCall = route.indexOf("parsePublicRechargeAmount(body.amount, 6)");
  const channelQuery = route.indexOf('.from("payment_channels")');

  assert.ok(parserCall >= 0);
  assert.ok(channelQuery > parserCall);
  assert.doesNotMatch(route, /Number\(body\.amount\)|parseFloat\(body\.amount\)|parseInt\(body\.amount\)/);
  assert.match(route, /code:\s*"RECHARGE_AMOUNT_INVALID"/);
  assert.doesNotMatch(
    route.match(/rawAmount === null[\s\S]{0,300}/)?.[0] ?? "",
    /message|details|hint/i,
  );
});

test("recharge credit uses the complete runtime RPC parser and unknown reconciliation", () => {
  const workflow = file("lib/recharges/review-workflow.mjs");
  const service = file("lib/recharges/review-service.ts");

  assert.match(workflow, /export function parseRechargeCreditRpcResult/);
  assert.match(workflow, /typeof value\.alreadyCompleted !== "boolean"/);
  assert.match(workflow, /typeof value\.rechargeNo !== "string"/);
  assert.match(workflow, /typeof value\.transactionNo !== "string"/);
  assert.match(workflow, /parsed\.kind !== "success"/);
  assert.match(service, /classifyUnknownRechargeCreditOutcome\(latest\.status\)/);
  assert.doesNotMatch(service, /outcome\.result as RechargeCreditRpcResult/);
});

test("manual recharge public channel exposes only safe payment instructions", () => {
  const channelTypes = file("lib/payments/channel-types.ts");
  const rechargeUtils = file("lib/payments/recharge-utils.ts");
  const channelsRoute = file("app/api/recharges/channels/route.ts");
  const accountPage = file("components/account/AccountRechargeContent.tsx");

  assert.match(channelTypes, /manualPayment/);
  assert.match(rechargeUtils, /manualPayment/);

  for (const field of [
    "payment_address",
    "token_contract",
    "payment_instructions",
  ]) {
    assert.match(rechargeUtils, new RegExp(`\\b${field}\\b`));
  }

  assert.match(accountPage, /manualPayment/);
  assert.match(accountPage, /付款地址|收款地址/);
  assert.match(accountPage, /代币合约|Token 合约/);
  assert.match(accountPage, /付款说明/);

  assert.doesNotMatch(channelsRoute, /\bsecret_config\b/);
  assert.doesNotMatch(accountPage, /\bsecret_config\b/);
  assert.match(
    channelsRoute,
    /\.eq\("configured",\s*true\)/,
  );
  assert.match(
    rechargeUtils,
    /getSafePublicManualPayment/,
  );
  const rechargeRoute = file("app/api/recharges/route.ts");
  assert.match(
    rechargeRoute,
    /isRechargeChannelAvailable\(channel\)/,
  );
  assert.match(rechargeRoute, /paymentChannelMatchesRequest/);
  const whitelistIndex = rechargeRoute.indexOf(
    "isKnownPaymentChannelCode(channelCode)",
  );
  const channelQueryIndex = rechargeRoute.indexOf(
    ".or(`code.eq.${channelCode},channel.eq.${channelCode}`)",
  );
  assert.ok(whitelistIndex >= 0);
  assert.ok(channelQueryIndex > whitelistIndex);
  assert.match(rechargeUtils, /getCanonicalPaymentChannelCode/);
  assert.match(channelsRoute, /getSafePublicPaymentChannelError/);
  assert.match(channelsRoute, /getSafePublicPaymentChannelLog/);
  assert.doesNotMatch(
    channelsRoute,
    /console\.error\([\s\S]{0,300},\s*error\s*[,)]/,
  );
  assert.doesNotMatch(
    channelsRoute,
    /getPaymentErrorMessage\(error/,
  );
});

test("recharge review uses exact CAS, durable intent and safe post-credit reconciliation", () => {
  const reviewService = file("lib/recharges/review-service.ts");
  const workflow = file("lib/recharges/review-workflow.mjs");
  const actionRoute = file(
    "app/api/admin/recharges/[rechargeId]/actions/route.ts",
  );
  const adapter = file("lib/recharges/review-adapter.mjs");
  const uiDecision = file("lib/recharges/review-ui-state.mjs");
  const adminPage = file("components/admin/payments/AdminPaymentRecordsPage.tsx");
  const adminRechargeListRoute = file("app/api/admin/recharges/route.ts");
  const statusMachine = file("lib/recharges/status-machine.ts");
  const rechargeRoute = file("app/api/recharges/route.ts");

  assert.doesNotMatch(
    reviewService,
    /if\s*\(error\)\s*console\.error\("\[RechargeReview\] event write failed"/,
  );

  assert.match(
    reviewService,
    /(?:status|recharge\.status)[\s\S]{0,300}"paid"[\s\S]{0,500}"succeeded"/,
  );

  assert.match(reviewService, /completed_at/);
  assert.match(reviewService, /recharge_review_events/);
  assert.match(reviewService, /complete_account_recharge/);
  assert.match(reviewService, /executeAuditedRechargeTransition/);
  assert.match(reviewService, /executeRechargeCreditAttempt/);
  assert.match(reviewService, /executeRechargeWriteCas/);
  assert.match(adapter, /return \{ kind: "uncertain", row: await readLatest\(\) \}/);
  assert.doesNotMatch(adapter, /executeWrite\(\)[\s\S]{0,120}executeWrite\(\)/);
  assert.doesNotMatch(reviewService, /\.in\("status"/);
  assert.doesNotMatch(reviewService, /Record<string,\s*any>/);
  assert.doesNotMatch(
    reviewService,
    /status:\s*"approved"[\s\S]{0,300}\.eq\("status",\s*"processing"\)/,
  );

  const repairStart = reviewService.indexOf(
    "async function repairPaidCompletion",
  );
  const repairEnd = reviewService.indexOf(
    "async function resolveTransitionResult",
  );
  const repair = reviewService.slice(repairStart, repairEnd);
  assert.ok(repairStart >= 0 && repairEnd > repairStart);
  assert.ok(
    repair.indexOf("updateRechargeExact") < repair.indexOf("writeCompleted"),
    "paid -> succeeded CAS must happen before credit_succeeded event",
  );
  assert.match(reviewService, /\.eq\("status", expectedStatus\)/);

  assert.match(workflow, /approve:[\s\S]*?from: \["reviewing"\]/);
  assert.match(workflow, /retry_credit:[\s\S]*?from: \["approved", "failed"\]/);
  assert.match(workflow, /intent_audit_failed/);
  assert.match(workflow, /completion_audit_failed/);
  assert.match(workflow, /kind: "uncertain_succeeded"/);
  assert.match(
    workflow,
    /repaired\?\.kind === "uncertain"[\s\S]{0,180}uncertain_succeeded/,
  );
  assert.match(
    reviewService,
    /if \(result\.kind === "uncertain_succeeded"\) \{\s*throw new RechargeReviewUncertainOutcomeError\("succeeded"\);\s*\}/,
  );
  assert.match(workflow, /return reconcileOutcome\(\{ kind: "unknown"/);
  assert.match(reviewService, /\.eq\("request_id", row\.request_id\)/);
  assert.match(reviewService, /\.contains\("metadata", \{ phase \}\)/);
  assert.match(
    reviewService,
    /event_deduplication: "best_effort_no_unique_constraint"/,
  );

  assert.match(actionRoute, /classifyRechargeReviewError/);
  assert.match(actionRoute, /requiresManualReconciliation/);
  assert.match(actionRoute, /outcome/);
  assert.match(actionRoute, /idempotent/);
  assert.match(actionRoute, /safeMessage/);
  assert.match(uiDecision, /manual_reconciliation/);
  assert.match(adminPage, /reconciliationRequired/);
  assert.match(adminPage, /诊断编号：\{lastDiagnosticRequestId \|\| "未返回"\}/);
  assert.match(adminPage, /禁止重复操作/);
  assert.match(adminPage, /全部充值/);
  assert.match(adminPage, /人工审核/);
  assert.match(adminPage, /isRechargePage && selected\.source === "account_recharges" \? <RechargeReviewPanel[\s\S]*?embedded/);
  assert.match(adminPage, /!isRechargePage && selected\.source === "account_recharges" \? <RechargeReviewPanel/);
  assert.match(adminPage, /embedded \? "rounded-xl border bg-white p-4"/);
  assert.doesNotMatch(adminPage, /function RechargeReviewOverlay/);
  assert.match(adminRechargeListRoute, /searchParams\.get\("view"\) === "review"/);
  assert.match(adminRechargeListRoute, /ACTIVE_REVIEW_STATUSES = new Set\(\["submitted", "reviewing", "approved", "failed"\]\)/);
  assert.match(adminRechargeListRoute, /COMPLETED_RECHARGE_STATUSES = new Set\(\["paid", "succeeded"\]\)/);
  assert.match(adminRechargeListRoute, /hasText\(row\.exception_type\) \|\| hasText\(row\.error_summary\)/);
  assert.match(adminRechargeListRoute, /\["pending", "waiting_payment"\]\.includes\(status\)\) return hasExceptionEvidence/);
  assert.match(adminRechargeListRoute, /row\.review_mode[\s\S]*?=== "manual"/);
  assert.match(adminRechargeListRoute, /isClosedWithoutAdminAction/);
  assert.match(adminRechargeListRoute, /select\(adminRechargeSelect\)/);
  assert.match(adminRechargeListRoute, /sourceRows\.filter\(requiresRechargeAdminAttention\)/);
  assert.match(adminPage, /actionInFlightRef\.current/);
  for (const action of ["approve", "reject", "cancel", "retry_credit"]) {
    assert.match(adminPage, new RegExp(`${action}: ".+"`));
  }
  assert.match(adminPage, /if \(confirmations\[name\] && !window\.confirm\(confirmations\[name\]\)\) return/);
  assert.match(adminPage, /needsReason \? window\.prompt/);
  assert.match(adminPage, /decision\.reconciliationRequired \|\| decision\.kind === "manual_reconciliation"/);
  assert.match(adminPage, /role="alert"/);
  assert.match(adminPage, /诊断编号：\{lastDiagnosticRequestId \|\| "未返回"\}/);
  assert.doesNotMatch(
    actionRoute,
    /error instanceof Error \? error\.message/,
  );
  assert.doesNotMatch(
    actionRoute,
    /(?:details|hint|internal database text)/i,
  );
  assert.match(statusMachine, /export function parseRechargeStatusStrict/);
  assert.match(statusMachine, /if \(!status\) return null/);
  assert.doesNotMatch(
    statusMachine.slice(
      statusMachine.indexOf("export function parseRechargeStatusStrict"),
      statusMachine.indexOf("export function normalizeRechargeStatus"),
    ),
    /return "pending"/,
  );
  assert.match(reviewService, /parseRechargeStatusStrict\(row\.status\) === null/);
  const listChannelValidation = rechargeRoute.indexOf(
    'channel !== "all" && !isKnownPaymentChannelCode(channel)',
  );
  const listChannelOr = rechargeRoute.indexOf(
    'query.or(`channel_code.eq.${channel},channel.eq.${channel}`)',
  );
  assert.ok(listChannelValidation >= 0);
  assert.ok(listChannelOr > listChannelValidation);
});

test("admin recharge V3 presentation keeps CNY and USDT evidence distinct", () => {
  const types = file("lib/payments/admin-payment-types.ts");
  const queries = file("lib/payments/admin-payment-queries.ts");
  const adminPage = file("components/admin/payments/AdminPaymentRecordsPage.tsx");
  const detailRoute = file("app/api/admin/recharges/[rechargeId]/route.ts");

  for (const field of [
    "requested_cny_amount",
    "expected_usdt_amount",
    "actual_received_usdt",
    "credited_cny_amount",
    "settlement_currency",
    "review_mode",
  ]) {
    assert.match(types, new RegExp(`${field}\\?: string \\| null`));
    assert.match(queries, new RegExp(`\\b${field}\\b`));
  }

  assert.match(queries, /requestedCnyAmount = decimalStringOrNull\(row\.requested_cny_amount\)/);
  assert.match(queries, /expectedUsdtAmount = decimalStringOrNull\(row\.expected_usdt_amount\)/);
  assert.match(queries, /actualReceivedUsdt = decimalStringOrNull\(row\.actual_received_usdt\)/);
  assert.match(queries, /creditedCnyAmount = decimalStringOrNull\(row\.credited_cny_amount\)/);
  assert.match(queries, /businessAmount = numberValue\(requestedCnyAmount \?\? row\.requested_amount \?\? row\.amount\)/);
  assert.match(queries, /payableAmount = numberValue\(row\.payable_amount \?\? businessAmount \+ feeAmount\)/);
  assert.match(queries, /receivedAmount = numberValue\(row\.credited_amount \?\? row\.received_amount\)/);

  assert.match(adminPage, /formatStoredDecimal\(payment\.requested_cny_amount, "CNY"\)/);
  assert.match(adminPage, /formatStoredDecimal\(payment\.expected_usdt_amount, "USDT"\)/);
  assert.match(adminPage, /formatStoredDecimal\(payment\.actual_received_usdt, "USDT"\)/);
  assert.match(adminPage, /formatStoredDecimal\(payment\.credited_cny_amount, "CNY"\)/);
  assert.match(adminPage, /formatPaymentMoney\(payment\.business_amount, payment\.business_currency\)/);
  assert.match(adminPage, /formatPaymentMoney\(payment\.payable_amount, payment\.payable_currency\)/);
  assert.match(adminPage, /payment\.received_amount > 0[\s\S]*?formatPaymentMoney\(payment\.received_amount, payment\.received_currency\)/);
  const v3Formatters = adminPage.slice(adminPage.indexOf("function isV3Recharge"), adminPage.indexOf("function formatDate"));
  assert.doesNotMatch(v3Formatters, /expected_usdt_amount[\s\S]*?[*/+-]/);

  for (const field of [
    "requested_cny_amount",
    "expected_usdt_amount",
    "actual_received_usdt",
    "credited_cny_amount",
    "settlement_currency",
    "locked_market_rate",
    "locked_settlement_rate",
    "rate_effective_date",
    "expires_at",
  ]) {
    assert.match(detailRoute, new RegExp(`\\b${field}\\b`));
  }

  assert.match(adminPage, /events\.map\(\(event: any, index: number\)/);
  for (const field of ["created_at", "actor_type", "action", "from_status", "to_status", "reason", "request_id"]) {
    assert.match(adminPage, new RegExp(`event\\.${field}`));
  }
  assert.match(adminPage, /暂无审核记录/);
  assert.doesNotMatch(adminPage, /event\.metadata/);
  for (const field of ["review_mode", "review_reason", "exception_type", "error_summary"]) {
    assert.match(adminPage, new RegExp(`recharge\\?\\.${field}`));
  }
  assert.match(adminPage, /decision\.reconciliationRequired \|\| decision\.kind === "manual_reconciliation"/);
  assert.match(adminPage, /!isRechargePage[\s\S]*?全部支付[\s\S]*?异常支付[\s\S]*?欠额转余额[\s\S]*?对账记录/);
});
