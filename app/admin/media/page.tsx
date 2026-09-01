"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Copy, ImageIcon, RefreshCcw, Search, Upload } from "lucide-react";
import { toast } from "sonner";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type MediaAsset = {
  id: string;
  owner_type: string;
  owner_id: string | null;
  bucket: string;
  storage_path: string;
  public_url: string | null;
  original_name: string | null;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  status: string;
  uploaded_by: string | null;
  created_at: string;
};

const OWNER_OPTIONS = [
  ["all", "全部用途"],
  ["product", "商品"],
  ["sku", "SKU"],
  ["category", "分类"],
  ["site_setting", "站点资源"],
  ["profile", "头像"],
  ["announcement", "公告"],
  ["unassigned", "未绑定"],
];

const STATUS_OPTIONS = [
  ["all", "全部状态"],
  ["active", "使用中"],
  ["unused", "未引用"],
  ["archived", "已归档"],
  ["deleted", "已删除"],
  ["failed", "失败"],
];

const PURPOSE_OPTIONS = [
  ["product", "商品主图"],
  ["sku", "SKU 图片"],
  ["category", "分类图"],
  ["logo", "Logo"],
  ["favicon", "Favicon"],
  ["announcement", "公告图"],
  ["avatar", "头像"],
  ["misc", "其他"],
];

function formatBytes(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}

function statusLabel(value: string) {
  return STATUS_OPTIONS.find(([key]) => key === value)?.[1] ?? value;
}

function statusClassName(value: string) {
  if (value === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "unused") return "border-amber-200 bg-amber-50 text-amber-700";
  if (value === "archived") return "border-slate-200 bg-slate-100 text-slate-600";
  if (value === "deleted" || value === "failed") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-white text-slate-600";
}

export default function AdminMediaPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownerType, setOwnerType] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [purpose, setPurpose] = useState("product");
  const [files, setFiles] = useState<FileList | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const selectedFiles = files ? Array.from(files) : [];

  const filteredAssets = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return assets;
    return assets.filter((asset) =>
      [asset.original_name, asset.public_url, asset.storage_path, asset.bucket, asset.mime_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    );
  }, [assets, query]);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ pageSize: "80", ownerType, status });
    try {
      const response = await fetch(`/api/admin/media?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "媒体资源读取失败");
      setAssets(Array.isArray(payload.assets) ? payload.assets : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "媒体资源读取失败";
      setError(message);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [ownerType, status]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  async function uploadFiles() {
    if (!files?.length) {
      toast.error("请选择图片文件");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("purpose", purpose);
      form.set("ownerType", "unassigned");
      Array.from(files).forEach((file) => form.append("files", file));
      const response = await fetch("/api/admin/media", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "上传失败");
      toast.success("图片已上传");
      setFiles(null);
      setFileInputKey((value) => value + 1);
      await loadAssets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function copyUrl(asset: MediaAsset) {
    const value = asset.public_url || `${asset.bucket}/${asset.storage_path}`;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("已复制资源地址");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  async function archiveAsset(asset: MediaAsset) {
    if (!window.confirm("确认归档这个未引用资源？归档前会再次检查业务引用。")) return;
    try {
      const response = await fetch("/api/admin/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.id, action: "archive" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "归档失败");
      toast.success("资源已归档");
      await loadAssets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "归档失败");
    }
  }

  return (
    <AdminPageShell
      title="媒体资源"
      description="集中上传、筛选和维护商品、SKU、分类及站点使用的图片资源。"
      actions={(
        <Button variant="outline" onClick={loadAssets} disabled={loading}>
          <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> 刷新
        </Button>
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">

      <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <div className="text-sm font-semibold text-slate-950">上传图片</div>
          <p className="mt-1 text-xs text-slate-500">选择资源用途后上传；新资源将以未绑定状态进入资源库。</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[160px_1fr_auto]">
          <select value={purpose} onChange={(event) => setPurpose(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            {PURPOSE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input key={fileInputKey} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/x-icon" multiple onChange={(event) => setFiles(event.target.files)} className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm" />
          <Button disabled={uploading || !selectedFiles.length} onClick={uploadFiles}>
            <Upload className={`mr-2 h-4 w-4 ${uploading ? "animate-pulse" : ""}`} /> {uploading ? "上传中..." : "上传图片"}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>支持 JPEG、PNG、WebP、GIF、ICO；单文件最大 5MB，单次最多 10 个文件。</span>
          <span className="max-w-full truncate text-slate-700">
            {selectedFiles.length
              ? `已选择 ${selectedFiles.length} 个文件：${selectedFiles.map((file) => file.name).join("、")}`
              : "尚未选择文件"}
          </span>
        </div>
      </div>

      <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="在当前结果搜索文件名、Bucket 或 URL" className="w-full bg-transparent outline-none" />
          </label>
          <select value={ownerType} onChange={(event) => setOwnerType(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            {OWNER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
          <span>Owner 与状态由后端筛选。</span>
          <span>关键词只搜索当前已加载的 {assets.length} 条结果。</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {error ? (
          <AdminErrorState title="媒体资源暂不可用" description={error} onRetry={loadAssets} />
        ) : loading ? (
          <AdminTableSkeleton rows={7} />
        ) : filteredAssets.length ? (
          <div className="h-full overflow-auto">
            <table className="min-w-[1120px] w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">缩略图</th>
                  <th className="px-4 py-3">文件</th>
                  <th className="px-4 py-3">用途</th>
                  <th className="px-4 py-3">Bucket / 路径</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">大小</th>
                  <th className="px-4 py-3">尺寸</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">上传时间</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      {asset.public_url ? <img src={asset.public_url} alt="" className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200" /> : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100"><ImageIcon className="h-5 w-5 text-slate-400" /></div>}
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <div className="truncate font-medium text-slate-900">{asset.original_name || "—"}</div>
                      <div className="truncate text-xs text-slate-500">{asset.public_url || "私有资源"}</div>
                    </td>
                    <td className="px-4 py-3">{asset.owner_type}</td>
                    <td className="max-w-[260px] px-4 py-3">
                      <div className="font-medium text-slate-700">{asset.bucket}</div>
                      <div className="truncate text-xs text-slate-500">{asset.storage_path}</div>
                    </td>
                    <td className="px-4 py-3">{asset.mime_type}</td>
                    <td className="px-4 py-3">{formatBytes(Number(asset.file_size))}</td>
                    <td className="px-4 py-3">{asset.width && asset.height ? `${asset.width}×${asset.height}` : "—"}</td>
                    <td className="px-4 py-3"><Badge variant="outline" className={statusClassName(asset.status)}>{statusLabel(asset.status)}</Badge></td>
                    <td className="px-4 py-3">{formatDate(asset.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="icon" onClick={() => copyUrl(asset)} title="复制地址"><Copy className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" onClick={() => archiveAsset(asset)} disabled={asset.status === "active"} title={asset.status === "active" ? "使用中资源不可归档" : "归档未引用资源"}><Archive className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <AdminEmptyState
            icon={<ImageIcon className="h-5 w-5" />}
            title={query.trim() ? "当前关键词没有匹配资源" : "暂无媒体资源"}
            description={query.trim() ? "请调整当前结果关键词；Owner 与状态筛选仍由后端应用。" : "上传商品图、SKU 图、分类图或站点资源后，会显示在这里。"}
          />
        )}
      </div>
      </div>
    </AdminPageShell>
  );
}
