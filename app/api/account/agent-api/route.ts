import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/security/rate-limit";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const IP_OR_CIDR_REGEX = /^[0-9a-fA-F.:/]{3,64}$/;

function isMissingAgentTableError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const code = String(error.code ?? "").toUpperCase();
  if (code === "42P01" || code === "PGRST205") return true;
  return /agent_applications|agent_ip_whitelists|schema cache/i.test(String(error.message ?? ""));
}

function generateMerchantAppSecret() {
  const raw = `jl_live_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  const prefix = `${raw.slice(0, 14)}****${raw.slice(-4)}`;
  return { raw, hash, prefix };
}

async function getAuthenticatedUser() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { ok: false as const, status: 503, error: "认证服务未配置" };
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || !user.email) {
    return { ok: false as const, status: 401, error: "请先登录账户" };
  }
  return { ok: true as const, user };
}

export async function GET() {
  const auth = await getAuthenticatedUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: { "Cache-Control": "no-store" } });
  }

  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return NextResponse.json({ error: "服务端数据库访问未配置" }, { status: 503 });
  }

  const userId = auth.user.id;
  const email = auth.user.email!.trim();

  const { data: appRows, error: appErr } = await service
    .from("agent_applications")
    .select("id,user_id,email,merchant_name,business_scenario,server_ips,contact,status,app_id,app_secret_prefix,reviewed_at,created_at,updated_at")
    .or(`user_id.eq.${userId},email.ilike.${email}`)
    .order("created_at", { ascending: false })
    .limit(5);

  if (appErr) {
    if (isMissingAgentTableError(appErr)) {
      return NextResponse.json(
        { status: "unapplied", wasRevoked: false, application: null, whitelistIps: [], schemaReady: false },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json({ error: "API 商户状态读取失败" }, { status: 500 });
  }

  const rows = (appRows ?? []) as Array<Record<string, unknown>>;
  const latest = rows[0] ?? null;

  if (!latest) {
    return NextResponse.json(
      { status: "unapplied", wasRevoked: false, application: null, whitelistIps: [], schemaReady: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const rawStatus = String(latest.status ?? "unapplied").toLowerCase();
  const normalizedStatus =
    rawStatus === "approved"
      ? "approved"
      : rawStatus === "pending"
        ? "pending"
        : "unapplied";
  const wasRevoked = rawStatus === "revoked";
  const wasRejected = rawStatus === "rejected";

  let whitelistIps: string[] = [];
  if (normalizedStatus === "approved") {
    const appId = latest.app_id ? String(latest.app_id) : "";
    const wlQuery = service
      .from("agent_ip_whitelists")
      .select("ip,status")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(100);

    const { data: wlRows, error: wlErr } = appId
      ? await wlQuery.or(`application_id.eq.${String(latest.id)},app_id.eq.${appId}`)
      : await wlQuery.eq("application_id", String(latest.id));

    if (!wlErr && Array.isArray(wlRows)) {
      whitelistIps = Array.from(
        new Set(wlRows.map((row) => String((row as Record<string, unknown>).ip ?? "").trim()).filter(Boolean))
      );
    }
  }

  return NextResponse.json(
    {
      schemaReady: true,
      status: normalizedStatus,
      wasRevoked,
      wasRejected,
      application: {
        id: String(latest.id),
        email: String(latest.email ?? email),
        merchantName: String(latest.merchant_name ?? ""),
        businessScenario: String(latest.business_scenario ?? ""),
        serverIps: Array.isArray(latest.server_ips) ? latest.server_ips.map((ip) => String(ip)).filter(Boolean) : [],
        contact: String(latest.contact ?? ""),
        status: rawStatus,
        appId: latest.app_id ? String(latest.app_id) : "",
        appSecretPrefix: latest.app_secret_prefix ? String(latest.app_secret_prefix) : "",
        appliedAt: latest.created_at ? String(latest.created_at) : null,
        reviewedAt: latest.reviewed_at ? String(latest.reviewed_at) : null,
      },
      whitelistIps,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const limit = checkRateLimit("ticket_write", `account_agent_api:${auth.user.id}`);
  if (!limit.allowed) return limit.response!;

  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return NextResponse.json({ error: "服务端数据库写入未配置" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "apply").trim();
  const userId = auth.user.id;
  const email = auth.user.email!.trim();

  if (action === "reset_secret") {
    const { data: approvedApp, error: findErr } = await service
      .from("agent_applications")
      .select("id,app_id,status")
      .or(`user_id.eq.${userId},email.ilike.${email}`)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findErr) {
      return NextResponse.json({ error: "读取商户信息失败" }, { status: 500 });
    }
    if (!approvedApp) {
      return NextResponse.json({ error: "当前账户尚未开通 API 商户权限" }, { status: 403 });
    }

    const fresh = generateMerchantAppSecret();
    const { error: updErr } = await service
      .from("agent_applications")
      .update({
        app_secret_hash: fresh.hash,
        app_secret_prefix: fresh.prefix,
        updated_at: new Date().toISOString(),
      })
      .eq("id", approvedApp.id);

    if (updErr) {
      return NextResponse.json({ error: "商户密钥重置失败，请稍后重试" }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        appId: String(approvedApp.app_id ?? ""),
        issuedSecret: fresh.raw,
        appSecretPrefix: fresh.prefix,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Default action: submit API merchant application
  const merchantName = String(body?.merchantName ?? "").trim().slice(0, 100);
  const businessScenario = String(body?.businessScenario ?? "").trim().slice(0, 1000);
  const contact = (String(body?.contact ?? "").trim() || email).slice(0, 120);
  const rawIps = Array.isArray(body?.serverIps)
    ? body!.serverIps.map((v) => String(v ?? "").trim())
    : String(body?.serverIps ?? "")
        .split(/[\n,;\s]+/)
        .map((v) => v.trim());
  const serverIps = Array.from(new Set(rawIps.filter((ip) => ip && IP_OR_CIDR_REGEX.test(ip)))).slice(0, 20);

  if (!merchantName) {
    return NextResponse.json({ error: "请输入商户/企业或个人主体名称" }, { status: 400 });
  }
  if (!businessScenario) {
    return NextResponse.json({ error: "请描述您的业务对接场景" }, { status: 400 });
  }

  const { data: existingRows, error: checkErr } = await service
    .from("agent_applications")
    .select("id,status")
    .or(`user_id.eq.${userId},email.ilike.${email}`)
    .in("status", ["pending", "approved"])
    .limit(1);

  if (checkErr) {
    if (isMissingAgentTableError(checkErr)) {
      return NextResponse.json({ error: "API 代理申请服务尚未初始化，请联系管理员" }, { status: 503 });
    }
    return NextResponse.json({ error: "校验申请状态失败" }, { status: 500 });
  }

  if (existingRows && existingRows.length > 0) {
    const existingStatus = String(existingRows[0].status ?? "");
    return NextResponse.json(
      { error: existingStatus === "approved" ? "您已开通 API 商户权限，无需重复申请" : "您已有待审核的 API 申请，请耐心等待管理员审核" },
      { status: 409 }
    );
  }

  const { data: inserted, error: insertErr } = await service
    .from("agent_applications")
    .insert({
      user_id: userId,
      email,
      merchant_name: merchantName,
      business_scenario: businessScenario,
      server_ips: serverIps,
      contact,
      status: "pending",
    })
    .select("id,status,created_at")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: "API 申请提交失败，请稍后重试" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      id: String(inserted?.id ?? ""),
      status: "pending",
    },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
