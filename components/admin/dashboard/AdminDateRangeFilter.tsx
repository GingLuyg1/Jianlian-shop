"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format, startOfDay, subDays } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";
import { cn } from "@/lib/utils";

export type DashboardDatePreset = "today" | "yesterday" | "7d" | "30d" | "custom";

export type DashboardDateFilterValue = {
  preset: DashboardDatePreset;
  from: Date;
  to: Date;
};

const SHANGHAI_TZ = "Asia/Shanghai";

function formatShanghaiYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shanghaiDayDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+08:00`);
}

function shiftShanghaiYmd(ymd: string, deltaDays: number): string {
  const base = new Date(`${ymd}T12:00:00+08:00`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return formatShanghaiYmd(base);
}

export function getPresetDateRange(preset: Exclude<DashboardDatePreset, "custom">): DashboardDateFilterValue {
  const todayKey = formatShanghaiYmd(new Date());
  const today = shanghaiDayDate(todayKey);
  if (preset === "today") {
    return { preset, from: today, to: today };
  }
  if (preset === "yesterday") {
    const yesterday = shanghaiDayDate(shiftShanghaiYmd(todayKey, -1));
    return { preset, from: yesterday, to: yesterday };
  }
  if (preset === "7d") {
    return { preset, from: shanghaiDayDate(shiftShanghaiYmd(todayKey, -6)), to: today };
  }
  return { preset: "30d", from: shanghaiDayDate(shiftShanghaiYmd(todayKey, -29)), to: today };
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
  size = "default",
  allowAll = false,
  isAllSelected = false,
  onSelectAll,
}: {
  value: DashboardDateFilterValue;
  onChange: (next: DashboardDateFilterValue) => void;
  size?: "sm" | "default";
  allowAll?: boolean;
  isAllSelected?: boolean;
  onSelectAll?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draftRange, setDraftRange] = React.useState<DateRange | undefined>({
    from: value.from,
    to: value.to,
  });

  React.useEffect(() => {
    setDraftRange({ from: value.from, to: value.to });
  }, [value.from, value.to]);

  const activePresetKey = isAllSelected
    ? "all"
    : value.preset === "custom"
    ? null
    : value.preset;

  const { containerRef, setItemRef, indicator } = useSlidingIndicator<string>(
    activePresetKey,
    [allowAll, size]
  );

  const fromKey = formatShanghaiYmd(value.from);
  const toKey = formatShanghaiYmd(value.to);
  const customLabel = isAllSelected
    ? "选择日期范围"
    : value.preset === "custom"
    ? `${fromKey} ~ ${toKey}`
    : `${fromKey.slice(5)} ~ ${toKey.slice(5)}`;

  const isDefaultSize = size === "default";

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="时间范围筛选">
      <div
        ref={containerRef}
        className={cn(
          "relative inline-flex items-center rounded-lg border border-slate-200 bg-white shadow-sm",
          isDefaultSize ? "h-10 p-1" : "h-8 p-0.5"
        )}
      >
        {indicator.visible && (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute rounded-md bg-blue-700 shadow-sm",
              isDefaultSize ? "top-1 bottom-1" : "top-0.5 bottom-0.5",
              indicator.animated && "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            )}
            style={{
              left: `${indicator.left}px`,
              width: `${indicator.width}px`,
            }}
          />
        )}
        {allowAll && (
          <button
            ref={setItemRef("all")}
            type="button"
            onClick={() => onSelectAll?.()}
            className={cn(
              "relative z-10 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap",
              isDefaultSize ? "h-8 px-2.5 text-xs" : "px-2.5 py-1 text-xs",
              isAllSelected
                ? "text-white"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            全部
          </button>
        )}
        {PRESETS.map((item) => {
          const active = !isAllSelected && value.preset === item.key;
          return (
            <button
              key={item.key}
              ref={setItemRef(item.key)}
              type="button"
              onClick={() => onChange(getPresetDateRange(item.key))}
              className={cn(
                "relative z-10 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap",
                isDefaultSize ? "h-8 px-2.5 text-xs" : "px-2.5 py-1 text-xs",
                active
                  ? "text-white"
                  : "text-slate-600 hover:text-slate-900"
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
            size={isDefaultSize ? "default" : "sm"}
            className={cn(
              "gap-1.5 rounded-lg border-slate-200 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50",
              isDefaultSize ? "h-10 text-sm" : "h-8 text-xs",
              !isAllSelected && value.preset === "custom" && "border-blue-300 bg-blue-50/70 text-blue-700"
            )}
          >
            <CalendarIcon className="h-4 w-4 text-slate-500" />
            <span className="tabular-nums" suppressHydrationWarning>{customLabel}</span>
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
