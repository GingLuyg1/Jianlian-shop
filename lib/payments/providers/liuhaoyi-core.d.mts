export function buildLiuhaoyiSignContent(parameters: Record<string, unknown>): string;
export function createLiuhaoyiMd5Signature(parameters: Record<string, unknown>, merchantKey: string): string;
export function verifyLiuhaoyiMd5Signature(parameters: Record<string, unknown>, merchantKey: string): boolean;
export function liuhaoyiTypeForChannel(channelCode: unknown): "alipay" | "wxpay";
export function parseLiuhaoyiQuery(input: URLSearchParams | string): Record<string, string>;
