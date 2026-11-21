"use client";

import type { PaymentChannel } from "@/lib/payments/channel-types";

// Only the public GET projection; never personal records, rates or quotes.
// Fresh for 15s; stale entries (up to 30 min) are shown instantly while a
// background request revalidates them (stale-while-revalidate).
const FRESH_MS = 15_000;
const STALE_MS = 30 * 60_000;
const STORAGE_KEY = "jl:public-recharge-channels:v1";
let entry: { channels: PaymentChannel[]; savedAt: number } | undefined;
let pending: Promise<PaymentChannel[]> | undefined;
let generation = 0;

function readStorage() {
  if (entry || typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { channels?: PaymentChannel[]; savedAt?: number };
    if (Array.isArray(parsed.channels) && typeof parsed.savedAt === "number") {
      entry = { channels: parsed.channels, savedAt: parsed.savedAt };
    }
  } catch { /* storage unavailable */ }
}

function writeStorage(value: typeof entry) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* storage unavailable */ }
}

// peek never touches sessionStorage so the first client render matches SSR;
// storage is hydrated from effects (load / prefetch) only.
export function peekPublicRechargeChannels() {
  return entry && Date.now() - entry.savedAt < STALE_MS ? entry.channels : undefined;
}

function isFresh() {
  return Boolean(entry && Date.now() - entry.savedAt < FRESH_MS);
}

export function invalidatePublicRechargeChannels() {
  entry = undefined;
  pending = undefined;
  generation++;
  writeStorage(undefined);
}

function requestChannels(): Promise<PaymentChannel[]> {
  if (pending) return pending;
  const startedGeneration = generation;
  const request = fetch("/api/recharges/channels", { cache: "no-store" }).then(async (response) => {
    const body = await response.json().catch(() => null) as { channels?: PaymentChannel[]; error?: string } | null;
    if (!response.ok || !body || !Array.isArray(body.channels)) throw new Error(body?.error ?? "支付渠道加载失败，请稍后重试");
    if (generation === startedGeneration) {
      entry = { channels: body.channels, savedAt: Date.now() };
      writeStorage(entry);
    }
    return body.channels;
  }).finally(() => { if (pending === request) pending = undefined; });
  pending = request;
  return request;
}

export function loadPublicRechargeChannels(): Promise<PaymentChannel[]> {
  readStorage();
  const cached = peekPublicRechargeChannels();
  if (cached) {
    if (!isFresh()) void requestChannels().catch(() => undefined);
    return Promise.resolve(cached);
  }
  return requestChannels();
}

export function schedulePublicRechargeChannelsPrefetch() {
  if (typeof window === "undefined") return () => undefined;
  readStorage();
  const preload = () => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (document.visibilityState !== "visible" || connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType ?? "")) return;
    if (isFresh()) return;
    void loadPublicRechargeChannels().catch(() => undefined);
  };
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(preload, { timeout: 1200 });
    return () => window.cancelIdleCallback(id);
  }
  const timer = setTimeout(preload, 0);
  return () => clearTimeout(timer);
}
