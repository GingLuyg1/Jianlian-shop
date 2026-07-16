import { NextResponse } from "next/server";

import { getAuditErrorMessage } from "@/lib/admin/audit-log-service";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { assertUserBusinessAllowed, isAccountRestrictionError } from "@/lib/users/account-guard";

export const dynamic = "force-dynamic";

type ProfilePayload = {
  display_name?: string | null;
  phone?: string | null;
  recipient_name?: string | null;
  shipping_address?: Record<string, unknown> | null;
  avatar_url?: string | null;
};

const DEFAULT_PROFILE_ROLE = "user";
const PROFILE_UPDATE_ALLOWED_FIELDS = [
  "display_name",
  "phone",
  "recipient_name",
  "shipping_address",
  "avatar_url",
] as const;

const PROFILE_BASE_SELECT =
  "id,email,phone,role,balance,promotion_balance,invite_code,referred_by,created_at,updated_at";
const PROFILE_EXTENDED_SELECT =
  "id,email,phone,display_name,recipient_name,shipping_address,avatar_url,role,balance,promotion_balance,invite_code,referred_by,created_at,updated_at";

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

function cleanText(value: unknown, max = 200) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function safeError(error: unknown) {
  const next = (error ?? {}) as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  return {
    code: typeof next.code === "string" ? next.code : "UNKNOWN",
    message: typeof next.message === "string" ? next.message.slice(0, 240) : "",
    details: typeof next.details === "string" ? next.details.slice(0, 240) : "",
    hint: typeof next.hint === "string" ? next.hint.slice(0, 160) : "",
  };
}

function isMissingProfileColumn(error: unknown) {
  const next = safeError(error);
  const text = `${next.message} ${next.details} ${next.hint}`;
  return next.code === "42703" || /column .* does not exist/i.test(text);
}

async function getCurrentUser() {
  if (!hasSupabaseServerConfig()) {
    return { ok: false as const, response: json({ error: "Supabase server configuration is missing." }, { status: 500 }) };
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false as const, response: json({ error: "Please sign in first." }, { status: 401 }) };
  }

  return { ok: true as const, supabase, user };
}

async function readProfile(supabase: ReturnType<typeof getSupabaseServerClient>, userId: string) {
  const extended = await supabase
    .from("profiles")
    .select(PROFILE_EXTENDED_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (!extended.error) return { profile: extended.data, schemaReady: true, error: null };
  if (!isMissingProfileColumn(extended.error)) return { profile: null, schemaReady: true, error: extended.error };

  const base = await supabase
    .from("profiles")
    .select(PROFILE_BASE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  return { profile: base.data, schemaReady: false, error: base.error };
}

async function createProfileOnce(supabase: ReturnType<typeof getSupabaseServerClient>, user: { id: string; email?: string | null; phone?: string | null }) {
  const payload = {
    id: user.id,
    email: user.email?.toLowerCase() ?? null,
    phone: user.phone ?? null,
    role: DEFAULT_PROFILE_ROLE,
    balance: 0,
    promotion_balance: 0,
  };

  const created = await supabase
    .from("profiles")
    .insert(payload)
    .select(PROFILE_BASE_SELECT)
    .maybeSingle();

  if (!created.error) return { profile: created.data, error: null };

  if (created.error.code === "23505") {
    const retry = await supabase
      .from("profiles")
      .select(PROFILE_BASE_SELECT)
      .eq("id", user.id)
      .maybeSingle();
    return { profile: retry.data, error: retry.error };
  }

  return { profile: null, error: created.error };
}

export async function GET() {
  const context = await getCurrentUser();
  if (!context.ok) return context.response;

  const result = await readProfile(context.supabase, context.user.id);
  if (result.error) {
    console.error("[Account Profile] read failed", safeError(result.error));
    return json({ error: "Profile could not be loaded.", code: "PROFILE_READ_FAILED" }, { status: 500 });
  }

  if (!result.profile) {
    return json({ profile: null, exists: false, schemaReady: result.schemaReady });
  }

  return json({ profile: result.profile, exists: true, schemaReady: result.schemaReady });
}

export async function POST() {
  const context = await getCurrentUser();
  if (!context.ok) return context.response;

  const existing = await readProfile(context.supabase, context.user.id);
  if (existing.error) {
    console.error("[Account Profile] read before create failed", safeError(existing.error));
    return json({ error: "Profile could not be loaded.", code: "PROFILE_READ_FAILED" }, { status: 500 });
  }

  if (existing.profile) return json({ profile: existing.profile, created: false, schemaReady: existing.schemaReady });

  const created = await createProfileOnce(context.supabase, context.user);
  if (created.error) {
    console.error("[Account Profile] create failed", safeError(created.error));
    return json({ error: "Profile could not be created.", code: "PROFILE_CREATE_FAILED" }, { status: 500 });
  }

  return json({ profile: created.profile, created: true, schemaReady: false });
}

export async function PATCH(request: Request) {
  const context = await getCurrentUser();
  if (!context.ok) return context.response;

  try {
    await assertUserBusinessAllowed(context.supabase, context.user.id, "update_profile");
  } catch (guardError) {
    if (isAccountRestrictionError(guardError)) {
      return json({ error: guardError.message, code: guardError.code }, { status: guardError.status });
    }
    throw guardError;
  }

  const body = (await request.json().catch(() => null)) as ProfilePayload | null;
  if (!body) return json({ error: "Invalid profile payload." }, { status: 400 });

  const safeBody = Object.fromEntries(
    Object.entries(body).filter(([key]) => (PROFILE_UPDATE_ALLOWED_FIELDS as readonly string[]).includes(key))
  ) as ProfilePayload;

  const displayName = cleanText(safeBody.display_name, 80);
  if (!displayName) return json({ error: "Display name is required." }, { status: 400 });

  const phone = cleanText(safeBody.phone, 40);
  if (phone && !/^[+0-9()\-\s]{6,24}$/.test(phone)) {
    return json({ error: "Invalid phone format." }, { status: 400 });
  }

  const payload = {
    display_name: displayName,
    phone,
    recipient_name: cleanText(safeBody.recipient_name, 80),
    shipping_address: safeBody.shipping_address && typeof safeBody.shipping_address === "object" ? safeBody.shipping_address : {},
    avatar_url: cleanText(safeBody.avatar_url, 1000),
  };

  const { data, error } = await context.supabase
    .from("profiles")
    .update(payload)
    .eq("id", context.user.id)
    .select("id,email,phone,display_name,recipient_name,shipping_address,avatar_url,updated_at")
    .maybeSingle();

  if (error) {
    console.error("[Account Profile] save failed", { ...safeError(error), auditMessage: getAuditErrorMessage(error, "") });
    const status = isMissingProfileColumn(error) ? 409 : 500;
    const code = isMissingProfileColumn(error) ? "PROFILE_SCHEMA_INCOMPATIBLE" : "PROFILE_UPDATE_FAILED";
    return json({ error: "Profile could not be saved.", code }, { status });
  }

  if (!data) return json({ error: "Profile not found.", code: "PROFILE_NOT_FOUND" }, { status: 404 });
  return json({ profile: data });
}
