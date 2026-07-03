import "server-only";

import { createHash, randomBytes } from "crypto";

type ServiceClient = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export type InventoryContentType = "card_key" | "redeem_code" | "account_password" | "plain_text";

export const INVENTORY_CONTENT_TYPE_LABELS: Record<InventoryContentType, string> = {
  card_key: "卡密",
  redeem_code: "兑换码",
  account_password: "账号密码",
  plain_text: "纯文本交付内容",
};

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000;
const MAX_CONTENT_LENGTH = 4000;

export type ParsedInventoryItem = {
  content: string;
  contentHash: string;
  maskedContent: string;
  lineNumber: number;
};

export type InventoryImportPreview = {
  fileName: string;
  totalRows: number;
  validRows: number;
  emptyRows: number;
  fileDuplicateRows: number;
  databaseDuplicateRows: number;
  invalidRows: number;
  estimatedImportRows: number;
  previewRows: Array<Pick<ParsedInventoryItem, "maskedContent" | "lineNumber">>;
  items: ParsedInventoryItem[];
};

export type InventoryImportResult = {
  batchId: string | null;
  batchNo: string | null;
  totalRows: number;
  validRows: number;
  emptyRows: number;
  fileDuplicateRows: number;
  databaseDuplicateRows: number;
  invalidRows: number;
  importedRows: number;
  skippedRows: number;
  failedRows: number;
  importStatus: "completed" | "partial_failed" | "failed";
};

export function getInventoryImportErrorMessage(error: unknown, fallback = "库存操作失败，请稍后重试") {
  if (!error) return fallback;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" && message.trim() ? message : fallback;
  }
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function sha256Hex(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function maskInventoryContent(content: string, type: InventoryContentType) {
  const trimmed = content.trim();
  if (!trimmed) return "—";

  if (type === "account_password") {
    const separators = ["----", "---", "|", ",", ":", " "];
    const separator = separators.find((item) => trimmed.includes(item));
    if (separator) {
      const parts = trimmed.split(separator).map((item) => item.trim()).filter(Boolean);
      if (parts.length >= 2) {
        return `${maskSegment(parts[0])}${separator}******`;
      }
    }
    return `${maskSegment(trimmed)} / ******`;
  }

  return maskSegment(trimmed);
}

function maskSegment(value: string) {
  if (value.length <= 4) return "****";
  if (value.length <= 10) return `${value.slice(0, 2)}****${value.slice(-2)}`;
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

export function parseInventoryFile(input: {
  fileName: string;
  buffer: Buffer;
  contentType: InventoryContentType;
}): InventoryImportPreview {
  const extension = input.fileName.split(".").pop()?.toLowerCase();
  if (!extension || !["txt", "csv"].includes(extension)) {
    throw new Error("仅支持 TXT 或 CSV 文件");
  }

  if (input.buffer.length <= 0) {
    throw new Error("导入文件不能为空");
  }

  if (input.buffer.length > MAX_IMPORT_BYTES) {
    throw new Error("单次导入文件不能超过 5MB");
  }

  const rawText = input.buffer.toString("utf8").replace(/^\uFEFF/, "");
  const lines = rawText.split(/\r\n|\n|\r/);
  if (lines.length > MAX_IMPORT_ROWS) {
    throw new Error(`单次导入最多支持 ${MAX_IMPORT_ROWS} 行`);
  }

  const seenHashes = new Set<string>();
  const items: ParsedInventoryItem[] = [];
  let emptyRows = 0;
  let fileDuplicateRows = 0;
  let invalidRows = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const normalized = extension === "csv"
      ? parseCsvLine(line).filter(Boolean).join(" ---- ").trim()
      : line.trim();

    if (!normalized) {
      emptyRows += 1;
      return;
    }

    if (normalized.length > MAX_CONTENT_LENGTH) {
      invalidRows += 1;
      return;
    }

    const contentHash = sha256Hex(normalized);
    if (seenHashes.has(contentHash)) {
      fileDuplicateRows += 1;
      return;
    }

    seenHashes.add(contentHash);
    items.push({
      content: normalized,
      contentHash,
      maskedContent: maskInventoryContent(normalized, input.contentType),
      lineNumber,
    });
  });

  return {
    fileName: input.fileName,
    totalRows: lines.length,
    validRows: items.length,
    emptyRows,
    fileDuplicateRows,
    databaseDuplicateRows: 0,
    invalidRows,
    estimatedImportRows: items.length,
    previewRows: items.slice(0, 20).map(({ maskedContent, lineNumber }) => ({ maskedContent, lineNumber })),
    items,
  };
}

