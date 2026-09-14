import "server-only";

import { isIP } from "node:net";

export function getPaymentClientIp(request: Request) {
  const candidates = [
    request.headers.get("x-forwarded-for")?.split(",")[0],
    request.headers.get("x-real-ip"),
    request.headers.get("cf-connecting-ip"),
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (isIP(value)) return value;
  }
  return null;
}
