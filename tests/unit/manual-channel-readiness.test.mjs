import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyPublicRechargeAmountRange,
  getCanonicalPaymentChannelCode,
  buildLegacyPaymentChannelCompatibilitySync,
  getLegacyPaymentChannelCompatibility,
  getPaymentChannelPairValidationError,
  getPaymentChannelPatchRuntimeError,
  getPaymentChannelValidationError,
  getSafePublicManualPaymentForRow,
  getSafePublicPaymentChannelError,
  getSafePublicPaymentChannelLog,
  hasSinglePaymentChannelPatch,
  getSafePublicManualPayment,
  hasMatchingPaymentChannelVersion,
  hasConfiguredText,
  isChannelProviderCompatible,
  isKnownPaymentChannelCode,
  isManualPaymentReady,
  isPaymentChannelReady,
  isPaymentChannelConditionalUpdateConflict,
  isPublicPaymentChannelReady,
  isRechargeChannelAvailable,
  PAYMENT_CHANNEL_CONFLICT_STATUS,
  parseStrictDecimal,
  parsePublicRechargeAmount,
  parseStrictInteger,
  parseSinglePaymentChannelPatchPayload,
  paymentChannelMatchesRequest,
  resolvePaymentChannelState,
  resolvePaymentChannelFinancialValues,
} from "../../lib/payments/manual-channel-readiness.mjs";

import {
  applyPaymentChannelEdit,
  buildPaymentChannelNumericPatch,
  canSavePaymentSettings,
  clearSavedDirtyPaymentChannels,
  createPaymentChannelNumericDrafts,
  mergeSavedPaymentChannel,
  mergeSavedPaymentChannelNumericDrafts,
  PAYMENT_SETTINGS_DATA_SOURCES,
  selectPaymentChannelForSave,
  selectDirtyPaymentChannels,
  updatePaymentChannelNumericDraft,
} from "../../lib/payments/payment-settings-state.mjs";

test("public recharge amount accepts only positive ordinary decimal strings", () => {
  for (const value of [
    true,
    false,
    null,
    undefined,
    [],
    {},
    "",
    " ",
    "1e3",
    "0x10",
    "NaN",
    "Infinity",
    "-Infinity",
    "+10",
    ".5",
    "5.",
    "1.1234567",
    "-1",
    "0",
  ]) {
    assert.equal(parsePublicRechargeAmount(value, 6), null, String(value));
  }

  assert.equal(parsePublicRechargeAmount("10", 6), 10);
  assert.equal(parsePublicRechargeAmount("10.00", 6), 10);
  assert.equal(parsePublicRechargeAmount("0.01", 6), 0.01);
  assert.equal(parsePublicRechargeAmount("1.123456", 6), 1.123456);
});

test("public recharge amount range keeps channel minimum and maximum enforcement", () => {
  assert.equal(classifyPublicRechargeAmountRange(0.01, 1, 100), "below_minimum");
  assert.equal(classifyPublicRechargeAmountRange(101, 1, 100), "above_maximum");
  assert.equal(classifyPublicRechargeAmountRange(10, 1, 100), "valid");
  assert.equal(classifyPublicRechargeAmountRange(10, 1, null), "valid");
});

test("requires one canonical known channel identity in stored rows", () => {
  for (const row of [
    { channel: "usdt_bep20", code: "usdt_trc20" },
    { channel: "usdt_trc20", code: "usdt_bep20" },
    { channel: "usdt_bep20", code: "unknown" },
    { channel: "unknown", code: "usdt_bep20" },
    { channel: "", code: "" },
    { channel: "usdt_bep20", code: null },
    { channel: null, code: "usdt_bep20" },
  ]) {
    assert.equal(getCanonicalPaymentChannelCode(row), null);
  }
  const valid = {
    channel: "usdt_bep20",
    code: "usdt_bep20",
  };
  assert.equal(
    getCanonicalPaymentChannelCode(valid),
    "usdt_bep20",
  );
  assert.equal(
    paymentChannelMatchesRequest(
      "usdt_trc20",
      valid,
      "usdt_bep20",
    ),
    false,
  );
});

