export type ExpectedMigration = {
  name: string;
  area: string;
  order: number;
  status: "active" | "superseded" | "compatibility";
  notes?: string;
};

export const EXPECTED_MIGRATIONS: ExpectedMigration[] = [
  { order: 10, name: "20260620_referral_system.sql", area: "referrals", status: "active" },
  { order: 20, name: "20260620_digital_inventory_delivery.sql", area: "inventory", status: "superseded", notes: "Core inventory delivery functions are hardened by 20260622_digital_delivery_hardening.sql." },
  { order: 30, name: "20260620_order_payments.sql", area: "orders/payments", status: "active" },
  { order: 40, name: "20260620_site_settings.sql", area: "settings", status: "active" },
  { order: 50, name: "20260622_fix_referral_signup_and_short_links.sql", area: "referrals", status: "active" },
  { order: 60, name: "20260622_recharge_records.sql", area: "recharges", status: "superseded", notes: "Extended by payment console and payment linkage migrations." },
  { order: 70, name: "20260622_super_admin_payment_console.sql", area: "payments", status: "active" },
  { order: 80, name: "20260622_digital_delivery_hardening.sql", area: "inventory", status: "active" },
  { order: 90, name: "20260623_admin_audit_logs.sql", area: "audit", status: "active" },
  { order: 100, name: "20260623_payment_provider_core.sql", area: "payments", status: "active" },
  { order: 110, name: "20260623_payment_core_linkage.sql", area: "payments", status: "active" },
  { order: 120, name: "20260623_payment_balance_transactions_compatibility.sql", area: "payments/balance", status: "compatibility" },
  { order: 130, name: "20260623_payment_reconciliation_system.sql", area: "payments/reconciliation", status: "active" },
  { order: 140, name: "20260623_mixed_order_item_fulfillment.sql", area: "orders/fulfillment", status: "active" },
  { order: 150, name: "20260623_digital_inventory_batches.sql", area: "inventory", status: "active" },
  { order: 160, name: "20260624_admin_visit_analytics.sql", area: "analytics", status: "active" },
  { order: 170, name: "20260629_payment_reconciliation_runs_logs.sql", area: "payments/reconciliation", status: "active" },
  { order: 180, name: "20260629_account_recharge_client_request_id.sql", area: "recharges", status: "compatibility" },
  { order: 190, name: "20260629_multi_sku_core.sql", area: "catalog/sku", status: "active" },
  { order: 200, name: "20260629_direct_purchase_order_idempotency.sql", area: "orders", status: "active" },
  { order: 210, name: "20260629_admin_user_controls.sql", area: "users", status: "active" },
  { order: 220, name: "20260629_system_error_events.sql", area: "monitoring", status: "active" },
  { order: 230, name: "20260629_refund_after_sales.sql", area: "refunds", status: "active" },
  { order: 240, name: "20260629_app_migration_history_and_schema_check.sql", area: "release/schema", status: "active" },
];

export const KEY_SCHEMA_OBJECTS = {
  tables: [
    "profiles",
    "categories",
    "products",
    "product_skus",
    "orders",
    "order_items",
    "order_deliveries",
    "account_recharges",
    "payment_channels",
    "payment_sessions",
    "payment_callback_logs",
    "balance_transactions",
    "digital_inventory",
    "digital_inventory_batches",
    "admin_audit_logs",
    "app_migration_history",
  ],
  functions: [
    "handle_new_user",
    "release_order_inventory",
    "reserve_order_inventory",
    "deliver_order_inventory",
    "app_check_database_structure",
  ],
};

export const CODE_FIELD_CONSISTENCY_NOTES = [
  "products.status is the canonical product availability field; do not reintroduce products.is_active.",
  "products.category_id remains the product category reference. Legacy subcategory_id must not be used in new code.",
  "product_skus.sku_id usage is represented as product_skus.id and order_items.sku_id for order snapshots.",
  "account_recharges.recharge_no and payment_sessions.session_no are the user-facing identifiers.",
  "balance_transactions.balance_before and balance_transactions.balance_after are required for auditable balance changes.",
  "digital_inventory.content_hash is required for deduplication; raw content must not be exposed to browser list APIs.",
];