export async function findExistingContentHashes(client: ServiceClient, productId: string, hashes: string[]) {
  const existing = new Set<string>();
  const uniqueHashes = Array.from(new Set(hashes)).filter(Boolean);

  for (let index = 0; index < uniqueHashes.length; index += 500) {
    const chunk = uniqueHashes.slice(index, index + 500);
    const { data, error } = await client
      .from("digital_inventory")
      .select("content_hash")
      .eq("product_id", productId)
      .in("content_hash", chunk);

    if (error) {
      throw new Error(getInventoryImportErrorMessage(error, "库存查重失败"));
    }

    for (const row of (data ?? []) as Array<{ content_hash?: string | null }>) {
      if (row.content_hash) existing.add(row.content_hash);
    }
  }

  return existing;
}

export function createInventoryBatchNo() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return `INV${stamp}${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function importDigitalInventoryBatch(input: {
  serviceClient: ServiceClient;
  productId: string;
  skuId?: string | null;
  batchName?: string | null;
  contentType: InventoryContentType;
  sourceFilename: string;
  parsed: InventoryImportPreview;
  createdBy: string;
}): Promise<InventoryImportResult> {
  const { data: product, error: productError } = await input.serviceClient
    .from("products")
    .select("id,name")
    .eq("id", input.productId)
    .maybeSingle();

  if (productError) {
    throw new Error(getInventoryImportErrorMessage(productError, "商品校验失败"));
  }

  if (!product) {
    throw new Error("商品不存在，无法导入库存");
  }

  if (input.skuId) {
    const { data: sku, error: skuError } = await input.serviceClient
      .from("product_skus")
      .select("id,product_id")
      .eq("id", input.skuId)
      .eq("product_id", input.productId)
      .maybeSingle();

    if (skuError) {
      throw new Error(getInventoryImportErrorMessage(skuError, "SKU 校验失败"));
    }
    if (!sku) {
      throw new Error("SKU 不属于当前商品，无法导入库存");
    }
  }

  const existingHashes = await findExistingContentHashes(
    input.serviceClient,
    input.productId,
    input.parsed.items.map((item) => item.contentHash),
  );
  const importableItems = input.parsed.items.filter((item) => !existingHashes.has(item.contentHash));
  const databaseDuplicateRows = input.parsed.items.length - importableItems.length;
  const batchNo = createInventoryBatchNo();

  const { data: batchRows, error: batchError } = await input.serviceClient
    .from("digital_inventory_batches")
    .insert({
      batch_no: batchNo,
      product_id: input.productId,
      sku_id: input.skuId || null,
      batch_name: input.batchName?.trim() || batchNo,
      content_type: input.contentType,
      total_count: importableItems.length,
      available_count: 0,
      reserved_count: 0,
      delivered_count: 0,
      invalid_count: input.parsed.invalidRows,
      source_filename: input.sourceFilename,
      import_status: "processing",
      created_by: input.createdBy,
    })
    .select("id,batch_no")
    .single();

  if (batchError || !batchRows) {
    throw new Error(getInventoryImportErrorMessage(batchError, "创建库存批次失败"));
  }

  let importedRows = 0;
  let failedRows = 0;

  for (let index = 0; index < importableItems.length; index += 300) {
    const chunk = importableItems.slice(index, index + 300);
    const payload = chunk.map((item) => ({
      product_id: input.productId,
      sku_id: input.skuId || null,
      batch_id: (batchRows as { id: string }).id,
      batch_no: batchNo,
      content_type: input.contentType,
      content: item.content,
      content_hash: item.contentHash,
      status: "available",
    }));

    const { error } = await input.serviceClient.from("digital_inventory").insert(payload);
    if (error) {
      failedRows += chunk.length;
      continue;
    }

    importedRows += chunk.length;
  }

  const importStatus: InventoryImportResult["importStatus"] = failedRows > 0
    ? importedRows > 0 ? "partial_failed" : "failed"
    : "completed";

  await input.serviceClient.from("digital_inventory_batches").update({
    import_status: importStatus,
    total_count: importedRows,
    invalid_count: input.parsed.invalidRows + failedRows,
  }).eq("id", (batchRows as { id: string }).id);

  await input.serviceClient.rpc("refresh_digital_inventory_batch_counts", {
    p_batch_id: (batchRows as { id: string }).id,
  });
  await input.serviceClient.rpc("sync_product_available_stock", {
    p_product_id: input.productId,
  });

  return {
    batchId: (batchRows as { id: string }).id,
    batchNo,
    totalRows: input.parsed.totalRows,
    validRows: input.parsed.validRows,
    emptyRows: input.parsed.emptyRows,
    fileDuplicateRows: input.parsed.fileDuplicateRows,
    databaseDuplicateRows,
    invalidRows: input.parsed.invalidRows,
    importedRows,
    skippedRows: input.parsed.emptyRows + input.parsed.fileDuplicateRows + databaseDuplicateRows,
    failedRows,
    importStatus,
  };
}
