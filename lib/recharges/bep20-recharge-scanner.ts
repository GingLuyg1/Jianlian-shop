import "server-only";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { queueRechargeSuccessEmailBestEffort } from "@/lib/email/recharge-success";
import { requestScannerRpc, scannerRpcOptions, ScannerRpcError } from "@/lib/recharges/bep20-scanner-rpc";
import { planOrderScanRanges, type OrderScanWindow } from "@/lib/recharges/bep20-order-scan-planner";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const RESULT_KINDS = new Set([
  "matched",
  "already_matched",
  "unmatched",
  "ambiguous_order_payment",
  "tx_conflict",
  "terminal_recharge",
  "invalid_window",
]);

type ScannerConfig = {
  rpcUrl: string;
  chainId: 56;
  tokenContract: string;
  tokenDecimals: number;
  receiveAddress: string;
  requiredConfirmations: number;
  initialLookbackBlocks: number;
  maxBlocksPerRun: number;
  chunkSize: number;
};

type RpcLog = {
  address?: string;
  topics?: string[];
  data?: string;
  transactionHash?: string;
  logIndex?: string;
  blockNumber?: string;
  blockHash?: string;
  removed?: boolean;
};

type RpcBlock = {
  number?: string;
  timestamp?: string;
  hash?: string;
};

export type RechargeBep20ScanResult = {
  mode?: "order_driven";
  idleReason?: string;
  blockedHistory?: number;
  dryRun: boolean;
  headBlock: string;
  finalizedBlock: string;
  fromBlock: string;
  toBlock: string;
  scannedBlocks: number;
  scannedTransfers: number;
  matched: number;
  alreadyMatched: number;
  unmatched: number;
  ambiguous: number;
  conflicts: number;
  terminal: number;
  credited: number;
  alreadyCredited: number;
};

export class RechargeBep20ScannerError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 503) {
    super(message);
    this.name = "RechargeBep20ScannerError";
    this.code = code;
    this.status = status;
  }
}

export function assertRechargeBep20ScannerAuthorized(request: Request) {
  const expected =
    process.env.CRON_SECRET
    || process.env.RECHARGE_BEP20_SCAN_JOB_SECRET
    || process.env.INTERNAL_JOB_SECRET;
  if (!expected) {
    return { ok: false, status: 503, message: "充值链上扫描任务密钥未配置" } as const;
  }
  const provided =
    request.headers.get("x-internal-job-secret")
    || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, message: "无权执行充值链上扫描任务" } as const;
  }
  return { ok: true } as const;
}

