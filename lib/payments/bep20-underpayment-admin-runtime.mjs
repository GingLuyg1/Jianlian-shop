const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAdminUnderpaymentSettlementBody(value) {
  const body = value && typeof value === "object" ? value : {};
  const hasLegacyDryRun = Object.prototype.hasOwnProperty.call(body, "dryRun");
  const hasCanonicalDryRun = Object.prototype.hasOwnProperty.call(body, "dry_run");

  if (hasLegacyDryRun && hasCanonicalDryRun) {
    return {
      ok: false,
      status: 400,
      code: "BEP20_UNDERPAYMENT_DRY_RUN_FIELD_CONFLICT",
      message: "请求不能同时包含 dryRun 和 dry_run。",
    };
  }
  if (hasLegacyDryRun) {
    return {
      ok: false,
      status: 400,
      code: "BEP20_UNDERPAYMENT_DRY_RUN_FIELD_INVALID",
      message: "请使用 dry_run 字段。",
    };
  }
  if (body.action !== "settle" || body.dry_run !== false) {
    return {
      ok: false,
      status: 400,
      code: "BEP20_UNDERPAYMENT_EXPLICIT_SETTLEMENT_REQUIRED",
      message: "真实结算必须明确提交 action=settle 且 dry_run=false。",
    };
  }

  const sessionId = String(body.sessionId ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const requestId = String(body.requestId ?? "").trim();
  const confirmationText = String(body.confirmationText ?? "").trim();
  const requiredConfirmations = Number(body.requiredConfirmations);

  if (
    !UUID_PATTERN.test(sessionId)
    || reason.length < 1
    || reason.length > 500
    || requestId.length < 1
    || requestId.length > 200
    || !Number.isInteger(requiredConfirmations)
    || requiredConfirmations < 1
    || requiredConfirmations > 1000
  ) {
    return {
      ok: false,
      status: 400,
      code: "BEP20_UNDERPAYMENT_INPUT_INVALID",
      message: "链上支付会话、处理原因、请求编号或确认数无效。",
    };
  }

  return {
    ok: true,
    value: {
      sessionId,
      reason,
      requestId,
      confirmationText,
      requiredConfirmations,
      confirmIrreversible: body.confirmIrreversible === true,
    },
  };
}

export function mapAdminUnderpaymentSettlementError(code) {
  if (/^(PGRST202|PGRST205|42P01|42883)$/.test(code)) {
    return {
      status: 503,
      code: "BEP20_UNDERPAYMENT_MIGRATION_REQUIRED",
      message: "欠额支付结算功能尚未初始化。",
    };
  }
  if ([
    "BEP20_UNDERPAYMENT_SERVICE_ROLE_NOT_CONFIGURED",
    "BEP20_UNDERPAYMENT_SERVICE_ROLE_REQUIRED",
    "BEP20_UNDERPAYMENT_CONFIRMATION_CONFIG_INVALID",
  ].includes(code)) {
    return { status: 503, code, message: "欠额支付结算服务配置不可用。" };
  }
  if (code === "BEP20_UNDERPAYMENT_SESSION_NOT_FOUND") {
    return { status: 404, code, message: "链上支付会话不存在。" };
  }
  if ([
    "22P02",
    "SESSION_ID_REQUIRED",
    "BEP20_UNDERPAYMENT_INPUT_INVALID",
    "BEP20_UNDERPAYMENT_IRREVERSIBLE_CONFIRMATION_REQUIRED",
  ].includes(code)) {
    return { status: 400, code, message: "欠额支付结算请求无效。" };
  }
  if (
    code === "BEP20_UNDERPAYMENT_DEADLINE_INVALID"
    || /^BEP20_UNDERPAYMENT_(?:NOT_EXPIRED|STATE_INVALID|PAYMENT_STATE_INVALID|SNAPSHOT_INVALID|ORDER_SNAPSHOT_MISMATCH|PAYMENT_SNAPSHOT_MISMATCH|OWNERSHIP_INVALID|CLAIM_INVALID|TRANSFER_COUNT_INVALID|TRANSFER_INVALID|TRANSACTION_REFERENCE_MISMATCH|LATE_TRANSFER|RAW_AMOUNT_INVALID|AMOUNT_MISMATCH|AUTOMATIC_OPERATOR_FORBIDDEN|SUPER_ADMIN_REQUIRED|PROFILE_NOT_FOUND|CREDIT_ROUNDS_TO_ZERO|BALANCE_OUT_OF_RANGE|ORDER_STATE_CHANGED|PAYMENT_LINK_LOST)$/.test(code)
  ) {
    return { status: 409, code, message: "当前欠额支付状态不允许结算，请刷新后核对。" };
  }
  if (code === "BEP20_UNDERPAYMENT_INVENTORY_RELEASE_FAILED") {
    return { status: 503, code, message: "库存释放暂时不可用，结算未生效，请稍后重试。" };
  }
  if (code === "BEP20_UNDERPAYMENT_RESULT_INVALID") {
    return { status: 500, code, message: "欠额支付结算返回异常，请稍后重试。" };
  }
  return {
    status: 500,
    code: "BEP20_UNDERPAYMENT_SETTLEMENT_FAILED",
    message: "欠额支付结算失败，请稍后重试。",
  };
}

export function mapAdminUnderpaymentAuthorizationFailure(status, message) {
  return {
    success: false,
    status: status === 401 ? 401 : 403,
    code: status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
    message: String(message ?? "").trim() || (status === 401 ? "请先登录。" : "权限不足。"),
  };
}

export function canSubmitAdminUnderpaymentSettlement(input) {
  return Boolean(
    input.previewed
    && input.eligible
    && String(input.reason ?? "").trim().length > 0
    && String(input.confirmationText ?? "").trim() === String(input.orderNo ?? "").trim()
    && input.irreversibleConfirmed === true
    && input.submitting !== true,
  );
}

export function adminUnderpaymentSettlementMessage(result) {
  return result === "already_settled"
    ? "该欠额款已转入余额，无需重复处理。"
    : "欠额款已转入用户余额，原订单已取消。";
}

export function compareUnsignedDecimal(left, right) {
  const parse = (value) => {
    const match = String(value ?? "").trim().match(/^(\d+)(?:\.(\d+))?$/);
    if (!match) return null;
    const fraction = match[2] ?? "";
    return { coefficient: BigInt(`${match[1]}${fraction}`), scale: fraction.length };
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return null;
  const scale = Math.max(a.scale, b.scale);
  const av = a.coefficient * 10n ** BigInt(scale - a.scale);
  const bv = b.coefficient * 10n ** BigInt(scale - b.scale);
  return av < bv ? -1 : av > bv ? 1 : 0;
}
