/** Preserve loopback preview ports and the two existing first-party origins only. */
export function getAuthSiteOrigin(origin?: string) {
  if (origin) {
    try {
      const url = new URL(origin);
      if (!url.username && !url.password && (
        (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
        || (url.protocol === "https:" && !url.port && ["jianlian.shop", "www.jianlian.shop"].includes(url.hostname))
      )) return url.origin;
    } catch { /* Use the established canonical origin. */ }
  }
  return "https://www.jianlian.shop";
}

/** Recovery must return to the same approved origin, including preview ports. */
export function getAuthRecoveryRedirectTo(origin?: string) {
  return `${getAuthSiteOrigin(origin)}/auth/callback?next=${encodeURIComponent("/reset-password")}`;
}

