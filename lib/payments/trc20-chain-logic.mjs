import { createHash } from "node:crypto";

export const TRON_MAINNET_CHAIN_ID = 728126428;
export const TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const TRON_USDT_DECIMALS = 6;
export const TRON_REQUIRED_CONFIRMATIONS = 19;
export const TRC20_TRANSFER_TOPIC =
  "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = new Map(
  Array.from(BASE58_ALPHABET).map((char, index) => [char, BigInt(index)])
);

function sha256(buf) {
  return createHash("sha256").update(buf).digest();
}

function doubleSha256(buf) {
  return sha256(sha256(buf));
}

function encodeBase58(bytes) {
  let num = 0n;
  for (const byte of bytes) {
    num = num * 256n + BigInt(byte);
  }
  let encoded = "";
  while (num > 0n) {
    const rem = Number(num % 58n);
    num = num / 58n;
    encoded = BASE58_ALPHABET[rem] + encoded;
  }
  for (const byte of bytes) {
    if (byte === 0) encoded = "1" + encoded;
    else break;
  }
  return encoded || "1";
}

function decodeBase58(input) {
  if (typeof input !== "string" || input.length === 0) return null;
  let num = 0n;
  for (const char of input) {
    const digit = BASE58_MAP.get(char);
    if (digit === undefined) return null;
    num = num * 58n + digit;
  }
  const bytes = [];
  while (num > 0n) {
    bytes.push(Number(num & 0xffn));
    num >>= 8n;
  }
  bytes.reverse();
  let leadingZeros = 0;
  for (const char of input) {
    if (char === "1") leadingZeros += 1;
    else break;
  }
  return Buffer.concat([Buffer.alloc(leadingZeros), Buffer.from(bytes)]);
}

/**
 * Converts a TRON Base58Check address (T...) to a 42-char lowercase hex string starting with "41".
 * Returns null if the format, prefix, length, or double-SHA256 checksum is invalid.
 */
export function tronBase58ToHex41(address) {
  if (typeof address !== "string") return null;
  const trimmed = address.trim();
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) return null;
  const decoded = decodeBase58(trimmed);
  if (!decoded || decoded.length !== 25) return null;
  const payload = decoded.subarray(0, 21);
  const checksum = decoded.subarray(21, 25);
  if (payload[0] !== 0x41) return null;
  const expectedChecksum = doubleSha256(payload).subarray(0, 4);
  if (!checksum.equals(expectedChecksum)) return null;
  return payload.toString("hex");
}

/**
 * Converts a 42-char TRON hex address ("41..." or 40-char EVM-style hex without "41") to Base58Check (T...).
 */
export function tronHexToBase58(rawHex) {
  if (typeof rawHex !== "string") return null;
  const clean = rawHex.trim().replace(/^0x/i, "").toLowerCase();
  let hex41 = "";
  if (/^41[0-9a-f]{40}$/.test(clean)) {
    hex41 = clean;
  } else if (/^[0-9a-f]{40}$/.test(clean)) {
    hex41 = `41${clean}`;
  } else {
    return null;
  }
  const payload = Buffer.from(hex41, "hex");
  const checksum = doubleSha256(payload).subarray(0, 4);
  return encodeBase58(Buffer.concat([payload, checksum]));
}

/**
 * Converts a 32-byte ABI log topic hex string into a TRON Base58Check address (T...).
 */
export function tronTopicToBase58(topicHex) {
  if (typeof topicHex !== "string") return null;
  const clean = topicHex.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) return null;
  return tronHexToBase58(clean.slice(24));
}

export function isValidTronAddress(address) {
  return tronBase58ToHex41(address) !== null;
}

/**
 * Normalizes a TRON TxHash. Strictly requires 64 hex chars WITHOUT "0x" prefix
 * so BSC/EVM hashes cannot be accidentally submitted as TRON hashes.
 */
