import { cn } from "@/lib/utils";

type AdminTableSkeletonProps = {
  rows?: number;
  className?: string;
};

export default function AdminTableSkeleton({ rows = 8, className }: AdminTableSkeletonProps) {
  return (
    <div className={cn("min-h-[220px] flex-1 space-y-2 p-4", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}
