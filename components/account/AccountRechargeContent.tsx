"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  calculateRechargeAmounts,
  formatPaymentAmount,
} from "@/lib/payments/channels";
import type { PaymentChannel, PaymentChannelCode, PaymentCurrency, PaymentSubmitForm } from "@/lib/payments/channel-types";
import { submitPaymentForm } from "@/lib/payments/submit-payment-form.mjs";
import {
  canContinueLiuhaoyiRechargePayment,
  isRechargePastDue,
} from "@/lib/payments/recharge-expiry.mjs";
import {
  rechargeStatusLabel,
  type RechargeRecord,
} from "@/lib/payments/recharge-utils";
import {
  calculateExpectedUsdtAmount,
  compareRechargeDecimals,
  parseRequestedCnyAmount,
} from "@/lib/payments/recharge-rate.mjs";
import { cn } from "@/lib/utils";
import { openPublicSupport } from "@/lib/support/open-public-support";

type RechargeListError = {
  message: string;
  code: string;
  requestId: string;
};

type RechargeListResponse = {
  data?: RechargeRecord[];
  count?: number;
  error?: string;
  code?: string;
  requestId?: string;
};

type RechargeRate = {
  effectiveDate: string;
  marketRate: string;
  settlementRate: string;
  source: string;
  effectiveAt: string;
};

