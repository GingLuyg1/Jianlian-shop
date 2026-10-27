export type BitrefillAdminRow = {
  id: string; status: string; invoiceId: string | null; createdAt: string; errorCode: string | null;
  manualReview: boolean;
  units: { id: string; orderId: string | null; orderNo: string | null; orderItemId: string; unitIndex: number; productId: string;
    packageId: string | null; cost: string; currency: string; costVerified: false;
    fulfillmentStatus: string; childId: string | null; childStatus: string }[];
  events: { status: string; resultClass: string; checkedAt: string }[];
};
export type BitrefillAdminPage = { rows: BitrefillAdminRow[]; page: number; hasMore: boolean;
  evidenceTruncated?: boolean; realPurchaseEnabled: false };
export function readBitrefillFulfillment(client: unknown, page?: number): Promise<BitrefillAdminPage>;
