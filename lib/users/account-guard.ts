import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type SensitiveBusinessAction =
  | "create_order"
  | "create_recharge"
  | "create_payment"
  | "view_delivery"
  | "update_profile"
  | "generic";

export class AccountRestrictionError extends Error {
  status: number;
  code: string;

  constructor(message: string, code = "ACCOUNT_RESTRICTED", status = 403) {
    super(message);
    this.name = "AccountRestrictionError";
    this.code = code;
    this.status = status;
  }
}

function getErrorMessage(error: unknown, fallback = "账户状态校验失败，请稍后重试") {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function assertUserBusinessAllowed(
  supabase: SupabaseClient,
  userId: string,
  action: SensitiveBusinessAction
) {
  const { data, error } = await supabase.rpc("check_user_business_allowed", {
    p_user_id: userId,
    p_action: action,
  });

  if (error) {
    if (/check_user_business_allowed|schema cache|PGRST|42883/i.test(getErrorMessage(error, ""))) {
      return;
    }
    throw new AccountRestrictionError(getErrorMessage(error), "ACCOUNT_CHECK_FAILED", 500);
  }

  const result = data as { allowed?: boolean; message?: string; account_status?: string; risk_status?: string } | null;
  if (result && result.allowed === false) {
    throw new AccountRestrictionError(result.message || "账户当前暂不能执行该操作，请联系客服。", "ACCOUNT_RESTRICTED", 403);
  }
}

export function isAccountRestrictionError(error: unknown): error is AccountRestrictionError {
  return error instanceof AccountRestrictionError;
}
