"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { fetchPublicSettings } from "@/lib/settings/client";
import {
  DEFAULT_PUBLIC_SETTINGS,
  type PublicSiteSettings,
} from "@/lib/settings/types";

type SettingsContextValue = {
  settings: PublicSiteSettings;
  loading: boolean;
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_PUBLIC_SETTINGS,
  loading: true,
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PublicSiteSettings>(
    DEFAULT_PUBLIC_SETTINGS
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetchPublicSettings()
      .then((nextSettings) => {
        if (mounted) setSettings(nextSettings);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(() => ({ settings, loading }), [settings, loading]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function usePublicSettings() {
  const context = useContext(SettingsContext);
  const [fallbackSettings, setFallbackSettings] = useState(context.settings);
  const [fallbackLoading, setFallbackLoading] = useState(context.loading);

  useEffect(() => {
    if (!context.loading) {
      setFallbackSettings(context.settings);
      setFallbackLoading(false);
      return;
    }

    let mounted = true;
    fetchPublicSettings()
      .then((nextSettings) => {
        if (mounted) setFallbackSettings(nextSettings);
      })
      .finally(() => {
        if (mounted) setFallbackLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [context.loading, context.settings]);

  return context.loading
    ? { settings: fallbackSettings, loading: fallbackLoading }
    : context;
}
