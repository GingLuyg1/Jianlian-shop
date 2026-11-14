"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format, startOfDay, subDays } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type DashboardDatePreset = "today" | "yesterday" | "7d" | "30d" | "custom";

export type DashboardDateFilterValue = {
  preset: DashboardDatePreset;
  from: Date;
  to: Date;
};

export function getPresetDateRange(preset: Exclude<DashboardDatePreset, "custom">): DashboardDateFilterValue {
  const today = startOfDay(new Date());
  if (preset === "today") {
    return { preset, from: today, to: today };
  }
  if (preset === "yesterday") {
    const yesterday = subDays(today, 1);
    return { preset, from: yesterday, to: yesterday };
  }
  if (preset === "7d") {
    return { preset, from: subDays(today, 6), to: today };
  }
  return { preset: "30d", from: subDays(today, 29), to: today };
}

const PRESETS: Array<{ key: Exclude<DashboardDatePreset, "custom">; label: string }> = [
  { key: "today", label: "今日" },
  { key: "yesterday", label: "昨日" },
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
];

export function AdminDateRangeFilter({
  value,
  onChange,
}: {
  value: DashboardDateFilterValue;
  onChange: (next: DashboardDateFilterValue) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draftRange, setDraftRange] = React.useState<DateRange | undefined>({
    from: value.from,
    to: value.to,
  });

  React.useEffect(() => {
    setDraftRange({ from: value.from, to: value.to });
  }, [value.from, value.to]);

  const customLabel =
    value.preset === "custom"
      ? `${format(value.from, "yyyy-MM-dd")} ~ ${format(value.to, "yyyy-MM-dd")}`
      : `${format(value.from, "MM-dd")} ~ ${format(value.to, "MM-dd")}`;

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="时间范围筛选">
      <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
        {PRESETS.map((item) => {
          const active = value.preset === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(getPresetDateRange(item.key))}
              style={active ? { backgroundColor: "#1d4ed8", color: "#ffffff" } : undefined}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 rounded-lg border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50",
              value.preset === "custom" && "border-blue-300 bg-blue-50/70 text-blue-700"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5 text-slate-500" />
            <span className="tabular-nums">{customLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            locale={zhCN}
            defaultMonth={value.from}
            selected={draftRange}
            onSelect={(range) => {
              setDraftRange(range);
              if (range?.from && range?.to) {
                onChange({
                  preset: "custom",
                  from: startOfDay(range.from),
                  to: startOfDay(range.to),
                });
              }
            }}
            disabled={(date) => date > new Date()}
            numberOfMonths={2}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
