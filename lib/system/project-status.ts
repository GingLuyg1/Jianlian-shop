import "server-only";

export type FeatureStatus =
  | "completed"
  | "partial"
  | "blocked"
  | "not_implemented"
  | "not_configured"
  | "cancelled";

export type Priority = "P0" | "P1" | "P2" | "P3";

export type FeatureMatrixRow = {
  module: string;
  status: FeatureStatus;
  pages: string[];
  apis: string[];
  services: string[];
  tables: string[];
  evidence: string;
  blocker?: string;
};

export type GoLiveBlocker = {
  id: string;
  priority: Priority;
  issue: string;
  impact: string;
  relatedFiles: string[];
  needsMigration: boolean;
  status: "open" | "partial" | "resolved" | "unverified" | "cancelled";
};

export const FEATURE_MATRIX: FeatureMatrixRow[] = [
  {
    module: "Frontend home",
    status: "completed",
    pages: ["/"],
    apis: ["/api/settings/public", "/api/catalog/products"],
    services: ["lib/settings/client.ts", "lib/supabase/public-catalog.ts"],
    tables: ["products", "categories", "site_settings"],
    evidence: "Public home and catalog loaders exist; final result still depends on Supabase data and settings migration.",
  },
  {
    module: "Product categories",
    status: "completed",
    pages: ["/products/*", "/admin/categories"],
    apis: ["/api/admin/catalog/categories", "/api/catalog/products"],
    services: ["lib/catalog/category-tree.ts"],
    tables: ["categories", "products"],
    evidence: "Category browsing and admin category management routes exist.",
  },
  {
    module: "Product search",
    status: "partial",
    pages: ["/products/*"],
    apis: ["/api/catalog/products"],
    services: ["lib/supabase/public-catalog.ts"],
    tables: ["products", "categories"],
    evidence: "Catalog API supports filtering/searching, but large catalogs still need database-side search before production scale.",
  },
  {
    module: "Product detail",
    status: "partial",
    pages: ["/products/[id]"],
    apis: ["/api/catalog/products"],
    services: ["lib/supabase/public-catalog.ts"],
    tables: ["products", "product_skus"],
    evidence: "Single-product detail exists; real SKU option matrix is not fully rendered from database SKU tables.",
  },
  {
    module: "Single-SKU products",
    status: "completed",
    pages: ["/products/[id]", "/checkout"],
    apis: ["/api/orders"],
    services: ["lib/orders/order-queries.ts"],
    tables: ["products", "orders", "order_items"],
    evidence: "Legacy direct-purchase flow remains compatible without sku_id.",
  },
  {
    module: "Multi-SKU products",
    status: "blocked",
    pages: ["/products/[id]", "/admin/products"],
    apis: ["/api/orders"],
    services: ["lib/orders/order-queries.ts", "lib/delivery/delivery-service.ts"],
    tables: ["product_option_groups", "product_option_values", "product_skus", "product_sku_values", "order_items.sku_id"],
    evidence: "Migration and server compatibility exist, but admin SKU editor and frontend SKU selector are incomplete.",
    blocker: "Requires 20260629_multi_sku_core.sql execution plus UI/API completion for real SKU editing and selection.",
  },
  {
    module: "Direct purchase",
    status: "partial",
    pages: ["/checkout", "/payment", "/order-success"],
    apis: ["/api/orders", "/api/payments/*"],
    services: ["lib/payments/payment-session-service.ts"],
    tables: ["orders", "order_items", "payment_sessions"],
    evidence: "Order creation is implemented; real payment collection remains provider-blocked.",
    blocker: "Payment provider is unavailable, so users cannot complete true online payment.",
  },
  {
    module: "Order confirmation",
    status: "completed",
    pages: ["/checkout", "/order-success", "/my-orders"],
    apis: ["/api/orders", "/api/orders/[orderNo]"],
    services: ["lib/orders/order-queries.ts"],
    tables: ["orders", "order_items"],
    evidence: "Order create/list/detail APIs and pages exist.",
  },
  {
    module: "Cashier",
    status: "not_configured",
    pages: ["/payment"],
    apis: ["/api/payments/*"],
    services: ["lib/payments/providers.ts", "lib/payments/payment-session-service.ts"],
    tables: ["payment_channels", "payment_sessions", "payment_callback_logs"],
    evidence: "Provider interface exists, but all concrete providers currently throw PaymentProviderError.",
    blocker: "Cannot collect real money until a provider is configured and live-tested.",
  },
  {
    module: "Register and login",
    status: "completed",
    pages: ["/register", "/login", "/auth/callback"],
    apis: ["/api/account/profile"],
    services: ["lib/supabase/server.ts", "components/auth/AuthScreen.tsx"],
    tables: ["profiles"],
    evidence: "Supabase auth screens and callback route exist.",
  },
  {
    module: "Password recovery",
    status: "completed",
    pages: ["/forgot-password", "/reset-password"],
    apis: [],
    services: ["components/auth/AuthScreen.tsx"],
    tables: ["auth.users"],
    evidence: "Password reset pages exist and use Supabase auth.",
  },
  {
    module: "User center",
    status: "completed",
    pages: ["/account", "/account/security", "/account/privacy"],
    apis: ["/api/account/profile", "/api/account/privacy"],
    services: ["lib/privacy/privacy-service.ts"],
    tables: ["profiles", "privacy_requests"],
    evidence: "Account profile, security and privacy pages exist; privacy requests need 20260630 migration.",
  },
  {
    module: "User orders",
    status: "completed",
    pages: ["/my-orders", "/order-tracking"],
    apis: ["/api/orders", "/api/orders/[orderNo]", "/api/orders/[orderNo]/fulfillment"],
    services: ["lib/orders/order-queries.ts"],
    tables: ["orders", "order_items", "order_deliveries"],
    evidence: "User order list, tracking and fulfillment APIs exist.",
  },
  {
    module: "Recharge",
    status: "partial",
    pages: ["/products/account-recharge", "/admin/recharges"],
    apis: ["/api/admin/recharges", "/api/payments/*"],
    services: ["lib/payments/recharge-utils.ts"],
    tables: ["account_recharges", "balance_transactions", "payment_sessions"],
    evidence: "Recharge records and admin view exist, but real provider settlement is not configured.",
  },
  {
    module: "Balance ledger",
    status: "partial",
    pages: ["/account"],
    apis: ["/api/account/balance-transactions"],
    services: ["lib/payments/recharge-utils.ts"],
    tables: ["balance_transactions", "profiles.balance"],
    evidence: "Ledger API exists; duplicate recharge/payment settlement still needs staging verification.",
  },
  {
    module: "Refunds",
    status: "partial",
    pages: ["/account/refunds", "/admin/refunds"],
    apis: ["/api/refunds", "/api/admin/refunds"],
    services: ["lib/refunds/refund-utils.ts"],
    tables: ["refund_requests", "refund_status_logs", "site_notifications"],
    evidence: "Refund request/admin routes exist; over-refund and permission tests remain manual P1 checks.",
  },
  {
    module: "Digital inventory",
    status: "partial",
    pages: ["/admin/inventory"],
    apis: ["/api/admin/inventory"],
    services: ["lib/inventory/import-service.ts"],
    tables: ["digital_inventory", "digital_inventory_batches"],
    evidence: "Inventory import/list APIs exist; SKU-aware import UI and migration execution still require verification.",
  },
  {
    module: "Automatic delivery",
    status: "partial",
    pages: ["/my-orders", "/admin/orders"],
    apis: ["/api/orders/[orderNo]/delivery", "/api/admin/orders/[orderId]/items/[itemId]/deliver"],
    services: ["lib/delivery/delivery-service.ts"],
    tables: ["order_deliveries", "digital_inventory"],
    evidence: "Delivery RPC integration exists; duplicate callback and SKU isolation tests remain unverified.",
  },
  {
    module: "Admin dashboard",
    status: "completed",
    pages: ["/admin"],
    apis: ["/api/admin/reports"],
    services: ["lib/reports/business-reports.ts"],
    tables: ["orders", "profiles", "payment_sessions"],
    evidence: "Admin shell and dashboard route exist.",
  },
  {
    module: "Product management",
    status: "partial",
    pages: ["/admin/products"],
    apis: ["/api/admin/catalog/products", "/api/admin/catalog/products/[productId]"],
    services: ["app/api/admin/catalog/products/_shared.ts"],
    tables: ["products", "categories", "media_assets"],
    evidence: "Product CRUD exists and update requires returned database row; browser close/reopen save behavior remains manual verification.",
  },
  {
    module: "Payment management",
    status: "not_configured",
    pages: ["/admin/payments", "/admin/recharges"],
    apis: ["/api/admin/payments", "/api/admin/payment-channels", "/api/admin/payments/reconciliations"],
    services: ["lib/payments/*"],
    tables: ["payment_channels", "payment_sessions", "payment_reconciliations"],
    evidence: "Admin payment console exists; provider adapters are unavailable placeholders.",
  },
  {
    module: "Reports",
    status: "partial",
    pages: ["/admin/reports"],
    apis: ["/api/admin/reports"],
    services: ["lib/reports/business-reports.ts"],
    tables: ["orders", "profiles", "payment_sessions"],
    evidence: "Report service exists; production accuracy depends on executed migrations and real settlement data.",
  },
  {
    module: "Support tickets",
    status: "cancelled",
    pages: [],
    apis: [],
    services: [],
    tables: ["support_tickets", "support_ticket_messages"],
    evidence: "Explicitly excluded from this scope.",
  },
  {
    module: "Shopping cart",
    status: "cancelled",
    pages: [],
    apis: [],
    services: [],
    tables: ["cart_items"],
    evidence: "Cart is explicitly out of current project scope; direct purchase remains active.",
  },
];

