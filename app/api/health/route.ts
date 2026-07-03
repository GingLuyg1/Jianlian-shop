import { NextResponse } from "next/server";

import { getRequestIdFromRequest, withRequestIdHeader } from "@/lib/monitoring/request-id";
import { getReleaseInfo } from "@/lib/system/release-info";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestIdFromRequest(request, "health");
  const release = getReleaseInfo("ok");
  return withRequestIdHeader(
    NextResponse.json(
      {
        status: "ok",
        environment: release.environment,
        commit_sha: release.shortCommit,
        application_version: release.release,
        build_time: release.buildTime,
        checked_at: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    ),
    requestId
  );
}
