import type { PaymentSubmitForm } from "../channel-types";

export function buildLiuhaoyiSubmitForm(input: {
  apiBaseUrl: URL;
  merchantId: string;
  merchantKey: string;
  channelCode: string;
  sessionNo: string;
  notifyUrl: string;
  returnUrl: string;
  subject: string;
  money: string;
}): PaymentSubmitForm;
export function normalizeLiuhaoyiSubmitForm(value: unknown): PaymentSubmitForm | null;