test("mismatched stored BEP20 identity never exposes manual payment", () => {
  const input = {
    channel: "usdt_trc20",
    provider: "crypto_address",
    reviewMode: "manual",
    enabled: true,
    configured: true,
    paymentAddress: "SHOULD_NOT_BE_PUBLIC",
    paymentInstructions: "Use the configured network.",
    tokenContract: null,
  };
  assert.equal(
    getSafePublicManualPaymentForRow(
      {
        channel: "usdt_bep20",
        code: "usdt_trc20",
      },
      input,
    ),
    undefined,
  );
});

test("rejects inconsistent request identity pairs", () => {
  assert.match(
    getPaymentChannelPairValidationError({
      channel: "alipay",
      code: "wechat",
    }),
    /must match/,
  );
  assert.match(
    getPaymentChannelPairValidationError({
      channel: "alipay",
      code: "alipay",
      min_amount: "1.00",
      minimum_amount: "2.00",
    }),
    /must match/,
  );
  assert.match(
    getPaymentChannelPairValidationError({
      channel: "alipay",
      code: "alipay",
      provider: "generic_api",
      provider_name: "binance",
    }),
    /must match/,
  );
  assert.match(
    getPaymentChannelPairValidationError({
      channel: "alipay",
      code: "alipay",
      provider: "generic_api",
      provider_name: "",
    }),
    /must match/,
  );
});

