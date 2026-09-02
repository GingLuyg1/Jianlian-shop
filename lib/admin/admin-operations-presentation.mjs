const INCIDENT_STATUS_LABELS = {
  open: "待人工关闭",
  investigating: "处理中",
  resolved: "已解决",
  ignored: "已忽略",
};

export function formatAdminAuditActor(log) {
  const email = typeof log?.admin_email === "string" ? log.admin_email.trim() : "";
  if (email) return email;
  const id = typeof log?.admin_user_id === "string" ? log.admin_user_id.trim() : "";
  if (id) return `管理员 ${id.slice(0, 8)}…`;
  if (log?.result === "denied") return "未认证请求";
  return "系统任务";
}

export function formatIncidentStatus(status) {
  return INCIDENT_STATUS_LABELS[status] ?? status ?? "未知状态";
}
