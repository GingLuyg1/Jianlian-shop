export function purchaseDajuV2(input: any): Promise<{fulfilled?: boolean; uncertain?: boolean; idempotent?: boolean}>;
export function reconcileDajuAttempt(input: any): Promise<any>;
export function money(value: unknown): bigint;
export function purchasePolicy(env: Record<string,string|undefined>, orderId: string): bigint;
