export type SettingType = "string" | "number" | "boolean" | "json";
export type SettingGroup = "basic" | "store" | "order" | "promotion" | "security";

export type SettingValue = string | number | boolean | Record<string, unknown> | null;

export type SiteSettingDefinition = {
  key: keyof AdminSiteSettings;
  type: SettingType;
  group: SettingGroup;
  isPublic: boolean;
  description: string;
  defaultValue: SettingValue;
};

export type PublicSiteSettings = {
  site_name: string;
  site_subtitle: string;
  site_status: string;
  top_announcement: string;
  support_contact: string;
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
  default_order_note_hint: string;
  promotion_enabled: boolean;
  promotion_commission_rate: number;
  promotion_min_withdraw_amount: number;
};

export type AdminSiteSettings = PublicSiteSettings & {
  order_auto_cancel_minutes: number;
  allow_user_cancel_pending_order: boolean;
  order_no_prefix: string;
  default_order_note_hint: string;
  promotion_available_order_status: string;
  require_email_verification: boolean;
  admin_action_confirm: boolean;
  login_failure_hint_strategy: string;
};

export type SiteSettingLog = {
  id: string;
  setting_key: string;
  old_value: SettingValue;
  new_value: SettingValue;
  updated_by: string | null;
  updated_at: string;
};

const DEFAULT_ANNOUNCEMENT =
  "请牢记域名www.jianlian.shop，本站不提供任何中国大陆业务。网站出售的商品以及社媒服务仅限个人或团体合法电商拓客使用。严禁任何人利用购买的商品进行任何违法犯罪活动。消费者若使用本网站提供商品发生未经授权的违法犯罪行为所产生的一切责任，均由消费者自行承担，与本站制作者无关。";

const DEFAULT_SUPPORT_CONTACT =
  "Telegram：\nWhatsApp：\nEmail：\n上班时间：（12:00 AM - 24:00 PM GMT+8）\n有问题均可留言";

