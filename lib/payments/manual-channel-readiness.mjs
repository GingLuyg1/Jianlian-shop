export function hasConfiguredText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export const PAYMENT_CHANNEL_PROVIDER_CONTRACT = Object.freeze({
  alipay: "generic_api",
  wechat: "generic_api",
  binance_pay: "binance",
  usdt_trc20: "crypto_address",
  usdt_bep20: "crypto_address",
});

export const PAYMENT_CHANNEL_CODES = Object.freeze(
  Object.keys(PAYMENT_CHANNEL_PROVIDER_CONTRACT),
);

export const PAYMENT_CHANNEL_CONFLICT_STATUS = 409;

const PAYMENT_CHANNEL_CURRENCY_CONTRACT = Object.freeze({
  alipay: "CNY",
  wechat: "CNY",
  binance_pay: "USDT",
  usdt_trc20: "USDT",
  usdt_bep20: "USDT",
});

const PAYMENT_CHANNEL_NETWORK_CONTRACT = Object.freeze({
  alipay: [null],
  wechat: [null],
  // The existing database seed defines no Binance Pay network. Keep it
  // unset until a separately verified runtime contract exists.
  binance_pay: [null],
  usdt_trc20: ["TRON"],
  usdt_bep20: ["BSC"],
});

export function isKnownPaymentChannelCode(value) {
  return (
    typeof value === "string"
    && PAYMENT_CHANNEL_CODES.includes(value)
  );
}

export function getCanonicalPaymentChannelCode(row = {}) {
  const channel = row.channel;
  const code = row.code;
  if (
    !isKnownPaymentChannelCode(channel)
    || !isKnownPaymentChannelCode(code)
    || channel !== code
  ) {
    return null;
  }
  return channel;
}

export function paymentChannelMatchesRequest(
  requestedChannel,
  row,
  normalizedChannel,
) {
  const canonical = getCanonicalPaymentChannelCode(row);
  return (
    canonical !== null
    && requestedChannel === canonical
    && normalizedChannel === canonical
  );
}

export function hasSinglePaymentChannelPatch(value) {
  return Array.isArray(value) && value.length === 1;
}

export function isPaymentChannelConditionalUpdateConflict(updatedRow) {
  return updatedRow === null || updatedRow === undefined;
}

export function getSafePublicPaymentChannelError(kind) {
  if (kind === "schema_unavailable") {
    return {
      error: "支付渠道数据尚未就绪。",
      code: "PAYMENT_CHANNEL_SCHEMA_UNAVAILABLE",
    };
  }
  if (kind === "service_unavailable") {
    return {
      error: "支付渠道服务暂时不可用。",
      code: "PAYMENT_CHANNEL_SERVICE_UNAVAILABLE",
    };
  }
  return {
    error: "支付渠道加载失败，请稍后重试。",
    code: "PAYMENT_CHANNEL_READ_FAILED",
  };
}

export function getSafePublicPaymentChannelLog({
  code,
  requestId,
  status,
}) {
  return {
    code,
    requestId,
    status,
  };
}

function suppliedPairValue(object, key) {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    return { supplied: false, value: undefined };
  }
  return { supplied: true, value: object[key] };
}

export function getPaymentChannelPairValidationError(input = {}) {
  const channel = suppliedPairValue(input, "channel");
  const code = suppliedPairValue(input, "code");
  if (!isKnownPaymentChannelCode(channel.value)) {
    return "Payment channel code is invalid.";
  }
  if (
    !code.supplied
    || (
      !isKnownPaymentChannelCode(code.value)
      || code.value !== channel.value
    )
  ) {
    return "Payment channel and code must match.";
  }

  const provider = suppliedPairValue(input, "provider");
  const providerName = suppliedPairValue(input, "provider_name");
  if (
    provider.supplied
    && providerName.supplied
    && (
      typeof provider.value !== "string"
      || typeof providerName.value !== "string"
      || !provider.value
      || !providerName.value
      || provider.value !== providerName.value
    )
  ) {
    return "Provider and provider name must match.";
  }
  const minAmount = suppliedPairValue(input, "min_amount");
  const minimumAmount = suppliedPairValue(input, "minimum_amount");
  if (minAmount.supplied && minimumAmount.supplied) {
    const legacy = parseStrictDecimal(minAmount.value, 2);
    const current = parseStrictDecimal(minimumAmount.value, 2);
    if (legacy === null || current === null || legacy !== current) {
      return "Minimum amount fields must match.";
    }
  }
  return null;
}

