import type { DajuBalance, DajuOrder, DajuProduct, DajuProductDetail } from "./protocol.mjs";

export type { DajuBalance, DajuOrder, DajuProduct, DajuProductDetail };

export type DajuPurchaseInput = {
  productId: number;
  requestId: string;
  quantity: number;
  sku?: string | null;
  inputs?: Record<string, string>;
};

export type DajuClient = {
  getHealth(): Promise<{ ok: true }>;
  getBalance(): Promise<DajuBalance>;
  getProducts(query?: string): Promise<DajuProduct[]>;
  getProduct(id: number): Promise<DajuProductDetail>;
  purchase(input: DajuPurchaseInput): Promise<DajuOrder>;
  getOrder(orderCode: string): Promise<DajuOrder>;
};
