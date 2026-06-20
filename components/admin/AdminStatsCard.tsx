/**
 * AdminStatsCard - Stats display card for admin dashboard numbers
 *
 * Shows a label, value, and icon in a compact card format.
 * Used for today's orders, pending orders, completed orders, revenue, etc.
 */

import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminStatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
}

export default function AdminStatsCard({
  title,
  value,
  icon: Icon,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
}: AdminStatsCardProps) {
  const isPending = value === "未接入";

  return (
    <Card className="min-w-0">
      <CardContent className="flex h-[82px] items-center p-3">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{title}</div>
            <div
              className={cn(
                "mt-1 truncate font-bold text-foreground",
                isPending ? "text-sm font-medium text-slate-400" : "text-xl"
              )}
            >
              {value}
            </div>
          </div>
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
