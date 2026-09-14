"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deriveSkuProductSummary, ensureTrailingEmptySkuRow, isSkuDraftEmpty, validateSkuDraft } from "@/lib/products/sku-editor.mjs";
import { createProductSku, deleteProductSku, listProductSkus, updateProductSku, ProductSkuWriteError, type AdminProduct, type AdminProductSku, type DeliveryType, type ProductSkuPayload, type ProductStatus } from "@/lib/supabase/admin-catalog";

type Draft = { sku_title: string; sku_code: string; price: string; stock: string; original_price: string; image_url: string; sort_order: string; status: ProductStatus; delivery_type: DeliveryType | ""; touched?: boolean };
type EditorRow = { key: string; sku?: AdminProductSku; draft: Draft };
export type ProductSkuManagerHandle = { validate: () => boolean; saveAll: (product: AdminProduct) => Promise<void> };
type Props = { product: AdminProduct | null; refreshKey?: number; defaults: { price: string; original_price: string; stock: string; delivery_type: DeliveryType; status: ProductStatus }; onSummary: (summary: { price: number | null; stock: number }) => void; onSupplierBinding: (product: AdminProduct, sku: AdminProductSku) => void };
const emptyDraft = (): Draft => ({ sku_title: "", sku_code: "", price: "", stock: "", original_price: "", image_url: "", sort_order: "0", status: "active", delivery_type: "" });
const emptyRow = (): EditorRow => ({ key: crypto.randomUUID(), draft: emptyDraft() });
const toDraft = (sku: AdminProductSku): Draft => ({ sku_title: sku.sku_title ?? "", sku_code: sku.sku_code ?? "", price: String(sku.price), stock: String(sku.stock), original_price: sku.original_price == null ? "" : String(sku.original_price), image_url: sku.image_url ?? "", sort_order: String(sku.sort_order), status: sku.status, delivery_type: sku.delivery_type ?? "" });
const payload = (draft: Draft): ProductSkuPayload => ({ sku_title: draft.sku_title.trim(), sku_code: draft.sku_code.trim(), price: Number(draft.price), stock: Number(draft.stock), original_price: draft.original_price === "" ? null : Number(draft.original_price), image_url: draft.image_url.trim() || null, sort_order: Number(draft.sort_order), status: draft.status, delivery_type: draft.delivery_type || null });

