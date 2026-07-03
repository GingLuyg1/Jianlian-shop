export type EmailTemplateCode =
  | "email_verification"
  | "password_reset"
  | "registration_success"
  | "order_created"
  | "payment_success"
  | "external_payment_pending"
  | "payment_failed"
  | "order_delivered"
  | "delivery_failed"
  | "refund_requested"
  | "refund_approved"
  | "refund_rejected"
  | "refund_succeeded"
  | "recharge_success"
  | "account_status_changed"
  | "account_security_alert"
  | "admin_system_alert";

export type EmailProviderName = "none" | "resend" | "postmark" | "smtp" | "custom";
export type EmailSendStatus = "sent" | "failed" | "not_configured";
export type EmailDeliveryJobStatus = "pending" | "processing" | "sent" | "retrying" | "failed" | "cancelled";

export type EmailBusinessType =
  | "auth"
  | "order"
  | "payment"
  | "recharge"
  | "refund"
  | "delivery"
  | "account"
  | "admin"
  | "system";

export type EmailProviderStatus = {
  provider: EmailProviderName;
  configured: boolean;
  from?: string | null;
  missing: string[];
  message: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  templateCode: EmailTemplateCode | string;
  businessType: EmailBusinessType | string;
  businessId?: string | null;
  businessNo?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown> | null;
};

export type SendEmailResult = {
  provider: EmailProviderName;
  providerMessageId: string | null;
  status: EmailSendStatus;
  acceptedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export const EMAIL_TEMPLATE_CODES: EmailTemplateCode[] = [
  "email_verification",
  "password_reset",
  "registration_success",
  "order_created",
  "payment_success",
  "external_payment_pending",
  "payment_failed",
  "order_delivered",
  "delivery_failed",
  "refund_requested",
  "refund_approved",
  "refund_rejected",
  "refund_succeeded",
  "recharge_success",
  "account_status_changed",
  "account_security_alert",
  "admin_system_alert",
];

export const DEFAULT_EMAIL_MAX_ATTEMPTS = 5;
export const EMAIL_RETRY_BASE_SECONDS = 60;
export const EMAIL_RETRY_MAX_SECONDS = 60 * 60 * 6;

export const NON_RETRYABLE_EMAIL_ERROR_CODES = new Set([
  "EMAIL_PROVIDER_NOT_CONFIGURED",
  "EMAIL_PROVIDER_NOT_IMPLEMENTED",
  "EMAIL_INVALID_RECIPIENT",
  "EMAIL_TEMPLATE_INVALID",
  "EMAIL_TEMPLATE_NOT_FOUND",
  "EMAIL_PERMISSION_DENIED",
  "EMAIL_BUSINESS_NOT_FOUND",
  "EMAIL_REJECTED_ADDRESS",
]);

export type EmailTemplateRecord = {
  id: string;
  template_code: string;
  version: number;
  name: string | null;
  subject_template: string;
  html_template: string;
  text_template: string | null;
  variables_schema: Record<string, unknown> | null;
  status: "draft" | "published" | "archived";
  is_current: boolean;
  created_at: string;
  updated_at: string | null;
  published_at: string | null;
};

export type EmailDeliveryJobRecord = {
  id: string;
  template_code: string;
  template_version: number | null;
  user_id: string | null;
  recipient_summary: string;
  recipient_hash: string;
  business_type: string | null;
  business_id: string | null;
  business_no: string | null;
  idempotency_key: string;
  status: EmailDeliveryJobStatus;
  attempts: number;
  max_attempts: number;
  next_retry_at: string | null;
  provider: string | null;
  provider_message_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string | null;
  sent_at: string | null;
};
