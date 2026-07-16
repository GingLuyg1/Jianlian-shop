export type SettingType = "string" | "number" | "boolean" | "json";
export type SettingGroup = "basic" | "store" | "order" | "promotion" | "security";

export type SettingValue = string | number | boolean | Record<string, unknown> | null;

export type PublicAnnouncement = {
  id: string;
  title: string;
  content: string;
  announcement_type: "info" | "warning" | "success" | "important";
  placement: "global_top" | "home" | "checkout" | "account";
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
};

export type PublicSiteSettings = {
  site_name: string;
  site_description: string;
  site_subtitle: string;
  site_status: string;
  support_email: string;
  support_phone: string;
  support_contact: string;
  currency: string;
  timezone: string;
  default_language: string;
  default_locale: string;
  supported_locales: Record<string, unknown>;
  default_currency: string;
  currency_symbol: string;
  business_timezone: string;
  date_format: string;
  time_format: string;
  products_per_page: number;
  show_original_price: boolean;
  show_stock: boolean;
  show_sold_out_products: boolean;
  order_expire_minutes: number;
  default_order_note_hint: string;
  checkout_notice: string;
  maintenance_enabled: boolean;
  maintenance_message: string;
  top_announcement: string;
  promotion_enabled: boolean;
  promotion_commission_rate: number;
  promotion_min_withdraw_amount: number;
};

export type PublicSettingsResponse = PublicSiteSettings & {
  announcements?: PublicAnnouncement[];
};

export type AdminSiteSettings = PublicSiteSettings & {
  order_auto_cancel_minutes: number;
  allow_user_cancel_pending_order: boolean;
  order_no_prefix: string;
  promotion_available_order_status: string;
  require_email_verification: boolean;
  admin_action_confirm: boolean;
  login_failure_hint_strategy: string;
};

export type SiteSettingDefinition = {
  key: keyof AdminSiteSettings;
  type: SettingType;
  group: SettingGroup;
  isPublic: boolean;
  description: string;
  defaultValue: SettingValue;
};

export type SiteSettingLog = {
  id: string;
  setting_key: string;
  old_value: SettingValue;
  new_value: SettingValue;
  updated_by: string | null;
  updated_at: string;
};

export const DEFAULT_ANNOUNCEMENT =
  "请牢记域名 www.jianlian.shop，本站不提供任何中国大陆业务。网站出售的商品仅限个人或团体合法电商拓客使用，严禁用于违法犯罪活动。";

export const DEFAULT_SUPPORT_CONTACT =
  "Telegram：\nWhatsApp：\nEmail：\n工作时间：12:00 AM - 24:00 PM GMT+8\n有问题均可留言";

export const DEFAULT_MAINTENANCE_MESSAGE =
  "网站正在维护升级，请稍后再访问。管理员后台和健康检查保持可用。";

export const DEFAULT_CHECKOUT_NOTICE =
  "所有账号/卡密类商品请仔细核对说明，非商品问题不支持退换。售后期通常为商品发货后 24 小时内，请收到后第一时间检查。";

