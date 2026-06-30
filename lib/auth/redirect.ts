const BLOCKED_INTERNAL_PREFIXES = ["/api", "/_next"];

export function getSafeInternalRedirect(
  value: string | null | undefined,
  fallback = "/"
) {
  if (!value) return fallback;

  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("//") || trimmed.includes("\\")) return fallback;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(trimmed, "https://www.jianlian.shop");
  } catch {
    return fallback;
  }

  if (parsed.origin !== "https://www.jianlian.shop") return fallback;

  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (!path.startsWith("/")) return fallback;
  if (BLOCKED_INTERNAL_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix))) {
    return fallback;
  }

  return path;
}

