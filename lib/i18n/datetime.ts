import {
  DEFAULT_BUSINESS_TIMEZONE,
  DEFAULT_LOCALE,
  normalizeBusinessTimezone,
} from "@/lib/i18n/config";

export type DateRange = {
  start: string;
  end: string;
};

function toDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value: unknown,
  options: { locale?: string; timeZone?: string; empty?: string } = {}
) {
  const date = toDate(value);
  if (!date) return options.empty ?? "—";

  return new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
    timeZone: normalizeBusinessTimezone(options.timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDateTime(
  value: unknown,
  options: { locale?: string; timeZone?: string; empty?: string } = {}
) {
  const date = toDate(value);
  if (!date) return options.empty ?? "—";

  return new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
    timeZone: normalizeBusinessTimezone(options.timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatRelativeTime(value: unknown, now = new Date()) {
  const date = toDate(value);
  if (!date) return "—";

  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  const unit =
    abs >= 86400 ? "day" : abs >= 3600 ? "hour" : abs >= 60 ? "minute" : "second";
  const divisor = unit === "day" ? 86400 : unit === "hour" ? 3600 : unit === "minute" ? 60 : 1;

  return new Intl.RelativeTimeFormat(DEFAULT_LOCALE, { numeric: "auto" }).format(
    Math.round(diffSeconds / divisor),
    unit
  );
}

export function getBusinessDateKey(
  value: unknown,
  timeZone = DEFAULT_BUSINESS_TIMEZONE
) {
  const date = toDate(value);
  if (!date) return "未知";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeBusinessTimezone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : "未知";
}

export function getBusinessDayRange(
  dateInput: unknown = new Date(),
  timeZone = DEFAULT_BUSINESS_TIMEZONE
): DateRange {
  const date = toDate(dateInput) ?? new Date();
  const key = getBusinessDateKey(date, timeZone);

  return {
    start: zonedDateTimeToUtcIso(`${key}T00:00:00.000`, timeZone),
    end: zonedDateTimeToUtcIso(`${key}T23:59:59.999`, timeZone),
  };
}

export function getBusinessRangeForDays(
  days: number,
  dateInput: unknown = new Date(),
  timeZone = DEFAULT_BUSINESS_TIMEZONE
): DateRange {
  const end = getBusinessDayRange(dateInput, timeZone);
  const startDate = new Date(end.start);
  startDate.setUTCDate(startDate.getUTCDate() - Math.max(days - 1, 0));
  return {
    start: startDate.toISOString(),
    end: end.end,
  };
}

export function normalizeDateRange(
  start?: string | null,
  end?: string | null,
  timeZone = DEFAULT_BUSINESS_TIMEZONE
) {
  const fallback = getBusinessRangeForDays(7, new Date(), timeZone);
  const startIso = start
    ? zonedDateTimeToUtcIso(`${start.slice(0, 10)}T00:00:00.000`, timeZone)
    : fallback.start;
  const endIso = end
    ? zonedDateTimeToUtcIso(`${end.slice(0, 10)}T23:59:59.999`, timeZone)
    : fallback.end;

  if (new Date(startIso).getTime() > new Date(endIso).getTime()) {
    throw new Error("时间范围无效，请重新选择。");
  }

  return { start: startIso, end: endIso };
}

function zonedDateTimeToUtcIso(localIsoWithoutZone: string, timeZone: string) {
  const timezone = normalizeBusinessTimezone(timeZone);
  const utcGuess = new Date(`${localIsoWithoutZone}Z`);
  const offset = getTimeZoneOffsetMs(utcGuess, timezone);
  return new Date(utcGuess.getTime() - offset).toISOString();
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour === "24" ? "0" : values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
}

