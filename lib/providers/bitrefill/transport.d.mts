import type { BitrefillAuth } from "./client-core.mjs";

export class BitrefillTransportError extends Error {
  code: string;
  kind: string;
  submitted: boolean;
}

export class BitrefillHttpTransport {
  readonly kind: "http";
  readonly readOnlyMode: true;
  constructor(input: BitrefillAuth & Record<string, unknown>);
  request(method: string, operation: string, input?: Record<string, unknown>): Promise<unknown>;
  readCatalog(input?: Record<string, unknown>): Promise<unknown>;
  readProduct(productId: string): Promise<unknown>;
  searchProducts(query: string, input?: Record<string, unknown>): Promise<unknown>;
  ping(): Promise<unknown>;
  createInvoice(input: unknown): Promise<never>;
}

export class BitrefillFakeTransport {
  readonly kind: "fake";
  readonly readOnlyMode: false;
  invoiceSubmissions: number;
  orderReads: number;
  constructor(fixtures?: Record<string, any>);
  readCatalog(input?: Record<string, unknown>): Promise<any>;
  readProduct(productId: string): Promise<any>;
  createInvoice(input: unknown): Promise<any>;
  readInvoice(invoiceId: string): Promise<any>;
  readOrder(orderId: string): Promise<any>;
}
