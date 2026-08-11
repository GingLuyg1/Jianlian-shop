export const ADMIN_USER_PROFILE_EXTENDED_SELECT =
  "id,email,display_name,full_name,nickname,name,role,balance,created_at,updated_at,last_login_at,account_status,risk_status,status_reason,risk_reason";

export const ADMIN_USER_PROFILE_CORE_SELECT =
  "id,email,role,balance,created_at,updated_at,last_login_at,account_status,risk_status,status_reason,risk_reason";

export const ADMIN_USER_PROFILE_LEGACY_SELECT =
  "id,email,role,balance,created_at,updated_at";

const OPTIONAL_PROFILE_COLUMNS = new Set(["display_name", "full_name", "nickname", "name"]);
const REQUIRED_MANAGEMENT_COLUMNS = new Set([
  "account_status",
  "risk_status",
  "status_reason",
  "risk_reason",
  "last_login_at",
]);

function errorText(error) {
  if (error === null || typeof error !== "object" || Array.isArray(error)) return "";
  return [error.code, error.message, error.details, error.hint]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

export function classifyAdminUserProfileSchemaError(error) {
  const text = errorText(error);
  if (!text) return "unknown";
  for (const column of OPTIONAL_PROFILE_COLUMNS) {
    if (mentionsColumn(text, column)) return "optional_identity_missing";
  }
  for (const column of REQUIRED_MANAGEMENT_COLUMNS) {
    if (mentionsColumn(text, column)) return "required_management_missing";
  }
  return "unknown";
}

function mentionsColumn(text, column) {
  return text.includes(`profiles.${column}`)
    || text.includes(`'${column}'`)
    || text.includes(`"${column}"`)
    || new RegExp(`column\\s+${column}\\b`).test(text);
}

export function parseAdminUserManagementCompatibility(data, error) {
  if (error) {
    return {
      schemaReady: false,
      error: "用户管理兼容合同尚未就绪，请执行对应兼容 Migration。",
    };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return {
      schemaReady: false,
      error: "用户管理兼容状态无法确认。",
    };
  }
  const blockerCount = data.blockerCount;
  if (data.schemaReady !== true || !Number.isInteger(blockerCount) || blockerCount !== 0) {
    return {
      schemaReady: false,
      error: "用户管理关键字段或 RPC 合同不完整。",
    };
  }
  return { schemaReady: true, error: null };
}
