export const PASSWORD_POLICY_DESCRIPTION = "密码至少 8 位，并同时包含字母和数字。";

export function validateAuthPassword(value: string) {
  if (value.length < 8) return "密码至少需要 8 位。";
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return "密码需要同时包含字母和数字。";
  }
  return "";
}

export function isEmailFormatValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

export function getSafeAuthErrorMessage(error: unknown, fallback: string) {
  const message =
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message.toLowerCase()
      : "";

  if (message.includes("invalid login credentials")) return "邮箱或密码不正确。";
  if (message.includes("email not confirmed")) return "邮箱尚未验证，请先完成邮箱验证。";
  if (message.includes("invalid email")) return "邮箱格式不正确。";
  if (message.includes("password")) return "密码强度不足，请按要求设置密码。";
  if (message.includes("rate") || message.includes("too many")) return "请求过于频繁，请稍后再试。";
  if (message.includes("signup") && message.includes("disabled")) return "注册服务暂时不可用。";
  if (message.includes("already registered") || message.includes("already exists")) {
    return "注册请求无法完成，请确认邮箱或稍后重试。";
  }

  return fallback;
}

export function getSafeNetworkAuthMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  if (message.includes("failed to fetch") || message.includes("networkerror") || message.includes("load failed")) {
    return "无法连接认证服务，请稍后重试。";
  }
  return "认证请求失败，请稍后重试。";
}