export function normalizeTronTxHash(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

export function formatRawTokenAmount(rawAmount, decimals = TRON_USDT_DECIMALS) {
  const big = typeof rawAmount === "bigint" ? rawAmount : BigInt(rawAmount);
  if (big < 0n) return null;
  const factor = 10n ** BigInt(decimals);
  const whole = big / factor;
  const frac = (big % factor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/**
 * Converts a positive decimal string (e.g. "14.9254") into exact raw token units (BigInt).
 * Returns null if invalid or has more fractional digits than `decimals`.
 */
export function decimalToRawTokenAmount(decimalValue, decimals = TRON_USDT_DECIMALS) {
  const text = String(decimalValue ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) return null;
  const padded = fraction.padEnd(decimals, "0");
  const raw = BigInt(whole) * (10n ** BigInt(decimals)) + (padded ? BigInt(padded) : 0n);
  return raw > 0n ? raw : null;
}

/**
 * Pure filter for TronGrid `/v1/accounts/:address/transactions/trc20` list rows.
 * Only discovers candidate txHashes — every candidate MUST still be cryptographically
 * verified via `verifyTrc20TransferReceipt` before any DB claim or credit occurs.
 */
export function matchTronGridTrc20Candidates({
  transfers,
  expectedRecipient,
  expectedContract = TRON_USDT_CONTRACT,
  expectedRawAmount,
  minTimestampMs,
  maxTimestampMs,
  excludedTxHashes,
}) {
  if (!Array.isArray(transfers) || !isValidTronAddress(expectedRecipient) || !isValidTronAddress(expectedContract)) {
    return [];
  }
  let targetRaw;
  try {
    targetRaw = typeof expectedRawAmount === "bigint" ? expectedRawAmount : BigInt(String(expectedRawAmount ?? ""));
  } catch {
    return [];
  }
  if (targetRaw <= 0n) return [];
  const excluded = excludedTxHashes instanceof Set ? excludedTxHashes : new Set();

  const matches = [];
  for (const row of transfers) {
    if (!row || typeof row !== "object") continue;
    if (String(row.type ?? "") !== "Transfer") continue;
    if (String(row.to ?? "").trim() !== expectedRecipient) continue;
    const tokenAddr = String(row.token_info?.address ?? "").trim();
    if (tokenAddr !== expectedContract) continue;

    const txHash = normalizeTronTxHash(row.transaction_id);
    if (!txHash || excluded.has(txHash)) continue;

    let rawValue;
    try {
      rawValue = BigInt(String(row.value ?? ""));
    } catch {
      continue;
    }
    if (rawValue !== targetRaw) continue;

    const ts = Number(row.block_timestamp);
    if (!Number.isFinite(ts)) continue;
    if (Number.isFinite(minTimestampMs) && ts < minTimestampMs) continue;
    if (Number.isFinite(maxTimestampMs) && ts > maxTimestampMs) continue;

    matches.push({ txHash, blockTimestampMs: ts });
  }

  matches.sort((a, b) => a.blockTimestampMs - b.blockTimestampMs);
  return matches.map((m) => m.txHash);
}

/**
 * Pure verifier for a TRON TRC20 USDT Transfer transaction fetched from TronGrid / TRON FullNode HTTP API.
 */
export function verifyTrc20TransferReceipt({
  txHash,
  tx,
  txInfo,
  nowBlockNumber,
  expectedContract = TRON_USDT_CONTRACT,
  expectedRecipient,
  decimals = TRON_USDT_DECIMALS,
  requiredConfirmations = TRON_REQUIRED_CONFIRMATIONS,
  allowInsufficientConfirmations = false,
}) {
  const normalizedHash = normalizeTronTxHash(txHash);
  if (!normalizedHash) {
    return { ok: false, code: "TRC20_TX_HASH_INVALID", message: "TRON 交易哈希格式无效（应为 64 位十六进制字符，不含 0x）" };
  }
  const expectedContractHex = tronBase58ToHex41(expectedContract);
  const expectedRecipientHex = tronBase58ToHex41(expectedRecipient);
  if (!expectedContractHex || !expectedRecipientHex) {
    return { ok: false, code: "TRC20_CONFIG_INVALID", message: "TRC20 合约地址或收款地址配置无效" };
  }

  if (!tx || typeof tx !== "object" || normalizeTronTxHash(tx.txID) !== normalizedHash) {
    return { ok: false, code: "TRC20_TX_NOT_FOUND", message: "未在 TRON 主网找到该笔交易，请稍后重试或核对 TxHash" };
  }

  const contractRet = String(tx.ret?.[0]?.contractRet ?? "").toUpperCase();
  if (contractRet !== "SUCCESS") {
    return { ok: false, code: "TRC20_TX_FAILED", message: "该笔 TRON 链上交易未执行成功" };
  }

  if (!txInfo || typeof txInfo !== "object" || !Number.isFinite(Number(txInfo.blockNumber)) || Number(txInfo.blockNumber) <= 0) {
    return { ok: false, code: "TRC20_TX_PENDING", message: "交易尚未打包上链，请等待区块确认后再试" };
  }

  const receiptResult = txInfo.receipt?.result ? String(txInfo.receipt.result).toUpperCase() : "SUCCESS";
  if (receiptResult !== "SUCCESS") {
    return { ok: false, code: "TRC20_RECEIPT_FAILED", message: "TRC20 合约调用失败（可能是能量不足或交易回滚）" };
  }

  const blockNumber = Math.trunc(Number(txInfo.blockNumber));
  const blockTimestampMs = Number(txInfo.blockTimeStamp);
  if (!Number.isFinite(blockTimestampMs) || blockTimestampMs <= 0) {
    return { ok: false, code: "TRC20_BLOCK_TIMESTAMP_MISSING", message: "未能读取 TRON 区块时间，请稍后重试" };
  }

  const headBlock = Math.trunc(Number(nowBlockNumber));
  if (!Number.isFinite(headBlock) || headBlock < blockNumber) {
    return { ok: false, code: "TRC20_HEAD_BLOCK_INVALID", message: "无法确认 TRON 最新区块高度，请稍后重试" };
  }
  const confirmationCount = headBlock - blockNumber + 1;
  if (!allowInsufficientConfirmations && confirmationCount < requiredConfirmations) {
    return {
      ok: false,
      code: "TRC20_CONFIRMATIONS_INSUFFICIENT",
      message: `区块确认数不足（当前 ${confirmationCount} / ${requiredConfirmations} 块），请约 1 分钟后重试`,
      confirmationCount,
    };
  }

  const logs = Array.isArray(txInfo.log) ? txInfo.log : [];
  let matchedRawAmount = 0n;
  let matchedLogIndex = -1;
  let matchedFromAddress = null;

  for (let i = 0; i < logs.length; i += 1) {
    const entry = logs[i];
    if (!entry || typeof entry !== "object") continue;
    const topics = Array.isArray(entry.topics) ? entry.topics : [];
    if (topics.length < 3) continue;
    const topic0 = String(topics[0] ?? "").trim().replace(/^0x/i, "").toLowerCase();
    if (topic0 !== TRC20_TRANSFER_TOPIC) continue;

    const logContractBase58 = tronHexToBase58(String(entry.address ?? ""));
    if (!logContractBase58 || tronBase58ToHex41(logContractBase58) !== expectedContractHex) continue;

    const toBase58 = tronTopicToBase58(String(topics[2] ?? ""));
    if (!toBase58 || tronBase58ToHex41(toBase58) !== expectedRecipientHex) continue;

    const dataHex = String(entry.data ?? "").trim().replace(/^0x/i, "").toLowerCase();
    if (!/^[0-9a-f]{1,64}$/.test(dataHex)) continue;
    const amount = BigInt(`0x${dataHex}`);
    if (amount <= 0n) continue;

    matchedRawAmount += amount;
    if (matchedLogIndex === -1) {
      matchedLogIndex = i;
      matchedFromAddress = tronTopicToBase58(String(topics[1] ?? ""));
    }
  }

  if (matchedRawAmount <= 0n || matchedLogIndex < 0) {
    return {
      ok: false,
      code: "TRC20_TRANSFER_NOT_FOUND",
      message: "未在该交易中找到转入指定收款地址的 USDT-TRC20 转账记录，请核对网络与合约",
    };
  }

  const actualReceivedUsdt = formatRawTokenAmount(matchedRawAmount, decimals);
  if (!actualReceivedUsdt) {
    return { ok: false, code: "TRC20_AMOUNT_INVALID", message: "链上金额解析失败" };
  }

  return {
    ok: true,
    evidence: {
      chainId: TRON_MAINNET_CHAIN_ID,
      txHash: normalizedHash,
      logIndex: matchedLogIndex,
      blockNumber: String(blockNumber),
      blockHash: typeof txInfo.blockHash === "string" ? txInfo.blockHash : null,
      blockTimestamp: new Date(blockTimestampMs).toISOString(),
      tokenContract: expectedContract,
      fromAddress: matchedFromAddress,
      toAddress: expectedRecipient,
      rawAmount: matchedRawAmount.toString(),
      actualReceivedUsdt,
      confirmationCount,
    },
  };
}
