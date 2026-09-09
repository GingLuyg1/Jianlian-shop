import { LockKeyhole } from "lucide-react";

import { cn } from "@/lib/utils";

export default function AdminReadOnlyBadge({
  label = "只读",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-[22px] cursor-default items-center gap-1.5 whitespace-nowrap rounded-[var(--admin-v2-status-radius)] bg-[var(--admin-v2-neutral-background)] px-2 text-xs font-medium leading-[18px] text-[var(--admin-v2-neutral-foreground)] shadow-none",
        className,
      )}
    >
      <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
