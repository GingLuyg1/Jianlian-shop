import { NextResponse } from "next/server";

import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import {
  PROMOTION_COMMISSION_RATE,
  PROMOTION_MIN_WITHDRAW_AMOUNT,
} from "@/lib/promotion";

export const dynamic = "force-dynamic";

const COMMISSION_RATE = PROMOTION_COMMISSION_RATE;
const MIN_WITHDRAW_AMOUNT = PROMOTION_MIN_WITHDRAW_AMOUNT;
const COMMISSION_STATUSES = ["all", "pending", "available", "withdrawn", "cancelled"] as const;
const REFERRAL_SCHEMA_NOT_READY =
  "推广功能尚未完成数据库初始化，请管理员执行推广系统 migration。";

type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

function normalizeCommissionStatus(value: unknown): Exclude<CommissionStatus, "all"> {
  return value === "available" ||
    value === "withdrawn" ||
    value === "cancelled" ||
    value === "pending"
    ? value
    : "pending";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message?: string }).message?.trim();
    if (message) return message;
  }

  return fallback;
}

function isMissingReferralSchemaError(error: unknown) {
  const message = getErrorMessage(error, "").toLowerCase();
  return (
    message.includes("referral_commissions") ||
    message.includes("referrals") ||
    message.includes("ensure_my_referral_code") ||
    message.includes("bind_referrer_by_code") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function getReferralErrorMessage(error: unknown, fallback: string) {
  if (isMissingReferralSchemaError(error)) return REFERRAL_SCHEMA_NOT_READY;
  return fallback;
}

function maskUserLabel(value: string | null | undefined) {
  if (!value) return "匿名用户";
  const normalized = value.trim();

  if (normalized.includes("@")) {
    const [name, domain] = normalized.split("@");
    if (!domain) return normalized;
    return `${name.slice(0, 3)}${"*".repeat(Math.max(3, name.length - 3))}@${domain}`;
  }

  if (normalized.length <= 7) return normalized;
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

async function safeCount<T>(
  run: () => PromiseLike<{ count: number | null; error: T | null }>
) {
  try {
    const { count, error } = await run();
    if (error) return { value: null, error: getReferralErrorMessage(error, "读取失败") };
    return { value: count ?? 0, error: "" };
  } catch (error) {
    return { value: null, error: getReferralErrorMessage(error, "读取失败") };
  }
}

export async function GET(request: Request) {
  try {
    if (!hasSupabaseServerConfig()) {
      return NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 500 });
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") ?? 10)));
    const status = (url.searchParams.get("status") ?? "all") as CommissionStatus;
    const safeStatus = COMMISSION_STATUSES.includes(status) ? status : "all";
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let inviteCode = "";
    const { data: ensuredCode, error: codeError } = await supabase.rpc(
      "ensure_my_referral_code"
    );

    if (codeError) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("invite_code")
        .eq("id", user.id)
        .maybeSingle();
      inviteCode = profile?.invite_code ?? "";
    } else {
      inviteCode = String(ensuredCode ?? "");
    }

    const visits = await safeCount(() =>
      supabase
        .from("promotion_visits")
        .select("id", { count: "exact", head: true })
        .eq("inviter_id", user.id)
    );

    const registrations = await safeCount(() =>
      supabase
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", user.id)
    );

    let commissionQuery = supabase
      .from("referral_commissions")
      .select(
        "id,referred_user_label,order_no,order_amount,paid_at,commission_rate,commission_amount,status,created_at,available_at,withdrawn_at",
        { count: "exact" }
      )
      .eq("referrer_id", user.id)
      .order("created_at", { ascending: false });

    if (safeStatus !== "all") {
      commissionQuery = commissionQuery.eq("status", safeStatus);
    }

    const { data: commissionRows, count: commissionCount, error: commissionError } =
      await commissionQuery.range(from, to);

    const { data: allCommissions, error: statsError } = await supabase
      .from("referral_commissions")
      .select("commission_amount,status")
      .eq("referrer_id", user.id);

    const commissionStats = statsError
      ? { total: null, available: null, error: getReferralErrorMessage(statsError, "读取失败") }
      : {
          total: (allCommissions ?? []).reduce(
            (sum, item) =>
              item.status === "cancelled"
                ? sum
                : sum + Number(item.commission_amount ?? 0),
            0
          ),
          available: (allCommissions ?? [])
            .filter((item) => item.status === "available")
            .reduce((sum, item) => sum + Number(item.commission_amount ?? 0), 0),
          error: "",
        };

    const registrationRate =
      visits.value === null
        ? null
        : visits.value > 0 && registrations.value !== null
          ? `${((registrations.value / visits.value) * 100).toFixed(2)}%`
          : "0.00%";

    return NextResponse.json({
      inviteCode,
      commissionRate: COMMISSION_RATE,
      minWithdrawAmount: MIN_WITHDRAW_AMOUNT,
      updatedAt: new Date().toISOString(),
      stats: {
        visits,
        registrations,
        referrals: registrations,
        registrationRate: {
          value: registrationRate,
          error: visits.value === null ? visits.error || "访问统计未接入" : "",
        },
        totalCommission: commissionStats.total,
        availableCommission: commissionStats.available,
        commissionError: commissionStats.error,
      },
      records: commissionError
        ? []
        : (commissionRows ?? []).map((row) => ({
            id: String(row.id),
            referredUser: maskUserLabel(row.referred_user_label),
            orderNo: row.order_no ?? "-",
            paidAt: row.paid_at ?? row.created_at ?? null,
            orderAmount: Number(row.order_amount ?? 0),
            commissionRate: Number(row.commission_rate ?? COMMISSION_RATE),
            commissionAmount: Number(row.commission_amount ?? 0),
            status: normalizeCommissionStatus(row.status),
          })),
      recordError: commissionError
        ? getReferralErrorMessage(commissionError, "读取失败")
        : "",
      count: commissionError ? 0 : commissionCount ?? 0,
      page,
      pageSize,
    });
  } catch (error) {
    return NextResponse.json(
      { error: getReferralErrorMessage(error, "推广数据读取失败，请稍后重试") },
      { status: 500 }
    );
  }
}
