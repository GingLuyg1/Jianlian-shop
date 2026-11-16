import "server-only";

import { createKuajingZyReadonlyClient } from "./readonly-client.mjs";

export function getKuajingZyReadonlyRuntime() {
  const apiKey = process.env.KUAJINGZY_API_KEY;
  if (!apiKey || process.env.NODE_DEBUG || process.env.NODE_DEBUG_NATIVE) {
    throw new Error("KUAJINGZY_READONLY_NOT_CONFIGURED");
  }
  return createKuajingZyReadonlyClient({ apiKey, fetchImpl: fetch });
}
