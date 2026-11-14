import { GET as getReadiness } from "../readiness/route";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return getReadiness(request);
}
