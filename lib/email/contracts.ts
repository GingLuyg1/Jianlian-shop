import type { EmailTemplateCode } from "./types";

export type EmailTemplateVariableContract = {
  required: readonly string[];
  allowed: readonly string[];
};

export const EMAIL_TEMPLATE_VARIABLE_CONTRACTS: Partial<Record<EmailTemplateCode, EmailTemplateVariableContract>> = {
  recharge_success: {
    required: ["recharge_no", "credited_amount", "currency"],
    allowed: ["recharge_no", "credited_amount", "currency"],
  },
};

export function validateBusinessEmailVariables(templateCode: string, variables: Record<string, unknown>) {
  const contract = EMAIL_TEMPLATE_VARIABLE_CONTRACTS[templateCode as EmailTemplateCode];
  if (!contract) return { ok: true as const };

  const missing = contract.required.filter((key) => {
    const value = variables[key];
    return typeof value !== "string" || !value.trim();
  });
  if (missing.length > 0) {
    return { ok: false as const, error: `缺少业务邮件变量：${missing.join(", ")}` };
  }

  const unsupported = Object.keys(variables).filter((key) => !contract.allowed.includes(key));
  if (unsupported.length > 0) {
    return { ok: false as const, error: `业务邮件包含未允许变量：${unsupported.join(", ")}` };
  }

  return { ok: true as const };
}
