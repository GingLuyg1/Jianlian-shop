import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_ADMIN_SETTINGS,
  DEFAULT_PUBLIC_SETTINGS,
  SITE_SETTING_DEFINITIONS,
  SITE_SETTING_KEYS,
  parseSettingValue,
  parseSettings,
  serializeSettingValue,
  type AdminSiteSettings,
  type PublicSiteSettings,
  type SettingValue,
  type SiteSettingLog,
} from "@/lib/settings/types";

export type SettingsReadResult<T> = {
  settings: T;
  logs?: SiteSettingLog[];
  needsMigration: boolean;
  error?: string;
};

function isMissingSettingsTable(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "").toLowerCase()
      : "";

  return (
    message.includes("site_settings") ||
    message.includes("site_setting_logs") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function normalizeRows(rows: Array<{ setting_key: string; setting_value: unknown }> | null) {
  const values: Partial<Record<keyof AdminSiteSettings, unknown>> = {};

  (rows ?? []).forEach((row) => {
    if (row.setting_key in SITE_SETTING_DEFINITIONS) {
      values[row.setting_key as keyof AdminSiteSettings] = row.setting_value;
    }
  });

  return values;
}

export async function readPublicSettings(
  supabase: SupabaseClient
): Promise<SettingsReadResult<PublicSiteSettings>> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("setting_key,setting_value")
    .eq("is_public", true);

  if (error) {
    return {
      settings: DEFAULT_PUBLIC_SETTINGS,
      needsMigration: isMissingSettingsTable(error),
      error: "公开配置读取失败，已使用默认配置。",
    };
  }

  return {
    settings: parseSettings(normalizeRows(data), false) as PublicSiteSettings,
    needsMigration: false,
  };
}

export async function readAdminSettings(
  supabase: SupabaseClient
): Promise<SettingsReadResult<AdminSiteSettings>> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("setting_key,setting_value");

  if (error) {
    return {
      settings: DEFAULT_ADMIN_SETTINGS,
      logs: [],
      needsMigration: isMissingSettingsTable(error),
      error: "系统配置读取失败，已使用默认配置。",
    };
  }

  const { data: logs, error: logsError } = await supabase
    .from("site_setting_logs")
    .select("id,setting_key,old_value,new_value,updated_by,updated_at")
    .order("updated_at", { ascending: false })
    .limit(20);

  return {
    settings: parseSettings(normalizeRows(data), true),
    logs: logsError ? [] : ((logs ?? []) as SiteSettingLog[]),
    needsMigration: false,
    error: logsError ? "审计记录读取失败。" : undefined,
  };
}

export function validateSettingsPatch(values: Partial<AdminSiteSettings>) {
  const normalized: Partial<AdminSiteSettings> = {};

  Object.entries(values).forEach(([rawKey, rawValue]) => {
    if (!(rawKey in SITE_SETTING_DEFINITIONS)) return;

    const key = rawKey as keyof AdminSiteSettings;
    const definition = SITE_SETTING_DEFINITIONS[key];
    normalized[key] = parseSettingValue(
      rawValue,
      definition.type,
      definition.defaultValue
    ) as never;
  });

  if ("site_name" in normalized && !String(normalized.site_name ?? "").trim()) {
    return { ok: false as const, error: "站点名称不能为空" };
  }

  if (
    "products_per_page" in normalized &&
    ![20, 40, 60].includes(Number(normalized.products_per_page))
  ) {
    return { ok: false as const, error: "商品默认每页数量只能选择 20、40 或 60" };
  }

  if (
    "promotion_commission_rate" in normalized &&
    (Number(normalized.promotion_commission_rate) < 0 ||
      Number(normalized.promotion_commission_rate) > 1)
  ) {
    return { ok: false as const, error: "推广佣金比例必须在 0 到 100% 之间" };
  }

  if (
    "promotion_min_withdraw_amount" in normalized &&
    Number(normalized.promotion_min_withdraw_amount) < 0
  ) {
    return { ok: false as const, error: "最低提现金额不能小于 0" };
  }

  return { ok: true as const, values: normalized };
}

export async function saveAdminSettings(
  supabase: SupabaseClient,
  userId: string,
  values: Partial<AdminSiteSettings>
) {
  const validation = validateSettingsPatch(values);
  if (!validation.ok) return validation;

  const keys = Object.keys(validation.values) as Array<keyof AdminSiteSettings>;
  if (keys.length === 0) return { ok: true as const };

  const { data: existingRows, error: existingError } = await supabase
    .from("site_settings")
    .select("setting_key,setting_value")
    .in("setting_key", keys);

  if (existingError) {
    return {
      ok: false as const,
      error: isMissingSettingsTable(existingError)
        ? "系统设置数据库尚未初始化，请先执行 settings migration。"
        : "读取旧配置失败",
    };
  }

  const existing = normalizeRows(existingRows);

  const upsertRows = keys.map((key) => {
    const definition = SITE_SETTING_DEFINITIONS[key];
    return {
      setting_key: key,
      setting_value: serializeSettingValue(
        validation.values[key] as SettingValue
      ),
      setting_type: definition.type,
      setting_group: definition.group,
      is_public: definition.isPublic,
      description: definition.description,
      updated_by: userId,
    };
  });

  const { error: upsertError } = await supabase
    .from("site_settings")
    .upsert(upsertRows, { onConflict: "setting_key" });

  if (upsertError) {
    return { ok: false as const, error: "保存系统设置失败" };
  }

  const logRows = keys.map((key) => ({
    setting_key: key,
    old_value: serializeSettingValue(
      parseSettingValue(
        existing[key],
        SITE_SETTING_DEFINITIONS[key].type,
        SITE_SETTING_DEFINITIONS[key].defaultValue
      )
    ),
    new_value: serializeSettingValue(validation.values[key] as SettingValue),
    updated_by: userId,
  }));

  const { error: logError } = await supabase
    .from("site_setting_logs")
    .insert(logRows);

  if (logError) {
    return { ok: false as const, error: "配置已保存，但审计记录写入失败" };
  }

  return { ok: true as const };
}

export async function getPromotionSettings(supabase: SupabaseClient) {
  const result = await readPublicSettings(supabase);
  return {
    enabled: result.settings.promotion_enabled,
    commissionRate: result.settings.promotion_commission_rate,
    minWithdrawAmount: result.settings.promotion_min_withdraw_amount,
  };
}

export function getSettingDefinitionRows() {
  return SITE_SETTING_KEYS.map((key) => SITE_SETTING_DEFINITIONS[key]);
}
