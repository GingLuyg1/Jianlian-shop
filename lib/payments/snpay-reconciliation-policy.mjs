export const SNPAY_RECONCILIATION = Object.freeze({
  pendingCadenceMs: 60_000, expiredCadenceMs: 300_000, lookbackMs: 86_400_000,
  minimumAgeMs: 60_000, batchSize: 4, queryTimeoutMs: 7_000, batchTimeoutMs: 45_000,
});
const allowed = new Set(['pending', 'processing', 'expired']);
const time = v => typeof v === 'string' && v ? Date.parse(v) : NaN;
export function snpayCandidateReason(s, nowMs = Date.now()) {
  if (!s || s.provider !== 'snpay' || !['alipay','wechat'].includes(s.channel_code)
      || !['recharge','account_recharge','order'].includes(s.business_type)) return 'scope_excluded';
  if (!allowed.has(s.status)) return 'state_excluded';
  if (s.currency !== 'CNY' || !(Number(s.payable_amount) > 0)) return 'frozen_context_invalid';
  if (typeof s.provider_order_no !== 'string' || !s.provider_order_no.trim()
      || typeof s.session_no !== 'string' || !s.session_no.trim()) return 'provider_identity_missing';
  const created = time(s.created_at), expiry = time(s.expires_at), synced = s.last_synced_at == null ? null : time(s.last_synced_at);
  if (!Number.isFinite(created) || !Number.isFinite(expiry) || expiry < created) return 'lifetime_invalid';
  if (created < nowMs - SNPAY_RECONCILIATION.lookbackMs || created > nowMs - SNPAY_RECONCILIATION.minimumAgeMs) return 'outside_lookback_or_grace';
  const cadence = s.status === 'expired' ? SNPAY_RECONCILIATION.expiredCadenceMs : SNPAY_RECONCILIATION.pendingCadenceMs;
  if (synced !== null && (!Number.isFinite(synced) || nowMs - synced < cadence)) return 'throttled';
  return null;
}
export function snpayPaidDecision(s, r, q, nowMs = Date.now()) {
  if (!q || q.found !== true) return {kind:'not_found', reason:'provider_not_found'};
  if (q.rawSummarySafe?.signatureVerified !== true || q.rawSummarySafe?.timestampVerified !== true
      || q.rawSummarySafe?.identityVerified !== true || q.providerChannel !== s.channel_code
      || q.rawSummary?.outTradeNo !== s.session_no || q.providerTransactionId !== s.provider_order_no) return {kind:'manual_review',reason:'untrusted_identity'};
  if (q.currency !== s.currency) return {kind:'manual_review',reason:'currency_mismatch'};
  if (!Number.isFinite(Number(q.amount)) || Number(q.amount) !== Number(s.payable_amount)) return {kind:'manual_review',reason:'amount_mismatch'};
  if (q.paid !== true || q.status !== 'paid') return {kind:'unpaid',reason:'provider_unpaid'};
  const paid = time(q.paidAt);
  if (!Number.isFinite(paid) || paid > nowMs + 300_000
      || paid < time(s.created_at) || paid < time(r.created_at)) return {kind:'manual_review',reason:'paid_time_untrusted'};
  if (!Number.isFinite(time(s.expires_at)) || !Number.isFinite(time(r.expires_at))) return {kind:'manual_review',reason:'expiry_missing'};
  if (paid > time(s.expires_at) || paid > time(r.expires_at)) return {kind:'manual_review',reason:'snpay_late_payment_manual_v1'};
  return {kind:'complete',reason:'paid_before_expiry'};
}

// Frozen order snapshots, never today's catalog/channel configuration. Terminal
// inventory ownership is a separate policy from recharge expiry recovery.
export function snpayOrderParentReason(s, o) {
  if (!o) return 'order_missing';
  if (!s.business_id || o.id !== s.business_id || !s.business_no || o.order_no !== s.business_no
      || !s.user_id || o.user_id !== s.user_id || o.currency !== s.currency
      || o.payment_method !== s.channel_code || !(Number(o.total_amount) > 0)
      || Number(o.total_amount) !== Number(s.payable_amount)
      || Number(s.fee_amount ?? 0) !== 0 || Number(o.total_amount) > 2000
      || !Number.isFinite(time(o.created_at)) || !Number.isFinite(time(o.payment_expires_at))
      || time(o.payment_expires_at) < time(o.created_at)) return 'order_frozen_context_invalid';
  if (o.payment_status === 'paid') return 'order_already_paid';
  if (o.reservation_released_at != null) return 'order_inventory_released';
  if (['cancelled','expired','refunded','failed'].includes(o.status)) return 'order_terminal_before_reconciliation';
  if (o.status !== 'pending_payment' || o.payment_status !== 'unpaid') return 'order_state_excluded';
  // The canonical session RPC deliberately does NOT revive expired order sessions.
  if (!['pending','processing'].includes(s.status)) return 'order_session_state_excluded';
  return null;
}
export function snpayOrderPaidDecision(s, o, q, nowMs = Date.now()) {
  const reason = snpayOrderParentReason(s, o);
  if (reason) return {kind:['order_inventory_released','order_terminal_before_reconciliation'].includes(reason)
    ? 'manual_review' : 'skipped', reason};
  const decision = snpayPaidDecision(s, {...o, expires_at:o.payment_expires_at}, q, nowMs);
  return decision.reason === 'snpay_late_payment_manual_v1'
    ? {kind:'manual_review',reason:'order_paid_after_expiry'} : decision;
}
