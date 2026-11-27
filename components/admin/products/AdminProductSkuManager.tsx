"use client";
import { statusLabel } from '@/lib/admin/display-labels';
import { cn } from "@/lib/utils";


import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Check, Database, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import AdminDigitalInventoryPickerModal, { type DigitalInventorySummaryRow } from "@/components/admin/products/AdminDigitalInventoryPickerModal";
import { deriveSkuProductSummary, ensureTrailingEmptySkuRow, isSkuDraftEmpty, validateSkuDraft } from "@/lib/products/sku-editor.mjs";
import { buildSkuWorkspaceOperations, SkuWorkspaceInputError } from "@/lib/products/admin-sku-workspace.mjs";
import { deleteProductSku, executeProductSkuBulkAction, getProductSkuWorkspace, previewProductSkuBulkAction, saveProductSkuWorkspace, ProductSkuWorkspaceError, type AdminProduct, type AdminProductSku, type DeliveryType, type ProductSkuBulkAction, type ProductSkuBulkPreview, type ProductSkuPayload, type ProductSkuWorkspaceOperation, type ProductStatus } from "@/lib/supabase/admin-catalog";
import type { CatalogSkuDiagnostics } from "@/lib/products/catalog-readiness.mjs";
import type { SkuOperationalDiagnostic } from "@/lib/products/fulfillment-inventory-diagnostics.mjs";
import { evaluateSkuActivationReadiness, formatSkuActivationReasons, SKU_ACTIVATION_REASON_LABELS, summarizeSkuReadiness } from "@/lib/products/sku-activation-readiness.mjs";
import { EXTENDED_DELIVERY_OPTIONS, resolveExtendedDeliveryMode, toBaseDeliveryType, type ExtendedDeliveryMode } from "@/lib/products/delivery-and-stock";

type Draft = {
  sku_title: string;
  sku_code: string;
  price: string;
  stock: string;
  cost_price: string;
  original_price: string;
  image_url: string;
  sort_order: string;
  status: ProductStatus;
  delivery_type: DeliveryType | "";
  delivery_mode?: ExtendedDeliveryMode;
  digital_inventory_product_id?: string;
  digital_inventory_product_name?: string;
  pending_bound_inventory_count?: number;
  touched?: boolean;
};
type EditorRow = { key: string; sku?: AdminProductSku; draft: Draft };
export type ProductSkuManagerHandle = { validate: () => boolean; prepareSave: () => Promise<boolean>; saveAll: (product: AdminProduct) => Promise<void>; reload?: () => Promise<void> };
type Props = { product: AdminProduct | null; productSlug?: string; refreshKey?: number; defaults: { price: string; original_price: string; stock: string; delivery_type: DeliveryType; delivery_mode?: ExtendedDeliveryMode; status: ProductStatus }; onSummary: (summary: { price: number | null; stock: number; delivery_type?: DeliveryType; delivery_mode?: ExtendedDeliveryMode }) => void; onSupplierBinding: (product: AdminProduct, sku: AdminProductSku) => void };
const emptyDraft = (): Draft => ({
  sku_title: "",
  sku_code: "",
  price: "",
  stock: "",
  cost_price: "",
  original_price: "",
  image_url: "",
  sort_order: "0",
  status: "active",
  delivery_type: "manual",
  delivery_mode: "manual",
  digital_inventory_product_id: "",
  digital_inventory_product_name: "",
});
const emptyRow = (): EditorRow => ({ key: crypto.randomUUID(), draft: emptyDraft() });

function extractInitialCostPrice(metadata?: Record<string, unknown> | null): string {
  if (!metadata || typeof metadata !== "object") return "";
  const explicit = metadata.cost_price ?? metadata.cost_price_cny;
  if (explicit !== null && explicit !== undefined && String(explicit).trim() !== "") {
    return String(explicit);
  }
  return "";
}

const toDraft = (sku: AdminProductSku, productMetadata?: Record<string, unknown> | null): Draft => {
  const mode = resolveExtendedDeliveryMode(sku.delivery_type, sku.metadata ?? productMetadata);
  const meta = sku.metadata && typeof sku.metadata === "object" ? sku.metadata : null;
  return {
    sku_title: sku.sku_title ?? "",
    sku_code: sku.sku_code ?? "",
    price: String(sku.price),
    stock: String(sku.stock),
    cost_price: extractInitialCostPrice(meta),
    original_price: sku.original_price == null ? "" : String(sku.original_price),
    image_url: sku.image_url ?? "",
    sort_order: String(sku.sort_order),
    status: sku.status,
    delivery_type: sku.delivery_type ?? toBaseDeliveryType(mode),
    delivery_mode: mode,
    digital_inventory_product_id: typeof meta?.digital_inventory_product_id === "string" ? meta.digital_inventory_product_id : "",
    digital_inventory_product_name: typeof meta?.digital_inventory_product_name === "string" ? meta.digital_inventory_product_name : "",
  };
};
const payload = (draft: Draft): ProductSkuPayload => ({ sku_title: draft.sku_title.trim(), sku_code: draft.sku_code.trim(), price: Number(draft.price), stock: Number(draft.stock), original_price: draft.original_price === "" ? null : Number(draft.original_price), image_url: draft.image_url.trim() || null, sort_order: Number(draft.sort_order), status: draft.status, delivery_type: toBaseDeliveryType(draft.delivery_mode ?? draft.delivery_type) });
const getDerivedDeliveryType = (summary: unknown): DeliveryType | undefined =>
  summary && typeof summary === "object" && "delivery_type" in summary && typeof (summary as { delivery_type?: unknown }).delivery_type === "string"
    ? ((summary as { delivery_type: DeliveryType }).delivery_type)
    : undefined;

function getSupplierBindingDisplay(metadata?: Record<string, unknown> | null) {
  if (!metadata || typeof metadata !== "object") {
    return { bound: false, label: "未绑定 · 绑定供货商", sublabel: "" };
  }
  const supplier = String(metadata.supplier ?? "").trim().toLowerCase();
  const productId = String(metadata.supplier_product_id ?? "").trim();
  const supplierSku = String(metadata.supplier_sku ?? "").trim();
  const supplierCost = metadata.supplier_cost != null && String(metadata.supplier_cost).trim() !== "" ? String(metadata.supplier_cost).trim() : "";
  const currency = String(metadata.supplier_cost_currency ?? metadata.supplier_currency ?? "CNY").trim().toUpperCase();
  const costText = supplierCost ? `${currency === "USD" ? "$" : "¥"}${supplierCost}` : "";

  if (supplier === "kuajingzy" && productId) {
    return {
      bound: true,
      label: "已绑定 · 跨境资源",
      sublabel: [supplierSku ? `规格 ${supplierSku}` : "", costText ? `成本 ${costText}` : ""].filter(Boolean).join(" · "),
    };
  }
  if (supplier === "bitrefill" && productId) {
    return {
      bound: true,
      label: "已绑定 · Bitrefill",
      sublabel: [supplierSku || productId, costText ? `成本 ${costText}` : ""].filter(Boolean).join(" · "),
    };
  }
  if (supplier === "daju" && productId) {
    return {
      bound: true,
      label: "已绑定 · 大橘",
      sublabel: `#${productId}${supplierSku ? ` · ${supplierSku}` : ""}`,
    };
  }
  if (metadata.supplier_binding_candidate) {
    return { bound: false, label: "Bitrefill 候选待审", sublabel: "点击配置绑定" };
  }
  return { bound: false, label: "未绑定 · 绑定供货商", sublabel: "" };
}

