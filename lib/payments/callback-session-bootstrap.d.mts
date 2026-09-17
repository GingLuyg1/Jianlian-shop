import type { PaymentChannelCode, ProviderParsedCallback } from "./channel-types";

export function callbackSessionNoCandidate(payload: unknown): string | null;
export function callbackSessionIdentityMatches(input: {
  session: Record<string, unknown> | null;
  parsed: ProviderParsedCallback;
  channelCode: PaymentChannelCode;
}): boolean;
