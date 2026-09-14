export const OPEN_PUBLIC_SUPPORT_EVENT = "jianlian:open-public-support";

export function openPublicSupport() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_PUBLIC_SUPPORT_EVENT));
}
