export type BitrefillAuth =
  | { authMode: "personal"; apiKey: string; apiId?: never; apiSecret?: never }
  | { authMode: "business"; apiKey?: never; apiId: string; apiSecret: string };

export class BitrefillClientError extends Error {
  kind: string;
  code: string;
  status: number;
  rateLimit: Record<string, number | null> | null;
}

export const BITREFILL_API_BASE_URL: string;
export function buildBitrefillAuthorization(input: BitrefillAuth): string;
export function createBitrefillClient(input: BitrefillAuth & {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  timeoutMs?: number;
}): {
  ping(): Promise<Record<string, unknown>>;
  listProducts(options?: { country?: string; start?: number; limit?: number }): Promise<Record<string, unknown>>;
  searchProducts(query: string, options?: { start?: number; limit?: number }): Promise<Record<string, unknown>>;
  getProduct(productId: string): Promise<Record<string, unknown>>;
};

export class BitrefillClient {
  constructor(input: BitrefillAuth & {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    maxRetries?: number;
    timeoutMs?: number;
  });
  ping(): Promise<Record<string, unknown>>;
  listProducts(options?: { country?: string; start?: number; limit?: number }): Promise<Record<string, unknown>>;
  searchProducts(query: string, options?: { start?: number; limit?: number }): Promise<Record<string, unknown>>;
  getProduct(productId: string): Promise<Record<string, unknown>>;
}