export const SITE_SETTING_DEFINITIONS = {
  site_name: { key: "site_name", type: "string", group: "basic", isPublic: true, description: "站点名称", defaultValue: "Jianlian" },
  site_description: { key: "site_description", type: "string", group: "basic", isPublic: true, description: "站点描述", defaultValue: "数字商品服务" },
  site_subtitle: { key: "site_subtitle", type: "string", group: "basic", isPublic: true, description: "站点副标题（兼容旧字段）", defaultValue: "数字商品服务" },
  site_status: { key: "site_status", type: "string", group: "basic", isPublic: true, description: "站点状态", defaultValue: "open" },
  support_email: { key: "support_email", type: "string", group: "basic", isPublic: true, description: "公开客服邮箱", defaultValue: "" },
  support_phone: { key: "support_phone", type: "string", group: "basic", isPublic: true, description: "公开客服电话", defaultValue: "" },
  support_contact: { key: "support_contact", type: "string", group: "basic", isPublic: true, description: "客服联系方式", defaultValue: DEFAULT_SUPPORT_CONTACT },
  top_announcement: { key: "top_announcement", type: "string", group: "basic", isPublic: true, description: "全站顶部公告", defaultValue: DEFAULT_ANNOUNCEMENT },
  checkout_notice: { key: "checkout_notice", type: "string", group: "basic", isPublic: true, description: "Checkout 购买提醒", defaultValue: DEFAULT_CHECKOUT_NOTICE },
  maintenance_enabled: { key: "maintenance_enabled", type: "boolean", group: "basic", isPublic: true, description: "维护模式开关", defaultValue: false },
  maintenance_message: { key: "maintenance_message", type: "string", group: "basic", isPublic: true, description: "维护模式提示", defaultValue: DEFAULT_MAINTENANCE_MESSAGE },
  currency: { key: "currency", type: "string", group: "store", isPublic: true, description: "币种（兼容新字段）", defaultValue: "CNY" },
  default_currency: { key: "default_currency", type: "string", group: "store", isPublic: true, description: "默认币种", defaultValue: "CNY" },
  currency_symbol: { key: "currency_symbol", type: "string", group: "store", isPublic: true, description: "货币符号", defaultValue: "¥" },
  timezone: { key: "timezone", type: "string", group: "store", isPublic: true, description: "时区（兼容新字段）", defaultValue: "Asia/Shanghai" },
  business_timezone: { key: "business_timezone", type: "string", group: "store", isPublic: true, description: "业务时区", defaultValue: "Asia/Shanghai" },
  default_language: { key: "default_language", type: "string", group: "store", isPublic: true, description: "默认语言（兼容新字段）", defaultValue: "zh-CN" },
  default_locale: { key: "default_locale", type: "string", group: "store", isPublic: true, description: "默认语言", defaultValue: "zh-CN" },
  supported_locales: { key: "supported_locales", type: "json", group: "store", isPublic: true, description: "支持的语言", defaultValue: { values: ["zh-CN"] } },
  date_format: { key: "date_format", type: "string", group: "store", isPublic: true, description: "日期格式", defaultValue: "yyyy-MM-dd" },
  time_format: { key: "time_format", type: "string", group: "store", isPublic: true, description: "时间格式", defaultValue: "HH:mm:ss" },
  products_per_page: { key: "products_per_page", type: "number", group: "store", isPublic: true, description: "商品默认每页数量", defaultValue: 20 },
  show_original_price: { key: "show_original_price", type: "boolean", group: "store", isPublic: true, description: "是否显示原价", defaultValue: true },
  show_stock: { key: "show_stock", type: "boolean", group: "store", isPublic: true, description: "是否显示库存", defaultValue: true },
  show_sold_out_products: { key: "show_sold_out_products", type: "boolean", group: "store", isPublic: true, description: "是否展示售罄商品", defaultValue: true },
  order_expire_minutes: { key: "order_expire_minutes", type: "number", group: "order", isPublic: true, description: "订单支付有效期（分钟）", defaultValue: 30 },
  order_auto_cancel_minutes: { key: "order_auto_cancel_minutes", type: "number", group: "order", isPublic: false, description: "订单自动取消时间（分钟）", defaultValue: 30 },
  allow_user_cancel_pending_order: { key: "allow_user_cancel_pending_order", type: "boolean", group: "order", isPublic: false, description: "是否允许用户取消待支付订单", defaultValue: true },
  order_no_prefix: { key: "order_no_prefix", type: "string", group: "order", isPublic: false, description: "订单编号前缀", defaultValue: "JL" },
  default_order_note_hint: { key: "default_order_note_hint", type: "string", group: "order", isPublic: true, description: "默认订单备注提示", defaultValue: "请填写必要的订单备注。" },
  promotion_enabled: { key: "promotion_enabled", type: "boolean", group: "promotion", isPublic: true, description: "推广功能是否启用", defaultValue: true },
  promotion_commission_rate: { key: "promotion_commission_rate", type: "number", group: "promotion", isPublic: true, description: "默认佣金比例", defaultValue: 0.03 },
  promotion_min_withdraw_amount: { key: "promotion_min_withdraw_amount", type: "number", group: "promotion", isPublic: true, description: "最低提现金额", defaultValue: 100 },
  promotion_available_order_status: { key: "promotion_available_order_status", type: "string", group: "promotion", isPublic: false, description: "佣金变为可用的订单状态", defaultValue: "completed" },
  require_email_verification: { key: "require_email_verification", type: "boolean", group: "security", isPublic: false, description: "是否要求邮箱验证", defaultValue: false },
  admin_action_confirm: { key: "admin_action_confirm", type: "boolean", group: "security", isPublic: false, description: "管理员危险操作二次确认", defaultValue: true },
  login_failure_hint_strategy: { key: "login_failure_hint_strategy", type: "string", group: "security", isPublic: false, description: "登录失败提示策略", defaultValue: "generic" },
} as const satisfies Record<keyof AdminSiteSettings, SiteSettingDefinition>;