export async function scanRechargeBep20Transfers(options: { dryRun?: boolean } = {}): Promise<RechargeBep20ScanResult> {
  assertRollbackScannerContained();
  const service = getSupabaseServiceRoleClient();
  if (!service) {
    throw new RechargeBep20ScannerError("RECHARGE_SCANNER_SERVICE_UNAVAILABLE", "充值链上扫描数据库服务未配置");
  }

  if (process.env.RECHARGE_BEP20_SCANNER_MODE === "order_driven") {
    return scanOrderDrivenTransfers(service, Boolean(options.dryRun));
  }
  if (process.env.RECHARGE_BEP20_SCANNER_MODE && process.env.RECHARGE_BEP20_SCANNER_MODE !== "legacy") {
    throw new RechargeBep20ScannerError("RECHARGE_SCANNER_MODE_INVALID", "扫描模式无效");
  }

  const config = await loadConfig(service);
  await assertRpcChainAndToken(config);

  const headBlock = parseHexQuantity(await rpc<string>(config, "eth_blockNumber", []), "BSC_HEAD_INVALID");
  const finalizedBlock = headBlock - BigInt(config.requiredConfirmations) + BigInt(1);

  if (finalizedBlock < BigInt(0)) {
    return emptyResult(Boolean(options.dryRun), headBlock, BigInt(0));
  }

  const scannerKey = `${config.chainId}:${config.tokenContract}:${config.receiveAddress}`;
  const { data: state, error: stateError } = await service
    .from("account_recharge_bep20_scan_state")
    .select("last_scanned_block")
    .eq("scanner_key", scannerKey)
    .maybeSingle();

  if (stateError) {
    throw new RechargeBep20ScannerError(
      "RECHARGE_SCANNER_DB_NOT_READY",
      "充值链上扫描数据库结构尚未就绪",
    );
  }

  const previousCursor = state?.last_scanned_block === null || state?.last_scanned_block === undefined
    ? null
    : BigInt(String(state.last_scanned_block));

  const initialFrom = previousCursor === null
    ? maxBigInt(BigInt(0), finalizedBlock - BigInt(config.initialLookbackBlocks) + BigInt(1))
    : previousCursor + BigInt(1);

  if (initialFrom > finalizedBlock) {
    return {
      dryRun: Boolean(options.dryRun),
      headBlock: headBlock.toString(),
      finalizedBlock: finalizedBlock.toString(),
      fromBlock: initialFrom.toString(),
      toBlock: finalizedBlock.toString(),
      scannedBlocks: 0,
      scannedTransfers: 0,
      matched: 0,
      alreadyMatched: 0,
      unmatched: 0,
      ambiguous: 0,
      conflicts: 0,
      terminal: 0,
      credited: 0,
      alreadyCredited: 0,
    };
  }

  const runTo = minBigInt(
    finalizedBlock,
    initialFrom + BigInt(config.maxBlocksPerRun) - BigInt(1),
  );

  const counters = {
    scannedTransfers: 0,
    matched: 0,
    alreadyMatched: 0,
    unmatched: 0,
    ambiguous: 0,
    conflicts: 0,
    terminal: 0,
    credited: 0,
    alreadyCredited: 0,
  };

  let chunkFrom = initialFrom;
  const blockCache = new Map<string, RpcBlock>();

  while (chunkFrom <= runTo) {
    const chunkTo = minBigInt(runTo, chunkFrom + BigInt(config.chunkSize) - BigInt(1));
    const logs = await loadTransferLogs(config, chunkFrom, chunkTo);

    for (const log of logs) {
      if (log.removed) continue;
      const evidence = await parseTransferEvidence(config, log, headBlock, blockCache);
      counters.scannedTransfers += 1;

      if (options.dryRun) continue;

      const { data, error } = await service.rpc("match_and_credit_account_recharge_bep20_v3", {
        p_chain_id: config.chainId,
        p_tx_hash: evidence.txHash,
        p_log_index: evidence.logIndex,
        p_block_number: evidence.blockNumber,
        p_block_hash: evidence.blockHash,
        p_block_timestamp: evidence.blockTimestamp,
        p_token_contract: config.tokenContract,
        p_from_address: evidence.fromAddress,
        p_to_address: config.receiveAddress,
        p_raw_amount: evidence.rawAmount,
        p_actual_received_usdt: evidence.actualReceivedUsdt,
        p_confirmation_count: evidence.confirmationCount,
      });

      if (error) {
        // Do not advance this chunk's cursor on an uncertain DB result.
        // Replaying the chunk is safe because the database claim is idempotent.
        throw new RechargeBep20ScannerError(
          "RECHARGE_SCANNER_MATCH_UNCERTAIN",
          "充值链上匹配结果不确定，已停止推进扫描游标",
        );
      }

      const match = parseMatchResult(data);
      if (match.result === "matched") counters.matched += 1;
      else if (match.result === "already_matched") counters.alreadyMatched += 1;
      else if (match.result === "unmatched" || match.result === "invalid_window") counters.unmatched += 1;
      else if (match.result === "ambiguous_order_payment") counters.ambiguous += 1;
      else if (match.result === "tx_conflict") counters.conflicts += 1;
      else if (match.result === "terminal_recharge") counters.terminal += 1;
      if (match.credited) counters.credited += 1;
      if (match.alreadyCredited) counters.alreadyCredited += 1;
      if ((match.credited || match.alreadyCredited) && match.rechargeId) {
        await queueRechargeSuccessEmailBestEffort(match.rechargeId, "bep20_scanner").catch(() => undefined);
      }
    }

    if (!options.dryRun) {
      const now = new Date().toISOString();
      const { error: cursorError } = await service
        .from("account_recharge_bep20_scan_state")
        .upsert({
          scanner_key: scannerKey,
          chain_id: config.chainId,
          token_contract: config.tokenContract,
          receive_address: config.receiveAddress,
          last_scanned_block: chunkTo.toString(),
          last_scanned_at: now,
          updated_at: now,
        }, { onConflict: "scanner_key" });

      if (cursorError) {
        throw new RechargeBep20ScannerError(
          "RECHARGE_SCANNER_CURSOR_UNCERTAIN",
          "充值链上扫描游标写入不确定，下一轮将安全重扫",
        );
      }
    }

    chunkFrom = chunkTo + BigInt(1);
  }

  return {
    dryRun: Boolean(options.dryRun),
    headBlock: headBlock.toString(),
    finalizedBlock: finalizedBlock.toString(),
    fromBlock: initialFrom.toString(),
    toBlock: runTo.toString(),
    scannedBlocks: Number(runTo - initialFrom + BigInt(1)),
    ...counters,
  };
}

