const DEFAULT_DEEP_LINK_SCHEMES = new Set(["alipay:", "alipays:", "weixin:", "weixinpay:"]);

function safeHttps(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeDeepLink(value, schemes = DEFAULT_DEEP_LINK_SCHEMES) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return schemes.has(url.protocol.toLowerCase()) ? value : null;
  } catch {
    return null;
  }
}

export function paymentArtifactFromCreateResult(result) {
  if (!result || typeof result !== "object") return null;
  const fallbackUrl = safeHttps(result.paymentUrl);
  if (result.paymentType === "redirect") {
    return fallbackUrl ? { type: "redirect", url: fallbackUrl } : null;
  }
  if (result.paymentType === "qrcode") {
    const payload = typeof result.qrCodeValue === "string" ? result.qrCodeValue.trim() : "";
    if (!payload || payload.length > 4096 || /[\u0000-\u001F\u007F]/.test(payload)) return null;
    return fallbackUrl ? { type: "qrcode", payload, fallbackUrl } : { type: "qrcode", payload };
  }
  if (result.paymentType === "deeplink") {
    const url = safeDeepLink(result.deepLinkUrl);
    if (!url) return null;
    return fallbackUrl ? { type: "deeplink", url, fallbackUrl } : { type: "deeplink", url };
  }
  if (result.paymentType === "address") {
    const address = typeof result.walletAddress === "string" ? result.walletAddress.trim() : "";
    const network = typeof result.network === "string" ? result.network.trim() : "";
    return address && address.length <= 256 && network && network.length <= 32
      ? { type: "address", address, network }
      : null;
  }
  return null;
}

export function providerAmountWithinLimits(capability, channel, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0 || !capability) return false;
  for (const maximum of [channel?.maximumAmount, capability.maximumAmount]) {
    if (maximum !== null && maximum !== undefined && (!Number.isFinite(Number(maximum)) || Number(maximum) <= 0)) return false;
  }
  const minimum = Math.max(Number(channel?.minimumAmount ?? 0), Number(capability.minimumAmount ?? 0));
  const maximums = [channel?.maximumAmount, capability.maximumAmount]
    .filter((item) => item !== null && item !== undefined)
    .map(Number)
    .filter((item) => Number.isFinite(item) && item > 0);
  return value >= minimum && (maximums.length === 0 || value <= Math.min(...maximums));
}

export function providerSupportsChannel(capability, channel, currency) {
  return Boolean(capability?.supportedChannels?.includes(channel)
    && capability?.supportedCurrencies?.includes(currency));
}

export function describePaymentFeeSemantics({ principalAmount, siteFee, payableAmount, creditedAmount, providerExternalFee = null }) {
  const amounts = [principalAmount, siteFee, payableAmount, creditedAmount];
  if (amounts.some((value) => !Number.isFinite(value) || value < 0)
    || principalAmount <= 0
    || Math.abs(principalAmount + siteFee - payableAmount) > 0.000001
    || (providerExternalFee !== null && (!Number.isFinite(providerExternalFee) || providerExternalFee < 0))) {
    return null;
  }
  return { principalAmount, siteFee, payableAmount, creditedAmount, providerExternalFee };
}

export function pinPaymentSessionProvider(session, currentChannelProvider) {
  const pinned = typeof session?.provider === "string" ? session.provider.trim() : "";
  return pinned || null; // Current channel selection applies only to new sessions.
}

export function providerFailoverDecision({ orderMayExist, createRejectedBeforeSubmission }) {
  return orderMayExist === false && createRejectedBeforeSubmission === true
    ? "manual_new_session_only"
    : "no_auto_failover";
}

// A side-effect-free contract for future recovery adapters. Existing production recovery
// services retain their independently reviewed gates until a separate migration of callers.
export function evaluateProviderRecoveryEvidence({ session, recharge, provider, ledgerCount }) {
  if (!session || !recharge || !provider) return { eligible: false, reason: "missing_evidence" };
  if (session.userId !== recharge.userId || session.businessNo !== recharge.rechargeNo
    || session.businessType !== "recharge") return { eligible: false, reason: "ownership_or_business_mismatch" };
  if (session.channelCode !== recharge.channelCode || session.channelCode !== provider.channelCode
    || session.provider !== provider.provider) return { eligible: false, reason: "channel_or_provider_mismatch" };
  if (session.status !== "pending" && session.status !== "processing") return { eligible: false, reason: "session_not_pending" };
  if (recharge.status !== "pending" && recharge.status !== "processing") return { eligible: false, reason: "recharge_not_pending" };
  if (ledgerCount !== 0) return { eligible: false, reason: "ledger_already_exists" };
  if (!provider.found || !provider.paid || !provider.providerTransactionIdPresent)
    return { eligible: false, reason: "provider_payment_unconfirmed" };
  if (provider.currency !== session.currency || provider.currency !== recharge.currency
    || !Number.isFinite(Number(provider.amount)) || Number(provider.amount) !== Number(session.payableAmount))
    return { eligible: false, reason: "amount_or_currency_mismatch" };
  const paidAt = Date.parse(provider.providerPaidAt ?? "");
  const expiresAt = Date.parse(session.expiresAt ?? "");
  const rechargeExpiresAt = Date.parse(recharge.expiresAt ?? "");
  if (!Number.isFinite(paidAt) || !Number.isFinite(expiresAt) || !Number.isFinite(rechargeExpiresAt)
    || paidAt > expiresAt || paidAt > rechargeExpiresAt)
    return { eligible: false, reason: "paid_outside_validity" };
  return { eligible: true, reason: "evidence_matches" };
}
