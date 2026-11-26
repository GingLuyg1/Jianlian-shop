import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { businessTypeLabel, directionLabel } from "@/lib/admin/display-labels";
import { isLikelyBusinessNo, isUuid, normalizeBusinessKeyword } from "@/lib/business/business-ids";
import { sanitizePostgrestFilterTerm } from "@/lib/security/postgrest-sanitize";

export type GlobalSearchGroup =
  | "orders"
  | "payments"
  | "recharges"
  | "refunds"
  | "balance"
  | "products"
  | "users"
  | "inventory";

export type GlobalSearchResult = {
  id: string;
  group: GlobalSearchGroup;
  typeLabel: string;
  businessNo: string;
  title: string;
  subtitle: string | null;
  userLabel: string | null;
  amountLabel: string | null;
  status: string | null;
  createdAt: string | null;
  href: string;
  exact: boolean;
};

export type GlobalSearchResponse = {
  keyword: string;
  groups: Array<{ group: GlobalSearchGroup; label: string; results: GlobalSearchResult[]; error?: string }>;
  total: number;
};

export type GlobalSearchOptions = {
  isSuperAdmin?: boolean;
};

const GROUP_LABELS: Record<GlobalSearchGroup, string> = {
  orders: "订单",
  payments: "支付",
  recharges: "充值",
  refunds: "退款",
  balance: "余额流水",
  products: "商品与商品规格",
  users: "用户",
  inventory: "库存批次",
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function money(amount: unknown, currency: unknown = "CNY") {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return null;
  const symbol = String(currency || "CNY") === "CNY" ? "¥" : String(currency || "");
  return `${symbol}${n.toFixed(2)}`;
}

function emailLabel(value: unknown) {
  const email = text(value);
  if (!email) return null;
  const [name, domain] = email.split("@");
  if (!domain) return email.length > 8 ? `${email.slice(0, 4)}***${email.slice(-3)}` : email;
  return `${name.slice(0, 3)}***@${domain}`;
}

async function safeQuery<T>(fn: () => any): Promise<{ rows: T[]; error?: string }> {
  try {
    const { data, error } = await fn();
    if (error) return { rows: [] as T[], error: "读取失败" };
    return { rows: data ?? [] };
  } catch {
    return { rows: [] as T[], error: "读取失败" };
  }
}

function sortResults(results: GlobalSearchResult[]) {
  return results.sort((a, b) => Number(b.exact) - Number(a.exact) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function runAdminGlobalSearch(
  supabase: SupabaseClient,
  rawKeyword: string,
  options: GlobalSearchOptions = {}
): Promise<GlobalSearchResponse> {
  const keyword = normalizeBusinessKeyword(rawKeyword);
  if (keyword.length < 2) return { keyword, groups: [], total: 0 };

  const q = sanitizePostgrestFilterTerm(keyword, 80);
  if (!q) return { keyword, groups: [], total: 0 };

  const like = `%${q}%`;
  const exactCandidate = isLikelyBusinessNo(keyword) ? keyword.toLowerCase() : "";
  const isSuperAdmin = options.isSuperAdmin !== false;

  const userQuery = isUuid(keyword)
    ? `email.ilike.${like},display_name.ilike.${like},id.eq.${keyword}`
    : `email.ilike.${like},display_name.ilike.${like}`;

  const [
    orderRows,
    sessionRows,
    paymentRows,
    rechargeRows,
    refundRows,
    balanceRows,
    productRows,
    skuRows,
    userRows,
    batchRows,
  ] = await Promise.all([
    safeQuery<Record<string, unknown>>(() =>
      supabase
        .from("orders")
        .select("id,order_no,customer_email,total_amount,currency,status,payment_status,created_at")
        .or(`order_no.ilike.${like},customer_email.ilike.${like}`)
        .order("created_at", { ascending: false })
        .limit(8)
    ),
    safeQuery<Record<string, unknown>>(() =>
      supabase
        .from("payment_sessions")
        .select("id,session_no,business_type,business_no,provider_order_no,provider_transaction_id,user_id,status,payable_amount,currency,created_at")
        .or(`session_no.ilike.${like},business_no.ilike.${like},provider_order_no.ilike.${like},provider_transaction_id.ilike.${like}`)
        .order("created_at", { ascending: false })
        .limit(8)
    ),
    safeQuery<Record<string, unknown>>(() =>
      supabase
        .from("order_payments")
        .select("id,payment_no,order_id,user_id,status,amount,currency,provider_trade_no,created_at,paid_at")
        .or(`payment_no.ilike.${like},provider_trade_no.ilike.${like}`)
        .order("created_at", { ascending: false })
        .limit(8)
    ),
    safeQuery<Record<string, unknown>>(() =>
      supabase
        .from("account_recharges")
        .select("id,recharge_no,user_email,user_id,channel_name,channel_code,status,amount,payable_amount,currency,provider_trade_no,created_at,paid_at")
        .or(`recharge_no.ilike.${like},user_email.ilike.${like},provider_trade_no.ilike.${like}`)
        .order("created_at", { ascending: false })
        .limit(8)
    ),
    isSuperAdmin
      ? safeQuery<Record<string, unknown>>(() =>
          supabase
            .from("refund_requests")
            .select("id,refund_no,order_id,user_id,requested_amount,approved_amount,currency,status,reason_code,created_at,completed_at")
            .or(`refund_no.ilike.${like},reason_code.ilike.${like}`)
            .order("created_at", { ascending: false })
            .limit(8)
        )
      : Promise.resolve({ rows: [] as Record<string, unknown>[], error: undefined as string | undefined }),
    isSuperAdmin
      ? safeQuery<Record<string, unknown>>(() =>
          supabase
            .from("balance_transactions")
            .select("id,transaction_no,user_id,business_type,business_id,direction,amount,currency,status,created_at")
            .or(`transaction_no.ilike.${like},business_id.ilike.${like}`)
            .order("created_at", { ascending: false })
            .limit(8)
        )
      : Promise.resolve({ rows: [] as Record<string, unknown>[], error: undefined as string | undefined }),
    safeQuery<Record<string, unknown>>(() =>
      supabase
        .from("products")
        .select("id,name,slug,status,price,currency,created_at")
        .or(`name.ilike.${like},slug.ilike.${like}`)
        .order("updated_at", { ascending: false })
        .limit(8)
    ),
    safeQuery<Record<string, unknown>>(() =>
      supabase
        .from("product_skus")
        .select("id,product_id,sku_code,sku_title,price,stock,status,created_at")
        .or(`sku_code.ilike.${like},sku_title.ilike.${like}`)
        .order("created_at", { ascending: false })
        .limit(8)
    ),
    isSuperAdmin
      ? safeQuery<Record<string, unknown>>(() =>
          supabase
            .from("profiles")
            .select("id,email,display_name,role,account_status,risk_status,created_at")
            .or(userQuery)
            .order("created_at", { ascending: false })
            .limit(8)
        )
      : Promise.resolve({ rows: [] as Record<string, unknown>[], error: undefined as string | undefined }),
    safeQuery<Record<string, unknown>>(() =>
      supabase
        .from("digital_inventory_batches")
        .select("id,batch_no,batch_name,import_status,total_count,available_count,created_at")
        .or(`batch_no.ilike.${like},batch_name.ilike.${like}`)
        .order("created_at", { ascending: false })
        .limit(8)
    ),
  ]);

  const groups: GlobalSearchResponse["groups"] = [
    {
      group: "orders",
      label: GROUP_LABELS.orders,
      error: orderRows.error,
      results: sortResults(
        orderRows.rows.map((row) => {
          const no = text(row.order_no) ?? String(row.id ?? "");
          return {
            id: String(row.id),
            group: "orders" as const,
            typeLabel: "订单",
            businessNo: no,
            title: `订单 ${no}`,
            subtitle: `订单状态 ${text(row.status) ?? "—"} / 支付 ${text(row.payment_status) ?? "—"}`,
            userLabel: emailLabel(row.customer_email),
            amountLabel: money(row.total_amount, row.currency),
            status: text(row.status),
            createdAt: text(row.created_at),
            href: `/admin/orders?search=${encodeURIComponent(no)}`,
            exact: exactCandidate ? no.toLowerCase() === exactCandidate : false,
          };
        })
      ),
    },
    {
      group: "payments",
      label: GROUP_LABELS.payments,
      error: sessionRows.error || paymentRows.error,
      results: sortResults([
        ...sessionRows.rows.map((row) => {
          const no = text(row.session_no) ?? text(row.provider_order_no) ?? String(row.id ?? "");
          return {
            id: `session-${String(row.id)}`,
            group: "payments" as const,
            typeLabel: "支付会话",
            businessNo: no,
            title: `${businessTypeLabel(row.business_type)} ${no}`,
            subtitle: text(row.provider_transaction_id) ? `渠道单号：${text(row.provider_transaction_id)}` : text(row.business_no),
            userLabel: text(row.user_id),
            amountLabel: money(row.payable_amount, row.currency),
            status: text(row.status),
            createdAt: text(row.created_at),
            href: `/admin/payments?search=${encodeURIComponent(text(row.business_no) ?? no)}`,
            exact: exactCandidate ? [row.session_no, row.provider_order_no, row.provider_transaction_id].some((v) => text(v)?.toLowerCase() === exactCandidate) : false,
          };
        }),
        ...paymentRows.rows.map((row) => {
          const no = text(row.payment_no) ?? text(row.provider_trade_no) ?? String(row.id ?? "");
          return {
            id: `payment-${String(row.id)}`,
            group: "payments" as const,
            typeLabel: "支付记录",
            businessNo: no,
            title: `支付 ${no}`,
            subtitle: text(row.provider_trade_no),
            userLabel: text(row.user_id),
            amountLabel: money(row.amount, row.currency),
            status: text(row.status),
            createdAt: text(row.paid_at) ?? text(row.created_at),
            href: `/admin/payments?search=${encodeURIComponent(no)}`,
            exact: exactCandidate ? [row.payment_no, row.provider_trade_no].some((v) => text(v)?.toLowerCase() === exactCandidate) : false,
          };
        }),
      ]).slice(0, 10),
    },
    {
      group: "recharges",
      label: GROUP_LABELS.recharges,
      error: rechargeRows.error,
      results: sortResults(
        rechargeRows.rows.map((row) => {
          const no = text(row.recharge_no) ?? String(row.id ?? "");
          return {
            id: String(row.id),
            group: "recharges" as const,
            typeLabel: "充值",
            businessNo: no,
            title: `充值 ${no}`,
            subtitle: text(row.channel_name) ?? text(row.channel_code),
            userLabel: emailLabel(row.user_email) ?? text(row.user_id),
            amountLabel: money(row.payable_amount ?? row.amount, row.currency),
            status: text(row.status),
            createdAt: text(row.paid_at) ?? text(row.created_at),
            href: `/admin/recharges?search=${encodeURIComponent(no)}`,
            exact: exactCandidate ? [row.recharge_no, row.provider_trade_no].some((v) => text(v)?.toLowerCase() === exactCandidate) : false,
          };
        })
      ),
    },
    ...(isSuperAdmin
      ? [
          {
            group: "refunds" as const,
            label: GROUP_LABELS.refunds,
            error: refundRows.error,
            results: sortResults(
              refundRows.rows.map((row) => {
                const no = text(row.refund_no) ?? String(row.id ?? "");
                return {
                  id: String(row.id),
                  group: "refunds" as const,
                  typeLabel: "退款",
                  businessNo: no,
                  title: `退款 ${no}`,
                  subtitle: text(row.reason_code),
                  userLabel: text(row.user_id),
                  amountLabel: money(row.approved_amount ?? row.requested_amount, row.currency),
                  status: text(row.status),
                  createdAt: text(row.completed_at) ?? text(row.created_at),
                  href: `/admin/refunds?search=${encodeURIComponent(no)}`,
                  exact: exactCandidate ? no.toLowerCase() === exactCandidate : false,
                };
              })
            ),
          },
          {
            group: "balance" as const,
            label: GROUP_LABELS.balance,
            error: balanceRows.error,
            results: sortResults(
              balanceRows.rows.map((row) => {
                const no = text(row.transaction_no) ?? String(row.id ?? "");
                return {
                  id: String(row.id),
                  group: "balance" as const,
                  typeLabel: "余额流水",
                  businessNo: no,
                  title: `${directionLabel(row.direction)} ${no}`,
                  subtitle: businessTypeLabel(row.business_type),
                  userLabel: text(row.user_id),
                  amountLabel: money(row.amount, row.currency),
                  status: text(row.status),
                  createdAt: text(row.created_at),
                  href: `/admin/balance-ledger?q=${encodeURIComponent(no)}`,
                  exact: exactCandidate ? no.toLowerCase() === exactCandidate : false,
                };
              })
            ),
          },
        ]
      : []),
    {
      group: "products",
      label: GROUP_LABELS.products,
      error: productRows.error || skuRows.error,
      results: sortResults([
        ...productRows.rows.map((row) => ({
          id: String(row.id),
          group: "products" as const,
          typeLabel: "商品",
          businessNo: text(row.slug) ?? String(row.id),
          title: text(row.name) ?? "未命名商品",
          subtitle: text(row.slug),
          userLabel: null,
          amountLabel: money(row.price, row.currency),
          status: text(row.status),
          createdAt: text(row.created_at),
          href: `/admin/products?search=${encodeURIComponent(text(row.name) ?? text(row.slug) ?? String(row.id))}`,
          exact: false,
        })),
        ...skuRows.rows.map((row) => {
          const no = text(row.sku_code) ?? String(row.id);
          return {
            id: `sku-${String(row.id)}`,
            group: "products" as const,
            typeLabel: "商品规格",
            businessNo: no,
            title: text(row.sku_title) ?? no,
            subtitle: `库存 ${Number(row.stock ?? 0)}`,
            userLabel: null,
            amountLabel: money(row.price),
            status: text(row.status),
            createdAt: text(row.created_at),
            href: `/admin/products?search=${encodeURIComponent(no)}`,
            exact: exactCandidate ? no.toLowerCase() === exactCandidate : false,
          };
        }),
      ]).slice(0, 10),
    },
    ...(isSuperAdmin
      ? [
          {
            group: "users" as const,
            label: GROUP_LABELS.users,
            error: userRows.error,
            results: sortResults(
              userRows.rows.map((row) => {
                const userId = String(row.id);
                const email = text(row.email) ?? userId;
                return {
                  id: userId,
                  group: "users" as const,
                  typeLabel: "用户",
                  businessNo: emailLabel(email) ?? userId,
                  title: text(row.display_name) ?? emailLabel(email) ?? "用户",
                  subtitle: text(row.account_status) ?? text(row.role),
                  userLabel: emailLabel(email),
                  amountLabel: null,
                  status: text(row.risk_status),
                  createdAt: text(row.created_at),
                  href: `/admin/users/${encodeURIComponent(userId)}`,
                  exact: keyword.includes("@") ? email.toLowerCase() === keyword.toLowerCase() : userId === keyword,
                };
              })
            ),
          },
        ]
      : []),
    {
      group: "inventory",
      label: GROUP_LABELS.inventory,
      error: batchRows.error,
      results: sortResults(
        batchRows.rows.map((row) => {
          const no = text(row.batch_no) ?? String(row.id);
          return {
            id: String(row.id),
            group: "inventory" as const,
            typeLabel: "库存批次",
            businessNo: no,
            title: text(row.batch_name) ?? no,
            subtitle: `可用 ${Number(row.available_count ?? 0)} / 总计 ${Number(row.total_count ?? 0)}`,
            userLabel: null,
            amountLabel: null,
            status: text(row.import_status),
            createdAt: text(row.created_at),
            href: `/admin/inventory?batch=${encodeURIComponent(no)}`,
            exact: exactCandidate ? no.toLowerCase() === exactCandidate : false,
          };
        })
      ),
    },
  ];

  const nonEmptyGroups = groups.map((group) => ({ ...group, results: group.results.slice(0, 10) }));
  return { keyword, groups: nonEmptyGroups, total: nonEmptyGroups.reduce((sum, group) => sum + group.results.length, 0) };
}
