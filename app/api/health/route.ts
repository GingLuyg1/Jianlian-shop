import { NextResponse } from "next/server";

import { getReleaseInfo } from "@/lib/system/release-info";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DatabaseProbe = {
  database_reachable: boolean;
  database_schema_status: "reachable" | "not_configured" | "unreachable" | "unknown";
};

export async function GET() {
  const release = getReleaseInfo();
  const database = await probeDatabase();
  const healthy = database.database_schema_status === "reachable";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      environment: release.environment,
      version: release.shortCommit,
      application_version: release.release,
      build_time: release.buildTime,
      database_reachable: database.database_reachable,
      database_schema_status: database.database_schema_status,
      checked_at: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 200,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

async function probeDatabase(): Promise<DatabaseProbe> {
  if (!hasSupabaseServerConfig()) {
    return {
      database_reachable: false,
      database_schema_status: "not_configured",
    };
  }

  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return {
      database_reachable: false,
      database_schema_status: "unknown",
    };
  }

  try {
    const { error } = await service.from("profiles").select("id", { head: true, count: "exact" }).limit(1);
    return {
      database_reachable: !error,
      database_schema_status: error ? "unreachable" : "reachable",
    };
  } catch {
    return {
      database_reachable: false,
      database_schema_status: "unreachable",
    };
  }
}