export function getLegacyPaymentChannelCompatibility(row = {}) {
  const channel = getCanonicalPaymentChannelCode(row);
  if (channel === null) return null;

  const provider = row.provider;
  const providerName = row.provider_name;
  const providerOnly =
    typeof provider === "string"
    && provider.length > 0
    && (providerName === null || providerName === undefined);
  const providerNameOnly =
    typeof providerName === "string"
    && providerName.length > 0
    && (provider === null || provider === undefined);
  if (!providerOnly && !providerNameOnly) return null;

  const canonicalProvider = providerOnly ? provider : providerName;
  if (
    !isChannelProviderCompatible(channel, canonicalProvider)
    || row.enabled === true
    || row.configured === true
  ) {
    return null;
  }

  return {
    channel,
    provider: canonicalProvider,
    compatibility_issue: "legacy_provider_field_missing",
    compatibility_needs_sync: true,
    compatibility_read_only: true,
  };
}

export function buildLegacyPaymentChannelCompatibilitySync(row = {}) {
  const compatibility = getLegacyPaymentChannelCompatibility(row);
  if (!compatibility) return null;
  return {
    channel: compatibility.channel,
    code: compatibility.channel,
    provider: compatibility.provider,
    provider_name: compatibility.provider,
    configured: false,
    enabled: false,
  };
}

export function parseStrictDecimal(value, maximumScale = 6) {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }
  const text = typeof value === "number" ? String(value) : value;
  if (
    !text
    || text !== text.trim()
    || !new RegExp(
      `^-?(?:0|[1-9]\\d*)(?:\\.\\d{1,${maximumScale}})?$`,
    ).test(text)
  ) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePublicRechargeAmount(value, maximumScale = 6) {
  if (typeof value !== "string") return null;
  const parsed = parseStrictDecimal(value, maximumScale);
  return parsed !== null && parsed > 0 ? parsed : null;
}

export function classifyPublicRechargeAmountRange(
  amount,
  minimumAmount,
  maximumAmount,
) {
  if (amount < minimumAmount) return "below_minimum";
  if (
    typeof maximumAmount === "number"
    && maximumAmount > 0
    && amount > maximumAmount
  ) {
    return "above_maximum";
  }
  return "valid";
}

export function parseStrictInteger(
  value,
  minimum = Number.NEGATIVE_INFINITY,
) {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }
  const text = typeof value === "number" ? String(value) : value;
  if (
    !text
    || text !== text.trim()
    || !/^-?(?:0|[1-9]\d*)$/.test(text)
  ) {
    return null;
  }
  const parsed = Number(text);
  if (
    !Number.isSafeInteger(parsed)
    || parsed < minimum
  ) {
    return null;
  }
  return parsed;
}

