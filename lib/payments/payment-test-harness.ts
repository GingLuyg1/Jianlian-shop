import "server-only";

import { calculateRechargeAmounts } from "@/lib/payments/channels";
import { getPaymentProvider } from "@/lib/payments/providers";
import type { PaymentChannel, PaymentProviderCode } from "@/lib/payments/channel-types";
import { normalizeProviderStatus } from "@/lib/payments/reconciliation-service";

export type PaymentHarnessCheckStatus = "pass" | "fail" | "blocked" | "manual";

export type PaymentHarnessCheck = {
  id: string;
  area: "migration" | "recharge" | "callback" | "balance" | "order" | "permission" | "page";
  status: PaymentHarnessCheckStatus;
  summary: string;
  evidence: string;
};

export type PaymentHarnessReport = {
  environment: "development" | "test";
  generatedAt: string;
  checks: PaymentHarnessCheck[];
  readiness: "ready" | "partial" | "blocked";
};

const NON_PRODUCTION_ENVS = new Set(["development", "test"]);

export function assertPaymentHarnessAvailable() {
  const env = process.env.NODE_ENV ?? "development";
  if (!NON_PRODUCTION_ENVS.has(env)) {
    throw new Error("Payment test harness is disabled outside development and test environments.");
  }
}

export function verifyRechargeAmountCalculation(channel: Pick<PaymentChannel, "currency" | "feeRate" | "minimumAmount">, rawAmount: number) {
  assertPaymentHarnessAvailable();
  const summary = calculateRechargeAmounts(channel, rawAmount);
  return {
    amount: summary.amount,
    fee: summary.fee,
    payableAmount: summary.payableAmount,
    belowMinimum: summary.amount < channel.minimumAmount,
  };
}

export async function verifyProviderDoesNotSimulateSuccess(provider: PaymentProviderCode) {
  assertPaymentHarnessAvailable();
  const instance = getPaymentProvider(provider);
  const createPayment = await instance
    .createPayment({
      rechargeNo: "HARNESS-DO-NOT-PERSIST",
      channel: {
        channel_code: "alipay",
        code: "alipay",
        display_name: "支付宝",
        name: "支付宝",
        currency: "CNY",
        minimum_amount: 10,
        minimumAmount: 10,
        fee_rate: 0,
        feeRate: 0,
        status: "active",
        enabled: true,
        configured: false,
        provider,
        sort_order: 10,
      },
      userId: "00000000-0000-0000-0000-000000000000",
      amount: 10,
      fee: 0,
      payableAmount: 10,
    })
    .then(() => "unexpected-success" as const)
    .catch(() => "blocked" as const);

  const verifyCallback = await instance.verifyCallback({}, "invalid-signature");
  return {
    createPayment,
    verifyCallback,
    pass: createPayment === "blocked" && verifyCallback === false,
  };
}

export function verifyProviderStatusMapping() {
  assertPaymentHarnessAvailable();
  return {
    paid: normalizeProviderStatus("success"),
    pending: normalizeProviderStatus("waiting"),
    failed: normalizeProviderStatus("error"),
    notFound: normalizeProviderStatus("not_found"),
  };
}

export function summarizePaymentReadiness(checks: PaymentHarnessCheck[]): PaymentHarnessReport["readiness"] {
  if (checks.some((check) => check.status === "fail" || check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "manual")) return "partial";
  return "ready";
}

export function createPaymentHarnessReport(checks: PaymentHarnessCheck[]): PaymentHarnessReport {
  assertPaymentHarnessAvailable();
  return {
    environment: (process.env.NODE_ENV === "test" ? "test" : "development"),
    generatedAt: new Date().toISOString(),
    checks,
    readiness: summarizePaymentReadiness(checks),
  };
}
