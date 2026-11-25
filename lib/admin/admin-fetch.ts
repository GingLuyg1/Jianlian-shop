"use client";

import { toast } from "sonner";

export class AdminFetchError extends Error {
  status: number;
  code?: string;
  aborted: boolean;
  timedOut: boolean;

  constructor(
    message: string,
    options: { status?: number; code?: string; aborted?: boolean; timedOut?: boolean } = {}
  ) {
    super(message);
    this.name = "AdminFetchError";
    this.status = options.status ?? 0;
    this.code = options.code;
    this.aborted = Boolean(options.aborted);
    this.timedOut = Boolean(options.timedOut);
  }
}

export type AdminFetchOptions = RequestInit & {
  timeoutMs?: number;
  redirectOnUnauthorized?: boolean;
  silentUnauthorized?: boolean;
};

let lastUnauthorizedToastAt = 0;

function handleUnauthorized(redirectOnUnauthorized: boolean, silentUnauthorized: boolean) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (!silentUnauthorized && now - lastUnauthorizedToastAt > 5000) {
    lastUnauthorizedToastAt = now;
    toast.error("管理员登录状态已失效，请重新登录");
  }
  if (redirectOnUnauthorized) {
    const target = `${window.location.pathname}${window.location.search}`;
    const loginUrl = `/login?redirect=${encodeURIComponent(target || "/admin")}`;
    if (!window.location.pathname.startsWith("/login")) {
      window.setTimeout(() => {
        window.location.assign(loginUrl);
      }, 600);
    }
  }
}

export async function adminFetch(
  input: string | URL,
  options: AdminFetchOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 15000,
    redirectOnUnauthorized = true,
    silentUnauthorized = false,
    signal: externalSignal,
    ...init
  } = options;

  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const timer = timeoutMs > 0
    ? window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : null;

  try {
    const response = await fetch(input, {
      cache: "no-store",
      ...init,
      signal: controller.signal,
    });
    if (response.status === 401) {
      handleUnauthorized(redirectOnUnauthorized, silentUnauthorized);
    }
    return response;
  } catch (error) {
    if (timedOut) {
      throw new AdminFetchError("请求超时，请检查网络或稍后重试。", {
        status: 408,
        aborted: true,
        timedOut: true,
      });
    }
    if ((error as { name?: string } | null)?.name === "AbortError") {
      throw new AdminFetchError("请求已取消", { aborted: true });
    }
    throw new AdminFetchError(
      error instanceof Error && /[\u4e00-\u9fa5]/.test(error.message)
        ? error.message
        : "网络连接异常，请稍后重试。",
      { status: 0 }
    );
  } finally {
    if (timer !== null) window.clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
  }
}

export async function adminFetchJson<T = Record<string, unknown>>(
  input: string | URL,
  options: AdminFetchOptions = {}
): Promise<T> {
  const response = await adminFetch(input, options);
  const contentType = response.headers.get("content-type") ?? "";
  let payload: unknown = null;

  if (contentType.includes("application/json")) {
    payload = await response.json().catch(() => null);
  } else {
    const text = await response.text().catch(() => "");
    if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
  }

  if (!response.ok) {
    const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    const nestedError = record?.error && typeof record.error === "object"
      ? (record.error as Record<string, unknown>)
      : null;
    const message =
      (typeof record?.error === "string" && record.error) ||
      (typeof nestedError?.message === "string" && nestedError.message) ||
      (typeof record?.message === "string" && record.message) ||
      (response.status === 401
        ? "管理员登录状态已失效，请重新登录"
        : response.status === 403
          ? "当前账号暂无执行该操作的权限"
          : response.status >= 500
            ? `服务暂时不可用（HTTP ${response.status}），请稍后重试`
            : `请求失败（HTTP ${response.status}）`);
    const code =
      (typeof nestedError?.code === "string" && nestedError.code) ||
      (typeof record?.code === "string" && record.code) ||
      undefined;
    throw new AdminFetchError(message, { status: response.status, code });
  }

  return (payload ?? {}) as T;
}