const AdminProductSkuManager = forwardRef<ProductSkuManagerHandle, Props>(function AdminProductSkuManager({ product, refreshKey = 0, defaults, onSummary, onSupplierBinding }, ref) {
  const [rows, setRows] = useState<EditorRow[]>([]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  const [deleting, setDeleting] = useState<EditorRow | null>(null);
  const productId = product?.id;
  const previousProductId = useRef(productId);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const skus = productId ? await listProductSkus(productId) : [];
      setRows((current) => {
        if (!skus.length && !current.some((row) => row.sku)) {
          return current.length ? current : [{ key: "legacy", draft: { ...emptyDraft(), sku_title: "默认规格", sku_code: "DEFAULT", ...defaultsRef.current } }, emptyRow()];
        }
        const persisted = skus.map((sku) => {
          const previous = current.find((row) => row.sku?.id === sku.id);
          if (!previous || !previous.draft.touched) return { key: sku.id, sku, draft: toDraft(sku) };
          return { ...previous, sku, draft: { ...previous.draft, ...(previous.draft.stock === String(previous.sku?.stock) ? { stock: String(sku.stock) } : {}) } };
        });
        return [...persisted, ...current.filter((row) => !row.sku && row.key !== "legacy" && !isSkuDraftEmpty(row.draft)), emptyRow()];
      });
    } catch (error) { setLoadError(error instanceof Error ? error.message : "SKU 读取失败"); }
    finally { setLoading(false); }
  }, [productId]);
  useEffect(() => {
    if (previousProductId.current && productId && previousProductId.current !== productId) {
      setRows([]); rowsRef.current = [];
    }
    previousProductId.current = productId;
    void load();
  }, [load, productId]);
  useEffect(() => { if (refreshKey) void load(); }, [load, refreshKey]);
  useEffect(() => {
    // A fresher product read may arrive after the legacy row was first seeded.
    // Never replace user edits with that background read.
    setRows((current) => current.map((row) => row.key === "legacy" && !row.sku && !row.draft.touched
      ? { ...row, draft: { ...row.draft, ...defaultsRef.current } } : row));
  }, [defaults.price, defaults.original_price, defaults.stock, defaults.delivery_type, defaults.status]);

  function validate() {
    if (loading || loadError || flight.current) { toast.warning("请等待 SKU 读取完成后再保存"); return false; }
    const next = Object.fromEntries(rowsRef.current.filter((row) => row.sku || !isSkuDraftEmpty(row.draft)).map((row) => [row.key, validateSkuDraft(row.draft)]));
    setErrors(next);
    if (Object.values(next).some((fields) => Object.keys(fields).length)) { toast.warning("请补全标红的 SKU 字段"); return false; }
    const codes = rowsRef.current.filter((row) => row.sku || !isSkuDraftEmpty(row.draft)).map((row) => row.draft.sku_code.trim().toLowerCase());
    if (new Set(codes).size !== codes.length) { toast.warning("SKU Code 不能重复"); return false; }
    return true;
  }
  async function saveAll(savedProduct: AdminProduct) {
    if (!validate()) throw new Error("SKU 尚未填写完整");
    flight.current = true; setBusy(true);
    try {
      for (const row of rowsRef.current.filter((item) => item.sku || !isSkuDraftEmpty(item.draft))) {
        if (row.sku && !row.draft.touched) continue;
        let sku: AdminProductSku;
        try {
          sku = row.sku ? await updateProductSku(savedProduct.id, row.sku.id, payload(row.draft)) : await createProductSku(savedProduct.id, payload(row.draft));
        } catch (error) {
          if (error instanceof ProductSkuWriteError) {
            const savedSku = error.savedSku;
            const next = rowsRef.current.map((item) => item.key === row.key ? { key: savedSku.id, sku: savedSku, draft: { ...toDraft(savedSku), touched: true } } : item);
            rowsRef.current = next; setRows(next);
          }
          throw error;
        }
        const next = rowsRef.current.map((item) => item.key === row.key ? { key: sku.id, sku, draft: toDraft(sku) } : item);
        rowsRef.current = next; setRows(next);
      }
      onSummary(deriveSkuProductSummary(await listProductSkus(savedProduct.id)));
    } finally { flight.current = false; setBusy(false); }
  }
  useImperativeHandle(ref, () => ({ validate, saveAll }));

  function change(row: EditorRow, key: keyof Draft, value: string) {
    const next = ensureTrailingEmptySkuRow(rowsRef.current.map((item) => item.key === row.key ? { ...item, draft: { ...item.draft, [key]: value, touched: true } } : item), emptyRow);
    rowsRef.current = next; setRows(next);
    onSummary(deriveSkuProductSummary(next.filter((item) => !isSkuDraftEmpty(item.draft)).map((item) => item.draft)));
  }
  async function removeRow() {
    if (!deleting || !product || flight.current) return;
    flight.current = true; setBusy(true);
    try {
      if (deleting.sku) await deleteProductSku(product.id, deleting.sku.id);
      const next = ensureTrailingEmptySkuRow(rowsRef.current.filter((row) => row.key !== deleting.key), emptyRow);
      rowsRef.current = next; setRows(next);
      onSummary(deriveSkuProductSummary(next.filter((row) => !isSkuDraftEmpty(row.draft)).map((row) => row.draft)));
      toast.success("SKU 已删除"); setDeleting(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "SKU 删除失败"); }
    finally { flight.current = false; setBusy(false); }
  }

  return <div className="min-w-0 space-y-2">
    <div className="flex justify-end"><Button type="button" size="sm" variant="ghost" disabled={loading || busy} onClick={() => void load()}><RefreshCw className="mr-1 h-3.5 w-3.5" />刷新</Button></div>
    {loadError ? <p role="alert" className="text-sm text-red-600">{loadError}</p> : null}
    {loading ? <div className="flex items-center gap-2 py-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />正在读取 SKU</div> : <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[850px] table-fixed text-left text-xs">
        <thead className="sticky top-0 bg-slate-50 text-slate-600"><tr>{["名称", "Code", "价格", "库存", "交付方式", "状态", "绑定供货商"].map((label) => <th key={label} className="px-2 py-2 font-medium last:w-[190px]">{label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key} className="border-t border-slate-100 align-top hover:bg-slate-50/50">
          {(["sku_title", "sku_code", "price", "stock"] as const).map((key) => <td key={key} className="p-2"><Input aria-label={key === "sku_title" ? "SKU 名称" : key === "sku_code" ? "SKU Code" : key === "price" ? "售价" : "库存"} aria-invalid={Boolean(errors[row.key]?.[key])} className="h-8 px-2 text-xs" type={key === "price" || key === "stock" ? "number" : "text"} min="0" step={key === "price" ? "0.01" : "1"} value={row.draft[key]} placeholder={key === "sku_title" ? "SKU 名称" : key === "sku_code" ? "SKU Code" : ""} disabled={busy} onChange={(e) => change(row, key, e.target.value)} />{errors[row.key]?.[key] ? <p className="mt-1 text-red-600">{errors[row.key][key]}</p> : null}</td>)}
          <td className="p-2"><select aria-label="SKU 交付方式" className="h-8 w-full rounded-md border bg-white px-2 text-xs" value={row.draft.delivery_type} disabled={busy} onChange={(e) => change(row, "delivery_type", e.target.value)}><option value="">继承商品</option><option value="manual">人工处理</option><option value="automatic">自动发货</option><option value="shipping">物流发货</option></select></td>
          <td className="p-2"><select aria-label="SKU 状态" className="h-8 w-full rounded-md border bg-white px-2 text-xs" value={row.draft.status} disabled={busy} onChange={(e) => change(row, "status", e.target.value)}><option value="active">启用</option><option value="inactive">停用</option><option value="sold_out">售罄</option><option value="draft">草稿</option></select></td>
          <td className="p-2">{row.sku && product ? <Button type="button" variant="outline" className="h-8 w-full justify-start px-2 text-xs" disabled={busy} onClick={() => onSupplierBinding(product, row.sku!)}>{row.sku.metadata?.supplier === "daju" ? `大橘 #${String(row.sku.metadata.supplier_product_id)} · ${String(row.sku.metadata.supplier_sku ?? "无规格")}` : "未绑定 · 绑定"}</Button> : <span className="inline-flex h-8 items-center text-slate-400">保存后绑定</span>}
            {!isSkuDraftEmpty(row.draft) ? <details className="mt-1" open={errors[row.key]?.original_price || errors[row.key]?.sort_order ? true : undefined}>
              <summary className="cursor-pointer text-slate-500">更多设置</summary>
              <div className="mt-2 space-y-2">
                <Input aria-label="原价" aria-invalid={Boolean(errors[row.key]?.original_price)} disabled={busy} className="h-8 px-2 text-xs" placeholder="原价（可选）" value={row.draft.original_price} onChange={(e) => change(row, "original_price", e.target.value)} />
                {errors[row.key]?.original_price ? <p className="text-red-600">{errors[row.key].original_price}</p> : null}
                <Input aria-label="SKU 图片" disabled={busy} className="h-8 px-2 text-xs" placeholder="SKU 图片 URL（可选）" value={row.draft.image_url} onChange={(e) => change(row, "image_url", e.target.value)} />
                <Input aria-label="SKU 排序" aria-invalid={Boolean(errors[row.key]?.sort_order)} disabled={busy} className="h-8 px-2 text-xs" type="number" min="0" value={row.draft.sort_order} onChange={(e) => change(row, "sort_order", e.target.value)} />
                {errors[row.key]?.sort_order ? <p className="text-red-600">{errors[row.key].sort_order}</p> : null}
                {product && row.sku ? <Button type="button" size="sm" variant="ghost" disabled={busy} className="text-red-600" onClick={() => setDeleting(row)}>删除</Button> : null}
              </div>
            </details> : null}
          </td>
        </tr>)}</tbody>
      </table>
    </div>}
    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除 SKU</AlertDialogTitle><AlertDialogDescription>确认删除“{deleting?.draft.sku_title}”？若已有订单引用，服务端会阻止删除。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>取消</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void removeRow(); }}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
});
export default AdminProductSkuManager;
