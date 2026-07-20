import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
function file(path) {
  return readFileSync(join(root, path), "utf8");
}

function listRuntimeSourceFiles(dir) {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  const entries = readdirSync(absolute);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(absolute, entry);
    const relativePath = `${dir}/${entry}`.replace(/\\/g, "/");
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listRuntimeSourceFiles(relativePath));
      continue;
    }
    if (/\.(ts|tsx|js|mjs)$/.test(entry)) files.push(relativePath);
  }
  return files;
}

test("public account surfaces share the responsive viewport panel height", () => {
  const sharedLayout = file("components/layout/public-content.ts");
  const accountShell = file("components/account/AccountShell.tsx");
  const promotionPage = file("app/promotion/page.tsx");
  const productPage = file("app/products/[id]/page.tsx");

  assert.match(sharedLayout, /md:h-\[calc\(100dvh-87px\)\]/);
  assert.doesNotMatch(sharedLayout, /h-\[(?:775|970|974)px\]/);
  for (const source of [accountShell, promotionPage, productPage]) {
    assert.match(source, /publicMainPanelHeightClassName/);
  }
  assert.match(accountShell, /md:overflow-y-auto/);
  assert.match(accountShell, /matchMedia\("\(min-width: 768px\)"\)/);
  assert.doesNotMatch(productPage, /<PublicLayout\s+viewportLocked/);
  assert.match(productPage, /data-testid="product-detail-shell"/);
  assert.doesNotMatch(productPage, /data-testid="product-detail-shell"[\s\S]{0,180}md:overflow-hidden/);
  assert.match(productPage, /data-testid="product-detail-grid"[\s\S]*publicMainPanelHeightClassName/);
  assert.match(productPage, /data-testid="product-detail-left"[\s\S]*md:h-full md:overflow-x-hidden md:overflow-y-auto/);
  assert.match(productPage, /data-testid="product-detail-purchase-card"[\s\S]*md:h-full md:max-h-full/);
  assert.doesNotMatch(productPage, /flex-1[\s\S]{0,120}publicMainPanelHeightClassName/);
});

test("visible-bound measurement intersects every clipping ancestor", () => {
  const helper = file("tests/e2e/visible-bounds.ts");

  assert.match(helper, /getBoundingClientRect\(\)/);
  assert.match(helper, /CLIPPING_OVERFLOW_VALUES/);
  assert.match(helper, /style\.overflowY/);
  assert.match(helper, /Math\.max\(visibleTop, ancestorRect\.top\)/);
  assert.match(helper, /Math\.min\(visibleBottom, ancestorRect\.bottom\)/);
  assert.match(helper, /hiddenBottom: Math\.max\(0, rect\.bottom - visibleBottom\)/);
  assert.match(helper, /clippingAncestor/);
});

test("user order drawer owns viewport scrolling without changing payment behavior", () => {
  const ordersPage = file("app/account/orders/page.tsx");
  const paymentSummary = file("components/account/orders/Bep20OrderPaymentSummary.tsx");

  assert.match(ordersPage, /data-testid="order-detail-drawer"[\s\S]*absolute inset-y-0 right-0[\s\S]*h-dvh max-h-dvh[\s\S]*min-w-0[\s\S]*overflow-hidden/);
  assert.match(ordersPage, /data-testid="order-detail-drawer-scroll"[\s\S]*min-h-0 min-w-0 flex-1[\s\S]*overflow-x-hidden overflow-y-auto overscroll-contain/);
  assert.match(ordersPage, /\[&>\*\]:min-w-0 \[&>\*\]:max-w-full/);
  assert.match(paymentSummary, /min-w-0 max-w-full overflow-hidden/);
  assert.match(ordersPage, /document\.body\.style\.overflow = "hidden"/);
  assert.match(ordersPage, /document\.documentElement\.style\.overflow = "hidden"/);
  assert.match(ordersPage, /<Bep20OrderPaymentSummary order=\{order\} compact \/>/);
});

test("account overview omits internal identity and unfinished-order summary cards", () => {
  const accountOverview = file("app/account/page.tsx");

  for (const removedLabel of ["显示名称", "账户角色", "余额来源", "未完成订单"]) {
    assert.doesNotMatch(accountOverview, new RegExp(`label=["']${removedLabel}["']`));
  }
  assert.match(accountOverview, /label="登录邮箱"/);
  assert.match(accountOverview, /label="当前余额"/);
  assert.match(accountOverview, /href="\/account\/orders"/);
});

test("runtime source files do not contain common mojibake sequences", () => {
  const files = [
    ...listRuntimeSourceFiles("app"),
    ...listRuntimeSourceFiles("lib"),
    ...listRuntimeSourceFiles("components"),
  ];
  const mojibakePattern = /鑷|閾|璁|缂|鏀|澶辫触|鈧|锟|鐠|閺|娴|閻/;
  const failures = [];

  for (const sourceFile of files) {
    const lines = file(sourceFile).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (mojibakePattern.test(line)) failures.push(`${sourceFile}:${index + 1}: ${line.trim()}`);
    });
  }

  assert.deepEqual(failures, []);
});

test("order API whitelists input and does not accept frontend price fields", () => {
  const source = file("app/api/orders/route.ts");
  assert.match(source, /ORDER_CREATE_ALLOWED_KEYS/);
  assert.match(source, /client_request_id/);
  assert.match(source, /create_order_with_item/);
  const allowedKeysBlock = source.match(/const ORDER_CREATE_ALLOWED_KEYS = new Set\(\[[\s\S]*?\]\);/)?.[0] ?? "";
  assert.ok(allowedKeysBlock, "ORDER_CREATE_ALLOWED_KEYS block should be present");
  assert.doesNotMatch(allowedKeysBlock, /price/i);
  assert.doesNotMatch(allowedKeysBlock, /total_amount/i);
});

