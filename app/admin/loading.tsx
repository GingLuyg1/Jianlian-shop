export default function AdminLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 lg:[padding-inline:var(--admin-content-padding-x)] lg:py-4">
      <div className="mb-3 shrink-0">
        <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-3 w-72 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="grid shrink-0 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
          />
        ))}
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="shrink-0 border-b border-slate-100 px-4 py-3">
          <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="min-h-0 flex-1 space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
