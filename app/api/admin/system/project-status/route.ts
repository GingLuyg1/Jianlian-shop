import { NextResponse } from "next/server";

import { requireApiSuperAdmin } from "@/lib/admin/api-auth";
import { getAuditErrorMessage, writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { EXPECTED_MIGRATIONS } from "@/lib/system/database-contract";
import {
  FEATURE_MATRIX,
  GO_LIVE_BLOCKERS,
  getCurrentCompletionLabel,
  summarizeFeatureStatus,
} from "@/lib/system/project-status";
import { getReleaseInfo } from "@/lib/system/release-info";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type MigrationHistoryRow = {
  migration_name?: string | null;
  status?: string | null;
  applied_at?: string | null;
  environment?: string | null;
};

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export async function GET(request: Request) {
  const admin = await requireApiSuperAdmin();
  if (!admin.ok) return admin.response;

  
  const checkedAt = new Date().toISOString();
  const supabase = getSupabaseServiceRoleClient() ?? admin.supabase;
  const migrationHistory = await loadMigrationHistory(supabase);
  const schema = await loadSchemaCheck(admin.supabase);
  const appliedNames = new Set(
    migrationHistory.rows
      .filter((row) => row.status === "success")
      .map((row) => row.migration_name)
      .filter(Boolean) as string[]
  );
  const pendingMigrations = EXPECTED_MIGRATIONS.filter((migration) => !appliedNames.has(migration.name));
  const p0 = GO_LIVE_BLOCKERS.filter((item) => item.priority === "P0" && item.status !== "resolved");
  const p1 = GO_LIVE_BLOCKERS.filter((item) => item.priority === "P1" && item.status !== "resolved");

  await writeAdminAuditLog({
    request,
    admin: { id: admin.user.id, email: admin.user.email },
    action: "project_status_check",
    module: "system",
    targetType: "project_status",
    result: schema.ok ? "success" : "failed",
    errorMessage: schema.ok ? null : schema.error,
    metadata: {
      checkedAt,
      pendingMigrationCount: pendingMigrations.length,
      p0Count: p0.length,
      p1Count: p1.length,
    },
  });

  return json({
    ok: schema.ok && p0.length === 0,
    checkedAt,
    release: getReleaseInfo(migrationHistory.rows[0]?.migration_name ?? "unregistered"),
    schema,
    migrations: {
      expected: EXPECTED_MIGRATIONS,
      historyReady: migrationHistory.ready,
      historyError: migrationHistory.error,
      rows: migrationHistory.rows,
      pending: pendingMigrations,
      failed: migrationHistory.rows.filter((row) => row.status === "failed"),
    },
    features: {
      summary: summarizeFeatureStatus(),
      completion: getCurrentCompletionLabel(),
      rows: FEATURE_MATRIX,
    },
    providers: {
      status: "not_configured",
      message: "Provider adapters are placeholders and cannot collect real money.",
    },
    blockers: {
      p0,
      p1,
      all: GO_LIVE_BLOCKERS,
    },
  });
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
    error: getAuditErrorMessage(error, "Migration history is not readable. Treat every migration as pending confirmation."),
  };
}

async function loadSchemaCheck(supabase: any) {
  const { data, error } = await supabase.rpc("app_check_database_structure");
  if (!error) {
    const payload = normalizeSchemaPayload(data);
    const issueCount =
      payload.missing_tables.length +
      payload.missing_columns.length +
      payload.missing_functions.length +
      payload.missing_constraints.length;
    return { ok: issueCount === 0, source: "rpc" as const, data: payload, error: null as string | null };
  }

  return {
    ok: false,
    source: "rpc" as const,
    data: normalizeSchemaPayload(null),
    error: getAuditErrorMessage(error, "Database structure check RPC is not available. Execute the schema-check migration manually."),
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
    summary: payload.summary ?? {},
  };
}
