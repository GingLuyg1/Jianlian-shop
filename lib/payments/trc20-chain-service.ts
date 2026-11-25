import "server-only";

import {
  isValidTronAddress,
  normalizeTronTxHash,
  TRON_REQUIRED_CONFIRMATIONS,
  TRON_USDT_CONTRACT,
  TRON_USDT_DECIMALS,
  verifyTrc20TransferReceipt,
  type Trc20VerifiedEvidence,
} from "@/lib/payments/trc20-chain-logic.mjs";

const DEFAULT_TRON_RPC_URL = "https://api.trongrid.io";
const TRON_RPC_TIMEOUT_MS = 10_000;
const TRON_MAX_RESPONSE_BYTES = 512 * 1024;

export class Trc20PaymentError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "Trc20PaymentError";
    this.code = code;
    this.status = status;
  }
}

export type Trc20Config = {
  rpcUrl: string;
  apiKey: string | null;
  tokenContract: string;
  tokenDecimals: number;
  receiveAddress: string;
  requiredConfirmations: number;
};

export function getTrc20ConfigStatus() {
  const rpcUrl = String(process.env.TRON_RPC_URL || DEFAULT_TRON_RPC_URL).trim().replace(/\/+$/, "");
  const receiveAddress = String(process.env.TRON_RECEIVE_ADDRESS ?? "").trim();
  const tokenContract = String(process.env.TRON_USDT_CONTRACT || TRON_USDT_CONTRACT).trim();
  const requiredConfirmations = Math.max(1, Number(process.env.TRON_REQUIRED_CONFIRMATIONS ?? TRON_REQUIRED_CONFIRMATIONS));
  const hasApiKey = Boolean(String(process.env.TRON_GRID_API_KEY ?? "").trim());

  return {
    rpcConfigured: /^https?:\/\/.+/.test(rpcUrl),
    receiveAddressValid: isValidTronAddress(receiveAddress),
    tokenContractValid: isValidTronAddress(tokenContract),
    requiredConfirmations: Number.isInteger(requiredConfirmations) ? requiredConfirmations : TRON_REQUIRED_CONFIRMATIONS,
    apiKeyPresent: hasApiKey,
  };
}

function readTrc20Config(overrideRecipient?: string | null, overrideContract?: string | null): Trc20Config {
  const rpcUrl = String(process.env.TRON_RPC_URL || DEFAULT_TRON_RPC_URL).trim().replace(/\/+$/, "");
  const apiKey = String(process.env.TRON_GRID_API_KEY ?? "").trim() || null;
  const receiveAddress = String(overrideRecipient || process.env.TRON_RECEIVE_ADDRESS || "").trim();
  const tokenContract = String(overrideContract || process.env.TRON_USDT_CONTRACT || TRON_USDT_CONTRACT).trim();
  const tokenDecimals = Number(process.env.TRON_USDT_DECIMALS ?? TRON_USDT_DECIMALS);
  const requiredConfirmations = Math.max(1, Number(process.env.TRON_REQUIRED_CONFIRMATIONS ?? TRON_REQUIRED_CONFIRMATIONS));

  if (!/^https?:\/\/.+/.test(rpcUrl)) {
    throw new Trc20PaymentError("TRON_RPC_NOT_CONFIGURED", "TRON RPC 节点未配置或格式错误。", 503);
  }
  if (!isValidTronAddress(receiveAddress)) {
    throw new Trc20PaymentError("TRON_RECEIVE_ADDRESS_INVALID", "USDT-TRC20 收款地址未配置或校验失败。", 503);
  }
  if (!isValidTronAddress(tokenContract)) {
    throw new Trc20PaymentError("TRON_USDT_CONTRACT_INVALID", "USDT-TRC20 合约地址配置无效。", 503);
  }
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 18) {
    throw new Trc20PaymentError("TRON_USDT_DECIMALS_INVALID", "USDT-TRC20 精度配置无效。", 503);
  }

  return {
    rpcUrl,
    apiKey,
    tokenContract,
    tokenDecimals,
    receiveAddress,
    requiredConfirmations: Number.isInteger(requiredConfirmations) ? requiredConfirmations : TRON_REQUIRED_CONFIRMATIONS,
  };
}

async function tronPostJson(config: Trc20Config, endpoint: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRON_RPC_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (config.apiKey) {
      headers["TRON-PRO-API-KEY"] = config.apiKey;
    }
    const response = await fetch(`${config.rpcUrl}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Trc20PaymentError(
        "TRON_RPC_HTTP_ERROR",
        `波场节点响应异常（HTTP ${response.status}），请稍后重试。`,
        503
      );
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > TRON_MAX_RESPONSE_BYTES) {
      throw new Trc20PaymentError("TRON_RPC_RESPONSE_TOO_LARGE", "波场节点返回数据超限。", 503);
    }
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch (error) {
    if (error instanceof Trc20PaymentError) throw error;
    throw new Trc20PaymentError("TRON_RPC_UNAVAILABLE", "无法连接 TRON 节点核验交易，请稍后重试。", 503);
  } finally {
    clearTimeout(timer);
  }
}

export async function inspectAccountRechargeTrc20Transfer(
  txHash: string,
  options?: { expectedRecipient?: string | null; expectedContract?: string | null }
): Promise<Trc20VerifiedEvidence> {
  const normalized = normalizeTronTxHash(txHash);
  if (!normalized) {
    throw new Trc20PaymentError(
      "TRC20_TX_HASH_INVALID",
      "请输入合法的 64 位十六进制 TRON 交易哈希（不含 0x 前缀）。",
      400
    );
  }

  const config = readTrc20Config(options?.expectedRecipient, options?.expectedContract);
  const [tx, txInfo, nowBlock] = await Promise.all([
    tronPostJson(config, "/wallet/gettransactionbyid", { value: normalized }),
    tronPostJson(config, "/wallet/gettransactioninfobyid", { value: normalized }),
    tronPostJson(config, "/wallet/getnowblock", {}),
  ]);

  const nowBlockHeader = (nowBlock.block_header as { raw_data?: { number?: unknown } } | undefined)?.raw_data;
  const nowBlockNumber = Number(nowBlockHeader?.number ?? 0);

  const verified = verifyTrc20TransferReceipt({
    txHash: normalized,
    tx,
    txInfo,
    nowBlockNumber,
    expectedContract: config.tokenContract,
    expectedRecipient: config.receiveAddress,
    decimals: config.tokenDecimals,
    requiredConfirmations: config.requiredConfirmations,
  });

  if (!verified.ok) {
    const status = verified.code === "TRC20_CONFIRMATIONS_INSUFFICIENT" || verified.code === "TRC20_TX_PENDING" ? 409 : 400;
    throw new Trc20PaymentError(verified.code, verified.message, status);
  }

  return verified.evidence;
}
