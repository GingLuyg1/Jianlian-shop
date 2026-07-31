const FAILURE_CONTRACT = Object.freeze({
  list: Object.freeze({
    code: "RECHARGE_LIST_READ_FAILED",
    message: "充值记录暂时无法读取，请稍后重试。",
    status: 503,
  }),
  channel: Object.freeze({
    code: "RECHARGE_CHANNEL_READ_FAILED",
    message: "充值渠道暂时无法读取，请稍后重试。",
    status: 503,
  }),
  risk: Object.freeze({
    code: "RECHARGE_RISK_CHECK_FAILED",
    message: "充值安全校验暂时无法完成，请稍后重试。",
    status: 503,
  }),
  create: Object.freeze({
    code: "RECHARGE_CREATE_FAILED",
    message: "充值申请暂时无法创建，请稍后重试。",
    status: 503,
  }),
  service: Object.freeze({
    code: "RECHARGE_SERVICE_UNAVAILABLE",
    message: "充值服务暂时不可用，请稍后重试。",
    status: 503,
  }),
});

export function buildRechargePublicFailure(operation, requestId) {
  const contract = FAILURE_CONTRACT[operation] ?? FAILURE_CONTRACT.service;
  return {
    status: contract.status,
    body: {
      error: contract.message,
      code: contract.code,
      requestId,
    },
  };
}

export function buildRechargeSafeLogFields({ operation, requestId, status, error }) {
  const rawCode = error && typeof error === "object" ? error.code : null;
  const databaseCode = typeof rawCode === "string"
    && /^(?:[0-9A-Z]{5}|PGRST\d+)$/.test(rawCode)
      ? rawCode
      : undefined;
  return {
    operation,
    requestId,
    status,
    ...(databaseCode ? { databaseCode } : {}),
  };
}
