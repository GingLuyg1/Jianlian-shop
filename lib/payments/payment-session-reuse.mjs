const ACTIVE_SESSION_STATUSES = new Set(["pending", "processing"]);

export function isReusablePaymentSession(row, identity, now = new Date()) {
  const expiresAt = Date.parse(String(row?.expires_at ?? ""));
  return String(row?.business_type ?? "") === identity.businessType
    && String(row?.business_id ?? "") === identity.businessId
    && String(row?.business_no ?? "") === identity.businessNo
    && String(row?.user_id ?? "") === identity.userId
    && String(row?.channel_code ?? "") === identity.channelCode
    && (!identity.provider || String(row?.provider ?? "") === identity.provider)
    && ACTIVE_SESSION_STATUSES.has(String(row?.status ?? ""))
    && Number.isFinite(expiresAt)
    && expiresAt > now.getTime();
}
