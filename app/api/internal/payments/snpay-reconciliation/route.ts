import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reconcileSnpaySession } from "@/lib/payments/snpay-reconciliation-service";
import { checkRequestSize, checkRateLimit, getInternalTaskRateLimitKey } from "@/lib/security/rate-limit";
export const dynamic = "force-dynamic";
let running = false;
function authorize(request:Request) {
  const expected = process.env.PAYMENT_RECONCILIATION_SECRET ?? process.env.INTERNAL_API_SECRET ?? "";
  const supplied = request.headers.get("x-payment-reconciliation-secret") ?? "";
  const expectedBytes = Buffer.from(expected), suppliedBytes = Buffer.from(supplied);
  if(!expected || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes,expectedBytes))
  return NextResponse.json({error:"unauthorized"},{status:403});
  const rate = checkRateLimit("internal_task",getInternalTaskRateLimitKey(expected,"snpay_reconciliation"));
  if(!rate.allowed) return rate.response!;
  return null;
}
// Process-runtime evidence only: no candidate reads, provider I/O or completion.
// Authentication is identical to POST; never expose credential values.
export async function GET(request:Request) {
  const denied = authorize(request); if(denied) return denied;
  return NextResponse.json({executeEnabled:process.env.SNPAY_RECONCILIATION_EXECUTE_ENABLED === "true"},
    {headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request) {
  const denied = authorize(request); if(denied) return denied;
  const sizeError = checkRequestSize(request,2048); if(sizeError) return sizeError;
  if(running) return NextResponse.json({error:"already_running"},{status:429});
  // Process-local admission: acquire synchronously before parsing can yield.
  running = true;
  try {
  const body = await request.json().catch(()=>null);
  if(!body || typeof body.sessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.sessionId)
      || (body.execute !== undefined && typeof body.execute !== "boolean"))
    return NextResponse.json({error:"invalid_request"},{status:400});
  if(body.execute === true && process.env.SNPAY_RECONCILIATION_EXECUTE_ENABLED !== "true")
    return NextResponse.json({error:"execute_not_enabled"},{status:403});
  return NextResponse.json(await reconcileSnpaySession({sessionId:body.sessionId,execute:body.execute === true}));}
  catch {return NextResponse.json({error:"reconciliation_failed"},{status:500});}
  finally {running = false;}
}
