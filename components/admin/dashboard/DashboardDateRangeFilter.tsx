"use client";

import { useState } from "react";
import { addDays, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { CalendarDays, ChevronDown } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { shanghaiDateKey } from "@/lib/admin/dashboard-analytics-query.mjs";

export type DashboardDateRange = {
  kind: "today" | "7" | "30" | "custom";
  from: string;
  to: string;
};

function dayKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function dashboardPreset(kind: "today" | "7" | "30", today = shanghaiDateKey()) : DashboardDateRange {
  const days = kind === "today" ? 1 : Number(kind);
  return { kind, from: dayKey(addDays(parseISO(today), 1 - days)), to: today };
}

export function dashboardRangeError(from: string, to: string, today = shanghaiDateKey()) {
  const valid = /^\d{4}-\d{2}-\d{2}$/;
  if (!valid.test(from) || !valid.test(to) || !isValid(parseISO(from)) || !isValid(parseISO(to)) ||
      dayKey(parseISO(from)) !== from || dayKey(parseISO(to)) !== to) return "请选择有效的开始和结束日期。";
  if (from > to) return "结束日期不能早于开始日期。";
  if (to > today) return "不能选择上海时间的未来日期。";
  if (differenceInCalendarDays(parseISO(to), parseISO(from)) + 1 > 365) return "单次最多查询 365 个自然日。";
  return "";
}

export function dashboardRangeLabel(range: DashboardDateRange) {
  const kind = { today: "本日", "7": "最近 7 天", "30": "最近 30 天", custom: "自定义" }[range.kind];
  return `${kind} · ${range.from} 至 ${range.to}（北京时间）`;
}

export function DashboardDateRangeFilter({
  value,
  onChange,
  label,
}: {
  value: DashboardDateRange;
  onChange: (next: DashboardDateRange) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const [error, setError] = useState("");
  const today = shanghaiDateKey();
  const selectPreset = (kind: "today" | "7" | "30") => {
    onChange(dashboardPreset(kind, today));
    setOpen(false);
    setError("");
  };
  return (
    <div className="dashboard-date-filter" aria-label={label}>
      <Popover open={open} onOpenChange={(next) => {
          setOpen(next);
          if (next) { setFrom(value.from); setTo(value.to); setError(""); }
        }}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="dashboard-date-trigger" aria-label={`${label}日期筛选，当前${dashboardRangeLabel(value)}`} aria-expanded={open}>
              <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="dashboard-date-trigger-copy"><strong>{{ today: "本日", "7": "最近 7 天", "30": "最近 30 天", custom: "自定义区间" }[value.kind]}</strong><small>{value.from} — {value.to}</small></span>
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="dashboard-date-popover w-[min(92vw,360px)] p-3" aria-label={`${label}日期选择器`}>
            <p className="dashboard-date-popover-title">选择统计区间 <span>Asia/Shanghai</span></p>
            <div className="dashboard-date-presets" role="group" aria-label={`${label}快捷时间`}>
              {([["today", "本日"], ["7", "最近 7 天"], ["30", "最近 30 天"]] as const).map(([kind, text]) => (
                <Button key={kind} type="button" size="sm" variant="outline" aria-pressed={value.kind === kind} onClick={() => selectPreset(kind)}>{text}</Button>
              ))}
            </div>
            <p className="dashboard-date-custom-label">自定义日期</p>
            <Calendar
              mode="range"
              locale={zhCN}
              selected={{ from: from ? parseISO(from) : undefined, to: to ? parseISO(to) : undefined }}
              onSelect={(range) => {
                setFrom(range?.from ? dayKey(range.from) : "");
                setTo(range?.to ? dayKey(range.to) : "");
                setError("");
              }}
              disabled={{ after: parseISO(today) }}
              numberOfMonths={1}
              className="mx-auto p-0"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs">开始日期<input aria-label={`${label}开始日期`} type="date" value={from} max={today} onChange={(event) => { setFrom(event.target.value); setError(""); }} className="mt-1 w-full rounded-lg border bg-white p-2 text-sm" /></label>
              <label className="text-xs">结束日期<input aria-label={`${label}结束日期`} type="date" value={to} max={today} onChange={(event) => { setTo(event.target.value); setError(""); }} className="mt-1 w-full rounded-lg border bg-white p-2 text-sm" /></label>
            </div>
            {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : <p className="mt-2 text-xs text-slate-600">含开始和结束日，最多 365 个上海自然日。</p>}
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { onChange(dashboardPreset("today", today)); setOpen(false); setError(""); }}>重置</Button>
              <Button type="button" size="sm" onClick={() => {
                const message = dashboardRangeError(from, to, today);
                if (message) { setError(message); return; }
                onChange({ kind: "custom", from, to });
                setOpen(false);
              }}>确认区间</Button>
            </div>
          </PopoverContent>
        </Popover>
      <span className="sr-only" aria-live="polite">{dashboardRangeLabel(value)}</span>
    </div>
  );
}