async function loadConfig(service: NonNullable<ReturnType<typeof getSupabaseServiceRoleClient>>): Promise<ScannerConfig> {
  const { data, error } = await service
    .from("payment_channels")
    .select("channel,code,enabled,configured,public_config")
    .or("code.eq.usdt_bep20,channel.eq.usdt_bep20")
    .eq("enabled", true)
    .eq("configured", true)
    .maybeSingle();

  if (error || !data) {
    throw new RechargeBep20ScannerError(
      "RECHARGE_SCANNER_CHANNEL_UNAVAILABLE",
      "USDT-BEP20 充值渠道尚未启用或配置不完整",
    );
  }

  const publicConfig = data.public_config && typeof data.public_config === "object"
    ? data.public_config as Record<string, unknown>
    : {};

  const rpcUrl = String(process.env.BSC_RPC_URL ?? "").trim();
  const chainId = Number(process.env.BSC_CHAIN_ID ?? 56);
  const envToken = normalizeAddress(process.env.BSC_USDT_CONTRACT);
  const channelToken = normalizeAddress(publicConfig.token_contract);
  const receiveAddress = normalizeAddress(publicConfig.payment_address);
  const tokenDecimals = Number(process.env.BSC_USDT_DECIMALS ?? 18);
  const requiredConfirmations = clampInteger(process.env.BSC_REQUIRED_CONFIRMATIONS, 12, 1, 10_000);
  const initialLookbackBlocks = clampInteger(process.env.RECHARGE_BEP20_INITIAL_LOOKBACK_BLOCKS, 2000, 100, 10_000);
  const maxBlocksPerRun = clampInteger(process.env.RECHARGE_BEP20_MAX_BLOCKS_PER_RUN, 1500, 100, 10_000);
  const chunkSize = clampInteger(process.env.RECHARGE_BEP20_LOG_CHUNK_SIZE, 300, 50, 1000);

  if (!rpcUrl || chainId !== 56 || !envToken || !channelToken || channelToken !== envToken || !receiveAddress) {
    throw new RechargeBep20ScannerError(
      "RECHARGE_SCANNER_CONFIG_INVALID",
      "充值链上扫描配置缺失或充值渠道与 BSC USDT 配置不一致",
    );
  }
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 36) {
    throw new RechargeBep20ScannerError("RECHARGE_SCANNER_DECIMALS_INVALID", "USDT-BEP20 精度配置无效");
  }

  return {
    rpcUrl,
    chainId: 56,
    tokenContract: envToken,
    tokenDecimals,
    receiveAddress,
    requiredConfirmations,
    initialLookbackBlocks,
    maxBlocksPerRun,
    chunkSize,
  };
}

async function assertRpcChainAndToken(config: ScannerConfig) {
  const chainHex = await rpc<string>(config, "eth_chainId", []);
  const chainId = Number(parseHexQuantity(chainHex, "BSC_CHAIN_ID_RPC_INVALID"));
  if (chainId !== 56) {
    throw new RechargeBep20ScannerError("BSC_CHAIN_ID_RPC_MISMATCH", "BSC RPC 返回的 Chain ID 不正确");
  }

  const decimalsHex = await rpc<string>(config, "eth_call", [
    { to: config.tokenContract, data: "0x313ce567" },
    "latest",
  ]);
  const decimals = Number(parseHexQuantity(decimalsHex, "BSC_USDT_DECIMALS_RPC_INVALID"));
  if (decimals !== config.tokenDecimals) {
    throw new RechargeBep20ScannerError(
      "BSC_USDT_DECIMALS_RPC_MISMATCH",
      "USDT-BEP20 合约精度与服务端配置不一致",
    );
  }
}

