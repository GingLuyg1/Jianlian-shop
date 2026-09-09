import { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AdminStatusTone = "success" | "warning" | "danger" | "info" | "neutral";
export type AdminStatusBadgeSize = "default" | "compact";

const toneClasses: Record<AdminStatusTone, string> = {
  success: "bg-[var(--admin-v2-success-background)] text-[var(--admin-v2-success-foreground)]",
  warning: "bg-[var(--admin-v2-warning-background)] text-[var(--admin-v2-warning-foreground)]",
  danger: "bg-[var(--admin-v2-danger-background)] text-[var(--admin-v2-danger-foreground)]",
  info: "bg-[var(--admin-v2-info-background)] text-[var(--admin-v2-info-foreground)]",
  neutral: "bg-[var(--admin-v2-neutral-background)] text-[var(--admin-v2-neutral-foreground)]",
};

export default function AdminStatusBadge({
  children,
  tone = "neutral",
  size = "default",
  className,
}: {
  children: ReactNode;
  tone?: AdminStatusTone;
  size?: AdminStatusBadgeSize;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-[var(--admin-v2-status-radius)] font-medium shadow-none",
        size === "compact" ? "min-h-5 px-1.5 text-xs leading-[18px]" : "min-h-[22px] px-2 text-xs leading-[18px]",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