export function getPaymentChannelPatchRuntimeError(input = {}) {
  if (getPaymentChannelPairValidationError(input)) {
    return getPaymentChannelPairValidationError(input);
  }
  if (
    Object.prototype.hasOwnProperty.call(input, "currency")
    && (
      typeof input.currency !== "string"
      || !["CNY", "USDT"].includes(input.currency)
    )
  ) {
    return "Payment channel currency is invalid.";
  }
  if (
    Object.prototype.hasOwnProperty.call(input, "review_mode")
    && input.review_mode !== "manual"
    && input.review_mode !== "provider"
  ) {
    return "Payment channel review mode is invalid.";
  }
  for (const key of ["provider", "provider_name"]) {
    if (
      Object.prototype.hasOwnProperty.call(input, key)
      && (
        typeof input[key] !== "string"
        || input[key].length === 0
      )
    ) {
      return "Payment channel provider is invalid.";
    }
  }
  for (const [key, scale] of [
    ["min_amount", 2],
    ["minimum_amount", 2],
    ["maximum_amount", 6],
    ["fee_rate", 6],
  ]) {
    if (
      Object.prototype.hasOwnProperty.call(input, key)
      && parseStrictDecimal(input[key], scale) === null
    ) {
      return `Payment channel ${key} is invalid.`;
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(input, "sort_order")
    && parseStrictInteger(input.sort_order) === null
  ) {
    return "Payment channel sort order is invalid.";
  }
  if (
    Object.prototype.hasOwnProperty.call(input, "timeout_minutes")
    && parseStrictInteger(input.timeout_minutes, 1) === null
  ) {
    return "Payment channel timeout is invalid.";
  }
  return null;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function resolvePaymentChannelFinancialValues(
  patch = {},
  current = {},
) {
  const runtimeError = getPaymentChannelPatchRuntimeError(patch);
  if (runtimeError) {
    return { ok: false, error: runtimeError };
  }

  const hasMinAmount = hasOwn(patch, "min_amount");
  const hasMinimumAmount = hasOwn(patch, "minimum_amount");
  let minimumAmount;
  if (hasMinAmount || hasMinimumAmount) {
    const legacy = hasMinAmount
      ? parseStrictDecimal(patch.min_amount, 2)
      : null;
    const currentAlias = hasMinimumAmount
      ? parseStrictDecimal(patch.minimum_amount, 2)
      : null;
    if (
      (hasMinAmount && legacy === null)
      || (hasMinimumAmount && currentAlias === null)
      || (
        hasMinAmount
        && hasMinimumAmount
        && legacy !== currentAlias
      )
    ) {
      return {
        ok: false,
        error: "Payment channel minimum amount fields are invalid.",
      };
    }
    minimumAmount = hasMinimumAmount ? currentAlias : legacy;
  } else {
    const legacy = parseStrictDecimal(current.min_amount, 2);
    const currentAlias = parseStrictDecimal(
      current.minimum_amount,
      2,
    );
    if (
      legacy === null
      || currentAlias === null
      || legacy !== currentAlias
    ) {
      return {
        ok: false,
        error: "Stored payment channel minimum amounts are invalid.",
      };
    }
    minimumAmount = currentAlias;
  }

  const maximumSource = hasOwn(patch, "maximum_amount")
    ? patch.maximum_amount
    : current.maximum_amount;
  const feeSource = hasOwn(patch, "fee_rate")
    ? patch.fee_rate
    : current.fee_rate;
  const sortSource = hasOwn(patch, "sort_order")
    ? patch.sort_order
    : current.sort_order;
  const timeoutSource = hasOwn(patch, "timeout_minutes")
    ? patch.timeout_minutes
    : current.timeout_minutes;

  const maximumAmount = parseStrictDecimal(maximumSource, 6);
  const feeRate = parseStrictDecimal(feeSource, 6);
  const sortOrder = parseStrictInteger(sortSource);
  const timeoutMinutes = parseStrictInteger(timeoutSource, 1);
  if (
    minimumAmount === null
    || minimumAmount < 0
    || maximumAmount === null
    || maximumAmount <= 0
    || maximumAmount < minimumAmount
    || feeRate === null
    || feeRate < 0
    || feeRate > 1
    || sortOrder === null
    || timeoutMinutes === null
  ) {
    return {
      ok: false,
      error: "Payment channel financial settings are invalid.",
    };
  }

  return {
    ok: true,
    values: {
      minimumAmount,
      maximumAmount,
      feeRate,
      sortOrder,
      timeoutMinutes,
    },
  };
}

function isPlainRecord(value) {
  return (
    value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
  );
}

export function parseSinglePaymentChannelPatchPayload(value) {
  if (!Array.isArray(value) || value.length !== 1) {
    return {
      ok: false,
      code: "PAYMENT_CHANNEL_SINGLE_PATCH_REQUIRED",
      error: "Each request must contain exactly one payment channel.",
    };
  }
  const patch = value[0];
  if (!isPlainRecord(patch)) {
    return {
      ok: false,
      code: "PAYMENT_CHANNEL_PATCH_INVALID",
      error: "Payment channel configuration is invalid.",
    };
  }
  const identityError = getPaymentChannelPairValidationError({
    channel: patch.channel,
    code: patch.code,
  });
  if (identityError) {
    return {
      ok: false,
      code: "PAYMENT_CHANNEL_IDENTITY_INVALID",
      error: "Payment channel identity is invalid.",
    };
  }
  return { ok: true, patch };
}

export function expectedProviderForChannel(channel) {
  return PAYMENT_CHANNEL_PROVIDER_CONTRACT[channel] ?? null;
}

export function paymentReviewMode(publicConfig = {}) {
  if (
    publicConfig.review_mode === "manual"
    || publicConfig.review_mode === "provider"
  ) {
    return publicConfig.review_mode;
  }
  return publicConfig.payment_mode === "manual"
    ? "manual"
    : "provider";
}

export function isChannelProviderCompatible(channel, provider) {
  const expected = expectedProviderForChannel(channel);
  return expected !== null && provider === expected;
}

export function isMaskedSensitivePlaceholder(value) {
  return (
    typeof value === "string"
    && /^\*{4}/.test(value.trim())
  );
}

function normalizedNetwork(value) {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : undefined;
}

export function hasMatchingPaymentChannelVersion(
  currentUpdatedAt,
  submittedUpdatedAt,
) {
  const normalize = (value) =>
    typeof value === "string" && value.trim()
      ? value.trim()
      : null;
  const current = normalize(currentUpdatedAt);
  const submitted = normalize(submittedUpdatedAt);
  return (
    current !== null
    && submitted !== null
    && current === submitted
  );
}

export function getPaymentChannelValidationError(input = {}) {
  const expectedCurrency =
    PAYMENT_CHANNEL_CURRENCY_CONTRACT[input.channel];
  const currency =
    typeof input.currency === "string"
      ? input.currency
      : "";

  if (!expectedCurrency || currency !== expectedCurrency) {
    return `${input.channel ?? "channel"} has an unsupported currency`;
  }

  if (!isChannelProviderCompatible(input.channel, input.provider)) {
    return `${input.channel ?? "channel"} has an incompatible provider`;
  }

  const feeRate = parseStrictDecimal(input.feeRate, 6);
  if (
    feeRate === null
    || feeRate < 0
    || feeRate > 1
  ) {
    return `${input.channel ?? "channel"} has an invalid fee rate`;
  }

  const minimumAmount = parseStrictDecimal(input.minimumAmount, 2);
  const maximumAmount = parseStrictDecimal(input.maximumAmount, 6);
  if (minimumAmount === null || minimumAmount < 0) {
    return `${input.channel ?? "channel"} has an invalid minimum amount`;
  }
  if (
    maximumAmount === null
    || maximumAmount <= 0
    || maximumAmount < minimumAmount
  ) {
    return `${input.channel ?? "channel"} has an invalid maximum amount`;
  }

  const allowedNetworks =
    PAYMENT_CHANNEL_NETWORK_CONTRACT[input.channel];
  const network = normalizedNetwork(input.network);
  if (
    !allowedNetworks
    || !allowedNetworks.includes(network)
  ) {
    return `${input.channel ?? "channel"} has an incompatible network`;
  }

  if (
    isMaskedSensitivePlaceholder(input.merchantId)
    || isMaskedSensitivePlaceholder(input.appId)
  ) {
    return `${input.channel ?? "channel"} contains a masked credential placeholder`;
  }

  return null;
}

export function isManualPaymentReady(input = {}) {
  const {
    channel,
    reviewMode,
    paymentAddress,
    tokenContract,
    paymentInstructions,
  } = input;

  if (reviewMode !== "manual") return false;

  if (
    !hasConfiguredText(paymentAddress)
    || !hasConfiguredText(paymentInstructions)
  ) {
    return false;
  }

  if (
    channel === "usdt_bep20"
    && !hasConfiguredText(tokenContract)
  ) {
    return false;
  }

  return true;
}

export function isPaymentChannelReady(input = {}) {
  if (input.reviewMode === "manual") {
    return isManualPaymentReady(input);
  }

  return (
    isChannelProviderCompatible(
      input.channel,
      input.provider,
    )
    && input.configured === true
  );
}

export function resolvePaymentChannelState(input = {}) {
  const compatible = isChannelProviderCompatible(
    input.channel,
    input.nextProvider,
  );
  const modeChanged =
    input.currentReviewMode !== input.nextReviewMode;
  const providerChanged =
    input.currentProvider !== input.nextProvider;

  let configured = false;
  if (input.nextReviewMode === "manual") {
    configured = isManualPaymentReady({
      channel: input.channel,
      reviewMode: input.nextReviewMode,
      paymentAddress: input.paymentAddress,
      tokenContract: input.tokenContract,
      paymentInstructions: input.paymentInstructions,
    });
  } else if (
    compatible
    && !modeChanged
    && !providerChanged
    && input.providerTrustedConfigured === true
  ) {
    configured = true;
  }

  return {
    compatible,
    configured,
    enabled: input.requestedEnabled === true && configured,
  };
}

export function isPublicPaymentChannelReady(input = {}) {
  if (input.enabled !== true || input.configured !== true) {
    return false;
  }

  if (input.reviewMode === "manual") {
    return isManualPaymentReady(input);
  }

  return isChannelProviderCompatible(
    input.channel,
    input.provider,
  );
}

export function getSafePublicManualPayment(input = {}) {
  if (
    input.reviewMode !== "manual"
    || !isPublicPaymentChannelReady(input)
  ) {
    return undefined;
  }

  return {
    payment_address: input.paymentAddress.trim(),
    token_contract: hasConfiguredText(
      input.tokenContract,
    )
      ? input.tokenContract.trim()
      : null,
    payment_instructions:
      input.paymentInstructions.trim(),
  };
}

export function getSafePublicManualPaymentForRow(
  row,
  input = {},
) {
  const channel = getCanonicalPaymentChannelCode(row);
  if (channel === null || input.channel !== channel) {
    return undefined;
  }
  return getSafePublicManualPayment(input);
}

export function isRechargeChannelAvailable(channel) {
  if (
    !channel
    || channel.enabled !== true
    || channel.configured !== true
    || channel.status !== "active"
  ) {
    return false;
  }

  if (channel.reviewMode === "manual") {
    return (
      channel.manualPayment !== undefined
      && isManualPaymentReady({
        channel:
          channel.channel_code ?? channel.code,
        reviewMode: channel.reviewMode,
        paymentAddress:
          channel.manualPayment.payment_address,
        tokenContract:
          channel.manualPayment.token_contract,
        paymentInstructions:
          channel.manualPayment.payment_instructions,
      })
    );
  }

  return isChannelProviderCompatible(
    channel.channel_code ?? channel.code,
    channel.provider,
  );
}
