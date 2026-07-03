import type { EmailTemplateRecord } from "./types";

const TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function extractTemplateVariables(template: string) {
  const variables = new Set<string>();
  TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(template)) !== null) {
    variables.add(match[1]);
  }
  TOKEN_PATTERN.lastIndex = 0;
  return Array.from(variables).sort();
}

export function validateSafeEmailHtml(html: string) {
  if (/<\s*(script|iframe|object|embed|form|base|meta)\b/i.test(html)) {
    return { ok: false as const, error: "邮件模板包含禁止使用的 HTML 标签。" };
  }
  if (/\son[a-z]+\s*=/i.test(html) || /(?:javascript|data\s*:\s*text\/html)\s*:/i.test(html)) {
    return { ok: false as const, error: "邮件模板包含危险事件属性或链接协议。" };
  }
  return { ok: true as const };
}

export function getAllowedTemplateVariables(schema: Record<string, unknown> | null | undefined) {
  const safeSchema = schema ?? {};
  const required = Array.isArray(safeSchema.required) ? safeSchema.required.map(String) : [];
  const optional = Array.isArray(safeSchema.optional) ? safeSchema.optional.map(String) : [];
  const allowed = Array.from(new Set([...required, ...optional])).sort();
  return { required, optional, allowed };
}

export function validateTemplateVariables(template: EmailTemplateRecord, variables: Record<string, unknown>) {
  const schema = getAllowedTemplateVariables(template.variables_schema);
  const used = Array.from(
    new Set([
      ...extractTemplateVariables(template.subject_template),
      ...extractTemplateVariables(template.html_template),
      ...extractTemplateVariables(template.text_template ?? ""),
    ])
  );

  if (schema.allowed.length > 0) {
    const invalid = used.filter((key) => !schema.allowed.includes(key));
    if (invalid.length) return { ok: false as const, error: `模板包含未授权变量：${invalid.join(", ")}` };
  }

  const missing = schema.required.filter((key) => variables[key] === undefined || variables[key] === null || variables[key] === "");
  if (missing.length) return { ok: false as const, error: `缺少模板变量：${missing.join(", ")}` };

  return { ok: true as const };
}

export function renderTemplateString(template: string, variables: Record<string, unknown>) {
  return template.replace(TOKEN_PATTERN, (_match, key: string) => escapeHtml(variables[key]));
}

export function renderEmailTemplate(template: EmailTemplateRecord, variables: Record<string, unknown>) {
  const htmlValidation = validateSafeEmailHtml(template.html_template);
  if (!htmlValidation.ok) return htmlValidation;
  const validation = validateTemplateVariables(template, variables);
  if (!validation.ok) return validation;

  return {
    ok: true as const,
    subject: renderTemplateString(template.subject_template, variables),
    html: renderTemplateString(template.html_template, variables),
    text: renderTemplateString(template.text_template ?? template.subject_template, variables),
  };
}

