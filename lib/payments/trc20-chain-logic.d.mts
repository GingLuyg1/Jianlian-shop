export const TRON_MAINNET_CHAIN_ID: number;
export const TRON_USDT_CONTRACT: string;
export const TRON_USDT_DECIMALS: number;
export const TRON_REQUIRED_CONFIRMATIONS: number;
export const TRC20_TRANSFER_TOPIC: string;

export function tronBase58ToHex41(address: string): string | null;
export function tronHexToBase58(rawHex: string): string | null;
export function tronTopicToBase58(topicHex: string): string | null;
export function isValidTronAddress(address: string): boolean;
export function normalizeTronTxHash(value: string): string | null;
export function formatRawTokenAmount(rawAmount: bigint | string | number, decimals?: number): string | null;
export function decimalToRawTokenAmount(decimalValue: string | number, decimals?: number): bigint | null;

export function matchTronGridTrc20Candidates(input: {
  transfers: unknown;
  expectedRecipient: string;
  expectedContract?: string;
  expectedRawAmount: bigint | string | number;
  minTimestampMs?: number;
  maxTimestampMs?: number;
  excludedTxHashes?: Set<string>;
}): string[];

export type Trc20VerifiedEvidence = {
  chainId: number;
  txHash: string;
  logIndex: number;
  blockNumber: string;
  blockHash: string | null;
  blockTimestamp: string;
  tokenContract: string;
  fromAddress: string | null;
  toAddress: string;
  rawAmount: string;
  actualReceivedUsdt: string;
  confirmationCount: number;
};

export type Trc20VerifyResult =
  | { ok: true; evidence: Trc20VerifiedEvidence }
  | { ok: false; code: string; message: string; confirmationCount?: number };

export function verifyTrc20TransferReceipt(input: {
  txHash: string;
  tx: Record<string, unknown> | null;
  txInfo: Record<string, unknown> | null;
  nowBlockNumber: number;
  expectedContract?: string;
  expectedRecipient: string;
  decimals?: number;
  requiredConfirmations?: number;
  allowInsufficientConfirmations?: boolean;
}): Trc20VerifyResult;