export const SITE_SETTING_KEYS = Object.keys(SITE_SETTING_DEFINITIONS) as Array<keyof AdminSiteSettings>;

export function parseSettingValue(value: unknown, type: SettingType, fallback: SettingValue) {
  const raw = value && typeof value === "object" && "value" in value ? (value as { value?: unknown }).value : value;
  if (raw === null || raw === undefined) return fallback;
  if (type === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (type === "boolean") {
    if (typeof raw === "boolean") return raw;
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
    return fallback;
  }
  if (type === "json") {
    if (typeof raw === "object") return raw as Record<string, unknown>;
    try {
      return JSON.parse(String(raw)) as Record<string, unknown>;
    } catch {
      return fallback;
    }
  }
  return String(raw);
}

export function serializeSettingValue(value: SettingValue) {
  return { value };
}

function applyAliases(parsed: Record<string, SettingValue>) {
  parsed.site_description = parsed.site_description || parsed.site_subtitle;
  parsed.site_subtitle = parsed.site_subtitle || parsed.site_description;
  parsed.currency = parsed.currency || parsed.default_currency;
  parsed.default_currency = parsed.default_currency || parsed.currency;
  parsed.timezone = parsed.timezone || parsed.business_timezone;
  parsed.business_timezone = parsed.business_timezone || parsed.timezone;
  parsed.default_language = parsed.default_language || parsed.default_locale;
  parsed.default_locale = parsed.default_locale || parsed.default_language;
  parsed.order_expire_minutes = Number(parsed.order_expire_minutes || parsed.order_auto_cancel_minutes || 30);
  parsed.order_auto_cancel_minutes = Number(parsed.order_auto_cancel_minutes || parsed.order_expire_minutes || 30);
  parsed.maintenance_enabled = Boolean(parsed.maintenance_enabled) || parsed.site_status === "maintenance";
  return parsed;
}

export function parseSettings(values: Partial<Record<keyof AdminSiteSettings, unknown>>, includePrivate = true) {
  const parsed: Record<string, SettingValue> = {};
  SITE_SETTING_KEYS.forEach((key) => {
    const definition = SITE_SETTING_DEFINITIONS[key];
    if (!includePrivate && !definition.isPublic) return;
    parsed[key] = parseSettingValue(values[key], definition.type, definition.defaultValue);
  });
  return applyAliases(parsed) as AdminSiteSettings;
}

export const DEFAULT_PUBLIC_SETTINGS = parseSettings({}, false) as PublicSiteSettings;
export const DEFAULT_ADMIN_SETTINGS = parseSettings({}, true);
