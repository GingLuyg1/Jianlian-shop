import { NextRequest, NextResponse } from "next/server";

const INVITE_CODE_PATTERN = /^JL[A-Z0-9]{6,12}$/i;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, props: { params: Promise<{ inviteCode?: string }> }) {
  const params = await props.params;
  const inviteCode = decodeURIComponent(params.inviteCode ?? "")
    .trim()
    .toUpperCase();
  const target = new URL("/register", request.url);

  if (INVITE_CODE_PATTERN.test(inviteCode)) {
    target.searchParams.set("invite", inviteCode);
  }

  return NextResponse.redirect(target, { status: 307 });
}