test("strict decimal parser rejects ambiguous numeric syntax", () => {
  for (const value of [
    "",
    "   ",
    " 1",
    "1e3",
    "0x10",
    "NaN",
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    assert.equal(parseStrictDecimal(value, 6), null);
  }
  assert.equal(parseStrictDecimal("123.456789", 6), 123.456789);
  assert.equal(parseStrictDecimal(10.25, 6), 10.25);
  assert.equal(parseStrictDecimal("1.1234567", 6), null);
});

test("treats blank manual payment values as unconfigured", () => {
  assert.equal(hasConfiguredText(null), false);
  assert.equal(hasConfiguredText(""), false);
  assert.equal(hasConfiguredText("   "), false);
  assert.equal(hasConfiguredText("0x123"), true);
});

test("requires address and instructions for a manual recharge channel", () => {
  assert.equal(
    isManualPaymentReady({
      channel: "usdt_trc20",
      reviewMode: "manual",
      paymentAddress: null,
      paymentInstructions: "Submit the transaction hash.",
    }),
    false,
  );

  assert.equal(
    isManualPaymentReady({
      channel: "usdt_trc20",
      reviewMode: "manual",
      paymentAddress: "TRON_ADDRESS",
      paymentInstructions: "   ",
    }),
    false,
  );

  assert.equal(
    isManualPaymentReady({
      channel: "usdt_trc20",
      reviewMode: "manual",
      paymentAddress: "TRON_ADDRESS",
      paymentInstructions: "Submit the transaction hash.",
    }),
    true,
  );
});

test("requires token contract for manual USDT-BEP20 only", () => {
  const common = {
    reviewMode: "manual",
    paymentAddress: "0xRECEIVING_ADDRESS",
    paymentInstructions: "Use the specified network.",
  };

  assert.equal(
    isManualPaymentReady({
      ...common,
      channel: "usdt_bep20",
      tokenContract: null,
    }),
    false,
  );

  assert.equal(
    isManualPaymentReady({
      ...common,
      channel: "usdt_bep20",
      tokenContract: "0xTOKEN_CONTRACT",
    }),
    true,
  );

  assert.equal(
    isManualPaymentReady({
      ...common,
      channel: "usdt_trc20",
      tokenContract: null,
    }),
    true,
  );
});

test("provider readiness requires configured state and compatible provider", () => {
  assert.equal(
    isPaymentChannelReady({
      channel: "alipay",
      provider: "generic_api",
      reviewMode: "provider",
      configured: false,
    }),
    false,
  );

  assert.equal(
    isPaymentChannelReady({
      channel: "alipay",
      provider: "generic_api",
      reviewMode: "provider",
      configured: true,
    }),
    true,
  );

  assert.equal(
    isPaymentChannelReady({
      channel: "usdt_bep20",
      reviewMode: "manual",
      configured: true,
      paymentAddress: "0xRECEIVING_ADDRESS",
      paymentInstructions: "Use BSC.",
      tokenContract: null,
    }),
    false,
  );
});

test("provider transitions fail closed and incompatible providers are rejected", () => {
  assert.deepEqual(
    resolvePaymentChannelState({
      channel: "alipay",
      currentReviewMode: "manual",
      currentProvider: "generic_api",
      nextReviewMode: "provider",
      nextProvider: "generic_api",
      requestedEnabled: true,
      providerTrustedConfigured: true,
    }),
    {
      compatible: true,
      configured: false,
      enabled: false,
    },
  );

  assert.equal(
    resolvePaymentChannelState({
      channel: "alipay",
      currentReviewMode: "provider",
      currentProvider: "generic_api",
      nextReviewMode: "provider",
      nextProvider: "binance",
      requestedEnabled: true,
      providerTrustedConfigured: true,
    }).configured,
    false,
  );
  assert.equal(
    isChannelProviderCompatible(
      "alipay",
      "crypto_address",
    ),
    false,
  );
});

test("public manual readiness requires enabled, configured and complete BEP20 evidence", () => {
  const bep20 = {
    channel: "usdt_bep20",
    provider: "crypto_address",
    reviewMode: "manual",
    paymentAddress: "0xRECEIVER",
    paymentInstructions: "Use BSC.",
  };

  assert.equal(
    isPublicPaymentChannelReady({
      ...bep20,
      enabled: true,
      configured: false,
      tokenContract: "0xTOKEN",
    }),
    false,
  );
  assert.equal(
    getSafePublicManualPayment({
      ...bep20,
      enabled: true,
      configured: true,
      tokenContract: null,
    }),
    undefined,
  );
  assert.equal(
    isRechargeChannelAvailable({
      channel_code: "usdt_bep20",
      code: "usdt_bep20",
      provider: "crypto_address",
      reviewMode: "manual",
      enabled: true,
      configured: true,
      status: "active",
      manualPayment: {
        payment_address: "0xRECEIVER",
        token_contract: null,
        payment_instructions: "Use BSC.",
      },
    }),
    false,
  );
  assert.equal(
    isPublicPaymentChannelReady({
      ...bep20,
      enabled: true,
      configured: true,
      tokenContract: null,
    }),
    false,
  );
  assert.equal(
    isPublicPaymentChannelReady({
      channel: "usdt_trc20",
      provider: "crypto_address",
      reviewMode: "manual",
      enabled: true,
      configured: true,
      paymentAddress: "TRON_ADDRESS",
      paymentInstructions: "Use TRON.",
      tokenContract: null,
    }),
    true,
  );
});

test("payment channel validation rejects unsafe financial and compatibility inputs", () => {
  const valid = {
    channel: "usdt_bep20",
    currency: "USDT",
    provider: "crypto_address",
    feeRate: 0,
    minimumAmount: 1,
    maximumAmount: 100,
    network: "BSC",
    merchantId: undefined,
    appId: undefined,
  };

  assert.equal(
    getPaymentChannelValidationError(valid),
    null,
  );
  for (const patch of [
    { currency: "EUR" },
    { feeRate: -0.01 },
    { maximumAmount: 0.5 },
    { network: "TRON" },
    { provider: "binance" },
    { merchantId: "****1234" },
    { appId: "****" },
  ]) {
    assert.notEqual(
      getPaymentChannelValidationError({
        ...valid,
        ...patch,
      }),
      null,
    );
  }
});

test("network contracts accept only canonical stored values", () => {
  const common = {
    currency: "USDT",
    provider: "crypto_address",
    feeRate: "0",
    minimumAmount: "1",
    maximumAmount: "100",
  };
  assert.equal(
    getPaymentChannelValidationError({
      ...common,
      channel: "usdt_trc20",
      network: "TRON",
    }),
    null,
  );
  assert.match(
    getPaymentChannelValidationError({
      ...common,
      channel: "usdt_trc20",
      network: "TRC20",
    }),
    /network/,
  );
  assert.equal(
    getPaymentChannelValidationError({
      ...common,
      channel: "usdt_bep20",
      network: "BSC",
    }),
    null,
  );
  assert.match(
    getPaymentChannelValidationError({
      ...common,
      channel: "usdt_bep20",
      network: "BEP20",
    }),
    /network/,
  );
  assert.match(
    getPaymentChannelValidationError({
      ...common,
      channel: "usdt_bep20",
      network: "bsc",
    }),
    /network/,
  );
  assert.equal(
    getPaymentChannelValidationError({
      ...common,
      channel: "binance_pay",
      provider: "binance",
      network: null,
    }),
    null,
  );
  assert.match(
    getPaymentChannelValidationError({
      ...common,
      channel: "binance_pay",
      provider: "binance",
      network: "BINANCE",
    }),
    /network/,
  );
});

test("financial validation rejects non-decimal and non-finite inputs", () => {
  const valid = {
    channel: "usdt_bep20",
    currency: "USDT",
    provider: "crypto_address",
    feeRate: "0.1",
    minimumAmount: "1.25",
    maximumAmount: "100.50",
    network: "BSC",
  };
  assert.equal(getPaymentChannelValidationError(valid), null);
  for (const patch of [
    { feeRate: "" },
    { feeRate: "   " },
    { feeRate: Number.NaN },
    { feeRate: Number.POSITIVE_INFINITY },
    { feeRate: "1e-3" },
    { minimumAmount: "-0.1" },
    { maximumAmount: "0" },
    { maximumAmount: "1", minimumAmount: "2" },
    { minimumAmount: "1.234" },
  ]) {
    assert.notEqual(
      getPaymentChannelValidationError({ ...valid, ...patch }),
      null,
    );
  }
});

test("settings state never saves fallback data and only selects dirty rows", () => {
  const channels = [
    { channel: "alipay" },
    { channel: "wechat" },
  ];

  assert.equal(
    canSavePaymentSettings({
      dataSource:
        PAYMENT_SETTINGS_DATA_SOURCES.READ_ERROR,
      dirtyCount: 1,
      saving: false,
    }),
    false,
  );
  assert.equal(
    canSavePaymentSettings({
      dataSource:
        PAYMENT_SETTINGS_DATA_SOURCES.FALLBACK,
      dirtyCount: 1,
      saving: false,
    }),
    false,
  );
  assert.deepEqual(
    selectDirtyPaymentChannels(
      channels,
      new Set(["wechat"]),
    ),
    [{ channel: "wechat" }],
  );
  assert.deepEqual(
    [
      ...clearSavedDirtyPaymentChannels(
        new Set(["alipay", "wechat"]),
        ["wechat"],
      ),
    ],
    ["alipay"],
  );
  assert.equal(
    selectPaymentChannelForSave({
      channels,
      dirtyChannelIds: new Set(["alipay"]),
      channelCode: "alipay",
      dataSource: PAYMENT_SETTINGS_DATA_SOURCES.FALLBACK,
      saving: false,
    }),
    null,
  );
});

test("settings edits disable channels immediately on mode or provider changes", () => {
  const current = {
    channel: "alipay",
    provider: "generic_api",
    review_mode: "manual",
    configured: true,
    enabled: true,
    payment_address: "manual-address",
    payment_instructions: "manual instructions",
  };

  const modeChange = applyPaymentChannelEdit(
    current,
    { review_mode: "provider" },
  );
  assert.equal(modeChange.configured, false);
  assert.equal(modeChange.enabled, false);

  const providerChange = applyPaymentChannelEdit(
    {
      ...current,
      review_mode: "provider",
    },
    { provider: "binance" },
  );
  assert.equal(providerChange.configured, false);
  assert.equal(providerChange.enabled, false);
});

test("updated_at version matching is fail closed and conflicts map to 409", () => {
  assert.equal(
    hasMatchingPaymentChannelVersion(
      "2026-07-31T10:00:00Z",
      "2026-07-31T10:00:00Z",
    ),
    true,
  );
  assert.equal(
    hasMatchingPaymentChannelVersion(null, null),
    false,
  );
  assert.equal(
    hasMatchingPaymentChannelVersion(
      "2026-07-31T10:00:00Z",
      "2026-07-31T10:00:01Z",
    ),
    false,
  );
  assert.equal(PAYMENT_CHANNEL_CONFLICT_STATUS, 409);
  assert.equal(hasSinglePaymentChannelPatch([{}]), true);
  assert.equal(hasSinglePaymentChannelPatch([{}, {}]), false);
  assert.equal(isPaymentChannelConditionalUpdateConflict(null), true);
  assert.equal(isPaymentChannelConditionalUpdateConflict({ id: "1" }), false);
});

test("saved channel responses preserve newer edits and dirty state", () => {
  const channels = [
    {
      channel: "alipay",
      display_name: "new local edit",
      updated_at: "old-version",
    },
    { channel: "wechat", display_name: "unchanged" },
  ];
  const staleResponse = mergeSavedPaymentChannel({
    channels,
    savedChannel: {
      channel: "alipay",
      display_name: "request version",
      updated_at: "new-version",
    },
    requestedRevision: 1,
    currentRevision: 2,
  });
  assert.equal(staleResponse.accepted, false);
  assert.equal(staleResponse.channels[0].display_name, "new local edit");
  assert.equal(staleResponse.channels[0].updated_at, "new-version");

  const accepted = mergeSavedPaymentChannel({
    channels,
    savedChannel: {
      channel: "alipay",
      display_name: "saved",
      updated_at: "new-version",
    },
    requestedRevision: 2,
    currentRevision: 2,
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.channels[0].display_name, "saved");
  assert.equal(accepted.channels[1], channels[1]);
  assert.deepEqual(
    [...clearSavedDirtyPaymentChannels(
      new Set(["alipay", "wechat"]),
      ["alipay"],
    )],
    ["wechat"],
  );
});

test("public channel failures expose only stable safe diagnostics", () => {
  const raw = {
    message: "permission denied for table payment_channels",
    details: "internal details",
    hint: "internal hint",
  };
  for (const result of [
    getSafePublicPaymentChannelError("schema_unavailable"),
    getSafePublicPaymentChannelError("read_failed"),
  ]) {
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /permission denied|details|hint|payment_channels/i);
  }
  assert.equal(raw.message.includes("permission denied"), true);
});

test("numeric UI drafts preserve raw input through PATCH construction", () => {
  const channel = {
    channel: "alipay",
    min_amount: 1,
    minimum_amount: 1,
    maximum_amount: 100,
    fee_rate: 0,
    sort_order: 10,
    timeout_minutes: 30,
  };
  for (const raw of [
    "",
    "   ",
    "1e3",
    "0x10",
    "01.20",
    "1.234",
    "NaN",
    "Infinity",
  ]) {
    let drafts = createPaymentChannelNumericDrafts([channel]);
    drafts = updatePaymentChannelNumericDraft(
      drafts,
      "alipay",
      "minimum_amount",
      raw,
    );
    assert.equal(
      buildPaymentChannelNumericPatch(drafts, channel).minimum_amount,
      raw,
    );
  }
});

test("numeric drafts use server values only for the accepted revision", () => {
  const drafts = {
    alipay: {
      min_amount: "01.20",
      minimum_amount: "01.20",
      maximum_amount: "1e3",
      fee_rate: "0.1",
      sort_order: "10",
      timeout_minutes: "30",
    },
  };
  const savedChannel = {
    channel: "alipay",
    min_amount: 1.2,
    minimum_amount: 1.2,
    maximum_amount: 1000,
    fee_rate: 0.1,
    sort_order: 10,
    timeout_minutes: 30,
  };
  assert.equal(
    mergeSavedPaymentChannelNumericDrafts({
      drafts,
      savedChannel,
      requestedRevision: 1,
      currentRevision: 2,
    }).alipay.minimum_amount,
    "01.20",
  );
  assert.equal(
    mergeSavedPaymentChannelNumericDrafts({
      drafts,
      savedChannel,
      requestedRevision: 2,
      currentRevision: 2,
    }).alipay.minimum_amount,
    "1.2",
  );
});

test("legacy provider rows are shown only as disabled read-only compatibility data", () => {
  const legacy = {
    channel: "alipay",
    code: "alipay",
    provider: "generic_api",
    provider_name: null,
    enabled: false,
    configured: false,
  };
  assert.deepEqual(getLegacyPaymentChannelCompatibility(legacy), {
    channel: "alipay",
    provider: "generic_api",
    compatibility_issue: "legacy_provider_field_missing",
    compatibility_needs_sync: true,
    compatibility_read_only: true,
  });
  assert.deepEqual(buildLegacyPaymentChannelCompatibilitySync(legacy), {
    channel: "alipay",
    code: "alipay",
    provider: "generic_api",
    provider_name: "generic_api",
    configured: false,
    enabled: false,
  });
});

test("legacy compatibility classification rejects enabled, configured and ambiguous rows", () => {
  const base = {
    channel: "alipay",
    code: "alipay",
    provider: "generic_api",
    provider_name: null,
    enabled: false,
    configured: false,
  };
  assert.equal(
    getLegacyPaymentChannelCompatibility({ ...base, enabled: true }),
    null,
  );
  assert.equal(
    getLegacyPaymentChannelCompatibility({ ...base, configured: true }),
    null,
  );
  assert.equal(
    getLegacyPaymentChannelCompatibility({
      ...base,
      provider: "binance",
    }),
    null,
  );
  assert.equal(
    getLegacyPaymentChannelCompatibility({
      ...base,
      provider: null,
      provider_name: null,
    }),
    null,
  );
});

test("legacy rows remain rejected by strict public identity validation", () => {
  assert.match(
    getPaymentChannelPairValidationError({
      channel: "alipay",
      code: "alipay",
      provider: "generic_api",
      provider_name: null,
    }),
    /must match/,
  );
});

test("runtime patch validation rejects coercible non-string contracts", () => {
  const valid = {
    channel: "alipay",
    code: "alipay",
    provider: "generic_api",
    provider_name: "generic_api",
    currency: "CNY",
    review_mode: "provider",
    sort_order: "10",
    timeout_minutes: "30",
  };
  assert.equal(getPaymentChannelPatchRuntimeError(valid), null);
  for (const patch of [
    { currency: ["CNY"] },
    { currency: 1 },
    { review_mode: ["manual"] },
    { review_mode: true },
    { provider: "" },
    { provider_name: [] },
    { sort_order: "1e3" },
    { timeout_minutes: "" },
  ]) {
    assert.notEqual(
      getPaymentChannelPatchRuntimeError({ ...valid, ...patch }),
      null,
    );
  }
  assert.equal(parseStrictInteger("10"), 10);
  assert.equal(parseStrictInteger("1e3"), null);
});

test("public error and log adapters expose only approved primitives", () => {
  assert.deepEqual(
    getSafePublicPaymentChannelError("service_unavailable"),
    {
      error: "支付渠道服务暂时不可用。",
      code: "PAYMENT_CHANNEL_SERVICE_UNAVAILABLE",
    },
  );
  const log = getSafePublicPaymentChannelLog({
    code: "PAYMENT_CHANNEL_READ_FAILED",
    requestId: "safe-request-id",
    status: 500,
  });
  assert.deepEqual(Object.keys(log).sort(), [
    "code",
    "requestId",
    "status",
  ]);
  assert.doesNotMatch(JSON.stringify(log), /message|details|hint|address/i);
});

const validFinancialCurrent = {
  min_amount: "1.00",
  minimum_amount: "1",
  maximum_amount: "100",
  fee_rate: "0.1",
  sort_order: "10",
  timeout_minutes: "30",
};

const validPatchIdentity = {
  channel: "alipay",
  code: "alipay",
};

test("explicit null financial fields fail closed instead of using stored values", () => {
  for (const patch of [
    { fee_rate: null },
    { maximum_amount: null },
    { min_amount: null },
    { minimum_amount: null },
    { min_amount: "1", minimum_amount: null },
    { min_amount: null, minimum_amount: "1" },
    { sort_order: null },
    { timeout_minutes: null },
  ]) {
    const result = resolvePaymentChannelFinancialValues(
      { ...validPatchIdentity, ...patch },
      validFinancialCurrent,
    );
    assert.equal(result.ok, false, JSON.stringify(patch));
  }
});

test("financial aliases use current values only when both aliases are absent", () => {
  const unchanged = resolvePaymentChannelFinancialValues(
    validPatchIdentity,
    validFinancialCurrent,
  );
  assert.equal(unchanged.ok, true);
  assert.equal(unchanged.values.minimumAmount, 1);

  const matching = resolvePaymentChannelFinancialValues(
    {
      ...validPatchIdentity,
      min_amount: "1.00",
      minimum_amount: "1",
    },
    validFinancialCurrent,
  );
  assert.equal(matching.ok, true);
  assert.equal(matching.values.minimumAmount, 1);

  const mismatched = resolvePaymentChannelFinancialValues(
    {
      ...validPatchIdentity,
      min_amount: "1",
      minimum_amount: "2",
    },
    validFinancialCurrent,
  );
  assert.equal(mismatched.ok, false);
});

test("financial fields reject arrays, objects, booleans and explicit undefined", () => {
  for (const value of [[], {}, true, false, undefined]) {
    for (const field of [
      "min_amount",
      "minimum_amount",
      "maximum_amount",
      "fee_rate",
      "sort_order",
      "timeout_minutes",
    ]) {
      const result = resolvePaymentChannelFinancialValues(
        { ...validPatchIdentity, [field]: value },
        validFinancialCurrent,
      );
      assert.equal(
        result.ok,
        false,
        `${field} accepted ${String(value)}`,
      );
    }
  }
});

test("payment channel PATCH payload parser classifies malformed arrays as safe 400 inputs", () => {
  for (const channels of [
    [null],
    [1],
    ["x"],
    [[]],
    [{}],
    [true],
  ]) {
    const result = parseSinglePaymentChannelPatchPayload(channels);
    assert.equal(result.ok, false);
    assert.match(result.code, /^PAYMENT_CHANNEL_/);
  }
  assert.equal(
    parseSinglePaymentChannelPatchPayload([
      validPatchIdentity,
      { channel: "wechat", code: "wechat" },
    ]).ok,
    false,
  );
  assert.deepEqual(
    parseSinglePaymentChannelPatchPayload([validPatchIdentity]),
    { ok: true, patch: validPatchIdentity },
  );
});

test("recharge channel whitelist rejects filter syntax before query construction", () => {
  for (const value of [
    "",
    "unknown",
    "usdt_bep20,channel.eq.usdt_bep20",
    "usdt_bep20.or(enabled.eq.true)",
  ]) {
    assert.equal(isKnownPaymentChannelCode(value), false);
  }
  for (const value of [
    "alipay",
    "wechat",
    "binance_pay",
    "usdt_trc20",
    "usdt_bep20",
  ]) {
    assert.equal(isKnownPaymentChannelCode(value), true);
  }
});
