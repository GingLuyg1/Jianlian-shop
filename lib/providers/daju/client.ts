import "server-only";

import { createDajuHttpClient, DajuClientCoreError } from "./client-core.mjs";
import { DajuApiError } from "./errors";
import type { DajuClient } from "./types";

const DEFAULT_BASE_URL = "https://ai.hanfolk.xyz/content/plugins/seller_api/api.php";

export function getDajuConfiguration() {
  const baseUrl = process.env.DAJU_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const apiKey = process.env.DAJU_API_KEY?.trim() || "";
  return { baseUrl, apiKey, configured: Boolean(apiKey) } as const;
}

export function createDajuClient(input?: { fetchImpl?: typeof fetch; timeoutMs?: number }): DajuClient {
  const configuration = getDajuConfiguration();
  if (!configuration.configured) {
    throw new DajuApiError({ kind: "configuration", code: "DAJU_CONFIGURATION_MISSING", message: "大橘AI供应商尚未配置" });
  }
  try {
    return createDajuHttpClient({
      baseUrl: configuration.baseUrl,
      apiKey: configuration.apiKey,
      fetchImpl: input?.fetchImpl,
      timeoutMs: input?.timeoutMs,
    });
  } catch (error) {
    if (error instanceof DajuClientCoreError) {
      throw new DajuApiError({ kind: error.kind as "configuration", code: error.code, status: error.status, message: "大橘AI供应商客户端初始化失败" });
    }
    throw error;
  }
}
