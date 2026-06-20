"use client";

import {
  DEFAULT_PUBLIC_SETTINGS,
  type PublicSiteSettings,
} from "@/lib/settings/types";

let cachedPublicSettings: PublicSiteSettings | null = null;
let inflightPublicSettings: Promise<PublicSiteSettings> | null = null;

export async function fetchPublicSettings() {
  if (cachedPublicSettings) return cachedPublicSettings;
  if (inflightPublicSettings) return inflightPublicSettings;

  inflightPublicSettings = fetch("/api/settings/public", {
    credentials: "same-origin",
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) return DEFAULT_PUBLIC_SETTINGS;
      const payload = (await response.json().catch(() => null)) as
        | { settings?: PublicSiteSettings }
        | null;
      cachedPublicSettings = payload?.settings ?? DEFAULT_PUBLIC_SETTINGS;
      return cachedPublicSettings;
    })
    .catch(() => DEFAULT_PUBLIC_SETTINGS)
    .finally(() => {
      inflightPublicSettings = null;
    });

  return inflightPublicSettings;
}

export function clearPublicSettingsCache() {
  cachedPublicSettings = null;
}