async function loadTransferLogs(config: ScannerConfig, fromBlock: bigint, toBlock: bigint) {
  const toTopic = `0x${config.receiveAddress.slice(2).padStart(64, "0")}`;
  const result = await rpc<unknown>(config, "eth_getLogs", [{
    fromBlock: toHexQuantity(fromBlock),
    toBlock: toHexQuantity(toBlock),
    address: config.tokenContract,
    topics: [TRANSFER_TOPIC, null, toTopic],
  }]);

  if (!Array.isArray(result)) {
    throw new RechargeBep20ScannerError("BSC_LOGS_INVALID", "BSC RPC 返回的 Transfer 日志格式无效");
  }
  return result as RpcLog[];
}

async function parseTransferEvidence(
  config: ScannerConfig,
  log: RpcLog,
  headBlock: bigint,
  blockCache: Map<string, RpcBlock>,
) {
  const txHash = normalizeTxHash(log.transactionHash);
  const logIndexValue = parseHexQuantity(log.logIndex, "BSC_LOG_INDEX_INVALID");
  if (logIndexValue > BigInt(2_147_483_647)) {
    throw new RechargeBep20ScannerError("BSC_LOG_INDEX_INVALID", "BSC 日志索引超出安全范围");
  }
  const logIndex = Number(logIndexValue);
  const blockNumber = parseHexQuantity(log.blockNumber, "BSC_BLOCK_NUMBER_INVALID");
  const blockHash = normalizeBytes32(log.blockHash, "BSC_BLOCK_HASH_INVALID");
  const topics = Array.isArray(log.topics) ? log.topics : [];
  if (topics.length !== 3 || String(topics[0] ?? "").toLowerCase() !== TRANSFER_TOPIC) {
    throw new RechargeBep20ScannerError("BSC_TRANSFER_TOPIC_INVALID", "BSC Transfer 事件主题格式无效");
  }
  const fromAddress = topicToAddress(topics[1]);
  const toAddress = topicToAddress(topics[2]);
  const tokenAddress = normalizeAddress(log.address);
  const rawAmount = parseHexQuantity(log.data, "BSC_TRANSFER_AMOUNT_INVALID");

  if (tokenAddress !== config.tokenContract || toAddress !== config.receiveAddress || rawAmount <= BigInt(0)) {
    throw new RechargeBep20ScannerError("BSC_TRANSFER_EVIDENCE_MISMATCH", "BSC Transfer 日志与充值扫描配置不一致");
  }

  const blockKey = blockNumber.toString();
  let block = blockCache.get(blockKey);
  if (!block) {
    block = await rpc<RpcBlock>(config, "eth_getBlockByNumber", [toHexQuantity(blockNumber), false]);
    if (!block || typeof block !== "object") {
      throw new RechargeBep20ScannerError("BSC_BLOCK_INVALID", "BSC 区块数据读取失败");
    }
    blockCache.set(blockKey, block);
  }
  const returnedBlockNumber = parseHexQuantity(block.number, "BSC_BLOCK_NUMBER_INVALID");
  const returnedBlockHash = normalizeBytes32(block.hash, "BSC_BLOCK_HASH_INVALID");
  if (returnedBlockNumber !== blockNumber || returnedBlockHash !== blockHash) {
    throw new RechargeBep20ScannerError("BSC_BLOCK_EVIDENCE_MISMATCH", "BSC 日志与区块证据不一致");
  }

  const timestampSeconds = parseHexQuantity(block.timestamp, "BSC_BLOCK_TIMESTAMP_INVALID");
  const confirmationCount = headBlock >= blockNumber
    ? headBlock - blockNumber + BigInt(1)
    : BigInt(0);

  if (confirmationCount < BigInt(config.requiredConfirmations)) {
    throw new RechargeBep20ScannerError("BSC_CONFIRMATION_INVARIANT_FAILED", "扫描到了确认数不足的区块");
  }

  return {
    txHash,
    logIndex,
    blockNumber: blockNumber.toString(),
    blockHash,
    blockTimestamp: new Date(Number(timestampSeconds) * 1000).toISOString(),
    fromAddress,
    rawAmount: rawAmount.toString(),
    actualReceivedUsdt: rawToDecimal(rawAmount, config.tokenDecimals),
    confirmationCount: Number(confirmationCount),
  };
}

function parseMatchResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RechargeBep20ScannerError("RECHARGE_SCANNER_MATCH_RESULT_INVALID", "充值链上匹配返回格式无效");
  }
  const record = value as Record<string, unknown>;
  const result = String(record.result ?? "");
  if (!RESULT_KINDS.has(result)) {
    throw new RechargeBep20ScannerError("RECHARGE_SCANNER_MATCH_RESULT_UNKNOWN", "充值链上匹配返回未知状态");
  }
  if (typeof record.credited !== "boolean" || typeof record.alreadyCredited !== "boolean") {
    throw new RechargeBep20ScannerError("RECHARGE_SCANNER_CREDIT_RESULT_INVALID", "充值自动入账返回格式无效");
  }
  const creditEligible = result === "matched" || result === "already_matched";
  const rechargeId = typeof record.rechargeId === "string" ? record.rechargeId.trim() : "";
  if (creditEligible && !rechargeId) {
    throw new RechargeBep20ScannerError("RECHARGE_SCANNER_CREDIT_RESULT_INVALID", "充值自动入账结果缺少充值 ID");
  }
  if (
    (creditEligible && record.credited === record.alreadyCredited)
    || (!creditEligible && (record.credited || record.alreadyCredited))
  ) {
    throw new RechargeBep20ScannerError("RECHARGE_SCANNER_CREDIT_RESULT_INVALID", "充值自动入账结果与匹配状态不一致");
  }
  return {
    result,
    credited: record.credited,
    alreadyCredited: record.alreadyCredited,
    rechargeId: rechargeId || null,
  };
}

async function rpc<T>(config: ScannerConfig, method: string, params: unknown[]): Promise<T> {
  try {
    return await requestScannerRpc<T>(scannerRpcOptions(config.rpcUrl), method, params);
  } catch (error) {
    throw new RechargeBep20ScannerError(error instanceof ScannerRpcError ? error.code : "BSC_RPC_UNCERTAIN", "BSC RPC 请求未完成，已停止本轮扫描");
  }
}

