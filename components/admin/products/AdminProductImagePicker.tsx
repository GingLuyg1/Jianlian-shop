"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Asset = { id: string; public_url: string | null; original_name: string | null; mime_type: string | null; status: string };
const pageSize = 24;

export default function AdminProductImagePicker({ onClose, onSelect }: { onClose: () => void; onSelect: (url: string) => void }) {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    fetch(`/api/admin/media?mimeType=image%2F&page=${page}&pageSize=${pageSize}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("媒体资源读取失败");
        const data = await response.json() as { assets: Asset[]; total: number };
        if (controller.signal.aborted) return;
        setAssets(data.assets.filter(asset => asset.public_url && ["active", "unused"].includes(asset.status)));
        setTotal(data.total);
        setState("ready");
      })
      .catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, [page, retry]);

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-3xl flex-col overflow-hidden rounded-2xl">
      <DialogHeader>
        <DialogTitle>选择已上传的图片</DialogTitle>
        <DialogDescription>点选图片即可用作商品主图。</DialogDescription>
      </DialogHeader>
      <div className="min-h-36 overflow-y-auto" aria-busy={state === "loading"}>
        {state === "loading" ? <p className="p-4 text-sm text-slate-500">正在读取媒体资源…</p> : state === "error" ?
          <div className="space-y-2 p-4"><p className="text-sm text-red-700">媒体资源读取失败。</p><Button type="button" variant="outline" onClick={() => setRetry(current => current + 1)}>重试</Button></div> :
          assets.length === 0 ? <p className="p-4 text-sm text-slate-500">此页没有可用图片。</p> :
          <div className="grid grid-cols-2 gap-3 p-1 sm:grid-cols-4">
            {assets.map(asset => asset.public_url && <button key={asset.id} type="button" title={asset.original_name ?? undefined} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white text-left hover:border-orange-400 focus-visible:ring-2 focus-visible:ring-primary" onClick={() => onSelect(asset.public_url!)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.public_url} alt="" loading="lazy" className="aspect-square w-full bg-slate-50 object-contain" />
              <span className="block truncate p-2 text-xs font-medium text-slate-700">{asset.original_name || "已上传图片"}</span>
            </button>)}
          </div>}
      </div>
      <div className="flex items-center justify-end gap-2 border-t pt-3">
        <Button type="button" size="sm" variant="outline" disabled={page <= 1 || state === "loading"} onClick={() => setPage(current => current - 1)}>上一页</Button>
        <span className="text-xs tabular-nums text-slate-600">第 {page} 页</span>
        <Button type="button" size="sm" variant="outline" disabled={page * pageSize >= total || state === "loading"} onClick={() => setPage(current => current + 1)}>下一页</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
