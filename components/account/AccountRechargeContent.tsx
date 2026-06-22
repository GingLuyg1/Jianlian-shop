"use client";

import { useMemo, useState } from "react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  calculateRechargeAmounts,
  formatFeeRate,
  formatPaymentAmount,
  getPublicPaymentChannels,
} from "@/lib/payments/channels";
import type { PaymentChannelCode, PaymentCurrency } from "@/lib/payments/channel-types";
import { cn } from "@/lib/utils";

type RecordTab = "recharge" | "funds";

const paymentChannels = getPublicPaymentChannels();

export default function AccountRechargeContent() {
  const [selectedChannelCode, setSelectedChannelCode] =
    useState<PaymentChannelCode>("alipay");
  const [amountText, setAmountText] = useState("");
  const [activeRecordTab, setActiveRecordTab] = useState<RecordTab>("recharge");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedChannel =
    paymentChannels.find((channel) => channel.code === selectedChannelCode) ??
    paymentChannels[0];
  const amount = Number(amountText) || 0;
  const summary = useMemo(
    () => calculateRechargeAmounts(selectedChannel, amount),
    [amount, selectedChannel]
  );
  const amountSymbol = selectedChannel.currency === "USDT" ? "USDT" : "¥";
  const reachesMin = summary.amount >= selectedChannel.minimumAmount;
  const hasValidAmount = summary.amount > 0 && reachesMin;
  const canSubmit = selectedChannel.enabled && hasValidAmount && !isSubmitting;

  const updateAmount = (value: string) => {
    setSubmitError(null);
    setSubmitMessage(null);
    setAmountText(normalizeAmountInput(value, selectedChannel.currency));
  };

  const selectChannel = (channelCode: PaymentChannelCode) => {
    const channel = paymentChannels.find((item) => item.code === channelCode);
    if (!channel || !channel.enabled) return;
    setSelectedChannelCode(channelCode);
    setAmountText("");
    setSubmitError(null);
    setSubmitMessage(null);
  };

  const createRecharge = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitMessage(null);

    try {
      const response = await fetch("/api/recharge/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: selectedChannel.code,
          amount: summary.amount,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string; rechargeNo?: string }
        | null;

      if (!response.ok) {
        throw new Error(result?.error ?? "充值下单失败，请稍后重试");
      }

      setSubmitMessage(
        result?.rechargeNo
          ? `充值单 ${result.rechargeNo} 已创建，等待支付渠道返回。`
          : "充值单已创建，等待支付渠道返回。"
      );
    } catch (error) {
      setSubmitError(getClientErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PublicLayout contentClassName="max-w-none overflow-hidden px-4 py-3 md:px-6">
      <div className="mx-auto grid h-[calc(100dvh-87px)] max-w-[1500px] grid-cols-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
          <Card className="shrink-0">
            <CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
              <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
                <h2 className="text-lg font-bold">付款说明</h2>
                <ol className="mt-2 grid gap-1.5 text-sm leading-6 text-muted-foreground">
                  <li>1. 请足额支付，否则可能无法自动到账。</li>
                  <li>2. 支付渠道未配置前不会生成付款二维码或钱包地址。</li>
                  <li>3. 支付成功只能由服务端回调确认，未确认前保持待支付。</li>
                  <li className="font-semibold text-primary">
                    4. 未到账、失败或金额异常时，请联系左下角在线客服。
                  </li>
                </ol>
              </div>
              <div className="rounded-xl border border-border bg-slate-50 p-4">
                <h3 className="font-semibold">支持方式</h3>
                <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                  <p>人民币渠道支持支付宝、微信支付，金额以 CNY 计算。</p>
                  <p>USDT 渠道支持币安转账、TRC20、BEP20，网络严格区分。</p>
                  <p>充值成功后余额可用于站内商品下单。</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 overflow-hidden">
            <CardContent className="flex h-full min-h-0 flex-col p-4">
              <div className="shrink-0">
                <h2 className="text-xl font-bold">账号充值</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  选择充值方式并填写金额，最终到账状态以服务端回调确认为准。
                </p>
              </div>

              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {paymentChannels.map((channel) => {
                  const selected = selectedChannel.code === channel.code;
                  const disabled = !channel.enabled || channel.status !== "active";

                  return (
                    <button
                      key={channel.code}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectChannel(channel.code)}
                      className={cn(
                        "rounded-xl border bg-slate-50 p-2.5 text-left transition-all duration-150 hover:scale-[1.01] hover:border-primary/35 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none",
                        selected &&
                          "scale-[1.01] border-primary bg-primary/5 shadow-sm"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm ring-1 ring-border">
                          {channel.iconSrc ? (
                            <img
                              src={channel.iconSrc}
                              alt={channel.name}
                              className="h-full w-full rounded-lg object-cover"
                            />
                          ) : (
                            <span className="text-sm font-bold text-primary">JL</span>
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {channel.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {disabled ? "暂未开放" : "待支付确认"}
                          </span>
                        </span>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                        <p>
                          最低充值：{formatPaymentAmount(channel.minimumAmount, channel.currency)}
                        </p>
                        <p>手续费：{formatFeeRate(channel.feeRate)}</p>
                        <p>币种：{channel.currency}</p>
                        {channel.network ? (
                          <p>
                            网络：{channel.networkLabel} / {channel.network}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-auto border-t border-border/70 pt-5">
                <label className="mb-1.5 block text-sm font-medium">
                  <span className="text-red-500">*</span>金额
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                    {amountSymbol}
                  </span>
                  <Input
                    value={amountText}
                    inputMode="decimal"
                    onChange={(event) => updateAmount(event.target.value)}
                    placeholder={`请输入金额，最低 ${selectedChannel.minimumAmount} ${selectedChannel.currency}`}
                    className={cn("h-11", selectedChannel.currency === "USDT" ? "pl-20" : "pl-16")}
                  />
                </div>
                {amount > 0 && !reachesMin ? (
                  <p className="mt-2 text-xs text-red-500">
                    当前方式最低充值金额为 {formatPaymentAmount(selectedChannel.minimumAmount, selectedChannel.currency)}。
                  </p>
                ) : null}

                {submitError ? (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                    {submitError}
                  </div>
                ) : null}
                {submitMessage ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {submitMessage}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2 sm:gap-x-8">
                    <div>充值金额：{formatPaymentAmount(summary.amount, selectedChannel.currency)}</div>
                    <div>手续费：{summary.fee === 0 ? "免手续费" : formatPaymentAmount(summary.fee, selectedChannel.currency)}</div>
                    <div className="font-medium text-slate-700">
                      实际支付金额：{formatPaymentAmount(summary.payableAmount, selectedChannel.currency)}
                    </div>
                    <div className="font-medium text-slate-700">
                      预计到账金额：{formatPaymentAmount(summary.arrivalAmount, selectedChannel.currency)}
                    </div>
                  </div>
                  <Button
                    className="h-11 min-w-40 rounded-lg"
                    disabled={!canSubmit}
                    onClick={createRecharge}
                  >
                    {isSubmitting ? "提交中..." : "支付"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="h-full min-h-0">
          <CardContent className="flex h-full min-h-0 flex-col p-5">
            <div className="flex shrink-0 gap-3">
              <Button
                className="h-11 flex-1 rounded-full px-5"
                variant={activeRecordTab === "recharge" ? "default" : "secondary"}
                onClick={() => setActiveRecordTab("recharge")}
              >
                充值记录
              </Button>
              <Button
                variant={activeRecordTab === "funds" ? "default" : "secondary"}
                className="h-11 flex-1 rounded-full px-5"
                onClick={() => setActiveRecordTab("funds")}
              >
                资金变动记录
              </Button>
            </div>

            {activeRecordTab === "recharge" ? (
              <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold text-primary">暂无充值记录</span>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">待接入</span>
                </div>
                <p>提交充值单后，充值单号、支付渠道、网络、到账状态和金额会显示在这里。</p>
                <dl className="mt-4 grid gap-2">
                  <RecordLine label="充值单号" value="等待支付数据" />
                  <RecordLine label="支付渠道" value="等待支付数据" />
                  <RecordLine label="网络" value="TRC20 / BEP20 渠道显示" />
                  <RecordLine label="充值金额" value="等待支付数据" />
                  <RecordLine label="手续费" value="等待支付数据" />
                  <RecordLine label="应付金额" value="等待支付数据" />
                  <RecordLine label="到账金额" value="等待支付数据" />
                  <RecordLine label="状态" value="pending / processing / paid / failed / expired / closed" />
                </dl>
              </div>
            ) : (
              <div className="mt-6 flex flex-1 items-center justify-center rounded-xl bg-slate-50 p-6 text-center text-sm text-muted-foreground">
                资金变动记录会在余额系统接入后显示。
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}

function RecordLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}：</dt>
      <dd className="text-right text-slate-400">{value}</dd>
    </div>
  );
}

function normalizeAmountInput(value: string, currency: PaymentCurrency) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [integerPart, ...decimalParts] = cleaned.split(".");
  const decimalLimit = currency === "USDT" ? 6 : 2;
  const decimal = decimalParts.join("").slice(0, decimalLimit);
  if (cleaned.includes(".")) return `${integerPart || "0"}.${decimal}`;
  return integerPart.replace(/^0+(?=\d)/, "");
}

function getClientErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage) return maybeMessage;
  }
  return "充值下单失败，请稍后重试";
}
