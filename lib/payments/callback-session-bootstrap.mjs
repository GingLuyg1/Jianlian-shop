// This unverified value may identify a candidate session only. It is never payment evidence.
export function callbackSessionNoCandidate(payload) {
  if (!payload || typeof payload !== "object") return null;
  const value = payload.out_trade_no;
  return typeof value === "string" && /^PS[A-Za-z0-9_-]{8,157}$/.test(value) ? value : null;
}

export function callbackSessionIdentityMatches({ session, parsed, channelCode }) {
  return Boolean(session && parsed
    && session.channel_code === channelCode
    && session.provider === parsed.provider
    && parsed.channelCode === channelCode
    && parsed.sessionNo === session.session_no);
}