export const SITE_SETTING_DEFINITIONS = {
  site_name: {
    key: "site_name",
    type: "string",
    group: "basic",
    isPublic: true,
    description: "站点名称",
    defaultValue: "Jianlian",
  },
  site_subtitle: {
    key: "site_subtitle",
    type: "string",
    group: "basic",
    isPublic: true,
    description: "站点副标题",
    defaultValue: "数字商品服务",
  },
  site_status: {
    key: "site_status",
    type: "string",
    group: "basic",
    isPublic: true,
    description: "站点状态",
    defaultValue: "open",
  },
  top_announcement: {
    key: "top_announcement",
    type: "string",
    group: "basic",
    isPublic: true,
    description: "顶部公告",
    defaultValue: DEFAULT_ANNOUNCEMENT,
  },
  support_contact: {
    key: "support_contact",
    type: "string",
    group: "basic",
    isPublic: true,
    description: "客服联系方式",
    defaultValue: DEFAULT_SUPPORT_CONTACT,
  },
  default_currency: {
    key: "default_currency",
    type: "string",
    group: "store",
    isPublic: true,
    description: "默认货币",
    defaultValue: "CNY",
  },
  default_locale: {
    key: "default_locale",
    type: "string",
    group: "store",
    isPublic: true,
    description: "默认语言",
    defaultValue: "zh-CN",
  },
  supported_locales: {
    key: "supported_locales",
    type: "json",
    group: "store",
    isPublic: true,
    description: "支持的语言",
    defaultValue: { values: ["zh-CN"] },
  },
  currency_symbol: {
    key: "currency_symbol",
    type: "string",
    group: "store",
    isPublic: true,
    description: "货币符号",
    defaultValue: "¥",
  },
  business_timezone: {
    key: "business_timezone",
    type: "string",
    group: "store",
    isPublic: true,
    description: "业务时区",
    defaultValue: "Asia/Shanghai",
  },
  date_format: {
    key: "date_format",
    type: "string",
    group: "store",
    isPublic: true,
    description: "日期格式",
    defaultValue: "yyyy-MM-dd",
  },
  time_format: {
    key: "time_format",
    type: "string",
    group: "store",
    isPublic: true,
    description: "时间格式",
    defaultValue: "HH:mm:ss",
  },
  products_per_page: {
    key: "products_per_page",
    type: "number",
    group: "store",
    isPublic: true,
    description: "商品默认每页数量",
    defaultValue: 20,
  },
  show_original_price: {
    key: "show_original_price",
    type: "boolean",
    group: "store",
    isPublic: true,
    description: "是否显示原价",
    defaultValue: true,
  },
  show_stock: {
    key: "show_stock",
    type: "boolean",
    group: "store",
    isPublic: true,
    description: "是否显示库存",
    defaultValue: true,
  },
  show_sold_out_products: {
    key: "show_sold_out_products",
    type: "boolean",
    group: "store",
    isPublic: true,
    description: "是否允许缺货商品展示",
    defaultValue: true,
  },
  order_auto_cancel_minutes: {
    key: "order_auto_cancel_minutes",
    type: "number",
    group: "order",
    isPublic: false,
    description: "订单自动取消时间（分钟）",
    defaultValue: 30,
  },
  allow_user_cancel_pending_order: {
    key: "allow_user_cancel_pending_order",
    type: "boolean",
    group: "order",
    isPublic: false,
    description: "是否允许用户取消待支付订单",
    defaultValue: true,
  },
  order_no_prefix: {
    key: "order_no_prefix",
    type: "string",
    group: "order",
    isPublic: false,
    description: "订单编号前缀",
    defaultValue: "JL",
  },
  default_order_note_hint: {
    key: "default_order_note_hint",
    type: "string",
    group: "order",
    isPublic: true,
    description: "默认订单备注提示",
    defaultValue: "请填写必要的订单备注。",
  },
  promotion_enabled: {
    key: "promotion_enabled",
    type: "boolean",
    group: "promotion",
    isPublic: true,
    description: "推广功能是否启用",
    defaultValue: true,
  },
  promotion_commission_rate: {
    key: "promotion_commission_rate",
    type: "number",
    group: "promotion",
    isPublic: true,
    description: "默认佣金比例",
    defaultValue: 0.03,
  },
  promotion_min_withdraw_amount: {
    key: "promotion_min_withdraw_amount",
    type: "number",
    group: "promotion",
    isPublic: true,
    description: "最低提现金额",
    defaultValue: 100,
  },
  promotion_available_order_status: {
    key: "promotion_available_order_status",
    type: "string",
    group: "promotion",
    isPublic: false,
    description: "佣金变为可用的订单状态",
    defaultValue: "completed",
  },
  require_email_verification: {
    key: "require_email_verification",
    type: "boolean",
    group: "security",
    isPublic: false,
    description: "是否要求邮箱验证",
    defaultValue: false,
  },
  admin_action_confirm: {
    key: "admin_action_confirm",
    type: "boolean",
    group: "security",
    isPublic: false,
    description: "管理员操作二次确认",
    defaultValue: true,
  },
  login_failure_hint_strategy: {
    key: "login_failure_hint_strategy",
    type: "string",
    group: "security",
    isPublic: false,
    description: "登录失败提示策略",
    defaultValue: "generic",
  },
} as const satisfies Record<keyof AdminSiteSettings, SiteSettingDefinition>;

export const SITE_SETTING_KEYS = Object.keys(
  SITE_SETTING_DEFINITIONS
) as Array<keyof AdminSiteSettings>;

export function parseSettingValue(value: unknown, type: SettingType, fallback: SettingValue) {
  const raw =
    value && typeof value === "object" && "value" in value
      ? (value as { value?: unknown }).value
      : value;

  if (raw === null || raw === undefined) return fallback;

  if (type === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  if (type === "boolean") {
    if (typeof raw === "boolean") return raw;
    if (raw === "true") return true;
    if (raw === "false") return false;
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

export function parseSettings(
  values: Partial<Record<keyof AdminSiteSettings, unknown>>,
  includePrivate = true
) {
  const parsed: Record<string, SettingValue> = {};

  SITE_SETTING_KEYS.forEach((key) => {
    const definition = SITE_SETTING_DEFINITIONS[key];
    if (!includePrivate && !definition.isPublic) return;

    parsed[key] = parseSettingValue(
      values[key],
      definition.type,
      definition.defaultValue
    );
  });

  return parsed as AdminSiteSettings;
}

export const DEFAULT_PUBLIC_SETTINGS = parseSettings({}, false) as PublicSiteSettings;
export const DEFAULT_ADMIN_SETTINGS = parseSettings({}, true);
