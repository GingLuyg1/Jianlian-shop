export default function RecordLoadingPlaceholder({ count, label }: { count?: number; label: string }) {
  const knownRows = typeof count === "number" && count > 0 ? Math.min(10, count) : 0;
  return <div role="status" aria-label={label} data-testid="record-loading-placeholder" data-loading-layout={knownRows ? "rows" : "full"} className="flex min-h-[300px] min-w-0 flex-1 flex-col gap-3">
    {knownRows ? Array.from({ length: knownRows }, (_, index) => <div key={index} data-testid="record-skeleton-row" aria-hidden="true" className="min-h-[164px] shrink-0 animate-pulse rounded-2xl border border-[#eee6dc] bg-[#fbf8f4] p-4 motion-reduce:animate-none"><div className="mb-5 h-3 w-1/3 rounded bg-[#eee7df]" /><div className="space-y-3"><div className="h-2.5 w-3/4 rounded bg-[#f0eae3]" /><div className="h-2.5 w-full rounded bg-[#f0eae3]" /><div className="h-2.5 w-2/3 rounded bg-[#f0eae3]" /></div></div>) : <div aria-hidden="true" className="min-h-[300px] flex-1 animate-pulse rounded-2xl bg-slate-100/70 motion-reduce:animate-none" />}
  </div>;
}
