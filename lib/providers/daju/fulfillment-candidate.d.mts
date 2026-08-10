export type DajuSnapshotBinding = {
  supplier: "daju";
  productId: number;
  sku: string | null;
  inputsMapping: Record<string, string>;
  maxUnitCost: string | null;
};

export type DajuCandidateClassification =
  | { kind: "skip"; reason: "NOT_AUTOMATIC" | "LEGACY_LOCAL" | "OTHER_SUPPLIER" }
  | { kind: "validation"; reason: "SUPPLIER_BINDING_INVALID"; binding: null }
  | { kind: "daju"; binding: DajuSnapshotBinding };

export function classifyDajuFulfillmentCandidate(item: unknown): DajuCandidateClassification;
