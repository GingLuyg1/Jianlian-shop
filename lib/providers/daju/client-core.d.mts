import type { DajuClient, DajuV2Client } from "./types";
export class DajuClientCoreError extends Error { kind: string; code: string; status: number; orderCode: string | null }
export function createDajuHttpClient(input: { baseUrl: string; apiKey: string; timeoutMs?: number; fetchImpl?: typeof fetch; durableReferenceOnly: true }): DajuV2Client;
export function createDajuHttpClient(input: { baseUrl: string; apiKey: string; timeoutMs?: number; fetchImpl?: typeof fetch }): DajuClient;
