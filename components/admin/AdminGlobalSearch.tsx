"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchResult = {
  id: string;
  group: string;
  typeLabel: string;
  businessNo: string;
  title: string;
  subtitle: string | null;
  userLabel: string | null;
  amountLabel: string | null;
  status: string | null;
  createdAt: string | null;
  href: string;
  exact: boolean;
};

type SearchGroup = {
  group: string;
  label: string;
  results: SearchResult[];
  error?: string;
};

type SearchPayload = {
  keyword: string;
  groups: SearchGroup[];
  total: number;
  error?: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export default function AdminGlobalSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [keyword, setKeyword] = useState("");
  const [payload, setPayload] = useState<SearchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const flatResults = useMemo(() => payload?.groups.flatMap((group) => group.results) ?? [], [payload]);

  useEffect(() => {
    const value = keyword.trim();
    setActiveIndex(0);
    if (value.length === 0) {
      setPayload(null);
      setError("");
      setLoading(false);
      return;
    }
    if (value.length < 2) {
      setPayload(null);
      setError("请输入至少 2 个字符");
      setLoading(false);
      setOpen(true);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      setOpen(true);
      try {
        const response = await fetch(`/api/admin/global-search?q=${encodeURIComponent(value)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json().catch(() => null)) as SearchPayload | null;
        if (!response.ok) throw new Error(result?.error ?? "搜索失败");
        setPayload(result);
      } catch (searchError) {
        if ((searchError as { name?: string }).name === "AbortError") return;
        setPayload(null);
        setError(searchError instanceof Error ? searchError.message : "搜索失败");
      } finally {
        setLoading(false);
      }
    }, 260);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [keyword]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function openActiveResult() {
    const result = flatResults[activeIndex];
    if (!result) return;
    setOpen(false);
    router.push(result.href);
  }

  return (
    <div ref={containerRef} className="relative max-w-xl flex-1">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={keyword}
        onChange={(event) => {
          setKeyword(event.target.value);
          setOpen(true);
        }}
        onFocus={() => keyword.trim() && setOpen(true)}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((value) => Math.min(flatResults.length - 1, value + 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((value) => Math.max(0, value - 1));
          }
          if (event.key === "Enter") {
            event.preventDefault();
            openActiveResult();
          }
        }}
        placeholder="搜索订单号、支付单号、用户邮箱、商品名称..."
        className="h-9 pl-9 pr-9 text-sm"
      />
      {loading ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}

      {open && keyword.trim() ? (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-[560px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {error ? (
            <div className="px-4 py-5 text-sm text-red-600">{error}</div>
          ) : loading && !payload ? (
            <div className="px-4 py-5 text-sm text-slate-500">正在搜索...</div>
          ) : payload && payload.total === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              <div className="font-semibold text-slate-900">未找到相关业务记录</div>
              <div className="mt-1">请检查编号、邮箱或商品名称是否正确。</div>
            </div>
          ) : payload ? (
            <div className="max-h-[560px] overflow-y-auto py-2">
              {payload.groups.map((group) => {
                if (!group.results.length && !group.error) return null;
                return (
                  <div key={group.group} className="py-1">
                    <div className="flex items-center justify-between px-4 py-1 text-xs font-semibold text-slate-500">
                      <span>{group.label}</span>
                      {group.error ? <span className="text-red-500">{group.error}</span> : <span>{group.results.length}</span>}
                    </div>
                    <div className="space-y-1 px-2">
                      {group.results.map((result) => {
                        const index = flatResults.findIndex((item) => item.id === result.id && item.group === result.group);
                        return (
                          <Link
                            key={`${result.group}-${result.id}`}
                            href={result.href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "block rounded-lg px-3 py-2 text-sm transition-colors",
                              index === activeIndex ? "bg-slate-100" : "hover:bg-slate-50"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{result.typeLabel}</span>
                                  <span className="truncate font-semibold text-slate-950">{result.title}</span>
                                </div>
                                <div className="mt-1 truncate font-mono text-xs text-slate-500">{result.businessNo}</div>
                                {result.subtitle ? <div className="mt-1 truncate text-xs text-slate-500">{result.subtitle}</div> : null}
                              </div>
                              <div className="shrink-0 text-right text-xs text-slate-500">
                                {result.amountLabel ? <div className="font-semibold text-primary">{result.amountLabel}</div> : null}
                                {result.status ? <div>{result.status}</div> : null}
                                <div>{formatDate(result.createdAt)}</div>
                              </div>
                            </div>
                            {result.userLabel ? <div className="mt-1 truncate text-xs text-slate-400">用户：{result.userLabel}</div> : null}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