export default function AccountRechargeContent() {
  const router = useRouter();
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannel[]>([]);
  const [selectedChannelCode, setSelectedChannelCode] = useState<PaymentChannelCode | null>(null);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const clientRequestIdRef = useRef<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [records, setRecords] = useState<RechargeRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<RechargeListError | null>(null);
  const [recordPage, setRecordPage] = useState(1);
  const [recordCount, setRecordCount] = useState(0);
  const [dailyRate, setDailyRate] = useState<RechargeRate | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [amountLimitDialogOpen, setAmountLimitDialogOpen] = useState(false);
  const [historyNowTick, setHistoryNowTick] = useState(0);

  const selectedChannel =
    paymentChannels.find((channel) => channel.code === selectedChannelCode) ?? paymentChannels[0] ?? null;
  const isUsdtCnyRecharge = selectedChannel?.code === "usdt_bep20";
  const legacyChannelAmount = isUsdtCnyRecharge ? 0 : Number(amountText) || 0;
  const summary = useMemo(
    () => (selectedChannel && !isUsdtCnyRecharge ? calculateRechargeAmounts(selectedChannel, legacyChannelAmount) : null),
    [legacyChannelAmount, isUsdtCnyRecharge, selectedChannel]
  );
  const requestedCnyAmount = isUsdtCnyRecharge ? parseRequestedCnyAmount(amountText) : null;
  const expectedUsdtAmount = requestedCnyAmount && dailyRate
    ? calculateExpectedUsdtAmount(requestedCnyAmount, dailyRate.settlementRate)
    : null;
  const amountSymbol = isUsdtCnyRecharge || selectedChannel?.currency === "CNY" ? "¥" : "USDT";
  const minimumComparison = expectedUsdtAmount && selectedChannel
    ? compareRechargeDecimals(expectedUsdtAmount, String(selectedChannel.minimumAmount))
    : null;
  const reachesMin = isUsdtCnyRecharge
    ? minimumComparison !== null && minimumComparison >= 0
    : Boolean(selectedChannel && summary && summary.amount >= selectedChannel.minimumAmount);
  const hasValidAmount = isUsdtCnyRecharge
    ? Boolean(requestedCnyAmount && expectedUsdtAmount && dailyRate && reachesMin)
    : Boolean(summary && summary.amount > 0 && reachesMin);
  const maximumAmount = selectedChannel?.maximumAmount;
  const channelOverLimit = Boolean(summary && typeof maximumAmount === "number"
    && Number.isFinite(maximumAmount) && summary.payableAmount > maximumAmount);
  const canSubmit = Boolean(selectedChannel?.enabled && hasValidAmount && !isSubmitting && !channelOverLimit);

  const loadRecords = useCallback(async (page: number) => {
    setRecordsLoading(true);
    try {
      const response = await fetch(`/api/recharges?page=${page}&pageSize=10`, { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as
        | RechargeListResponse
        | null;
      if (!response.ok) {
        setRecordsError({
          message: result?.error ?? "充值记录加载失败，请稍后重试",
          code: result?.code ?? "RECHARGE_DB_QUERY_FAILED",
          requestId: result?.requestId ?? "未生成",
        });
        return;
      }
      setRecords(result?.data ?? []);
      setRecordCount(result?.count ?? 0);
      setRecordsError(null);
    } catch {
      setRecordsError({
        message: "充值记录加载失败，请稍后重试",
        code: "RECHARGE_DB_QUERY_FAILED",
        requestId: "未生成",
      });
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      setChannelsLoading(true);
      setChannelsError(null);
      try {
        const response = await fetch("/api/recharges/channels", { cache: "no-store" });
        const result = (await response.json().catch(() => null)) as
          | { channels?: PaymentChannel[]; error?: string }
          | null;
        if (!response.ok) throw new Error(result?.error ?? "支付渠道加载失败，请稍后重试");
        if (!active) return;
        const channels = result?.channels ?? [];
        setPaymentChannels(channels);
        setSelectedChannelCode(channels[0]?.code ?? null);
      } catch (error) {
        if (active) setChannelsError(getClientErrorMessage(error, "支付渠道加载失败，请稍后重试"));
      } finally {
        if (active) setChannelsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadRecords(recordPage);
  }, [loadRecords, recordPage]);

  useEffect(() => {
    const timer = window.setInterval(() => setHistoryNowTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/recharges/rate", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { rate?: RechargeRate; error?: string } | null;
        if (!response.ok || !payload?.rate) throw new Error(payload?.error ?? "今日充值汇率读取失败");
        if (active) { setDailyRate(payload.rate); setRateError(null); }
      })
      .catch((error) => { if (active) setRateError(getClientErrorMessage(error, "今日充值汇率读取失败")); });
    return () => { active = false; };
  }, []);

  const updateAmount = (value: string) => {
    setSubmitMessage(null);
    if (selectedChannel) setAmountText(normalizeAmountInput(value, isUsdtCnyRecharge ? "CNY" : selectedChannel.currency));
    clientRequestIdRef.current = null;
  };

  const selectChannel = (channelCode: PaymentChannelCode) => {
    const channel = paymentChannels.find((item) => item.code === channelCode);
    if (!channel || !channel.enabled) return;
    setSelectedChannelCode(channelCode);
    setAmountText("");
    setSubmitMessage(null);
    clientRequestIdRef.current = null;
  };

  const createRecharge = async () => {
    if (!selectedChannel || (!summary && !isUsdtCnyRecharge)) return;
    if (channelOverLimit) {
      setAmountLimitDialogOpen(true);
      return;
    }
    if (!canSubmit) return;
    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      clientRequestIdRef.current ||= createClientRequestId();
      const response = await fetch("/api/recharges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: selectedChannel.code,
          payment_method: selectedChannel.code,
          amount: isUsdtCnyRecharge ? requestedCnyAmount : amountText,
          currency: isUsdtCnyRecharge ? "CNY" : selectedChannel.currency,
          customer_note: customerNote,
          client_request_id: clientRequestIdRef.current,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string; rechargeNo?: string; paymentType?: string; paymentUrl?: string; submitForm?: PaymentSubmitForm }
        | null;

      if (!response.ok) throw new Error(result?.error ?? "充值下单失败，请稍后重试");

      if (result?.rechargeNo) {
        if (result.submitForm && submitPaymentForm(result.submitForm)) return;
        if (result.paymentType === "redirect" && result.paymentUrl) {
          window.location.assign(result.paymentUrl);
          return;
        }
        router.push(`/payment?recharge=${encodeURIComponent(result.rechargeNo)}`);
        return;
      }

      setSubmitMessage("充值单已创建，等待支付渠道返回。");
    } catch (error) {
      toast.error(getClientErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PublicLayout mobileNavigationUntilLg contentClassName="mt-12 px-4 py-6 sm:px-5 lg:mt-0 lg:px-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <Card>
            <CardContent className="flex flex-col p-4 sm:p-6">
              <div>
                <h1 className="text-2xl font-bold">账户充值</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  使用 USDT-BEP20 充值人民币账户余额，也可选择已开放的支付宝或微信支付渠道。
                </p>
              </div>

              <div className={cn("mt-5 grid gap-3", paymentChannels.length >= 2 && "sm:grid-cols-2")}>
                {channelsLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="h-[118px] animate-pulse rounded-xl border bg-slate-100" />
                  ))
                ) : null}
                {!channelsLoading && channelsError ? (
                  <div className="col-span-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {channelsError}
                  </div>
                ) : null}
                {!channelsLoading && !channelsError && paymentChannels.length === 0 ? (
                  <div className="col-span-full rounded-xl border border-dashed bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">
                    支付渠道暂未开放
                  </div>
                ) : null}
                {paymentChannels.map((channel) => {
                  const selected = selectedChannel?.code === channel.code;
                  const disabled = !channel.enabled || channel.status !== "active";

                  return (
                    <button
                      key={channel.code}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectChannel(channel.code)}
                      className={cn(
                        "rounded-xl border bg-slate-50 p-4 text-left transition-colors hover:border-primary/35 disabled:cursor-not-allowed disabled:opacity-60",
                        selected &&
                          "border-primary bg-primary/5"
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
                            {channel.networkLabel === "BSC" ? "BNB Smart Chain" : channel.networkLabel ?? channel.network ?? channel.currency}
                          </span>
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>最低充值：{formatPaymentAmount(channel.minimumAmount, channel.currency)}</span>
                        <span>
                          {channel.providerExternalFeeDisclosure
                            ? "支付平台可能另收通道手续费"
                            : channel.code === "usdt_bep20"
                              ? "手续费 0"
                              : channel.feeRate === 0 ? "0 手续费" : "以渠道配置为准"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedChannel?.manualPayment ? (
                <div className="order-4 mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-emerald-950">
                      USDT-BEP20 付款信息
                    </h3>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      链上自动识别，异常交易进入人工复核
                    </span>
                  </div>

                  <div className="mt-3 grid gap-3 text-sm">
                    <div>
                      <div className="text-xs font-medium text-emerald-800">
                        收款地址
                      </div>
                      <div className="mt-1 break-all rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-800">
                        {selectedChannel.manualPayment.payment_address}
                      </div>
                    </div>

                    {selectedChannel.manualPayment.token_contract ? (
                      <div>
                        <div className="text-xs font-medium text-emerald-800">
                          Token 合约
                        </div>
                        <div className="mt-1 break-all rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-800">
                          {selectedChannel.manualPayment.token_contract}
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <div className="text-xs font-medium text-emerald-800">网络</div>
                      <div className="mt-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-slate-800">
                        {selectedChannel.networkLabel === "BSC" ? "BNB Smart Chain (BEP20)" : selectedChannel.networkLabel ?? selectedChannel.network ?? "—"}
                      </div>
                    </div>

                    {selectedChannel.manualPayment.payment_instructions ? (
                      <div>
                        <div className="text-xs font-medium text-emerald-800">
                          付款说明
                        </div>
                        <div className="mt-1 whitespace-pre-wrap rounded-lg border border-emerald-200 bg-white px-3 py-2 leading-6 text-slate-700">
                          {selectedChannel.manualPayment.payment_instructions}
                        </div>
                      </div>
                    ) : null}

                    <p className="text-xs leading-5 text-amber-700">
                      {isUsdtCnyRecharge
                        ? "请严格按充值单最终生成的精确 USDT 金额付款。金额不一致、晚到账或其他异常交易将进入人工复核；匹配成功后按申请的人民币金额入账。"
                        : "请严格核对币种和网络，按实际支付金额足额转账。不要向其他网络或其他合约地址转账。"}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="order-3 mt-5 border-t border-border/70 pt-5">
                <label className="mb-1.5 block text-sm font-medium">
                  <span className="text-red-500">*</span>充值金额
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                    {amountSymbol}
                  </span>
                  <Input
                    value={amountText}
                    inputMode="decimal"
                    onChange={(event) => updateAmount(event.target.value)}
                    disabled={!selectedChannel}
                    placeholder={isUsdtCnyRecharge ? "请输入希望充值的人民币金额" : selectedChannel ? `请输入金额，最低 ${selectedChannel.minimumAmount} ${selectedChannel.currency}` : "请先选择支付渠道"}
                    className={cn("h-11", !isUsdtCnyRecharge && selectedChannel?.currency === "USDT" ? "pl-20" : "pl-16", isUsdtCnyRecharge && "pr-16")}
                  />
                  {isUsdtCnyRecharge ? (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">CNY</span>
                  ) : null}
                </div>
                {(isUsdtCnyRecharge ? requestedCnyAmount !== null : legacyChannelAmount > 0) && !reachesMin ? (
                  <p className="mt-2 text-xs text-red-500">
                    当前方式最低充值金额为 {selectedChannel ? formatPaymentAmount(selectedChannel.minimumAmount, selectedChannel.currency) : "—"}。
                  </p>
                ) : null}
                {channelOverLimit ? (
                  <button
                    type="button"
                    className="mt-2 text-left text-xs text-red-600 underline-offset-2 hover:underline"
                    onClick={() => setAmountLimitDialogOpen(true)}
                  >
                    当前方式单笔最高支持 {selectedChannel && typeof maximumAmount === "number" ? formatPaymentAmount(maximumAmount, selectedChannel.currency) : "—"}，点击查看其他方式。
                  </button>
                ) : null}

                {isUsdtCnyRecharge ? (
                  <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
                    {dailyRate ? (
                      <>
                        <p className="font-semibold text-sky-900">今日结算汇率</p>
                        <p className="mt-1 text-sky-800">1 USDT = {dailyRate.settlementRate} CNY</p>
                        <p className="mt-1 text-xs text-sky-700">汇率日期：{dailyRate.effectiveDate}。创建充值单后汇率即锁定。</p>
                      </>
                    ) : <p className="text-red-600">{rateError ?? "今日充值汇率尚未设置"}</p>}
                  </div>
                ) : null}

                {selectedChannel?.providerExternalFeeDisclosure ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                    {selectedChannel.providerExternalFeeDisclosure}
                  </div>
                ) : null}

                {submitMessage ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {submitMessage}
                  </div>
                ) : null}

                <label className="mt-3 block text-sm font-medium">充值备注（可选）</label>
                <Input value={customerNote} maxLength={500} onChange={(event) => { setCustomerNote(event.target.value); clientRequestIdRef.current = null; }} placeholder="填写必要的付款说明，最多 500 字" className="mt-1.5 h-10" />

                <div className="mt-3 flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2 sm:gap-x-8">
                    <div>充值人民币金额：{isUsdtCnyRecharge && requestedCnyAmount ? `¥${requestedCnyAmount}` : selectedChannel && summary ? formatPaymentAmount(summary.amount, selectedChannel.currency) : "—"}</div>
                    <div>本站手续费：{isUsdtCnyRecharge ? "0" : selectedChannel && summary ? (summary.fee === 0 ? "0" : formatPaymentAmount(summary.fee, selectedChannel.currency)) : "—"}</div>
                    <div className="font-medium text-slate-700">
                      预计应付：{isUsdtCnyRecharge ? (expectedUsdtAmount ? `${expectedUsdtAmount} USDT` : "—") : selectedChannel && summary ? formatPaymentAmount(summary.payableAmount, selectedChannel.currency) : "—"}
                    </div>
                    <div className="font-medium text-slate-700">
                      {isUsdtCnyRecharge ? "创建充值单后会生成 4 位小数的精确应付 USDT；匹配成功后按你申请的人民币金额原额到账。" : `预计到账金额：${selectedChannel && summary ? formatPaymentAmount(summary.arrivalAmount, selectedChannel.currency) : "—"}`}
                    </div>
                  </div>
                  <Button
                    className="h-11 w-full rounded-lg sm:w-auto sm:min-w-40"
                    disabled={!canSubmit}
                    onClick={createRecharge}
                  >
                    {isSubmitting ? "提交中..." : "创建充值"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <h2 className="text-lg font-semibold">资金充值记录</h2>
            <RechargeRecords
              records={records}
              loading={recordsLoading}
              error={recordsError}
              page={recordPage}
              count={recordCount}
              nowTick={historyNowTick}
              onRetry={() => void loadRecords(recordPage)}
              onPageChange={setRecordPage}
              onProofSubmitted={() => void loadRecords(recordPage)}
            />
          </CardContent>
        </Card>
      </div>
      <Dialog open={amountLimitDialogOpen} onOpenChange={setAmountLimitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>单笔支付金额超限</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            当前方式单笔最高支持 {selectedChannel && typeof maximumAmount === "number" ? formatPaymentAmount(maximumAmount, selectedChannel.currency) : "—"}。金额较大时建议分次充值后使用余额支付，如需协助请联系客服。
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setAmountLimitDialogOpen(false)}>取消</Button>
            <Button variant="outline" onClick={() => { setAmountLimitDialogOpen(false); openPublicSupport(); }}>联系客服</Button>
            <Button onClick={() => { if (typeof maximumAmount === "number") setAmountText(String(maximumAmount)); clientRequestIdRef.current = null; setAmountLimitDialogOpen(false); }}>改为上限金额</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
}

function createClientRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function RecordLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}：</dt>
      <dd className="text-right text-slate-400">{value}</dd>
    </div>
  );
}

function RechargeRecords({ records, loading, error, page, count, nowTick, onRetry, onPageChange, onProofSubmitted }: { records: RechargeRecord[]; loading: boolean; error: RechargeListError | null; page: number; count: number; nowTick: number; onRetry: () => void; onPageChange: (page: number) => void; onProofSubmitted: () => void }) {
  const totalPages = Math.max(1, Math.ceil(count / 10));
  if (error) return (
    <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
      <p>{error.message}</p>
      <p className="mt-2 text-xs">诊断码：{error.code}</p>
      <p className="mt-1 text-xs">诊断编号：{error.requestId}</p>
      <Button variant="outline" size="sm" className="mt-3" disabled={loading} onClick={onRetry}>
        {loading ? "正在重新加载…" : "重新加载"}
      </Button>
    </div>
  );
  if (loading) return <div className="mt-6 h-44 animate-pulse rounded-xl bg-slate-100" />;
  if (records.length === 0) return (
    <div className="mt-6 flex flex-1 items-center justify-center rounded-xl bg-slate-50 p-6 text-center text-sm text-muted-foreground">
      暂无充值记录
    </div>
  );
  return (
    <div className="mt-5 flex min-h-0 flex-1 flex-col">
      <div className="space-y-3">
        {records.map((record) => {
          const now = new Date(Date.now() + nowTick * 0);
          const expired = record.status === "expired" || isRechargePastDue(record.expiresAt, now);
          const isExternalCny = record.channelCode === "alipay" || record.channelCode === "wechat";
          const canContinue = isExternalCny
            ? canContinueLiuhaoyiRechargePayment(record as unknown as Record<string, unknown>, now)
            : Boolean(record.expectedUsdtAmount && ["pending", "waiting_payment"].includes(String(record.status)) && !expired);
          const status = expired ? "expired" : record.status;
          const remainingSeconds = secondsUntil(record.expiresAt, now);
          return <div key={record.rechargeNo} className="rounded-xl bg-slate-50 p-4 text-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="truncate font-semibold text-slate-800" title={record.rechargeNo}>{record.rechargeNo}</span>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">{rechargeStatusLabel(status)}</span>
            </div>
            <dl className="grid gap-2 text-muted-foreground">
              <RecordLine label="支付渠道" value={record.channelName} />
              {record.network ? <RecordLine label="网络" value={record.network} /> : null}
              <RecordLine label="充值金额" value={record.requestedCnyAmount ? `¥${record.requestedCnyAmount}` : formatPaymentAmount(record.requestedAmount, record.currency)} />
              {record.lockedSettlementRate ? <RecordLine label="锁定汇率" value={`1 USDT = ¥${record.lockedSettlementRate}`} /> : null}
              {record.expectedUsdtAmount ? <RecordLine label="精确应付" value={`${record.expectedUsdtAmount} USDT`} /> : null}
              <CopyableRecordLine label="订单编号" value={record.rechargeNo} />
              {record.expiresAt ? <RecordLine label="支付有效期至" value={formatDateTime(record.expiresAt)} /> : null}
              {canContinue ? <RecordLine label="待支付剩余时间" value={formatCountdown(remainingSeconds)} /> : null}
              {record.paymentAddress ? <RecordLine label="收款地址" value={record.paymentAddress} /> : null}
              {record.paymentTokenContract ? <RecordLine label="Token 合约" value={record.paymentTokenContract} /> : null}
              {record.actualReceivedUsdt ? <RecordLine label="实际到账" value={`${record.actualReceivedUsdt} USDT`} /> : null}
              <RecordLine label="本站手续费" value={record.feeAmount === 0 ? "0" : formatPaymentAmount(record.feeAmount, record.currency)} />
              {record.providerExternalFeeDisclosure ? <RecordLine label="支付通道手续费" value={record.providerExternalFeeDisclosure} /> : null}
              {!record.expectedUsdtAmount ? <RecordLine label="应付金额" value={formatPaymentAmount(record.payableAmount, record.currency)} /> : null}
              <RecordLine label="到账金额" value={record.creditedCnyAmount ? `¥${record.creditedCnyAmount}` : formatPaymentAmount(record.creditedAmount, record.currency)} />
              <RecordLine label="创建时间" value={formatDateTime(record.createdAt)} />
              {record.completedAt ? <RecordLine label="到账时间" value={formatDateTime(record.completedAt)} /> : null}
              {record.reviewReason && ["failed", "rejected", "cancelled"].includes(String(record.status)) ? <RecordLine label="处理说明" value={record.reviewReason} /> : null}
            </dl>
            {canContinue ? <Button asChild size="sm" className="mt-3"><Link href={`/payment?recharge=${encodeURIComponent(record.rechargeNo)}`}>继续支付</Link></Button> : null}
            {expired ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              <p>充值订单已过期。如您已完成转账，请联系人工客服并提供充值订单编号。</p>
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={openPublicSupport}>联系客服</Button>
            </div> : null}
            {!expired && ["waiting_payment", "submitted", "rejected"].includes(String(record.status)) ? (record.expectedUsdtAmount ? <RechargeBep20VerifyForm record={record} onSubmitted={onProofSubmitted} /> : <RechargeProofForm record={record} onSubmitted={onProofSubmitted} />) : null}
          </div>;
        })}
      </div>
      {count > 10 ? (
        <div className="mt-3 flex shrink-0 items-center justify-between text-xs text-muted-foreground">
          <span>共 {count} 条</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</Button>
            <span>{page} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>下一页</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RechargeBep20VerifyForm({ record, onSubmitted }: { record: RechargeRecord; onSubmitted: () => void }) {
  const [txHash, setTxHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function verify() {
    if (submitting || !/^0x[0-9a-fA-F]{64}$/.test(txHash.trim())) {
      setError("请输入合法的 0x 开头 32 字节交易哈希。");
      return;
    }
    setSubmitting(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/recharges/${encodeURIComponent(record.rechargeNo)}/bep20/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: txHash.trim() }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; actualReceivedUsdt?: string; creditedCnyAmount?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "链上交易核验失败");
      setMessage(`已核验实际到账 ${payload?.actualReceivedUsdt ?? "—"} USDT，预计入账 ¥${payload?.creditedCnyAmount ?? "—"}。等待管理员审核。`);
      onSubmitted();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "链上交易核验失败");
    } finally { setSubmitting(false); }
  }
  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <p className="text-xs font-medium text-amber-700">请精确支付 {record.expectedUsdtAmount} USDT，此 4 位小数金额用于识别你的充值单，请勿自行修改。金额不一致或超时付款将转人工处理。</p>
      <Input value={txHash} onChange={(event) => setTxHash(event.target.value)} placeholder="输入 BEP20 TxHash" maxLength={66} />
      {message ? <p className="text-xs text-emerald-600">{message}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <Button size="sm" disabled={submitting} onClick={() => void verify()}>{submitting ? "核验中..." : "提交 TxHash 并核验"}</Button>
    </div>
  );
}

function RechargeProofForm({ record, onSubmitted }: { record: RechargeRecord; onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [reference, setReference] = useState("");
  const [payer, setPayer] = useState("");
  const [paymentTime, setPaymentTime] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("paymentAmount", String(record.payableAmount));
      form.set("transactionReference", reference);
      form.set("payerAccountSummary", payer);
      form.set("paymentTime", paymentTime);
      form.set("userNote", note);
      files.forEach((file) => form.append("files", file));
      const response = await fetch(`/api/recharges/${encodeURIComponent(record.rechargeNo)}/proof`, { method: "POST", body: form });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "凭证提交失败，请稍后重试。");
      setOpen(false); setFiles([]); setReference(""); setPayer(""); setPaymentTime(""); setNote(""); onSubmitted();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "凭证提交失败，请稍后重试。"); }
    finally { setSubmitting(false); }
  }
  return <div className="mt-3 border-t pt-3">{!open ? <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{record.status === "submitted" ? "补充支付凭证" : "提交支付凭证"}</Button> : <div className="space-y-2 rounded-lg border bg-white p-3"><div className="text-xs text-slate-500">付款金额：{formatPaymentAmount(record.payableAmount, record.currency)}</div><Input value={reference} maxLength={160} onChange={(e) => setReference(e.target.value)} placeholder="交易流水号" /><Input value={payer} maxLength={120} onChange={(e) => setPayer(e.target.value)} placeholder="付款账号摘要（请勿填写完整敏感信息）" /><Input type="datetime-local" value={paymentTime} onChange={(e) => setPaymentTime(e.target.value)} /><Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="用户备注（可选）" /><Input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} /><p className="text-xs text-slate-500">支持 JPG、PNG、WEBP、PDF，单个最大 5MB，最多 3 个。</p><div className="flex gap-2"><Button size="sm" disabled={submitting} onClick={() => void submit()}>{submitting ? "提交中..." : "提交审核"}</Button><Button size="sm" variant="outline" disabled={submitting} onClick={() => setOpen(false)}>取消</Button></div></div>}</div>;
}

function CopyableRecordLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}：</dt>
      <dd className="flex min-w-0 items-center gap-2 text-right text-slate-400">
        <span className="truncate" title={value}>{value}</span>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => void copyRechargeNo(value)}>复制</Button>
      </dd>
    </div>
  );
}

async function copyRechargeNo(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("充值订单编号已复制");
  } catch {
    toast.error("复制失败，请手动复制订单编号");
  }
}

function secondsUntil(expiresAt: string | null, now: Date) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.floor((Date.parse(expiresAt) - now.getTime()) / 1000));
}

function formatCountdown(totalSeconds: number) {
  return `${Math.floor(totalSeconds / 60)} 分 ${totalSeconds % 60} 秒`;
}

function normalizeAmountInput(value: string, currency: PaymentCurrency) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [integerPart, ...decimalParts] = cleaned.split(".");
  const decimalLimit = currency === "USDT" ? 6 : 2;
  const decimal = decimalParts.join("").slice(0, decimalLimit);
  if (cleaned.includes(".")) return `${integerPart || "0"}.${decimal}`;
  return integerPart.replace(/^0+(?=\d)/, "");
}

function getClientErrorMessage(error: unknown, fallback = "充值下单失败，请稍后重试") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage) return maybeMessage;
  }
  return fallback;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}
