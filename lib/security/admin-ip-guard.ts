import type { NextRequest } from "next/server";

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  return "127.0.0.1";
}

export function isIpAllowed(ip: string, allowedList: string[]): boolean {
  if (!allowedList.length) return true;
  const cleanIp = ip.trim();
  // Always allow local loopback
  if (cleanIp === "127.0.0.1" || cleanIp === "::1" || cleanIp === "localhost") return true;

  return allowedList.some((pattern) => {
    const cleanPattern = pattern.trim();
    if (!cleanPattern) return false;
    if (cleanPattern === cleanIp) return true;
    if (cleanPattern.endsWith("*")) {
      const prefix = cleanPattern.slice(0, -1);
      return cleanIp.startsWith(prefix);
    }
    return false;
  });
}

export function checkAdminIpAccess(request: NextRequest): { allowed: boolean; ip: string; message?: string } {
  const allowedIpsRaw = process.env.ADMIN_ALLOWED_IPS?.trim();
  const ip = getClientIp(request);
  if (!allowedIpsRaw) {
    // If not configured, allow access
    return { allowed: true, ip };
  }

  const allowedList = allowedIpsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const allowed = isIpAllowed(ip, allowedList);
  if (!allowed) {
    return {
      allowed: false,
      ip,
      message: `访问被拒绝：管理员后台已开启 IP 白名单安全保护。当前网络 IP (${ip}) 未在授权列表中。`,
    };
  }
  return { allowed: true, ip };
}
