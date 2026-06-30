import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { getReleaseInfo } from "@/lib/system/release-info";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type ProbeStatus = "ok" | "warning" | "blocked" | "not_configured";

export async function GET() {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;

  const release = getReleaseInfo();
  const database = await probeDatabase();

  return NextResponse.json(
    {
      status: database.status === "blocked" ? "blocked" : database.status === "ok" ? "ok" : "warning",
      version: {
        application_version: release.release,
        commit_sha: release.commit,
        short_commit_sha: shortSha(release.commit),
        branch: process.env.GIT_BRANCH ?? process.env.VERCEL_GIT_COMMIT_REF ?? "unknown",
        build_time: release.buildTime,
        environment: release.environment,
      },
      database,
      checked_at: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

async function probeDatabase(): Promise<{
  status: ProbeStatus;
  database_reachable: boolean;
  database_schema_status: string;
  message: string;
}> {
  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return {
      status: "not_configured",
      database_reachable: false,
      database_schema_status: "unknown",
      message: "Service role is not configured; schema cannot be fully checked.",
    };
  }

  try {
    const { error } = await service.from("profiles").select("id", { head: true, count: "exact" }).limit(1);
    if (error) {
      return {
        status: "blocked",
        database_reachable: false,
        database_schema_status: "unknown",
        message: "Database reachability check failed.",
      };
    }
    return {
      status: "ok",
      database_reachable: true,
      database_schema_status: "reachable",
      message: "Database is reachable. Use /api/admin/system/database for full schema details.",
    };
  } catch {
    return {
      status: "blocked",
      database_reachable: false,
      database_schema_status: "unknown",
      message: "Database reachability check failed.",
    };
  }
}

function shortSha(value: string) {
  return value && value !== "unknown" ? value.slice(0, 12) : "unknown";
}
