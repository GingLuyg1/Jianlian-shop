"use client";

const memoryLocal = new Map<string, string>();
const memorySession = new Map<string, string>();

export function createSafeUuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Fallback for non-secure contexts or restricted WebViews.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function safeLocalStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memoryLocal.get(key) ?? null;
  }
}

export function safeLocalStorageSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memoryLocal.set(key, value);
  }
}

export function safeLocalStorageRemove(key: string): void {
  if (typeof window === "undefined") return;
  memoryLocal.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage restriction errors.
  }
}

export function safeSessionStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return memorySession.get(key) ?? null;
  }
}

export function safeSessionStorageSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    memorySession.set(key, value);
  }
}

export function safeSessionStorageRemove(key: string): void {
  if (typeof window === "undefined") return;
  memorySession.delete(key);
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage restriction errors.
  }
}
