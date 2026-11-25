"use client";

import { fetchWithTimeout } from "@/lib/network/fetch-with-timeout";

export type CachedLegalDocument = {
  id: string;
  document_type: string;
  version: string;
  title: string;
  content?: string;
  content_hash: string;
  effective_at?: string | null;
};

const LEGAL_CACHE_TTL_MS = 10 * 60 * 1000;
let cachedDocs: { docs: CachedLegalDocument[]; fetchedAt: number } | null = null;
let inFlightDocs: Promise<CachedLegalDocument[]> | null = null;

export async function fetchCurrentLegalDocuments(force = false): Promise<CachedLegalDocument[]> {
  if (!force && cachedDocs && Date.now() - cachedDocs.fetchedAt < LEGAL_CACHE_TTL_MS) {
    return cachedDocs.docs;
  }
  if (!force && inFlightDocs) {
    return inFlightDocs;
  }

  const promise = (async () => {
    const response = await fetchWithTimeout("/api/legal/current", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { documents?: CachedLegalDocument[]; error?: string }
      | null;
    if (!response.ok) {
      throw new Error(payload?.error || "协议读取失败，请稍后重试");
    }
    const docs = payload && Array.isArray(payload.documents) ? payload.documents : [];
    cachedDocs = { docs, fetchedAt: Date.now() };
    return docs;
  })();

  inFlightDocs = promise;
  try {
    return await promise;
  } finally {
    if (inFlightDocs === promise) {
      inFlightDocs = null;
    }
  }
}
