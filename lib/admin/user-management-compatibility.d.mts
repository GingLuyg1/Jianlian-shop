export const ADMIN_USER_PROFILE_EXTENDED_SELECT: string;
export const ADMIN_USER_PROFILE_CORE_SELECT: string;
export const ADMIN_USER_PROFILE_LEGACY_SELECT: string;

export function classifyAdminUserProfileSchemaError(
  error: unknown
): "optional_identity_missing" | "required_management_missing" | "unknown";

export function parseAdminUserManagementCompatibility(
  data: unknown,
  error: unknown
): { schemaReady: boolean; error: string | null };
