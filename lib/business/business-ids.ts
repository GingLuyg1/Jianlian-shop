import { randomBytes } from "crypto";

export type BusinessIdKind = "order" | "payment" | "recharge" | "refund" | "delivery" | "transaction" | "batch";

export const BUSINESS_ID_PREFIX: Record<BusinessIdKind, string> = {
  order: "ORD",
  payment: "PAY",
  recharge: "RCH",
  refund: "REF",
  delivery: "DLV",
  transaction: "TXN",
  batch: "BAT",
};

export const LEGACY_BUSINESS_ID_PREFIX: Partial<Record<BusinessIdKind, string[]>> = {
  order: ["JL"],
  transaction: ["BT"],
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatBusinessDate(input: Date = new Date()) {
  return `${input.getFullYear()}${pad(input.getMonth() + 1)}${pad(input.getDate())}${pad(input.getHours())}${pad(input.getMinutes())}${pad(input.getSeconds())}`;
}

export function generateBusinessId(kind: BusinessIdKind, now = new Date()) {
  const prefix = BUSINESS_ID_PREFIX[kind];
  const suffix = randomBytes(5).toString("hex").toUpperCase();
  return `${prefix}-${formatBusinessDate(now)}-${suffix}`;
}

export function normalizeBusinessKeyword(value: unknown, maxLength = 80) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function maskBusinessKeyword(value: string) {
  const keyword = normalizeBusinessKeyword(value);
  if (!keyword) return "";
  if (keyword.includes("@")) {
    const [name, domain] = keyword.split("@");
    return `${name.slice(0, 2)}***@${domain ?? "***"}`;
  }
  if (keyword.length <= 6) return `${keyword[0] ?? ""}***`;
  return `${keyword.slice(0, 3)}***${keyword.slice(-3)}`;
}

export function isLikelyBusinessNo(value: string) {
  const keyword = normalizeBusinessKeyword(value);
  return /^(JL|ORD|PAY|RCH|REF|DLV|TXN|BAT|BT)[-A-Z0-9]+$/i.test(keyword);
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
