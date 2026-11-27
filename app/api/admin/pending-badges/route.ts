import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getAdminTicketCountsFast } from "@/lib/tickets/server";

export const dynamic = "force-dynamic";

async function safeHeadCount(
  queryPromise: PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>
): Promise<number> {
  try {
    const { count, error } = await queryPromise;
    if (error) return 0;
    return Number(count ?? 0);
  } catch {
    return 0;
  }
}

export async function GET() {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;

  const service = getSupabaseServiceRoleClient() ?? admin.supabase;

  const [ticketsResult, apiApplications, privacyRequests, refunds] = await Promise.all([
    getAdminTicketCountsFast().catch(() => ({ total: 0, processing: 0, completed: 0, flagged: 0, unread: 0 })),
    safeHeadCount(
      service
        .from("agent_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
    ),
    safeHeadCount(
      service
        .from("privacy_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["requested", "verifying", "blocked", "approved", "processing"])
    ),
    safeHeadCount(
      service
        .from("refund_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "reviewing", "approved", "processing"])
    ),
  ]);

  const tickets = Number(ticketsResult?.processing ?? 0);

  return NextResponse.json(
    {
      tickets,
      refunds,
      apiApplications,
      privacyRequests,
      groups: {
        trade: tickets + refunds,
        users: apiApplications + privacyRequests,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
