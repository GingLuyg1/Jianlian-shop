import { NextResponse } from "next/server";

import {
  RechargeBep20ScannerError,
  assertRechargeBep20ScannerAuthorized,
  scanRechargeBep20Transfers,
} from "@/lib/recharges/bep20-recharge-scanner";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

async function authorize(request: Request) {
  const auth = assertRechargeBep20ScannerAuthorized(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const rateLimit = checkRateLimit("internal_task", "internal:recharge_bep20_scan");
  if (!rateLimit.allowed) return rateLimit.response!;
  return null;
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  try {
    const result = await scanRechargeBep20Transfers({ dryRun: true });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  try {
    const result = await scanRechargeBep20Transfers({ dryRun: false });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  const known = error instanceof RechargeBep20ScannerError;
  if (!known) console.error("[RechargeBep20Scanner] unexpected failure");
  return NextResponse.json(
    {
      success: false,
      code: known ? error.code : "RECHARGE_SCANNER_FAILED",
      error: known ? error.message : "充值链上扫描失败",
    },
    { status: known ? error.status : 503 },
  );
}
