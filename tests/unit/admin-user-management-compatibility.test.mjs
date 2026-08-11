import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_USER_PROFILE_CORE_SELECT,
  ADMIN_USER_PROFILE_EXTENDED_SELECT,
  ADMIN_USER_PROFILE_LEGACY_SELECT,
  classifyAdminUserProfileSchemaError,
  parseAdminUserManagementCompatibility,
} from "../../lib/admin/user-management-compatibility.mjs";

test("optional profile identity columns do not make user management schema unready", () => {
  assert.equal(classifyAdminUserProfileSchemaError({
    code: "42703",
    message: "column profiles.display_name does not exist",
  }), "optional_identity_missing");
  assert.equal(classifyAdminUserProfileSchemaError({
    code: "PGRST204",
    message: "Could not find the 'nickname' column of 'profiles' in the schema cache",
  }), "optional_identity_missing");
  assert.match(ADMIN_USER_PROFILE_EXTENDED_SELECT, /display_name/);
  assert.doesNotMatch(ADMIN_USER_PROFILE_CORE_SELECT, /display_name|full_name|nickname|,name,/);
  assert.match(ADMIN_USER_PROFILE_CORE_SELECT, /account_status/);
});

test("missing required user-management columns remain schema blockers", () => {
  for (const column of ["account_status", "risk_status", "status_reason", "risk_reason", "last_login_at"]) {
    assert.equal(classifyAdminUserProfileSchemaError({ code: "42703", message: `column profiles.${column} does not exist` }), "required_management_missing");
  }
  assert.doesNotMatch(ADMIN_USER_PROFILE_LEGACY_SELECT, /account_status|risk_status|last_login_at/);
});

test("unclassified database failures are not mislabeled as a missing migration", () => {
  assert.equal(classifyAdminUserProfileSchemaError({ code: "08006", message: "connection failed" }), "unknown");
  assert.equal(classifyAdminUserProfileSchemaError({ code: "PGRST500", message: "schema cache unavailable" }), "unknown");
});

test("compatibility status is ready only with an explicit zero-blocker result", () => {
  assert.deepEqual(parseAdminUserManagementCompatibility({ schemaReady: true, blockerCount: 0 }, null), {
    schemaReady: true,
    error: null,
  });
  assert.equal(parseAdminUserManagementCompatibility({ schemaReady: false, blockerCount: 1 }, null).schemaReady, false);
  assert.equal(parseAdminUserManagementCompatibility({ schemaReady: true, blockerCount: 1 }, null).schemaReady, false);
  assert.equal(parseAdminUserManagementCompatibility(null, { code: "PGRST202" }).schemaReady, false);
});
