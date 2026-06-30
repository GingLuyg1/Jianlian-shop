import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { getAuditErrorMessage, writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import {
  CODE_FIELD_CONSISTENCY_NOTES,
  EXPECTED_MIGRATIONS,
  KEY_SCHEMA_OBJECTS,
} from "@/lib/system/database-contract";
import { getReleaseInfo } from "@/lib/system/release-info";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type MigrationHistoryRow = {
  migration_name?: string | null;
  status?: string | null;
  applied_at?: string | null;
  environment?: string | null;
};

const FALLBACK_TABLES = [
  "profiles",
  "categories",
  "products",
  "orders",
  "order_items",
  "account_recharges",
  "payment_channels",
  "payment_sessions",
  "balance_transactions",
  "digital_inventory",
  "admin_audit_logs",
];

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function normalizeError(error: unknown, fallback = "数据库结构检查失败，请稍后重试。") {
  return getAuditErrorMessage(error, fallback);
}

export async function GET(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;

  const serviceClient = getSupabaseServiceRoleClient();
  const supabase = serviceClient ?? admin.supabase;
  const checkedAt = new Date().toISOString();

  try {
    const migrationHistory = await loadMigrationHistory(supabase);
    const schemaCheck = await loadSchemaCheck(admin.supabase, supabase);
    const latestMigration = getLatestMigration(migrationHistory.rows);
    const appliedNames = new Set(
      migrationHistory.rows
        .filter((row) => row.status === "success")
        .map((row) => row.migration_name)
        .filter(Boolean) as string[]
    );
    const pendingMigrations = EXPECTED_MIGRATIONS.filter((migration) => !appliedNames.has(migration.name));
    const failedMigrations = migrationHistory.rows.filter((row) => row.status === "failed");
    const release = getReleaseInfo(latestMigration?.migration_name ?? "unregistered");

    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "database_schema_check",
      module: "system",
      targetType: "database",
      result: schemaCheck.ok ? "success" : "failed",
      errorMessage: schemaCheck.ok ? null : schemaCheck.error,
      metadata: {
        checkedAt,
        fallback: schemaCheck.source === "fallback",
        missingTables: schemaCheck.data?.missing_tables?.length ?? null,
        missingColumns: schemaCheck.data?.missing_columns?.length ?? null,
      },
    });

    return json({
      ok: schemaCheck.ok,
      checkedAt,
      source: schemaCheck.source,
      release,
      expectedMigrations: EXPECTED_MIGRATIONS,
      migrationHistory: {
        ready: migrationHistory.ready,
        rows: migrationHistory.rows,
        error: migrationHistory.error,
      },
      latestMigration,
      pendingMigrations,
      failedMigrations,
      schema: schemaCheck.data,
      schemaError: schemaCheck.error,
      keyObjects: KEY_SCHEMA_OBJECTS,
      codeFieldConsistency: CODE_FIELD_CONSISTENCY_NOTES,
    });
  } catch (error) {
    console.error("[Admin Database Status] check failed", error);
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "database_schema_check",
      module: "system",
      targetType: "database",
      result: "failed",
      errorMessage: error,
    });
    return json({ ok: false, error: normalizeError(error) }, { status: 500 });
  }
}

async function loadMigrationHistory(supabase: any) {
  const { data, error } = await supabase
    .from("app_migration_history")
    .select("migration_name,status,applied_at,environment")
    .order("applied_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (!error) {
    return { ready: true, rows: (data ?? []) as MigrationHistoryRow[], error: null as string | null };
  }

  return {
    ready: false,
    rows: [] as MigrationHistoryRow[],
    error: isMissingSchemaError(error)
      ? "app_migration_history 尚未初始化，请先手动执行数据库结构检查 migration。"
      : normalizeError(error, "迁移登记读取失败。"),
  };
}

async function loadSchemaCheck(userSupabase: any, fallbackSupabase: any) {
  const rpcResult = await userSupabase.rpc("app_check_database_structure");
  if (!rpcResult.error) {
    return { ok: true, source: "rpc" as const, data: normalizeSchemaPayload(rpcResult.data), error: null as string | null };
  }

  if (!isMissingSchemaError(rpcResult.error)) {
    return {
      ok: false,
      source: "rpc" as const,
      data: null,
      error: normalizeError(rpcResult.error, "数据库结构检查函数执行失败。"),
    };
  }

  const missingTables: string[] = [];
  for (const table of FALLBACK_TABLES) {
    const { error } = await fallbackSupabase.from(table).select("id").limit(1);
    if (error) missingTables.push(table);
  }

  return {
    ok: missingTables.length === 0,
    source: "fallback" as const,
    data: {
      checked_at: new Date().toISOString(),
      missing_tables: missingTables,
      missing_columns: [],
      missing_functions: ["app_check_database_structure"],
      missing_constraints: [],
      latest_migration: null,
      summary: {
        required_tables: FALLBACK_TABLES.length,
        missing_table_count: missingTables.length,
        missing_column_count: 0,
        missing_function_count: 1,
        missing_constraint_count: 0,
      },
    },
    error:
      missingTables.length > 0
        ? "数据库结构检查 migration 尚未执行，且部分关键表探测失败。"
        : "数据库结构检查 migration 尚未执行，目前使用降级表探测结果。",
  };
}

function normalizeSchemaPayload(data: unknown) {
  const payload = (data && typeof data === "object" ? data : {}) as Record<string, any>;
  return {
    checked_at: payload.checked_at ?? null,
    missing_tables: Array.isArray(payload.missing_tables) ? payload.missing_tables : [],
    missing_columns: Array.isArray(payload.missing_columns) ? payload.missing_columns : [],
    missing_functions: Array.isArray(payload.missing_functions) ? payload.missing_functions : [],
    missing_constraints: Array.isArray(payload.missing_constraints) ? payload.missing_constraints : [],
    latest_migration: payload.latest_migration ?? null,
    summary: payload.summary ?? {},
  };
}

function getLatestMigration(rows: MigrationHistoryRow[]) {
  return rows.find((row) => row.status === "success") ?? null;
}

function isMissingSchemaError(error: unknown) {
  const message = normalizeError(error, "");
  return /PGRST202|PGRST205|42P01|404|schema cache|Could not find|app_migration_history|app_check_database_structure/i.test(
    message
  );
}
