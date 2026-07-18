export const LEGAL_ERROR_MESSAGES = Object.freeze({
  duplicate: "该协议类型和版本号已存在，请编辑现有草稿或更换版本号。",
  forbidden: "当前账号无权管理协议版本。",
  missingTable: "协议版本表尚未初始化，请先执行 migration。",
  unavailableTable: "协议版本表暂不可用，请稍后重试。",
  incompatibleSchema: "协议版本数据结构与当前应用不兼容，请联系管理员处理。",
  generic: "协议管理操作失败，请稍后重试。",
});

function errorField(error, field) {
  if (!error || typeof error !== "object" || !(field in error)) return "";
  const value = error[field];
  return typeof value === "string" ? value.trim() : "";
}

export function getLegalDatabaseErrorCode(error) {
  return errorField(error, "code").toUpperCase();
}

export function getLegalConstraintSummary(error) {
  const explicit = errorField(error, "constraint");
  if (explicit) return explicit.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || null;

  const details = errorField(error, "details");
  const message = errorField(error, "message");
  const match = `${details} ${message}`.match(/constraint\s+["']?([a-zA-Z0-9_-]+)["']?/i);
  return match?.[1]?.slice(0, 80) ?? null;
}

/**
 * @param {unknown} error
 * @param {string} fallback
 */
export function classifyLegalDatabaseError(error, fallback = LEGAL_ERROR_MESSAGES.generic) {
  const code = getLegalDatabaseErrorCode(error);

  if (code === "23505") {
    return { code, status: 409, category: "duplicate", message: LEGAL_ERROR_MESSAGES.duplicate };
  }
  if (code === "42501") {
    return { code, status: 403, category: "forbidden", message: LEGAL_ERROR_MESSAGES.forbidden };
  }
  if (code === "42P01") {
    return { code, status: 503, category: "missing_table", message: LEGAL_ERROR_MESSAGES.missingTable };
  }
  if (code === "PGRST205") {
    return { code, status: 503, category: "unavailable_table", message: LEGAL_ERROR_MESSAGES.unavailableTable };
  }
  if (code === "42703" || code === "PGRST204") {
    return { code, status: 500, category: "incompatible_schema", message: LEGAL_ERROR_MESSAGES.incompatibleSchema };
  }

  return {
    code: code || null,
    status: 500,
    category: "database_error",
    message: fallback || LEGAL_ERROR_MESSAGES.generic,
  };
}
