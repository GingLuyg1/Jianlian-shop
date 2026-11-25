"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

const CHUNK_RELOAD_GUARD_KEY = "jianlian_chunk_reload_ts";

function isChunkLoadFailure(error: Error & { digest?: string }) {
  const name = String(error?.name || "");
  const message = String(error?.message || "");
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|CSS_CHUNK_LOAD_FAILED/i.test(
      message
    )
  );
}

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [retriedInPlace, setRetriedInPlace] = useState(false);

  useEffect(() => {
    const chunkError = isChunkLoadFailure(error);
    console.error("[PageError]", {
      digest: error.digest ?? null,
      name: error?.name ?? null,
      chunkError,
    });

    if (chunkError && typeof window !== "undefined") {
      try {
        const lastReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) || "0");
        if (!Number.isFinite(lastReload) || Date.now() - lastReload > 10_000) {
          window.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(Date.now()));
          window.location.reload();
        }
      } catch {
        // Storage unavailable: avoid unconditional infinite reload loop; let user click reload.
      }
    }
  }, [error]);

  const handleReload = () => {
    if (isChunkLoadFailure(error) || retriedInPlace) {
      if (typeof window !== "undefined") {
        window.location.reload();
        return;
      }
    }
    setRetriedInPlace(true);
    reset();
  };

  return (
    <div role="alert" data-page-error="true" className="flex min-h-[320px] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-red-100 bg-white p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-500" />
        <h2 className="mt-3 text-lg font-semibold text-slate-950">当前模块加载失败</h2>
        <p className="mt-2 text-sm text-slate-500">请重试当前操作。已填写内容会尽可能保留。</p>
        {error.digest ? <p className="mt-2 text-xs text-slate-400">参考编号：{error.digest.slice(0, 12)}</p> : null}
        <div className="mt-5 flex items-center justify-center gap-3">
          <button type="button" onClick={handleReload} className="h-10 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700">重新加载</button>
          <Link href="/" className="inline-flex h-10 items-center rounded-lg border border-orange-200 px-4 text-sm font-medium text-orange-700 hover:bg-orange-50">返回首页</Link>
        </div>
      </div>
    </div>
  );
}
