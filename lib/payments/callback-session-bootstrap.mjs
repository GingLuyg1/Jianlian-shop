// This unverified value may identify a candidate session only. It is never payment evidence.
export function callbackSessionNoCandidate(payload) {
  const parsed = callbackCandidatePayload(payload);
  const value = parsed?.out_trade_no;
  return typeof value === "string" && /^PS[A-Za-z0-9_-]{8,157}$/.test(value) ? value : null;
}

function callbackCandidatePayload(payload) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload;
  if (typeof payload !== "string" || !payload.trim()) return null;
  if (payload.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(payload);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return Object.fromEntries(new URLSearchParams(payload).entries());
}

export function callbackSessionIdentityMatches({ session, parsed, channelCode }) {
  return Boolean(session && parsed
    && session.channel_code === channelCode
    && session.provider === parsed.provider
    && parsed.channelCode === channelCode
    && parsed.sessionNo === session.session_no);
}
