export const DASHBOARD_PAYMENT_CHANNELS_SELECT =
  "code,display_name,enabled,configured,provider,network,merchant_id,api_url";

export const DASHBOARD_PAYMENT_CALLBACKS_SELECT =
  "id,channel,business_id,process_result,received_at";

export const DASHBOARD_PAYMENT_RECONCILIATIONS_SELECT =
  "id,result,created_at";

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeDashboardPaymentChannel(row) {
  return {
    code: text(row?.code),
    label: text(row?.display_name),
    enabled: row?.enabled === true,
    configured: row?.configured === true,
    provider: text(row?.provider),
    network: text(row?.network),
    merchantId: text(row?.merchant_id),
    apiUrl: text(row?.api_url),
  };
}

export function normalizeDashboardPaymentCallback(row) {
  return {
    id: text(row?.id),
    channel: text(row?.channel),
    businessId: text(row?.business_id),
    status: text(row?.process_result),
    createdAt: text(row?.received_at),
  };
}

export function normalizeDashboardPaymentReconciliation(row) {
  return {
    id: text(row?.id),
    status: text(row?.result),
    createdAt: text(row?.created_at),
  };
}