test("order creation stays behind the hardened RPC and does not require direct orders writes", () => {
  const checkout = file("app/checkout/page.tsx");
  const route = file("app/api/orders/route.ts");
  const migration = file("supabase/migrations/20260714_order_creation_rls_rpc_hardening.sql");
  const verification = file("docs/order-creation-rls-rpc-verification.sql");

  assert.match(checkout, /fetch\("\/api\/orders"/);
  assert.doesNotMatch(checkout, /\.from\(["']orders["']\)/);
  assert.match(route, /supabase\.rpc\("create_order_with_item", orderPayload\)/);
  assert.doesNotMatch(route, /\.from\("orders"\)\s*\.insert\(/);
  assert.doesNotMatch(route, /\.from\("orders"\)\s*\.update\(\{\s*payment_method:/);
  assert.match(
    route,
    /\.from\("orders"\)\s*\.select\("id,order_no,status,payment_status,total_amount,payment_method"\)/
  );

  assert.match(
    migration,
    /alter function public\.create_order_with_item\(\s*uuid, integer, text, text, text, text, jsonb, uuid, text, text\s*\) owner to postgres/i
  );
  assert.match(migration, /\) security definer;/i);
  assert.match(migration, /\) set search_path to public;/i);
  assert.match(migration, /create_order_with_item must derive user ownership from auth\.uid\(\)/i);
  assert.match(migration, /must not accept a client-supplied user id/i);
  assert.match(migration, /unexpected create_order_with_item return type/i);
  assert.match(migration, /public\.orders RLS must remain enabled/i);
  assert.match(migration, /from public, anon, authenticated, service_role/i);
  assert.match(migration, /to authenticated, service_role/i);
  assert.match(
    migration,
    /drop policy if exists "users can create own orders"\s+on public\.orders/i
  );
  assert.match(migration, /p\.cmd = 'INSERT'/i);
  assert.match(migration, /'public' = any\(p\.roles\)/i);
  assert.match(migration, /'authenticated' = any\(p\.roles\)/i);
  assert.match(migration, /direct authenticated order INSERT\/ALL policy still exists/i);
  assert.doesNotMatch(migration, /drop policy if exists "users can read own orders"/i);
  assert.doesNotMatch(migration, /drop policy if exists "users can cancel own pending orders"/i);
  assert.doesNotMatch(migration, /drop policy if exists "admins can manage orders"/i);
  assert.doesNotMatch(migration, /create or replace function public\.create_order_with_item/i);
  assert.doesNotMatch(migration, /disable row level security/i);
  assert.doesNotMatch(migration, /create policy[\s\S]*for insert/i);
  assert.doesNotMatch(migration, /insert into public\.orders|update public\.orders|delete from public\.orders/i);

  assert.match(verification, /c\.relrowsecurity as rls_enabled/i);
  assert.match(verification, /c\.relforcerowsecurity as force_rls_enabled/i);
  assert.match(verification, /ordinary_user_insert_policy_count/i);
  assert.match(verification, /admin_is_admin_all_policy_count/i);
  assert.match(verification, /unexpected_authenticated_insert_or_all_policy_count/i);
  assert.match(verification, /authenticated_direct_insert_blocked_by_rls/i);
  assert.match(verification, /normalized_qual in \('is_admin', 'public\.is_admin'\)/i);
  assert.match(verification, /normalized_with_check in \('is_admin', 'public\.is_admin'\)/i);
  const statementsUsingClassifiedPolicies = verification
    .split(";")
    .filter((statement) => /\bclassified_policies\b/i.test(statement));
  assert.ok(statementsUsingClassifiedPolicies.length > 0, "verification must classify order policies");
  for (const statement of statementsUsingClassifiedPolicies) {
    assert.match(
      statement,
      /with\s+classified_policies\s+as\s*\([\s\S]*?\)\s*select[\s\S]*?join\s+classified_policies\s+as\s+p/i,
      "each statement referencing classified_policies must define the CTE in the same statement"
    );
  }
  assert.match(verification, /p\.prosecdef as security_definer/i);
  assert.match(verification, /function_owner/i);
  assert.match(verification, /authenticated_can_execute/i);
  assert.match(verification, /service_role_can_execute/i);
  assert.match(verification, /anon_can_execute/i);
  assert.match(verification, /public_cannot_execute/i);
  assert.match(verification, /derives_user_from_auth_uid/i);
  assert.match(verification, /rejects_client_user_id_parameter/i);
  assert.doesNotMatch(verification, /insert\s+into|update\s+public\.|delete\s+from/i);
});

test("order creation RPC recalculates product and SKU amounts server-side", () => {
  const migration = file("supabase/migrations/20260629_direct_purchase_order_idempotency.sql");
  assert.match(migration, /p_client_request_id/);
  assert.match(migration, /orders_user_client_request_uidx/i);
  assert.match(migration, /where user_id = v_user_id\s+and client_request_id = v_request_id/i);
  assert.match(migration, /return query[\s\S]*v_existing_order\.total_amount/i);
  assert.match(migration, /where s\.id = p_sku_id/i);
  assert.match(migration, /v_unit_price := coalesce\(v_sku\.price, 0\)::numeric/i);
  assert.match(migration, /v_line_total := round\(\(v_unit_price \* v_quantity\)::numeric, 2\)/i);
});

test("payment callbacks use provider verification and complete-payment service, not browser paid input", () => {
  const route = file("app/api/payments/callback/[channel]/route.ts");
  const service = file("lib/payments/payment-callback-service.ts");
  assert.match(route, /handlePaymentCallback/);
  assert.match(service, /verifyCallback/);
  assert.match(service, /parseCallback/);
  assert.match(service, /completePayment\(/);
  assert.doesNotMatch(route, /request\.json\(\)/);
});

test("payment provider placeholders must not simulate success or fake payment artifacts", () => {
  const providers = file("lib/payments/providers.ts");
  assert.match(providers, /PROVIDER_NOT_CONFIGURED|渠道尚未配置|未配置/);
  assert.doesNotMatch(providers, /fake|mock-success|simulate.*success|假二维码|假地址/i);
});

test("BEP20 chain payment verifies Transfer logs and does not store private keys", () => {
  const service = file("lib/payments/bep20-chain-service.ts");
  const migration = file("supabase/migrations/20260704_bep20_chain_payment_phase1.sql");
  const sessionRoute = file("app/api/payments/bep20/session/route.ts");
  const verifyRoute = file("app/api/payments/bep20/verify/route.ts");

  assert.match(service, /BSC_RPC_URL/);
  assert.match(service, /BSC_RECEIVE_ADDRESS/);
  assert.match(service, /eth_getTransactionReceipt/);
  assert.match(service, /eth_chainId/);
  assert.match(service, /TRANSFER_TOPIC/);
  assert.match(service, /topicToAddress/);
  assert.match(service, /completePayment\(/);
  assert.doesNotMatch(service, /private.?key|seed phrase|mnemonic|NEXT_PUBLIC_.*BSC/i);

  assert.match(migration, /chain_payment_sessions/);
  assert.match(migration, /chain_transactions/);
  assert.match(migration, /unique index if not exists chain_transactions_unique_log/i);
  assert.match(migration, /chain_id, tx_hash, log_index/i);
  assert.match(migration, /Deny direct chain payment session writes/);
  assert.match(migration, /service_role/);

  assert.match(sessionRoute, /createBep20PaymentSession|getBep20PaymentSession/);
  assert.match(verifyRoute, /verifyBep20TxHash/);
  assert.match(verifyRoute, /payment_session_create/);
});

test("BEP20 pricing snapshots freeze CNY to USDT amount server-side", () => {
  const service = file("lib/payments/bep20-chain-service.ts");
  const migration = file("supabase/migrations/20260704_bep20_chain_payment_phase1.sql");
  const paymentPage = file("app/payment/page.tsx");

  for (const envName of ["USDT_PRICING_MODE", "CNY_USDT_FIXED_RATE", "CNY_USDT_RATE_TTL_SECONDS", "USDT_AMOUNT_SCALE"]) {
    assert.match(service, new RegExp(envName));
  }
  for (const column of [
    "order_currency",
    "order_amount",
    "payment_currency",
    "exchange_rate",
    "exchange_rate_source",
    "exchange_rate_fetched_at",
    "exchange_rate_expires_at",
    "pricing_status",
  ]) {
    assert.match(migration, new RegExp(column));
  }

  assert.match(service, /manual_fixed_rate/);
  assert.match(service, /provider_rate/);
  assert.match(service, /USDT_RATE_PROVIDER_NOT_CONFIGURED/);
  assert.match(service, /ceilDiv/);
  assert.match(service, /decimalToScaled/);
  assert.match(service, /expectedRawAmount/);
  assert.match(service, /currency: "USDT"/);
  assert.match(service, /if \(existing\) return toBep20SessionResponse/);
  assert.match(service, /ORDER_AMOUNT_INVALID/);
  assert.match(service, /CNY_USDT_FIXED_RATE_INVALID/);
  assert.match(service, /exchangeRateExpiresAt/);
  assert.match(paymentPage, /orderAmount/);
  assert.match(paymentPage, /exchangeRate/);
  assert.match(paymentPage, /LocalAddressQr/);
  assert.match(paymentPage, /createErrorCorrection/);
  assert.match(paymentPage, /createFormatBits/);
  assert.match(paymentPage, /applyFormatBits/);
  assert.match(paymentPage, /scoreQrMatrix/);
  assert.match(paymentPage, /new TextEncoder\(\)\.encode/);
  assert.doesNotMatch(paymentPage, /api\.qrserver\.com|create-qr-code/);
});

test("BEP20 configuration self-check exposes statuses without secret values", () => {
  const service = file("lib/payments/bep20-chain-service.ts");
  const readiness = file("app/api/admin/payments/readiness/route.ts");

  for (const envName of [
    "BSC_RPC_URL",
    "BSC_CHAIN_ID",
    "BSC_USDT_CONTRACT",
    "BSC_USDT_DECIMALS",
    "BSC_RECEIVE_ADDRESS",
    "BSC_REQUIRED_CONFIRMATIONS",
    "BSC_PAYMENT_EXPIRE_MINUTES",
    "USDT_PRICING_MODE",
    "CNY_USDT_FIXED_RATE",
    "CNY_USDT_RATE_TTL_SECONDS",
    "USDT_AMOUNT_SCALE",
  ]) {
    assert.match(service, new RegExp(envName));
  }

  assert.match(service, /status: "missing"/);
  assert.match(service, /status: validator\(normalized\).*"configured".*"invalid"/s);
  assert.match(service, /value === "56"/);
  assert.match(service, /normalizeAddress/);
  assert.doesNotMatch(service, /providerRateAvailable/);
  assert.match(readiness, /getBep20RuntimeConfigStatus/);
  assert.match(readiness, /bep20Config/);
  assert.doesNotMatch(readiness, /BSC_RPC_URL\s*:/);
});

test("BEP20 completion uses frozen USDT amount and recoverable completion state", () => {
  const service = file("lib/payments/bep20-chain-service.ts");
  const completion = file("lib/payments/complete-payment-service.ts");
  const logic = file("lib/payments/bep20-chain-logic.mjs");

  assert.match(service, /createBep20CompletionInput\(decimalString\(session\.expected_amount\)/);
  assert.match(service, /amount: completionInput\.amount/);
  assert.match(service, /currency: completionInput\.currency/);
  assert.doesNotMatch(service, /amount: Number\(decimalString\(order\.total_amount\)\)/);
  assert.match(completion, /amount: string \| number/);
  assert.match(logic, /currency: "USDT"/);
  assert.match(service, /prepare_bep20_payment_completion/);
  assert.match(service, /"payment_failed"/);
  assert.match(service, /completion_attempt_id/);
});

test("BEP20 transaction claim is database atomic and never upserts order ownership", () => {
  const service = file("lib/payments/bep20-chain-service.ts");
  const migration = file("supabase/migrations/20260708_bep20_phase1_atomic_hardening.sql");

  assert.match(service, /claim_bep20_chain_transaction/);
  assert.doesNotMatch(service, /\.upsert\(payload, \{ onConflict: "chain_id,tx_hash,log_index" \}\)/);
  assert.match(migration, /primary key \(chain_id, tx_hash\)/i);
  assert.match(migration, /claimed_by_other_order/);
  assert.match(migration, /already_claimed_by_same_order/);
  assert.match(migration, /where id = v_existing\.id and order_id = p_order_id/i);
  assert.doesNotMatch(migration, /set\s+order_id\s*=\s*p_order_id/i);
});

test("BEP20 duplicate TxHash is rejected before a second order can be paid", () => {
  const service = file("lib/payments/bep20-chain-service.ts");
  const route = file("app/api/payments/bep20/verify/route.ts");
  const claimSchemaMigration = file("supabase/migrations/20260708_bep20_phase1_atomic_hardening.sql");
  const migration = file("supabase/migrations/20260708_bep20_phase1_completion_hardening.sql");

  assert.match(claimSchemaMigration, /primary key \(chain_id, tx_hash\)/i);
  assert.match(migration, /on conflict \(chain_id, tx_hash\) do nothing/i);
  assert.match(migration, /if v_claim\.order_id <> p_order_id or v_claim\.chain_payment_session_id <> p_session_id then\s+return jsonb_build_object\('result', 'claimed_by_other_order'\)/i);

  const verificationFlow = service.match(/const claim = await claimChainTransaction[\s\S]*?const patch:/)?.[0] ?? "";
  assert.ok(verificationFlow, "claim must run before the chain session is updated");
  assert.match(verificationFlow, /claim === "claimed_by_other_order"/);
  assert.match(verificationFlow, /Bep20PaymentError\("TX_HASH_USED"[\s\S]*?409\)/);
  assert.doesNotMatch(verificationFlow, /completePayment\(/);
  assert.doesNotMatch(verificationFlow, /status:\s*"paid"/);
  assert.match(route, /const status = typeof \(error as \{ status\?: unknown \}\)\?\.status/);
  assert.match(route, /const code = typeof \(error as \{ code\?: unknown \}\)\?\.code/);
  assert.match(route, /NextResponse\.json\(\{ error: getBep20ErrorMessage\(error\), code \}, \{ status \}\)/);
});

test("BEP20 retryable failures recover without weakening terminal protections", () => {
  const service = file("lib/payments/bep20-chain-service.ts");
  const blockedStatuses = service.match(/const USER_RECOVERY_BLOCKED_STATUSES = \[[^\]]+\]/)?.[0] ?? "";
  const verificationFlow = service.match(/async function verifyBep20TxHashForOrder[\s\S]*?const receipt = await loadReceipt/)?.[0] ?? "";

  assert.ok(blockedStatuses);
  assert.doesNotMatch(blockedStatuses, /"failed"/);
  for (const terminal of ["underpaid", "manual_review", "payment_failed", "completing"]) {
    assert.match(blockedStatuses, new RegExp(`"${terminal}"`));
  }
  assert.doesNotMatch(blockedStatuses, /"expired"/);
  assert.match(verificationFlow, /manual_review_decision === "rejected"/);
  assert.match(verificationFlow, /Bep20PaymentError\("CHAIN_SESSION_REJECTED"[\s\S]*?409\)/);
  assert.ok(
    verificationFlow.indexOf("CHAIN_SESSION_REJECTED") < verificationFlow.indexOf("loadReceipt"),
    "rejected sessions must stop before any receipt lookup or claim"
  );
  assert.match(service, /if \(!receipt\)[\s\S]*?status: expired \? "expired" : "submitted"[\s\S]*?failure_reason:/);
  assert.match(service, /receipt\.status && receipt\.status !== "0x1"[\s\S]*?status: session\.status === "expired" \? "expired" : "submitted"/);
  assert.match(service, /receipt\.status && receipt\.status !== "0x1"[\s\S]*?failure_reason:/);
  assert.match(service, /if \(!transfer\)[\s\S]*?status: session\.status === "expired" \? "expired" : "submitted"/);
  assert.match(service, /if \(!transfer\)[\s\S]*?failure_reason:/);
  assert.match(service, /可重新提交其他 TxHash/);
  assert.match(service, /claim === "claimed_by_other_order"[\s\S]*?"TX_HASH_USED"/);
  assert.match(service, /mutableStatuses = \[[\s\S]*?"failed"/);
});

test("BEP20 underpayment and confirmation thresholds cannot complete early", () => {
  const logic = file("lib/payments/bep20-chain-logic.mjs");
  const service = file("lib/payments/bep20-chain-service.ts");
  const approvalMigration = file("supabase/migrations/20260715_bep20_approved_overpayment_completion.sql");
  const claimMigration = file("supabase/migrations/20260708_bep20_phase1_completion_hardening.sql");

  assert.match(logic, /if \(raw < expected\) return "underpaid"/);
  assert.match(logic, /if \(Number\(input\.confirmations\) < Number\(input\.requiredConfirmations\)\) return "confirming"/);
  assert.match(service, /const effectiveStatus = status === "manual_review" && allowLateApproval \? "verified" : status/);
  assert.match(approvalMigration, /approved manual review cannot complete an underpaid transfer/);
  assert.match(approvalMigration, /p_confirmed_amount < v_session\.expected_amount/);
  assert.match(approvalMigration, /p_confirmed_raw_amount\) < trunc\(v_session\.expected_raw_amount/);
  assert.match(claimMigration, /already_claimed_by_same_order/);
  assert.match(claimMigration, /confirmation_count = p_confirmation_count/);
  assert.match(claimMigration, /status = p_status/);
});

test("BEP20 verification uses block timestamp and contract decimals check", () => {
  const service = file("lib/payments/bep20-chain-service.ts");
  const logic = file("lib/payments/bep20-chain-logic.mjs");

  assert.match(service, /eth_getBlockByNumber/);
  assert.match(service, /blockTimestamp/);
  assert.match(service, /exchangeRateExpiresAt/);
  assert.match(logic, /eth_call/);
  assert.match(logic, /0x313ce567/);
  assert.match(service, /tokenDecimalsCache/);
  assert.match(logic, /transferTime > deadline/);
  assert.match(logic, /validateTokenDecimalsResult/);
});

test("BEP20 payment core keeps order currency separate from channel settlement", () => {
  const migration = file("supabase/migrations/20260708_bep20_phase1_completion_hardening.sql");
  assert.match(migration, /round\(coalesce\(p_paid_amount, 0\), 6\).*v_session\.payable_amount/s);
  assert.match(migration, /p_currency.*v_session\.currency/s);
  assert.match(migration, /v_order\.total_amount/);
  assert.match(migration, /v_order\.currency/);
  assert.match(migration, /received_amount = p_paid_amount/);
  assert.match(migration, /received_currency = upper\(p_currency\)/);
  assert.doesNotMatch(migration, /set\s+total_amount\s*=|set\s+currency\s*=/i);
});

test("BEP20 completion acquisition is atomic and ordinary updates exclude completing and paid", () => {
  const service = file("lib/payments/bep20-chain-service.ts");
  const migration = file("supabase/migrations/20260708_bep20_phase1_completion_hardening.sql");
  assert.match(service, /prepare_bep20_payment_completion/);
  assert.match(service, /finish_bep20_payment_completion/);
  assert.doesNotMatch(service, /begin_bep20_payment_completion/);
  assert.match(service, /mutableStatuses/);
  assert.doesNotMatch(service, /mutableStatuses[\s\S]{0,300}"completing"/);
  assert.doesNotMatch(service, /mutableStatuses[\s\S]{0,300}"paid"/);
  assert.match(migration, /for update/);
  assert.match(migration, /already_completing/);
  assert.match(migration, /already_paid/);
  assert.match(migration, /completion_attempt_id <> p_attempt_id/);
  assert.match(migration, /completion_started_at > now\(\) - interval '5 minutes'/);
});

test("BEP20 reusable session statuses match active database ownership states", () => {
  const service = file("lib/payments/bep20-chain-service.ts");
  const migration = file("supabase/migrations/20260708_bep20_phase1_completion_hardening.sql");
  for (const status of ["payment_failed", "underpaid", "manual_review"]) {
    assert.match(service, new RegExp(`"${status}"`));
    assert.match(migration, new RegExp(`'${status}'`));
  }
});

test("BEP20 admin recovery requires durable audit attempt and supports late payment decisions", () => {
  const service = file("lib/payments/bep20-chain-service.ts");
  const route = file("app/api/admin/payments/[paymentId]/route.ts");
  const page = file("components/admin/payments/AdminPaymentRecordsPage.tsx");
  const migration = file("supabase/migrations/20260708_bep20_phase1_completion_hardening.sql");
  const decisionMigration = file("supabase/migrations/20260708_bep20_phase1_manual_review_decision.sql");
  assert.match(service, /ADMIN_REVIEW_AUDIT_FAILED/);
  assert.match(service, /approveLateBep20PaymentSession/);
  assert.match(service, /rejectLateBep20PaymentSession/);
  assert.match(route, /getServerSuperAdminContext/);
  assert.match(route, /approve_late_payment/);
  assert.match(route, /reject_late_payment/);
  assert.match(page, /const canManageChainPayment = overpaymentWallet\.authorized/);
  assert.match(page, /canManageChainPayment \? <><Button[\s\S]*?approve_late_payment[\s\S]*?reject_late_payment/);
  assert.match(migration, /bep20_admin_review_attempts/);
  assert.match(migration, /result_status = 'processing'/);
  assert.match(migration, /admin review result could not be recorded/);
  assert.match(service, /decide_bep20_manual_review/);
  assert.match(service, /CHAIN_SESSION_ALREADY_REJECTED/);
  assert.match(service, /manual_review_decision === "rejected"/);
  assert.match(service, /manual_review_decision\.is\.null,manual_review_decision\.neq\.rejected/);
  assert.match(decisionMigration, /manual_review_decision text/);
  assert.match(decisionMigration, /manual_review_decision in \('pending', 'approved', 'rejected'\)/);
  assert.match(decisionMigration, /for update/);
  assert.match(decisionMigration, /coalesce\(manual_review_decision, 'pending'\) = 'pending'/);
  assert.match(decisionMigration, /already_rejected/);
  assert.match(decisionMigration, /already_approved/);
  assert.match(decisionMigration, /manual_review_rejected/);
  assert.match(decisionMigration, /coalesce\(v_session\.manual_review_decision, 'pending'\) <> 'approved'/);
  assert.match(decisionMigration, /revoke execute on function public\.decide_bep20_manual_review/);
});

test("BEP20 admin payment UI always shows amount with its own currency", () => {
  const types = file("lib/payments/admin-payment-types.ts");
  const queries = file("lib/payments/admin-payment-queries.ts");
  const page = file("components/admin/payments/AdminPaymentRecordsPage.tsx");

  assert.match(types, /business_currency: string \| null/);
  assert.match(types, /payable_currency: string \| null/);
  assert.match(types, /received_currency: string \| null/);
  assert.match(queries, /order_amount/);
  assert.match(queries, /order_currency/);
  assert.match(queries, /received_currency/);
  assert.match(page, /formatPaymentMoney\(payment\.business_amount, payment\.business_currency\)/);
  assert.match(page, /formatPaymentMoney\(payment\.payable_amount, payment\.payable_currency\)/);
  assert.match(page, /formatPaymentMoney\(payment\.received_amount, payment\.received_currency\)/);
  assert.match(page, /formatPaymentMoney\(detail\.received_amount, detail\.received_currency\)/);
  assert.match(page, /币种缺失/);
  assert.match(page, /\["订单原金额", `\$\{chainPayment\.orderAmount\} \$\{chainPayment\.orderCurrency\}`\]/);
  assert.match(page, /\["应付金额", `\$\{chainPayment\.expectedAmount\} \$\{chainPayment\.paymentCurrency\}`\]/);
  assert.match(page, /\["实际到账", chainPayment\.confirmedAmount \? `\$\{chainPayment\.confirmedAmount\} \$\{chainPayment\.paymentCurrency\}` : "—"\]/);
  assert.doesNotMatch(page, /formatMoney\(payment\.received_amount/);
  assert.doesNotMatch(page, /formatMoney\(detail\.received_amount/);
});

test("BEP20 manual review sessions have durable admin payment linkage", () => {
  const service = file("lib/payments/bep20-chain-service.ts");
  const queries = file("lib/payments/admin-payment-queries.ts");
  const migration = file("supabase/migrations/20260715_bep20_manual_review_payment_linkage.sql");
  const repair = file("supabase/tests/repair_bep20_manual_review_JL202607150716073678.sql");

  assert.match(migration, /add column if not exists payment_session_id uuid/i);
  assert.match(migration, /foreign key \(payment_session_id\) references public\.payment_sessions\(id\)/i);
  assert.match(migration, /foreign key \(payment_id\) references public\.order_payments\(id\)/i);
  assert.match(migration, /insert into public\.order_payments[\s\S]*?cps\.status <> 'paid'/i);
  assert.match(migration, /create trigger trg_sync_bep20_chain_order_payment/i);
  assert.match(migration, /new\.status in \('manual_review', 'underpaid'\) then 'under_review'/i);
  assert.doesNotMatch(migration, /create or replace function public\.(?:complete_payment_session|complete_order_payment|prepare_bep20_payment_completion)/i);

  assert.match(service, /ensureOrderPaymentRecord\(service, order, paymentSession, pricing\)/);
  assert.match(service, /payment_session_id: paymentSession\.id/);
  assert.match(service, /payment_id: orderPaymentId/);
  assert.match(service, /paymentSessionId: session\.payment_session_id/);
  assert.match(service, /completePayment\([\s\S]{0,180}paymentSessionId: session\.payment_session_id/);
  assert.match(service, /\.from\("order_payments"\)[\s\S]{0,600}payment_no: paymentNo/);
  assert.match(service, /payable_currency: pricing\.paymentCurrency/);
  assert.match(queries, /payable_currency/);
  assert.match(queries, /stringOrNull\(row\.payable_currency\) \?\? stringOrNull\(row\.currency\)/);

  assert.match(repair, /v_confirm_test_database boolean := false/);
  assert.match(repair, /JL202607150716073678/);
  assert.match(repair, /87902c08-3f31-4482-a3cf-b80746677cce/);
  assert.match(repair, /status = 'manual_review'/);
  assert.match(repair, /payment_session_id = v_payment_session\.id,[\s\S]{0,100}payment_id = v_order_payment_id/);
  assert.doesNotMatch(repair, /update public\.orders\s+set/i);
  assert.doesNotMatch(repair, /set\s+paid_at\s*=/i);
});

test("BEP20 approved overpayment completion preserves the real received amount", () => {
  const service = file("lib/payments/bep20-chain-service.ts");
  const migration = file("supabase/migrations/20260715_bep20_approved_overpayment_completion.sql");
  const linkage = file("supabase/migrations/20260715_bep20_manual_review_payment_linkage.sql");

  assert.match(migration, /create or replace function public\.prepare_bep20_payment_completion/);
  assert.match(migration, /v_session\.manual_review_decision = 'approved'/);
  assert.match(migration, /p_review_attempt_id is not null/);
  assert.match(migration, /p_confirmed_amount <> v_session\.confirmed_amount/);
  assert.match(migration, /trunc\(p_confirmed_raw_amount\) <> trunc\(v_session\.confirmed_raw_amount\)/);
  assert.match(migration, /p_confirmed_amount < v_session\.expected_amount/);
  assert.match(migration, /approved manual review cannot complete an underpaid transfer/);
  assert.match(migration, /round\(p_confirmed_amount, 6\) <> round\(v_session\.expected_amount, 6\)/);
  assert.match(migration, /confirmed decimal and raw amounts are inconsistent/);
  assert.match(migration, /v_session\.manual_review_decision = 'rejected'/);
  assert.match(migration, /return jsonb_build_object\('result', 'already_paid'\)/);
  assert.doesNotMatch(migration, /p_(?:allow_overpayment|manual_review_approved)\s+boolean/i);
  assert.doesNotMatch(migration, /create or replace function public\.(?:complete_payment_session|complete_order_payment|finish_bep20_payment_completion)/i);

  assert.match(service, /createBep20CompletionInput\(decimalString\(session\.expected_amount\)/);
  assert.match(service, /confirmedAmount: transfer\.normalizedAmount/);
  assert.match(service, /confirmedRawAmount: transfer\.rawAmount\.toString\(\)/);
  assert.doesNotMatch(service, /confirmedAmount:\s*decimalString\(session\.expected_amount\)/);
  assert.match(linkage, /received_amount = coalesce\(new\.confirmed_amount, op\.received_amount\)/);
  assert.match(linkage, /payable_amount = new\.expected_amount/);
  assert.doesNotMatch(linkage, /paid_at\s*=/);
});

test("BEP20 approved overpayment wallet credit is atomic, super-admin-only, and idempotent", () => {
  const migration = file("supabase/migrations/20260715_bep20_overpayment_wallet_credit.sql");
  const repair = file("supabase/tests/credit_bep20_overpayment_JL202607150716073678.sql");
  const api = file("app/api/admin/payments/[paymentId]/overpayment-credit/route.ts");
  const detailRoute = file("app/api/admin/payments/[paymentId]/route.ts");
  const component = file("components/admin/payments/AdminPaymentRecordsPage.tsx");

  assert.match(migration, /create table if not exists public\.bep20_overpayment_dispositions/i);
  assert.match(migration, /chain_session_id uuid primary key/i);
  assert.match(migration, /disposition text not null default 'wallet_credit'/i);
  assert.match(migration, /create or replace function public\.credit_bep20_overpayment_to_wallet/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = public/i);
  assert.match(migration, /not public\.is_super_admin\(v_operator_id\)/i);
  assert.match(migration, /manual_review_decision <> 'approved'/i);
  assert.match(migration, /v_chain\.status <> 'paid'/i);
  assert.match(migration, /v_order\.payment_status <> 'paid'/i);
  assert.match(migration, /v_chain\.confirmed_amount <= v_chain\.expected_amount/i);
  assert.match(migration, /v_overpaid_usdt := v_chain\.confirmed_amount - v_chain\.expected_amount/i);
  assert.match(migration, /v_credited_cny := round\(v_overpaid_usdt \* v_chain\.exchange_rate, 2\)/i);
  assert.match(migration, /select \* into v_profile[\s\S]*?for update/i);
  assert.match(migration, /insert into public\.balance_transactions/i);
  assert.match(migration, /update public\.profiles[\s\S]*?set balance = v_balance_after/i);
  assert.match(migration, /insert into public\.admin_audit_logs/i);
  assert.match(migration, /'result', 'already_processed'/i);
  assert.doesNotMatch(migration, /update public\.order_payments/i);
  assert.doesNotMatch(migration, /update public\.chain_payment_sessions/i);
  assert.match(migration, /revoke all on function public\.credit_bep20_overpayment_to_wallet\(uuid,text,text\)[\s\S]*?from public, anon, service_role/i);
  assert.match(migration, /grant execute on function public\.credit_bep20_overpayment_to_wallet\(uuid,text,text\)[\s\S]*?to authenticated/i);

  assert.match(api, /requireApiSuperAdmin\(\)/);
  assert.match(api, /credit_bep20_overpayment_to_wallet/);
  assert.match(api, /p_payment_id: params\.paymentId/);
  assert.doesNotMatch(api, /\.from\(["']profiles["']\)[\s\S]*?\.update/i);
  assert.match(detailRoute, /bep20_overpayment_dispositions/);
  assert.match(component, /超额转入余额/);
  assert.match(component, /method: "POST"/);
  assert.match(component, /body: JSON\.stringify\(\{ reason \}\)/);

  assert.match(repair, /v_confirm_test_database boolean := false/i);
  assert.match(repair, /JL202607150716073678/);
  assert.match(repair, /credit_bep20_overpayment_to_wallet/i);
  assert.match(repair, /4\.976111 USDT x 7\.2 = 35\.83 CNY/i);
  assert.doesNotMatch(repair, /update\s+public\.profiles|insert\s+into\s+public\.balance_transactions/i);
});

test("payment readiness separates general readiness from BEP20 three-state config", () => {
  const readiness = file("app/api/admin/payments/readiness/route.ts");
  assert.match(readiness, /bep20Config/);
  assert.match(readiness, /generalReadiness:\s*\{/);
  assert.match(readiness, /providerConfigured/);
  assert.match(readiness, /serviceRoleConfigured/);
  assert.doesNotMatch(readiness, /\n\s+providerConfigured,\n\s+serviceRoleConfigured,/);
  assert.doesNotMatch(readiness, /BSC_RPC_URL\s*:/);
  assert.doesNotMatch(readiness, /BSC_RECEIVE_ADDRESS\s*:/);
  assert.doesNotMatch(readiness, /BSC_USDT_CONTRACT\s*:/);
});

test("BEP20 preflight and claim hardening protect prerequisites and ownership", () => {
  const preflight = file("supabase/migrations/20260704_000_bep20_phase1_preflight.sql");
  const migration = file("supabase/migrations/20260708_bep20_phase1_completion_hardening.sql");
  assert.match(preflight, /public\.is_admin/);
  assert.match(preflight, /public\.orders/);
  assert.match(preflight, /public\.payment_sessions/);
  assert.match(preflight, /complete_payment_session/);
  assert.doesNotMatch(preflight, /create table|alter table|insert into|update public|delete from/i);
  assert.match(migration, /order_id = case when order_id is null then p_order_id/);
  assert.match(migration, /token_contract\) <> lower\(p_token_contract/);
  assert.match(migration, /receive_address\) <> lower\(p_to_address/);
  assert.match(migration, /chain_payment_sessions_active_order_unique/);
});

test("BEP20 docs include manual CNY to USDT pricing and real chain test checklist", () => {
  const setup = file("docs/bep20-phase1-setup.md");
  const verification = file("docs/bep20-payment-verification.md");
  for (const expected of [
    "CNY_USDT_FIXED_RATE",
    "USDT_PRICING_MODE",
    "CNY_USDT_RATE_TTL_SECONDS",
    "USDT_AMOUNT_SCALE",
    "创建小额测试订单",
    "提交 TxHash",
  ]) {
    assert.match(setup, new RegExp(expected));
  }
  assert.match(verification, /69 CNY/i);
  assert.match(verification, /underpaid/i);
  assert.match(verification, /overpaid/i);
});

test("admin APIs require server-side admin checks", () => {
  const adminRoutes = [
    "app/api/admin/catalog/products/route.ts",
    "app/api/admin/catalog/products/[productId]/route.ts",
    "app/api/admin/catalog/categories/route.ts",
    "app/api/admin/catalog/categories/[categoryId]/route.ts",
    "app/api/admin/orders/route.ts",
    "app/api/admin/payments/route.ts",
  ];
  for (const route of adminRoutes) {
    const source = file(route);
    assert.match(source, /require(Api)?Admin|requireCatalogAdmin|requireSuperAdmin|getServerAdminContext/, `${route} must guard admin access`);
  }
});

test("service role key is not exposed through NEXT_PUBLIC variables", () => {
  const serviceRole = file("lib/supabase/service-role.ts");
  const envExample = existsSync(join(root, ".env.example")) ? file(".env.example") : "";
  const testEnvExample = existsSync(join(root, ".env.test.example")) ? file(".env.test.example") : "";
  assert.match(serviceRole, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE/);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_.*SERVICE_ROLE/i);
  assert.doesNotMatch(testEnvExample, /NEXT_PUBLIC_.*SERVICE_ROLE/i);
});

test("digital delivery migration filters inventory by SKU and prevents cross-SKU allocation", () => {
  const migration = file("supabase/migrations/20260629_multi_sku_core.sql");
  assert.match(migration, /digital_inventory\(product_id, sku_id, status/i);
  assert.match(migration, /or sku_id = v_item\.sku_id/i);
  assert.match(migration, /v_item\.sku_id is null and sku_id is null/i);
});

test("SKU compatibility baseline is schema-only and does not replace order lifecycle functions", () => {
  const migration = file("supabase/migrations/20260710_product_skus_compatibility_baseline.sql");
  const verification = file("docs/product-skus-compatibility-verification.sql");

  for (const tableName of ["product_option_groups", "product_option_values", "product_skus", "product_sku_values"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${tableName}`));
    assert.match(migration, new RegExp(`alter table public\\.${tableName} enable row level security`));
  }

  for (const dependency of [
    "public.products",
    "public.categories",
    "public.order_items",
    "public.digital_inventory",
    "public.order_deliveries",
    "public.set_updated_at()",
    "public.is_admin()",
    "public.is_admin(uuid)",
  ]) {
    assert.match(migration, new RegExp(dependency.replace(/[().]/g, "\\$&")));
  }

  for (const column of ["sku_id", "sku_code", "sku_title", "option_snapshot"]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`));
  }
  assert.match(migration, /to_regclass\('public\.digital_inventory_batches'\)/);
  assert.match(migration, /execute 'alter table public\.digital_inventory_batches add column if not exists sku_id/);
  assert.match(migration, /raise notice 'SKU compatibility baseline skipped optional public\.digital_inventory_batches/);

  for (const indexName of [
    "product_option_groups_product_name_uidx",
    "product_option_values_group_name_uidx",
    "product_skus_product_code_uidx",
    "product_skus_product_combination_uidx",
    "product_sku_values_sku_group_uidx",
    "product_sku_values_sku_value_uidx",
    "product_option_groups_product_sort_idx",
    "product_option_values_group_sort_idx",
    "product_skus_product_status_sort_idx",
    "order_items_sku_idx",
    "digital_inventory_product_sku_status_idx",
    "order_deliveries_sku_idx",
  ]) {
    assert.match(migration, new RegExp(indexName));
  }

  assert.match(migration, /validate_product_option_group_limit/);
  assert.match(migration, /public can read active option groups/);
  assert.match(migration, /public can read active option values/);
  assert.match(migration, /public can read active skus/);
  assert.match(migration, /public can read sku values/);
  assert.match(migration, /admins manage option groups/);
  assert.match(migration, /admins manage option values/);
  assert.match(migration, /admins manage product skus/);
  assert.match(migration, /admins manage sku values/);
  assert.match(migration, /grant select on table public\.product_skus to anon, authenticated/);
  assert.match(migration, /grant all on table public\.product_skus to service_role/);
  assert.match(migration, /revoke insert, update, delete, truncate, references, trigger on table/);

  for (const forbidden of [
    /create or replace function public\.create_order_with_item/i,
    /create or replace function public\.deliver_digital_order/i,
    /create or replace function public\.complete_order_payment/i,
    /create or replace function public\.cancel_unpaid_order/i,
    /create or replace function public\.expire_unpaid_order/i,
    /create or replace function public\.admin_update_order_status/i,
    /update\s+public\.products\s+set\s+stock/i,
    /update\s+public\.product_skus\s+set\s+stock/i,
    /update\s+public\.digital_inventory/i,
  ]) {
    assert.doesNotMatch(migration, forbidden);
  }

  assert.match(verification, /md5\(pg_get_functiondef\(p\.oid\)\) as function_hash/);
  assert.match(verification, /create_order_with_item/);
  assert.match(verification, /deliver_digital_order/);
  assert.match(verification, /complete_order_payment/);
  assert.match(verification, /cancel_unpaid_order/);
  assert.match(verification, /expire_unpaid_order/);
  assert.match(verification, /admin_update_order_status/);
  assert.match(verification, /role_table_grants/);
  assert.match(verification, /pg_policies/);
  assert.doesNotMatch(verification, /^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im);
});




test("data consistency scan rules are centralized and cover critical domains", () => {
  const rules = file("lib/consistency/rules.ts");
  for (const code of ["OP-001", "OP-003", "RB-001", "RB-003", "RF-001", "ID-002", "ID-006"]) {
    assert.match(rules, new RegExp(code));
  }
  assert.match(rules, /CONSISTENCY_RULES/);
  assert.match(rules, /suggestion/);
});

test("data consistency scanner is read-only for business data and persists only scan records", () => {
  const scanner = file("lib/consistency/scanner.ts");
  assert.match(scanner, /safeSelect/);
  assert.match(scanner, /data_consistency_runs/);
  assert.match(scanner, /data_consistency_issues/);
  assert.doesNotMatch(scanner, /\.from\("orders"\)\s*\n\s*\.update/);
  assert.doesNotMatch(scanner, /\.from\("balance_transactions"\)\s*\n\s*\.insert/);
  assert.doesNotMatch(scanner, /\.from\("digital_inventory"\)\s*\n\s*\.update/);
});

test("data consistency APIs require centralized super-admin or internal secret", () => {
  const adminRoute = file("app/api/admin/system/data-consistency/route.ts");
  const issueRoute = file("app/api/admin/system/data-consistency/[issueId]/route.ts");
  const internalRoute = file("app/api/internal/data-consistency/route.ts");
  assert.match(adminRoute, /requireApiSuperAdmin/);
  assert.match(issueRoute, /requireApiSuperAdmin/);
  assert.doesNotMatch(adminRoute, /SUPER_ADMIN_EMAIL|gac000189@gmail\.com/i);
  assert.doesNotMatch(issueRoute, /SUPER_ADMIN_EMAIL|gac000189@gmail\.com/i);
  assert.match(internalRoute, /DATA_CONSISTENCY_SCAN_SECRET/);
  assert.doesNotMatch(internalRoute, /process\.env\.NEXT_PUBLIC_/);
});

test("admin privileges do not rely on a hard-coded personal email in runtime code", () => {
  const runtimeFiles = [...listRuntimeSourceFiles("app"), ...listRuntimeSourceFiles("lib")];
  for (const runtimeFile of runtimeFiles) {
    const source = file(runtimeFile);
    assert.doesNotMatch(source, /gac000189@gmail\.com/i, `${runtimeFile} must not hard-code an admin email`);
    assert.doesNotMatch(source, /SUPER_ADMIN_EMAIL/, `${runtimeFile} must not use a hard-coded super-admin email constant`);
  }

  const apiAuth = file("lib/admin/api-auth.ts");
  const serverAuth = file("lib/auth/require-admin.ts");
  const riskAdmin = file("lib/risk/admin-risk.ts");
  const auditLogs = file("app/api/admin/audit-logs/route.ts");

  assert.match(apiAuth, /requireApiSuperAdmin/);
  assert.match(apiAuth, /\.from\("admin_users"\)/);
  assert.match(apiAuth, /admin_level !== "super_admin"/);
  assert.match(apiAuth, /\.from\("profiles"\)/);
  assert.match(apiAuth, /\.select\("role,email"\)/);
  assert.match(apiAuth, /profile\?\.role === "admin"/);
  assert.match(serverAuth, /getServerSuperAdminContext/);
  assert.match(serverAuth, /\.from\("admin_users"\)/);
  assert.match(riskAdmin, /requireApiSuperAdmin/);
  assert.match(auditLogs, /getServerSuperAdminContext/);
  assert.doesNotMatch(apiAuth, /user_metadata|app_metadata/);
  assert.doesNotMatch(serverAuth, /user_metadata|app_metadata/);
});

test("durable admin_users model separates ordinary admins from super admins", () => {
  const migration = file("supabase/migrations/20260715_admin_users_super_admin_model.sql");
  const verification = file("docs/admin-users-super-admin-verification.sql");
  const matrix = file("docs/admin-permission-model.md");
  const apiAuth = file("lib/admin/api-auth.ts");
  const serverAuth = file("lib/auth/require-admin.ts");
  const userActions = file("app/api/admin/users/[userId]/actions/route.ts");
  const refundAction = file("app/api/admin/refunds/[refundId]/route.ts");
  const privacyAction = file("app/api/admin/privacy-requests/route.ts");
  const adminUsers = file("app/api/admin/admin-users/route.ts");
  const adminUser = file("app/api/admin/admin-users/[userId]/route.ts");

  assert.match(migration, /create table if not exists public\.admin_users/i);
  assert.match(migration, /admin_level in \('admin','super_admin'\)/i);
  assert.match(migration, /status in \('active','disabled'\)/i);
  assert.match(migration, /permissions jsonb not null default '\{\}'::jsonb/i);
  assert.match(migration, /alter table public\.admin_users enable row level security/i);
  assert.match(migration, /select p\.id, 'admin', 'active'/i);
  const migrationInsert = migration.match(/with inserted as \([\s\S]*?returning user_id\s*\)/i)?.[0] ?? "";
  assert.ok(migrationInsert, "profiles admin migration block must exist");
  assert.doesNotMatch(migrationInsert, /'super_admin'/i);
  assert.match(migration, /No super_admin was appointed/i);
  assert.match(migration, /create or replace function public\.is_admin\(user_id uuid\)/i);
  assert.match(migration, /create or replace function public\.is_super_admin\(user_id uuid\)/i);
  assert.match(migration, /create or replace function public\.is_super_admin_user\(user_id uuid\)/i);
  assert.doesNotMatch(migration, /function public\.(?:is_admin|is_super_admin|is_super_admin_user)\(p_user_id uuid\)/i);
  assert.match(migration, /au\.admin_level = 'super_admin'/i);
  assert.match(migration, /not exists \(select 1 from public\.admin_users au where au\.user_id = \$1\)/i);
  assert.doesNotMatch(migration, /user_metadata|app_metadata/i);
  assert.match(migration, /LAST_ACTIVE_SUPER_ADMIN_REQUIRED/i);
  assert.match(migration, /SUPER_ADMIN_SELF_DEMOTION_FORBIDDEN/i);
  assert.match(migration, /create or replace function public\.role_for_email\(input_email text\)[\s\S]*?select 'user'::text[\s\S]*?values \(\$1\)/i);
  assert.doesNotMatch(migration, /create or replace function public\.role_for_email\(user_email text\)/i);
  assert.match(migration, /revoke execute on function public\.admin_adjust_user_balance[\s\S]*?from authenticated/i);
  assert.match(migration, /revoke execute on function public\.admin_process_refund_request[\s\S]*?from authenticated/i);

  assert.match(apiAuth, /admin_level !== "super_admin"/);
  assert.match(serverAuth, /admin_level !== "super_admin"/);
  assert.doesNotMatch(apiAuth, /isSuperAdminProfile[\s\S]*?isAdminProfile/);
  assert.match(userActions, /super_admin_update_user_account_status/);
  assert.match(userActions, /super_admin_update_user_risk_status/);
  assert.match(userActions, /super_admin_adjust_user_balance/);
  assert.match(refundAction, /super_admin_process_refund_request/);
  assert.match(privacyAction, /super_admin_anonymize_user_account/);
  assert.match(adminUsers, /requireApiSuperAdmin/);
  assert.match(adminUsers, /manage_admin_user/);
  assert.match(adminUser, /requireApiSuperAdmin/);
  assert.match(adminUser, /manage_admin_user/);

  assert.match(verification, /BEGIN;/);
  assert.match(verification, /ROLLBACK;/);
  assert.match(verification, /v_confirm_test_database boolean := false/);
  assert.match(verification, /ordinary admin high-risk RPCs denied/i);
  assert.match(verification, /disabled admin still passed is_admin/i);
  assert.match(verification, /active_super_admin_count/i);
  assert.match(matrix, /profiles\.role = 'admin'.*temporary ordinary-admin compatibility fallback/is);
});

test("data consistency migration stores fingerprints and keeps user access read-only", () => {
  const migration = file("supabase/migrations/20260630_data_consistency_scan.sql");
  assert.match(migration, /data_consistency_runs/);
  assert.match(migration, /data_consistency_issues/);
  assert.match(migration, /fingerprint text not null/);
  assert.match(migration, /unique \(fingerprint\)/i);
  assert.match(migration, /enable row level security/i);
  assert.doesNotMatch(migration, /for insert\s+with check/i);
  assert.doesNotMatch(migration, /for update\s+using/i);
});

test("data consistency admin page does not expose direct data repair actions", () => {
  const page = file("components/admin/system/DataConsistencyClient.tsx");
  assert.match(page, /立即巡检/);
  assert.match(page, /标记处理中/);
  assert.match(page, /标记已解决/);
  assert.doesNotMatch(page, /执行 SQL|修改余额|重分配库存|标记支付成功/);
});

test("guest order lookup requires token hash and does not expose delivery secrets", () => {
  const service = file("lib/orders/order-query-service.ts");
  const route = file("app/api/order-query/route.ts");
  const page = file("app/order-query/page.tsx");
  assert.match(service, /hashOrderQueryToken/);
  assert.match(service, /timingSafeEqual/);
  assert.match(service, /order_query_token_hash/);
  assert.doesNotMatch(service, /delivery_content/);
  assert.match(route, /queryToken/);
  assert.match(route, /GENERIC_ERROR/);
  assert.match(route, /order_lookup/);
  assert.match(page, /仅凭订单号无法查看订单/);
});

test("order query token migration stores only hashed credentials", () => {
  const migration = file("supabase/migrations/20260630_order_query_tokens.sql");
  assert.match(migration, /order_query_token_hash/);
  assert.match(migration, /order_query_token_expires_at/);
  assert.match(migration, /order_query_token_revoked_at/);
  assert.doesNotMatch(migration, /query_token text/i);
  assert.doesNotMatch(migration, /access_token text/i);
});

test("guest order bind uses current authenticated user and refuses frontend user id", () => {
  const route = file("app/api/order-query/bind/route.ts");
  assert.match(route, /supabase\.auth\.getUser/);
  assert.match(route, /user\.id/);
  assert.match(route, /verifyOrderQueryToken/);
  assert.doesNotMatch(route, /body\.user_id|body\.userId/);
});

test("logged-in order list stays scoped to current user and supports extended filters", () => {
  const api = file("app/api/orders/route.ts");
  const queries = file("lib/orders/order-queries.ts");
  assert.match(api, /supabase\.auth\.getUser/);
  assert.match(api, /user\.id/);
  for (const key of ["deliveryStatus", "startDate", "endDate", "productSearch", "skuSearch"]) {
    assert.match(api, new RegExp(key));
    assert.match(queries, new RegExp(key));
  }
  assert.match(queries, /\.eq\("user_id", userId\)/);
});

test("high-risk APIs use shared rate limit and request size guards", () => {
  const rateLimit = file("lib/security/rate-limit.ts");
  assert.match(rateLimit, /checkRateLimit/);
  assert.match(rateLimit, /checkRequestSize/);
  for (const policy of ["order_create", "order_lookup", "payment_session_create", "payment_status_query"]) {
    assert.match(rateLimit, new RegExp(policy));
  }

  const guardedRoutes = [
    "app/api/orders/route.ts",
    "app/api/payments/create/route.ts",
    "app/api/recharges/route.ts",
    "app/api/refunds/route.ts",
    "app/api/order-query/route.ts",
    "app/api/admin/inventory/route.ts",
    "app/api/admin/media/route.ts",
    "app/api/admin/catalog/products/route.ts",
    "app/api/admin/catalog/products/[productId]/route.ts",
  ];

  for (const route of guardedRoutes) {
    const source = file(route);
    assert.match(source, /checkRateLimit/, `${route} must call checkRateLimit`);
    assert.match(source, /checkRequestSize/, `${route} must call checkRequestSize`);
  }
});

test("production readiness checks are read-only and cleanup scripts are safe by default", () => {
  const route = file("app/api/admin/system/production-readiness/route.ts");
  const service = file("lib/admin/production-readiness.ts");
  const dryRun = file("scripts/production-data-cleanup-dry-run.sql");
  const cleanupTemplate = file("scripts/production-data-cleanup-template.sql");

  assert.match(route, /requireApiAdmin/);
  assert.match(route, /buildProductionReadinessPayload/);
  assert.doesNotMatch(route, /\.delete\(|\.update\(|\.insert\(|\.upsert\(/);
  assert.doesNotMatch(service, /\.delete\(|\.update\(|\.insert\(|\.upsert\(/);
  assert.doesNotMatch(service, /content\)/);

  assert.doesNotMatch(dryRun, /\bdelete\b|\btruncate\b|\bdrop\b|\bupdate\b|\binsert\b/i);
  assert.doesNotMatch(cleanupTemplate, /^\s*delete\s+from/im);
  assert.doesNotMatch(cleanupTemplate, /\btruncate\b|\bdrop\s+table\b/i);
  assert.match(cleanupTemplate, /必须先备份/);
  assert.match(cleanupTemplate, /必须先执行 dry-run/);
});

test("order expiration migration adds payment expiry and idempotent release RPC", () => {
  const migration = file("supabase/migrations/20260701_order_expiration_inventory_release.sql");
  assert.match(migration, /payment_expires_at/);
  assert.match(migration, /reservation_released_at/);
  assert.match(migration, /create or replace function public\.expire_unpaid_order/);
  assert.match(migration, /for update/);
  assert.match(migration, /payment_status = 'paid'/);
  assert.match(migration, /status in \('paid','processing','delivered','completed','refunded'\)/);
  assert.match(migration, /update public\.payment_sessions[\s\S]*status = case when status in \('pending','processing'\) then 'expired'/);
  assert.match(migration, /update public\.product_skus[\s\S]*stock = s\.stock \+ oi\.quantity/);
  assert.match(migration, /update public\.products p[\s\S]*stock = p\.stock \+ oi\.quantity/);
  assert.match(migration, /update public\.digital_inventory[\s\S]*status = 'available'/);
  assert.match(migration, /delivered_at is null/);
  assert.match(migration, /create trigger trg_orders_set_payment_expiration/);
});

test("order expiration list RPC compatibility migration only adds the missing list function", () => {
  const migration = file("supabase/migrations/20260717_order_expiration_list_rpc_compatibility.sql");

  assert.match(migration, /create or replace function public\.list_expirable_unpaid_orders\(p_limit integer default 50\)/);
  assert.match(migration, /returns table\(order_id uuid\)/);
  assert.match(migration, /language plpgsql/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public/);
  assert.match(migration, /greatest\(1, least\(coalesce\(p_limit, 50\), 200\)\)/);
  assert.match(migration, /o\.status = 'pending_payment'/);
  assert.match(migration, /o\.payment_status = 'unpaid'/);
  assert.match(migration, /o\.reservation_released_at is null/);
  assert.match(migration, /coalesce\(o\.payment_expires_at, o\.created_at \+ interval '30 minutes'\) <= now\(\)/);
  assert.match(migration, /to_regclass\('public\.chain_payment_sessions'\) is not null/);
  assert.match(migration, /cps\.status in \(/);
  for (const status of ["confirming", "verified", "completing", "manual_review", "underpaid", "overpaid", "paid", "payment_failed"]) {
    assert.match(migration, new RegExp(`'${status}'`));
  }
  assert.match(migration, /cps\.status = 'submitted'[\s\S]*nullif\(btrim\(coalesce\(cps\.failure_reason, ''\)\), ''\) is null/);
  assert.doesNotMatch(migration, /cps\.status in \([\s\S]{0,120}'submitted'/);
  assert.match(migration, /revoke execute on function public\.list_expirable_unpaid_orders\(integer\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.list_expirable_unpaid_orders\(integer\) to service_role/);
  assert.match(migration, /pg_get_function_identity_arguments/);
  assert.match(migration, /pg_get_function_result/);
  assert.match(migration, /pg_get_functiondef/);

  for (const forbidden of [
    /create or replace function public\.release_order_inventory/i,
    /create or replace function public\.cancel_unpaid_order/i,
    /create or replace function public\.expire_unpaid_order/i,
    /create or replace function public\.create_order_with_item/i,
    /alter table/i,
    /create index/i,
    /drop trigger/i,
    /create trigger/i,
    /enable row level security/i,
    /\bdelete\s+from\b/i,
    /\bupdate\s+public\./i,
    /\binsert\s+into\b/i,
  ]) {
    assert.doesNotMatch(migration, forbidden);
  }
});

test("order expiration internal API requires job secret and does not expose sensitive payloads", () => {
  const route = file("app/api/internal/orders/expire/route.ts");
  const service = file("lib/orders/order-expiration.ts");
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /handleOrderExpirationRequest/);
  assert.match(route, /assertOrderExpirationJobAuthorized/);
  assert.match(route, /checkRateLimit\("internal_task"/);
  assert.match(route, /processExpiredOrders/);
  assert.match(route, /listExpirableUnpaidOrdersDryRun/);
  assert.match(route, /dry_run/);
  assert.match(route, /success: false/);
  assert.match(route, /CODE_OR_DB_NOT_READY/);
  assert.match(route, /error_code: dryRunResult\.code/);
  assert.match(route, /status: 503/);
  assert.match(route, /success: true/);
  assert.match(route, /parseLimit\(options\.limit, 50, 200\)/);
  assert.match(route, /parseLimit\(options\.limit, 10, 50\)/);
  assert.doesNotMatch(route, /customer_email|delivery_content|secret_config|provider_raw/i);
  assert.match(service, /CRON_SECRET/);
  assert.match(service, /ORDER_EXPIRATION_JOB_SECRET/);
  assert.match(service, /INTERNAL_JOB_SECRET/);
  assert.match(service, /service\.rpc\("expire_unpaid_order"/);
  assert.match(service, /service\.rpc\("list_expirable_unpaid_orders"/);
  assert.match(service, /listExpirableUnpaidOrdersDryRun/);
  assert.match(service, /ORDER_EXPIRATION_RPC_UNAVAILABLE/);
});

test("digital delivery only consumes reserved inventory and keeps delivery secrets private", () => {
  const migration = file("supabase/migrations/20260709_digital_delivery_reserved_fulfillment_hardening.sql");
  const deliveryRoute = file("app/api/orders/[orderNo]/delivery/route.ts");
  const fulfillmentRoute = file("app/api/orders/[orderNo]/fulfillment/route.ts");
  const service = file("lib/delivery/delivery-service.ts");

  assert.match(migration, /create or replace function public\.deliver_digital_order/);
  assert.match(migration, /status = 'reserved'/);
  assert.match(migration, /coalesce\(reserved_order_id, order_id\) = p_order_id/);
  assert.match(migration, /reserved_order_item_id is null or reserved_order_item_id = v_item\.id/);
  assert.doesNotMatch(migration, /status in \('reserved','available'\)/);
  assert.doesNotMatch(migration, /status = 'available'[\s\S]{0,500}delivered/);
  assert.match(migration, /digital_delivery_secrets/);
  assert.match(migration, /order_deliveries_delivered_inventory_uidx/);
  assert.match(migration, /delivery_status = 'delivered'/);
  assert.match(migration, /order is not paid/);
  assert.match(migration, /order status does not allow delivery/);
  assert.match(migration, /reserved inventory is insufficient/);

  assert.match(deliveryRoute, /Cache-Control", "no-store/);
  assert.match(fulfillmentRoute, /Cache-Control", "no-store/);
  assert.match(service, /p_event_type: "delivery_failed"/);
  assert.doesNotMatch(service, /console\.error\([^)]*content|console\.log\([^)]*content/i);
});

test("digital delivery security hardening closes direct reads and unsafe RPC entry points", () => {
  const migration = file("supabase/migrations/20260720_digital_delivery_security_hardening.sql");
  const precheck = migration.split("-- 2. Make the safe manual-delivery function")[0];

  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(migration, /drop policy if exists "users can read own deliveries"[\s\S]*on public\.order_deliveries/);
  assert.match(migration, /create policy "users can read own deliveries"[\s\S]*for select[\s\S]*to authenticated/);
  assert.match(migration, /order_deliveries\.delivery_status = 'delivered'/);
  assert.match(migration, /o\.payment_status = 'paid'/);
  assert.match(migration, /o\.status not in \('cancelled', 'expired', 'failed'\)/);
  assert.match(migration, /p\.policyname = 'users can read own deliveries'[\s\S]{0,100}p\.cmd = 'SELECT'/);
  assert.doesNotMatch(precheck, /'authenticated' = any\(p\.roles\)/);
  assert.match(precheck, /pre-migration user policy: % roles=% permissive=% cmd=% using=% check=%/);
  assert.match(precheck, /p\.policyname = 'admins can manage deliveries'[\s\S]{0,100}p\.cmd = 'ALL'/);
  assert.match(migration, /p\.roles = array\['authenticated'\]::name\[\]/);
  assert.match(migration, /coalesce\(p\.qual, ''\) !~ 'is_admin'/);
  assert.match(migration, /DIGITAL_DELIVERY_POSTCHECK_ADMIN_POLICY_MISSING/);
  assert.match(migration, /DIGITAL_DELIVERY_POSTCHECK_RLS_DISABLED/);
  assert.match(migration, /has_table_privilege\('anon', 'public\.order_deliveries', 'TRUNCATE'\)/);
  assert.match(migration, /roles=\{public\}[\s\S]*captured_pre_migration_using_expression/);
  assert.match(migration, /revoke insert, update, delete on table public\.order_deliveries from public, anon, authenticated/);
  assert.match(migration, /revoke select on table public\.order_deliveries from public, anon, authenticated/);
  assert.match(migration, /grant select \([\s\S]*id,[\s\S]*order_id,[\s\S]*order_item_id,[\s\S]*user_id,[\s\S]*delivery_type,[\s\S]*delivery_status,[\s\S]*failure_reason,[\s\S]*delivered_at,[\s\S]*created_at,[\s\S]*updated_at[\s\S]*\) on table public\.order_deliveries to authenticated/);
  assert.doesNotMatch(migration, /grant select \([\s\S]{0,500}\b(?:delivery_content|encrypted_content|inventory_id|delivery_note|viewed_at)\b[\s\S]{0,100}\) on table public\.order_deliveries to authenticated/);
  assert.match(migration, /has_column_privilege\('authenticated', 'public\.order_deliveries', 'delivery_content', 'SELECT'\)/);
  assert.match(migration, /has_column_privilege\('authenticated', 'public\.order_deliveries', 'encrypted_content', 'SELECT'\)/);
  assert.match(migration, /revoke execute on function public\.refresh_order_fulfillment_status\(uuid\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.refresh_order_fulfillment_status\(uuid\) to service_role/);
  assert.match(migration, /revoke execute on function public\.get_order_delivery_for_user\(text\) from public, anon/);
  assert.match(migration, /grant execute on function public\.get_order_delivery_for_user\(text\) to authenticated, service_role/);
  assert.match(migration, /revoke execute on function public\.deliver_digital_order\(uuid,text\) from public, anon, authenticated/);
  assert.match(migration, /revoke execute on function public\.admin_deliver_order_item_manual\(uuid,uuid,text,text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.deliver_digital_order\(uuid,text\) to service_role/);
  assert.match(migration, /grant execute on function public\.admin_deliver_order_item_manual\(uuid,uuid,text,text\) to service_role/);
  assert.match(migration, /create or replace function public\.admin_deliver_order_item_manual/);
  assert.doesNotMatch(precheck, /public\.admin_deliver_order_item_manual\(uuid,uuid,text,text\)/);
  assert.match(migration, /v_jwt_role <> 'service_role'/);
  assert.match(migration, /digital_delivery_secrets/);
  assert.match(migration, /DIGITAL_DELIVERY_POSTCHECK_MANUAL_DELIVERY_SIGNATURE_MISSING/);
  assert.match(migration, /pg_get_function_identity_arguments\(p\.oid\) = 'p_order_id uuid, p_order_item_id uuid, p_delivery_content text, p_delivery_note text'/);
  assert.match(migration, /acl\.grantee = 0[\s\S]{0,100}acl\.privilege_type = 'EXECUTE'/);
  assert.match(migration, /DIGITAL_DELIVERY_POSTCHECK_MANUAL_DELIVERY_PUBLIC_EXECUTE/);
  assert.match(migration, /revoke execute on function public\.auto_deliver_order\(uuid\) from public, anon, authenticated, service_role/);
  assert.match(migration, /revoke execute on function public\.admin_append_manual_delivery\(uuid,uuid,text,text,text,text\) from public, anon, authenticated, service_role/);
  assert.match(migration, /pre-migration function ACL/);
  assert.match(migration, /does not guess prior grants/);
  assert.doesNotMatch(migration, /add column[^;]*order_deliveries[^;]*user_id/i);
});

test("digital delivery writes elevate only after cookie administrator authorization", () => {
  const balance = file("lib/orders/balance-payment-service.ts");
  const completion = file("lib/payments/complete-payment-service.ts");
  const bep20 = file("lib/payments/bep20-chain-service.ts");
  const adminOrder = file("app/api/admin/orders/[orderId]/route.ts");
  const adminItem = file("app/api/admin/orders/[orderId]/items/[itemId]/deliver/route.ts");
  const fulfillment = file("app/api/orders/[orderNo]/fulfillment/route.ts");
  const delivery = file("app/api/orders/[orderNo]/delivery/route.ts");

  assert.match(balance, /getSupabaseServiceRoleClient\(\)/);
  assert.match(balance, /deliverDigitalOrder\(service, result\.orderId, "balance_payment"\)/);
  assert.match(completion, /getSupabaseServiceRoleClient\(\)/);
  assert.match(completion, /deliverDigitalOrder\(service, result\.businessId, input\.source\)/);
  assert.match(bep20, /completePayment\([\s\S]{0,500}service/);
  assert.ok(adminOrder.indexOf("const admin = await getServerAdminContext()") < adminOrder.indexOf("const serviceClient = getSupabaseServiceRoleClient()"));
  assert.ok(adminItem.indexOf("const admin = await getServerAdminContext()") < adminItem.indexOf("const serviceClient = getSupabaseServiceRoleClient()"));
  assert.match(adminOrder, /if \(!admin\.ok\)[\s\S]{0,500}return/);
  assert.match(adminItem, /if \(!admin\.ok\)[\s\S]{0,500}return/);
  assert.match(adminOrder, /deliverDigitalOrder\(serviceClient, context\.params\.orderId, "admin_retry"\)/);
  assert.match(adminOrder, /serviceClient\.rpc\("admin_deliver_order_item_manual"/);
  assert.match(adminItem, /serviceClient\.rpc\("admin_deliver_order_item_manual"/);
  assert.doesNotMatch(adminOrder, /admin\.supabase\.rpc\("admin_deliver_order_item_manual"/);
  assert.doesNotMatch(adminItem, /admin\.supabase\.rpc\("admin_deliver_order_item_manual"/);
  assert.doesNotMatch(`${adminOrder}\n${adminItem}`, /SUPABASE_(?:SERVICE_ROLE|SECRET|SERVICE_KEY)/);
  assert.match(file("lib/delivery/delivery-service.ts"), /await supabase\.rpc\("write_delivery_log"/);
  assert.match(fulfillment, /getSupabaseServerClient\(\)[\s\S]*rpc\("get_order_fulfillment_for_user"/);
  assert.match(delivery, /getSupabaseServerClient\(\)[\s\S]*rpc\("get_order_delivery_for_user"/);
});

test("admin delivery routes use hardened RPCs and reject the unsafe legacy inventory action", () => {
  const route = file("app/api/admin/orders/[orderId]/route.ts");

  assert.match(route, /deliverDigitalOrder\(serviceClient, context\.params\.orderId, "admin_retry"\)/);
  assert.match(route, /rpc\("admin_deliver_order_item_manual"/);
  assert.match(route, /legacy_inventory_delivery_disabled/);
  assert.match(route, /status: 410/);
  assert.doesNotMatch(route, /rpc\("admin_retry_auto_delivery"/);
  assert.doesNotMatch(route, /rpc\("admin_deliver_inventory_item"/);
  assert.doesNotMatch(route, /rpc\("admin_append_manual_delivery"/);
});

test("admin order manual expiration uses unified service and audit log", () => {
  const route = file("app/api/admin/orders/[orderId]/route.ts");
  assert.match(route, /expireUnpaidOrder/);
  assert.match(route, /action\?: .*expire_unpaid_order/);
  assert.match(route, /关闭未支付订单必须填写原因/);
  assert.match(route, /writeAdminAuditLog/);
  assert.doesNotMatch(route, /status\s*=\s*["']cancelled["']/);
});

test("legal checkout requires versioned agreements and server-side recording", () => {
  const migration = file("supabase/migrations/20260701_legal_documents_order_evidence.sql");
  const checkout = file("app/checkout/page.tsx");
  const orders = file("app/api/orders/route.ts");
  const legal = file("lib/legal/legal-service.ts");
  const relations = file("lib/admin/order-relations.ts");
  assert.match(migration, /legal_documents/);
  assert.match(migration, /order_agreement_acceptances/);
  assert.match(migration, /order_evidence_events/);
  assert.match(migration, /content_hash/);
  assert.match(migration, /deny direct agreement writes/i);
  assert.match(checkout, /useState\(false\)/);
  assert.match(checkout, /\/api\/legal\/current/);
  assert.match(checkout, /agreement_version_ids/);
  assert.match(orders, /verifyCheckoutAgreements/);
  assert.match(orders, /recordOrderAgreementAcceptances/);
  assert.match(legal, /accepted_at/);
  assert.match(legal, /getRequestIpHash/);
  assert.match(relations, /协议确认/);
  assert.match(relations, /历史记录缺失/);
});

test("legal admin API manages drafts and published versions with audit logs", () => {
  const route = file("app/api/admin/legal/route.ts");
  assert.match(route, /getServerAdminContext/);
  assert.match(route, /writeAdminAuditLog/);
  assert.match(route, /create_draft|update_draft|publish|archive/);
  assert.match(route, /publish_reason|reason/);
  assert.doesNotMatch(route, /service_role.*json/i);
});


test("admin order relations use compatible fields and distinguish all payment records", () => {
  const relations = file("lib/admin/order-relations.ts");
  const itemSelect = relations.match(/\.from\("order_items"\)[\s\S]*?\.eq\("order_id", orderId\)/)?.[0] ?? "";
  const sessionSelect = relations.match(/\.from\("payment_sessions"\)[\s\S]*?\.eq\("business_type", "order"\)/)?.[0] ?? "";
  const paymentSelect = relations.match(/\.from\("order_payments"\)[\s\S]*?\.eq\("order_id", orderId\)/)?.[0] ?? "";
  const chainSelect = relations.match(/\.from\("chain_payment_sessions"\)[\s\S]*?\.eq\("order_id", orderId\)/)?.[0] ?? "";

  assert.ok(itemSelect);
  assert.doesNotMatch(itemSelect, /\bcurrency\b/);
  assert.match(relations, /money\(item\.line_total, order\.currency\)/);
  assert.ok(sessionSelect);
  assert.doesNotMatch(sessionSelect, /failed_at/);
  assert.match(sessionSelect, /closed_at,last_error,updated_at/);
  assert.ok(paymentSelect);
  assert.match(paymentSelect, /payment_session_id/);
  assert.match(paymentSelect, /payable_amount,payable_currency,received_amount,received_currency/);
  assert.ok(chainSelect);
  assert.match(chainSelect, /payment_session_id,payment_id/);
  assert.match(relations, /chain_payment_sessions: "链上支付会话"/);
  assert.match(relations, /应付 \$\{exactMoney\(session\.expected_amount, session\.payment_currency\)\}/);
  assert.match(relations, /到账 \$\{exactMoney\(session\.confirmed_amount, session\.payment_currency\)\}/);
});

test("paid orders never render as waiting for payment and manual delivery has explicit wording", () => {
  const paymentPage = file("app/payment/page.tsx");
  const orderList = file("app/account/orders/page.tsx");
  const orderDetail = file("app/account/orders/[orderNo]/page.tsx");

  assert.match(paymentPage, /const currentStatus = normalizedPaymentStatus === "paid"\s*\? "paid"/);
  assert.match(orderList, /paymentStatus !== "paid"\s*\? "等待支付。"/);
  assert.match(orderList, /\["manual", "manual_delivery"\]/);
  assert.match(orderList, /"待人工处理。"/);
  assert.match(orderList, /"人工处理中。"/);
  assert.match(orderDetail, /\["manual", "manual_delivery"\]/);
  assert.match(orderDetail, /"待人工处理。"/);
  assert.match(orderDetail, /"人工处理中。"/);
});

test("account order tables use one centered user-facing status column", () => {
  const orderList = file("app/account/orders/page.tsx");
  const orderStatus = file("lib/orders/order-status.ts");
  const orderQueries = file("lib/orders/order-queries.ts");

  assert.match(orderList, /const PAGE_SIZE = 10/);
  assert.doesNotMatch(orderList, /RefreshCcw/);
  assert.doesNotMatch(orderList, /重新加载|重新查询/);
  assert.doesNotMatch(orderList, /min-w-\[1230px\]/);
  assert.doesNotMatch(orderList, /rounded-xl border bg-slate-50\/60 px-3 py-2\.5/);
  assert.match(orderList, /<CardHeader className="shrink-0 px-5 py-4">/);
  assert.match(orderList, /<Search className="mr-2 h-4 w-4" \/>[\s\S]{0,80}订单查询/);
  assert.match(orderList, /getUserOrderDisplayStatus\(order\)/);
  assert.match(orderList, /<table className="w-full table-fixed text-sm">/);
  for (const width of ["16%", "27%", "6%", "8%", "10%", "15%", "18%"]) {
    assert.match(orderList, new RegExp(`w-\\[${width.replace("%", "%")}\\]`));
  }
  assert.match(orderList, /<th className="whitespace-nowrap px-3 py-3 text-center align-middle">[^<]+<\/th>/);
  assert.doesNotMatch(orderList, /<th[^>]*>订单状态<\/th>/);
  assert.doesNotMatch(orderList, /<th[^>]*>支付状态<\/th>/);
  assert.match(orderList, /text-center align-middle font-mono/);
  assert.match(orderList, /inline-flex items-center justify-center gap-1/);
  assert.match(orderList, /max-w-\[260px\] truncate whitespace-nowrap/);
  assert.match(orderList, /title=\{productName\}/);
  assert.match(orderList, /flex flex-nowrap items-center justify-center gap-1 whitespace-nowrap/);
  assert.match(orderStatus, /export function getUserOrderDisplayStatus/);
  assert.match(orderStatus, /status === "cancelled"/);
  assert.match(orderStatus, /status === "refunded"/);
  assert.match(orderStatus, /status === "refund_pending"/);
  assert.match(orderStatus, /status === "completed"/);
  assert.match(orderStatus, /paymentStatus === "paid"/);
  assert.match(orderStatus, /status === "expired"/);
  assert.match(orderStatus, /status === "failed" \|\| paymentStatus === "failed"/);
  assert.match(orderStatus, /normalizedStatus === "pending_payment" && normalizedPaymentStatus === "unpaid"/);
  for (const state of ["continue_active_payment", "renew_payment_session", "confirming", "manual_review_pending", "rejected"]) {
    assert.match(orderStatus, new RegExp(state));
  }
  assert.match(orderQueries, /status === "manual_review"\) return "manual_review_pending"/);
  assert.match(orderQueries, /status === "confirming"\) return "confirming"/);
  assert.match(orderQueries, /status === "payment_failed"\) return "payment_failed"/);
});

test("BEP20 order details render a compact payment summary without creating sessions on open", () => {
  const orderList = file("app/account/orders/page.tsx");
  const orderDetail = file("app/account/orders/[orderNo]/page.tsx");
  const summary = file("components/account/orders/Bep20OrderPaymentSummary.tsx");
  const sessionRoute = file("app/api/payments/bep20/session/route.ts");

  assert.match(orderList, /import \{ Bep20OrderPaymentSummary \}/);
  assert.match(orderDetail, /import \{ Bep20OrderPaymentSummary \}/);
  assert.match(orderList, /<Bep20OrderPaymentSummary order=\{order\} compact \/>/);
  assert.match(orderDetail, /<Bep20OrderPaymentSummary order=\{order\} onUpdated=\{loadOrder\} \/>/);
  assert.match(summary, /String\(order\.payment_method \?\? ""\)\.toLowerCase\(\) === "usdt_bep20"/);

  assert.match(summary, /fetch\(`\/api\/payments\/bep20\/session\?order=\$\{encodeURIComponent\(order\.order_no\)\}`,\s*\{ cache: "no-store" \}\)/);
  assert.match(summary, /fetch\("\/api\/payments\/bep20\/session",\s*\{[\s\S]*?method: "POST"/);
  assert.match(summary, /AlertDialog/);
  assert.match(summary, /确认重新生成支付单？/);
  assert.match(summary, /重新生成后将创建新的 30 分钟支付会话/);
  assert.match(summary, /confirmRenewPaymentSession/);
  assert.match(summary, /onClick=\{confirmRenewPaymentSession\}/);
  assert.match(summary, /body: JSON\.stringify\(\{ order: order\.order_no \}\)/);
  assert.match(sessionRoute, /export async function GET/);
  assert.match(sessionRoute, /getBep20PaymentSession\(orderNo, userContext\.user\.id\)/);
  assert.match(sessionRoute, /export async function POST/);
  assert.match(sessionRoute, /createBep20PaymentSession\(orderNo, userContext\.user\.id\)/);

  assert.match(summary, /paymentAction === "continue_active_payment"/);
  assert.match(summary, /paymentAction === "renew_payment_session"/);
  assert.match(summary, /canSubmitLateTransaction/);
  assert.match(summary, /status === "manual_review"/);
  assert.match(summary, /paymentAction === "rejected"/);
  assert.match(summary, /paymentAction === "paid"/);
  assert.match(summary, /status === "underpaid"/);
  assert.match(summary, /status === "payment_failed"/);
  assert.match(summary, /chain_session_id: session\.canSubmitLateTransaction \? session\.chainSessionId : undefined/);
  assert.match(summary, /disabled=\{!txHashValid \|\| verifying\}/);
  assert.match(summary, /提交原订单支付凭证/);
  assert.doesNotMatch(summary, /查看完整支付页/);
  assert.match(summary, /href=\{fullPaymentHref\}/);
  assert.match(summary, /shortHash\(session\.receiveAddress\)/);
  assert.match(summary, /shortHash\(session\.submittedTxHash\)/);
  assert.match(summary, /truncate/);
  assert.match(summary, /BscScan/);
  assert.doesNotMatch(summary, /LocalAddressQr|qrCode|QRCode|Chain ID|exchangeRate|tokenContract/);
  assert.doesNotMatch(orderList, /paymentAction && !isBep20Order[\s\S]{0,140}<Bep20OrderPaymentSummary order=\{order\} compact \/>[\s\S]{0,140}paymentAction && isBep20Order/);
  assert.match(orderList, /paymentAction && !isBep20Order/);
  assert.match(orderDetail, /paymentAction && !isBep20Order/);
});

test("account order details use a single user-facing status card and compact item rows", () => {
  const orderList = file("app/account/orders/page.tsx");
  const orderDetail = file("app/account/orders/[orderNo]/page.tsx");

  for (const source of [orderList, orderDetail]) {
    assert.match(source, /getUserOrderDisplayStatus\(order\)/);
    assert.match(source, /label="状态"/);
    assert.match(source, /md:grid-cols-2/);
    assert.match(source, /md:grid-cols-\[minmax\(0,1fr\)_120px_80px\]/);
    assert.match(source, /title=\{item\.product_name\}/);
    assert.match(source, /formatMoney\(item\.unit_price/);
    assert.match(source, /× \{item\.quantity\}|x \{item\.quantity\}/);
  }

  assert.doesNotMatch(orderList, /StatusBlock label="订单状态"/);
  assert.doesNotMatch(orderList, /StatusBlock label="支付状态"/);
  assert.doesNotMatch(orderDetail, /getOrderStatusLabel\(orderStatus\)/);
  assert.doesNotMatch(orderDetail, /getPaymentStatusLabel\(paymentStatus\)/);
  assert.doesNotMatch(orderDetail, /formatMoney\(item\.line_total/);
  assert.doesNotMatch(orderList, /formatMoney\(item\.line_total/);
});

test("user order cancellation blocks BEP20 sessions with chain activity before releasing inventory", () => {
  const route = file("app/api/orders/[orderNo]/route.ts");

  assert.match(route, /getSupabaseServiceRoleClient/);
  assert.match(route, /BEP20_CANCEL_BLOCKING_STATUSES/);
  for (const status of ["confirming", "verified", "completing", "manual_review", "underpaid", "payment_failed", "paid"]) {
    assert.match(route, new RegExp(`"${status}"`));
  }
  assert.match(route, /\.from\("chain_payment_sessions"\)/);
  assert.match(route, /\.from\("chain_transaction_claims"\)/);
  assert.match(route, /BEP20_PAYMENT_IN_PROGRESS/);
  assert.match(route, /BEP20_TRANSACTION_CLAIMED/);
  assert.match(route, /const bep20CancelGuard = await assertBep20OrderCancelable\(order\)/);
  assert.match(route, /supabase\.rpc\("cancel_unpaid_order"/);
  assert.ok(
    route.indexOf("assertBep20OrderCancelable(order)") < route.indexOf('supabase.rpc("cancel_unpaid_order"'),
    "BEP20 cancel guard must run before cancel_unpaid_order"
  );
});

test("order expiration internal job is protected and has a local readiness check", () => {
  const route = file("app/api/internal/orders/expire/route.ts");
  const service = file("lib/orders/order-expiration.ts");
  const script = file("scripts/check-order-expiration-readiness.mjs");
  const pkg = file("package.json");

  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /handleOrderExpirationRequest/);
  assert.match(route, /assertOrderExpirationJobAuthorized\(request\)/);
  assert.match(route, /searchParams\.get\("limit"\)/);
  assert.match(route, /searchParams\.get\("dry_run"\)/);
  assert.match(route, /parseLimit\(options\.limit, 50, 200\)/);
  assert.match(route, /parseLimit\(options\.limit, 10, 50\)/);
  assert.match(route, /listExpirableUnpaidOrdersDryRun\(limit\)/);
  assert.match(route, /success: false/);
  assert.match(route, /readiness_code: "CODE_OR_DB_NOT_READY"/);
  assert.match(route, /error_code: dryRunResult\.code/);
  assert.match(route, /status: 503/);
  assert.match(route, /success: true/);
  assert.match(route, /order_id_summary: item\.orderIdSummary/);
  assert.doesNotMatch(route, /order_id: item\.orderId/);
  assert.doesNotMatch(route, /candidate_count:\s*0[\s\S]{0,200}error:/);
  assert.match(route, /processed/);
  assert.match(route, /skipped/);
  assert.match(route, /failed/);

  assert.match(service, /CRON_SECRET/);
  assert.match(service, /ORDER_EXPIRATION_JOB_SECRET/);
  assert.match(service, /INTERNAL_JOB_SECRET/);
  assert.match(service, /getSupabaseServiceRoleClient/);
  assert.match(service, /service\.rpc\("expire_unpaid_order"/);
  assert.match(service, /service\.rpc\("list_expirable_unpaid_orders"/);
  assert.match(service, /listExpirableUnpaidOrdersDryRun/);
  assert.match(service, /ORDER_EXPIRATION_RPC_UNAVAILABLE/);
  assert.match(service, /ok: false/);
  assert.ok(
    service.indexOf("listExpirableUnpaidOrdersDryRun") < service.indexOf("assertOrderExpirationJobAuthorized"),
    "dry-run helper must not call the expiration RPC"
  );

  assert.match(script, /Order expiration readiness: PASS/);
  assert.match(script, /CODE_NOT_READY/);
  assert.match(script, /CONFIG_NOT_READY/);
  assert.match(script, /SCHEDULE_NOT_CONFIGURED/);
  assert.match(script, /CRON_SECRET/);
  assert.match(script, /ORDER_EXPIRATION_JOB_SECRET/);
  assert.match(script, /INTERNAL_JOB_SECRET/);
  assert.match(script, /app\/api\/internal\/orders\/expire\/route\.ts/);
  assert.match(script, /lib\/orders\/order-expiration\.ts/);
  assert.match(script, /vercel\.json/);
  assert.match(script, /\/api\/internal\/orders\/expire/);
  assert.match(script, /process\.exit\(1\)/);
  assert.doesNotMatch(script, /fetch\(/);
  assert.doesNotMatch(script, /createClient/);
  assert.match(pkg, /"check:order-expiration-readiness": "node scripts\/check-order-expiration-readiness\.mjs"/);
});

test("order payment completion does not mutate inventory after order creation", () => {
  const migration = file("supabase/migrations/20260710_order_payment_inventory_idempotency_fix.sql");
  assert.match(migration, /create or replace function public\.complete_order_payment/);
  const fn = migration.match(/create or replace function public\.complete_order_payment[\s\S]*?revoke execute on function public\.complete_order_payment/)?.[0] ?? "";
  assert.ok(fn, "complete_order_payment replacement must be present");
  assert.match(migration, /public\.release_order_inventory\(uuid,text\)/);
  assert.match(migration, /public\.order_status_logs/);
  assert.match(migration, /UNIQUE index or constraint on public\.order_payments\.payment_no/);
  assert.match(migration, /public\.orders\.status CHECK constraint does not allow/);
  assert.match(migration, /public\.orders\.payment_status CHECK constraint does not allow/);
  assert.match(fn, /Inventory is already deducted or reserved by create_order_with_item/);
  assert.match(fn, /insert into public\.order_payments/);
  assert.match(fn, /v_order\.payment_status = 'paid'/);
  assert.match(fn, /v_from_status := v_order\.status/);
  assert.match(fn, /v_from_status,\s*\n\s*v_next_status/);
  assert.match(fn, /security definer/);
  assert.match(fn, /set search_path = public/);
  assert.doesNotMatch(fn, /set\s+stock\s*=/i);
  assert.doesNotMatch(fn, /stock\s*-\s*/i);
  assert.doesNotMatch(fn, /update\s+public\.digital_inventory/i);
});

test("order API keeps an RPC-created order successful when agreement evidence is unavailable", () => {
  const route = file("app/api/orders/route.ts");
  const legal = file("lib/legal/legal-service.ts");
  const checkout = file("app/checkout/page.tsx");

  assert.doesNotMatch(route, /compensateOrderAfterAgreementFailure/);
  assert.doesNotMatch(route, /agreement_record_failed/);
  assert.doesNotMatch(route, /ORDER_AGREEMENT_(?:RECORD_FAILED_COMPENSATED|COMPENSATION_FAILED)/);
  assert.match(route, /warningCode = "ORDER_AGREEMENT_EVIDENCE_PENDING"/);
  assert.match(route, /stage: "AGREEMENT_EVIDENCE_FAILED"/);
  assert.match(route, /ORDER_CREATED_READ_FAILED/);
  assert.match(route, /ORDER_CREATED_POSTPROCESSING_FAILED/);
  assert.match(route, /request_id: completedOrder\.requestId/);
  assert.match(route, /order_no: completedOrder\.orderNo/);
  assert.match(route, /RPC_COMPLETED/);
  assert.match(route, /ORDER_READ_STARTED/);
  assert.match(route, /ORDER_READ_COMPLETED/);
  assert.match(route, /AGREEMENT_EVIDENCE_STARTED/);
  assert.match(route, /AGREEMENT_EVIDENCE_COMPLETED/);
  assert.match(route, /RESPONSE_BUILD_COMPLETED/);
  assert.doesNotMatch(route, /(?:Cookie|Authorization|access_token|refresh_token)\s*:/i);

  assert.match(legal, /const \{ error: evidenceError \} = await service\.from\("order_evidence_events"\)\.insert/);
  assert.match(legal, /if \(evidenceError\) throw evidenceError/);

  assert.match(checkout, /const clientRequestIdRef = useRef\(""\)/);
  assert.match(checkout, /if \(!clientRequestIdRef\.current\)/);
  assert.match(checkout, /client_request_id: clientRequestIdRef\.current/);
  assert.doesNotMatch(checkout, /clientRequestIdRef\.current\s*=\s*["']{2}\s*;/);
  assert.match(checkout, /if \(orderNo\) \{\s*router\.push\(`\/payment\?order=/);
  assert.match(checkout, /if \(!productRow \|\| submitLoading\) return/);
  assert.match(checkout, /disabled=\{submitLoading\}/);
  assert.match(checkout, /type="button"[\s\S]*?onClick=\{handleSubmit\}/);
  assert.match(checkout, /id="checkout-submit-feedback"[\s\S]*?aria-live="polite"/);
  assert.match(checkout, /aria-describedby="checkout-submit-feedback"/);
});

test("checkout and user order views keep payment and fulfillment presentation scoped", () => {
  const checkout = file("app/checkout/page.tsx");
  const orders = file("app/account/orders/page.tsx");
  const success = file("app/order-success/page.tsx");

  assert.doesNotMatch(checkout, /联系电话（可选）|便于客服核对订单/);
  assert.match(checkout, /const \[customerPhone, setCustomerPhone\] = useState\(""\)/);
  assert.match(checkout, /\["shipping", "physical"\]\.includes\(String\(productRow\?\.delivery_type/);
  assert.match(checkout, /isShippingProduct && \(!customerName\.trim\(\) \|\| !customerPhone\.trim\(\)/);
  assert.match(checkout, /isShippingProduct && !isValidContactPhone\(customerPhone\)/);
  assert.match(checkout, /<span className="text-red-500">\*<\/span>联系电话/);
  assert.match(checkout, /\.\.\.\(isShippingProduct \? \{ customer_phone: customerPhone\.trim\(\) \} : \{\}\)/);
  assert.doesNotMatch(checkout, /customer_phone:\s*customerPhone,\s*shipping_address/);
  assert.match(checkout, /agreement_version_ids:\s*agreementPayload/);
  assert.match(checkout, /agreements:\s*agreementPayload/);
  assert.match(checkout, /max-h-\[178px\] overflow-y-auto/);
  assert.match(checkout, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"/);
  assert.match(checkout, /event\.key === "Enter" && open/);
  assert.match(checkout, /event\.key === "Escape"/);
  assert.match(checkout, /h-14 w-full items-center/);

  assert.match(orders, /paymentAction && paymentAction\.kind !== "renew"/);
  assert.match(orders, /normalizeOrderItemDeliveryType[\s\S]*?=== "physical"/);
  assert.match(orders, /isShippingOrder \? \([\s\S]*?<InfoLine label="收货信息"/);
  assert.match(success, /isShippingOrder \? <InfoRow label="收货信息"/);
});

test("admin order status cannot bypass payment flow", () => {
  const route = file("app/api/admin/orders/[orderId]/route.ts");
  const migration = file("supabase/migrations/20260710_order_payment_inventory_idempotency_fix.sql");
  const rpc = migration.match(/create or replace function public\.admin_update_order_status[\s\S]*?revoke execute on function public\.admin_update_order_status/)?.[0] ?? "";
  assert.match(route, /PAYMENT_FLOW_ONLY_ORDER_STATUSES/);
  assert.match(route, /ORDER_PAYMENT_STATUS_REQUIRES_PAYMENT_FLOW/);
  assert.match(migration, /ORDER_PAYMENT_STATUS_REQUIRES_PAYMENT_FLOW/);
  assert.match(rpc, /v_payment_status = 'paid'/);
  assert.match(rpc, /v_to_status in \('paid', 'payment_completed', 'completed_payment'\)/);
  assert.match(rpc, /public\.is_admin\(\)/);
  assert.match(rpc, /set search_path = public/);
  assert.match(migration, /revoke execute on function public\.admin_update_order_status\(uuid,text,text,text\)\s+from anon/);
  assert.doesNotMatch(rpc, /deliver_digital_order/i);
  assert.doesNotMatch(rpc, /set\s+stock\s*=/i);
});

test("order payment inventory verification SQL covers all critical scenarios without permanent writes", () => {
  const sql = file("docs/order-payment-inventory-verification.sql");

  assert.match(sql, /^\s*BEGIN;/m);
  assert.match(sql, /^\s*ROLLBACK;/m);
  assert.match(sql, /v_confirm_test_database boolean := false/);
  assert.match(sql, /TEST DATABASE CONFIRMATION REQUIRED/);
  assert.doesNotMatch(sql, /REPLACE_TEST_/);
  assert.doesNotMatch(sql, /REPLACE_/);
  for (const removedPlaceholder of [
    "NORMAL_PRODUCT_UUID",
    "SKU_PRODUCT_UUID",
    "SKU_UUID",
    "DIGITAL_PRODUCT_UUID",
  ]) {
    assert.doesNotMatch(sql, new RegExp(removedPlaceholder));
  }
  assert.match(sql, /TEST_USER_UUID/);
  assert.match(sql, /TEST_ADMIN_UUID/);
  assert.doesNotMatch(sql, /'TEST_USER_UUID'::uuid|'TEST_ADMIN_UUID'::uuid|'NORMAL_PRODUCT_UUID'::uuid|'SKU_UUID'::uuid/);
  assert.match(sql, /INSERT INTO public\.products/i);
  assert.match(sql, /INSERT INTO public\.product_skus/i);
  assert.match(sql, /INSERT INTO public\.product_option_groups/i);
  assert.match(sql, /INSERT INTO public\.product_option_values/i);
  assert.match(sql, /INSERT INTO public\.product_sku_values/i);
  assert.match(sql, /INSERT INTO public\.digital_inventory/i);
  assert.match(sql, /'available'/);
  assert.match(sql, /verification/);
  assert.match(sql, /gen_random_uuid\(\)/);
  assert.match(sql, /FIXTURE_NORMAL_PRODUCT_CREATED/);
  assert.match(sql, /FIXTURE_SKU_PRODUCT_CREATED/);
  assert.match(sql, /FIXTURE_SKU_CREATED/);
  assert.match(sql, /FIXTURE_DIGITAL_PRODUCT_CREATED/);
  assert.match(sql, /FIXTURE_DIGITAL_INVENTORY_CREATED/);
  assert.match(sql, /ORDER_ITEMS_FIXTURE_PREFLIGHT/);
  for (const orderItemColumn of [
    "product_name",
    "sku_id",
    "sku_code",
    "sku_title",
    "option_snapshot",
    "quantity",
    "unit_price",
    "line_total",
    "delivery_type",
  ]) {
    assert.match(sql, new RegExp(`\\('${orderItemColumn}'\\)`));
  }
  for (const optionalOrderItemColumn of [
    "currency",
    "product_slug",
    "product_image_url",
    "product_snapshot",
    "delivery_status",
  ]) {
    assert.doesNotMatch(sql, new RegExp(`\\('${optionalOrderItemColumn}'\\)`));
  }
  assert.match(sql, /ORDER_ITEMS_CURRENCY_COLUMN_PRESENT/);
  assert.match(sql, /ORDER_ITEMS_CURRENCY_COLUMN_ABSENT_USING_ORDER_CURRENCY/);
  assert.match(sql, /v_order_row\.currency/);
  assert.match(sql, /verification-nonsecret-content/);
  assert.doesNotMatch(sql, /card_secret|real[_ -]?secret|真实卡密|真实账号/i);
  assert.doesNotMatch(sql, /reserved_user_id/i);
  assert.doesNotMatch(sql, /update\s+public\.profiles/i);

  assert.match(sql, /orders_user_client_request_uidx/i);
  assert.match(sql, /CREATE UNIQUE INDEX/i);
  assert.match(sql, /\(user_id,client_request_id\)/i);
  assert.match(sql, /client_request_idisnotnull/i);
  assert.match(sql, /btrim\(client_request_id\)<>/i);

  for (const signature of [
    "create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)",
    "cancel_unpaid_order(uuid,text)",
    "expire_unpaid_order(uuid,text)",
    "deliver_digital_order(uuid,text)",
    "complete_order_payment(uuid,text,text,text,numeric,text,timestamp with time zone)",
    "admin_update_order_status(uuid,text,text,text)",
  ]) {
    assert.match(sql, new RegExp(signature.replace(/[()]/g, "\\$&")));
  }

  for (const expected of [
    "normal product order creation reduced stock once",
    "normal product payment completion did not reduce stock again",
    "repeated payment completion is idempotent",
    "SKU order creation reduced SKU stock",
    "SKU payment completion and repeated payment",
    "normal unpaid cancel restores stock once",
    "SKU unpaid cancel restores SKU stock once",
    "digital unpaid cancel releases reserved inventory",
    "normal expiration restores stock once",
    "digital reservation, payment, delivery, and repeated delivery are idempotent",
    "admin_update_order_status blocks direct paid transitions",
  ]) {
    assert.match(sql, new RegExp(expected));
  }

  assert.match(sql, /public\.cancel_unpaid_order/);
  assert.match(sql, /public\.expire_unpaid_order/);
  assert.match(sql, /public\.deliver_digital_order/);
  assert.match(sql, /public\.complete_order_payment/);
  assert.match(sql, /public\.admin_update_order_status/);
  assert.match(sql, /public\.order_payments/);
  assert.match(sql, /public\.order_status_logs/);
  assert.match(sql, /digital_delivery_secrets/);
  assert.match(sql, /paid_at unexpectedly reset|paid_at/);
  assert.match(sql, /v_request_id := 'normal-pay-'/);
  assert.match(sql, /v_request_id := 'sku-pay-'/);
  assert.match(sql, /v_request_id := 'digital-pay-'/);
  assert.match(sql, /v_repeat_order\.order_id IS DISTINCT FROM v_order\.order_id/);
  assert.match(sql, /count\(\*\) FROM public\.orders WHERE user_id = v_test_user_id AND client_request_id = v_request_id/i);
  assert.match(sql, /count\(\*\) FROM public\.order_items WHERE order_id = v_order\.order_id/i);
  assert.match(sql, /coalesce\(\(v_result->>'idempotent'\)::boolean, false\) IS NOT TRUE/i);
  assert.match(sql, /expected NOT_DUE/i);
  assert.match(sql, /expected EXPIRED/i);
  assert.match(sql, /ALREADY_CANCELLED/);
  assert.match(sql, /ALREADY_EXPIRED/);
  assert.match(sql, /delivered digital inventory was restored or cancel result was unsafe/i);

  for (const stage of [
    "FIXTURE_CATEGORY_READY",
    "FIXTURE_NORMAL_PRODUCT_CREATED",
    "FIXTURE_SKU_PRODUCT_CREATED",
    "FIXTURE_SKU_CREATED",
    "FIXTURE_DIGITAL_PRODUCT_CREATED",
    "FIXTURE_DIGITAL_INVENTORY_CREATED",
    "NORMAL_ORDER_CREATED",
    "NORMAL_PAYMENT_COMPLETED",
    "NORMAL_PAYMENT_REPEAT_IDEMPOTENT",
    "SKU_ORDER_CREATED",
    "SKU_PAYMENT_COMPLETED",
    "SKU_PAYMENT_REPEAT_IDEMPOTENT",
    "DIGITAL_ORDER_CREATED",
    "DIGITAL_INVENTORY_RESERVED",
    "DIGITAL_PAYMENT_COMPLETED",
    "DIGITAL_PAYMENT_REPEAT_IDEMPOTENT",
    "DIGITAL_DELIVERY_COMPLETED",
    "DIGITAL_DELIVERY_REPEAT_IDEMPOTENT",
    "CANCEL_NORMAL_IDEMPOTENT",
    "CANCEL_SKU_IDEMPOTENT",
    "CANCEL_DIGITAL_IDEMPOTENT",
    "EXPIRE_ORDER_IDEMPOTENT",
    "ADMIN_PAID_BYPASS_BLOCKED",
    "ALL_ORDER_PAYMENT_INVENTORY_CHECKS_PASSED",
  ]) {
    assert.match(sql, new RegExp(`PASS: ${stage}`));
  }

  assert.match(sql, /ROLLBACK;[\s\S]*select id, name, slug[\s\S]*ilike '%verification%'/i);
  assert.match(sql, /RAISE EXCEPTION/i);
});

test("order lifecycle compatibility baseline only backfills lifecycle RPCs", () => {
  const migration = file("supabase/migrations/20260710_order_lifecycle_compatibility_baseline.sql");
  const verification = file("docs/order-lifecycle-compatibility-verification.sql");

  assert.match(migration, /add column if not exists payment_expires_at timestamptz,\s*\n\s*add column if not exists reservation_released_at timestamptz,\s*\n\s*add column if not exists expired_at timestamptz/);
  const preflight = migration.match(/select array_remove\(array\[[\s\S]*?raise exception 'order lifecycle compatibility baseline missing required columns/)?.[0] ?? "";
  assert.doesNotMatch(preflight, /orders\.payment_expires_at/);
  assert.doesNotMatch(preflight, /orders\.reservation_released_at/);
  assert.doesNotMatch(preflight, /orders\.expired_at/);
  assert.match(migration, /create or replace function public\.release_order_inventory\(\s*p_order_id uuid,\s*p_reason text default 'release'\s*\)/);
  assert.doesNotMatch(migration, /create or replace function public\.release_order_inventory\(p_order_id uuid\)/);
  assert.doesNotMatch(migration, /drop function\s+(if exists\s+)?public\.release_order_inventory\(uuid\)/i);
  assert.match(migration, /if to_regprocedure\('public\.release_order_inventory\(uuid\)'\) is null then/);
  assert.match(migration, /create function public\.release_order_inventory\(p_order_id uuid\)/);
  assert.match(migration, /Keeping existing public\.release_order_inventory\(uuid\) without changing its return type/);
  assert.match(migration, /create or replace function public\.cancel_unpaid_order/);
  assert.match(migration, /create or replace function public\.expire_unpaid_order/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public/);
  assert.match(migration, /for update/);
  assert.match(migration, /reservation_released_at is not null/);
  assert.match(migration, /ALREADY_RELEASED/);
  assert.match(migration, /ORDER_NOT_RELEASABLE/);
  assert.match(migration, /released_normal/);
  assert.match(migration, /released_sku/);
  assert.match(migration, /released_digital/);
  assert.match(migration, /and oi\.sku_id is not null/);
  assert.match(migration, /and oi\.sku_id is null/);
  assert.match(migration, /di\.status = 'reserved'/);
  assert.match(migration, /di\.delivered_at is null/);
  assert.match(migration, /di\.delivered_order_id is null/);
  assert.match(migration, /ORDER_NOT_CANCELLABLE/);
  assert.match(migration, /NOT_DUE/);
  assert.match(migration, /ALREADY_EXPIRED/);
  assert.match(migration, /grant execute on function public\.cancel_unpaid_order\(uuid, text\) to authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.expire_unpaid_order\(uuid, text\) to service_role/);
  assert.match(migration, /grant execute on function public\.release_order_inventory\(uuid, text\) to service_role/);

  for (const forbidden of [
    /create or replace function public\.create_order_with_item/i,
    /create or replace function public\.complete_order_payment/i,
    /create or replace function public\.deliver_digital_order/i,
    /create or replace function public\.admin_update_order_status/i,
    /create or replace function public\.complete_payment_session/i,
  ]) {
    assert.doesNotMatch(migration, forbidden);
  }

  assert.match(verification, /BEGIN;/);
  assert.match(verification, /ROLLBACK;/);
  assert.match(verification, /v_confirm_test_database boolean := false/);
  assert.match(verification, /TEST DATABASE CONFIRMATION REQUIRED/);
  for (const removedPlaceholder of [
    "NORMAL_PRODUCT_UUID",
    "SKU_PRODUCT_UUID",
    "SKU_UUID",
    "DIGITAL_PRODUCT_UUID",
    "TEST_OTHER_USER_UUID",
  ]) {
    assert.doesNotMatch(verification, new RegExp(removedPlaceholder));
  }
  assert.match(verification, /TEST_USER_UUID/);
  assert.match(verification, /TEST_ADMIN_UUID/);
  assert.match(verification, /insert into public\.products/i);
  assert.match(verification, /insert into public\.product_skus/i);
  assert.match(verification, /insert into public\.product_option_groups/i);
  assert.match(verification, /insert into public\.product_option_values/i);
  assert.match(verification, /insert into public\.product_sku_values/i);
  assert.match(verification, /insert into public\.digital_inventory/i);
  assert.match(verification, /'available'/);
  assert.match(verification, /verification/);
  assert.match(verification, /gen_random_uuid\(\)/);
  assert.match(verification, /FIXTURE_NORMAL_PRODUCT_CREATED/);
  assert.match(verification, /FIXTURE_SKU_PRODUCT_CREATED/);
  assert.match(verification, /FIXTURE_SKU_CREATED/);
  assert.match(verification, /FIXTURE_DIGITAL_PRODUCT_CREATED/);
  assert.match(verification, /FIXTURE_DIGITAL_INVENTORY_CREATED/);
  assert.match(verification, /ORDER_ITEMS_FIXTURE_PREFLIGHT/);
  for (const orderItemColumn of [
    "product_name",
    "sku_id",
    "sku_code",
    "sku_title",
    "option_snapshot",
    "quantity",
    "unit_price",
    "line_total",
    "delivery_type",
  ]) {
    assert.match(verification, new RegExp(`\\('${orderItemColumn}'\\)`));
  }
  for (const optionalOrderItemColumn of [
    "currency",
    "product_slug",
    "product_image_url",
    "product_snapshot",
    "delivery_status",
  ]) {
    assert.doesNotMatch(verification, new RegExp(`\\('${optionalOrderItemColumn}'\\)`));
  }
  assert.match(verification, /ORDER_ITEMS_CURRENCY_COLUMN_PRESENT/);
  assert.match(verification, /ORDER_ITEMS_CURRENCY_COLUMN_ABSENT_USING_ORDER_CURRENCY/);
  assert.match(verification, /FIXTURE_NORMAL_ORDER_ITEM_CREATED/);
  assert.match(verification, /FIXTURE_SKU_ORDER_ITEM_CREATED/);
  assert.match(verification, /FIXTURE_DIGITAL_ORDER_ITEM_CREATED/);
  const orderItemInsertBlocks = [...verification.matchAll(/insert into public\.order_items\([\s\S]*?\)\s*values/gi)].map((match) => match[0]);
  assert.ok(orderItemInsertBlocks.length >= 3);
  for (const insertBlock of orderItemInsertBlocks) {
    assert.doesNotMatch(insertBlock, /\bcurrency\b/i);
    assert.doesNotMatch(insertBlock, /\bproduct_slug\b/i);
    assert.doesNotMatch(insertBlock, /\bproduct_image_url\b/i);
    assert.doesNotMatch(insertBlock, /\bproduct_snapshot\b/i);
    assert.doesNotMatch(insertBlock, /\bdelivery_status\b/i);
  }
  assert.match(verification, /insert into public\.orders\(id, order_no, user_id, status, payment_status, total_amount, currency/);
  assert.match(verification, /sku_id, sku_code, sku_title, option_snapshot/);
  assert.match(verification, /1,\s*1,\s*1,\s*'automatic'/);
  assert.match(verification, /verification-nonsecret-content/);
  assert.doesNotMatch(verification, /card_secret|real[_ -]?secret|真实卡密|真实账号/i);
  assert.match(verification, /RAISE EXCEPTION/i);
  assert.match(verification, /pg_get_function_result\(p\.oid\) as return_type/);
  assert.match(verification, /cancel_unpaid_order calls release_order_inventory\(uuid,text\)/);
  assert.match(verification, /expire_unpaid_order calls release_order_inventory\(uuid,text\)/);
  assert.match(verification, /md5\(pg_get_functiondef\(p\.oid\)\) as function_hash/);
  assert.match(verification, /complete_order_payment/);
  assert.match(verification, /create_order_with_item/);
  assert.match(verification, /deliver_digital_order/);
  assert.match(verification, /admin_update_order_status/);
  assert.match(verification, /normal unpaid order cancellation releases stock once/);
  assert.match(verification, /SKU unpaid order cancellation restores SKU stock only/);
  assert.match(verification, /digital reserved inventory cancellation restores available state/);
  assert.match(verification, /paid order cannot release inventory/);
  assert.match(verification, /not-yet-due order cannot expire/);
  assert.match(verification, /due order expiration releases stock once/);
});

test("order status constraint compatibility allows expired without touching lifecycle functions", () => {
  const migration = file("supabase/migrations/20260710_order_status_constraints_compatibility.sql");
  const verification = file("docs/order-status-constraints-verification.sql");

  for (const status of [
    "pending_payment",
    "paid",
    "processing",
    "delivered",
    "completed",
    "cancelled",
    "expired",
    "refunded",
    "failed",
  ]) {
    assert.match(migration, new RegExp(`'${status}'`));
  }

  assert.match(migration, /to_regclass\('public\.orders'\)/);
  assert.match(migration, /public\.orders\.status/);
  assert.match(migration, /v_unknown_statuses/);
  assert.match(migration, /status <> all\(v_allowed_statuses\)/);
  assert.match(migration, /orders\.status contains values outside the compatibility set/);
  assert.match(migration, /drop constraint if exists orders_status_check/i);
  assert.match(migration, /add constraint orders_status_check/i);
  assert.doesNotMatch(migration, /orders_payment_status_check[\s\S]{0,120}drop constraint/i);
  assert.doesNotMatch(migration, /update\s+public\.orders/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.orders/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.orders/i);

  for (const forbidden of [
    /create or replace function public\.create_order_with_item/i,
    /create or replace function public\.complete_order_payment/i,
    /create or replace function public\.deliver_digital_order/i,
    /create or replace function public\.release_order_inventory/i,
    /create or replace function public\.cancel_unpaid_order/i,
    /create or replace function public\.expire_unpaid_order/i,
    /create or replace function public\.admin_update_order_status/i,
  ]) {
    assert.doesNotMatch(migration, forbidden);
  }

  assert.match(verification, /orders_status_check/);
  assert.match(verification, /orders_payment_status_check/);
  assert.match(verification, /unknown_order_status/);
  assert.match(verification, /unknown_payment_status/);
  assert.match(verification, /allows_expired/);
  assert.match(verification, /BEGIN;/);
  assert.match(verification, /ROLLBACK;/);
  assert.match(verification, /status = 'expired'/);
  assert.match(verification, /status = 'verification_invalid_status'/);
  assert.match(verification, /check_violation/);
  assert.match(verification, /partially_refunded/);
});

test("create-order compatibility adds only the 10-argument overload and preserves the legacy RPC", () => {
  const migration = file("supabase/migrations/20260710_create_order_with_item_compatibility.sql");
  const verification = file("docs/create-order-with-item-compatibility-verification.sql");
  const inventoryVerification = file("docs/order-payment-inventory-verification.sql");

  assert.match(
    migration,
    /create or replace function public\.create_order_with_item\(\s*p_product_id uuid,\s*p_quantity integer default 1,\s*p_customer_email text default null,\s*p_customer_name text default null,\s*p_customer_phone text default null,\s*p_customer_note text default null,\s*p_shipping_address jsonb default null,\s*p_sku_id uuid default null,\s*p_payment_method text default 'balance',\s*p_client_request_id text default null\s*\)/i
  );
  assert.doesNotMatch(migration, /drop function\s+(if exists\s+)?public\.create_order_with_item/i);
  assert.doesNotMatch(
    migration,
    /create or replace function public\.create_order_with_item\(\s*p_product_id uuid,\s*p_quantity integer default 1,\s*p_customer_email text default null,\s*p_customer_name text default null,\s*p_customer_phone text default null,\s*p_customer_note text default null,\s*p_shipping_address jsonb default null\s*\)/i
  );

  assert.match(migration, /returns table\s*\(\s*order_id uuid,\s*order_no text,\s*status text,\s*payment_status text,\s*total_amount numeric\s*\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = public/i);
  assert.match(migration, /alter table public\.orders\s+add column if not exists client_request_id text/i);
  assert.match(migration, /group by o\.user_id, o\.client_request_id\s+having count\(\*\) > 1/i);
  assert.match(migration, /found duplicate \(user_id, client_request_id\)/i);
  assert.match(migration, /create unique index if not exists orders_user_client_request_uidx\s+on public\.orders\(user_id, client_request_id\)\s+where client_request_id is not null and btrim\(client_request_id\) <> ''/i);
  const dependencyPreflight = migration.match(/do \$\$[\s\S]*?create_order_with_item compatibility missing required columns:[\s\S]*?end;\s*\$\$;/i)?.[0] ?? "";
  assert.ok(dependencyPreflight, "create-order dependency preflight must be present");
  assert.doesNotMatch(dependencyPreflight, /orders\.client_request_id/);
  assert.doesNotMatch(dependencyPreflight, /digital_inventory\.reserved_user_id/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended/i);
  assert.match(migration, /o\.user_id = v_user_id\s+and o\.client_request_id = v_request_id/i);
  assert.match(migration, /update public\.product_skus as s[\s\S]*?set stock = s\.stock - v_quantity/i);
  assert.match(migration, /update public\.products as p[\s\S]*?set stock = p\.stock - v_quantity/i);
  assert.match(migration, /status = 'reserved'/i);
  assert.match(migration, /reserved_order_id = v_order_id/i);
  assert.match(migration, /reserved_order_item_id = v_order_item_id/i);
  assert.doesNotMatch(migration, /reserved_user_id\s*=/i);
  assert.match(migration, /product_snapshot/i);
  assert.match(migration, /option_snapshot/i);
  assert.doesNotMatch(migration, /insert into public\.order_items[\s\S]{0,300}\bcurrency\b/i);

  for (const forbiddenFunction of [
    "complete_order_payment",
    "deliver_digital_order",
    "cancel_unpaid_order",
    "expire_unpaid_order",
    "complete_payment_session",
  ]) {
    assert.doesNotMatch(
      migration,
      new RegExp(`create or replace function public\\.${forbiddenFunction}`, "i")
    );
  }

  assert.match(migration, /revoke all on function public\.create_order_with_item\(uuid, integer, text, text, text, text, jsonb, uuid, text, text\)\s+from public, anon/i);
  assert.match(migration, /grant execute on function public\.create_order_with_item\(uuid, integer, text, text, text, text, jsonb, uuid, text, text\)\s+to authenticated, service_role/i);

  assert.match(verification, /create_order_with_item\(uuid,integer,text,text,text,text,jsonb\)/i);
  assert.match(verification, /create_order_with_item\(uuid,integer,text,text,text,text,jsonb,uuid,text,text\)/i);
  assert.match(verification, /md5\(pg_get_functiondef\(p\.oid\)\) as function_hash/i);
  assert.match(verification, /pg_get_function_result\(p\.oid\) as return_type/i);
  assert.match(verification, /p\.prosecdef as security_definer/i);
  assert.match(verification, /anon_can_execute/i);
  assert.match(verification, /authenticated_can_execute/i);
  assert.match(verification, /service_role_can_execute/i);
  assert.match(verification, /current_overload_has_sku_branch/i);
  assert.match(verification, /current_overload_has_idempotency_lock/i);
  assert.match(verification, /current_overload_reserves_digital_inventory/i);
  assert.match(verification, /orders_user_client_request_uidx/i);
  assert.match(verification, /duplicate_count/i);
  assert.match(verification, /current_overload_does_not_require_reserved_user_id/i);
  assert.match(verification, /current_overload_does_not_complete_or_deliver/i);

  assert.match(
    inventoryVerification,
    /v_request_id := 'sku-pay-'[\s\S]*?public\.create_order_with_item\(\s*v_sku_product_id,\s*1,[\s\S]*?v_sku_id,\s*'balance',\s*v_request_id\s*\)/i
  );
  assert.doesNotMatch(inventoryVerification, /create_order_with_item\([^)]*\)\s*;?\s*--\s*legacy/i);
  assert.doesNotMatch(inventoryVerification, /reserved_user_id/i);
});

test("order status labels are valid UTF-8 Chinese and include expired", () => {
  const status = file("lib/orders/order-status.ts");
  assert.match(status, /expired: "已过期"/);
  assert.match(status, /pending_payment: "待支付"/);
  assert.match(status, /partially_refunded: "部分退款"/);
  assert.doesNotMatch(status, /寰呮|宸叉|閫|鏈|�/);
});

test("recharge user APIs enforce ownership", () => {
  const listRoute = file("app/api/recharges/route.ts");
  const detailRoute = file("app/api/recharges/[rechargeNo]/route.ts");
  const proofRoute = file("app/api/recharges/[rechargeNo]/proof/route.ts");
  const adminRoute = file("app/api/admin/recharges/route.ts");

  assert.match(listRoute, /supabase\.auth\.getUser/);
  assert.match(listRoute, /RECHARGE_STATUSES/);
  const listQuery = listRoute.match(/from\("account_recharges"\)[\s\S]*?const \{ data, error, count \} = await query;/)?.[0] ?? "";
  assert.match(listQuery, /\.eq\("user_id", context\.user\.id\)/);
  assert.match(listQuery, /\.range\(\(page - 1\) \* pageSize, page \* pageSize - 1\)/);
  assert.match(listRoute, /query = query\.eq\("status", status\)/);
  assert.doesNotMatch(listQuery, /searchParams\.get\("user_id"\)|searchParams\.get\("userId"\)/);

  assert.match(detailRoute, /supabase\.auth\.getUser/);
  assert.match(detailRoute, /RECHARGE_AUTH_REQUIRED/);
  assert.match(detailRoute, /RECHARGE_NOT_FOUND/);
  const detailQuery = detailRoute.match(/from\("account_recharges"\)[\s\S]*?maybeSingle\(\)/)?.[0] ?? "";
  assert.match(detailQuery, /\.eq\("recharge_no", rechargeNo\)/);
  assert.match(detailQuery, /\.eq\("user_id", authData\.user\.id\)/);
  assert.doesNotMatch(detailRoute, /getSupabaseServiceRoleClient/);

  assert.match(proofRoute, /\.eq\("recharge_no", params\.rechargeNo\)\.eq\("user_id", context\.user\.id\)/);
  assert.match(adminRoute, /requireApiAdmin|getServerAdminContext|requireSuperAdmin/);
});

test("account profile initialization never grants admin role from ordinary user API", () => {
  const route = file("app/api/account/profile/route.ts");
  const sharedProfile = file("lib/supabase/profiles.ts");

  assert.match(route, /const DEFAULT_PROFILE_ROLE = "user"/);
  assert.match(route, /role: DEFAULT_PROFILE_ROLE/);
  assert.doesNotMatch(route, /getRoleForEmail/);
  assert.doesNotMatch(route, /role:\s*.*admin/);
  assert.doesNotMatch(route, /gac000189@gmail\.com/i);

  const createProfileBlock = route.match(/async function createProfileOnce[\s\S]*?return \{ profile: null, error: created\.error \};\n}/)?.[0] ?? "";
  assert.ok(createProfileBlock, "createProfileOnce block must be present");
  assert.doesNotMatch(createProfileBlock, /email[\s\S]{0,160}admin/i);
  assert.doesNotMatch(createProfileBlock, /role:\s*body\.|role:\s*payload\.|role:\s*request/i);

  const updateAllowedFields = route.match(/const PROFILE_UPDATE_ALLOWED_FIELDS = \[[\s\S]*?\] as const;/)?.[0] ?? "";
  assert.ok(updateAllowedFields, "profile update field whitelist must be present");
  for (const forbidden of ["role", "admin", "admin_level", "is_admin", "permissions", "user_id"]) {
    assert.doesNotMatch(updateAllowedFields, new RegExp(forbidden));
  }
  assert.match(route, /Object\.entries\(body\)\.filter/);
  assert.match(route, /\.eq\("id", context\.user\.id\)/);

  assert.match(sharedProfile, /role: "user"/);
  assert.doesNotMatch(sharedProfile, /gac000189@gmail\.com/i);
});

test("two-user order isolation verification is read-only and matches ownership contracts", () => {
  const guide = file("docs/two-user-order-isolation-verification.md");
  const readonlySql = file("docs/two-user-order-isolation-readonly.sql");
  const orderRoutes = file("app/api/orders/route.ts");
  const detailRoute = file("app/api/orders/[orderNo]/route.ts");
  const queries = file("lib/orders/order-queries.ts");

  assert.match(guide, /\u6d4f\u89c8\u5668\u666e\u901a\u7a97\u53e3\u767b\u5f55\u7528\u6237 A/);
  assert.match(guide, /\u6d4f\u89c8\u5668\u65e0\u75d5\u7a97\u53e3\u767b\u5f55\u7528\u6237 B/);
  assert.match(guide, /\u4e0d\u8981\u590d\u5236\u5b8c\u6574 cURL/);
  assert.match(guide, /\u4e0d\u8981\u590d\u5236\u6216\u53d1\u9001 `Cookie`\u3001`Authorization`\u3001`access_token`/);
  assert.doesNotMatch(guide, /-H\s+["'](?:Cookie|Authorization):/i);

  assert.match(readonlySql, /p\.role = 'user'/);
  assert.match(readonlySql, /p\.id <> 'b0a56264-aa77-4409-b91e-74a1442cf60e'::uuid/);
  assert.match(readonlySql, /reservation_released_at/);
  assert.match(readonlySql, /cancelled_at/);
  assert.match(readonlySql, /order_item_count/);
  assert.match(readonlySql, /reserved_inventory_count/);
  assert.doesNotMatch(readonlySql, /\b(?:insert|update|delete)\b/i);
  assert.doesNotMatch(readonlySql, /\bcontent\b\s*(?:,|from)/i);

  assert.match(orderRoutes, /listUserOrders\(supabase, user\.id/);
  assert.match(queries, /from\("orders"\)[\s\S]*?\.eq\("user_id", userId\)/);
  assert.match(queries, /\.eq\("user_id", userId\)\s*\.eq\("order_no", orderNo\)\s*\.maybeSingle\(\)/);
  assert.match(detailRoute, /supabase\.rpc\("cancel_unpaid_order"/);
  assert.match(detailRoute, /p_order_id: order\.id/);
  assert.match(detailRoute, /p_reason: reason/);
});

test("user order reads scope deliveries through the owned order without delivery user_id", () => {
  const queries = file("lib/orders/order-queries.ts");
  const listRoute = file("app/api/orders/route.ts");
  const detailRoute = file("app/api/orders/[orderNo]/route.ts");
  const deliveryRoute = file("app/api/orders/[orderNo]/delivery/route.ts");
  const fulfillmentRoute = file("app/api/orders/[orderNo]/fulfillment/route.ts");
  const orderList = file("app/account/orders/page.tsx");
  const productDetail = file("app/products/[id]/page.tsx");
  const fulfillmentMigration = file("supabase/migrations/20260709_digital_delivery_reserved_fulfillment_hardening.sql");

  const orderSelect = queries.match(/const orderSelect = `([\s\S]*?)`;/)?.[1] ?? "";
  assert.match(
    orderSelect,
    /order_deliveries\(id,order_id,order_item_id,delivery_type,delivery_status,delivered_at,created_at,updated_at\)/
  );
  assert.doesNotMatch(orderSelect, /order_deliveries\(\*\)/);
  assert.doesNotMatch(orderSelect, /order_deliveries\([^)]*\buser_id\b/);
  assert.doesNotMatch(orderSelect, /order_deliveries\([^)]*delivery_content/);

  assert.match(listRoute, /listUserOrders\(supabase, user\.id/);
  assert.match(queries, /from\("orders"\)[\s\S]*?\.eq\("user_id", userId\)/);
  assert.match(queries, /\.eq\("user_id", userId\)\s*\.eq\("order_no", orderNo\)\s*\.maybeSingle\(\)/);
  assert.match(queries, /Array\.isArray\(row\.order_deliveries\)[\s\S]*?: \[\]/);

  assert.match(detailRoute, /getUserOrderByNo\(supabase, user\.id/);
  assert.match(deliveryRoute, /supabase\.rpc\("get_order_delivery_for_user"/);
  assert.match(fulfillmentRoute, /supabase\.rpc\("get_order_fulfillment_for_user"/);
  assert.match(deliveryRoute, /if \(userError \|\| !user\)/);
  assert.match(fulfillmentRoute, /if \(userError \|\| !user\)/);
  assert.match(fulfillmentMigration, /where order_no = p_order_no and user_id = auth\.uid\(\)/);
  assert.match(fulfillmentMigration, /if v_order\.payment_status <> 'paid' then raise exception 'order is not paid'/);
  assert.match(fulfillmentMigration, /then string_agg\(ds\.content/);
  assert.match(orderList, /Bep20OrderPaymentSummary/);
  assert.match(orderList, /TxHash|submittedTxHash|bep20/i);
  assert.match(productDetail, /publicMainPanelHeightClassName/);
});

test("user order cancellation uses the real PATCH detail API", () => {
  const page = file("app/account/orders/[orderNo]/page.tsx");
  const detailRoute = file("app/api/orders/[orderNo]/route.ts");

  assert.doesNotMatch(page, /\/api\/orders\/\$\{encodeURIComponent\(order\.order_no\)\}\/cancel/);
  assert.doesNotMatch(page, /method:\s*["']POST["'][\s\S]{0,180}取消订单失败/);
  assert.match(page, /fetch\(`\/api\/orders\/\$\{encodeURIComponent\(order\.order_no\)\}`/);
  assert.match(page, /method:\s*"PATCH"/);
  assert.match(page, /headers:\s*\{\s*"Content-Type":\s*"application\/json"\s*\}/);
  assert.match(page, /body:\s*JSON\.stringify\(\{\s*reason:\s*"用户主动取消"\s*\}\)/);
  assert.doesNotMatch(page, /body:\s*JSON\.stringify\([^)]*(?:user_id|userId|status|payment_status|inventory|stock)/s);
  assert.match(page, /canUserCancelOrder\(order\.status\)\s*&&\s*paymentStatus === "unpaid"/);
  assert.match(page, /if \(!order \|\| !canCancel \|\| canceling\) return/);
  assert.match(page, /disabled=\{canceling\}/);
  assert.match(page, /取消中\.\.\./);
  assert.match(page, /getSafeOrderActionMessage/);
  assert.match(page, /await loadOrder\(\)/);
  assert.match(page, /router\.refresh\(\)/);

  assert.match(detailRoute, /export async function PATCH/);
  assert.match(detailRoute, /const body = \(await request\.json\(\)\.catch\(\(\) => null\)\)/);
  assert.match(detailRoute, /supabase\.rpc\("cancel_unpaid_order"/);
  assert.match(detailRoute, /p_order_id: order\.id/);
  assert.match(detailRoute, /p_reason: reason/);
  assert.ok(!existsSync(join(root, "app/api/orders/[orderNo]/cancel/route.ts")), "do not add a duplicate POST cancel route");
});

test("unpaid BEP20 orders can resume the existing payment page", () => {
  const checkout = file("app/checkout/page.tsx");
  const orderList = file("app/account/orders/page.tsx");
  const orderDetail = file("app/account/orders/[orderNo]/page.tsx");
  const orderStatus = file("lib/orders/order-status.ts");
  const orderQueries = file("lib/orders/order-queries.ts");

  assert.match(checkout, /\/payment\?order=\$\{encodeURIComponent\(orderNo\)\}/);
  assert.match(orderList, /getBep20PaymentAction\(order\)/);
  assert.match(orderDetail, /getBep20PaymentAction\(order\)/);
  assert.match(orderList, /getBep20PaymentNotice\(order\)/);
  assert.match(orderDetail, /getBep20PaymentNotice\(order\)/);
  assert.match(orderList, /\/payment\?order=\$\{encodeURIComponent\(order\.order_no\)\}/);
  assert.match(orderDetail, /\/payment\?order=\$\{encodeURIComponent\(order\.order_no\)\}/);
  assert.match(orderStatus, /export function getBep20PaymentAction/);
  assert.match(orderStatus, /renew_payment_session/);
  assert.match(orderStatus, /view_status/);
  assert.match(orderStatus, /rejected/);
  assert.match(orderStatus, /status === "pending_payment" \|\| status === "待支付"/);
  assert.match(orderStatus, /paymentStatus === "unpaid" \|\| paymentStatus === "未支付"/);
  assert.match(orderStatus, /paymentMethod === "usdt_bep20"/);
  assert.match(orderQueries, /bep20_payment_state/);
  assert.match(orderQueries, /manual_review_decision/);
  assert.match(orderQueries, /deriveBep20PaymentState/);
  assert.match(orderQueries, /renew_payment_session/);
  assert.match(orderQueries, /continue_active_payment/);
  assert.match(orderQueries, /rejected/);
  assert.doesNotMatch(orderList, /POST \/api\/orders/);
  assert.doesNotMatch(orderDetail, /POST \/api\/orders/);
});

test("BEP20 payment page uses current session API data and guards duplicate requests", () => {
  const page = file("app/payment/page.tsx");
  const sessionRoute = file("app/api/payments/bep20/session/route.ts");
  const service = file("lib/payments/bep20-chain-service.ts");

  assert.match(page, /fetch\("\/api\/payments\/bep20\/session"/);
  assert.match(page, /setBep20Session\(result\)/);
  assert.match(page, /prefillSubmittedTxHash/);
  assert.match(page, /setTxHash\(result\?\.prefillSubmittedTxHash \? result\.submittedTxHash \?\? "" : ""\)/);
  assert.match(page, /"continue_active_payment"[\s\S]*?"renew_payment_session"[\s\S]*?"submit_late_transaction"[\s\S]*?"view_status"[\s\S]*?"rejected"[\s\S]*?"paid"[\s\S]*?"closed"/);
  assert.match(page, /const canSubmitTxHash = session\.paymentAction === "continue_active_payment" \|\| session\.canSubmitLateTransaction/);
  assert.match(page, /canRenewPaymentSession/);
  assert.match(page, /canSubmitLateTransaction/);
  assert.match(page, /chain_session_id: bep20Session\?\.canSubmitLateTransaction \? bep20Session\.chainSessionId : undefined/);
  assert.match(page, /disabled=\{!txHashValid \|\| verifying \|\| !canSubmitTxHash\}/);
  assert.match(page, /支付会话已过期。如果你已完成转账，可以提交交易哈希进行人工核验；请不要再次转账。/);
  assert.match(page, /该支付审核已结束，如有疑问请联系客服。/);
  assert.match(page, /getBep20SessionStatusText/);
  assert.match(page, /if \(!order\?\.order_no \|\| creatingSession\) return/);
  assert.match(page, /if \(!order\?\.order_no \|\| verifyingTx\) return/);
  assert.match(page, /setCreatingSession\(true\)[\s\S]*?setCreatingSession\(false\)/);
  assert.match(page, /setVerifyingTx\(true\)[\s\S]*?setVerifyingTx\(false\)/);
  assert.doesNotMatch(page, /fetch\("\/api\/orders"[\s\S]{0,120}loadBep20Session/);
  assert.match(sessionRoute, /export async function GET/);
  assert.match(sessionRoute, /getBep20PaymentSession\(orderNo, userContext\.user\.id\)/);
  assert.match(sessionRoute, /export async function POST/);
  assert.match(sessionRoute, /createBep20PaymentSession\(orderNo, userContext\.user\.id\)/);
  assert.match(service, /getReusableChainSession\(service, order\.id\)/);
  assert.match(service, /\.in\("status", \[\.\.\.ACTIVE_CHAIN_SESSION_STATUSES\]\)/);
  assert.match(service, /\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)/);
  assert.match(service, /export async function getBep20PaymentSession[\s\S]*?if \(!session\) return toBep20SessionResponse\(order\.order_no, null, config, order\)/);
  assert.match(service, /if \(!error && data\) return toBep20SessionResponse/);
  assert.match(service, /if \(raced\) return toBep20SessionResponse/);
  assert.match(service, /prefillSubmittedTxHash: shouldPrefillBep20TxHash/);
  assert.match(service, /failureReason: session\.failure_reason/);
});

test("BEP20 payment page does not prefill retryable failed TxHash on resume", () => {
  const logic = file("lib/payments/bep20-chain-logic.mjs");
  const service = file("lib/payments/bep20-chain-service.ts");
  const unit = file("tests/unit/bep20-chain-logic.test.mjs");

  assert.match(logic, /export function shouldPrefillBep20TxHash/);
  assert.match(logic, /\["confirming", "verified", "completing", "payment_failed", "manual_review", "paid"\]/);
  assert.match(logic, /status === "submitted" && String\(input\?\.failureReason \?\? ""\)\.trim\(\)/);
  assert.match(service, /prefillSubmittedTxHash: boolean/);
  assert.match(service, /submittedTxHash: session\.submitted_tx_hash \?\? null/);
  assert.match(service, /failureReason: session\.failure_reason/);
  assert.match(unit, /failed retryable TxHash is not prefilled on resume/);
  assert.match(unit, /active confirmed states keep submitted TxHash on resume/);
  assert.match(unit, /new session without TxHash starts with an empty input/);
});

test("BEP20 TxHash validation is normalized before receipt lookup and database claim", () => {
  const logic = file("lib/payments/bep20-chain-logic.mjs");
  const service = file("lib/payments/bep20-chain-service.ts");
  const unit = file("tests/unit/bep20-chain-logic.test.mjs");

  assert.match(logic, /export function normalizeBep20TxHash/);
  assert.match(logic, /\.trim\(\)\.toLowerCase\(\)/);
  assert.match(logic, /\^0x\[0-9a-f\]\{64\}\$/);
  assert.match(service, /normalizeBep20TxHash\(value\)/);
  assert.match(service, /throw new Bep20PaymentError\("TX_HASH_INVALID"/);
  assert.match(unit, /valid case and whitespace variants/);
  assert.match(unit, /rejects malformed input/);
});

test("BEP20 user-facing errors keep business messages but hide unknown internals", () => {
  const service = file("lib/payments/bep20-chain-service.ts");
  const sessionRoute = file("app/api/payments/bep20/session/route.ts");
  const verifyRoute = file("app/api/payments/bep20/verify/route.ts");

  assert.match(service, /if \(error instanceof Bep20PaymentError\) return error\.message/);
  assert.match(service, /支付校验暂时失败，请稍后重试。/);
  assert.doesNotMatch(service, /getSafeErrorMessage\(error,\s*"USDT-BEP20/);
  assert.match(sessionRoute, /code = typeof \(error as \{ code\?: unknown \}\)\?\.code === "string"/);
  assert.match(verifyRoute, /code = typeof \(error as \{ code\?: unknown \}\)\?\.code === "string"/);
});

test("BEP20 test readiness command is local-only and redacts sensitive values", () => {
  const pkg = JSON.parse(file("package.json"));
  const script = file("scripts/check-bep20-test-readiness.mjs");

  assert.equal(pkg.scripts["check:bep20-test-readiness"], "node scripts/check-bep20-test-readiness.mjs");
  assert.match(script, /czuoivbfxzachiobdohw/);
  assert.match(script, /BEP20 test readiness: PASS/);
  assert.match(script, /readFileSync\(filePath, "utf8"\)/);
  assert.match(script, /process\.exit\(1\)/);
  assert.match(script, /maskAddress/);
  assert.doesNotMatch(script, /fetch\(/);
  assert.doesNotMatch(script, /createClient|supabase-js|eth_call|https\.request|http\.request/);
  assert.doesNotMatch(script, /console\.log\(`?\$\{value\("SUPABASE_SERVICE_ROLE_KEY"\)\}/);
  assert.doesNotMatch(script, /console\.log\(`?\$\{value\("BSC_RPC_URL"\)\}/);
});

test("privacy anonymization compatibility only updates deployed profile columns", () => {
  const migration = file("supabase/migrations/20260715_privacy_anonymization_profile_compatibility.sql");

  assert.match(migration, /create or replace function public\.anonymize_user_account\(/);
  assert.match(migration, /security definer\s+set search_path = public, auth/);
  assert.match(migration, /from information_schema\.columns/);
  assert.match(migration, /column_name in \(/);
  assert.match(migration, /when 'shipping_address' then format\('%I = ''\{\}''::jsonb'/);
  assert.match(migration, /execute format\(/);
  assert.match(migration, /get diagnostics v_profile_rows = row_count/);
  assert.match(migration, /PRIVACY_PROFILE_NOT_FOUND/);
  assert.doesNotMatch(migration, /update public\.profiles\s+set[\s\S]{0,500}\bcountry\s*=\s*null/i);
  assert.doesNotMatch(migration, /shipping_address\s*=\s*null/i);
  assert.match(migration, /revoke all on function public\.anonymize_user_account\(uuid,uuid,text\)/);
});