async function scanOrderDrivenTransfers(
  service: NonNullable<ReturnType<typeof getSupabaseServiceRoleClient>>, dryRun: boolean,
): Promise<RechargeBep20ScanResult> {
  const config = await loadConfig(service);
  const lease = await service.rpc("lease_recharge_order_scan_v1", {
    p_address: config.receiveAddress, p_contract: config.tokenContract, p_dry_run: dryRun,
  });
  if (lease.error || !lease.data || !Array.isArray(lease.data.windows)) {
    throw new RechargeBep20ScannerError("ORDER_SCAN_DATABASE_NOT_READY", "按订单扫描结构或租约不可用");
  }
  const { windows, token, blockedHistory = 0 } = lease.data as { windows: OrderScanWindow[]; token: string | null; blockedHistory: number };
  const output = { ...emptyResult(dryRun, BigInt(0), BigInt(0)), mode: "order_driven" as const, blockedHistory };
  if (windows.length === 0) return { ...output, idleReason: blockedHistory ? "HISTORY_REVIEW_REQUIRED" : "NO_OPEN_WINDOWS" };
  if (!dryRun && !token) throw new RechargeBep20ScannerError("ORDER_SCAN_BUSY", "扫描租约被占用");
  const deadline = Date.now() + 180_000;
  let requests = 0;
  const boundedRpc = async <T>(method: string, params: unknown[]) => {
    if (++requests > 128 || Date.now() >= deadline) {
      throw new RechargeBep20ScannerError("ORDER_SCAN_RESOURCE_BUDGET", "本轮读取预算已达上限，保留进度等待下一轮");
    }
    return rpc<T>(config, method, params);
  };
  try {
    await assertRpcChainAndToken(config);
    const head = parseHexQuantity(await boundedRpc<string>("eth_blockNumber", []), "BSC_HEAD_INVALID");
    const finalized = head - BigInt(config.requiredConfirmations) + BigInt(1);
    if (finalized < BigInt(0)) return { ...output, idleReason: "WAIT_CONFIRMATIONS" };
    const blocks = new Map<string, RpcBlock>();
    const readBlock = async (number: bigint) => {
      let block = blocks.get(number.toString());
      if (!block) {
        block = await boundedRpc<RpcBlock>("eth_getBlockByNumber", [toHexQuantity(number), false]);
        if (!block || parseHexQuantity(block.number, "BSC_BLOCK_NUMBER_INVALID") !== number) {
          throw new RechargeBep20ScannerError("BSC_BLOCK_EVIDENCE_MISMATCH", "区块边界证据不一致");
        }
        normalizeBytes32(block.hash, "BSC_BLOCK_HASH_INVALID");
        blocks.set(number.toString(), block);
      }
      return { timestamp: Number(parseHexQuantity(block.timestamp, "BSC_BLOCK_TIMESTAMP_INVALID")), hash: String(block.hash) };
    };
    const ranges = await planOrderScanRanges(windows, finalized, readBlock);
    let remaining = config.maxBlocksPerRun;
    let first: bigint | null = null, last = BigInt(0);
    const result = { ...output, headBlock: head.toString(), finalizedBlock: finalized.toString() };
    const retired = new Set<string>();
    for (const range of ranges) {
      let from = range.from;
      while (from <= range.to && remaining > 0) {
        const live = range.windows.filter((w) => !retired.has(w.id) && w.to >= from);
        if (!live.length) break;
        const needed = live.reduce((lowest, w) => minBigInt(lowest, maxBigInt(from, w.from)), range.to);
        from = maxBigInt(from, needed);
        const to = minBigInt(range.to, from + BigInt(Math.min(config.chunkSize, remaining)) - BigInt(1));
        const boundary = await readBlock(to);
        const logs = await boundedRpc<unknown>("eth_getLogs", [{ fromBlock: toHexQuantity(from), toBlock: toHexQuantity(to), address: config.tokenContract, topics: [TRANSFER_TOPIC, null, `0x${config.receiveAddress.slice(2).padStart(64, "0")}`] }]);
        if (!Array.isArray(logs)) throw new RechargeBep20ScannerError("BSC_LOGS_INVALID", "BSC 日志格式无效");
        const evidence = [];
        for (const log of logs) {
          if (log.removed) continue;
          await readBlock(parseHexQuantity(log.blockNumber, "BSC_BLOCK_NUMBER_INVALID"));
          const entry = await parseTransferEvidence(config, log, head, blocks);
          if (BigInt(entry.blockNumber) < from || BigInt(entry.blockNumber) > to) {
            throw new RechargeBep20ScannerError("BSC_LOG_RANGE_MISMATCH", "日志超出请求范围");
          }
          evidence.push(entry);
        }
        // Anchor the chunk after reading logs: abort on a boundary reorg.
        const anchor = await boundedRpc<RpcBlock>("eth_getBlockByNumber", [toHexQuantity(to), false]);
        if (!anchor || parseHexQuantity(anchor.number, "BSC_BLOCK_NUMBER_INVALID") !== to
          || Number(parseHexQuantity(anchor.timestamp, "BSC_BLOCK_TIMESTAMP_INVALID")) !== boundary.timestamp
          || anchor.hash?.toLowerCase() !== boundary.hash.toLowerCase()) {
          throw new RechargeBep20ScannerError("BSC_BLOCK_EVIDENCE_MISMATCH", "扫描期间区块证据变化");
        }
        const progress = range.windows.filter((w) => !retired.has(w.id) && w.from <= to && w.to >= from).map((w) => ({
          id: w.id, from: maxBigInt(from, w.from).toString(), to: minBigInt(to, w.to).toString(),
          complete: w.complete && to >= w.to,
        }));
        if (!dryRun) {
          const applied = await service.rpc("apply_recharge_order_scan_chunk_v1", {
            p_token: token, p_progress: progress, p_evidence: evidence, p_chain_id: config.chainId,
            p_contract: config.tokenContract, p_address: config.receiveAddress,
            p_boundary_timestamp: new Date(boundary.timestamp * 1000).toISOString(),
          });
          if (applied.error || !Array.isArray(applied.data?.results) || !Array.isArray(applied.data?.completed)) {
            throw new RechargeBep20ScannerError("ORDER_SCAN_CHUNK_UNCERTAIN", "扫描块事务结果不确定，停止并保留进度");
          }
          for (const id of applied.data.completed) {
            if (typeof id !== "string" || !progress.some((p) => p.id === id)) throw new RechargeBep20ScannerError("ORDER_SCAN_CHUNK_UNCERTAIN", "扫描返回窗口无效");
            retired.add(id);
          }
          for (const value of applied.data.results) {
            const match = parseMatchResult(value);
            if (match.credited) result.credited++;
            if (match.alreadyCredited) result.alreadyCredited++;
            if (match.result === "matched") result.matched++;
            else if (match.result === "already_matched") result.alreadyMatched++;
            else if (match.result === "ambiguous_order_payment") result.ambiguous++;
            else if (match.result === "tx_conflict") result.conflicts++;
            else if (match.result === "terminal_recharge") result.terminal++;
            else result.unmatched++;
            if ((match.credited || match.alreadyCredited) && match.rechargeId) {
              await queueRechargeSuccessEmailBestEffort(match.rechargeId, "bep20_scanner").catch(() => undefined);
            }
          }
        }
        result.scannedTransfers += evidence.length;
        const count = Number(to - from + BigInt(1));
        result.scannedBlocks += count; remaining -= count;
        first ??= from; last = to; from = to + BigInt(1);
      }
      if (!remaining) break;
    }
    return { ...result, fromBlock: (first ?? BigInt(0)).toString(), toBlock: last.toString(), ...(first === null ? { idleReason: "WAIT_CONFIRMATIONS" } : {}) };
  } finally {
    if (token && !dryRun) {
      // A failed release leaves a bounded lease, never clears somebody else's token.
      try { await service.rpc("release_recharge_order_scan_v1", { p_token: token }); } catch { /* Bounded lease remains authoritative. */ }
    }
  }
}

