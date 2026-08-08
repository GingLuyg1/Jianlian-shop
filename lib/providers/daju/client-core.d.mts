import type { DajuClient } from "./types";
export class DajuClientCoreError extends Error { kind: string; code: string; status: number }
export function createDajuHttpClient(input: { baseUrl: string; apiKey: string; timeoutMs?: number; fetchImpl?: typeof fetch }): DajuClient;