export const GO_LIVE_BLOCKERS: GoLiveBlocker[] = [
  {
    id: "P0-01",
    priority: "P0",
    issue: "Production Supabase migration execution is unverified",
    impact: "Missing tables/RPCs can break orders, payments, inventory, refunds and admin pages.",
    relatedFiles: ["supabase/migrations/*", "lib/system/database-contract.ts", "app/api/admin/system/database/route.ts"],
    needsMigration: true,
    status: "open",
  },
  {
    id: "P0-02",
    priority: "P0",
    issue: "Real payment provider is not connected",
    impact: "The site cannot collect real money.",
    relatedFiles: ["lib/payments/providers.ts", "lib/payments/payment-session-service.ts"],
    needsMigration: false,
    status: "open",
  },
  {
    id: "P0-03",
    priority: "P0",
    issue: "Multi-SKU purchase chain is incomplete",
    impact: "SKU product selection, SKU order snapshots and SKU inventory delivery cannot be treated as production-ready.",
    relatedFiles: ["supabase/migrations/20260629_multi_sku_core.sql", "app/api/orders/route.ts", "app/products/[id]/page.tsx"],
    needsMigration: true,
    status: "partial",
  },
  {
    id: "P0-04",
    priority: "P0",
    issue: "Product save requires final manual browser verification",
    impact: "If stale dirty-state prompts remain, admin edits may appear unsaved even after a successful database update.",
    relatedFiles: ["app/admin/products/page.tsx", "app/api/admin/catalog/products/[productId]/route.ts"],
    needsMigration: false,
    status: "unverified",
  },
  {
    id: "P1-01",
    priority: "P1",
    issue: "SKU-aware inventory import UI is incomplete",
    impact: "Digital inventory can be imported without reliable SKU assignment.",
    relatedFiles: ["app/api/admin/inventory/route.ts", "lib/inventory/import-service.ts"],
    needsMigration: true,
    status: "partial",
  },
  {
    id: "P1-02",
    priority: "P1",
    issue: "RLS and cross-user isolation need real account tests",
    impact: "A Supabase policy mismatch could expose other users' orders, payments, refunds or inventory delivery records.",
    relatedFiles: ["supabase/migrations/*", "app/api/account/*", "app/api/admin/*"],
    needsMigration: true,
    status: "unverified",
  },
];

export function summarizeFeatureStatus() {
  return FEATURE_MATRIX.reduce<Record<FeatureStatus, number>>(
    (summary, item) => {
      summary[item.status] += 1;
      return summary;
    },
    {
      completed: 0,
      partial: 0,
      blocked: 0,
      not_implemented: 0,
      not_configured: 0,
      cancelled: 0,
    }
  );
}

export function getCurrentCompletionLabel() {
  const summary = summarizeFeatureStatus();
  return `${summary.completed}/${FEATURE_MATRIX.length} completed; ${summary.partial} partial; ${summary.blocked} blocked; ${summary.not_configured} not configured; ${summary.cancelled} cancelled`;
}
