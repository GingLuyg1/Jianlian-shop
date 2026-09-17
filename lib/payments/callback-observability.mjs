import { randomUUID } from "node:crypto";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function getCallbackRequestId(headers) {
  for (const name of ["x-request-id", "x-nginx-request-id", "x-correlation-id"]) {
    const candidate = String(headers?.get?.(name) ?? "").trim();
    if (SAFE_REQUEST_ID.test(candidate)) return candidate;
  }
  return randomUUID();
}

export function createCallbackObservation({ headers, channel, receivedAt = new Date().toISOString() }) {
  return {
    requestId: getCallbackRequestId(headers),
    provider: null,
    channel: String(channel ?? "") || null,
    sessionNo: null,
    receivedAt,
    signatureResult: "pending",
    processResult: "received",
    httpStatus: 202,
  };
}

export function callbackObservationRecord(observation, update = {}) {
  const next = { ...observation, ...update };
  return {
    requestId: String(next.requestId),
    provider: next.provider ? String(next.provider) : null,
    channel: next.channel ? String(next.channel) : null,
    sessionNo: next.sessionNo ? String(next.sessionNo) : null,
    receivedAt: String(next.receivedAt),
    signatureResult: String(next.signatureResult),
    processResult: String(next.processResult),
    httpStatus: Number(next.httpStatus),
  };
}
