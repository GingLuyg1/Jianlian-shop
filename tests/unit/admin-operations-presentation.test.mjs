import test from "node:test";
import assert from "node:assert/strict";

import { formatAdminAuditActor, formatIncidentStatus } from "../../lib/admin/admin-operations-presentation.mjs";

test("denied records without identity are labelled as unauthenticated requests", () => {
  assert.equal(formatAdminAuditActor({ admin_user_id: null, admin_email: null, result: "denied" }), "未认证请求");
  assert.equal(formatAdminAuditActor({ admin_user_id: null, admin_email: null, result: "success" }), "系统任务");
  assert.equal(formatAdminAuditActor({ admin_user_id: "12345678-0000", admin_email: null, result: "success" }), "管理员 12345678…");
  assert.equal(formatAdminAuditActor({ admin_user_id: "123", admin_email: "admin@example.com", result: "denied" }), "admin@example.com");
});

test("incident statuses describe workflow state instead of current health", () => {
  assert.equal(formatIncidentStatus("open"), "待人工关闭");
  assert.equal(formatIncidentStatus("investigating"), "处理中");
  assert.equal(formatIncidentStatus("resolved"), "已解决");
  assert.equal(formatIncidentStatus("ignored"), "已忽略");
});
