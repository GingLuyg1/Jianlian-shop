import type { SupplierFulfillmentSummary } from "./types";

export function collectFrozenSupplierCodes(items: unknown): string[];

export function resolveSupplierHandlers<THandler extends (...args: any[]) => any>(
  supplierCodes: string[],
  registry: Readonly<Record<string, THandler>>,
): THandler[];

export function zeroSupplierSummary(): SupplierFulfillmentSummary;

export function addSupplierSummary(
  target: SupplierFulfillmentSummary,
  source: SupplierFulfillmentSummary,
): SupplierFulfillmentSummary;

export function executeSupplierHandlers<THandler>(
  handlers: THandler[],
  invoke: (handler: THandler) => Promise<SupplierFulfillmentSummary> | SupplierFulfillmentSummary,
): Promise<SupplierFulfillmentSummary>;
