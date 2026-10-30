"use client";

import type { PaymentChannel } from "@/lib/payments/channel-types";

// Only the public GET projection; never personal records, rates or quotes.
const TTL_MS = 15_000;
let entry: { channels: PaymentChannel[]; savedAt: number } | undefined;
let pending: Promise<PaymentChannel[]> | undefined;
let generation = 0;

export function peekPublicRechargeChannels() {
  return entry && Date.now() - entry.savedAt < TTL_MS ? entry.channels : undefined;
}

export function invalidatePublicRechargeChannels() {
  entry = undefined;
  pending = undefined;
  generation++;
}

export function loadPublicRechargeChannels(): Promise<PaymentChannel[]> {
  const cached = peekPublicRechargeChannels();
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  const startedGeneration = generation;
  const request = fetch("/api/recharges/channels", { cache: "no-store" }).then(async (response) => {
    const body = await response.json().catch(() => null) as { channels?: PaymentChannel[]; error?: string } | null;
    if (!response.ok || !body || !Array.isArray(body.channels)) throw new Error(body?.error ?? "支付渠道加载失败，请稍后重试");
    if (generation === startedGeneration) entry = { channels: body.channels, savedAt: Date.now() };
    return body.channels;
  }).catch((error: unknown) => {
    if (generation === startedGeneration) entry = undefined;
    throw error;
  }).finally(() => { if (pending === request) pending = undefined; });
  pending = request;
  return request;
}

export function schedulePublicRechargeChannelsPrefetch() {
  if (typeof window === "undefined") return () => undefined;
  const preload = () => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (document.visibilityState !== "visible" || connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType ?? "")) return;
    void loadPublicRechargeChannels().catch(() => undefined);
  };
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(preload, { timeout: 1200 });
    return () => window.cancelIdleCallback(id);
  }
  const timer = setTimeout(preload, 0);
  return () => clearTimeout(timer);
}
