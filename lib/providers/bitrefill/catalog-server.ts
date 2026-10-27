import "server-only";
import { createHash } from "node:crypto";
import { createPersonalCatalogClient } from "./personal-catalog-client.mjs";
import { createBitrefillCatalogManager } from "./catalog-management.mjs";

let cached: { fingerprint: string; manager: ReturnType<typeof createBitrefillCatalogManager> } | null = null;
export function getPersonalCatalogManager() {
  const apiKey = process.env.BITREFILL_API_KEY;
  if (!apiKey || process.env.NODE_DEBUG || process.env.NODE_DEBUG_NATIVE) throw new Error("BITREFILL_CATALOG_NOT_CONFIGURED");
  const fingerprint = createHash("sha256").update(apiKey).digest("hex");
  if (cached?.fingerprint === fingerprint) return cached.manager;
  const client = createPersonalCatalogClient(apiKey);
  cached = { fingerprint, manager: createBitrefillCatalogManager(client) };
  return cached.manager;
}