const fulfillmentSourceLabel: Record<SkuOperationalDiagnostic["fulfillment_source"], string> = {
  local_inventory: "本地库存", supplier: "供应商", hybrid: "本地与供应商", none: "没有供货来源",
  manual: "人工交付", shipping: "实物配送", unknown: "暂未获取",
};
const supplierStockLabel: Record<SkuOperationalDiagnostic["supplier_stock"]["state"], string> = {
  fresh: "有效", stale: "已过期，需核查", error: "读取失败", unknown: "暂未获取", not_applicable: "不适用",
};
const diagnosticNextActionLabels: Record<string, string> = {
  RETRY_DIAGNOSTICS: "刷新诊断；若仍失败，请检查数据与读取权限",
  VERIFY_STOCK: "核验商品规格独立库存，不使用父商品库存替代",
  ADD_LOCAL_INVENTORY_OR_BIND_SUPPLIER: "补充商品规格级本地库存或确认供应商履约来源",
  COMPLETE_SUPPLIER_BINDING: "确认准确的供应商商品与商品规格和成本上限",
  REFRESH_SUPPLIER_STOCK_EVIDENCE: "通过另行授权的流程核验供应商库存快照",
  VERIFY_INVENTORY: "人工核验库存和履约证据",
};

function SkuOperationalDiagnostics({ diagnostic }: { diagnostic?: SkuOperationalDiagnostic }) {
  if (!diagnostic) return null;
  const isReady = diagnostic.health === "ready";
  const isBlocked = diagnostic.health === "blocked";
  const isAttention = diagnostic.health === "attention";

  const badgeClass = isReady
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : isBlocked
      ? "border-red-200 bg-red-50 text-red-700"
      : isAttention
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
      <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", badgeClass)}>
        {statusLabel(diagnostic.health)}
      </Badge>
      {diagnostic.verification.required ? <Badge variant="outline" title="需要核验库存" className="h-5 border-orange-200 bg-orange-50 px-1.5 text-[10px] text-orange-700">库存待验证</Badge> : null}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="cursor-pointer text-[10px] text-slate-500 hover:text-slate-800 hover:underline">
            诊断详情 ▾
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="left"
          sideOffset={8}
          collisionPadding={16}
          className="z-[9999] w-76 space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-2xl"
        >
          <div className="font-semibold text-slate-900 border-b border-slate-100 pb-1.5 flex items-center justify-between">
            <span>规格诊断详情</span>
            <Badge variant="outline" className={cn("h-4 px-1 text-[9px]", badgeClass)}>
              {statusLabel(diagnostic.health)}
            </Badge>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between"><span>交付来源：</span><span className="font-medium text-slate-800">{fulfillmentSourceLabel[diagnostic.fulfillment_source]}</span></div>
            <div className="flex justify-between"><span>本地库存：</span><span className="font-medium text-slate-800">{diagnostic.local_inventory.state === "error" ? "读取失败" : diagnostic.local_inventory.available_count}</span></div>
            <div className="flex justify-between">
              <span>供应商绑定：</span>
              <span className="font-medium text-slate-800">
                {diagnostic.effective_delivery_type !== "automatic" || diagnostic.fulfillment_source === "local_inventory"
                  ? "不适用"
                  : diagnostic.supplier.bound
                    ? `已绑定${diagnostic.supplier.provider ? `（${diagnostic.supplier.provider === "kuajingzy" ? "跨境资源网" : diagnostic.supplier.provider === "daju" ? "大橘" : diagnostic.supplier.provider === "bitrefill" ? "Bitrefill" : diagnostic.supplier.provider}）` : ""}`
                    : "未绑定"}
              </span>
            </div>
            {diagnostic.supplier.bound && diagnostic.supplier_stock.quantity !== null ? (
              <div className="flex justify-between">
                <span>上游库存快照：</span>
                <span className="font-medium text-slate-800">{diagnostic.supplier_stock.quantity} 件</span>
              </div>
            ) : null}
            <div className="flex justify-between"><span>库存状态：</span><span className="font-medium text-slate-800">{supplierStockLabel[diagnostic.supplier_stock.state]}</span></div>
            <div className="flex justify-between"><span>上架条件：</span><span className={cn("font-medium", diagnostic.activation.ready ? "text-emerald-600" : "text-red-600")}>{diagnostic.activation.ready ? "符合要求" : "不符合"}</span></div>
          </div>
          {diagnostic.activation.reasons.length > 0 ? (
            <div className="mt-1 border-t border-slate-100 pt-1.5 text-red-600 text-[11px] space-y-0.5">
              {diagnostic.activation.reasons.map((r) => (
                <div key={r}>• {SKU_ACTIVATION_REASON_LABELS[r as keyof typeof SKU_ACTIVATION_REASON_LABELS] ?? r}</div>
              ))}
            </div>
          ) : null}
          {diagnostic.next_actions && diagnostic.next_actions.length > 0 ? (
            <div className="mt-1 border-t border-slate-100 pt-1.5 text-slate-500 text-[11px] space-y-0.5">
              {diagnostic.next_actions.map((action) => (
                <div key={action}>建议：{diagnosticNextActionLabels[action] ?? action}</div>
              ))}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

const AdminProductSkuManager = forwardRef<ProductSkuManagerHandle, Props>(function AdminProductSkuManager({ product, productSlug, refreshKey = 0, defaults, onSummary, onSupplierBinding }, ref) {
  const [rows, setRows] = useState<EditorRow[]>([]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const onSummaryRef = useRef(onSummary);
  onSummaryRef.current = onSummary;
  const normalizedProductSlug = (productSlug ?? product?.slug ?? "").trim();
  const productSlugRef = useRef(normalizedProductSlug);
  productSlugRef.current = normalizedProductSlug;
  const prevSlugForSyncRef = useRef(normalizedProductSlug);

  const syncSingleSkuCode = useCallback((candidateRows: EditorRow[], slugValue = productSlugRef.current, forceOverwrite = false) => {
    const cleanSlug = slugValue.trim();
    if (!cleanSlug) return { rows: candidateRows, autoSynced: false };
    const nonEmptyIndices = candidateRows
      .map((row, idx) => (row.sku || !isSkuDraftEmpty(row.draft) ? idx : -1))
      .filter((idx) => idx >= 0);
    if (nonEmptyIndices.length !== 1) return { rows: candidateRows, autoSynced: false };
    const targetIdx = nonEmptyIndices[0];
    const targetRow = candidateRows[targetIdx];
    const currentCode = targetRow.draft.sku_code.trim();
    if (currentCode === cleanSlug) return { rows: candidateRows, autoSynced: false };
    if (!forceOverwrite && targetRow.draft.touched && currentCode.length > 0) {
      return { rows: candidateRows, autoSynced: false };
    }
    const updated = candidateRows.map((row, idx) =>
      idx === targetIdx
        ? { ...row, draft: { ...row.draft, sku_code: cleanSlug, touched: forceOverwrite ? true : row.draft.touched } }
        : row
    );
    return { rows: updated, autoSynced: true };
  }, []);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [diagnostics, setDiagnostics] = useState<CatalogSkuDiagnostics | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedSkuIds, setSelectedSkuIds] = useState<Set<string>>(new Set());
  const [bulkPreview, setBulkPreview] = useState<ProductSkuBulkPreview | null>(null);
  const flight = useRef(false);
  const [deleting, setDeleting] = useState<EditorRow | null>(null);
  const [inventoryPickerRowKey, setInventoryPickerRowKey] = useState<string | null>(null);
  const [activationBlocked, setActivationBlocked] = useState<Array<{ code: string; stock: number; supplierBound: boolean; localAvailable: number; inventoryState: string | null; reasons: string[] }>>([]);
  const [activationConfirmation, setActivationConfirmation] = useState<Array<{ code: string; stock: number; source: string; supplierBound: boolean; localAvailable: number; inventoryState: string | null }> | null>(null);
  const activationConfirmationResolver = useRef<((confirmed: boolean) => void) | null>(null);
  const productId = product?.id;
  const productMetadataRef = useRef(product?.metadata ?? null);
  productMetadataRef.current = product?.metadata ?? null;
  const previousProductId = useRef(productId);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const workspace = productId ? await getProductSkuWorkspace(productId) : { skus: [], diagnostics: null };
      const skus = workspace.skus;
      setDiagnostics(workspace.diagnostics);
      setSelectedSkuIds((current) => new Set(Array.from(current).filter((id) => skus.some((sku) => sku.id === id))));
      setRows((current) => {
        if (!skus.length && !current.some((row) => row.sku)) {
          return ensureTrailingEmptySkuRow(current.filter((row) => row.key !== "legacy"), emptyRow);
        }
        const persisted = skus.map((sku) => {
          const previous = current.find((row) => row.sku?.id === sku.id);
          if (!previous || !previous.draft.touched) return { key: sku.id, sku, draft: toDraft(sku, productMetadataRef.current) };
          return { ...previous, sku, draft: { ...previous.draft, ...(previous.draft.stock === String(previous.sku?.stock) ? { stock: String(sku.stock) } : {}) } };
        });
        const merged = [...persisted, ...current.filter((row) => !row.sku && row.key !== "legacy" && !isSkuDraftEmpty(row.draft)), emptyRow()];
        const synced = syncSingleSkuCode(merged, productSlugRef.current, false);
        return synced.rows;
      });
    } catch (error) { setDiagnostics(null); setLoadError(error instanceof Error ? error.message : "商品规格读取失败"); }
    finally { setLoading(false); }
  }, [productId, syncSingleSkuCode]);
  useEffect(() => {
    if (!normalizedProductSlug || loading) return;
    if (prevSlugForSyncRef.current === normalizedProductSlug) return;
    prevSlugForSyncRef.current = normalizedProductSlug;
    const synced = syncSingleSkuCode(rowsRef.current, normalizedProductSlug, true);
    if (synced.autoSynced) {
      rowsRef.current = synced.rows;
      setRows(synced.rows);
      onSummaryRef.current(deriveSkuProductSummary(synced.rows.filter((item) => !isSkuDraftEmpty(item.draft)).map((item) => item.draft)));
    }
  }, [loading, normalizedProductSlug, syncSingleSkuCode]);
  useEffect(() => {
    if (previousProductId.current !== productId) {
      setRows([]); rowsRef.current = [];
      setSelectedSkuIds(new Set());
      setBulkPreview(null);
      prevSlugForSyncRef.current = normalizedProductSlug;
    }
    previousProductId.current = productId;
    void load();
  }, [load, normalizedProductSlug, productId]);
  useEffect(() => { if (refreshKey) void load(); }, [load, refreshKey]);

  function validate() {
    if (loading || loadError || flight.current) { toast.warning("请等待商品规格读取完成后再保存"); return false; }
    const next = Object.fromEntries(rowsRef.current.filter((row) => row.sku || !isSkuDraftEmpty(row.draft)).map((row) => [row.key, validateSkuDraft(row.draft)]));
    setErrors(next);
    if (Object.values(next).some((fields) => Object.keys(fields).length)) { toast.warning("请补全标红的商品规格字段"); return false; }
    const codes = rowsRef.current.filter((row) => row.sku || !isSkuDraftEmpty(row.draft)).map((row) => row.draft.sku_code.trim().toLowerCase());
    if (new Set(codes).size !== codes.length) { toast.warning("商品规格编码不能重复"); return false; }
    return true;
  }

  function activationCandidates() {
    const diagnosticsBySku = new Map((diagnostics?.supplier_rows ?? []).map((row) => [row.sku_id, row]));
    return rowsRef.current.flatMap((row) => {
      if (!row.sku && isSkuDraftEmpty(row.draft)) return [];
      if (row.draft.status !== "active" || row.sku?.status === "active") return [];
      const effectiveDeliveryType = toBaseDeliveryType(row.draft.delivery_mode ?? row.draft.delivery_type) || product?.delivery_type || defaults.delivery_type;
      if (effectiveDeliveryType !== "automatic") return [];
      const diagnostic = row.sku ? diagnosticsBySku.get(row.sku.id) : null;
      const isDigitalMode = row.draft.delivery_mode === "automatic_digital_inventory";
      const pendingLocalCount =
        isDigitalMode && row.draft.digital_inventory_product_id && row.draft.digital_inventory_product_id === product?.id
          ? Number(row.draft.pending_bound_inventory_count ?? 0)
          : 0;
      const mergedMetadata = {
        ...(row.sku?.metadata ?? {}),
        ...(isDigitalMode
          ? {
              delivery_mode: "automatic_digital_inventory",
              fulfillment_source: "local_inventory",
              ...(row.draft.digital_inventory_product_id
                ? { digital_inventory_product_id: row.draft.digital_inventory_product_id }
                : {}),
            }
          : {}),
      };
      const readiness = evaluateSkuActivationReadiness({
        product: product ?? { delivery_type: defaults.delivery_type },
        sku: {
          ...(row.sku ?? {}),
          ...payload(row.draft),
          metadata: mergedMetadata,
        },
        localAvailableCount: Math.max(diagnostic?.local_available_count ?? 0, pendingLocalCount),
        localInventoryError: diagnostic?.activation_readiness?.reasons.includes("READINESS_CHECK_FAILED") ?? false,
      });
      return [{ row, readiness }];
    });
  }

  async function prepareSave() {
    const candidates = activationCandidates();
    if (!candidates.length) { setActivationBlocked([]); return true; }
    const blocked = candidates.filter((candidate) => !candidate.readiness.ready).map((candidate) => ({
      code: candidate.row.draft.sku_code || candidate.row.draft.sku_title || "新商品规格",
      stock: candidate.readiness.stock,
      supplierBound: candidate.readiness.supplier.binding_complete,
      localAvailable: candidate.readiness.local_available_count,
      inventoryState: candidate.readiness.inventory_state,
      reasons: candidate.readiness.reasons,
    }));
    if (blocked.length) {
      setActivationBlocked(blocked);
      toast.error("商品规格激活条件未满足，请先处理下方就绪检查问题");
      return false;
    }
    setActivationBlocked([]);
    return new Promise<boolean>((resolve) => {
      activationConfirmationResolver.current = resolve;
      setActivationConfirmation(candidates.map((candidate) => ({
        code: candidate.row.draft.sku_code || candidate.row.draft.sku_title,
        stock: candidate.readiness.stock,
        source: candidate.readiness.source,
        supplierBound: candidate.readiness.supplier.binding_complete,
        localAvailable: candidate.readiness.local_available_count,
        inventoryState: candidate.readiness.inventory_state,
      })));
    });
  }

  function resolveActivationConfirmation(confirmed: boolean) {
    const resolve = activationConfirmationResolver.current;
    activationConfirmationResolver.current = null;
    setActivationConfirmation(null);
    resolve?.(confirmed);
  }
  async function saveAll(savedProduct: AdminProduct) {
    if (!validate()) throw new Error("商品规格尚未填写完整");
    flight.current = true; setBusy(true);
    try {
      const snapshotRows = rowsRef.current;
      let operations: ProductSkuWorkspaceOperation[] = buildSkuWorkspaceOperations({
        rows: snapshotRows,
        buildPayload: payload,
        isEmptyDraft: isSkuDraftEmpty,
      });
      if (!operations.length) {
        onSummary(deriveSkuProductSummary(snapshotRows.flatMap((row) => row.sku ? [row.sku] : [])));
        return;
      }

      // Pre-bind digital inventory for existing SKUs BEFORE workspace RPC activation check
      // so sku_id-scoped digital_inventory rows are linked and expected_updated_at stays fresh.
      const preBindUpdates = snapshotRows
        .filter((row) =>
          row.draft.touched
          && Boolean(row.sku?.id)
          && row.draft.delivery_mode === "automatic_digital_inventory"
          && row.draft.digital_inventory_product_id?.trim() === savedProduct.id
        )
        .map((row) => {
          const rawCost = row.draft.cost_price.trim();
          const parsedCost = rawCost === "" ? null : Number(rawCost);
          return {
            sku_id: row.sku!.id,
            cost_price: parsedCost !== null && Number.isFinite(parsedCost) ? parsedCost : null,
            delivery_mode: "automatic_digital_inventory" as ExtendedDeliveryMode,
            digital_inventory_product_id: row.draft.digital_inventory_product_id!.trim(),
            digital_inventory_product_name: row.draft.digital_inventory_product_name?.trim() || null,
            expected_updated_at: row.sku!.updated_at ?? null,
          };
        });

      const preBoundSkuIds = new Set<string>();
      if (preBindUpdates.length > 0) {
        const preRes = await fetch(`/api/admin/products/${encodeURIComponent(savedProduct.id)}/skus/metadata`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ updates: preBindUpdates }),
        });
        const preBody = (await preRes.json().catch(() => null)) as {
          error?: string;
          code?: string;
          skus?: Array<{ id: string; metadata: Record<string, unknown>; updated_at?: string | null }>;
        } | null;
        if (!preRes.ok) {
          const msg = preBody?.error || "SKU 成本与数字库存配置保存失败";
          toast.error(msg);
          throw new Error(msg);
        }
        const updatedAtById = new Map(
          (preBody?.skus ?? [])
            .filter((entry) => typeof entry.updated_at === "string" && entry.updated_at)
            .map((entry) => [entry.id, entry.updated_at as string])
        );
        (preBody?.skus ?? []).forEach((entry) => preBoundSkuIds.add(entry.id));
        operations = operations.map((op) =>
          op.type === "update" && updatedAtById.has(op.sku_id)
            ? { ...op, expected_updated_at: updatedAtById.get(op.sku_id)! }
            : op
        );
      }

      const result = await saveProductSkuWorkspace(savedProduct.id, operations);
      const createdIdByClient = new Map((result.created_mappings ?? []).map((item) => [item.client_id, item.sku_id]));
      const latestUpdatedAtById = new Map(result.skus.map((sku) => [sku.id, sku.updated_at ?? null]));
      const metadataUpdates = snapshotRows
        .filter((row) => row.draft.touched && (row.sku || !isSkuDraftEmpty(row.draft)))
        .map((row) => {
          const skuId = row.sku?.id ?? createdIdByClient.get(row.key) ?? "";
          if (!skuId || preBoundSkuIds.has(skuId)) return null;
          const rawCost = row.draft.cost_price.trim();
          const parsedCost = rawCost === "" ? null : Number(rawCost);
          return {
            sku_id: skuId,
            cost_price: parsedCost !== null && Number.isFinite(parsedCost) ? parsedCost : null,
            delivery_mode: row.draft.delivery_mode ?? "manual",
            digital_inventory_product_id: row.draft.digital_inventory_product_id?.trim() || null,
            digital_inventory_product_name: row.draft.digital_inventory_product_name?.trim() || null,
            expected_updated_at: latestUpdatedAtById.get(skuId) ?? row.sku?.updated_at ?? null,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      let mergedSkus = result.skus;
      if (metadataUpdates.length > 0) {
        const metaRes = await fetch(`/api/admin/products/${encodeURIComponent(savedProduct.id)}/skus/metadata`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ updates: metadataUpdates }),
        });
        const metaBody = (await metaRes.json().catch(() => null)) as {
          error?: string;
          code?: string;
          skus?: Array<{ id: string; metadata: Record<string, unknown>; updated_at?: string | null }>;
        } | null;
        if (!metaRes.ok) {
          const msg = metaBody?.error || "SKU 成本/交付配置保存失败，请刷新确认后重试";
          toast.error(msg);
          throw new Error(msg);
        }
        const metaById = new Map((metaBody?.skus ?? []).map((entry) => [entry.id, entry]));
        mergedSkus = result.skus.map((sku) => {
          const entry = metaById.get(sku.id);
          return entry
            ? { ...sku, metadata: entry.metadata, updated_at: entry.updated_at ?? sku.updated_at }
            : sku;
        });
      }

      const next = ensureTrailingEmptySkuRow(mergedSkus.map((sku) => ({ key: sku.id, sku, draft: toDraft(sku, savedProduct.metadata ?? null) })), emptyRow);
      rowsRef.current = next; setRows(next);
      setActivationBlocked([]);
      setSelectedSkuIds((current) => new Set(Array.from(current).filter((id) => mergedSkus.some((sku) => sku.id === id))));
      const activeDrafts = next.filter((item) => !isSkuDraftEmpty(item.draft)).map((item) => item.draft);
      const derived = deriveSkuProductSummary(activeDrafts);
      const primaryMode = activeDrafts.find((d) => d.status === "active")?.delivery_mode ?? activeDrafts[0]?.delivery_mode;
      onSummary({ price: result.product_summary.price, stock: result.product_summary.stock, delivery_type: getDerivedDeliveryType(derived), delivery_mode: primaryMode });
      toast.success(`商品规格已保存：新增 ${result.created_count}，更新 ${result.updated_count}`);
    } catch (error) {
      if (error instanceof ProductSkuWorkspaceError || error instanceof SkuWorkspaceInputError) {
        if (error.code === "SKU_WORKSPACE_STALE") {
          toast.error("商品规格已被其他操作修改，请刷新后重新确认");
        } else if (error instanceof ProductSkuWorkspaceError && error.code === "SKU_ACTIVATION_NOT_READY") {
          setActivationBlocked(error.blockedItems.map((item) => ({
            code: item.sku_code ?? item.sku_id ?? "SKU",
            stock: 0,
            supplierBound: false,
            localAvailable: 0,
            inventoryState: null,
            reasons: item.reasons,
          })));
          toast.error("商品规格激活条件未满足，请先处理下方就绪检查问题");
        }
      }
      throw error;
    } finally { flight.current = false; setBusy(false); }
  }
  useImperativeHandle(ref, () => ({ validate, prepareSave, saveAll, reload: load }));

  async function createAndBindRow(row: EditorRow) {
    if (!product || flight.current) return;
    if (isSkuDraftEmpty(row.draft)) {
      toast.warning("请先填写规格名称、编码、售价和库存");
      return;
    }
    const rowErrors = validateSkuDraft(row.draft);
    if (Object.keys(rowErrors).length > 0) {
      setErrors((prev) => ({ ...prev, [row.key]: rowErrors }));
      toast.warning("请补全标红的商品规格字段");
      return;
    }
    const targetCode = row.draft.sku_code.trim();
    const targetDraft: Draft = {
      ...row.draft,
      status: row.draft.delivery_type === "automatic" && row.draft.status === "active" ? "draft" : row.draft.status,
    };
    flight.current = true;
    setBusy(true);
    try {
      const operations: ProductSkuWorkspaceOperation[] = buildSkuWorkspaceOperations({
        rows: [{ ...row, draft: targetDraft }],
        buildPayload: payload,
        isEmptyDraft: isSkuDraftEmpty,
      });
      const result = await saveProductSkuWorkspace(product.id, operations);
      const next = ensureTrailingEmptySkuRow(result.skus.map((sku) => ({ key: sku.id, sku, draft: toDraft(sku) })), emptyRow);
      rowsRef.current = next;
      setRows(next);
      const derived = deriveSkuProductSummary(next.filter((item) => !isSkuDraftEmpty(item.draft)).map((item) => item.draft));
      onSummary({ price: result.product_summary.price, stock: result.product_summary.stock, delivery_type: getDerivedDeliveryType(derived) });
      const createdSku = result.skus.find((sku) => (sku.sku_code ?? "").toLowerCase() === targetCode.toLowerCase());
      if (createdSku) {
        toast.success("规格已创建，请选择要绑定的供应商");
        onSupplierBinding(product, createdSku);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建规格失败");
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }

  function change(row: EditorRow, key: keyof Draft, value: string) {
    const next = ensureTrailingEmptySkuRow(
      rowsRef.current.map((item) => {
        if (item.key !== row.key) return item;
        if (key === "delivery_mode") {
          const mode = value as ExtendedDeliveryMode;
          return {
            ...item,
            draft: {
              ...item.draft,
              delivery_mode: mode,
              delivery_type: toBaseDeliveryType(mode),
              touched: true,
            },
          };
        }
        return { ...item, draft: { ...item.draft, [key]: value, touched: true } };
      }),
      emptyRow
    );
    rowsRef.current = next; setRows(next);
    const activeDrafts = next.filter((item) => !isSkuDraftEmpty(item.draft)).map((item) => item.draft);
    const derived = deriveSkuProductSummary(activeDrafts);
    const firstMode = activeDrafts.find((d) => d.delivery_mode)?.delivery_mode;
    onSummary({ ...derived, delivery_mode: firstMode });
  }

  async function handleBindDigitalInventory(rowKey: string, invRow: DigitalInventorySummaryRow) {
    const targetRow = rowsRef.current.find((item) => item.key === rowKey);
    const next = rowsRef.current.map((item) =>
      item.key === rowKey
        ? {
            ...item,
            draft: {
              ...item.draft,
              stock: String(invRow.available_count),
              delivery_mode: "automatic_digital_inventory" as ExtendedDeliveryMode,
              delivery_type: "automatic" as DeliveryType,
              digital_inventory_product_id: invRow.product_id,
              digital_inventory_product_name: invRow.product_name,
              pending_bound_inventory_count: invRow.product_id === product?.id ? invRow.available_count : 0,
              touched: true,
            },
          }
        : item
    );
    rowsRef.current = next;
    setRows(next);
    const activeDrafts = next.filter((item) => !isSkuDraftEmpty(item.draft)).map((item) => item.draft);
    const derived = deriveSkuProductSummary(activeDrafts);
    onSummary({ ...derived, delivery_mode: "automatic_digital_inventory" });
    setInventoryPickerRowKey(null);

    if (product?.id && targetRow?.sku?.id) {
      try {
        const res = await fetch(`/api/admin/products/${encodeURIComponent(product.id)}/skus/metadata`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            updates: [
              {
                sku_id: targetRow.sku.id,
                delivery_mode: "automatic_digital_inventory",
                digital_inventory_product_id: invRow.product_id,
                digital_inventory_product_name: invRow.product_name,
              },
            ],
          }),
        });
        if (res.ok) {
          const body = (await res.json().catch(() => null)) as {
            skus?: Array<{ id: string; metadata: Record<string, unknown>; updated_at?: string | null; local_available_count?: number }>;
          } | null;
          const updated = body?.skus?.[0];
          const syncedCount = typeof updated?.local_available_count === "number" ? updated.local_available_count : invRow.available_count;
          setRows((current) =>
            current.map((item) =>
              item.key === rowKey
                ? {
                    ...item,
                    sku: item.sku
                      ? {
                          ...item.sku,
                          metadata: updated?.metadata ?? item.sku.metadata,
                          updated_at: updated?.updated_at ?? item.sku.updated_at,
                        }
                      : item.sku,
                    draft: {
                      ...item.draft,
                      stock: String(syncedCount),
                      pending_bound_inventory_count: syncedCount,
                      touched: true,
                    },
                  }
                : item
            )
          );
          setActivationBlocked([]);
          void load();
          toast.success(`已绑定数字库存「${invRow.product_name}」，可用 ${syncedCount}（点击保存商品提交修改）`);
          return;
        }
      } catch {
        // Fallback to saving on submit if immediate bind fails.
      }
    }
    toast.success(`已选择数字库存「${invRow.product_name}」，可用库存 ${invRow.available_count}（点击保存商品后生效）`);
  }

  async function removeRow() {
    if (!deleting || !product || flight.current) return;
    flight.current = true; setBusy(true);
    try {
      if (deleting.sku) await deleteProductSku(product.id, deleting.sku.id);
      const next = ensureTrailingEmptySkuRow(rowsRef.current.filter((row) => row.key !== deleting.key), emptyRow);
      rowsRef.current = next; setRows(next);
      onSummary(deriveSkuProductSummary(next.filter((row) => !isSkuDraftEmpty(row.draft)).map((row) => row.draft)));
      toast.success("商品规格已删除"); setDeleting(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "商品规格删除失败"); }
    finally { flight.current = false; setBusy(false); }
  }

  function toggleSkuSelection(skuId: string, selected: boolean) {
    setSelectedSkuIds((current) => {
      const next = new Set(current);
      if (selected) next.add(skuId); else next.delete(skuId);
      return next;
    });
  }

  async function openBulkPreview(action: ProductSkuBulkAction) {
    if (!product || selectedSkuIds.size === 0 || bulkBusy || busy) return;
    if (rowsRef.current.some((row) => row.sku && selectedSkuIds.has(row.sku.id) && row.draft.touched)) {
      toast.warning("选中的商品规格有未保存修改，请先保存或刷新后再批量操作");
      return;
    }
    setBulkBusy(true);
    try {
      setBulkPreview(await previewProductSkuBulkAction(product.id, Array.from(selectedSkuIds), action));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量操作预检失败");
    } finally {
      setBulkBusy(false);
    }
  }

  async function executeBulkStatus() {
    if (!product || !bulkPreview || bulkBusy || !bulkPreview.execution_supported || !bulkPreview.can_execute
      || bulkPreview.blocked_count > 0 || bulkPreview.will_change_count === 0) return;
    setBulkBusy(true);
    try {
      const skuIds = bulkPreview.items.map((item) => item.sku_id);
      const result = await executeProductSkuBulkAction(product.id, skuIds, bulkPreview.action);
      toast.success(bulkPreview.action === "activate"
        ? `批量激活完成：激活 ${result.updated_count}，无需修改 ${result.no_change_count}`
        : `批量更新完成：修改 ${result.updated_count}，无需修改 ${result.no_change_count}`);
      const derived = deriveSkuProductSummary( rowsRef.current.filter((item) => !isSkuDraftEmpty(item.draft)).map((item) => item.draft));
      onSummary({ price: result.product_summary.price, stock: result.product_summary.stock, delivery_type: getDerivedDeliveryType(derived) });
      setSelectedSkuIds(new Set());
      setBulkPreview(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? `${error.message}；商品规格状态或履约条件可能已变化，请重新预检` : "批量更新失败；请重新预检");
      try {
        const selected = bulkPreview.items.map((item) => item.sku_id);
        setBulkPreview(await previewProductSkuBulkAction(product.id, selected, bulkPreview.action));
      } catch {
        // Keep the existing selection and last safe preview when the refresh itself fails.
      }
    } finally {
      setBulkBusy(false);
    }
  }

  const readinessSummary = useMemo(() => summarizeSkuReadiness(
    rows.filter((row) => row.sku).map((row) => ({
      ...row.sku!,
      ...payload(row.draft),
      metadata: {
        ...(row.sku?.metadata ?? {}),
        ...(row.draft.delivery_mode === "automatic_digital_inventory"
          ? { delivery_mode: "automatic_digital_inventory", fulfillment_source: "local_inventory" }
          : row.draft.delivery_mode === "preorder_address" || row.draft.delivery_mode === "preorder_email"
            ? { delivery_mode: row.draft.delivery_mode }
            : {}),
      },
    })),
    diagnostics?.supplier_rows ?? [],
    product,
  ), [diagnostics, product, rows]);
  const operationalBySku = useMemo(() => new Map((diagnostics?.operational_rows ?? []).map((row) => [row.sku_id, row])), [diagnostics]);
  const operationalSummary = diagnostics?.operational_summary;
  const visibleSkuIds = rows.flatMap((row) => row.sku ? [row.sku.id] : []);
  const allVisibleSelected = visibleSkuIds.length > 0 && visibleSkuIds.every((id) => selectedSkuIds.has(id));
  const bulkActionLabel: Record<ProductSkuBulkAction, string> = { set_draft: "批量设为 草稿", set_sold_out: "批量设为 售罄", activate: "批量 上架" };

  const hasDiagnosticAlert = Boolean(
    (diagnostics && (!diagnostics.schema_ready || diagnostics.legacy_db_sku_missing || diagnostics.supplier_unbound_count > 0 || diagnostics.supplier_problem_count > 0)) ||
    readinessSummary.no_verified_source > 0 ||
    (operationalSummary && (operationalSummary.blocked > 0 || operationalSummary.attention > 0))
  );
  const showUnifiedDiagnostics = Boolean(product?.has_skus || readinessSummary.total > 0 || (diagnostics && !diagnostics.schema_ready));
  const activePickerRow = inventoryPickerRowKey ? rows.find((r) => r.key === inventoryPickerRowKey) ?? null : null;

  return <div className="min-w-0 space-y-2">
    {loadError ? <p role="alert" className="text-sm text-red-600">{loadError}</p> : null}

    {/* 合并后的单一「规格与交付状态检查」折叠栏 */}
    {showUnifiedDiagnostics ? (
      <details
        className={cn(
          "group rounded-lg border p-2.5 text-xs",
          hasDiagnosticAlert
            ? "border-amber-200 bg-amber-50/60 text-amber-950"
            : "border-slate-200 bg-slate-50/70 text-slate-700"
        )}
      >
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 font-medium select-none">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800">交付与库存诊断</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                !diagnostics?.schema_ready && diagnostics
                  ? "bg-red-100 text-red-700"
                  : hasDiagnosticAlert
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-700"
              )}
            >
              {diagnostics && !diagnostics.schema_ready ? "结构升级中" : hasDiagnosticAlert ? "需关注" : "就绪"}
            </span>
            <span className="text-[11px] text-slate-500">
              共 {readinessSummary.total} 规格 · {readinessSummary.active} 已上架 · {readinessSummary.zero_stock} 零库存
              {readinessSummary.supplier_unbound > 0 ? ` · ${readinessSummary.supplier_unbound} 未绑供应商` : ""}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 group-open:hidden">展开诊断详情 ▸</span>
          <span className="hidden text-[10px] text-slate-500 group-open:inline">收起 ▾</span>
        </summary>
        <div className="mt-2.5 space-y-2 border-t border-slate-200/70 pt-2 text-[11px]">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
            <span>{readinessSummary.total} 个规格</span>
            <span>{readinessSummary.active} 已上架</span>
            <span>{readinessSummary.draft} 草稿</span>
            <span>{readinessSummary.zero_stock} 零库存</span>
            <span>{readinessSummary.local_inventory_available} 具本地库存</span>
            {operationalSummary ? (
              <>
                <span className="text-emerald-700">{operationalSummary.ready} 可销售</span>
                {operationalSummary.attention > 0 ? <span className="text-amber-700">{operationalSummary.attention} 需注意</span> : null}
                {operationalSummary.blocked > 0 ? <span className="text-red-700">{operationalSummary.blocked} 暂不可售</span> : null}
                <span>{operationalSummary.supplier_bound} 已绑定供货商</span>
              </>
            ) : null}
          </div>
          {diagnostics && !diagnostics.schema_ready ? (
            <div className="text-red-700">• 商品规格数据库结构未就绪，写入已安全拦截，请先完成数据库迁移。</div>
          ) : null}
          {diagnostics?.legacy_db_sku_missing ? (
            <div className="text-amber-800">• 旧版商品规格尚未完整写入数据库：{diagnostics.legacy_missing_codes.join("、")}</div>
          ) : null}
          {diagnostics && diagnostics.supplier_unbound_count > 0 ? (
            <div className="text-amber-800">• {diagnostics.supplier_unbound_count} 个「自动发货-供应商」规格尚未绑定供应商。</div>
          ) : null}
          {diagnostics && diagnostics.supplier_problem_count > 0 ? (
            <div className="text-amber-800">• {diagnostics.supplier_problem_count} 个规格的供应商库存同步异常或已过期，系统暂保留上次有效库存。</div>
          ) : null}
          {readinessSummary.no_verified_source > 0 ? (
            <div className="text-amber-800">• {readinessSummary.no_verified_source} 个自动发货规格当前无可验证履约来源（请绑定供应商或绑定后台数字库存）。</div>
          ) : null}
        </div>
      </details>
    ) : null}

    {activationBlocked.length ? (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs leading-5 text-red-800">
        <div className="font-semibold">商品规格激活已阻止</div>
        {activationBlocked.map((item) => (
          <div key={item.code} className="text-[11px]">
            <span className="font-mono font-medium">{item.code}</span>：库存 {item.stock}；供应商绑定 {item.supplierBound ? "完整" : "未完整"}；本地可用 {item.localAvailable}；{formatSkuActivationReasons(item.reasons)}
          </div>
        ))}
      </div>
    ) : null}
    {selectedSkuIds.size > 0 ? (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-950">
        <span className="font-semibold">已选择 {selectedSkuIds.size} 个商品规格</span>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy || bulkBusy} onClick={() => void openBulkPreview("set_draft")}>设为 草稿</Button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy || bulkBusy} onClick={() => void openBulkPreview("set_sold_out")}>设为 售罄</Button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy || bulkBusy} onClick={() => void openBulkPreview("activate")}>预检 上架</Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={busy || bulkBusy} onClick={() => setSelectedSkuIds(new Set())}>清除选择</Button>
      </div>
    ) : null}

    {loading ? <div className="flex items-center gap-2 py-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />正在读取商品规格</div> : <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[940px] table-fixed text-left text-xs">
        <thead className="sticky top-0 bg-slate-50 text-slate-600">
          <tr>
            <th className="w-10 px-2 py-2">
              <Checkbox aria-label="选择当前列表全部商品规格" checked={allVisibleSelected} disabled={visibleSkuIds.length === 0 || busy || bulkBusy} onCheckedChange={(checked) => setSelectedSkuIds(checked === true ? new Set(visibleSkuIds) : new Set())} />
            </th>
            {["名称", "编码", "价格", "库存", "交付方式", "状态", "成本 / 绑定供货商"].map((label) => (
              <th
                key={label}
                className={cn(
                  "px-2 py-2 text-center font-medium",
                  label === "价格" || label === "库存" ? "w-[100px]" : "",
                  label === "交付方式" ? "w-[145px]" : "",
                  label === "状态" ? "w-[88px]" : "",
                  label === "成本 / 绑定供货商" ? "w-[215px]" : ""
                )}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const effectiveMode: ExtendedDeliveryMode = row.draft.delivery_mode || resolveExtendedDeliveryMode(row.draft.delivery_type, row.sku?.metadata ?? product?.metadata ?? null);
            const isSupplierAutoMode = effectiveMode === "automatic";
            const isDigitalInventoryMode = effectiveMode === "automatic_digital_inventory";
            const supplierInfo = getSupplierBindingDisplay(row.sku?.metadata ?? null);

            return (
              <tr key={row.key} className="border-t border-slate-100 align-top hover:bg-slate-50/50">
                <td className="p-2">
                  <Checkbox aria-label={`选择商品规格 ${row.draft.sku_code || row.draft.sku_title || "未保存"}`} checked={row.sku ? selectedSkuIds.has(row.sku.id) : false} disabled={!row.sku || busy || bulkBusy} onCheckedChange={(checked) => { if (row.sku) toggleSkuSelection(row.sku.id, checked === true); }} />
                </td>
                {(["sku_title", "sku_code", "price"] as const).map((key) => (
                  <td key={key} className="p-2">
                    <Input
                      aria-label={key === "sku_title" ? "商品规格名称" : key === "sku_code" ? "商品规格编码" : "售价"}
                      aria-invalid={Boolean(errors[row.key]?.[key])}
                      className="h-8 px-2 text-xs"
                      type={key === "price" ? "number" : "text"}
                      min="0"
                      step={key === "price" ? "0.01" : undefined}
                      value={row.draft[key]}
                      placeholder={key === "sku_title" ? "商品规格名称" : key === "sku_code" ? "商品规格编码" : "0.00"}
                      disabled={busy}
                      onChange={(e) => change(row, key, e.target.value)}
                    />
                    {errors[row.key]?.[key] ? <p className="mt-1 text-red-600">{errors[row.key][key]}</p> : null}
                  </td>
                ))}
                {/* 库存列：自动发货-数字库存模式下支持弹出「数字库存」绑定 */}
                <td className="p-2">
                  <Input
                    aria-label="库存"
                    aria-invalid={Boolean(errors[row.key]?.stock)}
                    className="h-8 px-2 text-xs tabular-nums"
                    type="number"
                    min="0"
                    step="1"
                    value={row.draft.stock}
                    placeholder="0"
                    disabled={busy}
                    onChange={(e) => change(row, "stock", e.target.value)}
                  />
                  {errors[row.key]?.stock ? <p className="mt-1 text-red-600">{errors[row.key].stock}</p> : null}
                  {isDigitalInventoryMode ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setInventoryPickerRowKey(row.key)}
                      title={row.draft.digital_inventory_product_name ? `已绑定：${row.draft.digital_inventory_product_name}（点击切换）` : "点击从后台数字库存选择绑定"}
                      className={cn(
                        "mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-medium transition-colors",
                        row.draft.digital_inventory_product_id
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "border-orange-200 bg-orange-50/70 text-orange-700 hover:bg-orange-100"
                      )}
                    >
                      <Database className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {row.draft.digital_inventory_product_id ? "已绑库存" : "绑定库存"}
                      </span>
                    </button>
                  ) : null}
                </td>
                {/* 交付方式 */}
                <td className="p-2">
                  <select
                    aria-label="商品规格交付方式"
                    className="h-8 w-full rounded-md border bg-white px-2 text-xs"
                    value={effectiveMode}
                    disabled={busy}
                    onChange={(e) => change(row, "delivery_mode", e.target.value)}
                  >
                    {EXTENDED_DELIVERY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </td>
                {/* 状态 */}
                <td className="p-2">
                  <select
                    aria-label="商品规格状态"
                    className="h-8 w-full rounded-md border bg-white px-2 text-xs"
                    value={row.draft.status}
                    disabled={busy}
                    onChange={(e) => change(row, "status", e.target.value)}
                  >
                    <option value="active">启用</option>
                    <option value="inactive">停用</option>
                    <option value="sold_out">售罄</option>
                    <option value="draft">草稿</option>
                  </select>
                </td>
                {/* 成本 / 绑定供货商 列：按交付方式自动切换！ */}
                <td className="p-2">
                  {isSupplierAutoMode ? (
                    row.sku && product ? (
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "h-auto min-h-[32px] w-full justify-start whitespace-normal px-2 py-1.5 text-left text-xs transition-colors",
                          supplierInfo.bound
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        )}
                        disabled={busy}
                        onClick={() => onSupplierBinding(product, row.sku!)}
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 font-medium leading-tight">
                            {supplierInfo.bound ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            ) : (
                              <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            )}
                            <span className="truncate">{supplierInfo.label}</span>
                          </span>
                          {supplierInfo.sublabel ? (
                            <span className="truncate pl-4 text-[10px] font-normal text-emerald-700/80">
                              {supplierInfo.sublabel}
                            </span>
                          ) : null}
                        </div>
                      </Button>
                    ) : product && !isSkuDraftEmpty(row.draft) ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 w-full px-2 text-xs text-primary hover:bg-orange-50"
                        disabled={busy}
                        onClick={() => void createAndBindRow(row)}
                      >
                        创建并绑定
                      </Button>
                    ) : (
                      <span className="inline-flex h-8 items-center text-slate-400">
                        {product ? "填写规格后可绑定（保存后绑定）" : "保存后绑定"}
                      </span>
                    )
                  ) : (
                    /* 非「自动发货-供应商」模式（含 自动发货-数字库存 / 人工发货 / 物流 / 预约）：直接显示成本输入框 */
                    <div className="flex items-center gap-1.5">
                      <span className="shrink-0 text-[11px] font-medium text-slate-500">成本 ¥</span>
                      <Input
                        aria-label="SKU成本价"
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-8 min-w-0 flex-1 px-2 text-xs tabular-nums"
                        placeholder="填成本价"
                        value={row.draft.cost_price}
                        disabled={busy}
                        onChange={(e) => change(row, "cost_price", e.target.value)}
                      />
                    </div>
                  )}

                  {row.sku ? <SkuOperationalDiagnostics diagnostic={operationalBySku.get(row.sku.id)} /> : null}

                  {!isSkuDraftEmpty(row.draft) ? (
                    <details className="mt-1.5" open={errors[row.key]?.original_price || errors[row.key]?.sort_order ? true : undefined}>
                      <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-800">更多设置</summary>
                      <div className="mt-2 space-y-2 rounded-lg border border-slate-100 bg-slate-50/70 p-2">
                        {isSupplierAutoMode ? (
                          <div className="space-y-0.5">
                            <label className="text-[10px] font-medium text-slate-500">手动成本价（¥，可选覆盖）</label>
                            <Input
                              aria-label="手动成本价"
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={busy}
                              className="h-7 bg-white px-2 text-xs tabular-nums"
                              placeholder="留空则采用供应商价"
                              value={row.draft.cost_price}
                              onChange={(e) => change(row, "cost_price", e.target.value)}
                            />
                          </div>
                        ) : null}
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-medium text-slate-500">划线原价（仅前台展示）</label>
                          <Input aria-label="原价" aria-invalid={Boolean(errors[row.key]?.original_price)} disabled={busy} className="h-7 bg-white px-2 text-xs" placeholder="原价（可选）" value={row.draft.original_price} onChange={(e) => change(row, "original_price", e.target.value)} />
                          {errors[row.key]?.original_price ? <p className="text-red-600">{errors[row.key].original_price}</p> : null}
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-medium text-slate-500">规格图片 URL</label>
                          <Input aria-label="商品规格图片" disabled={busy} className="h-7 bg-white px-2 text-xs" placeholder="/assets/... 或 https://..." value={row.draft.image_url} onChange={(e) => change(row, "image_url", e.target.value)} />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-medium text-slate-500">排序权重（数字越小越靠前）</label>
                          <Input aria-label="商品规格排序" aria-invalid={Boolean(errors[row.key]?.sort_order)} disabled={busy} className="h-7 bg-white px-2 text-xs tabular-nums" type="number" min="0" placeholder="如 10" value={row.draft.sort_order} onChange={(e) => change(row, "sort_order", e.target.value)} />
                          {errors[row.key]?.sort_order ? <p className="text-red-600">{errors[row.key].sort_order}</p> : null}
                        </div>
                        {product && row.sku ? <Button type="button" size="sm" variant="ghost" disabled={busy} className="h-7 px-2 text-xs text-red-600 hover:bg-red-50" onClick={() => setDeleting(row)}>删除该规格</Button> : null}
                      </div>
                    </details>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>}

    <AdminDigitalInventoryPickerModal
      open={Boolean(inventoryPickerRowKey)}
      currentProductId={product?.id}
      currentInventoryProductId={activePickerRow?.draft.digital_inventory_product_id}
      onClose={() => setInventoryPickerRowKey(null)}
      onSelect={(invRow) => {
        if (inventoryPickerRowKey) void handleBindDigitalInventory(inventoryPickerRowKey, invRow);
      }}
    />

    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除商品规格</AlertDialogTitle><AlertDialogDescription>确认删除“{deleting?.draft.sku_title}”？若已有订单引用，服务端会阻止删除。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>取消</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void removeRow(); }}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={Boolean(activationConfirmation)} onOpenChange={(open) => { if (!open && activationConfirmationResolver.current) resolveActivationConfirmation(false); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认激活商品规格</AlertDialogTitle><AlertDialogDescription>激活后该商品规格将可能在前台进入可售范围。请再次确认库存和履约来源。</AlertDialogDescription></AlertDialogHeader><div className="space-y-1 text-sm">{activationConfirmation?.map((item) => <div key={item.code}><span className="font-mono">{item.code}</span> · 库存 {item.stock} · 来源 {item.source === "supplier" ? "精确供应商绑定" : "商品规格级本地库存"} · 供应商绑定 {item.supplierBound ? "完整" : "未完整"} · 本地可用 {item.localAvailable} · 验证状态 {item.inventoryState === "requires_verification" ? "待验证" : "通过现有证据"}</div>)}</div><AlertDialogFooter><AlertDialogCancel disabled={busy} onClick={() => resolveActivationConfirmation(false)}>取消</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); resolveActivationConfirmation(true); }}>确认激活并保存</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={Boolean(bulkPreview)} onOpenChange={(open) => { if (!open && !bulkBusy) setBulkPreview(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{bulkPreview ? bulkActionLabel[bulkPreview.action] : "批量商品规格操作"}</AlertDialogTitle><AlertDialogDescription>{bulkPreview?.action === "activate" ? "激活会使这些商品规格进入可售状态；执行前服务端仍会重新读取并校验。" : "执行前服务端会重新读取全部商品规格，不会沿用预检作为授权。"}</AlertDialogDescription></AlertDialogHeader>
      {bulkPreview ? <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-3"><span>已选：{bulkPreview.selected_count}</span><span>将修改：{bulkPreview.will_change_count}</span><span>无需修改：{bulkPreview.no_change_count}</span><span>被阻止：{bulkPreview.blocked_count}</span></div>
        {bulkPreview.action === "activate" ? <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-3">{bulkPreview.items.map((item) => <div key={item.sku_id} className={item.disposition === "blocked" ? "text-red-800" : "text-emerald-800"}><span className="font-mono">{item.sku_code ?? item.sku_id}</span>：{item.disposition === "blocked" ? `不可执行 · ${formatSkuActivationReasons(item.reasons)}` : item.disposition === "no_change" ? "无需更改 · 已上架" : "符合要求"}</div>)}</div> : null}
        {!bulkPreview.execution_supported ? <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">当前操作仅支持预检，事务型执行尚未开放。</div> : null}
        {bulkPreview.execution_supported && bulkPreview.will_change_count === 0 ? <div role="status" className="rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">所选商品规格已是目标状态，无需修改。</div> : null}
      </div> : null}
      <AlertDialogFooter><AlertDialogCancel disabled={bulkBusy}>关闭</AlertDialogCancel>{bulkPreview?.execution_supported && bulkPreview.can_execute && bulkPreview.blocked_count === 0 && bulkPreview.will_change_count > 0 ? <AlertDialogAction disabled={bulkBusy} onClick={(event) => { event.preventDefault(); void executeBulkStatus(); }}>{bulkBusy ? "执行中…" : bulkPreview.action === "activate" ? `确认激活 ${bulkPreview.will_change_count} 个商品规格` : `确认${bulkActionLabel[bulkPreview.action]}`}</AlertDialogAction> : null}</AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </div>;
});
export default AdminProductSkuManager;