function parseHexQuantity(value: unknown, code: string) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]+$/.test(text)) {
    throw new RechargeBep20ScannerError(code, "BSC RPC 数值格式无效");
  }
  return BigInt(text);
}

function toHexQuantity(value: bigint) {
  return `0x${value.toString(16)}`;
}

function normalizeAddress(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(text) ? text : "";
}

function normalizeTxHash(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(text)) {
    throw new RechargeBep20ScannerError("BSC_TX_HASH_INVALID", "BSC 交易哈希格式无效");
  }
  return text;
}

function normalizeBytes32(value: unknown, code: string) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(text)) {
    throw new RechargeBep20ScannerError(code, "BSC 32-byte 证据格式无效");
  }
  return text;
}

function topicToAddress(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(text)) {
    throw new RechargeBep20ScannerError("BSC_TRANSFER_TOPIC_INVALID", "BSC Transfer 地址主题格式无效");
  }
  return `0x${text.slice(-40)}`;
}

function rawToDecimal(raw: bigint, decimals: number) {
  if (decimals === 0) return raw.toString();
  const scale = pow10BigInt(decimals);
  const whole = raw / scale;
  const remainder = raw % scale;
  if (remainder === BigInt(0)) return whole.toString();
  const fraction = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fraction}`;
}

function pow10BigInt(decimals: number) {
  let result = BigInt(1);
  for (let index = 0; index < decimals; index += 1) {
    result *= BigInt(10);
  }
  return result;
}

function clampInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function minBigInt(a: bigint, b: bigint) {
  return a < b ? a : b;
}

function maxBigInt(a: bigint, b: bigint) {
  return a > b ? a : b;
}

function emptyResult(dryRun: boolean, headBlock: bigint, finalizedBlock: bigint): RechargeBep20ScanResult {
  return {
    dryRun,
    headBlock: headBlock.toString(),
    finalizedBlock: finalizedBlock.toString(),
    fromBlock: "0",
    toBlock: "0",
    scannedBlocks: 0,
    scannedTransfers: 0,
    matched: 0,
    alreadyMatched: 0,
    unmatched: 0,
    ambiguous: 0,
    conflicts: 0,
    terminal: 0,
    credited: 0,
    alreadyCredited: 0,
  };
}

// Artifact-only rollback: preserve the baseline application without allowing
// the old global scanner to query blocks, mutate progress, or credit funds.
// This deliberately does NOT restore automatic recharge processing.
function assertRollbackScannerContained(): void {
  throw new RechargeBep20ScannerError("RECHARGE_SCANNER_ROLLBACK_CONTAINED", "安全回退版本禁止自动充值扫描，需人工复核后另行恢复");
}
