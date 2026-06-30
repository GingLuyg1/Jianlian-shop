import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import {
  findExistingContentHashes,
  getInventoryImportErrorMessage,
  importDigitalInventoryBatch,
  parseInventoryFile,
  type InventoryContentType,
} from "@/lib/inventory/import-service";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import { checkRateLimit, checkRequestSize, getAdminRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const INVENTORY_STATUSES = new Set(["all", "available", "reserved", "delivered", "disabled", "expired", "invalid"]);
const BATCH_STATUSES = new Set(["all", "processing", "completed", "partial_failed", "failed", "disabled"]);
const CONTENT_TYPES = new Set<InventoryContentType>(["card_key", "redeem_code", "account_password", "plain_text"]);

type UploadFileLike = {
  name?: string;
  size?: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function isUploadFile(value: FormDataEntryValue | null): value is FormDataEntryValue & UploadFileLike {
  return Boolean(value && typeof value === "object" && "arrayBuffer" in value);
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function getSearchParam(request: Request, key: string) {
  return new URL(request.url).searchParams.get(key)?.trim() ?? "";
}

export async function GET(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({
      action: "view_inventory",
      module: "inventory",
      targetType: "digital_inventory",
      result: "denied",
      errorMessage: admin.message,
    });
    return jsonError(admin.message, admin.status);
  }

  const mode = getSearchParam(request, "mode") || "summary";

  try {
    if (mode === "products") {
      const { data, error } = await admin.supabase
        .from("products")
        .select("id,name,slug,delivery_type,status")
        .in("delivery_type", ["automatic", "auto", "card", "account"])
        .order("name", { ascending: true });

      if (error) throw error;
      return NextResponse.json({ data: data ?? [] });
    }

    if (mode === "batches") {
      const search = getSearchParam(request, "search");
      const rawStatus = getSearchParam(request, "status") || "all";
      const status = BATCH_STATUSES.has(rawStatus) ? rawStatus : "all";
      const page = Number(getSearchParam(request, "page") || 1);
      const pageSize = Number(getSearchParam(request, "pageSize") || 20);
      const { data, error } = await admin.supabase.rpc("admin_list_digital_inventory_batches", {
        p_search: search || null,
        p_status: status,
        p_page: Number.isFinite(page) ? page : 1,
        p_page_size: Number.isFinite(pageSize) ? pageSize : 20,
      });

      if (error) throw error;
      return NextResponse.json({ data: data ?? [] });
    }

    if (mode === "items") {
      const productId = getSearchParam(request, "productId");
      const search = getSearchParam(request, "search");
      const rawStatus = getSearchParam(request, "status") || "all";
      const status = INVENTORY_STATUSES.has(rawStatus) ? rawStatus : "all";
      const page = Number(getSearchParam(request, "page") || 1);
      const pageSize = Number(getSearchParam(request, "pageSize") || 20);

      if (!productId) return jsonError("请选择商品后再查看库存明细");

      const { data, error } = await admin.supabase.rpc("admin_list_digital_inventory_items", {
        p_product_id: productId,
        p_status: status,
        p_search: search || null,
        p_page: Number.isFinite(page) ? page : 1,
        p_page_size: Number.isFinite(pageSize) ? pageSize : 20,
      });

      if (error) throw error;
      return NextResponse.json({ data: data ?? [] });
    }

    const search = getSearchParam(request, "search");
    const rawStatus = getSearchParam(request, "status") || "all";
    const status = INVENTORY_STATUSES.has(rawStatus) ? rawStatus : "all";
    const page = Number(getSearchParam(request, "page") || 1);
    const pageSize = Number(getSearchParam(request, "pageSize") || 20);

    const { data, error } = await admin.supabase.rpc("admin_list_digital_inventory_summary", {
      p_search: search || null,
      p_status: status,
      p_page: Number.isFinite(page) ? page : 1,
      p_page_size: Number.isFinite(pageSize) ? pageSize : 20,
    });

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    const message = getOrderErrorMessage(error, "库存数据加载失败");
    await writeAdminAuditLog({
      action: "view_inventory",
      module: "inventory",
      targetType: "digital_inventory",
      result: "failed",
      errorMessage: message,
    });
    return jsonError(message, 500);
  }
}

export async function POST(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({
      action: "import_inventory",
      module: "inventory",
      targetType: "digital_inventory",
      result: "denied",
      errorMessage: admin.message,
    });
    return jsonError(admin.message, admin.status);
  }

  const sizeError = checkRequestSize(request, 2 * 1024 * 1024);
  if (sizeError) return sizeError;
  const rateLimit = checkRateLimit("inventory_import", getAdminRateLimitKey(admin.user.id, "inventory_import"));
  if (!rateLimit.allowed) return rateLimit.response!;

  try {
    const contentTypeHeader = request.headers.get("content-type") ?? "";
    if (contentTypeHeader.includes("multipart/form-data")) {
      const formData = await request.formData();
      const intent = String(formData.get("intent") ?? "preview");
      const productId = String(formData.get("product_id") ?? "").trim();
      const batchName = String(formData.get("batch_name") ?? "").trim();
      const contentType = String(formData.get("content_type") ?? "card_key") as InventoryContentType;
      const file = formData.get("file");

      if (!productId) return jsonError("请选择要导入库存的商品");
      if (!CONTENT_TYPES.has(contentType)) return jsonError("请选择正确的库存内容类型");
      if (!isUploadFile(file)) return jsonError("请选择 TXT 或 CSV 文件");

      const serviceClient = getSupabaseServiceRoleClient();
      if (!serviceClient) return jsonError("服务端未配置库存导入权限，请检查环境变量", 500);

      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = parseInventoryFile({
        fileName: file.name || "inventory.txt",
        buffer,
        contentType,
      });
      const existingHashes = await findExistingContentHashes(
        serviceClient as any,
        productId,
        parsed.items.map((item) => item.contentHash),
      );
      const databaseDuplicateRows = parsed.items.filter((item) => existingHashes.has(item.contentHash)).length;
      const preview = {
        ...parsed,
        items: undefined,
        databaseDuplicateRows,
        estimatedImportRows: parsed.items.length - databaseDuplicateRows,
      };

      if (intent !== "import") {
        return NextResponse.json({ preview });
      }

      const result = await importDigitalInventoryBatch({
        serviceClient: serviceClient as any,
        productId,
        batchName,
        contentType,
        sourceFilename: file.name || "inventory.txt",
        parsed,
        createdBy: admin.user.id,
      });

      await writeAdminAuditLog({
        action: "import_inventory_batch",
        module: "inventory",
        targetType: "digital_inventory_batch",
        targetId: result.batchId,
        targetLabel: result.batchNo,
        result: result.importStatus === "failed" ? "failed" : "success",
        metadata: {
          productId,
          contentType,
          sourceFilename: file.name,
          importedRows: result.importedRows,
          skippedRows: result.skippedRows,
          failedRows: result.failedRows,
        },
      });

      return NextResponse.json({ result });
    }

    const body = await request.json();
    const productId = String(body.product_id ?? "").trim();
    const content = String(body.content ?? "").trim();
    const contentType = String(body.content_type ?? "card_key") as InventoryContentType;

    if (!productId || !content) return jsonError("商品和库存内容不能为空");
    if (!CONTENT_TYPES.has(contentType)) return jsonError("请选择正确的库存内容类型");

    const lines = content.split(/\r\n|\n|\r/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return jsonError("没有可导入的库存内容");

    const { data, error } = await admin.supabase.rpc("admin_import_digital_inventory", {
      p_product_id: productId,
      p_content_type: contentType,
      p_contents: lines,
      p_batch_no: typeof body.batch_no === "string" && body.batch_no.trim() ? body.batch_no.trim() : null,
    });

    if (error) throw error;

    await writeAdminAuditLog({
      action: "import_inventory",
      module: "inventory",
      targetType: "digital_inventory",
      result: "success",
      metadata: { productId, contentType, count: lines.length },
    });

    return NextResponse.json({ data });
  } catch (error) {
    const message = getInventoryImportErrorMessage(error, "库存导入失败");
    await writeAdminAuditLog({
      action: "import_inventory",
      module: "inventory",
      targetType: "digital_inventory",
      result: "failed",
      errorMessage: message,
    });
    return jsonError(message, 500);
  }
}

export async function PATCH(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({
      action: "update_inventory",
      module: "inventory",
      targetType: "digital_inventory",
      result: "denied",
      errorMessage: admin.message,
    });
    return jsonError(admin.message, admin.status);
  }

  try {
    const body = await request.json();
    const action = String(body.action ?? "disable_item");
    const remark = typeof body.remark === "string" ? body.remark.trim() : "";

    if (action === "disable_batch") {
      const batchId = String(body.batch_id ?? "").trim();
      if (!batchId) return jsonError("缺少批次 ID");
      const { data, error } = await admin.supabase.rpc("admin_disable_digital_inventory_batch", {
        p_batch_id: batchId,
        p_reason: remark || null,
      });
      if (error) throw error;
      await writeAdminAuditLog({
        action: "disable_inventory_batch",
        module: "inventory",
        targetType: "digital_inventory_batch",
        targetId: batchId,
        result: "success",
        metadata: { remark },
      });
      return NextResponse.json({ data });
    }

    const inventoryId = String(body.inventory_id ?? "").trim();
    if (!inventoryId) return jsonError("缺少库存 ID");

    if (action === "restore_item") {
      const { data, error } = await admin.supabase.rpc("admin_restore_digital_inventory_item", {
        p_inventory_id: inventoryId,
        p_reason: remark || null,
      });
      if (error) throw error;
      await writeAdminAuditLog({
        action: "restore_inventory_item",
        module: "inventory",
        targetType: "digital_inventory",
        targetId: inventoryId,
        result: "success",
        metadata: { remark },
      });
      return NextResponse.json({ data });
    }

    const { data, error } = await admin.supabase.rpc("admin_disable_digital_inventory", {
      p_inventory_id: inventoryId,
      p_reason: remark || null,
    });

    if (error) throw error;
    await writeAdminAuditLog({
      action: "disable_inventory_item",
      module: "inventory",
      targetType: "digital_inventory",
      targetId: inventoryId,
      result: "success",
      metadata: { remark },
    });
    return NextResponse.json({ data });
  } catch (error) {
    const message = getOrderErrorMessage(error, "库存状态更新失败");
    await writeAdminAuditLog({
      action: "update_inventory",
      module: "inventory",
      targetType: "digital_inventory",
      result: "failed",
      errorMessage: message,
    });
    return jsonError(message, 500);
  }
}
